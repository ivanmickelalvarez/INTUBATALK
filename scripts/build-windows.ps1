param(
    [string]$OutputDirectory = 'release\windows'
)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$compilerCandidates = @(
    (Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'),
    (Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe')
)
$compiler = $compilerCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $compiler) { throw 'C# compiler csc.exe was not found. Install the .NET Framework 4.x developer tools.' }

$originFile = Join-Path $repoRoot 'app-origin.txt'
if (-not (Test-Path -LiteralPath $originFile)) {
    throw 'Release build needs app-origin.txt with the approved, controlled HTTPS origin. The preview origin is not configured as a release service.'
}
$originLines = @(Get-Content -LiteralPath $originFile)
if ($originLines.Count -ne 1 -or $originLines[0] -notmatch '^https://[^/]+/?$') {
    throw 'app-origin.txt must contain exactly one HTTPS origin line with no path, query, or fragment.'
}

$outputPath = Join-Path $repoRoot $OutputDirectory
$exePath = Join-Path $outputPath 'INTUBATALK.exe'
$payloadPath = Join-Path $repoRoot 'installer\payload'
New-Item -ItemType Directory -Path $outputPath -Force | Out-Null
Push-Location $repoRoot
try {
    & $compiler /nologo /target:winexe "/out:$exePath" '/win32icon:app.ico' '/reference:System.Windows.Forms.dll' '/reference:System.Drawing.dll' 'INTUBATALK-Launcher.cs' 'LauncherMode.cs'
    if ($LASTEXITCODE -ne 0) { throw "Windows executable compilation failed with exit code $LASTEXITCODE." }

    Copy-Item -LiteralPath $exePath -Destination (Join-Path $payloadPath 'INTUBATALK.exe') -Force
    Copy-Item -LiteralPath (Join-Path $repoRoot 'server.js') -Destination (Join-Path $payloadPath 'server.js') -Force
    Copy-Item -LiteralPath $originFile -Destination (Join-Path $payloadPath 'app-origin.txt') -Force
    $payloadPublic = Join-Path $payloadPath 'public'
    if (Test-Path -LiteralPath $payloadPublic) { Remove-Item -LiteralPath $payloadPublic -Recurse -Force }
    Copy-Item -LiteralPath (Join-Path $repoRoot 'public') -Destination $payloadPublic -Recurse -Force

    try { Copy-Item -LiteralPath $exePath -Destination (Join-Path $repoRoot 'INTUBATALK.exe') -Force }
    catch { Write-Warning 'The root INTUBATALK.exe is running and locked. The updated executable is staged in release/windows and installer/payload; close INTUBATALK to replace the root copy.' }
    Write-Output "WINDOWS_BUILD_OK $exePath"
}
finally { Pop-Location }
