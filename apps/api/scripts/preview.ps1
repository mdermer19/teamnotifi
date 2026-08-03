# Local preview of the web report flow.
#
# Starts a throwaway Postgres in Docker, applies migrations, seeds fake data,
# builds the dashboard, starts the API, and prints links you can open on your
# laptop or your phone.
#
# Nothing here touches production: separate database, separate port, and fake
# Twilio credentials so no text message can ever be sent.
#
#   cd apps\api
#   .\scripts\preview.ps1
#
# Press Ctrl+C to stop. Run .\scripts\preview.ps1 -Stop to remove the database.

param([switch]$Stop)

# Deliberately NOT 'Stop': native commands like docker write ordinary notices
# to stderr, which Windows PowerShell would otherwise treat as fatal errors.
$ErrorActionPreference = 'Continue'

$Port = 3999
$DbUrl = 'postgresql://test:test@localhost:55432/teamnotifi_preview'
$ApiDir = Split-Path $PSScriptRoot -Parent
$DashDir = Join-Path (Split-Path $ApiDir -Parent) 'dashboard'
$Container = 'teamnotifi-preview-db'

function Remove-PreviewDb {
  docker rm -f $Container | Out-Null
  $global:LASTEXITCODE = 0
}

if ($Stop) {
  Remove-PreviewDb
  Write-Host 'Preview database removed.' -ForegroundColor Green
  exit 0
}

# --- Docker ------------------------------------------------------------------
docker info | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host ''
  Write-Host 'Docker is not running.' -ForegroundColor Red
  Write-Host 'Open Docker Desktop, wait for it to finish starting, then run this again.'
  exit 1
}

Write-Host 'Starting preview database...' -ForegroundColor Cyan
Remove-PreviewDb
docker run -d --name $Container -e POSTGRES_PASSWORD=test -e POSTGRES_USER=test -e POSTGRES_DB=teamnotifi_preview -p 55432:5432 postgres:16-alpine | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Could not start the preview database.' -ForegroundColor Red
  exit 1
}

$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  docker exec $Container pg_isready -U test | Out-Null
  if ($LASTEXITCODE -eq 0) { $ready = $true; break }
  Start-Sleep -Seconds 2
}
if (-not $ready) {
  Write-Host 'The preview database did not come up in time.' -ForegroundColor Red
  exit 1
}

# --- Schema + data -----------------------------------------------------------
Push-Location $ApiDir
$env:DATABASE_URL = $DbUrl

Write-Host 'Applying database migrations...' -ForegroundColor Cyan
npx prisma migrate deploy | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host 'Migrations failed.' -ForegroundColor Red; Pop-Location; exit 1 }

Write-Host 'Seeding preview data...' -ForegroundColor Cyan
node scripts/seed-preview.js
if ($LASTEXITCODE -ne 0) { Write-Host 'Seeding failed.' -ForegroundColor Red; Pop-Location; exit 1 }

# --- Dashboard build ---------------------------------------------------------
Write-Host 'Building the web pages...' -ForegroundColor Cyan
Push-Location $DashDir
npm run build | Out-Null
$buildOk = ($LASTEXITCODE -eq 0)
Pop-Location
if (-not $buildOk) { Write-Host 'Build failed.' -ForegroundColor Red; Pop-Location; exit 1 }

# --- API ---------------------------------------------------------------------
# Fake but well-formed Twilio credentials: the client constructs fine and every
# send fails harmlessly, so a preview can never text a real person.
$env:PORT = "$Port"
$env:NODE_ENV = 'preview'
$env:API_BASE_URL = "http://localhost:$Port"
$env:PUBLIC_BASE_URL = "http://localhost:$Port"
$env:TWILIO_ACCOUNT_SID = 'AC00000000000000000000000000000000'
$env:TWILIO_AUTH_TOKEN = '00000000000000000000000000000000'
$env:TWILIO_PHONE_NUMBER = '+15550000000'
if (-not $env:CLERK_SECRET_KEY) { $env:CLERK_SECRET_KEY = 'sk_test_preview_placeholder' }

Write-Host 'Starting the app...' -ForegroundColor Cyan
$api = Start-Process node -ArgumentList 'src/index.js' -PassThru -NoNewWindow

$up = $false
for ($i = 0; $i -lt 60; $i++) {
  try {
    Invoke-RestMethod "http://localhost:$Port/health" -TimeoutSec 2 | Out-Null
    $up = $true; break
  } catch { Start-Sleep -Milliseconds 500 }
}
if (-not $up) {
  Write-Host 'The app did not start.' -ForegroundColor Red
  Stop-Process -Id $api.Id -Force -ErrorAction SilentlyContinue
  Pop-Location
  exit 1
}

# --- Mint one link per scenario ---------------------------------------------
function New-Link($fromPhone) {
  # Invoke-WebRequest, not Invoke-RestMethod: the reply is TwiML, and
  # Invoke-RestMethod would parse it into an XML object the regex can't read.
  $r = Invoke-WebRequest "http://localhost:$Port/webhook/sms" -Method Post -Body @{
    From = $fromPhone; Body = 'preview'; MessageSid = "SM$(Get-Random)"
  } -UseBasicParsing
  if ($r.Content -match '/r/([A-Za-z0-9_-]+)') { return $Matches[1] }
  return $null
}

# One link per seeded employee. Reusing a single employee would hit the
# repeat-text dedupe window and only the first link would come back.
$t1 = New-Link '+15550001111'
$t2 = New-Link '+15550001112'
$t3 = New-Link '+15550001113'

# Use the adapter that actually carries internet traffic. Picking the first
# non-loopback address tends to grab a Hyper-V/WSL virtual adapter, which the
# phone cannot reach.
$lan = $null
$route = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue |
  Sort-Object RouteMetric | Select-Object -First 1
if ($route) {
  $lan = (Get-NetIPAddress -InterfaceIndex $route.InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike '127.*' } | Select-Object -First 1).IPAddress
}

Write-Host ''
Write-Host '=========================================================' -ForegroundColor Green
Write-Host '  Preview is running' -ForegroundColor Green
Write-Host '=========================================================' -ForegroundColor Green
Write-Host ''
Write-Host '  On this computer:' -ForegroundColor White
Write-Host "    http://localhost:$Port/r/$t1"
Write-Host "    http://localhost:$Port/r/$t2"
Write-Host "    http://localhost:$Port/r/$t3"
Write-Host ''
if ($lan) {
  Write-Host '  On your PHONE (same Wi-Fi) - try this one:' -ForegroundColor Yellow
  Write-Host "    http://${lan}:$Port/r/$t1" -ForegroundColor Yellow
  Write-Host ''
  Write-Host '  If the phone cannot load it, Windows Firewall is blocking' -ForegroundColor DarkGray
  Write-Host "  port $Port. Use the laptop links instead." -ForegroundColor DarkGray
  Write-Host ''
}
Write-Host '  Each link is single-use. Re-run this script for fresh ones.' -ForegroundColor DarkGray
Write-Host '  No real text message can be sent from this preview.' -ForegroundColor DarkGray
Write-Host ''
Write-Host '  Press Ctrl+C to stop.' -ForegroundColor Green
Write-Host ''

try {
  Wait-Process -Id $api.Id
} finally {
  Stop-Process -Id $api.Id -Force -ErrorAction SilentlyContinue
  Pop-Location
  Write-Host ''
  Write-Host 'Stopped. Run .\scripts\preview.ps1 -Stop to remove the database.' -ForegroundColor Cyan
}
