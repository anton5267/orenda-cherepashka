param(
  [string]$AppName = "orenda-cherepashka-webbs",
  [string]$Region = "fra",
  [string]$VolumeName = "app_data",
  [string]$Org = "",
  [string]$AdminPassword = "",
  [switch]$CopyLocalDatabase,
  [switch]$SkipPreflight,
  [switch]$SkipPostDeployQa,
  [switch]$UseDevAdminPassword
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Invoke-Fly {
  param([string[]]$FlyArgs)
  & flyctl @FlyArgs
  if ($LASTEXITCODE -ne 0) {
    throw "flyctl command failed: flyctl $($FlyArgs -join ' ')"
  }
}

function Invoke-NpmScript {
  param([string[]]$Args)
  & npm.cmd @Args
  if ($LASTEXITCODE -ne 0) {
    throw "npm command failed: npm $($Args -join ' ')"
  }
}

function Get-ExistingApp {
  param([string]$Name)
  $output = & flyctl status -a $Name 2>$null
  return $LASTEXITCODE -eq 0
}

function Wait-ForHealth {
  param(
    [string]$Url,
    [int]$TimeoutSeconds = 120
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 10
      if ($response.StatusCode -eq 200) {
        return
      }
    } catch {
      Start-Sleep -Seconds 2
      continue
    }

    Start-Sleep -Seconds 2
  }

  throw "Timed out waiting for health check: $Url"
}

function New-RandomSecret {
  param([int]$Length = 24)

  $alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@$%*_-+="
  $chars = 1..$Length | ForEach-Object {
    $alphabet[(Get-Random -Minimum 0 -Maximum $alphabet.Length)]
  }

  -join $chars
}

try {
  & flyctl auth whoami | Out-Null
} catch {
  throw "Fly.io is not authenticated. Run 'flyctl auth login' first, then rerun .\deploy-fly.ps1."
}

if (-not $SkipPreflight) {
  Write-Host "Running preflight verification (typecheck, build, local self-QA)..."
  Invoke-NpmScript -Args @("run", "ci:verify")
}

if ([string]::IsNullOrWhiteSpace($AdminPassword)) {
  if ($env:FLY_ADMIN_PASSWORD) {
    $AdminPassword = $env:FLY_ADMIN_PASSWORD
  } elseif ($UseDevAdminPassword) {
    $AdminPassword = "admin1234"
    Write-Warning "Using explicit dev admin password 'admin1234' because -UseDevAdminPassword was provided."
  } else {
    $AdminPassword = New-RandomSecret -Length 24
    Write-Warning "No admin password was provided. Generated a one-time random admin password for this deploy."
  }
}

$SessionSecret = if ($env:FLY_SESSION_SECRET) {
  $env:FLY_SESSION_SECRET
} else {
  [Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
}

$AdminPasswordHash = node --input-type=module -e "import { hashSync } from 'bcryptjs'; console.log(hashSync(process.argv[1], 10));" $AdminPassword
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($AdminPasswordHash)) {
  throw "Failed to generate ADMIN_PASSWORD_HASH."
}

$flyToml = @"
app = "$AppName"
primary_region = "$Region"

[build]
  dockerfile = "Dockerfile"

[env]
  NODE_ENV = "production"
  HOST = "0.0.0.0"
  PORT = "4174"
  DATABASE_PATH = "/data/site.db"
  SECURE_COOKIES = "true"

[http_service]
  internal_port = 4174
  force_https = true
  auto_stop_machines = "off"
  auto_start_machines = true
  min_machines_running = 1
  processes = ["app"]

  [[http_service.checks]]
    grace_period = "20s"
    interval = "30s"
    method = "GET"
    path = "/api/health"
    timeout = "5s"

[[mounts]]
  source = "$VolumeName"
  destination = "/data"

[vm]
  cpu_kind = "shared"
  cpus = 1
  memory = "512mb"
"@

Set-Content -LiteralPath (Join-Path $PSScriptRoot "fly.toml") -Value $flyToml -NoNewline

if (-not (Get-ExistingApp -Name $AppName)) {
  $createArgs = @("apps", "create", $AppName, "--yes")
  if (-not [string]::IsNullOrWhiteSpace($Org)) {
    $createArgs += @("--org", $Org)
  }
  Invoke-Fly -FlyArgs $createArgs
}

$volumeExists = (& flyctl volumes list -a $AppName 2>$null | Select-String -SimpleMatch $VolumeName) -ne $null
if (-not $volumeExists) {
  Invoke-Fly -FlyArgs @("volumes", "create", $VolumeName, "-a", $AppName, "-r", $Region, "-s", "1", "--yes")
}

Invoke-Fly -FlyArgs @("secrets", "set", "-a", $AppName, "SESSION_SECRET=$SessionSecret", "ADMIN_PASSWORD_HASH=$AdminPasswordHash")

Invoke-Fly -FlyArgs @("deploy", "-a", $AppName, "--remote-only", "--config", "fly.toml", "--ha=false", "--yes")

if ($CopyLocalDatabase -and (Test-Path (Join-Path $PSScriptRoot "data\site.db"))) {
  $machineId = (& flyctl machine list -a $AppName --json | ConvertFrom-Json | Select-Object -First 1 -ExpandProperty id)
  if ($machineId) {
    Invoke-Fly -FlyArgs @("ssh", "sftp", "shell", "-a", $AppName, "-s", $machineId, "-C", "put data/site.db /data/site.db")
    Invoke-Fly -FlyArgs @("machines", "restart", $machineId, "-a", $AppName)
  }
}

$hostname = "$AppName.fly.dev"
$healthUrl = "https://$hostname/api/health"

Write-Host "Waiting for production health check..."
Wait-ForHealth -Url $healthUrl

if (-not $SkipPostDeployQa) {
  Write-Host "Running production self-QA..."
  $previousSelfQaUrl = $env:SELF_QA_URL
  $env:SELF_QA_URL = "https://$hostname"

  try {
    Invoke-NpmScript -Args @("run", "self-qa")
  } finally {
    if ($null -eq $previousSelfQaUrl) {
      Remove-Item Env:SELF_QA_URL -ErrorAction SilentlyContinue
    } else {
      $env:SELF_QA_URL = $previousSelfQaUrl
    }
  }
}

Invoke-Fly -FlyArgs @("status", "-a", $AppName)

Write-Host ""
Write-Host "Fly deploy complete."
Write-Host "App: $AppName"
Write-Host "URL: https://$hostname"
Write-Host "Admin password: $AdminPassword"
