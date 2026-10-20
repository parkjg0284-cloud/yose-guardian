// 요세의 수호자 — 단일 파일 설치기
//  game.zip + install.ps1 + launcher.ps1 을 리소스로 품고, 풀어서 설치까지 한다.
//  실행: 요세의수호자_설치.exe            → 내장된 게임을 바로 설치
//        요세의수호자_설치.exe <URL>      → 최신 게임을 내려받아 설치
using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Text;

internal static class SingleInstaller
{
    private const string ResourceName = "payload.zip";
    private const string AppTitle = "요세의 수호자";

    private static int Main(string[] argv)
    {
        try { Console.OutputEncoding = Encoding.UTF8; } catch { /* 콘솔 인코딩 실패는 무시 */ }
        try { Console.Title = AppTitle + " — 설치"; } catch { }

        WriteLine("");
        WriteLine("  ╔══════════════════════════════════════════╗");
        WriteLine("  ║   " + AppTitle + " — 설치 프로그램");
        WriteLine("  ╚══════════════════════════════════════════╝");
        WriteLine("");

        string work = Path.Combine(Path.GetTempPath(), "yose-" + Guid.NewGuid().ToString("N").Substring(0, 8));
        // 설치 폴더 — 기본은 %LOCALAPPDATA%\YoseGuardian\app.
        //  YOSE_TARGET 환경변수나 두 번째 인자로 바꿀 수 있다(자동 검증·다른 드라이브 설치용).
        string target = Environment.GetEnvironmentVariable("YOSE_TARGET");
        if (argv != null && argv.Length > 1 && !string.IsNullOrWhiteSpace(argv[1])) target = argv[1].Trim().Trim('"');
        if (string.IsNullOrWhiteSpace(target))
        {
            target = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "YoseGuardian", "app");
        }
        target = Path.GetFullPath(target);
        WriteLine("  설치 위치: " + target);

