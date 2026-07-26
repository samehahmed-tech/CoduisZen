#define AppName "Final Setup"
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
OutputBaseFilename=Final Setup
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

[Run]
Filename: "http://127.0.0.1:3099"; Description: "فتح شاشة حالة النظام"; Flags: postinstall shellexec skipifsilent nowait

[UninstallRun]
Filename: "{app}\runtime\node.exe"; Parameters: """{app}\runtime\setup-agent.cjs"" uninstall"; Flags: runhidden waituntilterminated

[Code]
var
  RolePage: TInputOptionWizardPage;
  CashierPage: TInputQueryWizardPage;
  FeaturePage: TInputOptionWizardPage;
  ExistingInstall: Boolean;
  SetupAgentExitCode: Integer;

procedure InitializeWizard;
begin
  ExistingInstall := False;
  SetupAgentExitCode := 0;
  RolePage := CreateInputOptionPage(wpWelcome, 'نوع الجهاز', 'سيتم ضبط كل شيء تلقائياً', 'اختر وظيفة هذا الجهاز:', True, False);
  RolePage.Add('جهاز السيرفر الرئيسي');
  RolePage.Add('جهاز كاشير');
  RolePage.SelectedValueIndex := 0;

  CashierPage := CreateInputQueryPage(RolePage.ID, 'ربط الكاشير', 'بيانات واحدة فقط', 'اكتب IP جهاز السيرفر. مثال: 192.168.1.10');
  CashierPage.Add('IP السيرفر:', False);
  CashierPage.Values[0] := '192.168.1.10';

  FeaturePage := CreateInputOptionPage(CashierPage.ID, 'المكونات', 'اختر المطلوب', 'الاختيارات المناسبة محددة تلقائياً:', False, False);
  FeaturePage.Add('تثبيت Print Bridge للطابعات USB');
  FeaturePage.Add('تشغيل WhatsApp على السيرفر');
  FeaturePage.Values[0] := True;
  FeaturePage.Values[1] := True;
end;

function IsServer: Boolean;
begin Result := RolePage.SelectedValueIndex = 0; end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin Result := (PageID = CashierPage.ID) and IsServer; end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
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

procedure CurStepChanged(CurStep: TSetupStep);
var
  ExitCode: Integer;
  Args, Role, ServerIp, DetailsPath: String;
  Details: AnsiString;
begin
  if CurStep <> ssPostInstall then Exit;
  ExistingInstall := FileExists(ExpandConstant('{app}\install-state.json'));
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
    if FileExists(DetailsPath) and LoadStringFromFile(DetailsPath, Details) then
      SuppressibleMsgBox('تم تشغيل النظام، لكن توجد نقاط اختيارية تحتاج مراجعة:' + #13#10 + #13#10 + String(Details) + #13#10 + 'افتح Sameh System Monitor للتفاصيل.', mbInformation, MB_OK, IDOK)
    else
      SuppressibleMsgBox('تم تشغيل النظام مع تنبيهات. افتح Sameh System Monitor للتفاصيل.', mbInformation, MB_OK, IDOK);
  end else begin
    SetupAgentExitCode := 10;
    DetailsPath := ExpandConstant('{app}\INSTALL_ERROR.txt');
    if FileExists(DetailsPath) and LoadStringFromFile(DetailsPath, Details) then
      SuppressibleMsgBox('فشل تجهيز النظام:' + #13#10 + String(Details), mbError, MB_OK, IDOK)
    else
      SuppressibleMsgBox('فشل تجهيز النظام. راجع logs\installer.log.', mbError, MB_OK, IDOK);
  end;
end;

function GetCustomSetupExitCode: Integer;
begin
  Result := SetupAgentExitCode;
end;
