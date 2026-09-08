# Remove a tarefa do Windows deste CRM. Nao toca em outras tarefas.
# Encera o Next deste projeto se ele estiver na porta 3001.

$ErrorActionPreference = "Continue"

$CrmRoot = Split-Path -Parent $PSScriptRoot
$TaskName = "CRM-Prospeccao-KeepAlive"
$Port = 3001

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($task) {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "Tarefa '$TaskName' removida."
} else {
  Write-Host "Tarefa '$TaskName' nao existia."
}

$watchdog = Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -and ($_.CommandLine -like "*keep-alive.ps1*") -and ($_.CommandLine -like "*$CrmRoot*") }
foreach ($p in $watchdog) {
  Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
}

$line = netstat -ano -p TCP | Select-String "LISTENING" | Where-Object { $_.Line -like "*:$Port *" } | Select-Object -First 1
if ($line -and $line.Line -match "\s(\d+)\s*$") {
  $listenPid = [int]$Matches[1]
  $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $listenPid" -ErrorAction SilentlyContinue
  $normalizedRoot = $CrmRoot.Replace("\", "/")
  if ($proc -and $proc.CommandLine -and ($proc.CommandLine.Replace("\", "/") -like "*$normalizedRoot*")) {
    Stop-Process -Id $listenPid -Force -ErrorAction SilentlyContinue
    Write-Host "Next deste CRM na porta $Port encerrado (PID $listenPid)."
  } else {
    Write-Host "Porta $Port ocupada por outro processo; nao derrubei."
  }
}

Write-Host "Keep-alive deste CRM desligado."
