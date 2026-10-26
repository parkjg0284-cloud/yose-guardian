' 요세의 수호자 — 콘솔 창 없이 게임을 켠다 (1920x1080 전용 창)
'  · 이미 서버가 켜져 있으면 게임 창만 연다
'  · Chrome/Edge 가 있으면 주소창 없는 앱 모드로 1920x1080 창을 연다
'  · 서버는 숨김 상태로 계속 돌아간다 (게임 안의 [게임종료] 로 끈다)
Option Explicit
Dim sh, fso, here, url, nodeExe, q, i, port
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
here = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = here
port = ReadPort()
url = "http://127.0.0.1:" & port
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

' .env 의 PORT 한 줄을 읽는다 — 설정 화면에서 바꾼 포트로 앱 창을 연다.
Function ReadPort()
  Dim envFile, f, line, v, n
  ReadPort = 3001
  envFile = here & "\.env"
  If Not fso.FileExists(envFile) Then Exit Function
  Set f = fso.OpenTextFile(envFile, 1)
  Do Until f.AtEndOfStream
    line = Replace(Trim(f.ReadLine), " ", "")
    If InStr(UCase(line), "PORT=") = 1 Then
      v = Trim(Mid(line, 6))
      If IsNumeric(v) Then
        n = CLng(v)
        If n >= 1024 And n <= 65535 Then ReadPort = n
      End If
    End If
  Loop
  f.Close
End Function

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
