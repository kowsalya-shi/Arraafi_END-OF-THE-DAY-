#!/usr/bin/env pwsh
# EOD System - API Server Startup Script

Write-Host "`n🚀 Starting EOD API Server..." -ForegroundColor Cyan
Write-Host ("=" * 80) -ForegroundColor Gray

# Set environment variables
$env:NODE_ENV = 'development'
$env:PORT = '8080'
$env:DATABASE_URL = 'postgresql://postgres:Shiny@08@localhost:5432/eod_db'
$env:SMTP_HOST = 'mail.arraafiinfotech.com'
$env:SMTP_PORT = '465'
$env:SMTP_USER = 'eod_reports@arraafiinfotech.com'
$env:SMTP_PASSWORD = 'EODweb@123#'
$env:SMTP_SSL = 'true'
$env:IT_MANAGER_EMAIL = 'waseem@arraafiinfotech.com'
$env:CEO_EMAIL = 'thaseenaka@arraafiinfotech.com'
$env:MANAGER_EMAIL = 'aap@arraafiinfotech.com'
$env:TL_EMAILS = 'rajshekar@arraafiinfotech.com,javed@arraafiinfotech.com,soubhagya@arraafiinfotech.com,amita@arraafiinfotech.com'

Write-Host "✅ Environment variables loaded" -ForegroundColor Green
Write-Host "📊 Configuration:" -ForegroundColor Yellow
Write-Host "   Port: $($env:PORT)" -ForegroundColor White
Write-Host "   Database: eod_db" -ForegroundColor White
Write-Host "   SMTP: $($env:SMTP_HOST):$($env:SMTP_PORT)" -ForegroundColor White
Write-Host ""

# Navigate to API server directory
Set-Location -Path "artifacts\api-server"

# Check if dist folder exists, if not build first
if (-not (Test-Path "dist\index.mjs")) {
    Write-Host "📦 Building API server..." -ForegroundColor Yellow
    pnpm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Build failed!" -ForegroundColor Red
        exit 1
    }
}

Write-Host "🚀 Starting server on http://localhost:8080" -ForegroundColor Green
Write-Host ("=" * 80) -ForegroundColor Gray
Write-Host ""

# Start the server
node --enable-source-maps .\dist\index.mjs
