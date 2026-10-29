using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Automation;

namespace CaptionGrabber.Capture;

internal enum ReaderState { TeamsNotRunning, NoMeeting, CaptionsOff, Capturing }

internal sealed record Snapshot(ReaderState State, string Source, IReadOnlyList<ParsedCaption> Captions);

/// <summary>
/// Reads Teams live captions through Windows UI Automation (the accessibility interface screen
/// readers use). Works with the new Teams desktop app (ms-teams.exe) and with Teams open in
/// Edge or Chrome. Read-only: it never clicks, types or changes anything in Teams.
/// </summary>
internal sealed class TeamsReader : IDisposable
{
    private static readonly string[] TeamsProcesses = ["ms-teams", "Teams"];
    private static readonly string[] BrowserProcesses = ["msedge", "chrome"];

    private static readonly TimeSpan PollInterval = TimeSpan.FromMilliseconds(800);
    private static readonly TimeSpan WindowRefresh = TimeSpan.FromSeconds(3);
    private static readonly TimeSpan FullScanInterval = TimeSpan.FromSeconds(3);

    private readonly CacheRequest _subtree;
    private Thread? _thread;
    private CancellationTokenSource? _cts;

    private List<Doc> _docs = [];
    private DateTime _lastWindowRefresh = DateTime.MinValue;
    private DateTime _lastFullScan = DateTime.MinValue;
    private AutomationElement? _hangup;
    private AutomationElement? _container;
    private string _source = "";

    private sealed record Doc(IntPtr Hwnd, AutomationElement Root, string Title, string Source);

    /// <summary>Raised on the reader thread about once a second.</summary>
    public event Action<Snapshot>? SnapshotTaken;

    public TeamsReader() => _subtree = NewRequest();

    /// <summary>One request per thread: fetch a whole subtree with the few properties the parser needs.</summary>
    private static CacheRequest NewRequest()
    {
        var r = new CacheRequest
        {
            TreeScope = TreeScope.Subtree,
            TreeFilter = Automation.RawViewCondition,
            AutomationElementMode = AutomationElementMode.Full,
        };
        r.Add(AutomationElement.NameProperty);
        r.Add(AutomationElement.ClassNameProperty);
        r.Add(AutomationElement.AutomationIdProperty);
        r.Add(AutomationElement.ControlTypeProperty);
        r.Add(AutomationElement.RuntimeIdProperty);
        return r;
    }

    public void Start()
    {
        if (_thread != null) return;
        _cts = new CancellationTokenSource();
        var token = _cts.Token;
        _thread = new Thread(() => Run(token)) { IsBackground = true, Name = "Caption reader" };
        _thread.SetApartmentState(ApartmentState.MTA); // UI Automation clients belong on an MTA thread
        _thread.Start();
    }

    public void Dispose()
    {
        _cts?.Cancel();
        _thread?.Join(TimeSpan.FromSeconds(3));
        _thread = null;
    }

    private void Run(CancellationToken token)
    {
        while (!token.IsCancellationRequested)
        {
            var started = DateTime.UtcNow;
            Snapshot snap;
            try
            {
                snap = Tick();
            }
            catch (Exception ex)
            {
                Log.Write($"Tick failed: {ex.GetType().Name}: {ex.Message}");
                _hangup = null;
                _container = null;
                _lastWindowRefresh = DateTime.MinValue;
                snap = new Snapshot(ReaderState.NoMeeting, _source, []);
            }
            SnapshotTaken?.Invoke(snap);
            var wait = PollInterval - (DateTime.UtcNow - started);
            if (wait > TimeSpan.Zero) token.WaitHandle.WaitOne(wait);
        }
    }

    private Snapshot Tick()
    {
        var now = DateTime.UtcNow;
        if (now - _lastWindowRefresh > WindowRefresh)
        {
            _docs = FindDocuments();
            _lastWindowRefresh = now;
        }
        if (_docs.Count == 0)
        {
            _hangup = null;
            _container = null;
            return new Snapshot(ReaderState.TeamsNotRunning, "", []);
        }

        if (_hangup != null && !IsAlive(_hangup)) _hangup = null;

        if ((_hangup == null || _container == null) && now - _lastFullScan > FullScanInterval)
        {
            FullScan();
            _lastFullScan = now;
        }

        if (_container != null)
        {
            try
            {
                var tree = ToNode(_container.GetUpdatedCache(_subtree));
                return new Snapshot(ReaderState.Capturing, _source, CaptionParser.Parse(tree));
            }
            catch (ElementNotAvailableException)
            {
                Log.Write("Captions area disappeared (captions turned off or call ended).");
                _container = null;
            }
        }

        return new Snapshot(_hangup != null ? ReaderState.CaptionsOff : ReaderState.NoMeeting, _source, []);
    }

    private void FullScan()
    {
        foreach (var doc in _docs)
        {
            UiNode tree;
            try
            {
                tree = ToNode(doc.Root.GetUpdatedCache(_subtree));
            }
            catch (ElementNotAvailableException)
            {
                _lastWindowRefresh = DateTime.MinValue;
                continue;
            }

            var hangup = CaptionParser.FindHangup(tree);
            if (hangup != null)
            {
                _hangup = (AutomationElement?)hangup.Source;
                _source = doc.Source;
            }
            if (_container == null)
            {
                var c = CaptionParser.FindCaptionsContainer(tree, inMeeting: hangup != null || _hangup != null);
                if (c?.Source is AutomationElement el)
                {
                    _container = el;
                    _source = doc.Source;
                    Log.Write($"Captions found in {doc.Source} (name='{c.Name}', id='{c.AutomationId}').");
                }
            }
        }
    }

