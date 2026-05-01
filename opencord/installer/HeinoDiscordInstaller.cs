/*
 * HeinoDiscord Windows installer/repair launcher.
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;

internal static class HeinoDiscordInstaller
{
    private const string ProductName = "HeinoDiscord";
    private const string RepairTaskName = "HeinoDiscord Auto Repair";
    private const string LogonTaskName = "HeinoDiscord Auto Repair On Logon";

    private sealed class DiscordInstall
    {
        public string Label;
        public string Path;
        public string ProcessName;

        public DiscordInstall(string label, string path, string processName)
        {
            Label = label;
            Path = path;
            ProcessName = processName;
        }
    }

    private sealed class InstallPatchInfo
    {
        public DiscordInstall Install;
        public DirectoryInfo LatestApp;
        public string AppAsar;
        public string OriginalAsar;
        public bool IsPatched;

        public InstallPatchInfo(DiscordInstall install, DirectoryInfo latestApp, string appAsar, string originalAsar, bool isPatched)
        {
            Install = install;
            LatestApp = latestApp;
            AppAsar = appAsar;
            OriginalAsar = originalAsar;
            IsPatched = isPatched;
        }
    }

    private static int Main(string[] args)
    {
        Console.Title = ProductName + " Installer";
        PrintHeader();

        if (args.Any(a => a == "--help" || a == "/?"))
        {
            PrintHelp();
            return 0;
        }

        try
        {
            string root = FindRoot();
            bool repairOnly = args.Any(a => a.Equals("--repair-only", StringComparison.OrdinalIgnoreCase));
            bool noStart = args.Any(a => a.Equals("--no-start", StringComparison.OrdinalIgnoreCase));
            bool withLastSeen = args.Any(a => a.Equals("--with-lastseen", StringComparison.OrdinalIgnoreCase));

            Console.WriteLine("[root] " + root);

            if (!repairOnly)
            {
                PrepareSourceBuild(root, withLastSeen);
            }

            PatchAllDiscordInstalls(root);
            RegisterAutoRepair(root);

            if (!noStart)
                StartStableDiscord();

            Console.WriteLine();
            Console.WriteLine("Done. HeinoDiscord is installed and Discord is patched.");
            Console.WriteLine("You can close this window.");
            return 0;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine();
            Console.Error.WriteLine("Install failed:");
            Console.Error.WriteLine(ex.Message);
            return 1;
        }
    }

    private static void PrintHeader()
    {
        Console.WriteLine("==================================================");
        Console.WriteLine(" HeinoDiscord");
        Console.WriteLine(" Open-source Discord client mod distribution");
        Console.WriteLine("==================================================");
        Console.WriteLine();
    }

    private static void PrintHelp()
    {
        Console.WriteLine("Usage:");
        Console.WriteLine("  HeinoDiscord.exe");
        Console.WriteLine("  HeinoDiscord.exe --repair-only");
        Console.WriteLine("  HeinoDiscord.exe --with-lastseen");
        Console.WriteLine("  HeinoDiscord.exe --no-start");
        Console.WriteLine();
        Console.WriteLine("Default install builds the local source, installs recommended");
        Console.WriteLine("plugins, applies the recommended settings profile, patches Discord,");
        Console.WriteLine("and registers automatic repair after Discord updates.");
    }

    private static string FindRoot()
    {
        string dir = AppDomain.CurrentDomain.BaseDirectory;
        for (int i = 0; i < 8 && !String.IsNullOrEmpty(dir); i++)
        {
            if (File.Exists(System.IO.Path.Combine(dir, "package.json")) &&
                Directory.Exists(System.IO.Path.Combine(dir, "opencord")))
                return dir.TrimEnd(System.IO.Path.DirectorySeparatorChar);

            DirectoryInfo parent = Directory.GetParent(dir);
            dir = parent == null ? null : parent.FullName;
        }

        throw new InvalidOperationException("Could not find HeinoDiscord source root. Keep HeinoDiscord.exe inside the project/release folder.");
    }

    private static void PrepareSourceBuild(string root, bool withLastSeen)
    {
        bool hasNode = CommandExists(root, "node --version");
        bool hasPnpm = CommandExists(root, "pnpm --version");
        string distPatcher = System.IO.Path.Combine(root, "dist", "patcher.js");

        if (!hasNode || !hasPnpm)
        {
            if (File.Exists(distPatcher))
            {
                Console.WriteLine("[deps] Node/pnpm missing, using existing prebuilt dist.");
                return;
            }

            throw new InvalidOperationException("Node.js and pnpm are required when no prebuilt dist exists. Install Node.js, then run: corepack enable");
        }

        if (!Directory.Exists(System.IO.Path.Combine(root, "node_modules")))
            Run(root, "pnpm install");

        string pluginCommand = withLastSeen
            ? "pnpm opencord:plugins -- -Plugins \"QuickTemplates,LinkSafety,TranslatorPro,LocalChatExporter,LastSeenTracker\" -PruneUserPlugins"
            : "pnpm opencord:plugins -- -Recommended -PruneUserPlugins";

        Run(root, pluginCommand);
        Run(root, "pnpm heino:profile -- recommended");
        Run(root, "pnpm run build:discord");
        Run(root, "pnpm heino:finalize-dist");
    }

    private static bool CommandExists(string root, string command)
    {
        try
        {
            return Run(root, command, true) == 0;
        }
        catch
        {
            return false;
        }
    }

    private static int Run(string root, string command)
    {
        int exitCode = Run(root, command, false);
        if (exitCode != 0)
            throw new InvalidOperationException("Command failed with exit code " + exitCode + ": " + command);
        return exitCode;
    }

    private static int Run(string root, string command, bool quiet)
    {
        if (!quiet)
            Console.WriteLine("[run] " + command);

        ProcessStartInfo info = new ProcessStartInfo();
        info.FileName = "cmd.exe";
        info.Arguments = "/d /s /c \"" + command + "\"";
        info.WorkingDirectory = root;
        info.UseShellExecute = false;
        info.CreateNoWindow = quiet;
        if (quiet)
        {
            info.RedirectStandardOutput = true;
            info.RedirectStandardError = true;
        }

        using (Process process = Process.Start(info))
        {
            process.WaitForExit();
            return process.ExitCode;
        }
    }

    private static IEnumerable<DiscordInstall> GetDiscordInstalls()
    {
        string local = Environment.GetEnvironmentVariable("LOCALAPPDATA") ??
            System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData));

        return new[]
        {
            new DiscordInstall("Stable", System.IO.Path.Combine(local, "Discord"), "Discord"),
            new DiscordInstall("Canary", System.IO.Path.Combine(local, "DiscordCanary"), "DiscordCanary"),
            new DiscordInstall("PTB", System.IO.Path.Combine(local, "DiscordPTB"), "DiscordPTB")
        }.Where(i => File.Exists(System.IO.Path.Combine(i.Path, "Update.exe")));
    }

    private static void PatchAllDiscordInstalls(string root)
    {
        string patcherPath = GetPatcherPath(root);
        if (!File.Exists(patcherPath))
            throw new FileNotFoundException("Missing built patcher. Build failed or dist is incomplete.", patcherPath);

        List<InstallPatchInfo> installs = GetDiscordInstalls()
            .Select(i => GetInstallPatchInfo(i, patcherPath))
            .Where(i => i != null)
            .ToList();

        if (installs.Count == 0)
            throw new InvalidOperationException("No Discord install found under LocalAppData.");

        List<InstallPatchInfo> needsPatch = installs.Where(i => !i.IsPatched).ToList();
        if (needsPatch.Count == 0)
        {
            foreach (InstallPatchInfo install in installs)
                Console.WriteLine("[patch] " + install.Install.Label + " already points at HeinoDiscord: " + install.LatestApp.Name);
            return;
        }

        StopDiscord();
        foreach (InstallPatchInfo install in needsPatch)
            PatchInstall(install, patcherPath);
    }

    private static void StopDiscord()
    {
        string[] processNames = new[]
        {
            "Discord", "DiscordCanary", "DiscordPTB", "DiscordDevelopment",
            "Discord Helper", "Discord Crashpad Handler"
        };

        foreach (string name in processNames)
        {
            foreach (Process process in Process.GetProcessesByName(name))
            {
                try { process.Kill(); }
                catch { }
            }
        }
    }

    private static string GetPatcherPath(string root)
    {
        string heinoPatcher = System.IO.Path.Combine(root, "dist", "HeinoDiscordPatcher.js");
        if (File.Exists(heinoPatcher))
            return heinoPatcher;

        return System.IO.Path.Combine(root, "dist", "patcher.js");
    }

    private static InstallPatchInfo GetInstallPatchInfo(DiscordInstall install, string patcherPath)
    {
        DirectoryInfo latest = GetLatestDiscordApp(install.Path);
        if (latest == null)
        {
            Console.WriteLine("[patch] Skipping " + install.Label + ": no app-* folder.");
            return null;
        }

        string resources = System.IO.Path.Combine(latest.FullName, "resources");
        string appAsar = System.IO.Path.Combine(resources, "app.asar");
        string originalAsar = System.IO.Path.Combine(resources, "_app.asar");

        if (!File.Exists(appAsar))
            throw new FileNotFoundException("Missing Discord app.asar", appAsar);

        string text = Encoding.UTF8.GetString(File.ReadAllBytes(appAsar));
        string escapedPath = patcherPath.Replace("\\", "\\\\");
        bool isPatched = text.Contains(patcherPath) || text.Contains(escapedPath);

        return new InstallPatchInfo(install, latest, appAsar, originalAsar, isPatched);
    }

    private static void PatchInstall(InstallPatchInfo info, string patcherPath)
    {
        string text = Encoding.UTF8.GetString(File.ReadAllBytes(info.AppAsar));

        if (!File.Exists(info.OriginalAsar) && !text.Contains("dist\\\\patcher.js") && !text.Contains("dist\\\\HeinoDiscordPatcher.js"))
        {
            File.Copy(info.AppAsar, info.OriginalAsar);
            Console.WriteLine("[patch] Backed up original app.asar for " + info.Install.Label + ".");
        }

        File.WriteAllBytes(info.AppAsar, CreateDiscordAsar(patcherPath));
        Console.WriteLine("[patch] Patched " + info.Install.Label + ": " + info.AppAsar);
    }

    private static DirectoryInfo GetLatestDiscordApp(string installPath)
    {
        DirectoryInfo dir = new DirectoryInfo(installPath);
        if (!dir.Exists) return null;

        return dir.GetDirectories("app-*")
            .OrderByDescending(d => d.LastWriteTimeUtc)
            .FirstOrDefault();
    }

    private static byte[] CreateDiscordAsar(string patcherPath)
    {
        string index = "require(\"" + patcherPath.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\")";
        string packageJson = "{\"name\":\"discord\",\"main\":\"index.js\"}";
        byte[] indexBytes = Encoding.UTF8.GetBytes(index);
        byte[] packageBytes = Encoding.UTF8.GetBytes(packageJson);

        string headerJson = "{\"files\":{\"index.js\":{\"size\":" + indexBytes.Length + ",\"offset\":\"0\"},\"package.json\":{\"size\":" + packageBytes.Length + ",\"offset\":\"" + indexBytes.Length + "\"}}}";
        byte[] headerBytes = Encoding.UTF8.GetBytes(headerJson);
        int padding = (4 - (headerBytes.Length % 4)) % 4;
        int pickleLength = 8 + headerBytes.Length + padding;

        using (MemoryStream stream = new MemoryStream())
        using (BinaryWriter writer = new BinaryWriter(stream))
        {
            writer.Write((UInt32)4);
            writer.Write((UInt32)pickleLength);
            writer.Write((UInt32)(headerBytes.Length + 4));
            writer.Write((UInt32)headerBytes.Length);
            writer.Write(headerBytes);
            for (int i = 0; i < padding; i++) writer.Write((byte)0);
            writer.Write(indexBytes);
            writer.Write(packageBytes);
            return stream.ToArray();
        }
    }

    private static void RegisterAutoRepair(string root)
    {
        string exe = System.IO.Path.Combine(root, "HeinoDiscord.exe");
        if (!File.Exists(exe))
            exe = System.Diagnostics.Process.GetCurrentProcess().MainModule.FileName;

        string taskCommand = "\\\"" + exe + "\\\" --repair-only --no-start";
        RunSchtasks("/Create /SC MINUTE /MO 5 /TN \"" + RepairTaskName + "\" /TR \"" + taskCommand + "\" /F");
        RunSchtasks("/Create /SC ONLOGON /TN \"" + LogonTaskName + "\" /TR \"" + taskCommand + "\" /F");
        RunSchtasks("/Change /TN \"OpenCord Auto Repatch\" /DISABLE");
        RunSchtasks("/Change /TN \"OpenCord Auto Repatch On Logon\" /DISABLE");
        RunSchtasks("/Change /TN \"Vencord Auto Repatch\" /DISABLE");
        RunSchtasks("/Change /TN \"Vencord Auto Repatch On Logon\" /DISABLE");
    }

    private static void RunSchtasks(string args)
    {
        try
        {
            ProcessStartInfo info = new ProcessStartInfo();
            info.FileName = "schtasks.exe";
            info.Arguments = args;
            info.UseShellExecute = false;
            info.RedirectStandardOutput = true;
            info.RedirectStandardError = true;
            using (Process process = Process.Start(info))
            {
                process.WaitForExit();
                string output = process.StandardOutput.ReadToEnd() + process.StandardError.ReadToEnd();
                if (process.ExitCode == 0)
                    Console.WriteLine("[task] " + output.Trim());
                else
                    Console.WriteLine("[task] skipped: " + output.Trim());
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine("[task] skipped: " + ex.Message);
        }
    }

    private static void StartStableDiscord()
    {
        string local = Environment.GetEnvironmentVariable("LOCALAPPDATA") ??
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        string updateExe = System.IO.Path.Combine(local, "Discord", "Update.exe");

        if (!File.Exists(updateExe))
            return;

        ProcessStartInfo info = new ProcessStartInfo();
        info.FileName = updateExe;
        info.Arguments = "--processStart Discord.exe";
        info.UseShellExecute = false;
        Process.Start(info);
    }
}
