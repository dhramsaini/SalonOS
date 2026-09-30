# SalonOS Tally Connector - install without downloading a file (for PCs where Windows Smart App
# Control blocks downloaded .bat files). In PowerShell (Start > type PowerShell > Enter) paste:
#     iex ((New-Object Net.WebClient).DownloadString('https://digitalca.co.in/tally-connector/install.ps1'))
# Same result as Install-SalonOS-Tally-Connector.bat: copies the connector to
# %LOCALAPPDATA%\SalonOS\TallyConnector, starts it hidden now and every time Windows starts.
# No administrator rights needed. Run it again to update or to change the Tally computer.
$ErrorActionPreference = 'Stop'
Write-Host ''
Write-Host '  SalonOS Tally Connector - one-time install for this computer' -ForegroundColor Cyan
Write-Host '  Where is Tally?  On THIS computer: just press Enter.'
Write-Host '                  On another PC / server: type its IP address (e.g. 192.168.1.20) and press Enter.'
$th = (Read-Host '  Tally computer [this one]').Trim()
if ($th -and $th -notmatch '^[A-Za-z0-9.\-]+$') { Write-Host "  '$th' is not a computer name or IP address - run the command again." -ForegroundColor Red; return }

$dir = Join-Path $env:LOCALAPPDATA 'SalonOS\TallyConnector'
New-Item -ItemType Directory -Force $dir | Out-Null
$ps1 = Join-Path $dir 'SalonOS-Tally-Connector.ps1'
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $wc = New-Object Net.WebClient; $wc.Encoding = [Text.Encoding]::UTF8
  $code = $wc.DownloadString('https://digitalca.co.in/tally-connector/SalonOS-Tally-Connector.ps1')
} catch { Write-Host "  Could not download the connector: $($_.Exception.Message)" -ForegroundColor Red; return }
if ($code -notmatch '\[switch\]\$Background') { Write-Host '  The download was not the SalonOS connector - try again later.' -ForegroundColor Red; return }
[IO.File]::WriteAllText($ps1, $code, (New-Object Text.UTF8Encoding $true))

$psExe = Join-Path $PSHOME 'powershell.exe'
$cargs = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $ps1 + '" -Background'
if ($th) { $cargs += ' -TallyHost ' + $th }

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
if ($st.tallyReachable) { Write-Host '  Tally is answering. In SalonOS click "Check connection".' -ForegroundColor Green }
else { Write-Host "  Tally is not answering at $($st.tally) yet - open Tally with your company, then click ""Check connection"" in SalonOS." -ForegroundColor Yellow }
