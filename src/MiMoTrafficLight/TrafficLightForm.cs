using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Windows.Forms;

namespace MiMoTrafficLight;

internal sealed class TrafficLightForm : Form
{
    private readonly string _baseDir;
    private readonly string _statusFile;
    private readonly System.Windows.Forms.Timer _animationTimer = new();
    private readonly System.Windows.Forms.Timer _staleTimer = new();
    private readonly NotifyIcon _notifyIcon = new();
    private readonly ContextMenuStrip _trayMenu = new();
    private FileSystemWatcher? _watcher;

    private TrafficLightState _state = TrafficLightState.Off;
    private TrafficLightState _steadyAfterFlash = TrafficLightState.Off;
    private int _flashRemainingToggles;
    private bool _flashVisible = true;
    private int _slowBlinkTick;
    private int _errorBlinkTick;
    private DateTimeOffset _lastUpdate = DateTimeOffset.MinValue;
    private string _cwd = "";
    private string _session = "";
    private string _lastTrayIconKey = string.Empty;
    private readonly string _settingsFile;

    private const int DotDiameter = 10;
    private const int DotGap = 8;
    private const int PaddingX = 8;
    private const int PaddingY = 6;
    private const int BorderW = 1;
    private const int BarH = PaddingY * 2 + DotDiameter;
    private const int BarW = PaddingX * 2 + DotDiameter * 3 + DotGap * 2 + BorderW * 2;

