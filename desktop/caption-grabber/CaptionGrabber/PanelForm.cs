using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using CaptionGrabber.Capture;

namespace CaptionGrabber;

/// <summary>
/// The small always-on-top panel, styled like the browser version: live status, last caption,
/// Copy transcript, Save .txt, Pause, Clear, minimize to one line, drag by the title.
/// </summary>
internal sealed class PanelForm : Form
{
    private static readonly Color Bg = ColorTranslator.FromHtml("#1b1d27");
    private static readonly Color Fg = ColorTranslator.FromHtml("#f3f3f6");
    private static readonly Color Muted = ColorTranslator.FromHtml("#c9cbd6");
    private static readonly Color Dim = ColorTranslator.FromHtml("#a8abbb");
    private static readonly Color Inset = ColorTranslator.FromHtml("#11131a");
    private static readonly Color Line = ColorTranslator.FromHtml("#3a3e52");
    private static readonly Color BtnBg = ColorTranslator.FromHtml("#2a2e3d");
    private static readonly Color BtnHover = ColorTranslator.FromHtml("#353a4d");
    private static readonly Color BtnLine = ColorTranslator.FromHtml("#4a4f63");
    private static readonly Color Accent = ColorTranslator.FromHtml("#f2c94c");
    private static readonly Color AccentHover = ColorTranslator.FromHtml("#f6d877");
    private static readonly Color AccentFg = ColorTranslator.FromHtml("#1b1d27");
    private static readonly Color Ok = ColorTranslator.FromHtml("#7ee2a8");

    private readonly TeamsReader _reader = new();
    private readonly Transcript _transcript = new();
    private readonly AppSettings _settings = Storage.LoadSettings();
    private readonly System.Windows.Forms.Timer _backupTimer = new() { Interval = 10_000 };
    private readonly System.Windows.Forms.Timer _toastTimer = new() { Interval = 3500 };
    private readonly System.Windows.Forms.Timer _clearTimer = new() { Interval = 3000 };
    private readonly ToolTip _tips = new();

    private ReaderState _state = ReaderState.TeamsNotRunning;
    private string _source = "";
    private bool _paused, _mini, _unsaved, _backupDue, _clearArmed;
    private List<TranscriptEntry>? _earlier;

    private readonly int _width;
    private readonly TableLayoutPanel _root, _titleBar;
    private readonly FlowLayoutPanel _titleLeft, _titleRight, _row1, _row2;
    private readonly Label _title, _miniInfo, _status, _last, _toast;
    private readonly Button _miniCopy, _minBtn, _closeBtn, _copyBtn, _saveBtn, _pauseBtn, _clearBtn, _restoreBtn;
    private readonly LinkLabel _diag;

