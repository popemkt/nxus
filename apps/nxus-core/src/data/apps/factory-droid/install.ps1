[CmdletBinding()]
param()

# Detect OS and install Factory Droid
$ErrorActionPreference = 'Stop'

function Install-FactoryDroid {
    if ($IsWindows -or $env:OS -eq 'Windows_NT') {
        Write-Host "Detected Windows - Installing Factory Droid..." -ForegroundColor Cyan
        try {
            Invoke-RestMethod https://app.factory.ai/cli/windows | Invoke-Expression
        }
        catch {
            Write-Error "Failed to install: $_"
            exit 1
        }
    }
    elseif ($IsMacOS -or $IsLinux) {
        Write-Host "Detected $($IsMacOS ? 'macOS' : 'Linux') - Installing Factory Droid..." -ForegroundColor Cyan
        try {
            bash -c 'curl -fsSL https://app.factory.ai/cli | sh'
        }
        catch {
            Write-Error "Failed to install: $_"
            exit 1
        }
    }
    else {
        Write-Error "Unsupported operating system"
        exit 1
    }
}

Install-FactoryDroid
Write-Host "`nInstallation complete! Run 'droid' to start." -ForegroundColor Green
