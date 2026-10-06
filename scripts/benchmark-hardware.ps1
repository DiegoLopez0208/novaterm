$ErrorActionPreference = 'Stop'
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$os = Get-CimInstance Win32_OperatingSystem
[ordered]@{
    cpu = $cpu.Name.Trim()
    logicalProcessors = $cpu.NumberOfLogicalProcessors
    gpu = @(Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name)
    os = $os.Caption
    build = $os.BuildNumber
} | ConvertTo-Json -Depth 3
