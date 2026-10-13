// INTUBATALK Windows Desktop Application & Role Chooser
// Native Windows executable compiled with C# (.NET Framework 4.x).
// Provides an accessible role selection screen matching the web app's
// "Clinical Claymorphism" design system — warm beige bg, raised clay cards
// with dual shadows, mint/teal gradient buttons, serif display type.

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

    // ─────────────────────────────────────────────────────────────────
    //  Custom owner-drawn panel that renders a claymorphism card
    //  with rounded corners and soft dual (light+dark) shadows.
    // ─────────────────────────────────────────────────────────────────
    public class ClayPanel : Panel
    {
        public int Radius { get; set; }
        public Color FillColor { get; set; }
        public Color AccentColor { get; set; }
        public bool ShowAccentBar { get; set; }
        private bool _hover = false;

        public ClayPanel()
        {
            Radius = 22;
            FillColor = Color.FromArgb(248, 247, 244);
            AccentColor = Color.Transparent;
            ShowAccentBar = false;
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint |
                     ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw |
                     ControlStyles.SupportsTransparentBackColor, true);
            BackColor = Color.Transparent;
            Padding = new Padding(24, 20, 24, 18);
        }

        private GraphicsPath RoundedRect(Rectangle r, int rad)
        {
            GraphicsPath gp = new GraphicsPath();
            int d = rad * 2;
            gp.AddArc(r.X, r.Y, d, d, 180, 90);
            gp.AddArc(r.Right - d, r.Y, d, d, 270, 90);
            gp.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
            gp.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
            gp.CloseFigure();
            return gp;
        }

        protected override void OnMouseEnter(EventArgs e)
        {
            _hover = true;
            Invalidate();
            base.OnMouseEnter(e);
        }

        protected override void OnMouseLeave(EventArgs e)
        {
            _hover = false;
            Invalidate();
            base.OnMouseLeave(e);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            Graphics g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;

            Rectangle body = new Rectangle(12, 10, Width - 24, Height - 22);

            // Dark shadow (bottom-right)
            Rectangle shadowDark = new Rectangle(body.X + 6, body.Y + 7, body.Width, body.Height);
            using (GraphicsPath sp = RoundedRect(shadowDark, Radius))
            using (SolidBrush sb = new SolidBrush(Color.FromArgb(_hover ? 38 : 30, 103, 112, 108)))
            {
                g.FillPath(sb, sp);
            }

            // Light shadow (top-left)
            Rectangle shadowLight = new Rectangle(body.X - 5, body.Y - 5, body.Width, body.Height);
            using (GraphicsPath sp = RoundedRect(shadowLight, Radius))
            using (SolidBrush sb = new SolidBrush(Color.FromArgb(_hover ? 200 : 180, 255, 255, 255)))
            {
                g.FillPath(sb, sp);
            }

            // Main body fill
            using (GraphicsPath gp = RoundedRect(body, Radius))
            {
                using (SolidBrush fb = new SolidBrush(FillColor))
                {
                    g.FillPath(fb, gp);
                }

                // Inset highlight (top-left inner edge)
                using (Pen pHighlight = new Pen(Color.FromArgb(140, 255, 255, 255), 1.5f))
                {
                    g.DrawPath(pHighlight, gp);
                }
            }

            // Inner subtle border
            Rectangle innerRect = new Rectangle(body.X + 1, body.Y + 1, body.Width - 2, body.Height - 2);
            using (GraphicsPath ip = RoundedRect(innerRect, Radius - 1))
            using (Pen pInner = new Pen(Color.FromArgb(30, 96, 99, 106), 1f))
            {
                g.DrawPath(pInner, ip);
            }

            // Accent bar at top
            if (ShowAccentBar && AccentColor != Color.Transparent)
            {
                Rectangle barClip = new Rectangle(body.X, body.Y, body.Width, Radius + 6);
                using (GraphicsPath fullPath = RoundedRect(body, Radius))
                {
                    Region oldClip = g.Clip;
                    g.SetClip(barClip);
                    g.IntersectClip(new Region(fullPath));

                    Color accentEnd = ControlPaint.Dark(AccentColor, 0.15f);
                    using (LinearGradientBrush lb = new LinearGradientBrush(
                        new Rectangle(body.X, body.Y, body.Width, 7), AccentColor, accentEnd, 0f))
                    {
                        g.FillRectangle(lb, body.X, body.Y, body.Width, 7);
                    }

                    g.Clip = oldClip;
                }
            }

            base.OnPaint(e);
        }
    }

    // ─────────────────────────────────────────────────────────────────
    //  Custom gradient button with rounded corners for CTA actions.
    // ─────────────────────────────────────────────────────────────────
    public class GradientButton : Button
    {
        public Color GradFrom { get; set; }
        public Color GradTo { get; set; }
        public int Radius { get; set; }
        private bool _hover = false;
        private bool _pressed = false;

        public GradientButton()
        {
            GradFrom = Color.FromArgb(76, 177, 160);
            GradTo = Color.FromArgb(56, 147, 127);
            Radius = 14;
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint |
                     ControlStyles.OptimizedDoubleBuffer, true);
            FlatStyle = FlatStyle.Flat;
            FlatAppearance.BorderSize = 0;
            ForeColor = Color.White;
            Cursor = Cursors.Hand;
            Font = new Font("Segoe UI", 12f, FontStyle.Bold);
        }

        private GraphicsPath RoundedRect(Rectangle r, int rad)
        {
            GraphicsPath gp = new GraphicsPath();
            int d = rad * 2;
            gp.AddArc(r.X, r.Y, d, d, 180, 90);
            gp.AddArc(r.Right - d, r.Y, d, d, 270, 90);
            gp.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
            gp.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
            gp.CloseFigure();
            return gp;
        }

        protected override void OnMouseEnter(EventArgs e) { _hover = true; Invalidate(); base.OnMouseEnter(e); }
        protected override void OnMouseLeave(EventArgs e) { _hover = false; _pressed = false; Invalidate(); base.OnMouseLeave(e); }
        protected override void OnMouseDown(MouseEventArgs e) { _pressed = true; Invalidate(); base.OnMouseDown(e); }
        protected override void OnMouseUp(MouseEventArgs e) { _pressed = false; Invalidate(); base.OnMouseUp(e); }

        protected override void OnPaint(PaintEventArgs e)
        {
            Graphics g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.Clear(Parent != null ? Parent.BackColor : Color.Transparent);

            Rectangle r = new Rectangle(0, 0, Width - 1, Height - 1);

            // Shadow behind button
            if (!_pressed)
            {
                Rectangle shadowR = new Rectangle(r.X + 3, r.Y + 4, r.Width, r.Height);
                using (GraphicsPath sp = RoundedRect(shadowR, Radius))
                using (SolidBrush sb = new SolidBrush(Color.FromArgb(30, 0, 0, 0)))
                {
                    g.FillPath(sb, sp);
                }
            }

            Color c1 = _hover ? ControlPaint.Light(GradFrom, 0.08f) : GradFrom;
            Color c2 = _hover ? ControlPaint.Light(GradTo, 0.08f) : GradTo;
            if (_pressed) { c1 = ControlPaint.Dark(GradFrom, 0.06f); c2 = ControlPaint.Dark(GradTo, 0.06f); }

            using (GraphicsPath gp = RoundedRect(r, Radius))
            {
                using (LinearGradientBrush lb = new LinearGradientBrush(r, c1, c2, 135f))
                {
                    g.FillPath(lb, gp);
                }

                // Inner highlight
                using (Pen p = new Pen(Color.FromArgb(60, 255, 255, 255), 1f))
                {
                    g.DrawPath(p, gp);
                }
            }

            // Text
            TextRenderer.DrawText(g, Text, Font, r,
                Color.White, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
        }
    }

    // ─────────────────────────────────────────────────────────────────
    //  Custom small toolbar button with rounded corners and clay look.
    // ─────────────────────────────────────────────────────────────────
    public class ClayToolButton : Button
    {
        private bool _hover = false;
        private readonly Color colSurface = Color.FromArgb(248, 247, 244);
        private readonly Color colLine = Color.FromArgb(209, 203, 192);
        private readonly Color colText = Color.FromArgb(38, 51, 64);

        public ClayToolButton()
        {
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint |
                     ControlStyles.OptimizedDoubleBuffer, true);
            FlatStyle = FlatStyle.Flat;
            FlatAppearance.BorderSize = 0;
            Cursor = Cursors.Hand;
            Font = new Font("Segoe UI", 8.8f, FontStyle.Bold);
            ForeColor = colText;
            Height = 34;
            Margin = new Padding(0, 0, 8, 0);
        }

        protected override void OnMouseEnter(EventArgs e) { _hover = true; Invalidate(); base.OnMouseEnter(e); }
        protected override void OnMouseLeave(EventArgs e) { _hover = false; Invalidate(); base.OnMouseLeave(e); }

        protected override void OnPaint(PaintEventArgs e)
        {
            Graphics g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.Clear(Parent != null ? Parent.BackColor : colSurface);

            Rectangle r = new Rectangle(1, 1, Width - 3, Height - 3);
            GraphicsPath gp = new GraphicsPath();
            int rad = 10;
            int d = rad * 2;
            gp.AddArc(r.X, r.Y, d, d, 180, 90);
            gp.AddArc(r.Right - d, r.Y, d, d, 270, 90);
            gp.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
            gp.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
            gp.CloseFigure();

            Color fill = _hover ? Color.White : colSurface;
            using (SolidBrush sb = new SolidBrush(fill)) { g.FillPath(sb, gp); }
            using (Pen p = new Pen(colLine, 1f)) { g.DrawPath(p, gp); }

            TextRenderer.DrawText(g, Text, Font, r,
                colText, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);

            gp.Dispose();
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  MAIN ROLE CHOOSER FORM
    // ═══════════════════════════════════════════════════════════════
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

        // ── Palette (matches base.css :root) ──
        private readonly Color colBg      = Color.FromArgb(243, 241, 236);  // --bg
        private readonly Color colSurface = Color.FromArgb(248, 247, 244);  // --surface
        private readonly Color colSurf2   = Color.FromArgb(239, 237, 231);  // --surface-2
        private readonly Color colLine    = Color.FromArgb(221, 216, 207);  // --line
        private readonly Color colLineSt  = Color.FromArgb(201, 195, 183);  // --line-strong
        private readonly Color colText    = Color.FromArgb(38, 51, 64);     // --text
        private readonly Color colSoft    = Color.FromArgb(93, 108, 120);   // --text-soft
        private readonly Color colFaint   = Color.FromArgb(144, 154, 163);  // --text-faint
        // Accents
        private readonly Color colMint    = Color.FromArgb(63, 167, 150);   // --accent
        private readonly Color colMintDk  = Color.FromArgb(51, 138, 124);   // --accent-deep
        private readonly Color colTeal    = Color.FromArgb(63, 127, 167);   // teal variant
        private readonly Color colTealDk  = Color.FromArgb(51, 106, 140);   // teal deep
        private readonly Color colAlert   = Color.FromArgb(212, 84, 84);    // --alert

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
            healthTimer.Tick += delegate { CheckServerStatus(); };
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
            { LaunchApp("/"); e.Handled = true; }
            else if (e.KeyCode == Keys.N || e.KeyCode == Keys.D2 || e.KeyCode == Keys.NumPad2)
            { LaunchApp("/nurse"); e.Handled = true; }
            else if (e.KeyCode == Keys.D || e.KeyCode == Keys.D3 || e.KeyCode == Keys.NumPad3)
            { LaunchApp("/dual"); e.Handled = true; }
            else if (e.KeyCode == Keys.B || e.KeyCode == Keys.D4 || e.KeyCode == Keys.NumPad4)
            { LaunchApp("/board"); e.Handled = true; }
            else if (e.KeyCode == Keys.F1 || e.KeyCode == Keys.H)
            { ShowHelp(); e.Handled = true; }
        }

        // ─────────────────────────────────────────────────
        //  Build the UI
        // ─────────────────────────────────────────────────
        private void InitUI()
        {
            this.Text = "INTUBATALK";
            this.Size = new Size(900, 700);
            this.MinimumSize = new Size(780, 600);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.BackColor = colBg;
            this.Font = new Font("Segoe UI", 9.5f, FontStyle.Regular);
            SetStyle(ControlStyles.OptimizedDoubleBuffer | ControlStyles.AllPaintingInWmPaint, true);

            // Subtle radial gradient tint painted on form background
            this.Paint += delegate(object sender, PaintEventArgs pe)
            {
                Graphics g = pe.Graphics;
                // Mint glow top-right
                Rectangle glowTR = new Rectangle(Width / 2, -80, (int)(Width * 0.8), (int)(Height * 0.6));
                using (GraphicsPath gp = new GraphicsPath())
                {
                    gp.AddEllipse(glowTR);
                    using (PathGradientBrush pgb = new PathGradientBrush(gp))
                    {
                        pgb.CenterColor = Color.FromArgb(14, 63, 167, 150);
                        pgb.SurroundColors = new Color[] { Color.FromArgb(0, 63, 167, 150) };
                        g.FillPath(pgb, gp);
                    }
                }
            };

            // ═══════ HEADER ═══════
            Panel pnlHeader = new Panel
            {
                Dock = DockStyle.Top,
                Height = 110,
                BackColor = colSurface,
                Padding = new Padding(28, 0, 28, 0)
            };
            pnlHeader.Paint += delegate(object sender, PaintEventArgs pe)
            {
                Graphics g = pe.Graphics;
                g.SmoothingMode = SmoothingMode.AntiAlias;

                // Bottom separator line
                using (Pen p = new Pen(colLine))
                {
                    g.DrawLine(p, 0, pnlHeader.Height - 1, pnlHeader.Width, pnlHeader.Height - 1);
                }

                // ── Brand mark: rounded square with gradient ──
                int markSize = 50;
                int markX = 26;
                int markY = 18;
                Rectangle markRect = new Rectangle(markX, markY, markSize, markSize);
                GraphicsPath markPath = new GraphicsPath();
                int markRad = 14;
                int md = markRad * 2;
                markPath.AddArc(markRect.X, markRect.Y, md, md, 180, 90);
                markPath.AddArc(markRect.Right - md, markRect.Y, md, md, 270, 90);
                markPath.AddArc(markRect.Right - md, markRect.Bottom - md, md, md, 0, 90);
                markPath.AddArc(markRect.X, markRect.Bottom - md, md, md, 90, 90);
                markPath.CloseFigure();

                using (LinearGradientBrush lb = new LinearGradientBrush(markRect, colMint, colMintDk, 135f))
                {
                    g.FillPath(lb, markPath);
                }
                // Inset highlight
                using (Pen hp = new Pen(Color.FromArgb(80, 255, 255, 255), 1.2f))
                {
                    g.DrawPath(hp, markPath);
                }

                // Soundwave bars inside mark
                int cx = markX + markSize / 2;
                int cy = markY + markSize / 2;
                using (Pen wp = new Pen(Color.FromArgb(220, 255, 255, 255), 2.5f))
                {
                    wp.StartCap = LineCap.Round;
                    wp.EndCap = LineCap.Round;
                    g.DrawLine(wp, cx - 8, cy - 8, cx - 8, cy + 8);
                    g.DrawLine(wp, cx - 1, cy - 13, cx - 1, cy + 13);
                    g.DrawLine(wp, cx + 7, cy - 6, cx + 7, cy + 6);
                }

                markPath.Dispose();
            };

            // Title label (serif display font)
            Label lblTitle = new Label
            {
                Text = "INTUBATALK",
                Font = new Font("Georgia", 22f, FontStyle.Bold),
                ForeColor = colText,
                AutoSize = true,
                BackColor = colSurface,
                Location = new Point(86, 18)
            };

            Label lblTagline = new Label
            {
                Text = "Speak without a voice. Touch, spell, blink, alert.",
                Font = new Font("Georgia", 10f, FontStyle.Italic),
                ForeColor = colSoft,
                AutoSize = true,
                BackColor = colSurface,
                Location = new Point(88, 52)
            };

            Label lblChoose = new Label
            {
                Text = "Choose your role to get started:",
                Font = new Font("Segoe UI", 10f, FontStyle.Bold),
                ForeColor = colFaint,
                AutoSize = true,
                BackColor = colSurface,
                Location = new Point(88, 78)
            };

            // Server status (top-right)
            lblStatus = new Label
            {
                Text = "● Checking server...",
                Font = new Font("Segoe UI", 9f, FontStyle.Bold),
                ForeColor = Color.DarkOrange,
                AutoSize = true,
                BackColor = colSurface,
                Anchor = AnchorStyles.Top | AnchorStyles.Right,
                Location = new Point(600, 22)
            };

            lblLan = new Label
            {
                Text = "Wi-Fi LAN: Detecting...",
                Font = new Font("Segoe UI", 8.5f, FontStyle.Regular),
                ForeColor = colSoft,
                AutoSize = true,
                BackColor = colSurface,
                Anchor = AnchorStyles.Top | AnchorStyles.Right,
                Location = new Point(600, 46)
            };

            pnlHeader.Controls.Add(lblTitle);
            pnlHeader.Controls.Add(lblTagline);
            pnlHeader.Controls.Add(lblChoose);
            pnlHeader.Controls.Add(lblStatus);
            pnlHeader.Controls.Add(lblLan);
            this.Controls.Add(pnlHeader);

            // ═══════ MAIN CARD AREA (two side-by-side clay cards) ═══════
            TableLayoutPanel cardGrid = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 2,
                RowCount = 1,
                Padding = new Padding(12, 16, 12, 8),
                BackColor = Color.Transparent
            };
            cardGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50f));
            cardGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50f));

            // ── Patient card ──
            ClayPanel cardPatient = new ClayPanel
            {
                Dock = DockStyle.Fill,
                Margin = new Padding(8, 6, 6, 6),
                AccentColor = colMint,
                ShowAccentBar = true
            };

            Label lblPatBadge = new Label
            {
                Text = "BEDSIDE PATIENT TABLET",
                Font = new Font("Segoe UI", 8f, FontStyle.Bold),
                ForeColor = colMint,
                AutoSize = true,
                BackColor = Color.Transparent,
                Location = new Point(26, 24)
            };

            Label lblPatIcon = new Label
            {
                Text = "\U0001F464",
                Font = new Font("Segoe UI Emoji", 28f),
                AutoSize = true,
                BackColor = Color.Transparent,
                Location = new Point(24, 44)
            };

            Label lblPatTitle = new Label
            {
                Text = "I Am the Patient",
                Font = new Font("Georgia", 17f, FontStyle.Bold),
                ForeColor = colText,
                AutoSize = true,
                BackColor = Color.Transparent,
                Location = new Point(72, 50)
            };

            Label lblPatDesc = new Label
            {
                Text = "Designed for intubated or non-verbal ICU\npatients to communicate instantly.",
                Font = new Font("Segoe UI", 9.5f, FontStyle.Regular),
                ForeColor = colSoft,
                AutoSize = false,
                BackColor = Color.Transparent,
                Size = new Size(340, 40),
                Location = new Point(26, 90),
                Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right
            };

            // Feature bullets
            string[] patFeats = new string[] {
                "\u2713  1-Tap needs: Breathing, Suction, Pain, Thirst",
                "\u2713  Visual 0\u201310 pain severity rating scale",
                "\u2713  Nurse-assisted eye-blink protocol",
                "\u2713  Freehand alphabet spelling & speech-to-text",
                "\u2713  Loud emergency alert with patient cancel"
            };

            Panel pnlPatFeats = new Panel
            {
                Location = new Point(26, 136),
                Size = new Size(340, 155),
                BackColor = Color.FromArgb(245, 244, 240),
                Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right | AnchorStyles.Bottom
            };
            pnlPatFeats.Paint += delegate(object s, PaintEventArgs pe)
            {
                Graphics g = pe.Graphics;
                g.SmoothingMode = SmoothingMode.AntiAlias;
                Rectangle r = new Rectangle(0, 0, pnlPatFeats.Width - 1, pnlPatFeats.Height - 1);
                GraphicsPath gp = new GraphicsPath();
                gp.AddArc(r.X, r.Y, 16, 16, 180, 90);
                gp.AddArc(r.Right - 16, r.Y, 16, 16, 270, 90);
                gp.AddArc(r.Right - 16, r.Bottom - 16, 16, 16, 0, 90);
                gp.AddArc(r.X, r.Bottom - 16, 16, 16, 90, 90);
                gp.CloseFigure();
                using (Pen p = new Pen(Color.FromArgb(230, 226, 218), 1f)) { g.DrawPath(p, gp); }
                gp.Dispose();
            };

            int yOff = 10;
            foreach (string f in patFeats)
            {
                Label lbl = new Label
                {
                    Text = f,
                    Font = new Font("Segoe UI", 9f),
                    ForeColor = colText,
                    AutoSize = true,
                    BackColor = Color.Transparent,
                    Location = new Point(14, yOff)
                };
                pnlPatFeats.Controls.Add(lbl);
                yOff += 27;
            }

            // CTA button
            GradientButton btnPatient = new GradientButton
            {
                Text = "\u25B6  Open Patient Tablet  (P / 1)",
                GradFrom = colMint,
                GradTo = colMintDk,
                Height = 54,
                Dock = DockStyle.Bottom,
                Font = new Font("Segoe UI", 12f, FontStyle.Bold)
            };
            btnPatient.Click += delegate { LaunchApp("/"); };

            cardPatient.Controls.Add(lblPatBadge);
            cardPatient.Controls.Add(lblPatIcon);
            cardPatient.Controls.Add(lblPatTitle);
            cardPatient.Controls.Add(lblPatDesc);
            cardPatient.Controls.Add(pnlPatFeats);
            cardPatient.Controls.Add(btnPatient);
            cardGrid.Controls.Add(cardPatient, 0, 0);

            // ── Nurse card ──
            ClayPanel cardNurse = new ClayPanel
            {
                Dock = DockStyle.Fill,
                Margin = new Padding(6, 6, 8, 6),
                AccentColor = colTeal,
                ShowAccentBar = true
            };

            Label lblNurBadge = new Label
            {
                Text = "NURSE STATION DASHBOARD",
                Font = new Font("Segoe UI", 8f, FontStyle.Bold),
                ForeColor = colTeal,
                AutoSize = true,
                BackColor = Color.Transparent,
                Location = new Point(26, 24)
            };

            Label lblNurIcon = new Label
            {
                Text = "\U0001FA7A",
                Font = new Font("Segoe UI Emoji", 28f),
                AutoSize = true,
                BackColor = Color.Transparent,
                Location = new Point(24, 44)
            };

            Label lblNurTitle = new Label
            {
                Text = "I Am the Nurse",
                Font = new Font("Georgia", 17f, FontStyle.Bold),
                ForeColor = colText,
                AutoSize = true,
                BackColor = Color.Transparent,
                Location = new Point(72, 50)
            };

            Label lblNurDesc = new Label
            {
                Text = "Designed for bedside nurses, doctors and\nward staff to monitor patient requests.",
                Font = new Font("Segoe UI", 9.5f, FontStyle.Regular),
                ForeColor = colSoft,
                AutoSize = false,
                BackColor = Color.Transparent,
                Size = new Size(340, 40),
                Location = new Point(26, 90),
                Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right
            };

            string[] nurFeats = new string[] {
                "\u2713  Live request feed paired via 4-digit code",
                "\u2713  Repeating emergency sirens & chimes",
                "\u2713  Filter tabs: Emergencies, Active, Handled",
                "\u2713  Text-to-speech reads requests aloud",
                "\u2713  Patient ability profile & presence tracking"
            };

            Panel pnlNurFeats = new Panel
            {
                Location = new Point(26, 136),
                Size = new Size(340, 155),
                BackColor = Color.FromArgb(245, 244, 240),
                Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right | AnchorStyles.Bottom
            };
            pnlNurFeats.Paint += delegate(object s, PaintEventArgs pe)
            {
                Graphics g = pe.Graphics;
                g.SmoothingMode = SmoothingMode.AntiAlias;
                Rectangle r = new Rectangle(0, 0, pnlNurFeats.Width - 1, pnlNurFeats.Height - 1);
                GraphicsPath gp = new GraphicsPath();
                gp.AddArc(r.X, r.Y, 16, 16, 180, 90);
                gp.AddArc(r.Right - 16, r.Y, 16, 16, 270, 90);
                gp.AddArc(r.Right - 16, r.Bottom - 16, 16, 16, 0, 90);
                gp.AddArc(r.X, r.Bottom - 16, 16, 16, 90, 90);
                gp.CloseFigure();
                using (Pen p = new Pen(Color.FromArgb(230, 226, 218), 1f)) { g.DrawPath(p, gp); }
                gp.Dispose();
            };

            yOff = 10;
            foreach (string f in nurFeats)
            {
                Label lbl = new Label
                {
                    Text = f,
                    Font = new Font("Segoe UI", 9f),
                    ForeColor = colText,
                    AutoSize = true,
                    BackColor = Color.Transparent,
                    Location = new Point(14, yOff)
                };
                pnlNurFeats.Controls.Add(lbl);
                yOff += 27;
            }

            GradientButton btnNurse = new GradientButton
            {
                Text = "\u25B6  Open Nurse Dashboard  (N / 2)",
                GradFrom = colTeal,
                GradTo = colTealDk,
                Height = 54,
                Dock = DockStyle.Bottom,
                Font = new Font("Segoe UI", 12f, FontStyle.Bold)
            };
            btnNurse.Click += delegate { LaunchApp("/nurse"); };

            cardNurse.Controls.Add(lblNurBadge);
            cardNurse.Controls.Add(lblNurIcon);
            cardNurse.Controls.Add(lblNurTitle);
            cardNurse.Controls.Add(lblNurDesc);
            cardNurse.Controls.Add(pnlNurFeats);
            cardNurse.Controls.Add(btnNurse);
            cardGrid.Controls.Add(cardNurse, 1, 0);

            this.Controls.Add(cardGrid);

            // ═══════ BOTTOM TOOLBAR ═══════
            Panel pnlBottom = new Panel
            {
                Dock = DockStyle.Bottom,
                Height = 64,
                BackColor = colSurface,
                Padding = new Padding(20, 14, 20, 14)
            };
            pnlBottom.Paint += delegate(object sender, PaintEventArgs pe)
            {
                using (Pen p = new Pen(colLine))
                {
                    pe.Graphics.DrawLine(p, 0, 0, pnlBottom.Width, 0);
                }
            };

            FlowLayoutPanel flowLeft = new FlowLayoutPanel
            {
                Dock = DockStyle.Left,
                AutoSize = true,
                WrapContents = false,
                Height = 38,
                BackColor = colSurface
            };

            ClayToolButton btnDual = new ClayToolButton { Text = "\U0001F465 Dual View (3/D)", Width = 150 };
            btnDual.Click += delegate { LaunchApp("/dual"); };
            ClayToolButton btnBoard = new ClayToolButton { Text = "\U0001F4CB Board (4/B)", Width = 130 };
            btnBoard.Click += delegate { LaunchApp("/board"); };
            ClayToolButton btnWifi = new ClayToolButton { Text = "\U0001F310 Copy Wi-Fi Link", Width = 145 };
            btnWifi.Click += delegate { CopyLanUrl(); };

            flowLeft.Controls.Add(btnDual);
            flowLeft.Controls.Add(btnBoard);
            flowLeft.Controls.Add(btnWifi);

            FlowLayoutPanel flowRight = new FlowLayoutPanel
            {
                Dock = DockStyle.Right,
                AutoSize = true,
                WrapContents = false,
                Height = 38,
                BackColor = colSurface
            };

            ClayToolButton btnHelp = new ClayToolButton { Text = "\u2753 Help & Keys", Width = 115 };
            btnHelp.Click += delegate { ShowHelp(); };
            ClayToolButton btnRestart = new ClayToolButton { Text = "\U0001F504 Restart Server", Width = 125 };
            btnRestart.Click += delegate { RestartServer(); };

            flowRight.Controls.Add(btnHelp);
            flowRight.Controls.Add(btnRestart);

            pnlBottom.Controls.Add(flowLeft);
            pnlBottom.Controls.Add(flowRight);
            this.Controls.Add(pnlBottom);
        }

        // ─────────────────────────────────────────────────
        //  System Tray
        // ─────────────────────────────────────────────────
        private void InitTray()
        {
            trayMenu = new ContextMenuStrip();
            trayMenu.Items.Add("\U0001F4F1 Open Patient Tablet", null, delegate { LaunchApp("/"); });
            trayMenu.Items.Add("\U0001FA7A Open Nurse Dashboard", null, delegate { LaunchApp("/nurse"); });
            trayMenu.Items.Add("\U0001F465 Open Dual Simulator", null, delegate { LaunchApp("/dual"); });
            trayMenu.Items.Add("\U0001F4CB Open Printable Board", null, delegate { LaunchApp("/board"); });
            trayMenu.Items.Add("-");
            trayMenu.Items.Add("Open Role Chooser Hub", null, delegate { RestoreFromTray(); });
            trayMenu.Items.Add("Copy Bedside Wi-Fi URL", null, delegate { CopyLanUrl(); });
            trayMenu.Items.Add("-");
            trayMenu.Items.Add("Exit Application", null, delegate { Application.Exit(); });

            trayIcon = new NotifyIcon
            {
                Text = "INTUBATALK ICU System",
                Icon = customIcon != null ? customIcon : SystemIcons.Application,
                ContextMenuStrip = trayMenu,
                Visible = true
            };
            trayIcon.DoubleClick += delegate { RestoreFromTray(); };
        }

        private void RestoreFromTray()
        {
            this.ShowInTaskbar = true;
            this.WindowState = FormWindowState.Normal;
            this.BringToFront();
            this.Activate();
        }

        // ─────────────────────────────────────────────────
        //  Server lifecycle
        // ─────────────────────────────────────────────────
        private void StartServerIfNeeded()
        {
            if (IsServerAnswering(serverPort))
            {
                lblStatus.Text = "\u25CF Server Online (Port " + serverPort + ")";
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
                    lblStatus.Text = "\u25CF Starting server...";
                    lblStatus.ForeColor = Color.DarkOrange;
                }
                catch (Exception ex)
                {
                    lblStatus.Text = "\u25CF Node start error: " + ex.Message;
                    lblStatus.ForeColor = Color.Red;
                }
            }

            new Thread(delegate()
            {
                Thread.Sleep(1200);
                try { this.Invoke((Action)delegate { CheckServerStatus(); }); } catch { }
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
                lblStatus.Text = "\u25CF Server Online (Port " + serverPort + ")";
                lblStatus.ForeColor = Color.ForestGreen;
                UpdateLanInfo();
            }
            else
            {
                lblStatus.Text = "\u25CF Server Offline";
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

        // ─────────────────────────────────────────────────
        //  Launch in Edge/Chrome App Mode or default browser
        // ─────────────────────────────────────────────────
        private void LaunchApp(string route)
        {
            string url = "http://127.0.0.1:" + serverPort + route;

            string edgePath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
                @"Microsoft\Edge\Application\msedge.exe");
            if (!File.Exists(edgePath))
            {
                edgePath = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                    @"Microsoft\Edge\Application\msedge.exe");
            }

            string chromePath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                @"Google\Chrome\Application\chrome.exe");
            if (!File.Exists(chromePath))
            {
                chromePath = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
                    @"Google\Chrome\Application\chrome.exe");
            }

            if (File.Exists(edgePath))
            {
                try { Process.Start(edgePath, "--app=\"" + url + "\""); return; }
                catch { }
            }

            if (File.Exists(chromePath))
            {
                try { Process.Start(chromePath, "--app=\"" + url + "\""); return; }
                catch { }
            }

            try
            {
                Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
            }
            catch (Exception ex)
            {
                MessageBox.Show("Could not launch browser: " + ex.Message,
                    "INTUBATALK", MessageBoxButtons.OK, MessageBoxIcon.Error);
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
                MessageBoxButtons.OK, MessageBoxIcon.Information);
        }

        private void ShowHelp()
        {
            MessageBox.Show(
                "INTUBATALK Accessibility & Quick Keys:\n\n" +
                "\u2022 Press [P] or [1]: Enter Patient Tablet\n" +
                "\u2022 Press [N] or [2]: Enter Nurse Dashboard\n" +
                "\u2022 Press [D] or [3]: Enter Dual Presentation Simulator\n" +
                "\u2022 Press [B] or [4]: Open Printable Backup Board\n" +
                "\u2022 Press [Tab]: Navigate between role cards and buttons\n" +
                "\u2022 Press [Enter]: Activate selected button\n\n" +
                "How Pairing Works:\n" +
                "1. Patient registers on the tablet -> receives a 4-digit room code.\n" +
                "2. Nurse enters that 4-digit code on the dashboard -> devices pair instantly.\n" +
                "3. In emergency, pressing the red button sounds a continuous alarm until silenced.",
                "INTUBATALK Guide & Accessibility",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
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