        try
        {
            Directory.CreateDirectory(work);
            WriteLine("  [1/3] 설치 파일을 준비하는 중...");
            if (!ExtractPayload(work))
            {
                WriteLine("  [실패] 내장된 설치 파일을 풀지 못했습니다.");
                Pause();
                return 1;
            }

            string launcher = Path.Combine(work, "launcher.ps1");
            if (!File.Exists(launcher))
            {
                WriteLine("  [실패] launcher.ps1 이 없습니다.");
                Pause();
                return 1;
            }

            // 인자가 있으면 그 주소에서 최신 판을 받는다(없으면 내장 판을 쓴다).
            string url = argv != null && argv.Length > 0 ? (argv[0] ?? "").Trim() : "";

            WriteLine("  [2/3] 설치하는 중... (1~2분)");
            WriteLine("");
            var psi = new ProcessStartInfo(ResolvePowershell());
            psi.Arguments = "-NoProfile -ExecutionPolicy Bypass -File \"" + launcher + "\" -Path \"" + target + "\" -Silent"
                            + (url.Length > 0 ? " -Url \"" + url + "\"" : "");
            psi.UseShellExecute = false;
            psi.CreateNoWindow = false;

            int code;
            using (Process p = Process.Start(psi))
            {
                if (p == null)
                {
                    WriteLine("  [실패] PowerShell 을 실행할 수 없습니다.");
                    Pause();
                    return 1;
                }
                p.WaitForExit();
                code = p.ExitCode;
            }

            // 성공 판정 — 게임 본체가 있으면 설치된 것으로 본다.
            //  실행 스크립트(게임실행.cmd)는 잠금 등으로 못 쓸 수 있으므로 필수 조건이 아니다.
            bool hasGame = File.Exists(Path.Combine(target, "client", "dist", "index.html"))
                           && File.Exists(Path.Combine(target, "server", "index.js"));
            bool hasRunner = File.Exists(Path.Combine(target, "게임실행.cmd"));
            if (!hasGame)
            {
                WriteLine("");
                WriteLine("  [실패] 설치가 끝나지 않았습니다. 위 로그를 확인해 주세요.");
                WriteLine("  설치 위치: " + target);
                Pause();
                return 1;
            }
            if (!hasRunner)
            {
                WriteLine("  [안내] 실행 스크립트를 만들지 못했습니다 — 바로 시작합니다.");
            }

            WriteLine("");
            WriteLine("  [3/3] 설치 완료!");
            WriteLine("  설치 위치: " + target);
            WriteLine("");
            WriteLine("  게임을 시작합니다...");
            StartGame(target);
            return 0;
        }
        catch (Exception ex)
        {
            WriteLine("  [오류] " + ex.Message);
            Pause();
            return 1;
        }
        finally
        {
            try { if (Directory.Exists(work)) Directory.Delete(work, true); } catch { }
        }
    }

    /// <summary>내장 리소스(payload.zip)를 작업 폴더에 푼다.</summary>
    private static bool ExtractPayload(string work)
    {
        try
        {
            Assembly self = Assembly.GetExecutingAssembly();
            using (Stream raw = self.GetManifestResourceStream(ResourceName))
            {
                if (raw == null) return false;
                using (var zip = new ZipArchive(raw, ZipArchiveMode.Read))
                {
                    foreach (ZipArchiveEntry entry in zip.Entries)
                    {
                        if (string.IsNullOrEmpty(entry.Name)) continue; // 폴더 항목
                        string dest = Path.Combine(work, entry.FullName.Replace('/', Path.DirectorySeparatorChar));
                        string dir = Path.GetDirectoryName(dest);
                        if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
                        entry.ExtractToFile(dest, true);
                    }
                }
            }
            return true;
        }
        catch
        {
            return false;
        }
    }

    /// <summary>게임 실행 — 앱 모드(vbs)가 있으면 그것부터.</summary>
    private static void StartGame(string target)
    {
        string[] candidates = { "게임앱.vbs", "게임앱실행.cmd", "게임실행.cmd" };
        foreach (string name in candidates)
        {
            string path = Path.Combine(target, name);
            if (!File.Exists(path)) continue;
            try
            {
                var psi = new ProcessStartInfo("cmd.exe", "/c start \"\" \"" + path + "\"");
                psi.UseShellExecute = false;
                psi.CreateNoWindow = true;
                Process.Start(psi);
                return;
            }
            catch { /* 다음 후보 */ }
        }
        // 실행 스크립트가 없으면 게임 서버를 직접 띄운다(설치 스크립트가 잠겨 못 쓴 경우 대비).
        string server = Path.Combine(target, "server", "index.js");
        if (File.Exists(server))
        {
            try
            {
                var run = new ProcessStartInfo("cmd.exe",
                    "/c start \"\" /min \"" + ResolveNode(target) + "\" \"" + server + "\" --prod");
                run.WorkingDirectory = target;
                run.UseShellExecute = false;
                run.CreateNoWindow = true;
                Process.Start(run);
                // 브라우저로 게임 화면을 연다.
                var open = new ProcessStartInfo("cmd.exe", "/c start \"\" http://127.0.0.1:3001");
                open.UseShellExecute = false;
                open.CreateNoWindow = true;
                Process.Start(open);
                return;
            }
            catch { /* 아래 안내로 */ }
        }
        WriteLine("  [안내] 바탕화면의 [" + AppTitle + "] 바로가기로 실행해 주세요.");
    }

    /// <summary>node 실행 파일 — PATH 에 있으면 그것, 없으면 기본 설치 경로.</summary>
    private static string ResolveNode(string target)
    {
        string pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        string[] tried =
        {
            Path.Combine(pf, "nodejs", "node.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                         "Programs", "nodejs", "node.exe")
        };
        foreach (string p in tried) if (File.Exists(p)) return p;
        return "node";
    }

    /// <summary>PowerShell 경로 — 64비트를 먼저, 없으면 PATH 의 것.</summary>
    private static string ResolvePowershell()
    {
        string sys = Environment.GetFolderPath(Environment.SpecialFolder.System);
        string ps = Path.Combine(sys, "WindowsPowerShell", "v1.0", "powershell.exe");
        if (File.Exists(ps)) return ps;
        ps = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows),
                          "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
        if (File.Exists(ps)) return ps;
        return "powershell.exe";
    }

    private static void WriteLine(string s) { Console.WriteLine(s); }

    private static void Pause()
    {
        try
        {
            Console.WriteLine("");
            Console.WriteLine("  아무 키나 누르면 닫힙니다...");
            Console.ReadKey(true);
        }
        catch { /* 입력 없는 환경(자동 테스트)에서는 그냥 끝난다 */ }
    }
}
