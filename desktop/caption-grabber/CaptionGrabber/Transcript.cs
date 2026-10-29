using System.Globalization;
using System.Text;
using System.Text.Json;
using CaptionGrabber.Capture;

namespace CaptionGrabber;

internal sealed class TranscriptEntry
{
    public string Speaker { get; set; } = "";
    public string Text { get; set; } = "";
    public DateTime Time { get; set; }
}

/// <summary>
/// Keeps every caption seen during the call. Teams rewrites the newest captions while someone is
/// still talking, so captions are tracked by their UI element and updated in place.
/// </summary>
internal sealed class Transcript
{
    private readonly List<TranscriptEntry> _entries = [];
    private readonly Dictionary<string, TranscriptEntry> _byKey = [];

    public IReadOnlyList<TranscriptEntry> Entries => _entries;
    public int Count => _entries.Count;
    public TranscriptEntry? Last => _entries.Count > 0 ? _entries[^1] : null;

    /// <returns>true when anything changed.</returns>
    public bool Apply(IReadOnlyList<ParsedCaption> captions, DateTime now)
    {
        bool changed = false;
        foreach (var c in captions)
        {
            if (_byKey.TryGetValue(c.Key, out var e))
            {
                if (e.Text != c.Text) { e.Text = c.Text; changed = true; }
                if (c.Speaker != "Unknown" && e.Speaker != c.Speaker) { e.Speaker = c.Speaker; changed = true; }
                continue;
            }

            // Teams sometimes re-creates a caption element: merge with a recent matching entry.
            e = FindRecentMatch(c);
            if (e != null)
            {
                if (c.Text.Length > e.Text.Length) { e.Text = c.Text; changed = true; }
            }
            else
            {
                e = new TranscriptEntry { Speaker = c.Speaker, Text = c.Text, Time = now };
                _entries.Add(e);
                changed = true;
            }
            _byKey[c.Key] = e;
        }
        return changed;
    }

    private TranscriptEntry? FindRecentMatch(ParsedCaption c)
    {
        for (int i = _entries.Count - 1; i >= Math.Max(0, _entries.Count - 8); i--)
        {
            var e = _entries[i];
            if (e.Speaker == c.Speaker &&
                (e.Text == c.Text || c.Text.StartsWith(e.Text, StringComparison.Ordinal) ||
                 e.Text.StartsWith(c.Text, StringComparison.Ordinal)))
                return e;
        }
        return null;
    }

    public void Clear()
    {
        _entries.Clear();
        _byKey.Clear();
    }

    /// <summary>Puts earlier entries (from the backup) in front of the current ones.</summary>
    public void Prepend(IEnumerable<TranscriptEntry> earlier) => _entries.InsertRange(0, earlier);

    /// <summary>
    /// Plain text for pasting into interview notes: one paragraph per speaker turn,
    /// in the same format as the browser grabber.
    /// </summary>
    public string ToText()
    {
        var first = _entries.Count > 0 ? _entries[0].Time : DateTime.Now;
        var sb = new StringBuilder();
        sb.Append("Teams call transcript (live captions) – ")
          .Append(first.ToString("d", CultureInfo.CurrentCulture)).Append(' ')
          .Append(first.ToString("HH:mm", CultureInfo.InvariantCulture)).Append("\r\n\r\n");

        string? speaker = null;
        var turn = new StringBuilder();
        DateTime turnTime = default;
        void Flush()
        {
            if (speaker == null) return;
            sb.Append('[').Append(turnTime.ToString("HH:mm", CultureInfo.InvariantCulture)).Append("] ")
              .Append(speaker).Append(": ").Append(turn).Append("\r\n\r\n");
        }
        foreach (var e in _entries)
        {
            if (e.Speaker == speaker) { turn.Append(' ').Append(e.Text); continue; }
            Flush();
            speaker = e.Speaker;
            turnTime = e.Time;
            turn.Clear().Append(e.Text);
        }
        Flush();
        return sb.ToString().TrimEnd() + "\r\n";
    }

    // ---- backup ----

    private sealed record Backup(DateTime SavedAt, List<TranscriptEntry> Entries);

    public string ToJson() => JsonSerializer.Serialize(new Backup(DateTime.Now, _entries));

    public static (DateTime SavedAt, List<TranscriptEntry> Entries)? FromJson(string json)
    {
        try
        {
            var b = JsonSerializer.Deserialize<Backup>(json);
            return b == null ? null : (b.SavedAt, b.Entries ?? []);
        }
        catch (JsonException)
        {
            return null;
        }
    }
}
