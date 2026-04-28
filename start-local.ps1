param(
  [int]$StartupTimeoutSeconds = 60,
  [switch]$Json
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $root "scripts\local-stack.ps1")

$config = Get-LocalStackConfig -Root $root
$nodeModules = Join-Path $root "node_modules"
$launcherScript = Join-Path $root "scripts\local-dev-launcher.cmd"
$existingListeners = @(Get-LocalStackListeners -Ports $config.Ports -Root $root)
$staleManagedProcesses = @(Get-LocalStackManagedProcesses -Root $root)
$frontendReady = Test-LocalStackUrl -Url $config.FrontendUrl
$apiReady = Test-LocalStackUrl -Url $config.ApiHealthUrl

if ($existingListeners.Count -gt 0) {
  $workspaceListeners = @($existingListeners | Where-Object { $_.IsWorkspaceProcess })

  if ($frontendReady -and $apiReady -and $workspaceListeners.Count -eq $existingListeners.Count) {
    $listenerPids = @($workspaceListeners | ForEach-Object { $_.Pid })
    Write-LocalStackState -Config $config -LauncherPid $null -ListenerPids $listenerPids
    Write-LocalStackResult -AsJson:$Json -Result ([pscustomobject]@{
      ok = $true
      action = "already-running"
      frontendUrl = $config.FrontendUrl
      apiUrl = $config.ApiUrl
      listenerPids = $listenerPids
      listeners = @($workspaceListeners | ForEach-Object { Convert-LocalStackListener $_ })
      stdoutLog = $config.StdoutLog
      stderrLog = $config.StderrLog
      lines = @(
        "Local stack is already running.",
        "Frontend: $($config.FrontendUrl)",
        "API: $($config.ApiUrl)",
        "Listener PIDs: $($listenerPids -join ', ')"
      )
    })
    exit 0
  }

  Write-LocalStackResult -AsJson:$Json -Result ([pscustomobject]@{
    ok = $false
    action = "ports-occupied"
    ports = @($config.Ports)
    listeners = @($existingListeners | ForEach-Object { Convert-LocalStackListener $_ })
    lines = @(
      "Ports $($config.Ports -join ', ') are already in use. Refusing to start a second stack."
    ) + @($existingListeners | ForEach-Object {
      Format-LocalStackListenerLine -Listener $_
    })
  })
  exit 1
}

if (-not (Test-Path $nodeModules)) {
  Write-LocalStackResult -AsJson:$Json -Result ([pscustomobject]@{
    ok = $false
    action = "missing-dependencies"
    lines = @("Dependencies are missing. Run 'npm install' first.")
  })
  exit 1
}

if ($existingListeners.Count -eq 0 -and $staleManagedProcesses.Count -gt 0) {
  foreach ($staleProcess in $staleManagedProcesses) {
    Stop-Process -Id $staleProcess.Pid -Force -ErrorAction SilentlyContinue
  }

  Start-Sleep -Seconds 1
  $remainingStaleManagedProcesses = @(Get-LocalStackManagedProcesses -Root $root)
  if ($remainingStaleManagedProcesses.Count -gt 0) {
    Write-LocalStackResult -AsJson:$Json -Result ([pscustomobject]@{
      ok = $false
      action = "stale-processes-remain"
      processes = @($remainingStaleManagedProcesses | ForEach-Object {
        [pscustomobject]@{
          pid = $_.Pid
          name = $_.Name
          commandLine = $_.CommandLine
        }
      })
      lines = @("Found stale local stack processes that could not be stopped.") + @($remainingStaleManagedProcesses | ForEach-Object {
        "PID $($_.Pid) name: $($_.Name) command: $($_.CommandLine)"
      })
    })
    exit 1
  }
}

New-Item -ItemType Directory -Path $config.StateDir -Force | Out-Null
Set-Content -LiteralPath $config.StdoutLog -Value "" -Encoding UTF8
Set-Content -LiteralPath $config.StderrLog -Value "" -Encoding UTF8

$process = Start-Process `
  -FilePath cmd.exe `
  -ArgumentList "/c", "start", """local-dev-stack""", "/b", "cmd.exe", "/c", """$launcherScript""" `
  -WorkingDirectory $root `
  -WindowStyle Hidden `
  -PassThru

if (-not (Wait-LocalStackHealthy -Config $config -TimeoutSeconds $StartupTimeoutSeconds)) {
  Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
  Remove-LocalStackState -Config $config
  Write-LocalStackResult -AsJson:$Json -Result ([pscustomobject]@{
    ok = $false
    action = "startup-timeout"
    startupTimeoutSeconds = $StartupTimeoutSeconds
    stdoutLog = $config.StdoutLog
    stderrLog = $config.StderrLog
    lines = @(
      "Local stack failed to become healthy within $StartupTimeoutSeconds seconds.",
      "Stdout log: $($config.StdoutLog)",
      "Stderr log: $($config.StderrLog)"
    )
  })
  exit 1
}

$startedListeners = @(Get-LocalStackListeners -Ports $config.Ports -Root $root)
$listenerPids = @($startedListeners | ForEach-Object { $_.Pid })
Write-LocalStackState -Config $config -LauncherPid $null -ListenerPids $listenerPids

Write-LocalStackResult -AsJson:$Json -Result ([pscustomobject]@{
  ok = $true
  action = "started"
  frontendUrl = $config.FrontendUrl
  apiUrl = $config.ApiUrl
  launcherPid = $null
  listenerPids = $listenerPids
  listeners = @($startedListeners | ForEach-Object { Convert-LocalStackListener $_ })
  stdoutLog = $config.StdoutLog
  stderrLog = $config.StderrLog
  lines = @(
    "Local stack started.",
    "Frontend: $($config.FrontendUrl)",
    "API: $($config.ApiUrl)",
    "Listener PIDs: $($listenerPids -join ', ')",
    "Stdout log: $($config.StdoutLog)",
    "Stderr log: $($config.StderrLog)"
  )
})
