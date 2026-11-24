# Sets a new release version everywhere it must match, so browsers pick up the new code
# and show the "new version available" banner:
#   js/01-foundation.js  (const APP_VERSION)
#   version.json         (what running apps compare against)
#   index.html           (?v= on every js/ script tag = a fingerprint of that file's content)
# Usage (from the repo root):  powershell -File tools\bump-version.ps1 2026.10.01.1
param([Parameter(Mandatory = $true)][string]$Version)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$enc = New-Object System.Text.UTF8Encoding($false)

$f = Join-Path $root 'js\01-foundation.js'
$t = [IO.File]::ReadAllText($f, $enc)
$n = [regex]::Replace($t, "const APP_VERSION='[^']*';", "const APP_VERSION='$Version';")
if ($n -eq $t -and -not $t.Contains("const APP_VERSION='$Version';")) { throw 'APP_VERSION not found in js/01-foundation.js' }
[IO.File]::WriteAllText($f, $n, $enc)

[IO.File]::WriteAllText((Join-Path $root 'version.json'), "{`"version`":`"$Version`"}`n", $enc)

# ?v= is a fingerprint of each file's own content (first 10 hex of SHA-1), so a release only makes
# browsers download the files that actually changed; the rest stay in their cache. Identical
# content means an identical file, so old and new code still can't be mixed.
$sha = [Security.Cryptography.SHA1]::Create()
$h = Join-Path $root 'index.html'
$t = [IO.File]::ReadAllText($h, $enc)
$n = [regex]::Replace($t, '(<script src="(js/[^"?]+\.js))\?v=[^"]*"', {
  param($m)
  $bytes = [IO.File]::ReadAllBytes((Join-Path $root $m.Groups[2].Value))
  $hex = -join ($sha.ComputeHash($bytes)[0..4] | ForEach-Object { $_.ToString('x2') })
  $m.Groups[1].Value + '?v=' + $hex + '"'
})
[IO.File]::WriteAllText($h, $n, $enc)

"Version set to $Version"
