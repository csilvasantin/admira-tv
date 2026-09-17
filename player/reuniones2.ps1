# Admira · REUNIONES-2 — instala y arranca el player nativo de admira.tv (Windows)
# Ejecutar en REUNIONES-2 desde PowerShell. No requiere asistente: instala en silencio,
# fija la identidad de flota y comprueba que el proceso queda vivo.
$ErrorActionPreference = 'Stop'
$machine = 'reuniones-2'
$screen = 'reuniones-2-mupi'
$circuit = 'oficina'
# El instalador YA NO LLEVA LA URL A MANO (16-09-2026). Lee el manifiesto que publica el
# CI y de ahi saca el .exe de la ultima version sellada y su SHA-256. Asi el instalador
# no se queda apuntando a un binario viejo cada vez que se publica uno nuevo — es lo que
# pasaba: seguia trayendo el del 27 de junio.
$manifiesto = 'https://player.admira.store/windows-release.json'
$fallback   = 'https://player.admira.store/AdmiraSignagePlayer-win-x64-latest.exe'

Write-Host '== 1/3  Identidad persistente de flota =='
# Una versión anterior de este script abría además admira.app desde Inicio y competía
# por el foco con el kiosko. Retiramos únicamente ese acceso directo creado por nosotros.
$legacyShortcut = Join-Path ([Environment]::GetFolderPath('Startup')) 'Admira.app.lnk'
if (Test-Path $legacyShortcut) { Remove-Item $legacyShortcut -Force }
# Persistir en el entorno del usuario hace que la identidad llegue también al arranque
# automático posterior. Se replica en el proceso actual para el primer lanzamiento.
[Environment]::SetEnvironmentVariable('ADMIRA_MACHINE', $machine, 'User')
[Environment]::SetEnvironmentVariable('ADMIRA_SCREEN', $screen, 'User')
[Environment]::SetEnvironmentVariable('ADMIRA_CIRCUIT', $circuit, 'User')
$env:ADMIRA_MACHINE = $machine
$env:ADMIRA_SCREEN = $screen
$env:ADMIRA_CIRCUIT = $circuit
Write-Host "   machine=$machine · screen=$screen · circuit=$circuit"

Write-Host '== 2/3  Descargando el player de admira.tv (Windows) =='
$playerUrl = $fallback
$sha = ''
try {
  $m = Invoke-RestMethod -Uri "$manifiesto`?cb=$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())" -UseBasicParsing
  $exe = $m.artifacts | Where-Object { $_.nombre -like '*.exe' } | Select-Object -First 1
  if ($exe) { $playerUrl = $exe.url; $sha = $exe.sha256; Write-Host "   version $($m.release) (commit $($m.commit))" }
} catch { Write-Host '   (no he podido leer el manifiesto; tiro de la ultima version conocida)' }

$dst = Join-Path $env:TEMP 'AdmiraSignagePlayer-Setup.exe'
Invoke-WebRequest -Uri $playerUrl -OutFile $dst -UseBasicParsing
Write-Host "   descargado: $dst  ($([math]::Round((Get-Item $dst).Length/1MB,1)) MB)"

# COMPROBAR LA HUELLA ANTES DE EJECUTAR. No sustituye a la firma de codigo —dice que el
# fichero no cambio por el camino, no que lo hayamos hecho nosotros— pero es lo unico que
# hay hasta que haya certificado, y es gratis.
if ($sha) {
  $real = (Get-FileHash -Path $dst -Algorithm SHA256).Hash.ToLower()
  if ($real -ne $sha.ToLower()) {
    Remove-Item $dst -Force
    throw "La huella del instalador no coincide con el manifiesto. Descarga abortada. Esperado $sha, obtenido $real"
  }
  Write-Host '   huella SHA-256 verificada contra el manifiesto'
} else {
  Write-Host '   (sin huella en el manifiesto: se instala sin verificar)'
}

Write-Host '== 3/3  Instalando y comprobando el player =='
Write-Host '   App sin firmar: la ejecución directa evita el asistente, pero Windows puede registrar el editor como desconocido.'
Get-Process -Name 'Admira Signage' -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Process -FilePath $dst -ArgumentList '/S' -Wait

$candidates = @(
  (Join-Path $env:LOCALAPPDATA 'Programs\Admira Signage\Admira Signage.exe'),
  (Join-Path $env:LOCALAPPDATA 'Programs\admira-signage-electron\Admira Signage.exe')
)
$installed = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $installed) {
  $programs = Join-Path $env:LOCALAPPDATA 'Programs'
  if (Test-Path $programs) {
    $installed = Get-ChildItem -Path $programs -Filter 'Admira Signage.exe' -File -Recurse -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty FullName -First 1
  }
}
if (-not $installed) { throw 'El instalador terminó, pero no encuentro Admira Signage.exe en LOCALAPPDATA\Programs.' }

Start-Process -FilePath $installed
Start-Sleep -Seconds 8
$running = Get-Process -Name 'Admira Signage' -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $running) { throw "El player se instaló en $installed, pero el proceso no permanece vivo." }

$runKey = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -ErrorAction SilentlyContinue
$autoStart = $runKey.PSObject.Properties.Value | Where-Object { $_ -is [string] -and $_ -like "*$installed*" } | Select-Object -First 1
Write-Host "   instalado: $installed"
Write-Host "   proceso vivo: PID $($running.Id)"
if ($autoStart) { Write-Host '   autoarranque: registrado' }
else { Write-Host '   autoarranque: el player lo registrará al completar su primer arranque' }
Write-Host "Listo. REUNIONES-2 emite como $screen; comprueba el latido en admira.live o admira.tv/cms.html."
