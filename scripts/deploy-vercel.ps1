param(
  [string]$EnvFile = ".env",
  [switch]$Prod,
  [switch]$SkipVars
)

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }

# 1. Login
Write-Step "Checking Vercel login..."
$whoami = & vercel whoami 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "Not logged in. Run 'vercel login' first." -ForegroundColor Yellow
  & vercel login
}

# 2. Link project if not linked
if (-not (Test-Path -LiteralPath ".vercel\project.json")) {
  Write-Step "Linking project to Vercel..."
  & vercel link
}

# 3. Upload env vars from .env
if (-not $SkipVars) {
  if (-not (Test-Path $EnvFile)) {
    Write-Host "ERROR: $EnvFile not found!" -ForegroundColor Red
    exit 1
  }

  Write-Step "Uploading environment variables from $EnvFile..."
  $envVars = @{}
  Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"?(.*?)"?\s*$') {
      $name = $matches[1]
      $value = $matches[2] -replace '"$', ''
      if ($value) { $envVars[$name] = $value }
    }
  }

  $environments = @("production", "preview", "development")
  foreach ($name in $envVars.Keys) {
    $value = $envVars[$name]
    foreach ($env in $environments) {
      Write-Host "  Setting $name ($env)..."
      $value | & vercel env add $name $env --force 2>&1 | Out-Null
    }
  }
  Write-Host "  Done. $($envVars.Count) variables uploaded to production/preview/development." -ForegroundColor Green
}

# 4. Deploy
Write-Step "Deploying to Vercel..."
if ($Prod) {
  & vercel --prod
} else {
  & vercel
}

Write-Step "Done!"
