param(
  [ ValidateSet( 'win-x64', 'win-arm64', 'linux-x64', 'linux-arm64' ) ]
  [ string ]$Runtime = 'win-x64'
)

$projectPath = Join-Path $PSScriptRoot 'ElectronModLoader.csproj'
$outputPath = Join-Path $PSScriptRoot "dist\$Runtime"

dotnet publish $projectPath `
  --configuration Release `
  --runtime $Runtime `
  --self-contained true `
  -p:PublishSingleFile=true `
  --output $outputPath

if ( $LASTEXITCODE -ne 0 )
{
  exit $LASTEXITCODE
}

$modsOutput = Join-Path $outputPath 'mods'

New-Item -ItemType Directory -Force -Path $modsOutput | Out-Null

#Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'mods\_example-menu.js') -Destination $modsOutput -Force

Write-Host "Done: $outputPath"