    public PanelForm()
    {
        Text = "Caption Grabber";
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.Manual;
        TopMost = true;
        ShowInTaskbar = true;
        AutoScaleMode = AutoScaleMode.None;
        AutoSize = true;
        AutoSizeMode = AutoSizeMode.GrowAndShrink;
        BackColor = Bg;
        ForeColor = Fg;
        Font = new Font("Segoe UI", 9F);
        Padding = new Padding(1); // room for the 1px border painted in OnPaint
        try { Icon = Icon.ExtractAssociatedIcon(Environment.ProcessPath ?? Application.ExecutablePath); } catch (Exception) { }

        _width = S(280);

        // ---- title row ----
        _title = new Label { Text = "Caption Grabber", AutoSize = true, Font = new Font("Segoe UI", 9.5F, FontStyle.Bold), Margin = new Padding(0, S(5), S(8), 0) };
        _miniInfo = new Label { AutoSize = true, ForeColor = Muted, Margin = new Padding(0, S(6), 0, 0), Visible = false };
        _titleLeft = new FlowLayoutPanel { AutoSize = true, WrapContents = false, Margin = Padding.Empty };
        _titleLeft.Controls.AddRange([_title, _miniInfo]);

        _miniCopy = MakeButton("Copy", primary: true);
        _miniCopy.Margin = new Padding(0, S(1), S(4), 0);
        _miniCopy.Visible = false;
        _miniCopy.Click += (_, _) => CopyTranscript();
        _minBtn = MakeIconButton("–", "Minimize to one line");
        _minBtn.Click += (_, _) => SetMini(!_mini, persist: true);
        _closeBtn = MakeIconButton("×", "Close Caption Grabber");
        _closeBtn.Click += (_, _) => Close();
        _titleRight = new FlowLayoutPanel { AutoSize = true, WrapContents = false, Margin = Padding.Empty, Anchor = AnchorStyles.Top | AnchorStyles.Right };
        _titleRight.Controls.AddRange([_miniCopy, _minBtn, _closeBtn]);

        _titleBar = new TableLayoutPanel { AutoSize = true, ColumnCount = 2, RowCount = 1, Margin = Padding.Empty, Cursor = Cursors.SizeAll };
        _titleBar.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        _titleBar.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        _titleBar.Controls.Add(_titleLeft, 0, 0);
        _titleBar.Controls.Add(_titleRight, 1, 0);
        foreach (Control c in new Control[] { _titleBar, _titleLeft, _title, _miniInfo })
            c.MouseDown += DragWindow;

        // ---- body ----
        _status = new Label { AutoSize = true, ForeColor = Muted, Margin = new Padding(0, S(4), 0, S(6)) };
        _last = new Label
        {
            AutoSize = true, BackColor = Inset, ForeColor = Accent,
            Padding = new Padding(S(8), S(6), S(8), S(6)), Margin = new Padding(0, 0, 0, S(8)),
        };

        _copyBtn = MakeButton("Copy transcript", primary: true);
        _copyBtn.Click += (_, _) => CopyTranscript();
        _saveBtn = MakeButton("Save .txt");
        _saveBtn.Click += (_, _) => SaveTranscript();
        _row1 = new FlowLayoutPanel { AutoSize = true, WrapContents = true, Margin = new Padding(0, 0, 0, S(6)) };
        _row1.Controls.AddRange([_copyBtn, _saveBtn]);

        _pauseBtn = MakeButton("Pause");
        _pauseBtn.Click += (_, _) => { _paused = !_paused; _pauseBtn.Text = _paused ? "Resume" : "Pause"; Render(); };
        _clearBtn = MakeButton("Clear");
        _clearBtn.Click += (_, _) => ClearClicked();
        _restoreBtn = MakeButton("Restore earlier");
        _restoreBtn.Visible = false;
        _restoreBtn.Click += (_, _) => RestoreEarlier();
        _row2 = new FlowLayoutPanel { AutoSize = true, WrapContents = true, Margin = Padding.Empty };
        _row2.Controls.AddRange([_pauseBtn, _clearBtn, _restoreBtn]);

        _toast = new Label { AutoSize = true, ForeColor = Ok, Margin = new Padding(0, S(6), 0, 0) };
        _diag = new LinkLabel
        {
            Text = "Not capturing? Save diagnostics", AutoSize = true, Margin = new Padding(0, S(6), 0, 0),
            LinkColor = Dim, ActiveLinkColor = Fg, VisitedLinkColor = Dim, LinkBehavior = LinkBehavior.HoverUnderline,
        };
        _diag.LinkClicked += async (_, _) => await SaveDiagnostics();
        _tips.SetToolTip(_diag, "Saves a description of the Teams window to your Documents folder, so the grabber can be fixed if Teams changed.");

        _root = new TableLayoutPanel
        {
            AutoSize = true, AutoSizeMode = AutoSizeMode.GrowAndShrink, ColumnCount = 1,
            Padding = new Padding(S(12), S(6), S(8), S(12)), Margin = Padding.Empty, BackColor = Bg,
        };
        _root.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        foreach (var c in new Control[] { _titleBar, _status, _last, _row1, _row2, _toast, _diag })
            _root.Controls.Add(c);
        Controls.Add(_root);

        _backupTimer.Tick += (_, _) => SaveBackupIfDue();
        _toastTimer.Tick += (_, _) => { _toastTimer.Stop(); SetText(_toast, ""); _toast.Visible = false; _miniCopy.Text = "Copy"; };
        _clearTimer.Tick += (_, _) => { _clearTimer.Stop(); _clearArmed = false; _clearBtn.Text = "Clear"; };

        LoadEarlierBackup();
        SetMini(_settings.Minimized, persist: false);
        Render();

        _reader.SnapshotTaken += snap =>
        {
            if (!IsHandleCreated || IsDisposed) return;
            try { BeginInvoke(new Action(() => OnSnapshot(snap))); }
            catch (Exception ex) when (ex is InvalidOperationException or ObjectDisposedException) { }
        };
    }