    private bool _dragging;
    private Point _dragStart;

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("gdi32.dll")]
    private static extern bool DeleteObject(IntPtr hObject);

    [DllImport("user32.dll")]
    private static extern bool DestroyIcon(IntPtr hIcon);

    [DllImport("user32.dll")]
    private static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);

    [DllImport("user32.dll")]
    private static extern int GetWindowLong(IntPtr hWnd, int nIndex);

    private const int SW_RESTORE = 9;
    private const int GWL_EXSTYLE = -20;
    private const int WS_EX_TOOLWINDOW = 0x00000080;

    private static readonly Color BgColor = Color.FromArgb(30, 30, 30);
    private static readonly Color BorderColor = Color.FromArgb(10, 10, 10);
    private static readonly Color DotOff = Color.FromArgb(80, 80, 80);
    private static readonly Color RedOn = Color.FromArgb(220, 60, 60);
    private static readonly Color YellowOn = Color.FromArgb(230, 180, 40);
    private static readonly Color GreenOn = Color.FromArgb(50, 180, 80);

    public TrafficLightForm()
    {
        Text = "MiMo Traffic Light";
        Width = BarW;
        Height = BarH;
        MinimumSize = new Size(BarW, BarH);
        MaximumSize = new Size(BarW, BarH);
        StartPosition = FormStartPosition.Manual;
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        TopMost = true;
        DoubleBuffered = true;
        BackColor = BgColor;

        MouseDown += (_, e) =>
        {
            if (e.Button == MouseButtons.Left) { _dragging = true; _dragStart = e.Location; }
        };
        MouseMove += (_, e) =>
        {
            if (_dragging) Location = new Point(Location.X + e.X - _dragStart.X, Location.Y + e.Y - _dragStart.Y);
        };
        MouseUp += (_, e) =>
        {
            if (e.Button == MouseButtons.Left) _dragging = false;
        };

        _baseDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MiMoLight");
        _statusFile = Path.Combine(_baseDir, "status.json");
        _settingsFile = Path.Combine(_baseDir, "settings.json");

        Directory.CreateDirectory(_baseDir);
        RestoreSettings();
        ConfigureTray();
        ConfigureTimers();
        PositionBottomRight();
        UpdateVisuals();
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        var style = GetWindowLong(Handle, GWL_EXSTYLE);
        SetWindowLong(Handle, GWL_EXSTYLE, style | WS_EX_TOOLWINDOW);
    }

    protected override void OnLoad(EventArgs e)
    {
        base.OnLoad(e);
        SetupWatcher();
        ReadStatusFile();
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        SaveSettings();
        _watcher?.Dispose();
        _notifyIcon.Visible = false;
        _notifyIcon.Dispose();
        base.OnFormClosing(e);
    }

    protected override void OnClick(EventArgs e)
    {
        base.OnClick(e);
        BringMiMoTerminalToFront();
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        var g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;

        using var borderPen = new Pen(BorderColor, BorderW);
        using var borderBrush = new SolidBrush(BgColor);
        var r = new Rectangle(0, 0, Width - 1, Height - 1);
        g.FillRectangle(borderBrush, r);
        g.DrawRectangle(borderPen, r);

        var dotY = PaddingY;
        var dotSpacing = DotDiameter + DotGap;
        var x0 = PaddingX + BorderW;

        DrawDot(g, x0, dotY, ShouldLightRed() ? RedOn : DotOff);
        DrawDot(g, x0 + dotSpacing, dotY, ShouldLightYellow() ? YellowOn : DotOff);
        DrawDot(g, x0 + dotSpacing * 2, dotY, ShouldLightGreen() ? GreenOn : DotOff);
    }

    private static void DrawDot(Graphics g, int x, int y, Color color)
    {
        using var brush = new SolidBrush(color);
        g.FillEllipse(brush, x, y, DotDiameter, DotDiameter);
    }

    private void ConfigureTray()
    {
        _trayMenu.Items.Add("Locate MiMo Terminal", null, (_, _) => BringMiMoTerminalToFront());
        _trayMenu.Items.Add(new ToolStripSeparator());
        _trayMenu.Items.Add("Exit", null, (_, _) => Close());

        _notifyIcon.Text = "MiMo Traffic Light";
        _notifyIcon.ContextMenuStrip = _trayMenu;
        _notifyIcon.Visible = true;
        _notifyIcon.DoubleClick += (_, _) => BringMiMoTerminalToFront();
    }

    private void ConfigureTimers()
    {
        _animationTimer.Interval = 250;
        _animationTimer.Tick += (_, _) =>
        {
            Animate();
            UpdateVisuals();
        };
        _animationTimer.Start();

        _staleTimer.Interval = 30000;
        _staleTimer.Tick += (_, _) => CheckStaleStatus();
        _staleTimer.Start();
    }

    private void SetupWatcher()
    {
        _watcher = new FileSystemWatcher(_baseDir)
        {
            Filter = "status.json",
            NotifyFilter = NotifyFilters.LastWrite | NotifyFilters.CreationTime | NotifyFilters.Size | NotifyFilters.FileName,
            EnableRaisingEvents = true
        };

        FileSystemEventHandler handler = (_, _) => BeginInvoke(new Action(ReadStatusFile));
        RenamedEventHandler renamed = (_, _) => BeginInvoke(new Action(ReadStatusFile));
        _watcher.Changed += handler;
        _watcher.Created += handler;
        _watcher.Renamed += renamed;
    }

    private void ReadStatusFile()
    {
        if (!File.Exists(_statusFile))
        {
            SetState(TrafficLightState.Off, "", "");
            return;
        }

        for (var i = 0; i < 5; i++)
        {
            try
            {
                var json = File.ReadAllText(_statusFile);
                var payload = JsonSerializer.Deserialize<StatusPayload>(json);
                if (payload == null) return;

                var state = ParseState(payload.State);
                _lastUpdate = payload.UpdatedAt ?? DateTimeOffset.Now;
                SetState(state, payload.ProjectDir ?? "", payload.SessionId ?? "");
                return;
            }
            catch (IOException)
            {
                System.Threading.Thread.Sleep(80);
            }
            catch
            {
                SetState(TrafficLightState.Error, "", "");
                return;
            }
        }
    }

    private static TrafficLightState ParseState(string? state)
    {
        return (state ?? "").Trim().ToLowerInvariant() switch
        {
            "idle" => TrafficLightState.Idle,
            "done" => TrafficLightState.Done,
            "thinking" => TrafficLightState.Thinking,
            "working" => TrafficLightState.Working,
            "permission" => TrafficLightState.Permission,
            "error" => TrafficLightState.Error,
            "off" => TrafficLightState.Off,
            _ => TrafficLightState.Off
        };
    }

    private void SetState(TrafficLightState newState, string cwd, string session)
    {
        var oldState = _state;
        _state = newState;
        _cwd = cwd;
        _session = session;

        if (newState != oldState)
        {
            _flashVisible = true;
            _slowBlinkTick = 0;
            _errorBlinkTick = 0;
            if (newState == TrafficLightState.Done)
            {
                _flashRemainingToggles = 20;
                _steadyAfterFlash = TrafficLightState.Idle;
            }
            else if (newState == TrafficLightState.Permission)
            {
                _flashRemainingToggles = 20;
                _steadyAfterFlash = TrafficLightState.Permission;
            }
            else
            {
                _flashRemainingToggles = 0;
                _steadyAfterFlash = newState;
            }
        }
        Invalidate();
    }

    private void Animate()
    {
        if (_flashRemainingToggles > 0)
        {
            _flashVisible = !_flashVisible;
            _flashRemainingToggles--;
            if (_flashRemainingToggles == 0)
            {
                _flashVisible = true;
                _state = _steadyAfterFlash;
            }
            return;
        }

        if (_state == TrafficLightState.Thinking)
        {
            _slowBlinkTick = (_slowBlinkTick + 1) % 8;
            _flashVisible = _slowBlinkTick < 4;
        }
        else if (_state == TrafficLightState.Error)
        {
            _errorBlinkTick = (_errorBlinkTick + 1) % 4;
            _flashVisible = _errorBlinkTick < 2;
        }
        else
        {
            _flashVisible = true;
        }
    }

    private void CheckStaleStatus()
    {
        if (_lastUpdate == DateTimeOffset.MinValue) return;
        var age = DateTimeOffset.Now - _lastUpdate;
        if (age.TotalMinutes > 30 && _state != TrafficLightState.Off)
        {
            SetState(TrafficLightState.Off, _cwd, _session);
        }
    }

    private bool ShouldLightRed()
    {
        return _state switch
        {
            TrafficLightState.Permission => _flashVisible,
            TrafficLightState.Error => _flashVisible,
            _ => false
        };
    }

    private bool ShouldLightYellow()
    {
        return _state switch
        {
            TrafficLightState.Thinking => _flashVisible,
            TrafficLightState.Working => true,
            TrafficLightState.Error => !_flashVisible,
            _ => false
        };
    }

    private bool ShouldLightGreen()
    {
        return _state switch
        {
            TrafficLightState.Idle => true,
            TrafficLightState.Done => _flashVisible,
            _ => false
        };
    }

    private void UpdateVisuals()
    {
        UpdateTrayIconIfNeeded();
        _notifyIcon.Text = GetToolTipText();
        Invalidate();
    }

    private string GetTrayIconKey()
    {
        return $"{ShouldLightRed()}|{ShouldLightYellow()}|{ShouldLightGreen()}";
    }

    private void UpdateTrayIconIfNeeded()
    {
        var key = GetTrayIconKey();
        if (key == _lastTrayIconKey) return;
        _lastTrayIconKey = key;

        var oldIcon = _notifyIcon.Icon;
        _notifyIcon.Icon = CreateIcon();
        Icon = _notifyIcon.Icon;
        oldIcon?.Dispose();
    }

    private string GetToolTipText()
    {
        return _state switch
        {
            TrafficLightState.Off => "MiMo not running or status expired",
            TrafficLightState.Idle => "MiMo idle",
            TrafficLightState.Done => "MiMo task completed",
            TrafficLightState.Thinking => "MiMo thinking",
            TrafficLightState.Working => "MiMo working",
            TrafficLightState.Permission => "Waiting for authorization",
            TrafficLightState.Error => "Error occurred",
            _ => "MiMo Traffic Light"
        };
    }

    private Icon CreateIcon()
    {
        using var bmp = new Bitmap(64, 64);
        using var g = Graphics.FromImage(bmp);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.Clear(Color.Transparent);

        DrawIconDot(g, 14, ShouldLightRed() ? RedOn : DotOff);
        DrawIconDot(g, 32, ShouldLightYellow() ? YellowOn : DotOff);
        DrawIconDot(g, 50, ShouldLightGreen() ? GreenOn : DotOff);

        var hbm = bmp.GetHbitmap();
        var hIcon = IntPtr.Zero;

        try
        {
            var info = new ICONINFO { fIcon = true, hbmMask = hbm, hbmColor = hbm };
            hIcon = CreateIconIndirect(ref info);

            if (hIcon == IntPtr.Zero)
            {
                return SystemIcons.Application;
            }

            using var tmp = Icon.FromHandle(hIcon);
            return (Icon)tmp.Clone();
        }
        finally
        {
            if (hIcon != IntPtr.Zero)
            {
                DestroyIcon(hIcon);
            }

            DeleteObject(hbm);
        }
    }

    private static void DrawIconDot(Graphics g, int cx, Color color)
    {
        using var brush = new SolidBrush(color);
        g.FillEllipse(brush, cx - 7, 27, 14, 14);
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct ICONINFO
    {
        public bool fIcon;
        public int xHotspot;
        public int yHotspot;
        public IntPtr hbmMask;
        public IntPtr hbmColor;
    }

    [DllImport("user32.dll")]
    private static extern IntPtr CreateIconIndirect(ref ICONINFO iconInfo);

    private void PositionBottomRight()
    {
        var area = Screen.PrimaryScreen?.WorkingArea ?? new Rectangle(0, 0, 1280, 720);
        Location = new Point(area.Right - Width - 16, area.Bottom - Height - 8);
    }

    private void SaveSettings()
    {
        try
        {
            var json = JsonSerializer.Serialize(new
            {
                x = Left,
                y = Top
            }, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(_settingsFile, json);
        }
        catch { }
    }

    private void RestoreSettings()
    {
        try
        {
            if (!File.Exists(_settingsFile)) return;
            var json = File.ReadAllText(_settingsFile);
            using var doc = System.Text.Json.JsonDocument.Parse(json);
            var root = doc.RootElement;

            int x = root.TryGetProperty("x", out var xProp) ? xProp.GetInt32() : -1;
            int y = root.TryGetProperty("y", out var yProp) ? yProp.GetInt32() : -1;

            if (x < 0 || y < 0) return;

            var allScreens = Screen.AllScreens;
            bool visible = false;
            foreach (var screen in allScreens)
            {
                if (screen.WorkingArea.Contains(x, y)) { visible = true; break; }
            }

            if (visible)
            {
                Left = x;
                Top = y;
            }
        }
        catch { }
    }

    private static void BringMiMoTerminalToFront()
    {
        foreach (var p in Process.GetProcesses())
        {
            try
            {
                var title = p.MainWindowTitle ?? "";
                if (p.MainWindowHandle == IntPtr.Zero) continue;
                var name = p.ProcessName ?? "";
                var titleHit = title.Contains("MiMo", StringComparison.OrdinalIgnoreCase)
                               || title.Contains("mimocode", StringComparison.OrdinalIgnoreCase);
                var nameHit = name.Contains("WindowsTerminal", StringComparison.OrdinalIgnoreCase)
                              || name.Contains("cmd", StringComparison.OrdinalIgnoreCase)
                              || name.Contains("powershell", StringComparison.OrdinalIgnoreCase)
                              || name.Contains("pwsh", StringComparison.OrdinalIgnoreCase);
                if (titleHit || (nameHit && title.Contains("mimo", StringComparison.OrdinalIgnoreCase)))
                {
                    ShowWindow(p.MainWindowHandle, SW_RESTORE);
                    SetForegroundWindow(p.MainWindowHandle);
                    return;
                }
            }
            catch { }
        }
    }
}
