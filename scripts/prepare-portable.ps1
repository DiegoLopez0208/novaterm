[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$version = (Get-Content -LiteralPath (Join-Path $repo 'package.json') -Raw | ConvertFrom-Json).version
$bundle = Join-Path $repo 'src-tauri\target\release\bundle'
$stage = Join-Path $bundle 'portable'
New-Item -ItemType Directory -Path $stage -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $repo 'src-tauri\target\release\app.exe') -Destination (Join-Path $stage 'NovaTerm.exe')
$licenses = Join-Path $stage 'licenses'
New-Item -ItemType Directory -Path $licenses -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $repo 'LICENSE') -Destination $licenses
Copy-Item -LiteralPath (Join-Path $repo 'src\assets\fonts\LICENSE-NovaMono.md') -Destination $licenses
Copy-Item -LiteralPath (Join-Path $repo 'src\assets\fonts\LICENSE-SymbolsNerdFont.txt') -Destination $licenses
$archive = Join-Path $bundle "novaterm_${version}_windows_x64.zip"
Compress-Archive -LiteralPath (Join-Path $stage 'NovaTerm.exe'),$licenses -DestinationPath $archive -Force
Write-Output "Prepared $archive"
