#!/usr/bin/env pwsh
# setup-local-db.ps1
# Run after installing PostgreSQL to create users and databases.
# Usage: .\setup-local-db.ps1

Write-Host "Setting up local PostgreSQL databases for Payment Gateway..." -ForegroundColor Cyan

# Find psql
$pgPaths = @(
    "C:\Program Files\PostgreSQL\17\bin\psql.exe",
    "C:\Program Files\PostgreSQL\16\bin\psql.exe",
    "C:\Program Files\PostgreSQL\15\bin\psql.exe"
)
$psql = $pgPaths | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $psql) {
    # Try PATH
    $psql = (Get-Command psql -ErrorAction SilentlyContinue)?.Source
}

if (-not $psql) {
    Write-Error "psql not found. Make sure PostgreSQL is installed."
    exit 1
}

Write-Host "Found psql at: $psql" -ForegroundColor Green

# Prompt for the postgres superuser password (set during installation)
$pgPassword = Read-Host "Enter the password you set for the 'postgres' superuser during installation" -AsSecureString
$pgPasswordPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($pgPassword)
)

$env:PGPASSWORD = $pgPasswordPlain

Write-Host "Creating user and databases..." -ForegroundColor Yellow
& $psql -U postgres -f "$PSScriptRoot\setup-local-db.sql" 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✓ Databases created!" -ForegroundColor Green
    Write-Host "`nNext steps:" -ForegroundColor Cyan
    Write-Host "  1. cd api"
    Write-Host "  2. npm run migrate"
    Write-Host "  3. npm run dev"
} else {
    Write-Host "`n✗ Something went wrong. Check the output above." -ForegroundColor Red
    Write-Host "You can also run setup-local-db.sql manually in pgAdmin." -ForegroundColor Yellow
}

$env:PGPASSWORD = $null
