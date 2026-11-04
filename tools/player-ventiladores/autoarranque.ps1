# Tarea programada «Admira Player Ventiladores»: al iniciar sesión pausa L-Connect y emite admira.tv.
#   .\autoarranque.ps1 estado
#   .\autoarranque.ps1 instalar   (aviso de Windows; la arranca ya. Repetirlo reinicia el player)
#   .\autoarranque.ps1 quitar     (para el player, borra la tarea y reanuda L-Connect)
param([ValidateSet('estado', 'instalar', 'quitar')][string]$Accion = 'estado', [string]$Usuario = "$env:USERDOMAIN\$env:USERNAME")

$nombre = 'Admira Player Ventiladores'
if ($Accion -eq 'estado') {
  $t = Get-ScheduledTask -TaskName $nombre -ErrorAction SilentlyContinue
  if (-not $t) { 'Sin tarea programada.'; return }
  $i = $t | Get-ScheduledTaskInfo
  [pscustomobject]@{ Tarea = $nombre; Estado = $t.State; UltimaEjecucion = $i.LastRunTime; Resultado = $i.LastTaskResult } | Format-List
  return
}

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
  $exe = (Get-Process -Id $PID).Path
  Start-Process $exe -Verb RunAs -Wait -ArgumentList '-NoProfile', '-File', "`"$PSCommandPath`"", $Accion, '-Usuario', "`"$Usuario`""
  & $PSCommandPath estado
  return
}

$logs = Join-Path $env:LOCALAPPDATA 'AdmiraVentiladores\logs'
New-Item -ItemType Directory -Force $logs | Out-Null
Start-Transcript -Path (Join-Path $logs 'autoarranque.log') -Append | Out-Null
$ErrorActionPreference = 'Stop'
trap { Write-Output "ERROR: $_"; Stop-Transcript | Out-Null; exit 1 }

# Parar la tarea no mata a sus hijos (cmd → node → chrome): se cierran a mano para que
# el puerto de salud y el USB queden libres antes de volver a arrancar.
function Stop-Player {
  Stop-ScheduledTask -TaskName $nombre -ErrorAction SilentlyContinue
  Get-CimInstance Win32_Process -Filter "Name='node.exe' OR Name='chrome.exe' OR Name='powershell.exe'" |
    Where-Object { $_.CommandLine -match 'player\.mjs|AdmiraVentiladores|arrancar\.ps1' } |
    Sort-Object { $_.Name -ne 'powershell.exe' } |   # primero el bucle de arrancar.ps1, o relanzaría el player
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

if ($Accion -eq 'instalar') {
  Stop-Player
  $ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $ejecutar = New-ScheduledTaskAction -Execute $ps -WorkingDirectory $PSScriptRoot `
    -Argument "-NoProfile -WindowStyle Hidden -File `"$PSScriptRoot\arrancar.ps1`""
  $disparador = New-ScheduledTaskTrigger -AtLogOn -User $Usuario
  $principal = New-ScheduledTaskPrincipal -UserId $Usuario -LogonType Interactive -RunLevel Highest
  $ajustes = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
  Register-ScheduledTask -TaskName $nombre -Action $ejecutar -Trigger $disparador -Principal $principal -Settings $ajustes `
    -Description 'Player admira.tv en los ventiladores TL LCD (admira-tv/tools/player-ventiladores). Pausa L-Connect mientras emite.' -Force | Out-Null
  Start-ScheduledTask -TaskName $nombre
} else {
  Stop-Player
  Unregister-ScheduledTask -TaskName $nombre -Confirm:$false -ErrorAction SilentlyContinue
  Start-Service LConnectService
  Start-Service LConnectServiceWatcher
}
Stop-Transcript | Out-Null
