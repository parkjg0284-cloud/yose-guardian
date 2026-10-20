' 요세의 수호자 — 콘솔 창 없이 게임을 켠다 (1920x1080 전용 창)
'  · 이미 서버가 켜져 있으면 게임 창만 연다
'  · Chrome/Edge 가 있으면 주소창 없는 앱 모드로 1920x1080 창을 연다
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
  OpenGame url
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

OpenGame url

' 게임 창 — 크롬/엣지가 있으면 1920x1080 앱 창, 없으면 기본 브라우저
Sub OpenGame(u)
  Dim b
  b = FindBrowser()
  If b <> "" Then
    sh.Run q & b & q & " --app=" & u & " --window-size=1920,1080 --window-position=0,0 --new-window", 1, False
  Else
    sh.Run u, 1, False
  End If
End Sub

Function FindBrowser()
  Dim p
  FindBrowser = ""
  For Each p In Array( _
    sh.ExpandEnvironmentStrings("%ProgramFiles%\Google\Chrome\Application\chrome.exe"), _
    sh.ExpandEnvironmentStrings("%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"), _
    sh.ExpandEnvironmentStrings("%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"), _
    sh.ExpandEnvironmentStrings("%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"), _
    sh.ExpandEnvironmentStrings("%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"))
    If fso.FileExists(p) Then
      FindBrowser = p
      Exit Function
    End If
  Next
End Function

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
