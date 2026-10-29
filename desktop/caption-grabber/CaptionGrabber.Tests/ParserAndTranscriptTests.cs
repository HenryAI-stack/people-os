using CaptionGrabber;
using CaptionGrabber.Capture;
using Xunit;

namespace CaptionGrabber.Tests;

public class ParserAndTranscriptTests
{
    private static UiNode Text(string name) => new() { ControlType = "Text", Name = name, Key = Guid.NewGuid().ToString() };

    /// <summary>A caption item as the Teams desktop app exposes it: body → author + caption text.</summary>
    private static UiNode Caption(string key, string speaker, string text) => new()
    {
        Key = key,
        ControlType = "Group",
        ClassName = "fui-ChatMessageCompact__body ___x1y2z3",
        Children =
        [
            new UiNode { ControlType = "Group", AutomationId = "author", Children = [Text(speaker)] },
            new UiNode { ControlType = "Group", AutomationId = "closed-caption-text", Children = [Text(text)] },
        ],
    };

    private static UiNode MeetingTree(params UiNode[] captions) => new()
    {
        Name = "Interview | Microsoft Teams",
        ControlType = "Document",
        Children =
        [
            new UiNode { ControlType = "Button", AutomationId = "hangup-button", Name = "Leave" },
            new UiNode
            {
                ControlType = "Group", Name = "Live Captions",
                Children = [new UiNode { ControlType = "List", Children = [.. captions] }],
            },
        ],
    };

    [Fact]
    public void Finds_leave_button_and_captions_area()
    {
        var tree = MeetingTree(Caption("1", "Anna Kowalska", "Hi Max."));
        Assert.NotNull(CaptionParser.FindHangup(tree));
        var container = CaptionParser.FindCaptionsContainer(tree, inMeeting: true);
        Assert.Equal("Live Captions", container?.Name);
    }

    [Fact]
    public void Parses_speaker_and_text()
    {
        var tree = MeetingTree(Caption("1", "Anna Kowalska", "Hi Max,   thanks for having me."));
        var parsed = CaptionParser.Parse(CaptionParser.FindCaptionsContainer(tree, true)!);
        var c = Assert.Single(parsed);
        Assert.Equal("Anna Kowalska", c.Speaker);
        Assert.Equal("Hi Max, thanks for having me.", c.Text);
    }

    [Fact]
    public void Falls_back_to_first_text_as_speaker()
    {
        var item = new UiNode
        {
            Key = "9", ClassName = "fui-ChatMessageCompact",
            Children = [Text("Max"), Text("Tell me about your last role.")],
        };
        var c = CaptionParser.ParseItem(item);
        Assert.Equal("Max", c?.Speaker);
        Assert.Equal("Tell me about your last role.", c?.Text);
    }

    [Fact]
    public void Ignores_chat_lists_outside_a_call()
    {
        var chat = new UiNode
        {
            ControlType = "Document",
            Children = [new UiNode { Name = "Chat messages", Children = [Caption("1", "Kim", "Lunch?")] }],
        };
        Assert.Null(CaptionParser.FindCaptionsContainer(chat, inMeeting: false));
    }

    [Fact]
    public void Updates_a_growing_caption_in_place()
    {
        var t = new Transcript();
        var now = new DateTime(2026, 10, 29, 11, 0, 0);
        t.Apply([new ParsedCaption("1", "Anna", "Hi Max")], now);
        t.Apply([new ParsedCaption("1", "Anna", "Hi Max, thanks for having me.")], now);
        var e = Assert.Single(t.Entries);
        Assert.Equal("Hi Max, thanks for having me.", e.Text);
    }

    [Fact]
    public void Merges_a_recreated_caption_element()
    {
        var t = new Transcript();
        var now = DateTime.Now;
        t.Apply([new ParsedCaption("1", "Max", "Sure. Tell me about")], now);
        t.Apply([new ParsedCaption("2", "Max", "Sure. Tell me about your last role.")], now);
        Assert.Single(t.Entries);
        Assert.Equal("Sure. Tell me about your last role.", t.Entries[0].Text);
    }

    [Fact]
    public void Text_has_one_paragraph_per_speaker_turn()
    {
        var t = new Transcript();
        var at11 = new DateTime(2026, 10, 29, 11, 0, 0);
        t.Apply([
            new ParsedCaption("1", "Anna", "Hi Max."),
            new ParsedCaption("2", "Max", "Welcome."),
            new ParsedCaption("3", "Anna", "I led a team of eight."),
            new ParsedCaption("4", "Anna", "Mostly in Warsaw."),
        ], at11);
        var text = t.ToText();
        Assert.Contains("[11:00] Anna: Hi Max.\r\n\r\n[11:00] Max: Welcome.\r\n\r\n[11:00] Anna: I led a team of eight. Mostly in Warsaw.", text);
        Assert.StartsWith("Teams call transcript (live captions)", text);
    }

    [Fact]
    public void Backup_round_trips()
    {
        var t = new Transcript();
        t.Apply([new ParsedCaption("1", "Anna", "Hi.")], DateTime.Now);
        var restored = Transcript.FromJson(t.ToJson());
        Assert.NotNull(restored);
        Assert.Equal("Hi.", restored.Value.Entries[0].Text);
    }
}
