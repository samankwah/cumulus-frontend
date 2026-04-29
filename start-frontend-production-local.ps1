param(
  [switch]$ForceRestart
)

$ErrorActionPreference = "Stop"

$frontendRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$workspaceRoot = Split-Path -Parent $frontendRoot
$localDevScript = Join-Path $workspaceRoot "scripts\local-dev.ps1"

. $localDevScript

Assert-CumulusPortAvailable -Port 3000 -Role frontend -ForceRestart:$ForceRestart

if (-not $env:NEXT_PUBLIC_API_BASE_URL) {
  $env:NEXT_PUBLIC_API_BASE_URL = "http://127.0.0.1:8000"
}

$nodePath = Get-CumulusCommandPath -Name "node"

Write-Host "Starting Cumulus frontend on http://127.0.0.1:3000"
Write-Host "Mode: production (fresh build before next start)"
Write-Host "Working directory: $frontendRoot"
Write-Host "Node executable: $nodePath"
Write-Host "API base URL: $env:NEXT_PUBLIC_API_BASE_URL"
Write-Host "PID/log file: foreground process; use Ctrl+C to stop"

Set-Location $frontendRoot

cmd /c npm run build
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

$startScript = Join-Path $frontendRoot "scripts\\start-production.mjs"
if (-not (Test-Path $startScript)) {
  throw "Unable to locate production start script at $startScript"
}

& $nodePath $startScript "--hostname" "0.0.0.0" "--port" "3000"
exit $LASTEXITCODE
