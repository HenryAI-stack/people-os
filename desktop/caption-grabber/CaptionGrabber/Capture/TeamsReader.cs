using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Automation;

namespace CaptionGrabber.Capture;

internal enum ReaderState { TeamsNotRunning, NoMeeting, CaptionsOff, Capturing }

/// <param name="Generation">Goes up every time the reader drops what it found and searches again (call
/// ended, window closed, or Rescan). Caption keys from an earlier generation may be reused by Windows.</param>
internal sealed record Snapshot(ReaderState State, string Source, IReadOnlyList<ParsedCaption> Captions, int Generation);

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
    // While the captions area we read is empty, look around now and then: the captions may have
    // moved to a separate window, or another window may be the one that fills.
    private static readonly TimeSpan EmptyScanInterval = TimeSpan.FromSeconds(5);

    private readonly CacheRequest _subtree;
    private Thread? _thread;
    private CancellationTokenSource? _cts;

    private List<Doc> _docs = [];
    private DateTime _lastWindowRefresh = DateTime.MinValue;
    private DateTime _lastFullScan = DateTime.MinValue;
    private AutomationElement? _hangup;
    private AutomationElement? _container;
    private IntPtr _containerHwnd;
    private IntPtr _hangupHwnd;
    private int _lastCaptionCount;
    private readonly HashSet<IntPtr> _endedWindows = []; // windows whose call ended; their leftover captions are ignored
    private string _source = "";
    private int _generation;
    private int _rescanRequested; // set from the UI thread, read on the reader thread

    private sealed record Doc(IntPtr Hwnd, AutomationElement Root, string Title, string Source);

    /// <summary>Raised on the reader thread about once a second.</summary>
    public event Action<Snapshot>? SnapshotTaken;

    /// <summary>Forget the current Teams window and look for a call again on the next tick (any thread).</summary>
    public void Rescan() => Interlocked.Exchange(ref _rescanRequested, 1);

    /// <summary>Drops everything found so far, so the next tick searches every Teams window from scratch.</summary>
    private void Reset(string why)
    {
        if (_container != null || _hangup != null) Log.Write($"Searching again: {why}.");
        _hangup = null;
        _hangupHwnd = IntPtr.Zero;
        _container = null;
        _containerHwnd = IntPtr.Zero;
        _lastCaptionCount = 0;
        _docs = [];
        _lastWindowRefresh = DateTime.MinValue;
        _lastFullScan = DateTime.MinValue;
        _generation++;
    }

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
                Reset("the Teams window stopped responding");
                snap = new Snapshot(ReaderState.NoMeeting, _source, [], _generation);
            }
            SnapshotTaken?.Invoke(snap);
            var wait = PollInterval - (DateTime.UtcNow - started);
            if (wait > TimeSpan.Zero) token.WaitHandle.WaitOne(wait);
        }
    }

    private Snapshot Tick()
    {
        if (Interlocked.Exchange(ref _rescanRequested, 0) == 1) Reset("Rescan clicked");

        var now = DateTime.UtcNow;
        if (now - _lastWindowRefresh > WindowRefresh)
        {
            _docs = FindDocuments();
            _lastWindowRefresh = now;
            _endedWindows.IntersectWith(_docs.Select(d => d.Hwnd)); // forget windows that are gone
            // The call window was closed or hidden: its captions area belongs to a call that is over.
            if (_container != null && !_docs.Any(d => d.Hwnd == _containerHwnd)) Reset("the call window closed");
        }
        if (_docs.Count == 0)
        {
            if (_container != null || _hangup != null) Reset("Teams closed");
            return new Snapshot(ReaderState.TeamsNotRunning, "", [], _generation);
        }

        // The Leave button went away: the call ended. Don't keep reading that call's (now empty) captions.
        // If the window still has a Leave button on the next scan (Teams only redrew it), it's taken off the list again.
        if (_hangup != null && !IsAlive(_hangup))
        {
            _endedWindows.Add(_hangupHwnd);
            if (_containerHwnd != IntPtr.Zero && _containerHwnd != _hangupHwnd) _endedWindows.Add(_containerHwnd);
            Reset("the call ended");
        }

        var interval = _hangup == null || _container == null ? FullScanInterval
                     : _lastCaptionCount == 0 ? EmptyScanInterval
                     : TimeSpan.MaxValue;
        if (interval != TimeSpan.MaxValue && now - _lastFullScan > interval)
        {
            FullScan();
            _lastFullScan = now;
        }

        if (_container != null)
        {
            try
            {
                var tree = ToNode(_container.GetUpdatedCache(_subtree));
                var captions = CaptionParser.Parse(tree);
                _lastCaptionCount = captions.Count;
                return new Snapshot(ReaderState.Capturing, _source, captions, _generation);
            }
            catch (ElementNotAvailableException)
            {
                Log.Write("Captions area disappeared (captions turned off or call ended).");
                _container = null;
                _containerHwnd = IntPtr.Zero;
                _lastCaptionCount = 0;
            }
        }

        return new Snapshot(_hangup != null ? ReaderState.CaptionsOff : ReaderState.NoMeeting, _source, [], _generation);
    }

    /// <summary>
    /// Looks through every Teams window for the call controls and the captions area. The captions can
    /// be in the call window or in Teams' separate captions window; see <see cref="CaptionParser.Choose"/>.
    /// </summary>
    private void FullScan()
    {
        var scans = new List<WindowScan>();
        var docs = new List<Doc>();
        foreach (var doc in _docs)
        {
            try
            {
                scans.Add(new WindowScan(doc.Hwnd, doc.Title, ToNode(doc.Root.GetUpdatedCache(_subtree))));
                docs.Add(doc);
            }
            catch (ElementNotAvailableException)
            {
                _lastWindowRefresh = DateTime.MinValue;
            }
        }

        // A window with a Leave button has a call running, so it isn't an ended call's window.
        foreach (var w in scans)
            if (CaptionParser.FindHangup(w.Tree) != null) _endedWindows.Remove(w.Hwnd);

        var choice = CaptionParser.Choose(scans, _endedWindows);

        if (choice.Hangup?.Source is AutomationElement hangup)
        {
            _hangup = hangup;
            _hangupHwnd = docs[choice.CallIndex].Hwnd;
            _source = docs[choice.CallIndex].Source;
        }

        if (choice.Captions?.Source is AutomationElement el)
        {
            var doc = docs[choice.CaptionsIndex];
            UseCaptions(el, doc, choice.Captions, separateWindow: choice.CaptionsIndex != choice.CallIndex && choice.CallIndex >= 0);
        }
        else if (_container != null)
        {
            Log.Write("No captions area in any open Teams window any more (captions off or call ended).");
            _container = null;
            _containerHwnd = IntPtr.Zero;
            _lastCaptionCount = 0;
            _generation++;
        }
    }

    private void UseCaptions(AutomationElement el, Doc doc, UiNode node, bool separateWindow)
    {
        if (_container != null && _containerHwnd == doc.Hwnd && SameElement(el, _container)) return; // already reading it
        if (_container != null) _generation++; // switching windows: the transcript lines up the captions still on screen
        _container = el;
        _containerHwnd = doc.Hwnd;
        _lastCaptionCount = 0;
        _source = separateWindow ? $"{doc.Source} (captions window)" : doc.Source;
        Log.Write($"Captions found in {_source} '{doc.Title}' (name='{node.Name}', id='{node.AutomationId}').");
    }

    private static bool SameElement(AutomationElement a, AutomationElement b)
    {
        try { return Automation.Compare(a, b); }
        catch (Exception ex) when (ex is ElementNotAvailableException or COMException) { return false; }
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

        var scans = new List<(Doc Doc, WindowScan? Scan, string? Error)>();
        foreach (var d in docs)
        {
            try { scans.Add((d, new WindowScan(d.Hwnd, d.Title, ToNode(d.Root.GetUpdatedCache(request))), null)); }
            catch (Exception ex) { scans.Add((d, null, $"{ex.GetType().Name}: {ex.Message}")); }
        }

        var ok = scans.Where(s => s.Scan != null).ToList();
        var choice = CaptionParser.Choose(ok.Select(s => s.Scan!).ToList(), new HashSet<IntPtr>());
        sb.AppendLine("Call window: " + (choice.CallIndex >= 0 ? $"'{ok[choice.CallIndex].Doc.Title}'" : "none"));
        sb.AppendLine("Captions: " + (choice.Captions == null ? "not found"
            : $"'{ok[choice.CaptionsIndex].Doc.Title}' (name='{choice.Captions.Name}', id='{choice.Captions.AutomationId}', class='{choice.Captions.ClassName}')"));
        if (choice.Captions != null)
            foreach (var c in CaptionParser.Parse(choice.Captions))
                sb.AppendLine($"  parsed -> {c.Speaker}: {c.Text}");

        foreach (var (d, scan, error) in scans)
        {
            sb.AppendLine();
            sb.AppendLine($"=== {d.Source}: '{d.Title}' ===");
            if (scan == null) { sb.AppendLine($"(failed: {error})"); continue; }
            int count = 0;
            Dump(sb, scan.Tree, 0, ref count);
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
