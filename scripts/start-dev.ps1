$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

Write-Host "Starting Soap Box Race Timer in development mode..." -ForegroundColor Cyan
Write-Host "Working directory: $repoRoot"
Write-Host "Command: npm run dev"
Write-Host ""

npm run dev
