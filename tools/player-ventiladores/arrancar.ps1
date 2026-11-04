# Arranque desatendido: lo lanza la tarea programada al iniciar sesión (privilegios altos).
# Pausa L-Connect, que al arrancar Windows vuelve a emitir a las pantallas, y deja el
# player en marcha. Log: %LOCALAPPDATA%\AdmiraVentiladores\logs\player.log
# Compatible con Windows PowerShell 5.1 (la tarea usa el de System32, que no cambia de ruta).
$logs = Join-Path $env:LOCALAPPDATA 'AdmiraVentiladores\logs'
New-Item -ItemType Directory -Force $logs | Out-Null
$log = Join-Path $logs 'player.log'
if ((Test-Path $log) -and (Get-Item $log).Length -gt 5MB) { Move-Item $log "$log.1" -Force }
Add-Content $log ('{"at":"' + (Get-Date).ToUniversalTime().ToString('o') + '","state":"autostart"}')

# El vigilante relanza el servicio: va primero.
foreach ($s in 'LConnectServiceWatcher', 'LConnectService') { Stop-Service $s -Force -ErrorAction SilentlyContinue }

Set-Location $PSScriptRoot
$node = Join-Path $env:ProgramFiles 'nodejs\node.exe'
& cmd.exe /c "`"$node`" player.mjs >> `"$log`" 2>&1"
