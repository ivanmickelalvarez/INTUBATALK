$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$testOutput = Join-Path $env:TEMP 'intubatalk-windows-mode-tests.exe'
$compilerCandidates = @(
    (Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'),
    (Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe')
)
$compiler = $compilerCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $compiler) { throw 'C# compiler csc.exe was not found. Install the .NET Framework 4.x developer tools.' }

Push-Location $repoRoot
try {
    & $compiler /nologo "/out:$testOutput" 'LauncherMode.cs' 'test\WindowsModeTests.cs'
    if ($LASTEXITCODE -ne 0) { throw "Mode test compilation failed with exit code $LASTEXITCODE." }
    $result = & $testOutput
    if ($LASTEXITCODE -ne 0) { throw "Mode tests failed with exit code $LASTEXITCODE." }
    $result | Write-Output
    if ($result -notmatch '^WINDOWS_MODE_TESTS_OK\s+22$') { throw 'Windows mode test output did not match the expected contract.' }
}
finally {
    Pop-Location
    Remove-Item -LiteralPath $testOutput -Force -ErrorAction SilentlyContinue
}
