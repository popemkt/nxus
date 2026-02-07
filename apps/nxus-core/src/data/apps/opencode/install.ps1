# Install OpenCode
# Description: Smart installation script for OpenCode AI coding agent
# Automatically detects OS and package manager

param(
    [switch]$Force
)

$ErrorActionPreference = "Stop"

function Write-Info { param($msg) Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Write-Success { param($msg) Write-Host "[SUCCESS] $msg" -ForegroundColor Green }
function Write-ErrorMsg { param($msg) Write-Host "[ERROR] $msg" -ForegroundColor Red }
function Write-Warn { param($msg) Write-Host "[WARN] $msg" -ForegroundColor Yellow }

if (-not $Force -and (Get-Command "opencode" -ErrorAction SilentlyContinue)) {
    Write-Info "OpenCode is already installed."
    opencode version
    exit 0
}

if ($IsLinux) {
    Write-Info "Detected Linux..."

    # Check for Homebrew (preferred for Linux)
    if (Get-Command "brew" -ErrorAction SilentlyContinue) {
        Write-Info "Installing via Homebrew..."
        brew install opencode-ai/tap/opencode
    }
    # Check for yay (Arch AUR)
    elseif (Get-Command "yay" -ErrorAction SilentlyContinue) {
        Write-Info "Installing via AUR (yay)..."
        yay -S opencode-ai-bin --noconfirm
    }
    # Check for paru (Arch AUR alternative)
    elseif (Get-Command "paru" -ErrorAction SilentlyContinue) {
        Write-Info "Installing via AUR (paru)..."
        paru -S opencode-ai-bin --noconfirm
    }
    # Check for Go (from source)
    elseif (Get-Command "go" -ErrorAction SilentlyContinue) {
        Write-Info "Installing via Go..."
        go install github.com/opencode-ai/opencode@latest
    }
    # Fallback to curl installer
    elseif (Get-Command "curl" -ErrorAction SilentlyContinue) {
        Write-Info "Installing via official installer script..."
        curl -fsSL https://opencode.ai/install | bash
    }
    else {
        Write-ErrorMsg "No supported installation method found. Please install manually from https://opencode.ai"
        exit 1
    }

} elseif ($IsMacOS) {
    Write-Info "Detected macOS..."
    if (Get-Command "brew" -ErrorAction SilentlyContinue) {
        Write-Info "Installing via Homebrew..."
        brew install opencode-ai/tap/opencode
    }
    elseif (Get-Command "go" -ErrorAction SilentlyContinue) {
        Write-Info "Installing via Go..."
        go install github.com/opencode-ai/opencode@latest
    }
    elseif (Get-Command "curl" -ErrorAction SilentlyContinue) {
        Write-Info "Installing via official installer script..."
        curl -fsSL https://opencode.ai/install | bash
    }
    else {
        Write-ErrorMsg "Homebrew, Go, or curl required. Please install manually from https://opencode.ai"
        exit 1
    }

} elseif ($IsWindows) {
    Write-Info "Detected Windows..."
    if (Get-Command "winget" -ErrorAction SilentlyContinue) {
        Write-Info "Installing via Winget..."
        winget install --id Charmbracelette.OpenCode -e --accept-source-agreements --accept-package-agreements
    }
    elseif (Get-Command "choco" -ErrorAction SilentlyContinue) {
        Write-Info "Installing via Chocolatey..."
        choco install opencode -y
    }
    elseif (Get-Command "go" -ErrorAction SilentlyContinue) {
        Write-Info "Installing via Go..."
        go install github.com/opencode-ai/opencode@latest
    }
    else {
        Write-ErrorMsg "No supported package manager found (winget/choco). Please install manually from https://opencode.ai"
        exit 1
    }
} else {
    Write-ErrorMsg "Unsupported operating system."
    exit 1
}

# Verify installation
if (Get-Command "opencode" -ErrorAction SilentlyContinue) {
    Write-Success "OpenCode installed successfully!"
    opencode version

    # Show next steps
    Write-Info ""
    Write-Info "Next steps:"
    Write-Info "1. Set up API keys (required):"
    Write-Info "   opencode auth login"
    Write-Info ""
    Write-Info "2. Or set environment variables:"
    Write-Info "   export ANTHROPIC_API_KEY='your-key'"
    Write-Info "   export OPENAI_API_KEY='your-key'"
    Write-Info ""
    Write-Info "3. Start using OpenCode:"
    Write-Info "   opencode"
} else {
    Write-ErrorMsg "Installation appeared to succeed but 'opencode' command is not available."
    Write-Info "Make sure the installation path is in your PATH."
    exit 1
}
