param(
    [ValidateSet('git-branch', 'git-changes', 'json-tools', 'timestamp-tools', 'output-inspector', 'command-snippets', 'output-explainer')]
    [string[]]$Name = @('git-branch', 'git-changes', 'json-tools', 'timestamp-tools', 'output-inspector', 'command-snippets', 'output-explainer'),
    [string]$Destination = (Join-Path $env:USERPROFILE '.novaterm/plugins')
)
$ErrorActionPreference = 'Stop'
$examples = Join-Path $PSScriptRoot '../examples/plugins'
foreach ($example in $Name) {
    $source = Join-Path $examples $example
    $manifest = Get-Content -LiteralPath (Join-Path $source 'plugin.toml') -Raw
    if ($manifest -notmatch '(?m)^id = "([a-z0-9-]+)"') { throw "Missing safe plugin ID: $example" }
    $target = Join-Path $Destination $Matches[1]
    if (Test-Path -LiteralPath $target) { Write-Warning "Preserving existing plugin: $target"; continue }
    New-Item -ItemType Directory -Path $Destination -Force | Out-Null
    Copy-Item -LiteralPath $source -Destination $target -Recurse
    Write-Output "Installed $example at $target"
}
Write-Output 'Restart NovaTerm, then approve the required capabilities in Settings > Plugins & AI.'
