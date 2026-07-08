$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$node = (Get-Command node).Source
$script = Join-Path $repoRoot "scripts\house-tracker-refresh.mjs"
$taskName = "HK House Tracker"
$legacyTaskName = "Novo 28HSE House Tracker"
$startTime = (Get-Date).AddMinutes(5)

$action = New-ScheduledTaskAction `
  -Execute $node `
  -Argument "`"$script`"" `
  -WorkingDirectory $repoRoot

$trigger = New-ScheduledTaskTrigger `
  -Once `
  -At $startTime `
  -RepetitionInterval (New-TimeSpan -Hours 3) `
  -RepetitionDuration (New-TimeSpan -Days 3650)

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew

if (Get-ScheduledTask -TaskName $legacyTaskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $legacyTaskName -Confirm:$false
}

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "Fetches selected Hong Kong rental listings and refreshes the local house tracker snapshot every three hours." `
  -Force | Out-Null

Write-Host "Registered scheduled task: $taskName"
Write-Host "First run: $startTime"
