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
    private int _matchFloor; // entries before this index belong to an earlier call and are never merged into
    private bool _resync;    // the reader started over: line up the captions still on screen with captured lines

    public IReadOnlyList<TranscriptEntry> Entries => _entries;
    public int Count => _entries.Count;
    public TranscriptEntry? Last => _entries.Count > 0 ? _entries[^1] : null;

    /// <returns>true when anything changed.</returns>
    public bool Apply(IReadOnlyList<ParsedCaption> captions, DateTime now)
    {
        if (_resync && captions.Count > 0)
        {
            _resync = false;
            return Resync(captions, now);
        }

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
        for (int i = _entries.Count - 1; i >= Math.Max(_matchFloor, _entries.Count - 8); i--)
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
        _matchFloor = 0;
        _resync = false;
    }

    /// <summary>
    /// Called when the reader starts over: a new call, the captions moved to another window, or
    /// Rescan. Windows can hand out the same element ids again, so old ids are forgotten; the next
    /// captions are lined up with what was captured (see <see cref="Resync"/>).
    /// </summary>
    public void ForgetElements()
    {
        _byKey.Clear();
        _resync = true;
    }

    /// <summary>
    /// First captions after the reader started over. In the same call, Teams still shows the recent
    /// captions (in the new window or after Rescan): they're matched to the lines already captured,
    /// in order, so nothing is added twice. A caption counts as the same line only if it's the same
    /// speaker and either the same text or a longer version of a line of 12+ characters, captured in
    /// the last 10 minutes (Teams shows at most the last 5). Anything else is a new line, so a new
    /// call never changes the previous call's lines.
    /// </summary>
    private bool Resync(IReadOnlyList<ParsedCaption> captions, DateTime now)
    {
        bool changed = false;
        int startCount = _entries.Count;
        int pos = Math.Max(_matchFloor, startCount - 300);
        int firstMatch = -1;
        var cutoff = now - TimeSpan.FromMinutes(10);

        foreach (var c in captions)
        {
            int found = -1;
            for (int i = pos; i < startCount; i++)
            {
                var old = _entries[i];
                if (old.Time < cutoff || old.Speaker != c.Speaker) continue;
                if (c.Text == old.Text ||
                    (old.Text.Length >= 12 && c.Text.StartsWith(old.Text, StringComparison.Ordinal)))
                {
                    found = i;
                    break;
                }
            }

            TranscriptEntry e;
            if (found >= 0)
            {
                e = _entries[found];
                if (c.Text.Length > e.Text.Length) { e.Text = c.Text; changed = true; }
                if (firstMatch < 0) firstMatch = found;
                pos = found + 1;
            }
            else
            {
                e = new TranscriptEntry { Speaker = c.Speaker, Text = c.Text, Time = now };
                _entries.Add(e);
                pos = startCount; // later captions can't match lines captured before this one
                changed = true;
            }
            _byKey[c.Key] = e;
        }

        _matchFloor = firstMatch >= 0 ? firstMatch : startCount;
        return changed;
    }

    /// <summary>Puts earlier entries (from the backup) in front of the current ones.</summary>
    public void Prepend(IEnumerable<TranscriptEntry> earlier)
    {
        var list = earlier.ToList();
        _entries.InsertRange(0, list);
        _matchFloor += list.Count;
    }

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
