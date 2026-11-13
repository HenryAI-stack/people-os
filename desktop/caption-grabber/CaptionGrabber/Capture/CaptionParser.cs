namespace CaptionGrabber.Capture;

internal sealed record ParsedCaption(string Key, string Speaker, string Text);

/// <summary>One Teams window's UI tree. Hwnd identifies the window across scans.</summary>
internal sealed record WindowScan(IntPtr Hwnd, string Title, UiNode Tree);

/// <summary>Which window holds the call (Leave button) and which holds the captions; -1 when none.</summary>
internal sealed record CaptionsChoice(int CallIndex, UiNode? Hangup, int CaptionsIndex, UiNode? Captions);

/// <summary>
/// Finds the live-captions area in a Teams UI tree and turns it into (speaker, text) pairs.
/// Teams renders each caption as a "fui-ChatMessageCompact" element; the desktop app's
/// accessibility tree often exposes only its "fui-ChatMessageCompact__body" child, which holds
/// the speaker's name followed by the caption text.
/// </summary>
internal static class CaptionParser
{
    public const string ItemClass = "fui-ChatMessageCompact";
    public const string BodyClass = "fui-ChatMessageCompact__body";

    public static bool IsCaptionItem(UiNode n) => n.HasClass(ItemClass) || n.HasClass(BodyClass);

    /// <summary>The Leave button only exists while you are in a call.</summary>
    public static UiNode? FindHangup(UiNode tree) =>
        tree.Descendants().FirstOrDefault(n =>
            n.AutomationId == "hangup-button" ||
            (n.ControlType == "Button" &&
             (n.Name.Equals("Leave", StringComparison.OrdinalIgnoreCase) ||
              n.Name.StartsWith("Leave (", StringComparison.OrdinalIgnoreCase))));

    /// <summary>
    /// The element holding the caption items: the nearest ancestor of an item whose name, id or
    /// class mentions "caption". While in a call, falls back to the items' common ancestor
    /// (unless that looks like a chat list).
    /// </summary>
    public static UiNode? FindCaptionsContainer(UiNode tree, bool inMeeting)
    {
        var paths = new List<List<UiNode>>();
        CollectItemPaths(tree, [], paths);

        if (paths.Count == 0)
        {
            // Captions are on, but nobody has spoken yet. Never mistake the "Captions" button or
            // menu item (id "closed-captions-button") for the captions area.
            return tree.Descendants().FirstOrDefault(n =>
                !IsControl(n) &&
                (n.Name.Equals("Live Captions", StringComparison.OrdinalIgnoreCase) ||
                 (n.AutomationId.Contains("closed-caption", StringComparison.OrdinalIgnoreCase) &&
                  !n.AutomationId.Contains("button", StringComparison.OrdinalIgnoreCase))));
        }

        foreach (var path in paths)
        {
            // Walk up from the item; index 0 is the document (its name is the window title).
            for (int i = path.Count - 2; i >= 1; i--)
            {
                var n = path[i];
                if (n.Name.Contains("caption", StringComparison.OrdinalIgnoreCase) || n.IdOrClassContains("caption"))
                    return n;
            }
        }

        if (!inMeeting) return null;

        int depth = 0;
        while (paths.All(p => p.Count > depth + 1 && ReferenceEquals(p[depth], paths[0][depth]))) depth++;
        var lca = depth > 0 ? paths[0][depth - 1] : tree;

        bool looksLikeChat = paths[0].Take(depth).Skip(1).Any(n =>
            n.Name.Contains("chat", StringComparison.OrdinalIgnoreCase) ||
            n.Name.Contains("message", StringComparison.OrdinalIgnoreCase));
        return looksLikeChat ? null : lca;
    }

    private static bool IsControl(UiNode n) =>
        n.ControlType is "Button" or "MenuItem" or "CheckBox" or "SplitButton" or "ToggleButton";

    /// <summary>
    /// Window titles Teams gives its separate captions window ("… | Microsoft Teams | Pinned window").
    /// Only used to rank windows and to allow the looser search inside them.
    /// </summary>
    public static bool LooksLikeCaptionsWindow(string title) =>
        new[] { "pinned window", "caption", "untertitel", "napisy", "subtítulos" }
            .Any(w => title.Contains(w, StringComparison.OrdinalIgnoreCase));

