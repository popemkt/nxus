# Interactive Node Inspector

param(
    [string]$NodeId
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Resolve-Path "$PSScriptRoot/../../../.."

if (-not $NodeId) {
    Write-Host "`n🔍 Node Inspector" -ForegroundColor Cyan
    Write-Host "Examples: item:claude-code, supertag:inbox" -ForegroundColor DarkGray
    $NodeId = Read-Host "Enter node systemId or UUID"
}

Set-Location "$ProjectRoot/packages/nxus-core"
npx tsx scripts/inspect-node.ts $NodeId
