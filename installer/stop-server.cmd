@echo off
rem Stops only the Node server bundled with THIS app (matched by its
rem executable path), leaving any other Node process on the machine alone.
set "TARGET=%~dp0runtime\node.exe"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.ExecutablePath -eq $env:TARGET } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
exit /b 0
