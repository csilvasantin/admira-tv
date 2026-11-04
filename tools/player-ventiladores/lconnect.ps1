# Relevo de las pantallas con L-Connect 3.
# L-Connect envía sin parar sus propios fotogramas a las TL LCD (modo sincronizado);
# mientras emite admira.tv hay que pausar su servicio o los dos se pisan.
#   .\lconnect.ps1 estado
#   .\lconnect.ps1 pausar     (pide elevación: aviso de Windows)
#   .\lconnect.ps1 reanudar   (vuelven los vídeos, el RGB y las curvas de L-Connect)
param([ValidateSet('estado', 'pausar', 'reanudar')][string]$Accion = 'estado')

$servicios = 'LConnectServiceWatcher', 'LConnectService'   # el vigilante relanza el servicio: va primero
if ($Accion -eq 'estado') {
  Get-Service $servicios | Format-Table Name, Status, StartType -AutoSize
  return
}

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
  $exe = (Get-Process -Id $PID).Path
  Start-Process $exe -Verb RunAs -Wait -ArgumentList '-NoProfile', '-File', "`"$PSCommandPath`"", $Accion
  Get-Service $servicios | Format-Table Name, Status -AutoSize
  return
}

if ($Accion -eq 'pausar') {
  # Solo se paran; el tipo de inicio no cambia, así que al reiniciar el PC L-Connect vuelve solo.
  foreach ($s in $servicios) { Stop-Service $s -Force }
} else {
  Start-Service LConnectService
  Start-Service LConnectServiceWatcher
}
