param([Parameter(Mandatory = $true)][string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
Push-Location (Join-Path $PSScriptRoot '..\packages\launcher')
try {
    & npm pack --json --pack-destination $OutputDirectory
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally { Pop-Location }
