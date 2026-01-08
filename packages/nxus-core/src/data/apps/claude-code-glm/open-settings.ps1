# Open Claude Code settings directory cross-platform
$claudeDir = Join-Path $HOME ".claude"

if (Test-Path $claudeDir) {
    Write-Host "Opening settings directory: $claudeDir"
    if ($IsLinux) {
        # Check for absolute path support in xdg-open
        xdg-open $claudeDir
    } elseif ($IsWindows) {
        explorer $claudeDir
    } else {
        # Fallback for MacOS or other systems
        Invoke-Item $claudeDir
    }
} else {
    Write-Error "Claude settings directory not found at $claudeDir"
    exit 1
}
