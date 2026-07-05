param(
  [string]$DriveLetter = "",
  [string]$RootName = "ClawPanelPortable",
  [switch]$Keep
)

$ErrorActionPreference = "Stop"

function Find-FreeDriveLetter {
  foreach ($letter in @("Z", "Y", "X", "W", "V", "U", "T", "S", "R", "Q", "P")) {
    if (-not (Get-PSDrive -Name $letter -ErrorAction SilentlyContinue)) {
      return $letter
    }
  }
  throw "No free test drive letter found"
}

if ([string]::IsNullOrWhiteSpace($DriveLetter)) {
  $DriveLetter = Find-FreeDriveLetter
}
$DriveLetter = $DriveLetter.Replace(':', '').ToUpperInvariant()
if (Get-PSDrive -Name $DriveLetter -ErrorAction SilentlyContinue) {
  throw "Drive $DriveLetter already exists. Choose another DriveLetter."
}

$hostRoot = Join-Path $env:TEMP ("clawpanel-usb-smoke-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $hostRoot | Out-Null

try {
  $driveName = $DriveLetter + ":"
  $driveRoot = $DriveLetter + ":\"
  subst $driveName $hostRoot
  $usbRoot = Join-Path $driveRoot $RootName
  $dataDir = Join-Path $usbRoot "data"
  $panelDir = Join-Path $dataDir "clawpanel"
  $openclawDir = Join-Path $dataDir "openclaw"
  $hermesHome = Join-Path $dataDir "hermes"
  $openclawEngine = Join-Path $usbRoot "engines\openclaw"
  $hermesBin = Join-Path $usbRoot "engines\hermes\bin"
  $uvBin = Join-Path $usbRoot "runtimes\uv\bin"
  $gitCmd = Join-Path $usbRoot "runtimes\git\cmd"

  foreach ($dir in @($panelDir, $openclawDir, $hermesHome, $openclawEngine, $hermesBin, $uvBin, $gitCmd)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
  }

  @{
    mode = "portable"
    dataDir = "./data"
    enginesDir = "./engines"
    runtimesDir = "./runtimes"
  } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $usbRoot "portable.json") -Encoding UTF8

  @{
    accessPassword = "portable-smoke"
    engine = "openclaw"
  } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $panelDir "clawpanel.json") -Encoding UTF8

  '{ "gateway": { "port": 18789 }, "agents": { "main": { "name": "main" } } }' |
    Set-Content -LiteralPath (Join-Path $openclawDir "openclaw.json") -Encoding UTF8
  "model: smoke" | Set-Content -LiteralPath (Join-Path $hermesHome "config.yaml") -Encoding UTF8

  @(
    "@echo off",
    "echo openclaw portable smoke"
  ) | Set-Content -LiteralPath (Join-Path $openclawEngine "openclaw.cmd") -Encoding ASCII

  @(
    "@echo off",
    'if "%1"=="version" (',
    "  echo Hermes Agent v0.0.0-portable-smoke",
    "  exit /b 0",
    ")",
    'if "%1"=="--version" (',
    "  echo Hermes Agent v0.0.0-portable-smoke",
    "  exit /b 0",
    ")",
    'if "%1"=="gateway" (',
    '  if "%2"=="status" (',
    "    echo stopped",
    "    exit /b 0",
    "  )",
    ")",
    "echo hermes portable smoke",
    "exit /b 0"
  ) | Set-Content -LiteralPath (Join-Path $hermesBin "hermes.cmd") -Encoding ASCII

  @(
    "@echo off",
    "echo uv 0.0.0-portable-smoke"
  ) | Set-Content -LiteralPath (Join-Path $uvBin "uv.cmd") -Encoding ASCII

  @(
    "@echo off",
    "echo git version 0.0.0-portable-smoke"
  ) | Set-Content -LiteralPath (Join-Path $gitCmd "git.cmd") -Encoding ASCII

  $oldPortableRoot = $env:CLAWPANEL_PORTABLE_ROOT
  $oldHermesHome = $env:HERMES_HOME
  $oldUvToolDir = $env:UV_TOOL_DIR
  $oldUvToolBinDir = $env:UV_TOOL_BIN_DIR
  $oldUvCacheDir = $env:UV_CACHE_DIR
  $oldUvPythonInstallDir = $env:UV_PYTHON_INSTALL_DIR
  $oldPath = $env:PATH

  $env:CLAWPANEL_PORTABLE_ROOT = $usbRoot
  $env:HERMES_HOME = $hermesHome
  $env:UV_TOOL_DIR = Join-Path $usbRoot "engines\hermes"
  $env:UV_TOOL_BIN_DIR = $hermesBin
  $env:UV_CACHE_DIR = Join-Path $usbRoot "runtimes\uv\cache"
  $env:UV_PYTHON_INSTALL_DIR = Join-Path $usbRoot "runtimes\uv\python"
  $env:PATH = "$hermesBin;$openclawEngine;$uvBin;$gitCmd;$env:SystemRoot\System32"

  try {
    $hermesVersion = & hermes version
    $openclawVersion = & openclaw
    $gitVersion = & git --version
    $uvVersion = & uv --version
  } finally {
    $env:CLAWPANEL_PORTABLE_ROOT = $oldPortableRoot
    $env:HERMES_HOME = $oldHermesHome
    $env:UV_TOOL_DIR = $oldUvToolDir
    $env:UV_TOOL_BIN_DIR = $oldUvToolBinDir
    $env:UV_CACHE_DIR = $oldUvCacheDir
    $env:UV_PYTHON_INSTALL_DIR = $oldUvPythonInstallDir
    $env:PATH = $oldPath
  }

  [pscustomobject]@{
    ok = $true
    drive = $driveName
    usbRoot = $usbRoot
    hostRoot = $hostRoot
    hermes = ($hermesVersion -join "`n")
    openclaw = ($openclawVersion -join "`n")
    git = ($gitVersion -join "`n")
    uv = ($uvVersion -join "`n")
  } | ConvertTo-Json -Depth 4
} finally {
  if (-not $Keep) {
    subst $driveName /D 2>$null
    Remove-Item -LiteralPath $hostRoot -Recurse -Force -ErrorAction SilentlyContinue
  } else {
    Write-Host "Keeping test drive $driveName -> $hostRoot"
  }
}
