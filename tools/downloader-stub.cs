// 요세의 수호자 — 다운로더/런처 앱 스텁 (v1.6.0)
//  payload.zip(downloader.ps1 · downloader.json · install.ps1 · game.zip)을 풀어
//  downloader.ps1 을 실행한다(창이 뜨는 GUI 앱).
//  LAUNCHER_MODE 로 컴파일하면 downloader.ps1 -Launcher 로 실행해
//  [게임 다운로드 & 설치] → [게임 시작] 런처 창이 뜬다.
//  인자:  <설치폴더>      — 설치 위치를 직접 지정
//         -SelfTest       — 창 없이 설치만 확인(자동 검증)
using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Text;

internal static class DownloaderStub
{
    private const string ResourceName = "payload.zip";
#if LAUNCHER_MODE
    private const string AppTitle = "요세의 수호자 런처";
    private const string ScriptMode = " -Launcher";
    private const string WorkFolder = "launcher";
#else
    private const string AppTitle = "요세의 수호자 다운로더";
    private const string ScriptMode = "";
    private const string WorkFolder = "downloader";
#endif

    private static int Main(string[] argv)
    {
        try { Console.OutputEncoding = Encoding.UTF8; } catch { }
        try { Console.Title = AppTitle; } catch { }

        string work = ResolveWorkDir();
        string target = "";
        bool selfTest = false;
        bool stateCheck = false;
        if (argv != null)
        {
            foreach (string raw in argv)
            {
                string a = (raw ?? "").Trim();
                if (a.Length == 0) continue;
                if (a.Equals("-SelfTest", StringComparison.OrdinalIgnoreCase)) { selfTest = true; continue; }
                if (a.Equals("-StateCheck", StringComparison.OrdinalIgnoreCase)) { stateCheck = true; continue; }
                if (target.Length == 0 && !a.StartsWith("-")) target = a.Trim('"');
            }
        }
        bool quietMode = selfTest || stateCheck;
        if (target.Length == 0) target = Environment.GetEnvironmentVariable("YOSE_TARGET") ?? "";
        if (target.Length == 0)
            target = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "YoseGuardian", "app");
        target = Path.GetFullPath(target);

        try
        {
            Directory.CreateDirectory(work);
            if (!ExtractPayload(ref work))
            {
                Console.WriteLine("  [실패] 내장 파일을 풀지 못했습니다.");
                return 1;
            }
            string script = Path.Combine(work, "downloader.ps1");
            if (!File.Exists(script))
            {
                Console.WriteLine("  [실패] downloader.ps1 이 없습니다.");
                return 1;
            }

            var psi = new ProcessStartInfo(ResolvePowershell());
            psi.Arguments = "-NoProfile -ExecutionPolicy Bypass -File \"" + script + "\" -Path \"" + target + "\""
                            + (selfTest ? " -SelfTest" : stateCheck ? " -StateCheck" : ScriptMode);
            psi.UseShellExecute = false;
            psi.WorkingDirectory = work;
            psi.CreateNoWindow = true;

            // 자체 검사 — 출력을 모아 그대로 보여 주고 종료 코드를 돌려준다
            if (quietMode)
            {
                psi.RedirectStandardOutput = true;
                psi.RedirectStandardError = true;
                using (Process p = Process.Start(psi))
                {
                    if (p == null) { Console.WriteLine("  [실패] PowerShell 을 실행할 수 없습니다."); return 1; }
                    string outp = p.StandardOutput.ReadToEnd();
                    string errp = p.StandardError.ReadToEnd();
                    p.WaitForExit();
                    if (outp.Length > 0) Console.Write(outp);
                    if (errp.Length > 0) Console.Error.Write(errp);
                    return p.ExitCode;
                }
            }

            // 창 모드 — 로그를 파일로 돌리고 GUI 만 띄운 뒤 이 콘솔은 바로 끝난다
            string logPath = Path.Combine(work, "gui.log");
            psi.RedirectStandardOutput = true;
            psi.RedirectStandardError = true;
            using (Process p = Process.Start(psi))
            {
                if (p == null) { Console.WriteLine("  [실패] PowerShell 을 실행할 수 없습니다."); return 1; }
                var sw = new StreamWriter(logPath, false, Encoding.UTF8);
                sw.AutoFlush = true;
                p.OutputDataReceived += (sender, e) => { if (e.Data != null) { try { sw.WriteLine(e.Data); } catch { } } };
                p.ErrorDataReceived += (sender, e) => { if (e.Data != null) { try { sw.WriteLine(e.Data); } catch { } } };
                p.BeginOutputReadLine();
                p.BeginErrorReadLine();
            }
            return 0;
        }
        catch (Exception ex)
        {
            Console.WriteLine("  [오류] " + ex.Message);
            return 1;
        }
        finally
        {
            // 창 모드는 PowerShell 이 계속 그 폴더의 파일을 쓴다 — 지우지 않는다.
            if (quietMode)
            {
                try { if (Directory.Exists(work)) Directory.Delete(work, true); } catch { }
            }
        }
    }

    /// <summary>앱 폴더 — 늘 같은 곳에 풀어 두어 창 모드에서도 파일이 남는다.</summary>
    private static string ResolveWorkDir()
    {
        string id = Guid.NewGuid().ToString("N").Substring(0, 8);
        string[] candidates =
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "YoseGuardian", WorkFolder),
            Path.Combine(Path.GetTempPath(), "yose-dl-" + id),
            Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "yose-work-" + id)
        };
        foreach (string dir in candidates)
        {
            try { Directory.CreateDirectory(dir); return dir; } catch { }
        }
        return Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "yose-work-" + id);
    }

    /// <summary>
    /// payload 를 작업 폴더에 푼다. 이전 실행이 남긴 파일(잠금 포함) 때문에 실패하면
    /// 임시 폴더로 한 번 더 시도한다 — 그래도 안 되면 false.
    /// </summary>
    private static bool ExtractPayload(ref string work)
    {
        if (TryExtract(work)) return true;
        string alt = Path.Combine(Path.GetTempPath(), "yose-" + WorkFolder + "-" + Guid.NewGuid().ToString("N").Substring(0, 8));
        try { Directory.CreateDirectory(alt); } catch { return false; }
        if (TryExtract(alt)) { work = alt; return true; }
        return false;
    }

    private static bool TryExtract(string work)
    {
        try
        {
            // 이전 실행의 찌꺼기(launcher.ps1 등)가 남아 있으면 덮어쓰기가 막힐 수 있다 — 먼저 비운다
            try
            {
                foreach (string entry in Directory.GetFileSystemEntries(work))
                {
                    try
                    {
                        if (Directory.Exists(entry)) Directory.Delete(entry, true);
                        else { File.SetAttributes(entry, FileAttributes.Normal); File.Delete(entry); }
                    }
                    catch { }
                }
            }
            catch { }

            Assembly self = Assembly.GetExecutingAssembly();
            using (Stream raw = self.GetManifestResourceStream(ResourceName))
            {
                if (raw == null) return false;
                using (var zip = new ZipArchive(raw, ZipArchiveMode.Read))
                {
                    foreach (ZipArchiveEntry entry in zip.Entries)
                    {
                        if (string.IsNullOrEmpty(entry.Name)) continue;
                        string dest = Path.Combine(work, entry.FullName.Replace('/', Path.DirectorySeparatorChar));
                        string dir = Path.GetDirectoryName(dest);
                        if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
                        entry.ExtractToFile(dest, true);
                    }
                }
            }
            return true;
        }
        catch { return false; }
    }

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
}
