using System.Text.Json;

namespace CaptionGrabber;

internal sealed class AppSettings
{
    public int? X { get; set; }
    public int? Y { get; set; }
    public bool Minimized { get; set; }
}

/// <summary>Everything the app keeps lives in %LOCALAPPDATA%\CaptionGrabber. Nothing leaves the PC.</summary>
internal static class Storage
{
    public static readonly string Folder =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CaptionGrabber");

    private static string SettingsPath => Path.Combine(Folder, "settings.json");
    public static string BackupPath => Path.Combine(Folder, "backup.json");

    public static AppSettings LoadSettings()
    {
        try
        {
            if (File.Exists(SettingsPath))
                return JsonSerializer.Deserialize<AppSettings>(File.ReadAllText(SettingsPath)) ?? new();
        }
        catch (Exception ex) when (ex is IOException or JsonException or UnauthorizedAccessException)
        {
            Log.Write($"Settings not readable: {ex.Message}");
        }
        return new();
    }

    public static void SaveSettings(AppSettings s) => WriteSafely(SettingsPath, JsonSerializer.Serialize(s));

    public static void SaveBackup(string json) => WriteSafely(BackupPath, json);

    public static string? ReadBackup()
    {
        try { return File.Exists(BackupPath) ? File.ReadAllText(BackupPath) : null; }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { return null; }
    }

    public static void DeleteBackup()
    {
        try { File.Delete(BackupPath); }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { }
    }

    /// <summary>Write to a temp file first, so a crash mid-write never leaves a broken file.</summary>
    private static void WriteSafely(string path, string content)
    {
        try
        {
            Directory.CreateDirectory(Folder);
            var tmp = path + ".tmp";
            File.WriteAllText(tmp, content);
            File.Move(tmp, path, overwrite: true);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            Log.Write($"Could not write {Path.GetFileName(path)}: {ex.Message}");
        }
    }
}

internal static class Log
{
    private static readonly object Gate = new();

    public static void Write(string message)
    {
        try
        {
            lock (Gate)
            {
                Directory.CreateDirectory(Storage.Folder);
                var path = Path.Combine(Storage.Folder, "log.txt");
                if (File.Exists(path) && new FileInfo(path).Length > 512 * 1024) File.Delete(path);
                File.AppendAllText(path, $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} {message}{Environment.NewLine}");
            }
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { }
    }
}
