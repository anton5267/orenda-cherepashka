param(
  [switch]$CleanStaleState,
  [switch]$Json
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $root "scripts\local-stack.ps1")

$config = Get-LocalStackConfig -Root $root
$state = Read-LocalStackState -Config $config
$listeners = @(Get-LocalStackListeners -Ports $config.Ports -Root $root)
$managedProcesses = @(Get-LocalStackManagedProcesses -Root $root)
$frontendReady = Test-LocalStackUrl -Url $config.FrontendUrl
$apiReady = Test-LocalStackUrl -Url $config.ApiHealthUrl

if ($state -and $listeners.Count -eq 0 -and $CleanStaleState) {
  Remove-LocalStackState -Config $config
  $state = $null
}

$workspaceListeners = @($listeners | Where-Object { $_.IsWorkspaceProcess })
$externalListeners = @($listeners | Where-Object { -not $_.IsWorkspaceProcess })
$trackedPids = [System.Collections.Generic.HashSet[int]]::new()
$frontendStatus = if ($frontendReady) { "ok" } else { "down" }
$apiStatus = if ($apiReady) { "ok" } else { "down" }
$stateFileLabel = if ($state) { $config.StateFile } else { "absent" }
$listenerPidSet = [System.Collections.Generic.HashSet[int]]::new()

foreach ($listener in $workspaceListeners) {
  $null = $listenerPidSet.Add([int]$listener.Pid)
}

$backgroundProcesses = @($managedProcesses | Where-Object {
  -not $listenerPidSet.Contains([int]$_.Pid)
})

if ($state) {
  if ($state.launcherPid) {
    $null = $trackedPids.Add([int]$state.launcherPid)
  }

  foreach ($listenerPid in @($state.listenerPids)) {
    if ($listenerPid) {
      $null = $trackedPids.Add([int]$listenerPid)
    }
  }
}

$runningState = if ($workspaceListeners.Count -gt 0) {
  if ($frontendReady -and $apiReady) { "running" } else { "degraded" }
} elseif ($backgroundProcesses.Count -gt 0) {
  "stale-processes"
} elseif ($listeners.Count -gt 0) {
  "ports-occupied"
} elseif ($state) {
  "stale-state"
} else {
  "stopped"
}

$lines = @(
  "Local stack status: $runningState",
  "Frontend: $($config.FrontendUrl) [$frontendStatus]",
  "API: $($config.ApiUrl) [$apiStatus]",
  "State file: $stateFileLabel"
)

if ($trackedPids.Count -gt 0) {
  $lines += "Tracked PIDs: $((@($trackedPids) -join ', '))"
}

if ($workspaceListeners.Count -gt 0) {
  $lines += "Workspace listeners:"
  $lines += @($workspaceListeners | ForEach-Object {
    Format-LocalStackListenerLine -Listener $_
  })
}

if ($externalListeners.Count -gt 0) {
  $lines += "External listeners:"
  $lines += @($externalListeners | ForEach-Object {
    Format-LocalStackListenerLine -Listener $_
  })
}

if ($backgroundProcesses.Count -gt 0) {
  $lines += "Workspace background processes:"
  $lines += @($backgroundProcesses | ForEach-Object {
    "PID $($_.Pid) [workspace-background] name: $($_.Name) command: $($_.CommandLine)"
  })
}

if (Test-Path $config.StdoutLog) {
  $lines += "Stdout log: $($config.StdoutLog)"
}

if (Test-Path $config.StderrLog) {
  $lines += "Stderr log: $($config.StderrLog)"
}

Write-LocalStackResult -AsJson:$Json -Result ([pscustomobject]@{
  ok = @("running", "stopped") -contains $runningState
  status = $runningState
  frontend = [pscustomobject]@{
    url = $config.FrontendUrl
    health = $frontendStatus
  }
  api = [pscustomobject]@{
    url = $config.ApiUrl
    health = $apiStatus
    healthUrl = $config.ApiHealthUrl
  }
  stateFile = $stateFileLabel
  trackedPids = @($trackedPids)
  workspaceListeners = @($workspaceListeners | ForEach-Object { Convert-LocalStackListener $_ })
  externalListeners = @($externalListeners | ForEach-Object { Convert-LocalStackListener $_ })
  backgroundProcesses = @($backgroundProcesses | ForEach-Object {
    [pscustomobject]@{
      pid = $_.Pid
      name = $_.Name
      commandLine = $_.CommandLine
    }
  })
  stdoutLog = if (Test-Path $config.StdoutLog) { $config.StdoutLog } else { $null }
  stderrLog = if (Test-Path $config.StderrLog) { $config.StderrLog } else { $null }
  lines = $lines
})
