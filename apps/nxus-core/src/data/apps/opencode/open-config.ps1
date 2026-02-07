# Open OpenCode Configuration
# Description: Opens the OpenCode configuration file in the default editor

param()

$ErrorActionPreference = "Stop"

function Write-Info { param($msg) Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Write-ErrorMsg { param($msg) Write-Host "[ERROR] $msg" -ForegroundColor Red }

# Determine config file location
$configPaths = @(
    "$env:XDG_CONFIG_HOME/opencode/.opencode.json",
    "$HOME/.opencode.json",
    "$HOME/.config/opencode/.opencode.json"
)

$configFile = $null
foreach ($path in $configPaths) {
    if (Test-Path $path) {
        $configFile = $path
        break
    }
}

if (-not $configFile) {
    # Use default XDG config location
    $configDir = "$env:XDG_CONFIG_HOME/opencode"
    if (-not $configDir) {
        $configDir = "$HOME/.config/opencode"
    }

    if (-not (Test-Path $configDir)) {
        New-Item -ItemType Directory -Path $configDir -Force | Out-Null
    }

    $configFile = "$configDir/.opencode.json"

    # Create default config if it doesn't exist
    if (-not (Test-Path $configFile)) {
        Write-Info "Creating default configuration file..."
        @{
            providers = @{
                anthropic = @{
                    apiKey = ""
                    disabled = $false
                }
            }
            autoCompact = $true
        } | ConvertTo-Json -Depth 10 | Out-File -FilePath $configFile -Encoding utf8
    }
}

# Open the config file
Write-Info "Opening configuration file: $configFile"

if ($IsLinux -or $IsMacOS) {
    # Try common editors
    $editor = $env:EDITOR
    if (-not $editor) {
        if (Get-Command "code" -ErrorAction SilentlyContinue) {
            $editor = "code"
        } elseif (Get-Command "nano" -ErrorAction SilentlyContinue) {
            $editor = "nano"
        } elseif (Get-Command "vim" -ErrorAction SilentlyContinue) {
            $editor = "vim"
        } else {
            $editor = "cat"
        }
    }
    & $editor $configFile
} else {
    # Windows - use default associated editor
    Invoke-Item $configFile
}
