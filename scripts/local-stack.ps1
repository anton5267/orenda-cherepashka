function Get-LocalStackConfig {
  param([string]$Root)

  $stateDir = Join-Path $Root ".local"

  [pscustomobject]@{
    Root = $Root
    Ports = @(4173, 4174)
    FrontendUrl = "http://127.0.0.1:4173"
    ApiUrl = "http://127.0.0.1:4174"
    ApiHealthUrl = "http://127.0.0.1:4174/api/health"
    StateDir = $stateDir
    StateFile = Join-Path $stateDir "local-stack.json"
    StdoutLog = Join-Path $stateDir "local-stack.stdout.log"
    StderrLog = Join-Path $stateDir "local-stack.stderr.log"
  }
}

function Convert-LocalStackListener {
  param($Listener)

  [pscustomobject]@{
    pid = $Listener.Pid
    ports = @($Listener.Ports)
    scope = if ($Listener.IsWorkspaceProcess) { "workspace" } else { "external" }
    name = $Listener.Name
    commandLine = $Listener.CommandLine
  }
}

function Write-LocalStackResult {
  param(
    $Result,
    [switch]$AsJson
  )

  if ($AsJson) {
    [Console]::Out.WriteLine(($Result | ConvertTo-Json -Depth 8))
    return
  }

  foreach ($line in @($Result.lines)) {
    [Console]::Out.WriteLine([string]$line)
  }
}

function Get-LocalStackProcessInfo {
  param([int]$ProcessId)

  try {
    Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction Stop |
      Select-Object ProcessId, Name, CommandLine, ExecutablePath
  } catch {
    $null
  }
}

function Test-LocalStackWorkspaceProcess {
  param(
    $ProcessInfo,
    [string]$Root
  )

  if (-not $ProcessInfo) {
    return $false
  }

  $commandLine = [string]$ProcessInfo.CommandLine
  $executablePath = [string]$ProcessInfo.ExecutablePath

  return (
    $commandLine.IndexOf($Root, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 -or
    $executablePath.IndexOf($Root, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
  )
}

function Test-LocalStackManagedProcess {
  param(
    $ProcessInfo,
    [string]$Root
  )

  if (-not (Test-LocalStackWorkspaceProcess -ProcessInfo $ProcessInfo -Root $Root)) {
    return $false
  }

  $commandLine = [string]$ProcessInfo.CommandLine
  $markers = @(
    "concurrently\dist\bin\concurrently.js",
    'concurrently "npm:dev:server" "npm:dev:client"',
    "vite\bin\vite.js",
    "tsx\dist\loader.mjs server/index.ts",
    "local-dev-launcher.cmd",
    "npm.cmd run dev"
  )

  foreach ($marker in $markers) {
    if ($commandLine.IndexOf($marker, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
      return $true
    }
  }

  return $false
}

function Get-LocalStackListeners {
  param(
    [int[]]$Ports,
    [string]$Root
  )

  $connections = foreach ($port in $Ports) {
    Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue |
      Where-Object { $_.State -eq "Listen" }
  }

  if (-not $connections) {
    return @()
  }

  foreach ($group in ($connections | Group-Object OwningProcess)) {
    $pidValue = [int]$group.Name
    $processInfo = Get-LocalStackProcessInfo -ProcessId $pidValue

    [pscustomobject]@{
      Pid = $pidValue
      Ports = @($group.Group | Select-Object -ExpandProperty LocalPort -Unique | Sort-Object)
      ProcessInfo = $processInfo
      IsWorkspaceProcess = Test-LocalStackWorkspaceProcess -ProcessInfo $processInfo -Root $Root
      Name = if ($processInfo) { $processInfo.Name } else { "" }
      CommandLine = if ($processInfo) { [string]$processInfo.CommandLine } else { "" }
    }
  }
}

function Get-LocalStackManagedProcesses {
  param([string]$Root)

  $processes = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue
  if (-not $processes) {
    return @()
  }

  foreach ($processInfo in $processes) {
    if (-not (Test-LocalStackManagedProcess -ProcessInfo $processInfo -Root $Root)) {
      continue
    }

    [pscustomobject]@{
      Pid = [int]$processInfo.ProcessId
      Name = [string]$processInfo.Name
      CommandLine = [string]$processInfo.CommandLine
      IsWorkspaceProcess = $true
    }
  }
}

function Test-LocalStackUrl {
  param(
    [string]$Url,
    [int]$TimeoutSeconds = 5
  )

  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec $TimeoutSeconds
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  } catch {
    return $false
  }
}

function Wait-LocalStackHealthy {
  param(
    $Config,
    [int]$TimeoutSeconds = 60
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

  while ((Get-Date) -lt $deadline) {
    $frontendReady = Test-LocalStackUrl -Url $Config.FrontendUrl
    $apiReady = Test-LocalStackUrl -Url $Config.ApiHealthUrl

    if ($frontendReady -and $apiReady) {
      return $true
    }

    Start-Sleep -Milliseconds 500
  }

  return $false
}

function Write-LocalStackState {
  param(
    $Config,
    [Nullable[int]]$LauncherPid,
    [int[]]$ListenerPids
  )

  New-Item -ItemType Directory -Path $Config.StateDir -Force | Out-Null

  [pscustomobject]@{
    root = $Config.Root
    launcherPid = $LauncherPid
    listenerPids = @($ListenerPids)
    frontendUrl = $Config.FrontendUrl
    apiUrl = $Config.ApiUrl
    stdoutLog = $Config.StdoutLog
    stderrLog = $Config.StderrLog
    createdAt = (Get-Date).ToString("o")
  } |
    ConvertTo-Json -Depth 4 |
    Set-Content -LiteralPath $Config.StateFile -Encoding UTF8
}

function Read-LocalStackState {
  param($Config)

  if (-not (Test-Path $Config.StateFile)) {
    return $null
  }

  try {
    Get-Content -LiteralPath $Config.StateFile -Raw | ConvertFrom-Json
  } catch {
    $null
  }
}

function Remove-LocalStackState {
  param($Config)

  Remove-Item -LiteralPath $Config.StateFile -Force -ErrorAction SilentlyContinue
}

function Format-LocalStackListenerLine {
  param($Listener)

  $scope = if ($Listener.IsWorkspaceProcess) { "workspace" } else { "external" }
  $ports = ($Listener.Ports -join ", ")
  $commandLine = if ([string]::IsNullOrWhiteSpace($Listener.CommandLine)) {
    "<command unavailable>"
  } else {
    $Listener.CommandLine
  }

  "PID $($Listener.Pid) [$scope] ports: $ports name: $($Listener.Name) command: $commandLine"
}
