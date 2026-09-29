# Sets a new release version everywhere it must match, so browsers pick up the new code
# and show the "new version available" banner:
#   js/01-foundation.js  (const APP_VERSION)
#   version.json         (what running apps compare against)
#   index.html           (?v= on every js/ script tag, so old and new files are never mixed)
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

$h = Join-Path $root 'index.html'
$t = [IO.File]::ReadAllText($h, $enc)
$n = [regex]::Replace($t, '(<script src="js/[^"?]+\.js)\?v=[^"]*"', "`$1?v=$Version`"")
[IO.File]::WriteAllText($h, $n, $enc)

"Version set to $Version"
