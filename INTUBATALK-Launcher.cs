// INTUBATALK Windows Desktop Application & Launcher
// Native Windows executable compiled with C# and embedded icon.
// Provides standalone app window launching, server management, and system tray integration.

using System;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Diagnostics;
using System.Threading;
using System.Windows.Forms;

namespace IntubaTalk
{
    static class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            string initialRoute = "";
            bool startInTray = false;

            foreach (string arg in args)
            {
                if (arg.Equals("--patient", StringComparison.OrdinalIgnoreCase)) initialRoute = "/";
                else if (arg.Equals("--nurse", StringComparison.OrdinalIgnoreCase)) initialRoute = "/nurse";
                else if (arg.Equals("--dual", StringComparison.OrdinalIgnoreCase)) initialRoute = "/dual";
                else if (arg.Equals("--board", StringComparison.OrdinalIgnoreCase)) initialRoute = "/board";
                else if (arg.Equals("--tray", StringComparison.OrdinalIgnoreCase)) startInTray = true;
            }

            Application.Run(new MainForm(initialRoute, startInTray));
        }
    }

    public class MainForm : Form
    {
        private Process serverProcess = null;
        private bool ownsServer = false;
        private int serverPort = 8788;
        private NotifyIcon trayIcon;
        private ContextMenuStrip trayMenu;
        private Label lblStatus;
        private Label lblLan;
        private System.Windows.Forms.Timer healthTimer;
        private string appDir;
        private Icon customIcon;

        // Colors matching INTUBATALK Claymorphism palette
        private Color colBg = Color.FromArgb(243, 241, 236);
        private Color colSurface = Color.FromArgb(248, 247, 244);
        private Color colMint = Color.FromArgb(76, 177, 160);
        private Color colMintDark = Color.FromArgb(55, 145, 128);
        private Color colTeal = Color.FromArgb(63, 127, 167);
        private Color colTealDark = Color.FromArgb(51, 106, 140);
        private Color colText = Color.FromArgb(38, 51, 64);
        private Color colTextSoft = Color.FromArgb(93, 108, 120);
        private Color colRed = Color.FromArgb(212, 84, 84);
        private Color colLine = Color.FromArgb(201, 195, 183);

        public MainForm(string initialRoute, bool startInTray)
        {
            appDir = AppDomain.CurrentDomain.BaseDirectory;

            // Load app icon
            string icoPath = Path.Combine(appDir, "app.ico");
            if (File.Exists(icoPath))
            {
                try { customIcon = new Icon(icoPath); this.Icon = customIcon; } catch { }
            }

            InitUI();
            InitTray();
            StartServerIfNeeded();

            healthTimer = new System.Windows.Forms.Timer();
            healthTimer.Interval = 2500;
            healthTimer.Tick += (s, e) => CheckServerStatus();
            healthTimer.Start();

            if (!string.IsNullOrEmpty(initialRoute))
            {
                LaunchApp(initialRoute);
            }

            if (startInTray)
            {
                this.WindowState = FormWindowState.Minimized;
                this.ShowInTaskbar = false;
            }
        }

        private void InitUI()
        {
            this.Text = "INTUBATALK · ICU Communication System";
            this.Size = new Size(740, 580);
            this.MinimumSize = new Size(680, 520);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.BackColor = colBg;
            this.Font = new Font("Segoe UI", 9.5f, FontStyle.Regular);

            // Header Panel
            Panel pnlHeader = new Panel
            {
                Dock = DockStyle.Top,
                Height = 90,
                BackColor = colSurface,
                Padding = new Padding(24, 16, 24, 12),
            };
            pnlHeader.Paint += (s, e) =>
            {
                using (Pen p = new Pen(colLine))
                {
                    e.Graphics.DrawLine(p, 0, pnlHeader.Height - 1, pnlHeader.Width, pnlHeader.Height - 1);
                }
            };

            Label lblTitle = new Label
            {
                Text = "INTUBATALK",
                Font = new Font("Georgia", 18f, FontStyle.Bold),
                ForeColor = colText,
                AutoSize = true,
                Location = new Point(22, 14)
            };

            Label lblSubtitle = new Label
            {
                Text = "Adaptive Communication System for Intubated ICU Patients",
                Font = new Font("Segoe UI", 9.5f, FontStyle.Regular),
                ForeColor = colTextSoft,
                AutoSize = true,
                Location = new Point(24, 48)
            };

            lblStatus = new Label
            {
                Text = "● Checking server...",
                Font = new Font("Segoe UI", 9f, FontStyle.Bold),
                ForeColor = Color.DarkOrange,
                AutoSize = true,
                Anchor = AnchorStyles.Top | AnchorStyles.Right,
                Location = new Point(480, 20)
            };

            lblLan = new Label
            {
                Text = "Wi-Fi LAN: Detecting...",
                Font = new Font("Segoe UI", 8.5f, FontStyle.Regular),
                ForeColor = colTextSoft,
                AutoSize = true,
                Anchor = AnchorStyles.Top | AnchorStyles.Right,
                Location = new Point(480, 48)
            };

            pnlHeader.Controls.Add(lblTitle);
            pnlHeader.Controls.Add(lblSubtitle);
            pnlHeader.Controls.Add(lblStatus);
            pnlHeader.Controls.Add(lblLan);
            this.Controls.Add(pnlHeader);

            // Main Action Grid Panel
            TableLayoutPanel grid = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 2,
                RowCount = 3,
                Padding = new Padding(22, 16, 22, 16),
                BackColor = colBg
            };
            grid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50f));
            grid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50f));
            grid.RowStyles.Add(new RowStyle(SizeType.Percent, 35f));
            grid.RowStyles.Add(new RowStyle(SizeType.Percent, 35f));
            grid.RowStyles.Add(new RowStyle(SizeType.Percent, 30f));

            // Card 1: Patient Tablet
            Button btnPatient = CreateCardButton(
                "📱 Open Patient Tablet",
                "Full AAC communication board with core needs, pain scale, spelling, eye-blink & emergency alert.",
                colMint, colMintDark, Color.White);
            btnPatient.Click += (s, e) => LaunchApp("/");
            grid.Controls.Add(btnPatient, 0, 0);

            // Card 2: Nurse Dashboard
            Button btnNurse = CreateCardButton(
                "🩺 Open Nurse Dashboard",
                "Live request feed, emergency sirens, card acknowledgements, audio speech & bedside notes.",
                colTeal, colTealDark, Color.White);
            btnNurse.Click += (s, e) => LaunchApp("/nurse");
            grid.Controls.Add(btnNurse, 1, 0);

            // Card 3: Dual Interactive Simulator
            Button btnDual = CreateCardButton(
                "👥 Dual Presentation View",
                "Side-by-side tablet & nurse station on one screen. Perfect for live presentations, teaching & testing.",
                Color.FromArgb(70, 150, 138), Color.FromArgb(50, 120, 110), Color.White);
            btnDual.Click += (s, e) => LaunchApp("/dual");
            grid.Controls.Add(btnDual, 0, 1);

            // Card 4: Printable Backup Board
            Button btnBoard = CreateCardButton(
                "📋 Printable Backup Board",
                "Laminated A4 communication board fallback for when devices have zero battery or no Wi-Fi.",
                Color.FromArgb(235, 230, 220), Color.FromArgb(220, 214, 202), colText);
            btnBoard.Click += (s, e) => LaunchApp("/board");
            grid.Controls.Add(btnBoard, 1, 1);

            // Card 5: Test Console
            Button btnConsole = CreateCardButton(
                "🧪 Diagnostic Test Console",
                "Check server connectivity, test endpoints, and run through the clinical verification checklist.",
                Color.FromArgb(235, 230, 220), Color.FromArgb(220, 214, 202), colText);
            btnConsole.Click += (s, e) => LaunchApp("/console");
            grid.Controls.Add(btnConsole, 0, 2);

            // Card 6: LAN Link & Vercel Helper
            Button btnLanCopy = CreateCardButton(
                "🌐 Copy Bedside Wi-Fi Link",
                "Copy LAN URL to open tablet and nurse views on real iPads, Android tablets, or phones on ward Wi-Fi.",
                Color.FromArgb(235, 230, 220), Color.FromArgb(220, 214, 202), colText);
            btnLanCopy.Click += (s, e) => CopyLanUrl();
            grid.Controls.Add(btnLanCopy, 1, 2);

            this.Controls.Add(grid);

            // Bottom Status / Controls Bar
            Panel pnlBottom = new Panel
            {
                Dock = DockStyle.Bottom,
                Height = 44,
                BackColor = colSurface,
                Padding = new Padding(16, 8, 16, 8)
            };
            pnlBottom.Paint += (s, e) =>
            {
                using (Pen p = new Pen(colLine))
                {
                    e.Graphics.DrawLine(p, 0, 0, pnlBottom.Width, 0);
                }
            };

            Button btnRestart = new Button
            {
                Text = "🔄 Restart Server",
                Font = new Font("Segoe UI", 8.5f),
                Size = new Size(115, 26),
                Location = new Point(16, 8),
                BackColor = Color.White,
                FlatStyle = FlatStyle.Flat
            };
            btnRestart.FlatAppearance.BorderColor = colLine;
            btnRestart.Click += (s, e) => RestartServer();

            Button btnVercel = new Button
            {
                Text = "🚀 Ready for Vercel",
                Font = new Font("Segoe UI", 8.5f),
                Size = new Size(130, 26),
                Location = new Point(140, 8),
                BackColor = Color.White,
                FlatStyle = FlatStyle.Flat
            };
            btnVercel.FlatAppearance.BorderColor = colLine;
            btnVercel.Click += (s, e) => ShowVercelInfo();

            Button btnTray = new Button
            {
                Text = "Minimize to Tray",
                Font = new Font("Segoe UI", 8.5f),
                Size = new Size(120, 26),
                Anchor = AnchorStyles.Top | AnchorStyles.Right,
                Location = new Point(590, 8),
                BackColor = Color.White,
                FlatStyle = FlatStyle.Flat
            };
            btnTray.FlatAppearance.BorderColor = colLine;
            btnTray.Click += (s, e) =>
            {
                this.WindowState = FormWindowState.Minimized;
                this.ShowInTaskbar = false;
                if (trayIcon != null)
                {
                    trayIcon.ShowBalloonTip(2000, "INTUBATALK Running", "Server active in system tray. Double-click tray icon to restore.", ToolTipIcon.Info);
                }
            };

            pnlBottom.Controls.Add(btnRestart);
            pnlBottom.Controls.Add(btnVercel);
            pnlBottom.Controls.Add(btnTray);
            this.Controls.Add(pnlBottom);

            // Double buffering
            SetStyle(ControlStyles.OptimizedDoubleBuffer | ControlStyles.AllPaintingInWmPaint, true);
        }

        private Button CreateCardButton(string title, string desc, Color c1, Color c2, Color textCol)
        {
            Button btn = new Button
            {
                Dock = DockStyle.Fill,
                Margin = new Padding(8),
                FlatStyle = FlatStyle.Flat,
                Cursor = Cursors.Hand,
                TextAlign = ContentAlignment.TopLeft,
                Padding = new Padding(14, 12, 14, 10),
                BackColor = c1
            };
            btn.FlatAppearance.BorderSize = 1;
            btn.FlatAppearance.BorderColor = Color.FromArgb(60, 255, 255, 255);

            btn.Paint += (s, e) =>
            {
                e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;

                // Gradient background
                using (LinearGradientBrush brush = new LinearGradientBrush(btn.ClientRectangle, c1, c2, 135f))
                {
                    e.Graphics.FillRectangle(brush, btn.ClientRectangle);
                }

                // Border
                using (Pen p = new Pen(Color.FromArgb(40, 255, 255, 255), 1))
                {
                    e.Graphics.DrawRectangle(p, 0, 0, btn.Width - 1, btn.Height - 1);
                }

                // Text
                using (SolidBrush bTitle = new SolidBrush(textCol))
                using (Font fTitle = new Font("Segoe UI", 11f, FontStyle.Bold))
                {
                    e.Graphics.DrawString(title, fTitle, bTitle, new PointF(14, 12));
                }

                using (SolidBrush bDesc = new SolidBrush(Color.FromArgb(textCol == Color.White ? 220 : 160, textCol)))
                using (Font fDesc = new Font("Segoe UI", 8.5f, FontStyle.Regular))
                {
                    RectangleF rectDesc = new RectangleF(14, 38, btn.Width - 28, btn.Height - 44);
                    e.Graphics.DrawString(desc, fDesc, bDesc, rectDesc);
                }
            };

            return btn;
        }

        private void InitTray()
        {
            trayMenu = new ContextMenuStrip();
            trayMenu.Items.Add("📱 Patient Tablet", null, (s, e) => LaunchApp("/"));
            trayMenu.Items.Add("🩺 Nurse Dashboard", null, (s, e) => LaunchApp("/nurse"));
            trayMenu.Items.Add("👥 Dual Simulator", null, (s, e) => LaunchApp("/dual"));
            trayMenu.Items.Add("📋 Backup Board", null, (s, e) => LaunchApp("/board"));
            trayMenu.Items.Add("-");
            trayMenu.Items.Add("Open INTUBATALK Hub", null, (s, e) => RestoreFromTray());
            trayMenu.Items.Add("Copy Wi-Fi LAN Link", null, (s, e) => CopyLanUrl());
            trayMenu.Items.Add("-");
            trayMenu.Items.Add("Exit INTUBATALK", null, (s, e) => Application.Exit());

            trayIcon = new NotifyIcon
            {
                Text = "INTUBATALK ICU Communication",
                Icon = customIcon ?? SystemIcons.Application,
                ContextMenuStrip = trayMenu,
                Visible = true
            };
            trayIcon.DoubleClick += (s, e) => RestoreFromTray();
        }

        private void RestoreFromTray()
        {
            this.ShowInTaskbar = true;
            this.WindowState = FormWindowState.Normal;
            this.BringToFront();
            this.Activate();
        }

        private void StartServerIfNeeded()
        {
            if (IsServerAnswering(serverPort))
            {
                lblStatus.Text = "● Server Online (Port " + serverPort + ")";
                lblStatus.ForeColor = Color.ForestGreen;
                UpdateLanInfo();
                return;
            }

            // Start standalone node server
            string serverJs = Path.Combine(appDir, "server.js");
            if (File.Exists(serverJs))
            {
                try
                {
                    ProcessStartInfo psi = new ProcessStartInfo
                    {
                        FileName = "node",
                        Arguments = "\"" + serverJs + "\"",
                        WorkingDirectory = appDir,
                        CreateNoWindow = true,
                        UseShellExecute = false,
                        WindowStyle = ProcessWindowStyle.Hidden
                    };
                    serverProcess = Process.Start(psi);
                    ownsServer = true;
                    lblStatus.Text = "● Starting server...";
                    lblStatus.ForeColor = Color.DarkOrange;
                }
                catch (Exception ex)
                {
                    lblStatus.Text = "● Node server failed: " + ex.Message;
                    lblStatus.ForeColor = colRed;
                }
            }

            // Check after a brief delay
            new Thread(() =>
            {
                Thread.Sleep(1200);
                this.Invoke((Action)(() => CheckServerStatus()));
            }).Start();
        }

        private bool IsServerAnswering(int port)
        {
            try
            {
                HttpWebRequest req = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:" + port + "/");
                req.Timeout = 1500;
                req.Method = "HEAD";
                using (HttpWebResponse res = (HttpWebResponse)req.GetResponse())
                {
                    return res.StatusCode == HttpStatusCode.OK;
                }
            }
            catch
            {
                return false;
            }
        }

        private void CheckServerStatus()
        {
            bool ok = IsServerAnswering(serverPort);
            if (ok)
            {
                lblStatus.Text = "● Server Online (Port " + serverPort + ")";
                lblStatus.ForeColor = Color.ForestGreen;
                UpdateLanInfo();
            }
            else
            {
                lblStatus.Text = "● Server Offline";
                lblStatus.ForeColor = colRed;
            }
        }

        private void UpdateLanInfo()
        {
            string lanIp = GetLocalIpAddress();
            lblLan.Text = "Wi-Fi LAN: http://" + lanIp + ":" + serverPort + "/";
        }

        private string GetLocalIpAddress()
        {
            try
            {
                using (Socket socket = new Socket(AddressFamily.InterNetwork, SocketType.Dgram, 0))
                {
                    socket.Connect("8.8.8.8", 65530);
                    IPEndPoint endPoint = socket.LocalEndPoint as IPEndPoint;
                    if (endPoint != null) return endPoint.Address.ToString();
                }
            }
            catch { }
            return "127.0.0.1";
        }

        private void LaunchApp(string route)
        {
            string url = "http://127.0.0.1:" + serverPort + route;

            // Preferred: Microsoft Edge or Chrome in App Mode (distraction-free standalone window)
            string edgePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Microsoft\Edge\Application\msedge.exe");
            if (!File.Exists(edgePath))
            {
                edgePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Microsoft\Edge\Application\msedge.exe");
            }

            string chromePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Google\Chrome\Application\chrome.exe");
            if (!File.Exists(chromePath))
            {
                chromePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Google\Chrome\Application\chrome.exe");
            }

            if (File.Exists(edgePath))
            {
                try
                {
                    Process.Start(edgePath, "--app=\"" + url + "\"");
                    return;
                }
                catch { }
            }

            if (File.Exists(chromePath))
            {
                try
                {
                    Process.Start(chromePath, "--app=\"" + url + "\"");
                    return;
                }
                catch { }
            }

            // Fallback: Default browser
            try
            {
                Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
            }
            catch (Exception ex)
            {
                MessageBox.Show("Could not launch browser: " + ex.Message, "INTUBATALK", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void CopyLanUrl()
        {
            string lanIp = GetLocalIpAddress();
            string url = "http://" + lanIp + ":" + serverPort + "/";
            Clipboard.SetText(url);
            MessageBox.Show(
                "Wi-Fi LAN URL copied to clipboard:\n\n" + url +
                "\n\nOpen this address in Safari, Chrome, or Edge on bedside iPads, tablets, or nurse phones on the same Wi-Fi network.",
                "INTUBATALK Wi-Fi Sharing",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
        }

        private void RestartServer()
        {
            if (serverProcess != null && !serverProcess.HasExited)
            {
                try { serverProcess.Kill(); } catch { }
            }
            serverProcess = null;
            ownsServer = false;
            StartServerIfNeeded();
        }

        private void ShowVercelInfo()
        {
            MessageBox.Show(
                "INTUBATALK is fully prepared for Vercel deployment!\n\n" +
                "1. vercel.json is configured with clean routing and serverless rewrites.\n" +
                "2. api/ directory has serverless handlers for all /api endpoints.\n" +
                "3. public/ contains all static claymorphism assets.\n\n" +
                "To deploy to Vercel:\n" +
                "• In terminal, run: npx vercel\n" +
                "• Or push this folder to GitHub and import it on vercel.com.\n" +
                "Zero build config required!",
                "Vercel Deployment Ready",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            if (e.CloseReason == CloseReason.UserClosing)
            {
                // Clean up server if we started it
                if (ownsServer && serverProcess != null && !serverProcess.HasExited)
                {
                    try { serverProcess.Kill(); } catch { }
                }
            }
            if (trayIcon != null)
            {
                trayIcon.Visible = false;
                trayIcon.Dispose();
            }
            base.OnFormClosing(e);
        }
    }
}