    /// <summary>
    /// Picks the call window and the captions area across all Teams windows.
    /// Captions can be in the call window or in a separate window (Teams can pop the captions out).
    /// A captions area that has captions in it wins over an empty one; among equals the call window
    /// comes first, then windows that look like a captions window. Windows in <paramref name="ended"/>
    /// (a call ended there) are skipped, so a leftover panel never hides the current call's captions.
    /// </summary>
    public static CaptionsChoice Choose(IReadOnlyList<WindowScan> windows, IReadOnlySet<IntPtr> ended)
    {
        int callIdx = -1;
        UiNode? hangup = null;
        for (int i = 0; i < windows.Count && callIdx < 0; i++)
        {
            hangup = FindHangup(windows[i].Tree);
            if (hangup != null) callIdx = i;
        }

        var candidates = new List<(int Index, UiNode? Node, int Items)>();
        void Add(int i, UiNode? n)
        {
            if (n != null) candidates.Add((i, n, Parse(n).Count));
        }

        if (callIdx >= 0) Add(callIdx, FindCaptionsContainer(windows[callIdx].Tree, inMeeting: true));

        var others = Enumerable.Range(0, windows.Count)
            .Where(i => i != callIdx && !ended.Contains(windows[i].Hwnd))
            .OrderBy(i => LooksLikeCaptionsWindow(windows[i].Title) ? 0 : 1); // stable: keeps window order otherwise
        foreach (var i in others)
        {
            var w = windows[i];
            var c = FindCaptionsContainer(w.Tree, inMeeting: false);
            // In a separate captions window the items may have no "caption" ancestor: allow the looser search there.
            if (c == null && callIdx >= 0 && LooksLikeCaptionsWindow(w.Title))
                c = FindCaptionsContainer(w.Tree, inMeeting: true);
            Add(i, c);
        }

        var pick = candidates.FirstOrDefault(c => c.Items > 0);
        if (pick.Node == null) pick = candidates.FirstOrDefault();
        return pick.Node == null
            ? new CaptionsChoice(callIdx, hangup, -1, null)
            : new CaptionsChoice(callIdx, hangup, pick.Index, pick.Node);
    }

    private static void CollectItemPaths(UiNode node, List<UiNode> ancestors, List<List<UiNode>> results)
    {
        var path = new List<UiNode>(ancestors) { node };
        if (IsCaptionItem(node))
        {
            results.Add(path);
            return;
        }
        foreach (var child in node.Children) CollectItemPaths(child, path, results);
    }

    public static List<ParsedCaption> Parse(UiNode container)
    {
        var list = new List<ParsedCaption>();
        foreach (var item in Items(container))
        {
            var p = ParseItem(item);
            if (p != null) list.Add(p);
        }
        return list;
    }

    private static IEnumerable<UiNode> Items(UiNode root)
    {
        if (IsCaptionItem(root)) { yield return root; yield break; }
        foreach (var c in root.Children)
            foreach (var i in Items(c))
                yield return i;
    }

    public static ParsedCaption? ParseItem(UiNode item)
    {
        var authorNode = item.Descendants().FirstOrDefault(n => n.IdOrClassContains("author"));
        var textNode = item.Descendants().FirstOrDefault(n =>
            n.IdOrClassContains("caption-text") || n.IdOrClassContains("captiontext"));

        string speaker = authorNode?.InnerText() ?? "";
        string text = textNode?.InnerText() ?? "";

        if (speaker.Length == 0 || text.Length == 0)
        {
            // Fallback: the first piece of text is the speaker, the rest is what they said.
            var leaves = item.TextLeaves().Where(t => t.Length > 0).ToList();
            if (speaker.Length == 0 && leaves.Count > 0) speaker = leaves[0];
            if (text.Length == 0)
            {
                var rest = leaves.Count > 0 && leaves[0] == speaker ? leaves.Skip(1) : leaves;
                text = string.Join(" ", rest);
            }
        }

        speaker = Normalize(speaker);
        text = Normalize(text);
        if (text.Length == 0) return null;
        if (speaker.Length == 0) speaker = "Unknown";
        return new ParsedCaption(item.Key, speaker, text);
    }

    public static string Normalize(string s) =>
        string.Join(" ", s.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
}
