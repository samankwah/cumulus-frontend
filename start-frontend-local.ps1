$ErrorActionPreference = "Stop"

$frontendRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not $env:NEXT_PUBLIC_API_BASE_URL) {
  $env:NEXT_PUBLIC_API_BASE_URL = "http://127.0.0.1:8000"
}

Write-Host "Starting Cumulus frontend on http://127.0.0.1:3000"
Write-Host "Mode: development"
Write-Host "API base URL: $env:NEXT_PUBLIC_API_BASE_URL"

Set-Location $frontendRoot
cmd /c npm run dev -- --hostname 0.0.0.0 --port 3000