    // ---------------------------------------------------------------- window behaviour

    protected override CreateParams CreateParams
    {
        get
        {
            const int WS_MINIMIZEBOX = 0x20000, WS_SYSMENU = 0x80000;
            var cp = base.CreateParams;
            cp.Style |= WS_MINIMIZEBOX | WS_SYSMENU; // lets the taskbar button minimize and restore the panel
            return cp;
        }
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        int round = Native.DWMWCP_ROUND; // rounded corners on Windows 11; ignored on Windows 10
        try { Native.DwmSetWindowAttribute(Handle, Native.DWMWA_WINDOW_CORNER_PREFERENCE, ref round, sizeof(int)); } catch (Exception) { }
    }

    protected override void OnLoad(EventArgs e)
    {
        base.OnLoad(e);
        PerformLayout();
        var wanted = _settings.X is int x && _settings.Y is int y ? new Point(x, y) : (Point?)null;
        if (wanted is Point p && Screen.AllScreens.Any(s => s.WorkingArea.Contains(p))) Location = p;
        else
        {
            var wa = Screen.PrimaryScreen?.WorkingArea ?? new Rectangle(0, 0, 1280, 720);
            Location = new Point(wa.Right - Width - S(24), wa.Bottom - Height - S(96));
        }
        KeepOnScreen();
        _backupTimer.Start();
        _reader.Start();
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        using var pen = new Pen(Line);
        e.Graphics.DrawRectangle(pen, 0, 0, Width - 1, Height - 1);
    }

    protected override void OnResizeEnd(EventArgs e)
    {
        base.OnResizeEnd(e);
        KeepOnScreen();
        SaveSettings();
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (_unsaved && _transcript.Count > 0 && e.CloseReason == CloseReason.UserClosing)
        {
            var answer = MessageBox.Show(this,
                "The transcript hasn't been copied or saved yet.\n\nClose Caption Grabber anyway? A backup is kept, and you can restore it the next time you start the app.",
                "Caption Grabber", MessageBoxButtons.YesNo, MessageBoxIcon.Question, MessageBoxDefaultButton.Button2);
            if (answer != DialogResult.Yes) { e.Cancel = true; return; }
        }
        _backupDue = _transcript.Count > 0;
        SaveBackupIfDue();
        SaveSettings();
        _reader.Dispose();
        base.OnFormClosing(e);
    }

