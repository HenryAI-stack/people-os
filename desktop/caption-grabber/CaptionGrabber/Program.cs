namespace CaptionGrabber;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        using var mutex = new Mutex(initiallyOwned: true, @"Local\CaptionGrabber.SingleInstance", out bool first);
        if (!first)
        {
            MessageBox.Show("Caption Grabber is already running. Look for its panel on your screen or in the taskbar.",
                "Caption Grabber", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        ApplicationConfiguration.Initialize();
        Application.ThreadException += (_, e) => Log.Write($"UI error: {e.Exception}");
        AppDomain.CurrentDomain.UnhandledException += (_, e) => Log.Write($"Fatal: {e.ExceptionObject}");
        Log.Write($"Started {Application.ProductVersion}");
        Application.Run(new PanelForm());
    }
}
