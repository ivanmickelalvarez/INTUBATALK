; INTUBATALK 2.2 — Windows installer script (Inno Setup 6)
; Installs the desktop launcher, the embedded Node.js runtime and the web app.
; Per-machine install to Program Files, with Start Menu shortcut and uninstaller.

#define AppName "INTUBATALK"
#define AppVersion "2.3.0"
#define AppPublisher "INTUBATALK ICU System"
#define AppExeName "INTUBATALK.exe"

[Setup]
AppId={{8E4B7C6A-52D1-4F9B-9E3A-1C7D2A9B5F01}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
OutputDir=.
OutputBaseFilename=INTUBATALK-Setup-2.3.0
SetupIconFile=..\app.ico
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
UninstallDisplayIcon={app}\{#AppExeName}
UninstallDisplayName={#AppName} {#AppVersion}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "..\installer\payload\INTUBATALK.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\installer\payload\runtime\node.exe"; DestDir: "{app}\runtime"; Flags: ignoreversion
Source: "..\installer\payload\server.js"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\installer\payload\public\*"; DestDir: "{app}\public"; Flags: ignoreversion recursesubdirs
Source: "..\app.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "stop-server.cmd"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExeName}"
Name: "{group}\{#AppName} Patient Tablet"; Filename: "{app}\{#AppExeName}"; Parameters: "--patient"
Name: "{group}\{#AppName} Nurse Dashboard"; Filename: "{app}\{#AppExeName}"; Parameters: "--nurse"
Name: "{group}\Uninstall {#AppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExeName}"; Description: "{cm:LaunchProgram,{#AppName}}"; Flags: nowait postinstall skipifsilent

[UninstallRun]
; Stop only this app's bundled Node server before files are removed.
Filename: "{app}\stop-server.cmd"; Flags: runhidden; RunOnceId: "StopServer"

[UninstallDelete]
; Data served by the app lives only in memory and public/; remove leftover log files.
Type: files; Name: "{app}\server.log"
Type: files; Name: "{app}\stderr.log"
Type: files; Name: "{app}\stdout.log"
Type: dirifempty; Name: "{app}\runtime"
Type: dirifempty; Name: "{app}"
