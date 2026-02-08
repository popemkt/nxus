# Bash Configuration Manager
# Interactive script for editing .bashrc or starting a bash session
param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("bashrc", "bash")]
    [string]$Mode
)

# If Mode not provided, prompt interactively
if (-not $Mode) {
    Write-Host ""
    Write-Host "==================================" -ForegroundColor Cyan
    Write-Host "  Bash Configuration Manager" -ForegroundColor Cyan
    Write-Host "==================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "What would you like to do?" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  [1] Edit .bashrc with vi" -ForegroundColor Green
    Write-Host "  [2] Start interactive bash session" -ForegroundColor Green
    Write-Host ""

    $choice = Read-Host "Enter your choice (1 or 2)"

    switch ($choice) {
        "1" { $Mode = "bashrc" }
        "2" { $Mode = "bash" }
        default {
            Write-Host ""
            Write-Host "Invalid choice. Please run the command again and select 1 or 2." -ForegroundColor Red
            exit 1
        }
    }
}

# Execute based on mode
# Use Start-Process to properly spawn interactive programs with TTY
switch ($Mode) {
    "bashrc" {
        Write-Host ""
        Write-Host "Opening ~/.bashrc in vi..." -ForegroundColor Cyan
        # Exit pwsh and let bash take over with vi
        $bashrcPath = [Environment]::GetFolderPath('UserProfile') + "/.bashrc"
        # Replace current process with vi to get proper TTY
        & bash -i -c "vi ~/.bashrc"
    }
    "bash" {
        Write-Host ""
        Write-Host "Starting interactive bash session..." -ForegroundColor Cyan
        # Replace current process with interactive bash
        & bash -i
    }
}
