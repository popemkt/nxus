# Install GitHub CLI
# Description: Smart installation script for GitHub CLI (gh)
# Automatically detects OS and package manager

$ErrorActionPreference = "Stop"

function Write-Info { param($msg) Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Write-Success { param($msg) Write-Host "[SUCCESS] $msg" -ForegroundColor Green }
function Write-ErrorMsg { param($msg) Write-Host "[ERROR] $msg" -ForegroundColor Red }

if (Get-Command "gh" -ErrorAction SilentlyContinue) {
    Write-Info "GitHub CLI is already installed."
    gh --version
    exit 0
}

if ($IsLinux) {
    Write-Info "Detected Linux..."
    
    # Check for DNF (Fedora/RHEL/CentOS)
    if (Get-Command "dnf" -ErrorAction SilentlyContinue) {
        Write-Info "Detected DNF package manager."
        Write-Info "Adding GitHub CLI repo..."
        sudo dnf config-manager --add-repo https://cli.github.com/packages/rpm/gh-cli.repo
        Write-Info "Installing gh..."
        sudo dnf install -y gh
    }
    # Check for apt (Debian/Ubuntu)
    elseif (Get-Command "apt" -ErrorAction SilentlyContinue) {
        Write-Info "Detected APT package manager."
        # Minimal apt implementation
        sudo mkdir -p -m 755 /etc/apt/keyrings
        wget -qO- https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null
        sudo chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
        sudo apt update
        sudo apt install -y gh
    }
    else {
        Write-ErrorMsg "Unsupported Linux package manager. Please install manually."
        exit 1
    }

} elseif ($IsMacOS) {
    Write-Info "Detected macOS..."
    if (Get-Command "brew" -ErrorAction SilentlyContinue) {
        Write-Info "Installing via Homebrew..."
        brew install gh
    } else {
        Write-ErrorMsg "Homebrew not found. Please install Homebrew first."
        exit 1
    }

} elseif ($IsWindows) {
    Write-Info "Detected Windows..."
    if (Get-Command "winget" -ErrorAction SilentlyContinue) {
        Write-Info "Installing via Winget..."
        winget install --id GitHub.cli
    } else {
         Write-Info "Winget not found. Trying choco..."
         if (Get-Command "choco" -ErrorAction SilentlyContinue) {
             choco install gh
         } else {
             Write-ErrorMsg "No supported package manager found (winget/choco)."
             exit 1
         }
    }
} else {
    Write-ErrorMsg "Unsupported operating system."
    exit 1
}

# Verify installation
if (Get-Command "gh" -ErrorAction SilentlyContinue) {
    Write-Success "GitHub CLI installed successfully!"
    gh --version
} else {
    Write-ErrorMsg "Installation appeared to succeed but 'gh' command is not available."
    exit 1
}
