#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Smart installer for CLIProxyAPI (cross-platform)

.DESCRIPTION
    Detects OS and installs CLIProxyAPI using the appropriate method:
    - Linux: curl installer script
    - macOS: Homebrew
    - Windows: Downloads from GitHub releases
#>

# Detect OS
$IsLinuxOS = $IsLinux
$IsMacOS = $IsMacOS  
$IsWindowsOS = $IsWindows

Write-Host "=== CLIProxyAPI Installer ===" -ForegroundColor Cyan
Write-Host ""

if ($IsLinuxOS) {
    Write-Host "Detected: Linux" -ForegroundColor Green
    Write-Host "Installing via curl installer..." -ForegroundColor Yellow
    Write-Host ""
    
    $installCmd = "curl -fsSL https://raw.githubusercontent.com/brokechubb/cliproxyapi-installer/refs/heads/master/cliproxyapi-installer | bash"
    
    bash -c $installCmd
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✓ CLIProxyAPI installed successfully!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Next steps:" -ForegroundColor Cyan
        Write-Host "1. Add 'sk-dummy' to ~/cliproxyapi/config.yaml api-keys list"
        Write-Host "2. Authenticate with a provider (e.g., ./cli-proxy-api --claude-login)"
        Write-Host "3. Start the service: systemctl --user start cliproxyapi.service"
    } else {
        Write-Host "✗ Installation failed!" -ForegroundColor Red
        exit 1
    }
}
elseif ($IsMacOS) {
    Write-Host "Detected: macOS" -ForegroundColor Green
    Write-Host "Installing via Homebrew..." -ForegroundColor Yellow
    Write-Host ""
    
    # Check if Homebrew is installed
    if (-not (Get-Command brew -ErrorAction SilentlyContinue)) {
        Write-Host "✗ Homebrew not found!" -ForegroundColor Red
        Write-Host "Please install Homebrew first: https://brew.sh/" -ForegroundColor Yellow
        exit 1
    }
    
    brew install cliproxyapi
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✓ CLIProxyAPI installed successfully!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Next steps:" -ForegroundColor Cyan
        Write-Host "1. Configure API keys in config file"
        Write-Host "2. Authenticate with a provider (e.g., cli-proxy-api --claude-login)"
        Write-Host "3. Start the service: brew services start cliproxyapi"
    } else {
        Write-Host "✗ Installation failed!" -ForegroundColor Red
        exit 1
    }
}
elseif ($IsWindowsOS) {
    Write-Host "Detected: Windows" -ForegroundColor Green
    Write-Host "Downloading from GitHub releases..." -ForegroundColor Yellow
    Write-Host ""
    
    # Get latest release
    $releasesUrl = "https://api.github.com/repos/router-for-me/CLIProxyAPI/releases/latest"
    
    try {
        $release = Invoke-RestMethod -Uri $releasesUrl -ErrorAction Stop
        $version = $release.tag_name
        
        # Find Windows asset
        $asset = $release.assets | Where-Object { $_.name -like "*windows*.zip" -or $_.name -like "*win64*.zip" } | Select-Object -First 1
        
        if (-not $asset) {
            Write-Host "✗ Could not find Windows release asset!" -ForegroundColor Red
            Write-Host "Please download manually from: https://github.com/router-for-me/CLIProxyAPI/releases" -ForegroundColor Yellow
            exit 1
        }
        
        $downloadUrl = $asset.browser_download_url
        $fileName = $asset.name
        $installDir = "$env:USERPROFILE\cliproxyapi"
        $downloadPath = "$env:TEMP\$fileName"
        
        Write-Host "Downloading $fileName..." -ForegroundColor Yellow
        Invoke-WebRequest -Uri $downloadUrl -OutFile $downloadPath -ErrorAction Stop
        
        Write-Host "Extracting to $installDir..." -ForegroundColor Yellow
        
        # Create install directory
        if (Test-Path $installDir) {
            Remove-Item -Path $installDir -Recurse -Force
        }
        New-Item -ItemType Directory -Path $installDir -Force | Out-Null
        
        # Extract
        Expand-Archive -Path $downloadPath -DestinationPath $installDir -Force
        
        # Clean up
        Remove-Item -Path $downloadPath -Force
        
        Write-Host ""
        Write-Host "✓ CLIProxyAPI installed successfully to: $installDir" -ForegroundColor Green
        Write-Host ""
        Write-Host "Next steps:" -ForegroundColor Cyan
        Write-Host "1. Add $installDir to your PATH"
        Write-Host "2. Configure config.yaml in the installation directory"
        Write-Host "3. Run: cli-proxy-api.exe --claude-login (or other provider)"
        Write-Host "4. Run: cli-proxy-api.exe to start the server"
        
    } catch {
        Write-Host "✗ Download failed: $_" -ForegroundColor Red
        Write-Host "Please download manually from: https://github.com/router-for-me/CLIProxyAPI/releases" -ForegroundColor Yellow
        exit 1
    }
}
else {
    Write-Host "✗ Unknown operating system!" -ForegroundColor Red
    Write-Host "Please install manually from: https://github.com/router-for-me/CLIProxyAPI/releases" -ForegroundColor Yellow
    exit 1
}
