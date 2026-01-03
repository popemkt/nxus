# Script: Create GitHub Repo & Initialize Local Folder
# Description: Creates a new GitHub repository and sets up the local git folder
# Usage: ./create-repo.ps1 [-RepoName <name>] [-LocalFolder <path>]

param (
    [string]$RepoName,
    [string]$LocalFolder
)

$ErrorActionPreference = "Stop"

function Write-Info { param($msg) Write-Host "ℹ $msg" -ForegroundColor Cyan }
function Write-Success { param($msg) Write-Host "✓ $msg" -ForegroundColor Green }
function Write-Error { param($msg) Write-Host "✗ $msg" -ForegroundColor Red }

# Check dependencies
if (-not (Get-Command "gh" -ErrorAction SilentlyContinue)) {
    Write-Error "GitHub CLI (gh) is not installed."
    exit 1
}

# Check auth
if (-not (gh auth status *>&1 | Select-String "Logged in to")) {
    Write-Error "Not authenticated with GitHub CLI. Run 'gh auth login'."
    exit 1
}

# Interactive inputs if not provided
if ([string]::IsNullOrWhiteSpace($RepoName)) {
    $RepoName = Read-Host "Enter repository name"
}

if ([string]::IsNullOrWhiteSpace($LocalFolder)) {
    $LocalFolder = Read-Host "Enter local folder path"
}

# Resolve ~ to home if needed (simple check)
if ($LocalFolder.StartsWith("~")) {
    $LocalFolder = $LocalFolder.Replace("~", $HOME)
}
$LocalFolder = [System.IO.Path]::GetFullPath($LocalFolder)

Write-Info "Creating repository: $RepoName"
Write-Info "Local folder: $LocalFolder"

# Create GitHub Repo
Write-Info "Creating GitHub repository..."
try {
    gh repo create "$RepoName" --private --confirm
    Write-Success "Repository created on GitHub"
} catch {
    Write-Error "Failed to create repository: $_"
    exit 1
}

# Create local folder
if (-not (Test-Path $LocalFolder)) {
    Write-Info "Creating local folder..."
    New-Item -ItemType Directory -Path $LocalFolder -Force | Out-Null
    Write-Success "Folder created: $LocalFolder"
} else {
    Write-Info "Folder already exists"
}

Set-Location $LocalFolder

# Initialize git
if (-not (Test-Path ".git")) {
    Write-Info "Initializing git repository..."
    git init
    Write-Success "Git initialized"
} else {
    Write-Info "Git already initialized"
}

# Configure remote
$GH_USERNAME = gh api user --jq '.login'
$REMOTE_URL = "git@github.com:${GH_USERNAME}/${RepoName}.git"
Write-Info "Adding remote origin: $REMOTE_URL"

$existingRemote = git remote get-url origin 2>$null
if ($existingRemote) {
    Write-Info "Remote 'origin' already exists, updating..."
    git remote set-url origin "$REMOTE_URL"
} else {
    git remote add origin "$REMOTE_URL"
}
Write-Success "Remote origin configured"

# Initial commit
$hasCommits = git log 2>$null
if (-not $hasCommits) {
    Write-Info "Creating initial commit..."
    if (-not (Test-Path "README.md")) {
        "# $RepoName" | Out-File "README.md" -Encoding utf8
        Write-Info "Created README.md"
    }
    git add .
    git commit -m "Initial commit"
    Write-Success "Initial commit created"
}

# Push
Write-Info "Pushing to GitHub..."
git push -u origin main 2>$null
if ($LASTEXITCODE -ne 0) {
    git push -u origin master 2>$null
    if ($LASTEXITCODE -ne 0) {
         $currentBranch = git branch --show-current
         if ($currentBranch) {
             git push -u origin $currentBranch
             Write-Success "Pushed to GitHub (branch: $currentBranch)"
         } else {
             Write-Error "Failed to push to GitHub"
             exit 1
         }
    } else {
        Write-Success "Pushed to GitHub"
    }
} else {
    Write-Success "Pushed to GitHub"
}

Write-Success "All done! Repository setup complete."
Write-Info "Repository URL: https://github.com/${GH_USERNAME}/${RepoName}"
Write-Info "Local path: $LocalFolder"
