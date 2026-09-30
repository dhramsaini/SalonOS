@echo off
title SalonOS Tally Connector - Install
rem Installs the SalonOS Tally Connector for this Windows user: copies it to %LOCALAPPDATA%\SalonOS\TallyConnector,
rem starts it hidden now and every time Windows starts (Startup folder shortcut). No administrator rights needed.
rem Run it again to update or to change the Tally computer. Remove with Uninstall-SalonOS-Tally-Connector.bat.
echo.
echo   SalonOS Tally Connector - one-time install for this computer
echo   ------------------------------------------------------------
echo   After this, the connector starts by itself whenever Windows starts.
echo   You only need to open Tally with your company.
echo.
echo   Where is Tally?
echo     - On THIS computer:                just press Enter
echo     - On another PC / office server:   type its IP address (for example 192.168.1.20) and press Enter
echo.
set "SALONOS_TALLYHOST="
set /p "SALONOS_TALLYHOST=  Tally computer [this one]: "
set "SALONOS_SELF=%~f0"
set "SALONOS_SRC=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=[IO.File]::ReadAllText($env:SALONOS_SELF); Invoke-Expression ($s -split ('#'+'PSSTART'))[1]"
echo.
pause
exit /b
#PSSTART
$ErrorActionPreference = 'Stop'
$dir = Join-Path $env:LOCALAPPDATA 'SalonOS\TallyConnector'
New-Item -ItemType Directory -Force $dir | Out-Null
$ps1 = Join-Path $dir 'SalonOS-Tally-Connector.ps1'
$got = $false
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  (New-Object Net.WebClient).DownloadFile('https://digitalca.co.in/tally-connector/SalonOS-Tally-Connector.ps1', "$ps1.new")
  if ((Get-Content "$ps1.new" -Raw) -match '\[switch\]\$Background') { Move-Item -Force "$ps1.new" $ps1; $got = $true }
} catch {}
if (-not $got) {
  $local = Join-Path $env:SALONOS_SRC 'SalonOS-Tally-Connector.ps1'
  if (Test-Path $local) { Copy-Item -Force $local $ps1; $got = $true }
}
Remove-Item "$ps1.new" -ErrorAction SilentlyContinue
if (-not $got) { Write-Host '  Could not download the connector. Check the internet connection and run this file again.' -ForegroundColor Red; return }
Unblock-File $ps1 -ErrorAction SilentlyContinue

$th = ("$env:SALONOS_TALLYHOST").Trim()
if ($th -and $th -notmatch '^[A-Za-z0-9.\-]+$') { Write-Host "  '$th' is not a computer name or IP address - run this file again." -ForegroundColor Red; return }
$psExe = Join-Path $PSHOME 'powershell.exe'
$cargs = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $ps1 + '" -Background'
if ($th) { $cargs += ' -TallyHost ' + $th }

# Stop any connector already running (an older copy or one started by hand) so the new one takes over.
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like '*SalonOS-Tally-Connector.ps1*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Milliseconds 800

$lnk = Join-Path ([Environment]::GetFolderPath('Startup')) 'SalonOS Tally Connector.lnk'
$sc = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
$sc.TargetPath = $psExe; $sc.Arguments = $cargs; $sc.WorkingDirectory = $dir; $sc.WindowStyle = 7
$sc.Description = 'SalonOS Tally Connector - lets SalonOS send vouchers to Tally'
$sc.Save()

Start-Process -FilePath $psExe -ArgumentList $cargs -WindowStyle Hidden
$st = $null
for ($i = 0; $i -lt 10 -and -not $st; $i++) { Start-Sleep -Milliseconds 700; try { $st = Invoke-RestMethod 'http://localhost:9123/status' -TimeoutSec 5 } catch {} }
Write-Host ''
if (-not $st) { Write-Host '  Installed, but the connector did not answer yet. Restart the computer, then click Check connection in SalonOS.' -ForegroundColor Yellow; return }
Write-Host '  Installed. The SalonOS Tally Connector is running and will start with Windows.' -ForegroundColor Green
if ($th) { Write-Host "  Tally computer: $th" }
if ($st.tallyReachable) { Write-Host '  Tally is answering. In SalonOS click "Check connection".' -ForegroundColor Green }
else { Write-Host "  Tally is not answering at $($st.tally) yet - open Tally with your company, then click ""Check connection"" in SalonOS." -ForegroundColor Yellow }