    /// <summary>The web content areas of every visible Teams window (desktop app or browser tab).</summary>
    private static List<Doc> FindDocuments()
    {
        var teamsPids = Pids(TeamsProcesses);
        var browserPids = Pids(BrowserProcesses);
        var docs = new List<Doc>();
        if (teamsPids.Count == 0 && browserPids.Count == 0) return docs;

        foreach (var top in Native.TopLevelWindows())
        {
            if (!Native.IsWindowVisible(top)) continue;
            Native.GetWindowThreadProcessId(top, out var pid);
            var title = Native.GetTitle(top);
            string source;
            if (teamsPids.Contains(pid)) source = "Teams app";
            else if (browserPids.Contains(pid) && title.Contains("Microsoft Teams", StringComparison.OrdinalIgnoreCase)) source = "Teams in browser";
            else continue;

            foreach (var child in Native.ChildWindows(top))
            {
                if (Native.GetClass(child) != "Chrome_RenderWidgetHostHWND") continue;
                try
                {
                    docs.Add(new Doc(child, AutomationElement.FromHandle(child), title, source));
                }
                catch (Exception ex) when (ex is ElementNotAvailableException or COMException or ArgumentException)
                {
                    Log.Write($"Could not attach to '{title}': {ex.Message}");
                }
            }
        }
        return docs;
    }

    private static HashSet<uint> Pids(string[] names)
    {
        var set = new HashSet<uint>();
        foreach (var name in names)
            foreach (var p in Process.GetProcessesByName(name))
                using (p) set.Add((uint)p.Id);
        return set;
    }

    private static UiNode ToNode(AutomationElement e)
    {
        var children = new List<UiNode>();
        AutomationElementCollection? cached = null;
        try { cached = e.CachedChildren; } catch (InvalidOperationException) { }
        if (cached != null)
            foreach (AutomationElement child in cached)
                children.Add(ToNode(child));

        var runtimeId = e.GetCachedPropertyValue(AutomationElement.RuntimeIdProperty) as int[];
        var type = e.GetCachedPropertyValue(AutomationElement.ControlTypeProperty) as ControlType;
        return new UiNode
        {
            Source = e,
            Key = runtimeId == null ? Guid.NewGuid().ToString("N") : string.Join(".", runtimeId),
            Name = e.GetCachedPropertyValue(AutomationElement.NameProperty) as string ?? "",
            ClassName = e.GetCachedPropertyValue(AutomationElement.ClassNameProperty) as string ?? "",
            AutomationId = e.GetCachedPropertyValue(AutomationElement.AutomationIdProperty) as string ?? "",
            ControlType = type?.ProgrammaticName.Replace("ControlType.", "") ?? "",
            Children = children,
        };
    }

    private static bool IsAlive(AutomationElement e)
    {
        try { _ = e.Current.ControlType; return true; }
        catch (ElementNotAvailableException) { return false; }
        catch (COMException) { return false; }
    }

    // ---- Diagnostics ----

    /// <summary>
    /// Text dump of the Teams UI trees, used to adapt the parser if Teams changes its page structure.
    /// Runs on the caller's thread; call it from a background task.
    /// </summary>
    public string DumpTrees()
    {
        var sb = new StringBuilder();
        var request = NewRequest();
        var docs = FindDocuments();
        sb.AppendLine($"Caption Grabber diagnostics – {DateTime.Now:yyyy-MM-dd HH:mm:ss}");
        sb.AppendLine($"Windows: {Environment.OSVersion}  App: {Application.ProductVersion}");
        sb.AppendLine($"Teams windows found: {docs.Count}");
        foreach (var d in docs)
        {
            sb.AppendLine();
            sb.AppendLine($"=== {d.Source}: '{d.Title}' ===");
            try
            {
                var tree = ToNode(d.Root.GetUpdatedCache(request));
                var hangup = CaptionParser.FindHangup(tree);
                var container = CaptionParser.FindCaptionsContainer(tree, hangup != null);
                sb.AppendLine($"Leave button: {(hangup != null ? "found" : "not found")}; captions: " +
                              (container == null ? "not found" : $"'{container.Name}' id='{container.AutomationId}' class='{container.ClassName}'"));
                if (container != null)
                    foreach (var c in CaptionParser.Parse(container))
                        sb.AppendLine($"  parsed -> {c.Speaker}: {c.Text}");
                int count = 0;
                Dump(sb, tree, 0, ref count);
            }
            catch (Exception ex)
            {
                sb.AppendLine($"(failed: {ex.GetType().Name}: {ex.Message})");
            }
        }
        return sb.ToString();
    }

    private static void Dump(StringBuilder sb, UiNode n, int depth, ref int count)
    {
        if (++count > 25000 || depth > 80) return;
        static string Cut(string s, int max) => (s.Length > max ? s[..max] + "…" : s).ReplaceLineEndings(" ");
        sb.Append(' ', depth * 2).Append('[').Append(n.ControlType).Append(']');
        if (n.Name.Length > 0) sb.Append(" name=\"").Append(Cut(n.Name, 80)).Append('"');
        if (n.AutomationId.Length > 0) sb.Append(" id=\"").Append(Cut(n.AutomationId, 80)).Append('"');
        if (n.ClassName.Length > 0) sb.Append(" class=\"").Append(Cut(n.ClassName, 100)).Append('"');
        sb.AppendLine();
        foreach (var c in n.Children) Dump(sb, c, depth + 1, ref count);
    }
}
