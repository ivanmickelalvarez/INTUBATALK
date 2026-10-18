$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$installerFile = Join-Path $repoRoot 'installer\intubatalk.iss'
$outputFile = Join-Path $repoRoot 'installer\INTUBATALK-Setup-2.4.0.exe'
$compiler = Get-Command 'ISCC.exe' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -First 1
if (-not $compiler) {
    $candidates = @(
        (Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe'),
        (Join-Path $env:ProgramFiles 'Inno Setup 6\ISCC.exe')
    )
    $compiler = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}
if (-not $compiler) { throw 'ISCC.exe was not found. Install Inno Setup 6 before building the Windows installer.' }

Push-Location $repoRoot
try {
    & npm run windows:build
    if ($LASTEXITCODE -ne 0) { throw "Windows executable build failed with exit code $LASTEXITCODE." }
    & $compiler $installerFile
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $outputFile)) {
        throw "Inno Setup failed to create $outputFile."
    }
    $oldInstaller = Join-Path $repoRoot 'installer\INTUBATALK-Setup-2.3.0.exe'
    if (Test-Path -LiteralPath $oldInstaller) { Remove-Item -LiteralPath $oldInstaller -Force }
    Write-Output "WINDOWS_INSTALLER_OK $outputFile"
}
finally { Pop-Location }
