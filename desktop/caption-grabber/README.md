# Caption Grabber (Windows desktop app)

Caption Grabber keeps the live captions of a Microsoft Teams call, with speaker names and times,
and copies them as plain text at the end of the call, for example into interview notes.
It is the desktop version of the browser bookmarklet at
`cloudplay.at/people-os/tools/caption-grabber.html`, and also works with the Teams desktop app.

## For IT: what it does and doesn't do

| | |
|---|---|
| **What it reads** | The live captions Teams already shows on screen, through Windows UI Automation (the accessibility interface screen readers use). |
| **What it never does** | No audio or video recording, no screenshots, no network access, no clicks or typing in Teams. |
| **Data** | Captions stay in memory and in a local backup file in `%LOCALAPPDATA%\CaptionGrabber\` (`backup.json`, `settings.json`, `log.txt`). The backup is deleted with **Clear**. Nothing is sent anywhere. |
| **Rights** | Runs as the signed-in user (`asInvoker`). No administrator rights, no services, no drivers, no registry changes, no autostart. |
| **Install** | A single self-contained `CaptionGrabber.exe` (.NET 10, about 70 MB). No .NET runtime or other components needed. To remove it, delete the exe and the folder above. |
| **Network** | None. The app opens no connections. |
| **Requirements** | Windows 10 or 11 (64-bit); the new Teams desktop app (`ms-teams.exe`) or Teams in Edge/Chrome; live captions turned on in the call. |
| **Source and build** | Source in this folder. The exe is built by the public GitHub Actions workflow `.github/workflows/caption-grabber-desktop.yml` on a Microsoft-hosted Windows runner; each release lists the SHA-256 of the exe. |
| **Code signing** | The exe is not code-signed, so Windows SmartScreen may warn on first start. IT can sign it with the company certificate or allow it by hash. |

Captions only exist when someone in the call turns on live captions; participants see that captions
are available. Whether a caption transcript of an interview needs consent is a company policy question.

## Use

1. Start `CaptionGrabber.exe`. A small panel appears in the bottom-right corner, always on top.
2. Join the call in Teams and turn on live captions: **More (…) → Language and speech → Show live captions**.
3. The panel shows **● Capturing** and counts lines as people speak.
4. After the call, click **Copy transcript** and paste it into the interview notes, or **Save .txt**.

- Drag the panel by its title. **–** shrinks it to one line with a Copy button; **▢** expands it.
- **Pause** stops adding captions; **Clear** (click twice) deletes the transcript and its backup.
- If the app closes during a call, start it again and click **Restore earlier**.
- If captions are on but nothing is captured, click **Not capturing? Save diagnostics**. It writes a text
  description of the Teams window to Documents, which is enough to fix the app if Teams changed.
  The file contains whatever is visible in Teams at that moment, so check it before sharing.

Keep live captions switched on in Teams for the whole call: the app can only keep what Teams shows.

## Output

```
Teams call transcript (live captions) – 29.10.2026 11:00

[11:00] Max: Thanks for joining. Could you walk me through your last role?

[11:01] Anna Kowalska: Sure. I led a support team of eight in Warsaw.
```

## Build

On Windows with the .NET 10 SDK:

```powershell
dotnet test desktop/caption-grabber/CaptionGrabber.Tests/CaptionGrabber.Tests.csproj
dotnet publish desktop/caption-grabber/CaptionGrabber/CaptionGrabber.csproj -c Release -r win-x64 `
  --self-contained true -p:PublishSingleFile=true -p:EnableCompressionInSingleFile=true `
  -p:IncludeNativeLibrariesForSelfExtract=true -o out
```

Bump `<Version>` in `CaptionGrabber.csproj` for a new release; a push to `main` publishes it.

## How it finds the captions

The new Teams app draws its interface with WebView2, which exposes the page to UI Automation
(HTML id → AutomationId, HTML class → ClassName, text → Text elements). Each caption is a
`fui-ChatMessageCompact` element holding the speaker name and the caption text. The app looks for
those inside the "Live Captions" area of any visible Teams window about once a second and updates
captions in place while Teams is still correcting them.

The approach follows the open-source [TeamsCaptionsSaver](https://github.com/mufeezahmad/TeamsCaptionsSaver)
(MIT licence), which documented how the new Teams app exposes its captions.
