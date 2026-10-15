@echo off
setlocal EnableExtensions
set "TARGET=%ProgramFiles%\INTUBATALK"
if not exist "%TARGET%" mkdir "%TARGET%" >NUL 2>&1
if not exist "%TARGET%" set "TARGET=%LOCALAPPDATA%\Programs\INTUBATALK"
if not exist "%TARGET%" mkdir "%TARGET%" >NUL 2>&1

xcopy "%~dp0payload\*" "%TARGET%\" /E /I /H /Y >NUL
if errorlevel 1 (
  echo INTUBATALK installation failed.
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$target=$env:TARGET; $ws=New-Object -ComObject WScript.Shell; $menu=[Environment]::GetFolderPath('Programs'); $dir=Join-Path $menu 'INTUBATALK'; New-Item -ItemType Directory -Force -Path $dir | Out-Null; $s=$ws.CreateShortcut((Join-Path $dir 'INTUBATALK.lnk')); $s.TargetPath=Join-Path $target 'INTUBATALK.exe'; $s.WorkingDirectory=$target; $s.IconLocation=Join-Path $target 'app.ico'; $s.Save(); $d=[Environment]::GetFolderPath('Desktop'); $s=$ws.CreateShortcut((Join-Path $d 'INTUBATALK.lnk')); $s.TargetPath=Join-Path $target 'INTUBATALK.exe'; $s.WorkingDirectory=$target; $s.IconLocation=Join-Path $target 'app.ico'; $s.Save()"

start "" "%TARGET%\INTUBATALK.exe"
exit /b 0
