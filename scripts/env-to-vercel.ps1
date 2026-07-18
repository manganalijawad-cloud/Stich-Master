param(
  [string]$InputFile = ".env",
  [string]$OutputFile = ".env.vercel"
)

$lines = Get-Content $InputFile
$output = @()

foreach ($line in $lines) {
  if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"?(.*?)"?\s*$') {
    $name = $matches[1]
    $value = $matches[2] -replace '"$', ''
    if ($value) {
      $output += "$name=$value"
    }
  }
}

$output | Set-Content $OutputFile -Encoding UTF8
Write-Host "Created $OutputFile with $($output.Count) variables"
Write-Host "Upload it via Vercel dashboard: Project Settings > Environment Variables > Import .env File"
