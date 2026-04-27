$ErrorActionPreference = "Stop"

$frontendRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not $env:NEXT_PUBLIC_API_BASE_URL) {
  $env:NEXT_PUBLIC_API_BASE_URL = "http://127.0.0.1:8000"
}

Write-Host "Starting Cumulus frontend on http://127.0.0.1:3000"
Write-Host "Mode: production (fresh build before next start)"
Write-Host "API base URL: $env:NEXT_PUBLIC_API_BASE_URL"

Set-Location $frontendRoot

$portInUse = netstat -ano | Select-String "LISTENING" | Select-String ":3000\\s"
if ($portInUse) {
  throw "Port 3000 is already in use. Stop the existing local server before running the production helper."
}

cmd /c npm run build
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

$startScript = Join-Path $frontendRoot "scripts\\start-production.mjs"
if (-not (Test-Path $startScript)) {
  throw "Unable to locate production start script at $startScript"
}

node $startScript "--hostname" "0.0.0.0" "--port" "3000"
exit $LASTEXITCODE
