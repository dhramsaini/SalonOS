<#
  SalonOS Tally Connector
  -----------------------
  Lets SalonOS (https://digitalca.co.in) talk to TallyPrime / Tally.ERP 9 through Tally's own XML
  server. Browsers are not allowed to read Tally's replies directly, so this small relay runs next
  to your browser, forwards SalonOS's requests to Tally and passes Tally's answers back.

  It only accepts requests from the SalonOS website, only talks to the one Tally address you give
  it, and stores nothing. Close this window to stop it.

  In Tally first: F1 (Help) > Settings > Connectivity > "Client/Server configuration":
    TallyPrime acts as = Both (or Server), Enable ODBC = Yes, Port = 9000.
    (Tally.ERP 9: F12 > Advanced Configuration > Enable ODBC Server = Yes, Port = 9000.)

  Usage (double-click Start-SalonOS-Tally-Connector.bat, or run in PowerShell):
    Local  - Tally on this PC:                  .\SalonOS-Tally-Connector.ps1
    Server - Tally on another PC / office server: .\SalonOS-Tally-Connector.ps1 -TallyHost 192.168.1.20
    Cloud  - run this on the cloud / remote desktop where Tally runs, and open SalonOS there too;
             or keep Tally's port reachable over your VPN and use -TallyHost with its address.
  Options: -TallyPort 9000  -Port 9123  -Token <secret>  (SalonOS must then send the same token)
#>
param(
  [string]$TallyHost = '127.0.0.1',
  [int]$TallyPort = 9000,
  [int]$Port = 9123,
  [string]$Token = '',
  [string[]]$AllowOrigin = @('https://digitalca.co.in','https://www.digitalca.co.in','http://localhost:8765','http://127.0.0.1:8765')
)

$ErrorActionPreference = 'Stop'
$version = '1.0'
$tallyUrl = "http://$($TallyHost):$TallyPort"
$prefix = "http://localhost:$Port/"   # 'localhost' needs no administrator rights on Windows

function Write-Line([string]$text, [string]$color = 'Gray') { Write-Host ("[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $text) -ForegroundColor $color }

function Send-Reply($ctx, [int]$status, [string]$body, [string]$type = 'application/json; charset=utf-8') {
  $res = $ctx.Response
  $origin = $ctx.Request.Headers['Origin']
  if ($origin -and ($AllowOrigin -contains $origin)) {
    $res.AddHeader('Access-Control-Allow-Origin', $origin)
    $res.AddHeader('Vary', 'Origin')
  }
  $res.AddHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  $res.AddHeader('Access-Control-Allow-Headers', 'Content-Type, X-SalonOS-Token')
  $res.AddHeader('Access-Control-Allow-Private-Network', 'true')
  $res.AddHeader('Access-Control-Max-Age', '600')
  $res.StatusCode = $status
  $res.ContentType = $type
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
  $res.ContentLength64 = $bytes.Length
  $res.OutputStream.Write($bytes, 0, $bytes.Length)
  $res.OutputStream.Close()
}

function ConvertTo-JsonText($obj) { return ($obj | ConvertTo-Json -Compress -Depth 5) }

function Invoke-Tally([string]$xml) {
  $req = [System.Net.HttpWebRequest]::Create($tallyUrl)
  $req.Method = 'POST'
  $req.ContentType = 'text/xml; charset=utf-8'
  $req.Timeout = 60000
  $req.ReadWriteTimeout = 120000
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($xml)
  $req.ContentLength = $bytes.Length
  $s = $req.GetRequestStream(); $s.Write($bytes, 0, $bytes.Length); $s.Close()
  $resp = $req.GetResponse()
  $reader = New-Object System.IO.StreamReader($resp.GetResponseStream(), [System.Text.Encoding]::UTF8)
  $text = $reader.ReadToEnd(); $reader.Close(); $resp.Close()
  return $text
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
try { $listener.Start() } catch {
  Write-Line "Could not start on port $Port - is the connector already running in another window? ($($_.Exception.Message))" 'Red'
  Read-Host 'Press Enter to close'; exit 1
}

Write-Host ''
Write-Host "  SalonOS Tally Connector $version" -ForegroundColor Cyan
Write-Host "  Listening on   $prefix  (this computer only)"
Write-Host "  Tally at       $tallyUrl"
Write-Host "  Accepting      $($AllowOrigin -join ', ')"
if ($Token) { Write-Host '  Token          required' }
Write-Host '  Keep this window open while using Tally from SalonOS. Close it to stop.' -ForegroundColor Yellow
Write-Host ''

while ($listener.IsListening) {
  try { $ctx = $listener.GetContext() } catch { break }
  try {
    $req = $ctx.Request
    $origin = $req.Headers['Origin']
    if ($req.HttpMethod -eq 'OPTIONS') { Send-Reply $ctx 204 ''; continue }
    if ($origin -and -not ($AllowOrigin -contains $origin)) {
      Write-Line "Refused a request from $origin (not SalonOS)" 'DarkYellow'
      Send-Reply $ctx 403 (ConvertTo-JsonText @{ ok = $false; error = 'This connector only accepts requests from SalonOS.' }); continue
    }
    if ($Token -and $req.Headers['X-SalonOS-Token'] -ne $Token) {
      Send-Reply $ctx 401 (ConvertTo-JsonText @{ ok = $false; error = 'Wrong or missing connector token.' }); continue
    }
    $path = $req.Url.AbsolutePath.TrimEnd('/')
    if ($req.HttpMethod -eq 'GET' -and ($path -eq '' -or $path -eq '/status')) {
      $tallyOk = $false; $err = ''
      try { $null = Invoke-Tally '<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>SalonOSPing</ID></HEADER><BODY><DESC><TDL><TDLMESSAGE><COLLECTION NAME="SalonOSPing" ISINITIALIZE="Yes"><TYPE>Company</TYPE><FETCH>NAME</FETCH></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>'; $tallyOk = $true } catch { $err = $_.Exception.Message }
      Send-Reply $ctx 200 (ConvertTo-JsonText @{ ok = $true; connector = $version; tally = $tallyUrl; tallyReachable = $tallyOk; error = $err })
      continue
    }
    if ($req.HttpMethod -eq 'POST' -and $path -eq '/tally') {
      $reader = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)
      $xml = $reader.ReadToEnd(); $reader.Close()
      if (-not $xml.TrimStart().StartsWith('<ENVELOPE', [System.StringComparison]::OrdinalIgnoreCase)) {
        Send-Reply $ctx 400 (ConvertTo-JsonText @{ ok = $false; error = 'Only Tally XML envelopes are forwarded.' }); continue
      }
      try {
        $answer = Invoke-Tally $xml
        $kind = if ($xml -match '<TALLYREQUEST>\s*Import') { 'import' } else { 'export' }
        Write-Line "Forwarded a Tally $kind request ($([math]::Round($xml.Length/1024,1)) KB)" 'Green'
        Send-Reply $ctx 200 $answer 'text/xml; charset=utf-8'
      } catch {
        Write-Line "Tally did not answer: $($_.Exception.Message)" 'Red'
        Send-Reply $ctx 502 (ConvertTo-JsonText @{ ok = $false; error = "Tally is not reachable at $tallyUrl - is Tally open with a company loaded and its XML/ODBC server on port $TallyPort enabled? ($($_.Exception.Message))" })
      }
      continue
    }
    Send-Reply $ctx 404 (ConvertTo-JsonText @{ ok = $false; error = 'Unknown address.' })
  } catch {
    try { Send-Reply $ctx 500 (ConvertTo-JsonText @{ ok = $false; error = $_.Exception.Message }) } catch {}
  }
}
