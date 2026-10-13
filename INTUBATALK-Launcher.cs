// INTUBATALK Windows Desktop Application & Role Chooser
// Native Windows executable compiled with C# and embedded high-res icon.
// Provides an accessible role selection screen (Patient vs Nurse), standalone app window launching,
// background server lifecycle management, and system tray integration.

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

            Application.Run(new RoleChooserForm(initialRoute, startInTray));
        }
    }

    public class RoleChooserForm : Form
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

        // Palette matching INTUBATALK Clinical Claymorphism Design System
        private readonly Color colBg = Color.FromArgb(243, 241, 236);
        private readonly Color colSurface = Color.FromArgb(248, 247, 244);
        private readonly Color colMint = Color.FromArgb(64, 168, 150);
        private readonly Color colMintDark = Color.FromArgb(45, 135, 120);
        private readonly Color colTeal = Color.FromArgb(51, 106, 140);
        private readonly Color colTealDark = Color.FromArgb(36, 80, 108);
        private readonly Color colText = Color.FromArgb(38, 51, 64);
        private readonly Color colTextSoft = Color.FromArgb(93, 108, 120);
        private readonly Color colLine = Color.FromArgb(209, 203, 192);

        public RoleChooserForm(string initialRoute, bool startInTray)
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

            this.KeyPreview = true;
            this.KeyDown += RoleChooserForm_KeyDown;

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

        private void RoleChooserForm_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.KeyCode == Keys.P || e.KeyCode == Keys.D1 || e.KeyCode == Keys.NumPad1)
            {
                LaunchApp("/");
                e.Handled = true;
            }
            else if (e.KeyCode == Keys.N || e.KeyCode == Keys.D2 || e.KeyCode == Keys.NumPad2)
            {
                LaunchApp("/nurse");
                e.Handled = true;
            }
            else if (e.KeyCode == Keys.D || e.KeyCode == Keys.D3 || e.KeyCode == Keys.NumPad3)
            {
                LaunchApp("/dual");
                e.Handled = true;
            }
            else if (e.KeyCode == Keys.B || e.KeyCode == Keys.D4 || e.KeyCode == Keys.NumPad4)
            {
                LaunchApp("/board");
                e.Handled = true;
            }
            else if (e.KeyCode == Keys.F1 || e.KeyCode == Keys.H)
            {
                ShowHelp();
                e.Handled = true;
            }
        }

        private void InitUI()
        {
            this.Text = "INTUBATALK · Choose Your Role (Patient or Nurse)";
            this.Size = new Size(860, 660);
            this.MinimumSize = new Size(760, 580);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.BackColor = colBg;
            this.Font = new Font("Segoe UI", 9.5f, FontStyle.Regular);

            // ================= HEADER =================
            Panel pnlHeader = new Panel
            {
                Dock = DockStyle.Top,
                Height = 100,
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
                Font = new Font("Georgia", 20f, FontStyle.Bold),
                ForeColor = colText,
                AutoSize = true,
                Location = new Point(22, 12)
            };

            Label lblSubtitle = new Label
            {
                Text = "Adaptive Communication System for Intubated ICU Patients — Choose your mode:",
                Font = new Font("Segoe UI", 10.5f, FontStyle.Bold),
                ForeColor = colTextSoft,
                AutoSize = true,
                Location = new Point(24, 52)
            };

            lblStatus = new Label
            {
                Text = "● Checking server...",
                Font = new Font("Segoe UI", 9f, FontStyle.Bold),
                ForeColor = Color.DarkOrange,
                AutoSize = true,
                Anchor = AnchorStyles.Top | AnchorStyles.Right,
                Location = new Point(560, 16)
            };

            lblLan = new Label
            {
                Text = "Wi-Fi LAN: Detecting...",
                Font = new Font("Segoe UI", 8.5f, FontStyle.Regular),
                ForeColor = colTextSoft,
                AutoSize = true,
                Anchor = AnchorStyles.Top | AnchorStyles.Right,
                Location = new Point(560, 48)
            };

            pnlHeader.Controls.Add(lblTitle);
            pnlHeader.Controls.Add(lblSubtitle);
            pnlHeader.Controls.Add(lblStatus);
            pnlHeader.Controls.Add(lblLan);
            this.Controls.Add(pnlHeader);

            // ================= MAIN ROLE SELECTION CARDS =================
            TableLayoutPanel roleGrid = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 2,
                RowCount = 1,
                Padding = new Padding(20, 18, 20, 12),
                BackColor = colBg
            };
            roleGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50f));
            roleGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50f));

            // Card 1: Patient Option
            Panel pnlPatient = CreateRoleCard(
                "BEDSIDE PATIENT TABLET",
                "👤 I Am the Patient",
                "Designed for intubated or non-verbal ICU patients to communicate instantly without vocal cords.",
                new string[] {
                    "✓ 1-Tap needs: Breathing, Suction, Pain, Thirst, Toilet",
                    "✓ Numerical 0 to 10 visual pain severity rating",
                    "✓ Nurse-assisted eye-blink protocol (1 = Yes, 2 = No)",
                    "✓ Freehand alphabet spelling pad & speech-to-text",
                    "✓ Loud emergency alert with patient cancel control"
                },
                "▶ Open Patient Tablet  (Press P or 1)",
                colMint, colMintDark,
                () => LaunchApp("/")
            );
            roleGrid.Controls.Add(pnlPatient, 0, 0);

            // Card 2: Nurse Option
            Panel pnlNurse = CreateRoleCard(
                "NURSE STATION DASHBOARD",
                "🩺 I Am the Nurse",
                "Designed for bedside nurses, doctors and ward staff to monitor and respond to patient requests.",
                new string[] {
                    "✓ Live incoming request feed paired via 4-digit code",
                    "✓ Repeating emergency sirens & distinctive chimes",
                    "✓ Instant filter tabs: Emergencies, Active, Handled",
                    "✓ Text-to-speech speaker reads requests aloud",
                    "✓ Patient ability profile & online presence tracking"
                },
                "▶ Open Nurse Dashboard  (Press N or 2)",
                colTeal, colTealDark,
                () => LaunchApp("/nurse")
            );
            roleGrid.Controls.Add(pnlNurse, 1, 0);

            this.Controls.Add(roleGrid);

            // ================= BOTTOM TOOLBAR =================
            Panel pnlBottom = new Panel
            {
                Dock = DockStyle.Bottom,
                Height = 60,
                BackColor = colSurface,
                Padding = new Padding(20, 12, 20, 12)
            };
            pnlBottom.Paint += (s, e) =>
            {
                using (Pen p = new Pen(colLine))
                {
                    e.Graphics.DrawLine(p, 0, 0, pnlBottom.Width, 0);
                }
            };

            FlowLayoutPanel flowLeft = new FlowLayoutPanel
            {
                Dock = DockStyle.Left,
                AutoSize = true,
                WrapContents = false,
                Height = 40
            };

            Button btnDual = CreateSmallButton("👥 Dual Presentation View (3/D)", (s, e) => LaunchApp("/dual"));
            btnDual.Width = 210;
            Button btnBoard = CreateSmallButton("📋 Printable Board (4/B)", (s, e) => LaunchApp("/board"));
            btnBoard.Width = 170;
            Button btnWifi = CreateSmallButton("🌐 Copy Wi-Fi Link", (s, e) => CopyLanUrl());
            btnWifi.Width = 140;

            flowLeft.Controls.Add(btnDual);
            flowLeft.Controls.Add(btnBoard);
            flowLeft.Controls.Add(btnWifi);

            FlowLayoutPanel flowRight = new FlowLayoutPanel
            {
                Dock = DockStyle.Right,
                AutoSize = true,
                WrapContents = false,
                Height = 40
            };

            Button btnHelp = CreateSmallButton("❓ Help & Hotkeys", (s, e) => ShowHelp());
            btnHelp.Width = 130;
            Button btnRestart = CreateSmallButton("🔄 Restart Server", (s, e) => RestartServer());
            btnRestart.Width = 125;

            flowRight.Controls.Add(btnHelp);
            flowRight.Controls.Add(btnRestart);

            pnlBottom.Controls.Add(flowLeft);
            pnlBottom.Controls.Add(flowRight);
            this.Controls.Add(pnlBottom);

            SetStyle(ControlStyles.OptimizedDoubleBuffer | ControlStyles.AllPaintingInWmPaint, true);
        }

        private Panel CreateRoleCard(string badge, string title, string description, string[] features, string ctaText, Color c1, Color c2, Action onLaunch)
        {
            Panel card = new Panel
            {
                Dock = DockStyle.Fill,
                Margin = new Padding(12),
                BackColor = Color.White,
                Padding = new Padding(22, 20, 22, 18)
            };

            card.Paint += (s, e) =>
            {
                e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
                Rectangle rect = new Rectangle(0, 0, card.Width - 1, card.Height - 1);

                // Subtle shadow & border
                using (Pen p = new Pen(Color.FromArgb(215, 210, 200), 1.5f))
                {
                    e.Graphics.DrawRectangle(p, rect);
                }

                // Top accent bar
                using (LinearGradientBrush b = new LinearGradientBrush(new Rectangle(0, 0, card.Width, 8), c1, c2, 0f))
                {
                    e.Graphics.FillRectangle(b, 0, 0, card.Width, 8);
                }
            };

            Label lblBadge = new Label
            {
                Text = badge,
                Font = new Font("Segoe UI", 8f, FontStyle.Bold),
                ForeColor = c1,
                AutoSize = true,
                Location = new Point(22, 18)
            };

            Label lblCardTitle = new Label
            {
                Text = title,
                Font = new Font("Segoe UI", 16f, FontStyle.Bold),
                ForeColor = colText,
                AutoSize = true,
                Location = new Point(20, 36)
            };

            Label lblDesc = new Label
            {
                Text = description,
                Font = new Font("Segoe UI", 9.5f, FontStyle.Regular),
                ForeColor = colTextSoft,
                Size = new Size(card.Width - 44, 42),
                Location = new Point(22, 72),
                Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right
            };

            // Bullet features panel
            Panel pnlFeatures = new Panel
            {
                Location = new Point(22, 118),
                Size = new Size(card.Width - 44, 170),
                Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right | AnchorStyles.Bottom,
                BackColor = Color.FromArgb(250, 250, 248)
            };
            pnlFeatures.Paint += (s, e) =>
            {
                using (Pen p = new Pen(Color.FromArgb(235, 230, 222)))
                {
                    e.Graphics.DrawRectangle(p, 0, 0, pnlFeatures.Width - 1, pnlFeatures.Height - 1);
                }
            };

            int yOffset = 10;
            foreach (string feat in features)
            {
                Label lblFeat = new Label
                {
                    Text = feat,
                    Font = new Font("Segoe UI", 9.2f, FontStyle.Regular),
                    ForeColor = colText,
                    Location = new Point(12, yOffset),
                    AutoSize = true
                };
                pnlFeatures.Controls.Add(lblFeat);
                yOffset += 28;
            }

            // Big CTA Button
            Button btnCta = new Button
            {
                Text = ctaText,
                Height = 52,
                Dock = DockStyle.Bottom,
                FlatStyle = FlatStyle.Flat,
                Font = new Font("Segoe UI", 11.5f, FontStyle.Bold),
                ForeColor = Color.White,
                BackColor = c1,
                Cursor = Cursors.Hand
            };
            btnCta.FlatAppearance.BorderSize = 0;
            btnCta.Paint += (s, e) =>
            {
                using (LinearGradientBrush b = new LinearGradientBrush(btnCta.ClientRectangle, c1, c2, 135f))
                {
                    e.Graphics.FillRectangle(b, btnCta.ClientRectangle);
                }
                TextRenderer.DrawText(e.Graphics, ctaText, btnCta.Font, btnCta.ClientRectangle, Color.White, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
            };
            btnCta.Click += (s, e) => onLaunch();

            card.Controls.Add(lblBadge);
            card.Controls.Add(lblCardTitle);
            card.Controls.Add(lblDesc);
            card.Controls.Add(pnlFeatures);
            card.Controls.Add(btnCta);

            return card;
        }

        private Button CreateSmallButton(string text, EventHandler onClick)
        {
            Button btn = new Button
            {
                Text = text,
                Height = 34,
                Font = new Font("Segoe UI", 8.8f, FontStyle.Bold),
                ForeColor = colText,
                BackColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Cursor = Cursors.Hand,
                Margin = new Padding(0, 0, 8, 0)
            };
            btn.FlatAppearance.BorderColor = colLine;
            btn.Click += onClick;
            return btn;
        }

        private void InitTray()
        {
            trayMenu = new ContextMenuStrip();
            trayMenu.Items.Add("📱 Open Patient Tablet", null, (s, e) => LaunchApp("/"));
            trayMenu.Items.Add("🩺 Open Nurse Dashboard", null, (s, e) => LaunchApp("/nurse"));
            trayMenu.Items.Add("👥 Open Dual Simulator", null, (s, e) => LaunchApp("/dual"));
            trayMenu.Items.Add("📋 Open Printable Board", null, (s, e) => LaunchApp("/board"));
            trayMenu.Items.Add("-");
            trayMenu.Items.Add("Open Role Chooser Hub", null, (s, e) => RestoreFromTray());
            trayMenu.Items.Add("Copy Bedside Wi-Fi URL", null, (s, e) => CopyLanUrl());
            trayMenu.Items.Add("-");
            trayMenu.Items.Add("Exit Application", null, (s, e) => Application.Exit());

            trayIcon = new NotifyIcon
            {
                Text = "INTUBATALK ICU System",
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
                    lblStatus.Text = "● Node start error: " + ex.Message;
                    lblStatus.ForeColor = Color.Red;
                }
            }

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
                lblStatus.ForeColor = Color.Red;
            }
        }

        private void UpdateLanInfo()
        {
            string lanIp = GetLocalIpAddress();
            lblLan.Text = "Bedside Wi-Fi: http://" + lanIp + ":" + serverPort + "/";
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
                "\n\nOpen this address in any browser (Safari, Chrome, Edge) on iPads, Android tablets, or phones on the same Wi-Fi network to connect directly to this patient room.",
                "Bedside Wi-Fi Connection",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
        }

        private void ShowHelp()
        {
            MessageBox.Show(
                "INTUBATALK Accessibility & Quick Keys:\n\n" +
                "• Press [P] or [1]: Enter Patient Tablet\n" +
                "• Press [N] or [2]: Enter Nurse Dashboard\n" +
                "• Press [D] or [3]: Enter Dual Presentation Simulator\n" +
                "• Press [B] or [4]: Open Printable Backup Board\n" +
                "• Press [Tab]: Navigate between role cards and buttons\n" +
                "• Press [Enter]: Activate selected button\n\n" +
                "How Pairing Works:\n" +
                "1. Patient registers on the tablet -> receives a 4-digit room code.\n" +
                "2. Nurse enters that 4-digit code on the dashboard -> devices pair instantly.\n" +
                "3. In emergency, pressing the red button sounds a continuous alarm until silenced.",
                "INTUBATALK Guide & Accessibility",
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

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            if (e.CloseReason == CloseReason.UserClosing)
            {
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
