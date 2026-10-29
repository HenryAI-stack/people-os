namespace CaptionGrabber.Capture;

internal sealed record ParsedCaption(string Key, string Speaker, string Text);

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
            // Captions are on, but nobody has spoken yet.
            return tree.Descendants().FirstOrDefault(n =>
                n.Name.Equals("Live Captions", StringComparison.OrdinalIgnoreCase) ||
                n.AutomationId.Contains("closed-caption", StringComparison.OrdinalIgnoreCase));
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
