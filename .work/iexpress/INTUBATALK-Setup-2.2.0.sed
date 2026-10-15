[Version]
Class=IEXPRESS
SEDVersion=3

[Options]
PackagePurpose=InstallApp
ShowInstallProgramWindow=1
HideExtractAnimation=1
UseLongFileName=1
InsideCompressed=1
CAB_FixedSize=0
CAB_ResvCodeSigning=0
RebootMode=I
InstallPrompt=%InstallPrompt%
DisplayLicense=
FinishMessage=%FinishMessage%
TargetName=C:\python\NURSIN~1\installer\INTUBATALK-Setup-2.2.0.exe
FriendlyName=INTUBATALK 2.2.0 Setup
AppLaunched=cmd /c install.cmd
PostInstallCmd=<None>
AdminQuietInstCmd=cmd /c install.cmd
UserQuietInstCmd=cmd /c install.cmd
SourceFiles=SourceFiles

[Strings]
InstallPrompt=This will install INTUBATALK 2.2.0.
FinishMessage=INTUBATALK 2.2.0 has been installed.
FILE0="install.cmd"
FILE1="payload.zip"

[SourceFiles]
SourceFiles0=C:\python\NURSIN~1\WORK~1\iexpress

[SourceFiles0]
%FILE0%=
%FILE1%=