    private void DragWindow(object? sender, MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Left) return;
        Native.ReleaseCapture();
        Native.SendMessage(Handle, Native.WM_NCLBUTTONDOWN, (IntPtr)Native.HTCAPTION, IntPtr.Zero);
    }

    private void KeepOnScreen()
    {
        var wa = Screen.FromControl(this).WorkingArea;
        int x = Math.Min(Math.Max(Left, wa.Left), wa.Right - Width);
        int y = Math.Min(Math.Max(Top, wa.Top), wa.Bottom - Height);
        if (x != Left || y != Top) Location = new Point(x, y);
    }

    private void SaveSettings()
    {
        if (WindowState != FormWindowState.Normal) return;
        _settings.X = Left;
        _settings.Y = Top;
        _settings.Minimized = _mini;
        Storage.SaveSettings(_settings);
    }

    private void SetMini(bool on, bool persist)
    {
        _mini = on;
        SuspendLayout();
        foreach (var c in new Control[] { _status, _last, _row1, _row2, _diag }) c.Visible = !on;
        _toast.Visible = !on && _toast.Text.Length > 0;
        _miniInfo.Visible = on;
        _miniCopy.Visible = on;
        _minBtn.Text = on ? "▢" : "–";
        _tips.SetToolTip(_minBtn, on ? "Expand" : "Minimize to one line");

        var w = on ? 0 : _width;
        _titleBar.MinimumSize = new Size(w, 0);
        foreach (var c in new Control[] { _status, _last, _toast, _diag })
        {
            c.MinimumSize = new Size(_width, 0);
            c.MaximumSize = new Size(_width, c == _last ? S(64) : 0);
        }
        _row1.MaximumSize = _row2.MaximumSize = new Size(_width + S(8), 0);
        _root.Padding = on ? new Padding(S(12), S(4), S(6), S(4)) : new Padding(S(12), S(6), S(8), S(12));
        ResumeLayout(true);
        if (IsHandleCreated) KeepOnScreen();
        if (persist) SaveSettings();
        Render();
    }

    // ---------------------------------------------------------------- capture

    private void OnSnapshot(Snapshot snap)
    {
        _state = snap.State;
        if (snap.Source.Length > 0) _source = snap.Source;
        if (!_paused && snap.Captions.Count > 0 && _transcript.Apply(snap.Captions, DateTime.Now))
        {
            _unsaved = true;
            _backupDue = true;
        }
        Render();
    }

    private void Render()
    {
        int n = _transcript.Count;
        string lines = n == 1 ? "1 line" : $"{n} lines";
        string status;
        string icon;
        Color color = Muted;
        if (_paused) { status = $"⏸ Paused · {lines}"; icon = "⏸"; }
        else switch (_state)
        {
            case ReaderState.Capturing:
                status = $"● Capturing from {_source} · {lines}"; icon = "●"; color = Ok; break;
            case ReaderState.CaptionsOff:
                status = $"⚠ Turn on live captions in Teams: More (…) → Language and speech → Show live captions · {lines}"; icon = "⚠"; color = Accent; break;
            case ReaderState.NoMeeting:
                status = $"Waiting for a Teams call with live captions · {lines}"; icon = "○"; break;
            default:
                status = $"Teams isn't open. Start Teams and join your call · {lines}"; icon = "○"; break;
        }
        SetText(_status, status);
        _status.ForeColor = color;
        SetText(_miniInfo, $"{icon} {lines}");
        _miniInfo.ForeColor = color;
        _tips.SetToolTip(_miniInfo, status);

        var last = _transcript.Last;
        SetText(_last, last == null ? "Captions appear here as people speak." : $"{last.Speaker}: {Tail(last.Text, 160)}");
        _last.ForeColor = last == null ? Dim : Accent;
    }

    private static string Tail(string s, int max) => s.Length <= max ? s : "…" + s[^max..];

    // ---------------------------------------------------------------- actions

    private void CopyTranscript()
    {
        if (_transcript.Count == 0) { Flash("Nothing captured yet."); return; }
        var text = _transcript.ToText();
        for (int attempt = 0; attempt < 5; attempt++)
        {
            try
            {
                Clipboard.SetText(text, TextDataFormat.UnicodeText);
                _unsaved = false;
                Flash($"Copied {_transcript.Count} lines. Paste them into the interview notes.");
                if (_mini) _miniCopy.Text = "Copied ✓";
                return;
            }
            catch (ExternalException)
            {
                Thread.Sleep(120); // another app is holding the clipboard
            }
        }
        Flash("The clipboard is busy. Try again, or use Save .txt.");
    }

    private void SaveTranscript()
    {
        if (_transcript.Count == 0) { Flash("Nothing captured yet."); return; }
        var first = _transcript.Entries[0].Time;
        using var dlg = new SaveFileDialog
        {
            Title = "Save transcript",
            Filter = "Text file (*.txt)|*.txt",
            FileName = $"teams-transcript-{first:yyyy-MM-dd-HHmm}.txt",
            InitialDirectory = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
        };
        if (dlg.ShowDialog(this) != DialogResult.OK) return;
        try
        {
            File.WriteAllText(dlg.FileName, _transcript.ToText(), new UTF8Encoding(encoderShouldEmitUTF8Identifier: true));
            _unsaved = false;
            Flash($"Saved {Path.GetFileName(dlg.FileName)}");
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            Flash($"Couldn't save: {ex.Message}");
        }
    }

    private void ClearClicked()
    {
        if (!_clearArmed)
        {
            _clearArmed = true;
            _clearBtn.Text = "Click again to clear";
            _clearTimer.Stop();
            _clearTimer.Start();
            return;
        }
        _clearTimer.Stop();
        _clearArmed = false;
        _clearBtn.Text = "Clear";
        _transcript.Clear();
        _unsaved = false;
        _backupDue = false;
        Storage.DeleteBackup();
        Flash("Transcript cleared.");
        Render();
    }

    private void LoadEarlierBackup()
    {
        var json = Storage.ReadBackup();
        if (json == null) return;
        var b = Transcript.FromJson(json);
        if (b is not { } backup || backup.Entries.Count == 0 || DateTime.Now - backup.SavedAt > TimeSpan.FromHours(24)) return;
        _earlier = backup.Entries;
        _restoreBtn.Text = $"Restore earlier ({backup.Entries.Count})";
        _restoreBtn.Visible = true;
        _tips.SetToolTip(_restoreBtn, $"Captions saved at {backup.SavedAt:HH:mm} from the last time Caption Grabber ran.");
    }

    private void RestoreEarlier()
    {
        if (_earlier == null) return;
        _transcript.Prepend(_earlier);
        _earlier = null;
        _restoreBtn.Visible = false;
        _unsaved = true;
        _backupDue = true;
        SaveBackupIfDue();
        Flash("Earlier captions restored.");
        Render();
    }

    private void SaveBackupIfDue()
    {
        if (!_backupDue) return;
        _backupDue = false;
        Storage.SaveBackup(_transcript.ToJson());
    }

    private async Task SaveDiagnostics()
    {
        _diag.Enabled = false;
        Flash("Collecting diagnostics…");
        try
        {
            var text = await Task.Run(() => _reader.DumpTrees());
            var path = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
                $"CaptionGrabber-diagnostics-{DateTime.Now:yyyyMMdd-HHmm}.txt");
            await File.WriteAllTextAsync(path, text, Encoding.UTF8);
            Process.Start(new ProcessStartInfo("explorer.exe", $"/select,\"{path}\"") { UseShellExecute = true });
            Flash("Saved to Documents. It lists what's visible in your Teams window, so check it before sharing.");
        }
        catch (Exception ex)
        {
            Flash($"Couldn't save diagnostics: {ex.Message}");
        }
        finally
        {
            _diag.Enabled = true;
        }
    }

    private void Flash(string message)
    {
        SetText(_toast, message);
        _toast.Visible = !_mini;
        _toastTimer.Stop();
        _toastTimer.Start();
    }

    // ---------------------------------------------------------------- helpers

    private int S(int px) => (int)Math.Round(px * DeviceDpi / 96.0);

    private static void SetText(Control c, string text)
    {
        if (c.Text != text) c.Text = text;
    }

    private Button MakeButton(string text, bool primary = false)
    {
        var b = new Button
        {
            Text = text, AutoSize = true, AutoSizeMode = AutoSizeMode.GrowAndShrink,
            FlatStyle = FlatStyle.Flat, UseVisualStyleBackColor = false, Cursor = Cursors.Hand,
            Font = new Font("Segoe UI Semibold", 9F),
            BackColor = primary ? Accent : BtnBg, ForeColor = primary ? AccentFg : Fg,
            Padding = new Padding(S(6), S(1), S(6), S(1)), Margin = new Padding(0, 0, S(6), S(4)),
        };
        b.FlatAppearance.BorderColor = primary ? Accent : BtnLine;
        b.FlatAppearance.BorderSize = 1;
        b.FlatAppearance.MouseOverBackColor = primary ? AccentHover : BtnHover;
        b.FlatAppearance.MouseDownBackColor = primary ? AccentHover : BtnHover;
        return b;
    }

    private Button MakeIconButton(string text, string tip)
    {
        var b = new Button
        {
            Text = text, AutoSize = false, Size = new Size(S(26), S(24)),
            FlatStyle = FlatStyle.Flat, UseVisualStyleBackColor = false, Cursor = Cursors.Hand,
            Font = new Font("Segoe UI", 11F), BackColor = Bg, ForeColor = Dim,
            Margin = new Padding(0, S(1), 0, 0), TextAlign = ContentAlignment.MiddleCenter,
        };
        b.FlatAppearance.BorderSize = 0;
        b.FlatAppearance.MouseOverBackColor = BtnBg;
        b.FlatAppearance.MouseDownBackColor = BtnHover;
        _tips.SetToolTip(b, tip);
        return b;
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _reader.Dispose();
            _backupTimer.Dispose();
            _toastTimer.Dispose();
            _clearTimer.Dispose();
            _tips.Dispose();
        }
        base.Dispose(disposing);
    }
}
