namespace CaptionGrabber.Capture;

/// <summary>
/// A plain snapshot of one UI Automation element, so the parsing logic can be tested without Windows.
/// Teams draws its interface with WebView2, which maps the page to UI Automation like this:
/// HTML id → AutomationId, HTML class → ClassName, text → Text elements whose Name is the text.
/// </summary>
internal class UiNode
{
    public string Key { get; init; } = "";
    public string Name { get; init; } = "";
    public string ClassName { get; init; } = "";
    public string AutomationId { get; init; } = "";
    public string ControlType { get; init; } = "";
    public List<UiNode> Children { get; init; } = [];

    /// <summary>The live UI Automation element this node came from (null in tests).</summary>
    public object? Source { get; init; }

    public bool HasClass(string cssClass) =>
        ClassName.Split(' ', StringSplitOptions.RemoveEmptyEntries).Contains(cssClass, StringComparer.Ordinal);

    public bool IdOrClassContains(string fragment) =>
        AutomationId.Contains(fragment, StringComparison.OrdinalIgnoreCase) ||
        ClassName.Contains(fragment, StringComparison.OrdinalIgnoreCase);

    public IEnumerable<UiNode> Descendants()
    {
        foreach (var child in Children)
        {
            yield return child;
            foreach (var d in child.Descendants()) yield return d;
        }
    }

    /// <summary>The visible text pieces under this node, in reading order.</summary>
    public IEnumerable<string> TextLeaves()
    {
        if (ControlType == "Text" && !string.IsNullOrWhiteSpace(Name))
        {
            yield return Name.Trim(); // a Text element's Name already includes its children's text
            yield break;
        }
        foreach (var child in Children)
            foreach (var t in child.TextLeaves())
                yield return t;
    }

    public string InnerText()
    {
        var parts = TextLeaves().ToList();
        return parts.Count == 0 ? Name.Trim() : string.Join(" ", parts);
    }
}
