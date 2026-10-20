Option Explicit
Dim sh, fso, here, pack, dest, cmd, args, i
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
here = fso.GetParentFolderName(WScript.ScriptFullName)
pack = here & "\launcher-pack.zip"
dest = sh.ExpandEnvironmentStrings("%TEMP%") & "\yose_launcher_zip"
If Not fso.FileExists(pack) Then
  MsgBox "launcher-pack.zip ??? ?????.", 16, "Yose Guardian"
  WScript.Quit 1
End If
If fso.FolderExists(dest) Then fso.DeleteFolder dest, True
cmd = "powershell -NoProfile -ExecutionPolicy Bypass -Command ""Expand-Archive -LiteralPath '" & pack & "' -DestinationPath '" & dest & "' -Force"""
sh.Run cmd, 0, True
args = ""
For i = 0 To WScript.Arguments.Count - 1
  args = args & " " & WScript.Arguments(i)
Next
cmd = "powershell -NoProfile -ExecutionPolicy Bypass -File """ & dest & "\launcher.ps1""" & args
WScript.Quit sh.Run(cmd, 0, True)