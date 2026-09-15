# Admira · REUNIONES-2 — abre el navegador en admira.app al iniciar sesion + instala el player de admira.tv (Windows)
# Ejecutar en REUNIONES-2:  Boton derecho > "Ejecutar con PowerShell"  (o pegar en una ventana de PowerShell)
$ErrorActionPreference = 'Stop'
$app = 'https://admira.app'
$playerUrl = 'https://player.admira.store/AdmiraSignagePlayer-win-x64-v.26.06.27.r1.exe'

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
$dst = Join-Path $env:TEMP 'AdmiraSignagePlayer-Setup.exe'
Invoke-WebRequest -Uri $playerUrl -OutFile $dst -UseBasicParsing
Write-Host "   descargado: $dst  ($([math]::Round((Get-Item $dst).Length/1MB,1)) MB)"

Write-Host '== 3/3  Instalando el player =='
Write-Host '   (App sin firmar: si SmartScreen avisa -> "Mas informacion" -> "Ejecutar de todas formas")'
Start-Process -FilePath $dst
Write-Host 'Listo. Sigue el instalador en pantalla. Tras instalar, el player pide screen/circuit de esta pantalla.'
