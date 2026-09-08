# Keep-alive do CRM de prospeccao.
# So este sistema: pasta CRM/, porta 3001. Nao mexe em Chamado, JARVIS nem outros Node.
# Se o Next cair, espera e liga de novo. Um mutex impede dois watchdogs.

$ErrorActionPreference = "Continue"

$CrmRoot = Split-Path -Parent $PSScriptRoot
$Port = 3001
$TaskName = "CRM-Prospeccao-KeepAlive"
$MutexName = "Global\CRM-Prospeccao-KeepAlive"
$LogDir = Join-Path $CrmRoot "logs"
$LogFile = Join-Path $LogDir "keep-alive.log"
$NextLog = Join-Path $LogDir "next.log"
$PidFile = Join-Path $LogDir "keep-alive.pid"

function Write-KeepAliveLog {
  param([string]$Message)
  $line = "{0:yyyy-MM-dd HH:mm:ss} {1}" -f (Get-Date), $Message
  try {
    Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8 -ErrorAction SilentlyContinue
  } catch { }
  Write-Host $line
}

function Initialize-LogDir {
  if (-not (Test-Path -LiteralPath $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
  }
  if ((Test-Path -LiteralPath $LogFile) -and ((Get-Item -LiteralPath $LogFile).Length -gt 2MB)) {
    Move-Item -LiteralPath $LogFile -Destination "$LogFile.old" -Force -ErrorAction SilentlyContinue
  }
  if ((Test-Path -LiteralPath $NextLog) -and ((Get-Item -LiteralPath $NextLog).Length -gt 8MB)) {
    Move-Item -LiteralPath $NextLog -Destination "$NextLog.old" -Force -ErrorAction SilentlyContinue
  }
}

function Restore-ProcessPath {
  $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machinePath;$userPath"
  $nodeDir = "C:\Program Files\nodejs"
  if ((Test-Path -LiteralPath $nodeDir) -and ($env:Path -notlike "*$nodeDir*")) {
    $env:Path = "$nodeDir;$env:Path"
  }
}

function Get-ListeningPid {
  param([int]$ListenPort)
  $needle = ":$ListenPort "
  $line = netstat -ano -p TCP | Select-String "LISTENING" | Where-Object { $_.Line -like "*$needle*" } | Select-Object -First 1
  if (-not $line) { return $null }
  if ($line.Line -match "\s(\d+)\s*$") {
    return [int]$Matches[1]
  }
  return $null
}

function Test-IsCrmNode {
  param($ProcessId)
  if (-not $ProcessId) { return $false }
  $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
  if (-not $proc -or -not $proc.CommandLine) { return $false }
  $normalizedRoot = $CrmRoot.Replace("\", "/")
  $normalizedCmd = $proc.CommandLine.Replace("\", "/")
  return $normalizedCmd -like "*$normalizedRoot*"
}

function Start-CrmRedis {
  $docker = Get-Command docker.exe -ErrorAction SilentlyContinue
  if (-not $docker) { return }
  $compose = Join-Path $CrmRoot "docker-compose.yml"
  if (-not (Test-Path -LiteralPath $compose)) { return }
  try {
    & docker.exe compose -f $compose up -d 2>&1 | Out-Null
  } catch {
    Write-KeepAliveLog "Redis/worker do CRM nao subiu (docker indisponivel). Next continua."
  }
}

Initialize-LogDir
Restore-ProcessPath

$packageJson = Join-Path $CrmRoot "package.json"
if (-not (Test-Path -LiteralPath $packageJson)) {
  Write-KeepAliveLog "package.json nao encontrado em $CrmRoot"
  exit 1
}

$mutex = New-Object System.Threading.Mutex($false, $MutexName)
$owned = $false
try {
  $owned = $mutex.WaitOne(0)
} catch [System.Threading.AbandonedMutexException] {
  $owned = $true
}
if (-not $owned) {
  Write-KeepAliveLog "Outro watchdog deste CRM ja esta no ar. Saindo."
  exit 0
}

Set-Content -LiteralPath $PidFile -Value $PID -Encoding ASCII
Write-KeepAliveLog "Watchdog ligado (PID $PID). Porta $Port. Tarefa $TaskName."

try {
  Set-Location -LiteralPath $CrmRoot
  Start-CrmRedis

  $delaySeconds = 3
  while ($true) {
    $owner = Get-ListeningPid -ListenPort $Port
    if ($owner -and (Test-IsCrmNode -ProcessId $owner)) {
      Write-KeepAliveLog "CRM ja escuta na $Port (PID $owner). Aguardando queda."
      while ($true) {
        Start-Sleep -Seconds 5
        $still = Get-ListeningPid -ListenPort $Port
        if (-not $still) { break }
        if (-not (Test-IsCrmNode -ProcessId $still)) { break }
      }
      Write-KeepAliveLog "Porta $Port livre. Religa em ${delaySeconds}s."
      Start-Sleep -Seconds $delaySeconds
      continue
    }

    if ($owner -and -not (Test-IsCrmNode -ProcessId $owner)) {
      Write-KeepAliveLog "Porta $Port ocupada por PID $owner (nao e este CRM). Nao derrubo. Nova checagem em 15s."
      Start-Sleep -Seconds 15
      continue
    }

    $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $npm) {
      Write-KeepAliveLog "npm.cmd nao esta no PATH. Nova tentativa em 15s."
      Start-Sleep -Seconds 15
      Restore-ProcessPath
      continue
    }

    Write-KeepAliveLog "Subindo npm run dev na porta $Port."
    $cmdExe = Join-Path $env:SystemRoot "System32\cmd.exe"
    $quoted = "cd /d `"$CrmRoot`" && `"$($npm.Source)`" run dev >> `"$NextLog`" 2>&1"
    $p = Start-Process -FilePath $cmdExe `
      -ArgumentList @("/c", $quoted) `
      -WorkingDirectory $CrmRoot `
      -PassThru -WindowStyle Hidden

    if (-not $p) {
      Write-KeepAliveLog "Falha ao criar o processo npm. Retry em ${delaySeconds}s."
      Start-Sleep -Seconds $delaySeconds
      $delaySeconds = [Math]::Min($delaySeconds * 2, 30)
      continue
    }

    Wait-Process -Id $p.Id
    $code = 0
    if ($null -ne $p.ExitCode) { $code = $p.ExitCode }
    Write-KeepAliveLog "Next saiu (codigo $code). Religa em ${delaySeconds}s."
    Start-Sleep -Seconds $delaySeconds
    if ($code -ne 0) {
      $delaySeconds = [Math]::Min($delaySeconds * 2, 30)
    } else {
      $delaySeconds = 3
    }
  }
} finally {
  try { $mutex.ReleaseMutex() | Out-Null } catch { }
  $mutex.Dispose()
  if (Test-Path -LiteralPath $PidFile) {
    Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
  }
  Write-KeepAliveLog "Watchdog encerrado."
}
