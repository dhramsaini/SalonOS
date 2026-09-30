@echo off
title SalonOS Tally Connector - Uninstall
rem Stops the SalonOS Tally Connector and removes it from Windows start-up for this user.
set "SALONOS_SELF=%~f0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=[IO.File]::ReadAllText($env:SALONOS_SELF); Invoke-Expression ($s -split ('#'+'PSSTART'))[1]"
echo.
pause
exit /b
#PSSTART
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like '*SalonOS-Tally-Connector.ps1*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Remove-Item (Join-Path ([Environment]::GetFolderPath('Startup')) 'SalonOS Tally Connector.lnk') -ErrorAction SilentlyContinue
Remove-Item (Join-Path $env:LOCALAPPDATA 'SalonOS\TallyConnector') -Recurse -Force -ErrorAction SilentlyContinue
Write-Host ''
Write-Host '  The SalonOS Tally Connector is stopped and will no longer start with Windows.' -ForegroundColor Green
