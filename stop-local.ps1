param(
  [switch]$Force,
  [switch]$Json
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $root "scripts\local-stack.ps1")

$config = Get-LocalStackConfig -Root $root
$state = Read-LocalStackState -Config $config
$targetPids = [System.Collections.Generic.HashSet[int]]::new()
$managedProcesses = @(Get-LocalStackManagedProcesses -Root $root)

if ($state) {
  if ($state.launcherPid) {
    $null = $targetPids.Add([int]$state.launcherPid)
  }

  foreach ($listenerPid in @($state.listenerPids)) {
    if ($listenerPid) {
      $null = $targetPids.Add([int]$listenerPid)
    }
  }
}

$listeners = @(Get-LocalStackListeners -Ports $config.Ports -Root $root)
$eligibleListeners = if ($Force) {
  $listeners
} else {
  @($listeners | Where-Object { $_.IsWorkspaceProcess })
}

foreach ($listener in $eligibleListeners) {
  $null = $targetPids.Add([int]$listener.Pid)
}

foreach ($managedProcess in $managedProcesses) {
  $null = $targetPids.Add([int]$managedProcess.Pid)
}

if ($targetPids.Count -eq 0) {
  if ($listeners.Count -gt 0 -and -not $Force) {
    Write-LocalStackResult -AsJson:$Json -Result ([pscustomobject]@{
      ok = $false
      action = "refused-external-listeners"
      ports = @($config.Ports)
      listeners = @($listeners | ForEach-Object { Convert-LocalStackListener $_ })
      lines = @(
        "Ports $($config.Ports -join ', ') are in use by non-workspace processes. Nothing was stopped."
      ) + @($listeners | ForEach-Object {
        Format-LocalStackListenerLine -Listener $_
      })
    })
    exit 1
  }

  Write-LocalStackResult -AsJson:$Json -Result ([pscustomobject]@{
    ok = $true
    action = "already-stopped"
    lines = @("No tracked local stack processes found.")
  })
  Remove-LocalStackState -Config $config
  exit 0
}

$stoppedPidLines = @()

foreach ($pidValue in @($targetPids)) {
  Stop-Process -Id $pidValue -Force -ErrorAction SilentlyContinue
  $stoppedPidLines += "Stopped PID: $pidValue"
}

Start-Sleep -Seconds 1

$remainingListeners = @(Get-LocalStackListeners -Ports $config.Ports -Root $root)
$remainingManagedProcesses = @(Get-LocalStackManagedProcesses -Root $root)
$remainingWorkspaceListeners = if ($Force) {
  $remainingListeners
} else {
  @($remainingListeners | Where-Object { $_.IsWorkspaceProcess })
}

if ($remainingWorkspaceListeners.Count -gt 0 -or $remainingManagedProcesses.Count -gt 0) {
  $remainingProcessLines = @()

  if ($remainingWorkspaceListeners.Count -gt 0) {
    $remainingProcessLines += @($remainingWorkspaceListeners | ForEach-Object {
      Format-LocalStackListenerLine -Listener $_
    })
  }

  if ($remainingManagedProcesses.Count -gt 0) {
    $remainingProcessLines += @($remainingManagedProcesses | ForEach-Object {
      "PID $($_.Pid) [workspace-background] name: $($_.Name) command: $($_.CommandLine)"
    })
  }

  Write-LocalStackResult -AsJson:$Json -Result ([pscustomobject]@{
    ok = $false
    action = "partial-stop"
    stoppedPids = @($targetPids)
    remainingListeners = @($remainingWorkspaceListeners | ForEach-Object { Convert-LocalStackListener $_ })
    remainingProcesses = @($remainingManagedProcesses | ForEach-Object {
      [pscustomobject]@{
        pid = $_.Pid
        name = $_.Name
        commandLine = $_.CommandLine
      }
    })
    lines = @("Some local stack processes are still running.") + $remainingProcessLines
  })
  exit 1
}

Remove-LocalStackState -Config $config
Write-LocalStackResult -AsJson:$Json -Result ([pscustomobject]@{
  ok = $true
  action = "stopped"
  stoppedPids = @($targetPids)
  lines = @($stoppedPidLines + "Local stack stopped.")
})
