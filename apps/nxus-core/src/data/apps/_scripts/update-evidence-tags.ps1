# Script: Update Evidence Deployment Image Tags
# Description: Finds all evidence-related deployments in a K8s namespace and patches their container image tags
# Usage: ./update-evidence-tags.ps1 -Prefix <prefix> -Tag <tag> [-Tenant <rabobank|volksbank>] [-Namespace <ns>]

param (
    [Parameter(Mandatory = $true, HelpMessage = "Deployment name prefix (e.g. vkcrc)")]
    [string]$Prefix,

    [Parameter(Mandatory = $true, HelpMessage = "The image tag to set on all evidence containers")]
    [string]$Tag,

    [Parameter(Mandatory = $false, HelpMessage = "Tenant: rabobank or volksbank")]
    [ValidateSet("rabobank", "volksbank")]
    [string]$Tenant,

    [Parameter(Mandatory = $false, HelpMessage = "Kubernetes namespace")]
    [string]$Namespace = "force-mortgages-suite"
)

$ErrorActionPreference = "Stop"

function Write-Info { param($msg) Write-Host "ℹ $msg" -ForegroundColor Cyan }
function Write-Success { param($msg) Write-Host "✓ $msg" -ForegroundColor Green }
function Write-ErrorMsg { param($msg) Write-Host "✗ $msg" -ForegroundColor Red }

# Prompt for tenant if not provided
if (-not $Tenant) {
    Write-Host ""
    Write-Host "Select customer:" -ForegroundColor Cyan
    Write-Host "  1) rabobank"
    Write-Host "  2) volksbank"
    $choice = Read-Host "Enter choice (1/2)"
    switch ($choice) {
        "1" { $Tenant = "rabobank" }
        "2" { $Tenant = "volksbank" }
        default {
            Write-ErrorMsg "Invalid choice: $choice"
            exit 1
        }
    }
    Write-Info "Selected tenant: $Tenant"
}

# Check dependencies
if (-not (Get-Command "kubectl" -ErrorAction SilentlyContinue)) {
    Write-ErrorMsg "kubectl is not installed or not in PATH."
    exit 1
}

# 1. Find all deployments matching prefix-tenant + "evidence"
$DeploymentPrefix = "${Prefix}-${Tenant}"
Write-Info "Searching for evidence deployments in namespace: $Namespace (prefix: $DeploymentPrefix)"
$allDeployments = kubectl get deployments -n $Namespace -o jsonpath='{.items[*].metadata.name}' 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-ErrorMsg "Failed to list deployments: $allDeployments"
    exit 1
}

$deploymentNames = $allDeployments -split '\s+' | Where-Object {
    $_ -like "${DeploymentPrefix}*evidence*"
}

if ($deploymentNames.Count -eq 0) {
    Write-ErrorMsg "No deployments found matching '${DeploymentPrefix}*evidence*' in namespace $Namespace"
    exit 1
}

Write-Info "Found $($deploymentNames.Count) evidence deployment(s):"
foreach ($name in $deploymentNames) {
    Write-Host "  - $name" -ForegroundColor DarkGray
}

# 2. For each deployment, patch all container and initContainer image tags
foreach ($dep in $deploymentNames) {
    Write-Info "Patching deployment: $dep"

    # Get current deployment JSON
    $depJson = kubectl get deployment $dep -n $Namespace -o json 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-ErrorMsg "Failed to get deployment ${dep}: ${depJson}"
        continue
    }

    $depObj = $depJson | ConvertFrom-Json

    # Build patch for containers
    $containers = $depObj.spec.template.spec.containers
    $initContainers = $depObj.spec.template.spec.initContainers

    # Only patch containers whose name contains "evidence" — skip unrelated sidecars (e.g. wait-for-keycloak)
    $patchContainers = @()
    foreach ($c in $containers) {
        if ($c.name -notlike "*evidence*") { continue }
        $imageParts = $c.image.Trim() -split ':'
        $newImage = "$($imageParts[0]):$($Tag.Trim())"
        $patchContainers += @{ name = $c.name; image = $newImage }
    }

    $patchInit = @()
    if ($initContainers) {
        foreach ($ic in $initContainers) {
            if ($ic.name -notlike "*evidence*") { continue }
            $imageParts = $ic.image.Trim() -split ':'
            $newImage = "$($imageParts[0]):$($Tag.Trim())"
            $patchInit += @{ name = $ic.name; image = $newImage }
        }
    }

    $patch = @{
        spec = @{
            template = @{
                spec = @{
                    containers = $patchContainers
                }
            }
        }
    }

    if ($patchInit.Count -gt 0) {
        $patch.spec.template.spec.initContainers = $patchInit
    }

    $patchJson = $patch | ConvertTo-Json -Depth 10 -Compress

    kubectl patch deployment $dep -n $Namespace -p $patchJson 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-ErrorMsg "Failed to patch deployment $dep"
    } else {
        Write-Success "Patched $dep → tag: $Tag"
    }
}

Write-Success "Done! All evidence deployments updated to tag: $Tag"
