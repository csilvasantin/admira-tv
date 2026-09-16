# Admira · REUNIONES-2 — abre el navegador en admira.app al iniciar sesion + instala el player de admira.tv (Windows)
# Ejecutar en REUNIONES-2:  Boton derecho > "Ejecutar con PowerShell"  (o pegar en una ventana de PowerShell)
$ErrorActionPreference = 'Stop'
$app = 'https://admira.app'
# El instalador YA NO LLEVA LA URL A MANO (16-09-2026). Lee el manifiesto que publica el
# CI y de ahi saca el .exe de la ultima version sellada y su SHA-256. Asi el instalador
# no se queda apuntando a un binario viejo cada vez que se publica uno nuevo — es lo que
# pasaba: seguia trayendo el del 27 de junio.
$manifiesto = 'https://player.admira.store/windows-release.json'
$fallback   = 'https://player.admira.store/AdmiraSignagePlayer-win-x64-v.16.09.2026.r1.1400.exe'

Write-Host '== 1/3  Navegador por defecto -> abrir admira.app al iniciar sesion =='
# Acceso directo en el arranque de Windows que abre admira.app en el navegador por defecto
$startup = [Environment]::GetFolderPath('Startup')
$lnkPath = Join-Path $startup 'Admira.app.lnk'
$ws = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut($lnkPath)
$lnk.TargetPath = 'rundll32.exe'
$lnk.Arguments  = "url.dll,FileProtocolHandler $app"
$lnk.Description = 'Abrir admira.app'
$lnk.Save()
Write-Host "   creado: $lnkPath"
# Homepage/arranque de Edge (si esta instalado)
$edgeKey = 'HKCU:\Software\Policies\Microsoft\Edge'
try {
  New-Item -Path $edgeKey -Force | Out-Null
  Set-ItemProperty -Path $edgeKey -Name RestoreOnStartup -Value 4 -Type DWord
  New-Item -Path "$edgeKey\RestoreOnStartupURLs" -Force | Out-Null
  Set-ItemProperty -Path "$edgeKey\RestoreOnStartupURLs" -Name '1' -Value $app
  Write-Host '   Edge configurado para abrir admira.app al arrancar'
} catch { Write-Host '   (Edge no configurado; el acceso directo de arranque abre admira.app igual)' }
Start-Process $app

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

Write-Host '== 3/3  Instalando el player =='
Write-Host '   (App sin firmar: si SmartScreen avisa -> "Mas informacion" -> "Ejecutar de todas formas")'
Start-Process -FilePath $dst
Write-Host 'Listo. Sigue el instalador en pantalla. Tras instalar, el player pide screen/circuit de esta pantalla.'
