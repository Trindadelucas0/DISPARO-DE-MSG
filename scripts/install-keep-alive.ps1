# Instala a tarefa do Windows que mantem SO este CRM ligado (porta 3001).
# Nao altera outras tarefas nem outros sistemas.

$ErrorActionPreference = "Stop"

$CrmRoot = Split-Path -Parent $PSScriptRoot
$KeepAlive = Join-Path $PSScriptRoot "keep-alive.ps1"
$TaskName = "CRM-Prospeccao-KeepAlive"

if (-not (Test-Path -LiteralPath $KeepAlive)) {
  Write-Error "keep-alive.ps1 nao encontrado."
  exit 1
}

$ps = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
$arg = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$KeepAlive`""

$action = New-ScheduledTaskAction -Execute $ps -Argument $arg -WorkingDirectory $CrmRoot
$triggerLogon = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$triggerRepeat = New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes(1)) `
  -RepetitionInterval (New-TimeSpan -Minutes 5) `
  -RepetitionDuration (New-TimeSpan -Days 9999)

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -DontStopOnIdleEnd `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Days 3650)

$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger @($triggerLogon, $triggerRepeat) `
  -Settings $settings `
  -Principal $principal `
  -Description "Mantem o CRM de prospeccao (Next.js na porta 3001) ligado. So este sistema; nao mexe em outros processos." `
  -Force | Out-Null

# CIM recusa PT0S no Register; depois do registro o XML aceita "sem limite".
try {
  $registered = Get-ScheduledTask -TaskName $TaskName
  $registered.Settings.ExecutionTimeLimit = "PT0S"
  Set-ScheduledTask -TaskName $TaskName -Settings $registered.Settings | Out-Null
} catch { }

Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 2
$info = Get-ScheduledTaskInfo -TaskName $TaskName
Write-Host "Tarefa '$TaskName' instalada e disparada. Ultima execucao: $($info.LastTaskResult)"
Write-Host "CRM: http://localhost:3001"
Write-Host "Log: $CrmRoot\logs\keep-alive.log"
