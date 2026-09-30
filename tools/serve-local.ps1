# Serves this folder at http://localhost:8765/ for local testing (tests.html, the app itself).
# Read-only, localhost only, never serves anything outside the folder. Stop with Ctrl+C.
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\serve-local.ps1
# Note: opening index.html here registers the app's service worker for localhost:8765; unregister it
# (browser dev tools → Application → Service workers) before running tests.html — see HANDOFF.md.
param([string]$Root = (Split-Path $PSScriptRoot -Parent), [int]$Port = 8765)
$Root = (Resolve-Path $Root).Path.TrimEnd('\')
$l = New-Object System.Net.HttpListener
$l.Prefixes.Add("http://localhost:$Port/")
$l.Start()
Write-Host "Serving $Root on http://localhost:$Port/"
$types = @{ '.html'='text/html; charset=utf-8'; '.js'='application/javascript; charset=utf-8'; '.json'='application/json';
            '.png'='image/png'; '.svg'='image/svg+xml'; '.css'='text/css'; '.ts'='text/plain; charset=utf-8'; '.sql'='text/plain; charset=utf-8' }
while ($l.IsListening) {
  $c = $l.GetContext()
  try {
    if ($c.Request.HttpMethod -ne 'GET' -and $c.Request.HttpMethod -ne 'HEAD') { $c.Response.StatusCode = 405; continue }
    $p = [Uri]::UnescapeDataString($c.Request.Url.AbsolutePath.TrimStart('/'))
    if ($p -eq '') { $p = 'index.html' }
    $f = [IO.Path]::GetFullPath((Join-Path $Root $p))
    if (-not $f.StartsWith($Root + '\', [StringComparison]::OrdinalIgnoreCase)) { $c.Response.StatusCode = 403; continue }
    if (Test-Path -LiteralPath $f -PathType Leaf) {
      $b = [IO.File]::ReadAllBytes($f)
      $ext = [IO.Path]::GetExtension($f).ToLower()
      if ($types[$ext]) { $c.Response.ContentType = $types[$ext] }
      $c.Response.AddHeader('Cache-Control', 'no-store')
      $c.Response.OutputStream.Write($b, 0, $b.Length)
    } else { $c.Response.StatusCode = 404 }
  } finally { $c.Response.Close() }
}
