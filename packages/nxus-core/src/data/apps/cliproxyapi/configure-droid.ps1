#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Configure Factory Droid to use CLIProxyAPI

.DESCRIPTION
    Adds Claude models from CLIProxyAPI to Factory Droid's config.json
#>

param(
    [Parameter(Mandatory=$false, HelpMessage="Add Gemini models")]
    [switch]$IncludeGemini,
    
    [Parameter(Mandatory=$false, HelpMessage="Add Codex/GPT models")]
    [switch]$IncludeCodex,
    
    [Parameter(Mandatory=$false, HelpMessage="API key to use (default: sk-dummy)")]
    [string]$ApiKey = "sk-dummy"
)

$configPath = "$HOME/.factory/config.json"

Write-Host "=== Factory Droid CLIProxyAPI Configuration ===" -ForegroundColor Cyan
Write-Host ""

# Check if Droid config exists
if (-not (Test-Path $configPath)) {
    Write-Host "✗ Factory Droid config not found at: $configPath" -ForegroundColor Red
    Write-Host "Please ensure Factory Droid is installed first." -ForegroundColor Yellow
    exit 1
}

# Read existing config
try {
    $config = Get-Content $configPath -Raw | ConvertFrom-Json -ErrorAction Stop
} catch {
    Write-Host "✗ Failed to parse config.json: $_" -ForegroundColor Red
    exit 1
}

# Ensure custom_models array exists
if (-not $config.custom_models) {
    $config | Add-Member -NotePropertyName "custom_models" -NotePropertyValue @() -Force
}

# Claude models to add
$claudeModels = @(
    @{
        model = "claude-sonnet-4-5-20250929"
        base_url = "http://127.0.0.1:8317"
        api_key = $ApiKey
        provider = "anthropic"
    },
    @{
        model = "claude-opus-4-5-20251101"
        base_url = "http://127.0.0.1:8317"
        api_key = $ApiKey
        provider = "anthropic"
    },
    @{
        model = "claude-opus-4-1-20250805"
        base_url = "http://127.0.0.1:8317"
        api_key = $ApiKey
        provider = "anthropic"
    },
    @{
        model = "claude-sonnet-4-20250514"
        base_url = "http://127.0.0.1:8317"
        api_key = $ApiKey
        provider = "anthropic"
    }
)

Write-Host "Adding Claude models..." -ForegroundColor Yellow

# Remove existing CLIProxyAPI models (cleanup)
$config.custom_models = @($config.custom_models | Where-Object { 
    $_.base_url -ne "http://127.0.0.1:8317" -and 
    $_.base_url -ne "http://127.0.0.1:8317/v1" 
})

# Add Claude models
foreach ($model in $claudeModels) {
    $config.custom_models += $model
    Write-Host "  ✓ Added: $($model.model)" -ForegroundColor Green
}

# Add Gemini models if requested
if ($IncludeGemini) {
    Write-Host "Adding Gemini models..." -ForegroundColor Yellow
    
    $geminiModels = @(
        @{
            model = "gemini-2.5-pro"
            base_url = "http://127.0.0.1:8317/v1"
            api_key = $ApiKey
            provider = "openai"
        },
        @{
            model = "gemini-2.5-flash"
            base_url = "http://127.0.0.1:8317/v1"
            api_key = $ApiKey
            provider = "openai"
        }
    )
    
    foreach ($model in $geminiModels) {
        $config.custom_models += $model
        Write-Host "  ✓ Added: $($model.model)" -ForegroundColor Green
    }
}

# Add Codex models if requested
if ($IncludeCodex) {
    Write-Host "Adding Codex/GPT models..." -ForegroundColor Yellow
    
    $codexModels = @(
        @{
            model = "gpt-5"
            base_url = "http://127.0.0.1:8317/v1"
            api_key = $ApiKey
            provider = "openai"
        },
        @{
            model = "gpt-5-codex"
            base_url = "http://127.0.0.1:8317/v1"
            api_key = $ApiKey
            provider = "openai"
        },
        @{
            model = "gpt-5(high)"
            base_url = "http://127.0.0.1:8317/v1"
            api_key = $ApiKey
            provider = "openai"
        }
    )
    
    foreach ($model in $codexModels) {
        $config.custom_models += $model
        Write-Host "  ✓ Added: $($model.model)" -ForegroundColor Green
    }
}

# Backup existing config
$backupPath = "$configPath.backup.$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Copy-Item $configPath $backupPath -Force
Write-Host ""
Write-Host "Backup saved to: $backupPath" -ForegroundColor Cyan

# Save updated config
try {
    $config | ConvertTo-Json -Depth 10 | Set-Content $configPath -ErrorAction Stop
    Write-Host ""
    Write-Host "✓ Configuration updated successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "1. Ensure CLIProxyAPI is running: systemctl --user status cliproxyapi.service"
    Write-Host "2. Restart Factory Droid to pick up new models"
    Write-Host "3. Select a Claude model in Droid and start coding!"
    
} catch {
    Write-Host "✗ Failed to save config: $_" -ForegroundColor Red
    Write-Host "Restoring backup..." -ForegroundColor Yellow
    Copy-Item $backupPath $configPath -Force
    exit 1
}
