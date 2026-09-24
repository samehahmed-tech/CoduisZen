#define AppName "Codeuis Setup V2"
#define AppVersion GetEnv("SAMEH_INSTALLER_VERSION")
#define SourceRoot GetEnv("SAMEH_STAGE_DIR")
#define OutputRoot GetEnv("SAMEH_OUTPUT_DIR")

[Setup]
AppId={{5C76AE62-E6AC-4CCF-A431-5A4E48494E53}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=Sameh
VersionInfoDescription=RestoFlow ERP smart installer
DefaultDirName={autopf}\Sameh\RestoFlow ERP
DefaultGroupName=Sameh Installer
DisableProgramGroupPage=yes
OutputDir={#OutputRoot}
OutputBaseFilename=Codeuis Setup V2
Compression=lzma2/max
SolidCompression=yes
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
WizardStyle=modern
SetupLogging=yes
CloseApplications=yes
RestartApplications=no
UsePreviousAppDir=yes
UninstallDisplayName=Sameh Installer - RestoFlow ERP

[Languages]
Name: "arabic"; MessagesFile: "compiler:Languages\Arabic.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[InstallDelete]
Type: filesandordirs; Name: "{app}\dist"
Type: filesandordirs; Name: "{app}\dist-server"
Type: filesandordirs; Name: "{app}\node_modules"
Type: filesandordirs; Name: "{app}\runtime"
Type: filesandordirs; Name: "{app}\recovery"
Type: filesandordirs; Name: "{app}\database"
Type: filesandordirs; Name: "{app}\maintenance"
Type: filesandordirs; Name: "{app}\hardware-bridge\node_modules"
Type: files; Name: "{app}\hardware-bridge\index.js"
Type: files; Name: "{app}\hardware-bridge\package*.json"

[Files]
Source: "{#SourceRoot}\runtime\*"; DestDir: "{app}\runtime"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#SourceRoot}\hardware-bridge\*"; DestDir: "{app}\hardware-bridge"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#SourceRoot}\dist\*"; DestDir: "{app}\dist"; Flags: ignoreversion recursesubdirs createallsubdirs; Check: IsServer
Source: "{#SourceRoot}\dist-server\*"; DestDir: "{app}\dist-server"; Flags: ignoreversion recursesubdirs createallsubdirs; Check: IsServer
Source: "{#SourceRoot}\public\*"; DestDir: "{app}\public"; Flags: ignoreversion recursesubdirs createallsubdirs; Check: IsServer
Source: "{#SourceRoot}\node_modules\*"; DestDir: "{app}\node_modules"; Flags: ignoreversion recursesubdirs createallsubdirs; Check: IsServer
Source: "{#SourceRoot}\database\*"; DestDir: "{app}\database"; Flags: ignoreversion recursesubdirs createallsubdirs; Check: IsServer
Source: "{#SourceRoot}\maintenance\*"; DestDir: "{app}\maintenance"; Flags: ignoreversion recursesubdirs createallsubdirs; Check: IsServer
Source: "{#SourceRoot}\recovery\manifest.json"; DestDir: "{app}\recovery"; Flags: ignoreversion
Source: "{#SourceRoot}\recovery\runtime\*"; DestDir: "{app}\recovery\runtime"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#SourceRoot}\recovery\hardware-bridge\*"; DestDir: "{app}\recovery\hardware-bridge"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#SourceRoot}\recovery\dist-server\*"; DestDir: "{app}\recovery\dist-server"; Flags: ignoreversion recursesubdirs createallsubdirs; Check: IsServer
Source: "{#SourceRoot}\recovery\dist\*"; DestDir: "{app}\recovery\dist"; Flags: ignoreversion recursesubdirs createallsubdirs; Check: IsServer
#if FileExists(SourceRoot + "\prerequisites\SQLEXPR_x64_ENU.exe")
Source: "{#SourceRoot}\prerequisites\SQLEXPR_x64_ENU.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall; Check: IsServer
#endif
#if FileExists(SourceRoot + "\prerequisites\msodbcsql.msi")
Source: "{#SourceRoot}\prerequisites\msodbcsql.msi"; DestDir: "{tmp}"; Flags: deleteafterinstall; Check: IsServer
#endif
#if FileExists(SourceRoot + "\prerequisites\vc_redist.x64.exe")
Source: "{#SourceRoot}\prerequisites\vc_redist.x64.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall; Check: IsServer
#endif

[Icons]
Name: "{group}\RestoFlow ERP"; Filename: "{code:GetSystemUrl}"
Name: "{commondesktop}\RestoFlow ERP"; Filename: "{code:GetSystemUrl}"
Name: "{group}\Sameh System Monitor"; Filename: "http://127.0.0.1:3099"
Name: "{commondesktop}\Sameh System Monitor"; Filename: "http://127.0.0.1:3099"
Name: "{group}\Import Catalog SQL File"; Filename: "{app}\runtime\Import Catalog SQL File.bat"; WorkingDir: "{app}"; Check: IsServer
Name: "{group}\RestoFlow Data Maintenance"; Filename: "{app}\maintenance\RestoFlow Data Maintenance.bat"; WorkingDir: "{app}\maintenance"; Check: IsServer
Name: "{commondesktop}\RestoFlow Data Maintenance"; Filename: "{app}\maintenance\RestoFlow Data Maintenance.bat"; WorkingDir: "{app}\maintenance"; Check: IsServer

[Run]
Filename: "http://127.0.0.1:3099"; Description: "فتح شاشة حالة النظام"; Flags: postinstall shellexec skipifsilent nowait

[UninstallRun]
Filename: "{app}\runtime\node.exe"; Parameters: """{app}\runtime\setup-agent.cjs"" uninstall"; Flags: runhidden waituntilterminated

[Code]
var
  ModePage: TInputOptionWizardPage;
  SystemCheckPage: TOutputMsgWizardPage;
  RolePage: TInputOptionWizardPage;
  CashierPage: TInputQueryWizardPage;
  FeaturePage: TInputOptionWizardPage;
  SummaryPage: TOutputMsgWizardPage;
  ExistingInstall: Boolean;
  ExistingInstallDir: String;
  SetupAgentExitCode: Integer;

function DetectExistingInstall: Boolean;
var
  Candidate: String;
begin
  Result := False;
  ExistingInstallDir := '';
  Candidate := '';
  if not RegQueryStringValue(HKLM64, 'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{5C76AE62-E6AC-4CCF-A431-5A4E48494E53}_is1', 'InstallLocation', Candidate) then
    RegQueryStringValue(HKLM, 'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{5C76AE62-E6AC-4CCF-A431-5A4E48494E53}_is1', 'InstallLocation', Candidate);
  if (Candidate <> '') and DirExists(Candidate) then begin
    ExistingInstallDir := RemoveBackslashUnlessRoot(Candidate);
    Result := True;
    Exit;
  end;
  Candidate := 'C:\RestoFlow';
  if DirExists(Candidate) and (FileExists(AddBackslash(Candidate) + '.env') or FileExists(AddBackslash(Candidate) + 'install-state.json')) then begin
    ExistingInstallDir := Candidate;
    Result := True;
  end;
end;

function DeviceAssessment: String;
var
  FreeSpace, TotalSpace: Cardinal;
begin
  Result := 'Windows x64: ready' + #13#10;
  if GetSpaceOnDisk(ExpandConstant('{autopf}'), True, FreeSpace, TotalSpace) then
    Result := Result + 'Available disk space: ' + IntToStr(FreeSpace) + ' MB of ' + IntToStr(TotalSpace) + ' MB' + #13#10
  else
    Result := Result + 'Available disk space: unable to read' + #13#10;
  if ExistingInstall then
    Result := Result + 'Existing RestoFlow installation: detected' + #13#10 + 'Location: ' + ExistingInstallDir + #13#10 + #13#10 +
      'Upgrade mode will update application files while preserving database, .env, backups, and WhatsApp session data.'
  else
    Result := Result + 'Existing RestoFlow installation: not detected' + #13#10 + #13#10 +
      'Clean installation will prepare a new server or connect this device as a cashier.';
end;

function InstallationSummary: String;
begin
  if ExistingInstall then
    Result := 'READY FOR SAFE UPGRADE' + #13#10 + #13#10 +
      'The existing installation was found at:' + #13#10 + ExistingInstallDir + #13#10 + #13#10 +
      'Application files will be replaced. Your SQL database, environment configuration, backups, and WhatsApp session will be preserved.' + #13#10 + #13#10 +
      'Your selected device role and optional services will be applied next.' + #13#10 + #13#10 +
      'A verified database backup is created before schema repair on the server.'
  else
    Result := 'READY FOR CLEAN INSTALLATION' + #13#10 + #13#10 +
      'A new RestoFlow installation will be prepared for this device.' + #13#10 + #13#10 +
      'Your selected device role and optional services will be applied next.' + #13#10 + #13#10 +
      'The installer will configure the required Windows components and prepare the database when this device is the main server.';
end;

procedure InitializeWizard;
begin
  ExistingInstall := DetectExistingInstall;
  SetupAgentExitCode := 0;
  ModePage := CreateInputOptionPage(wpWelcome, 'RestoFlow Deployment Center', 'Smart installation assessment', 'Choose how to continue:', True, False);
  if ExistingInstall then begin
    ModePage.Add('Upgrade the existing RestoFlow installation and preserve its data');
    ModePage.Add('Cancel and keep the installed version unchanged');
    ModePage.SelectedValueIndex := 0;
  end else begin
    ModePage.Add('Start a clean RestoFlow installation on this device');
    ModePage.SelectedValueIndex := 0;
  end;
  SystemCheckPage := CreateOutputMsgPage(ModePage.ID, 'System check', 'Device readiness and data protection', DeviceAssessment);
  RolePage := CreateInputOptionPage(SystemCheckPage.ID, 'Device role', 'Select the intended role for this device', 'The installer will configure the matching services:', True, False);
  RolePage.Add('Main server');
  RolePage.Add('Cashier device');
  RolePage.SelectedValueIndex := 0;

  CashierPage := CreateInputQueryPage(RolePage.ID, 'ربط الكاشير', 'بيانات واحدة فقط', 'اكتب IP جهاز السيرفر. مثال: 192.168.1.10');
  CashierPage.Add('IP السيرفر:', False);
  CashierPage.Values[0] := '192.168.1.10';

  FeaturePage := CreateInputOptionPage(CashierPage.ID, 'المكونات', 'اختر المطلوب', 'الاختيارات المناسبة محددة تلقائياً:', False, False);
  FeaturePage.Add('تثبيت Print Bridge للطابعات USB');
  FeaturePage.Add('تشغيل WhatsApp على السيرفر');
  FeaturePage.Values[0] := True;
  FeaturePage.Values[1] := True;
  SummaryPage := CreateOutputMsgPage(FeaturePage.ID, 'Installation summary', 'Review the protected installation plan', InstallationSummary);
end;

function IsServer: Boolean;
begin Result := RolePage.SelectedValueIndex = 0; end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin Result := (PageID = CashierPage.ID) and IsServer; end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if (CurPageID = ModePage.ID) and ExistingInstall and (ModePage.SelectedValueIndex = 1) then begin
    MsgBox('The installed RestoFlow version was not changed.', mbInformation, MB_OK);
    WizardForm.Close;
    Result := False;
    Exit;
  end;
  if (CurPageID = CashierPage.ID) and (Trim(CashierPage.Values[0]) = '') then begin
    MsgBox('اكتب IP السيرفر.', mbError, MB_OK);
    Result := False;
  end;
end;

function GetSystemUrl(Param: String): String;
begin
  if IsServer then Result := 'http://localhost:3001'
  else Result := 'http://' + Trim(CashierPage.Values[0]) + ':3001';
end;

function BoolArg(const Name: String; Enabled: Boolean): String;
begin if Enabled then Result := ' --' + Name else Result := ''; end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ExitCode: Integer;
  AppPath, StopCommand: String;
begin
  Result := '';
  Exec('schtasks.exe', '/End /TN "Sameh RestoFlow Supervisor"', '', SW_HIDE, ewWaitUntilTerminated, ExitCode);
  Exec('schtasks.exe', '/End /TN "Sameh System Monitor"', '', SW_HIDE, ewWaitUntilTerminated, ExitCode);
  Exec('schtasks.exe', '/End /TN "Sameh Installer Watchdog"', '', SW_HIDE, ewWaitUntilTerminated, ExitCode);
  Exec('schtasks.exe', '/End /TN "Sameh Print Bridge"', '', SW_HIDE, ewWaitUntilTerminated, ExitCode);
  Exec('schtasks.exe', '/Delete /TN "Sameh RestoFlow Supervisor" /F', '', SW_HIDE, ewWaitUntilTerminated, ExitCode);
  Exec('schtasks.exe', '/Delete /TN "Sameh System Monitor" /F', '', SW_HIDE, ewWaitUntilTerminated, ExitCode);
  Exec('schtasks.exe', '/Delete /TN "Sameh Installer Watchdog" /F', '', SW_HIDE, ewWaitUntilTerminated, ExitCode);
  Exec('schtasks.exe', '/Delete /TN "Sameh Print Bridge" /F', '', SW_HIDE, ewWaitUntilTerminated, ExitCode);
  AppPath := ExpandConstant('{app}');
  StringChangeEx(AppPath, '''', '''''', True);
  StopCommand := '-NoProfile -ExecutionPolicy Bypass -Command "$root=''' + AppPath + '''; $managed=''[\\/]runtime[\\/](supervisor|monitor|watchdog|bridge-runner)\.cjs|[\\/]dist-server[\\/]index\.cjs|[\\/]hardware-bridge[\\/]index\.js''; for($i=0;$i -lt 10;$i++){ $procs=Get-CimInstance Win32_Process | Where-Object { $_.Name -eq ''node.exe'' -and ($_.CommandLine -like (''*'' + $root + ''*'') -or $_.CommandLine -match $managed) }; if(-not $procs){break}; $procs | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; Start-Sleep -Milliseconds 300 }"';
  Exec('powershell.exe', StopCommand, '', SW_HIDE, ewWaitUntilTerminated, ExitCode);
end;

function Utf8BytesToWide(const S: AnsiString): String;
var
  i, c, c2, c3, code: Integer;
begin
  Result := '';
  i := 1;
  while i <= Length(S) do begin
    c := Ord(S[i]);
    if c < $80 then begin
      Result := Result + Chr(c);
      Inc(i);
    end else if (c and $E0) = $C0 then begin
      if i + 1 > Length(S) then Break;
      c2 := Ord(S[i+1]);
      code := ((c and $1F) shl 6) or (c2 and $3F);
      Result := Result + Chr(code);
      i := i + 2;
    end else if (c and $F0) = $E0 then begin
      if i + 2 > Length(S) then Break;
      c2 := Ord(S[i+1]);
      c3 := Ord(S[i+2]);
      code := ((c and $0F) shl 12) or ((c2 and $3F) shl 6) or (c3 and $3F);
      Result := Result + Chr(code);
      i := i + 3;
    end else begin
      Inc(i);
    end;
  end;
end;

function LoadInstallerDetails(const FileName: String): String;
var
  Raw: AnsiString;
begin
  Result := '';
  if LoadStringFromFile(FileName, Raw) then
    Result := Utf8BytesToWide(Raw);
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ExitCode: Integer;
  Args, Role, ServerIp, DetailsPath, Details: String;
begin
  if CurStep <> ssPostInstall then Exit;
  if IsServer then begin Role := 'server'; ServerIp := '127.0.0.1'; end
  else begin Role := 'cashier'; ServerIp := Trim(CashierPage.Values[0]); end;
  WizardForm.StatusLabel.Caption := 'جاري ضبط وتشغيل النظام...';
  Args := '"' + ExpandConstant('{app}\runtime\setup-agent.cjs') + '" install' +
    ' --role=' + Role + ' --serverIp=' + ServerIp + ' --version={#AppVersion}' +
    BoolArg('bridge', FeaturePage.Values[0]) + BoolArg('whatsapp', FeaturePage.Values[1]);
  if FileExists(ExpandConstant('{tmp}\SQLEXPR_x64_ENU.exe')) then
    Args := Args + ' --sqlInstaller="' + ExpandConstant('{tmp}\SQLEXPR_x64_ENU.exe') + '"';
  if FileExists(ExpandConstant('{tmp}\msodbcsql.msi')) then
    Args := Args + ' --odbcInstaller="' + ExpandConstant('{tmp}\msodbcsql.msi') + '"';
  if FileExists(ExpandConstant('{tmp}\vc_redist.x64.exe')) then
    Args := Args + ' --vcInstaller="' + ExpandConstant('{tmp}\vc_redist.x64.exe') + '"';
  if ExistingInstall then Args := Args + ' --upgrade';
  if not Exec(ExpandConstant('{app}\runtime\node.exe'), Args, ExpandConstant('{app}'), SW_HIDE, ewWaitUntilTerminated, ExitCode) then begin
    SetupAgentExitCode := 10;
    SuppressibleMsgBox('تعذر تشغيل أداة الإعداد. راجع logs\installer.log.', mbError, MB_OK, IDOK);
    Exit;
  end;
  if ExitCode = 0 then
    SuppressibleMsgBox('تم تثبيت Sameh Installer وتشغيل خدمات النظام بنجاح.', mbInformation, MB_OK, IDOK)
  else if ExitCode = 2 then begin
    DetailsPath := ExpandConstant('{app}\INSTALL_WARNINGS.txt');
    if FileExists(DetailsPath) then begin
      Details := LoadInstallerDetails(DetailsPath);
      SuppressibleMsgBox('تم تشغيل النظام، لكن توجد نقاط اختيارية تحتاج مراجعة:' + #13#10 + #13#10 + Details + #13#10 + 'افتح Sameh System Monitor للتفاصيل.', mbInformation, MB_OK, IDOK)
    end
    else
      SuppressibleMsgBox('تم تشغيل النظام مع تنبيهات. افتح Sameh System Monitor للتفاصيل.', mbInformation, MB_OK, IDOK);
  end else begin
    SetupAgentExitCode := 10;
    DetailsPath := ExpandConstant('{app}\INSTALL_ERROR.txt');
    if FileExists(DetailsPath) then begin
      Details := LoadInstallerDetails(DetailsPath);
      SuppressibleMsgBox('فشل تجهيز النظام:' + #13#10 + Details, mbError, MB_OK, IDOK)
    end
    else
      SuppressibleMsgBox('فشل تجهيز النظام. راجع logs\installer.log.', mbError, MB_OK, IDOK);
  end;
end;

function GetCustomSetupExitCode: Integer;
begin
  Result := SetupAgentExitCode;
end;
