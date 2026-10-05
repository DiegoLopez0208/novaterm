[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][ValidateRange(1, 2147483647)][int]$ProcessId,
    [ValidateRange(2, 3600)][int]$DurationSeconds = 60,
    [ValidateRange(250, 10000)][int]$IntervalMilliseconds = 1000,
    [string]$Scenario = 'idle-foreground',
    [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\benchmark-results')
)

$ErrorActionPreference = 'Stop'
$rootProcess = Get-Process -Id $ProcessId
$rootStarted = $rootProcess.StartTime
$rootExecutable = $rootProcess.Path
$repoPath = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$revision = git -C $repoPath rev-parse HEAD
$dirty = [bool](git -C $repoPath status --porcelain)
$logicalProcessors = [Environment]::ProcessorCount
$runName = '{0}-{1}' -f (Get-Date -Format 'yyyyMMdd-HHmmss-fff'), $ProcessId
$runDirectory = Join-Path $OutputDirectory $runName
New-Item -ItemType Directory -Path $runDirectory -Force | Out-Null

$metadata = [ordered]@{
    scenario = $Scenario
    startedUtc = [DateTime]::UtcNow.ToString('o')
    commit = $revision
    dirtyWorkingTree = $dirty
    rootProcessId = $ProcessId
    executable = $rootExecutable
    executableSha256 = (Get-FileHash -LiteralPath $rootExecutable -Algorithm SHA256).Hash
    rootStartedUtc = $rootStarted.ToUniversalTime().ToString('o')
    os = [Environment]::OSVersion.VersionString
    logicalProcessors = $logicalProcessors
    durationSeconds = $DurationSeconds
    intervalMilliseconds = $IntervalMilliseconds
    cpuPercentDefinition = 'CPU seconds / elapsed seconds * 100; 100 is one logical core'
    scope = 'Root and its descendants only. App/WebView2 and shell/workload totals are separate.'
    stopReason = 'duration-reached'
}

$samples = [System.Collections.Generic.List[object]]::new()
$totals = [System.Collections.Generic.List[object]]::new()
$known = @{}
$previousCpu = @{}
$runtimeVersions = @{}
$clock = [Diagnostics.Stopwatch]::StartNew()
$lastSampleTime = 0.0
$first = $true

while ($clock.Elapsed.TotalSeconds -lt $DurationSeconds) {
    # Do not read command lines: shell arguments can contain credentials.
    $snapshot = @(Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,Name,CreationDate,KernelModeTime,UserModeTime,WorkingSetSize,PrivatePageCount,ThreadCount,HandleCount,ExecutablePath)
    $root = $snapshot | Where-Object { $_.ProcessId -eq $ProcessId } | Select-Object -First 1
    if (!$root -or [Math]::Abs(($root.CreationDate - $rootStarted).TotalSeconds) -gt 1) {
        $metadata.stopReason = 'root-exited'
        break
    }

    # Retain descendants whose parents exited; reject reused PIDs by creation time.
    $members = @{}
    $members[$ProcessId] = $root
    foreach ($process in $snapshot) {
        $id = [int]$process.ProcessId
        if ($known.ContainsKey($id) -and $known[$id] -eq $process.CreationDate) {
            $members[$id] = $process
        }
    }
    do {
        $added = $false
        foreach ($process in $snapshot) {
            $id = [int]$process.ProcessId
            $parentId = [int]$process.ParentProcessId
            if (!$members.ContainsKey($id) -and $members.ContainsKey($parentId) -and
                $process.CreationDate -ge $members[$parentId].CreationDate) {
                $members[$id] = $process
                $added = $true
            }
        }
    } while ($added)

    $now = $clock.Elapsed.TotalSeconds
    $elapsed = $now - $lastSampleTime
    $lastSampleTime = $now
    $rows = @()
    foreach ($process in $members.Values) {
        $id = [int]$process.ProcessId
        $known[$id] = $process.CreationDate
        $key = '{0}:{1}' -f $id, $process.CreationDate.Ticks
        $cpuSeconds = ([double]$process.KernelModeTime + [double]$process.UserModeTime) / 10000000
        $cpuPercent = $null
        if ($previousCpu.ContainsKey($key) -and $elapsed -gt 0) {
            $cpuPercent = [Math]::Max(0, ($cpuSeconds - $previousCpu[$key]) / $elapsed * 100)
        }
        $previousCpu[$key] = $cpuSeconds
        $group = if ($id -eq $ProcessId -or $process.Name -eq 'msedgewebview2.exe') { 'app' } else { 'workload' }
        if ($process.Name -eq 'msedgewebview2.exe' -and $process.ExecutablePath -and
            !$runtimeVersions.ContainsKey($process.ExecutablePath)) {
            $runtimeVersions[$process.ExecutablePath] = (Get-Item -LiteralPath $process.ExecutablePath).VersionInfo.FileVersion
        }
        $row = [pscustomobject]@{
            elapsedSeconds = $now
            processId = $id
            parentProcessId = $process.ParentProcessId
            name = $process.Name
            group = $group
            cpuPercentOneCore = $cpuPercent
            privateBytes = [long]$process.PrivatePageCount
            workingSetBytes = [long]$process.WorkingSetSize
            threads = [int]$process.ThreadCount
            handles = [int]$process.HandleCount
        }
        $samples.Add($row)
        $rows += $row
    }
    foreach ($group in @('app', 'workload')) {
        $groupRows = @($rows | Where-Object { $_.group -eq $group })
        $cpu = if ($first) { $null } else { ($groupRows | Measure-Object cpuPercentOneCore -Sum).Sum }
        $totals.Add([pscustomobject]@{
            elapsedSeconds = $now
            group = $group
            processes = $groupRows.Count
            cpuPercentOneCore = $cpu
            cpuPercentMachine = if ($null -eq $cpu) { $null } else { $cpu / $logicalProcessors }
            privateBytes = ($groupRows | Measure-Object privateBytes -Sum).Sum
            workingSetBytes = ($groupRows | Measure-Object workingSetBytes -Sum).Sum
            threads = ($groupRows | Measure-Object threads -Sum).Sum
            handles = ($groupRows | Measure-Object handles -Sum).Sum
        })
    }
    $first = $false
    Start-Sleep -Milliseconds $IntervalMilliseconds
}

$metadata.webView2Versions = $runtimeVersions
$metadata.actualDurationSeconds = $clock.Elapsed.TotalSeconds
$metadata.processRows = $samples.Count
# Keep CSV decimals portable across machines with different regional settings.
foreach ($row in @($samples.ToArray()) + @($totals.ToArray())) {
    foreach ($property in $row.PSObject.Properties) {
        if ($property.Value -is [double]) {
            $property.Value = $property.Value.ToString('R', [Globalization.CultureInfo]::InvariantCulture)
        }
    }
}
$samples | Export-Csv -LiteralPath (Join-Path $runDirectory 'processes.csv') -NoTypeInformation -Encoding UTF8
$totals | Export-Csv -LiteralPath (Join-Path $runDirectory 'totals.csv') -NoTypeInformation -Encoding UTF8
$metadata | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $runDirectory 'metadata.json') -Encoding UTF8
Write-Output "Resource samples saved to $runDirectory"
