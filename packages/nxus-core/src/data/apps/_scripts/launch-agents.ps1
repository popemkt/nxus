param (
    [string]$cwd = "."
)

# 1. Resolve absolute path for CWD
$absoluteCwd = Resolve-Path $cwd
$configName = "agents"

# 2. Detect OS and set Warp configuration path
$warpConfigPath = ""
if ($IsMacOS) {
    $warpConfigPath = Join-Path $HOME ".warp/launch_configurations"
} elseif ($IsLinux) {
    # Check both common locations for Linux
    $primaryPath = Join-Path $HOME ".local/share/warp-terminal/launch_configurations"
    $secondaryPath = Join-Path $HOME ".warp/launch_configurations"
    
    if (Test-Path $primaryPath) {
        $warpConfigPath = $primaryPath
    } else {
        $warpConfigPath = $secondaryPath
    }
} elseif ($IsWindows) {
    $warpConfigPath = Join-Path $env:APPDATA "warp/Warp/data/launch_configurations"
}

# 3. Create directory if missing
if (-not (Test-Path $warpConfigPath)) {
    New-Item -ItemType Directory -Force -Path $warpConfigPath | Out-Null
}

# 4. Prepare the configuration file
$scriptDir = Split-Path $PSCommandPath
$templateFile = Join-Path $scriptDir "agents.yaml"
$targetFile = Join-Path $warpConfigPath "$configName.yaml"

if (-not (Test-Path $templateFile)) {
    Write-Error "Template file not found at $templateFile"
    exit 1
}

# 5. Inject CWD and copy
$content = Get-Content $templateFile -Raw
$processedContent = $content -replace "{{CWD}}", $absoluteCwd.ToString().Replace('\', '/')
$processedContent | Set-Content $targetFile -NoNewline

# 6. Trigger Warp launch
Write-Host "Launching Warp with agents in: $absoluteCwd"
$uri = "warp://launch/$configName"

if ($IsMacOS) {
    Start-Process "open" $uri
} elseif ($IsLinux) {
    Start-Process "xdg-open" $uri
} elseif ($IsWindows) {
    Start-Process $uri
}
