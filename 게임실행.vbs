' 요세의 수호자 — 창 없이 게임을 켠다 (콘솔 창이 뜨지 않는다)
'  · 이미 서버가 켜져 있으면 브라우저만 연다
'  · 서버는 숨김 상태로 계속 돌아간다 (게임 안의 [게임종료] 로 끈다)
Option Explicit
Dim sh, fso, here, url, nodeExe, q, i
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
here = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = here
url = "http://127.0.0.1:3001"
q = Chr(34)

If ServerUp(url) Then
  sh.Run url, 1, False
  WScript.Quit 0
End If

nodeExe = FindNode()
If nodeExe = "" Then
  MsgBox "Node.js is not installed." & vbCrLf & "Install it from https://nodejs.org and run again.", 48, "Yose Guardian"
  WScript.Quit 1
End If

sh.Run q & nodeExe & q & " server/index.js --prod", 0, False

For i = 1 To 75
  WScript.Sleep 400
  If ServerUp(url) Then Exit For
Next

sh.Run url, 1, False

Function ServerUp(u)
  On Error Resume Next
  Dim http
  ServerUp = False
  Set http = CreateObject("WinHttp.WinHttpRequest.5.1")
  http.SetTimeouts 400, 400, 800, 800
  http.Open "GET", u & "/api/health", False
  http.Send
  If Err.Number = 0 Then
    If http.Status = 200 Then ServerUp = True
  End If
  Err.Clear
  On Error GoTo 0
End Function

Function FindNode()
  Dim p
  FindNode = ""
  For Each p In Array(sh.ExpandEnvironmentStrings("%ProgramFiles%\nodejs\node.exe"), sh.ExpandEnvironmentStrings("%ProgramFiles(x86)%\nodejs\node.exe"), sh.ExpandEnvironmentStrings("%LOCALAPPDATA%\Programs\nodejs\node.exe"), here & "\node\node.exe")
    If fso.FileExists(p) Then
      FindNode = p
      Exit Function
    End If
  Next
  FindNode = "node"
End Function
