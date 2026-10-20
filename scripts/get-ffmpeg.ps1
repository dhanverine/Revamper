# Downloads the LGPL shared FFmpeg build into vendor/ffmpeg (not stored in the repo).
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$zip  = Join-Path $env:TEMP "revamper-ffmpeg.zip"
$url  = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-n9.0-latest-win64-lgpl-shared-9.0.zip"
Write-Host "Downloading FFmpeg (LGPL shared build)..."
Invoke-WebRequest $url -OutFile $zip
$tmp = Join-Path $env:TEMP "revamper-ffmpeg"
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
Expand-Archive $zip -DestinationPath $tmp
$dst = Join-Path $root "vendor\ffmpeg"
if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
New-Item -ItemType Directory -Force (Join-Path $root "vendor") | Out-Null
Move-Item (Get-ChildItem $tmp | Select-Object -First 1).FullName $dst
Remove-Item $zip -Force
Write-Host "Done: $dst\bin\ffmpeg.exe"
