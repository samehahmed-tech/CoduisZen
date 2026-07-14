Option Explicit

If WScript.Arguments.Count <> 1 Then WScript.Quit 2

Dim shell, fileSystem, runtimeDirectory, nodePath, scriptPath, command
Set shell = CreateObject("WScript.Shell")
Set fileSystem = CreateObject("Scripting.FileSystemObject")
runtimeDirectory = fileSystem.GetParentFolderName(WScript.ScriptFullName)
nodePath = fileSystem.BuildPath(runtimeDirectory, "node.exe")
scriptPath = fileSystem.BuildPath(runtimeDirectory, WScript.Arguments(0))
command = """" & nodePath & """ """ & scriptPath & """"
shell.Run command, 0, False
