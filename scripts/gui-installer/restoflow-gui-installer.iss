#define AppName "RestoFlow ERP"
#define AppVersion GetEnv("RESTOFLOW_INSTALLER_VERSION")
#define SourceRoot GetEnv("RESTOFLOW_STAGE_DIR")
#define OutputRoot GetEnv("RESTOFLOW_OUTPUT_DIR")

[Setup]
AppId={{6F5E6C10-5B19-4777-90D3-RESTOFLOWGUI}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=Coduis
DefaultDirName=C:\RestoFlow
DefaultGroupName=RestoFlow ERP
DisableProgramGroupPage=yes
OutputDir={#OutputRoot}
OutputBaseFilename=RestoFlow-ERP-GUI-Setup-{#AppVersion}
Compression=lzma2/max
SolidCompression=yes
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
WizardStyle=modern

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "{#SourceRoot}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\RestoFlow ERP"; Filename: "http://localhost:{code:GetAppPort}"
Name: "{commondesktop}\RestoFlow ERP"; Filename: "http://localhost:{code:GetAppPort}"

[UninstallRun]
Filename: "{app}\runtime\node.exe"; Parameters: """{app}\runtime\setup-agent.cjs"" uninstall"; Flags: runhidden waituntilterminated

[Code]
var
  ClientPage: TInputQueryWizardPage;
  DbPage: TInputQueryWizardPage;
  OptionsPage: TInputOptionWizardPage;

procedure InitializeWizard;
begin
  ClientPage := CreateInputQueryPage(wpSelectDir,
    'RestoFlow setup',
    'Basic server settings.',
    'Enter client name and LAN port.');
  ClientPage.Add('Client slug:', False);
  ClientPage.Add('App port:', False);
  ClientPage.Values[0] := 'restoflow-client';
  ClientPage.Values[1] := '3001';

  DbPage := CreateInputQueryPage(ClientPage.ID,
    'Database',
    'Use an existing PostgreSQL database.',
    'Installer will not create database. It will only save this URL and try migrations.');
  DbPage.Add('DATABASE_URL:', False);
  DbPage.Values[0] := 'postgresql://restoflow_user:CHANGE_ME@127.0.0.1:5432/restoflow_erp';

  OptionsPage := CreateInputOptionPage(DbPage.ID,
    'Features',
    'Choose optional services.',
    'Supervisor will auto-start and repair selected services.',
    False, False);
  OptionsPage.Add('Enable print bridge');
  OptionsPage.Add('Enable WhatsApp Web');
  OptionsPage.Add('Restore included data from developer machine');
  OptionsPage.Values[0] := True;
  OptionsPage.Values[1] := False;
  OptionsPage.Values[2] := True;
end;

function GetAppPort(Param: String): String;
begin
  Result := ClientPage.Values[1];
end;

function Quote(Value: String): String;
var
  Escaped: String;
begin
  Escaped := Value;
  StringChangeEx(Escaped, '"', '\"', True);
  Result := '"' + Escaped + '"';
end;

function BoolArg(Name: String; Enabled: Boolean): String;
begin
  if Enabled then Result := ' --' + Name else Result := '';
end;

function AgentArgs: String;
begin
  Result :=
    '"' + ExpandConstant('{app}\runtime\setup-agent.cjs') + '" install' +
    ' --clientSlug=' + Quote(ClientPage.Values[0]) +
    ' --port=' + Quote(ClientPage.Values[1]) +
    ' --databaseUrl=' + Quote(DbPage.Values[0]) +
    BoolArg('printBridge', OptionsPage.Values[0]) +
    BoolArg('whatsapp', OptionsPage.Values[1]) +
    BoolArg('restoreData', OptionsPage.Values[2]) +
    ' --whatsappProvider="whatsapp-web.js"';
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  Code: Integer;
  ResultPath: String;
  ResultText: AnsiString;
begin
  if CurStep = ssPostInstall then begin
    WizardForm.StatusLabel.Caption := 'Configuring RestoFlow services...';
    Exec(ExpandConstant('{app}\runtime\node.exe'), AgentArgs, ExpandConstant('{app}'), SW_HIDE, ewWaitUntilTerminated, Code);

    ResultPath := ExpandConstant('{app}\INSTALL_RESULT.txt');
    if FileExists(ResultPath) and LoadStringFromFile(ResultPath, ResultText) then begin
      if Code = 0 then MsgBox(ResultText, mbInformation, MB_OK)
      else MsgBox(ResultText, mbError, MB_OK);
    end else begin
      MsgBox('Setup finished, but no result file was created. Check logs folder.', mbError, MB_OK);
    end;
  end;
end;
