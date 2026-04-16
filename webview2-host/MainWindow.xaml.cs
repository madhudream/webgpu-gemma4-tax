using System.IO;
using System.Windows;
using Microsoft.Web.WebView2.Core;

namespace WebGPUHost;

public partial class MainWindow : Window
{
    // ── Configuration ──────────────────────────────────────────────────────────
    //
    // APP_URL: where to load the POC from.
    //   • For local dev (http-server):  "http://localhost:8080"
    //   • For Cloud Run:                your Cloud Run URL
    //
    private const string APP_URL = "https://webgpu-poc-REPLACE-uc.a.run.app";

    // SHARED_UDF: one folder for every app on this machine.
    //
    // Why this works:
    //   WebView2 stores IndexedDB (= Transformers.js model cache) inside the UDF.
    //   All apps that point to the SAME folder share that IndexedDB.
    //   → model is downloaded once, ever.  All subsequent app launches load from disk.
    //
    private static readonly string SHARED_UDF = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
        "WebGPURuntime",   // C:\ProgramData\WebGPURuntime
        "Cache");          // C:\ProgramData\WebGPURuntime\Cache

    // ── Boot ──────────────────────────────────────────────────────────────────
    public MainWindow()
    {
        InitializeComponent();
        Loaded += async (_, _) => await InitWebViewAsync();
    }

    private async Task InitWebViewAsync()
    {
        StatusText.Text = "Creating shared WebView2 environment…";

        // 1. Point all WebView2 instances on this machine to the exact same UDF.
        //    Any other app that does the same gets the cached model for free.
        var env = await CoreWebView2Environment.CreateAsync(
            browserExecutableFolder: null,   // use installed WebView2 Runtime
            userDataFolder: SHARED_UDF);

        // 2. Initialise the WebView2 control with that environment.
        await WebView.EnsureCoreWebView2Async(env);

        // 3. Check whether the model is already in the cache.
        ShowCacheStatus();

        // 4. Navigate to the app.
        StatusText.Text = $"Loading: {APP_URL}";
        WebView.CoreWebView2.Navigate(APP_URL);

        // 5. Listen to messages the page posts (e.g. model load progress).
        WebView.CoreWebView2.WebMessageReceived += OnWebMessage;
    }

    // ── Cache status ──────────────────────────────────────────────────────────
    // IndexedDB is stored inside the UDF under EBWebView/Default/IndexedDB.
    // If that folder is non-empty, the model is already cached.
    private void ShowCacheStatus()
    {
        var idbPath = Path.Combine(SHARED_UDF, "EBWebView", "Default", "IndexedDB");
        var cached  = Directory.Exists(idbPath) &&
                      Directory.EnumerateFileSystemEntries(idbPath).Any();

        CacheStatus.Text = cached
            ? "✓ Model cache found — fast load"
            : "⟳ First run — model will be downloaded and cached";
    }

    // ── Messages from the page ────────────────────────────────────────────────
    // The HTML page can call: window.chrome.webview.postMessage({ type, payload })
    // to update the native status bar.
    private void OnWebMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
            // Simple string messages — extend with JSON parsing as needed.
            var msg = e.TryGetWebMessageAsString();
            if (!string.IsNullOrEmpty(msg))
                Dispatcher.Invoke(() => StatusText.Text = msg);
        }
        catch { /* ignore malformed messages */ }
    }

    // ── Navigation events ─────────────────────────────────────────────────────
    private void WebView_NavigationCompleted(object sender,
        CoreWebView2NavigationCompletedEventArgs e)
    {
        StatusText.Text = e.IsSuccess
            ? "Page loaded — WebGPU model loading in background…"
            : $"Navigation failed: {e.WebErrorStatus}";
    }
}

/*
 * ── HOW TO ADD A SECOND APP ──────────────────────────────────────────────────
 *
 * In any other WPF / WinForms / Win32 app, repeat steps 1 & 2:
 *
 *   var env = await CoreWebView2Environment.CreateAsync(null, SHARED_UDF);
 *   await myWebView.EnsureCoreWebView2Async(env);
 *   myWebView.CoreWebView2.Navigate("https://my-other-app.run.app");
 *
 * Because SHARED_UDF is the same path, the IndexedDB cache (model weights)
 * is shared.  The model never has to be downloaded again on this machine.
 *
 * ── FIRST LOAD vs SUBSEQUENT LOADS ──────────────────────────────────────────
 *
 *   First run:   ~500 MB download  (q4f16 model)  cached to SHARED_UDF
 *   Any run after:  ~3-5 s  from disk (IndexedDB → GPU upload)
 *
 */
