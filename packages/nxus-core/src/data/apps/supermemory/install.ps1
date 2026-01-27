param(
    [string]$Path
)

# If Path is not provided, use default
if (-not $Path) {
    $Path = Join-Path $pwd "supermemory"
}

Write-Host "Cloning Supermemory to $Path..."
git clone https://github.com/supermemoryai/supermemory.git $Path

if ($LASTEXITCODE -eq 0) {
    Write-Host "Successfully cloned Supermemory."
} else {
    Write-Error "Failed to clone Supermemory."
    exit 1
}
