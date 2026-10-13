// INTUBATALK Windows Desktop Application & Role Chooser
// Native Windows executable compiled with C# (.NET Framework 4.x).
// Designed with Clinical Claymorphism — warm hospital palette, soft raised cards,
// dual shadows, clean vector icons, and clear buttons to select between roles.
// Ensures every session starts fresh from the very beginning.

using System;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
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
                if (arg.Equals("--patient", StringComparison.OrdinalIgnoreCase)) initialRoute = "/?fresh=1";
                else if (arg.Equals("--nurse", StringComparison.OrdinalIgnoreCase)) initialRoute = "/nurse?fresh=1";
                else if (arg.Equals("--dual", StringComparison.OrdinalIgnoreCase)) initialRoute = "/dual";
                else if (arg.Equals("--board", StringComparison.OrdinalIgnoreCase)) initialRoute = "/board";
                else if (arg.Equals("--tray", StringComparison.OrdinalIgnoreCase)) startInTray = true;
            }

            Application.Run(new RoleChooserForm(initialRoute, startInTray));
        }
    }

    // ─────────────────────────────────────────────────────────────────
    //  ClayRoleCard: An interactive, owner-drawn claymorphic role card
    //  featuring soft dual shadows, custom vector icons, clear descriptions,
    //  and a large, accessible CTA button.
    // ─────────────────────────────────────────────────────────────────
    public class ClayRoleCard : Panel
    {
        public string RoleBadge { get; set; }
        public Color BadgeBg { get; set; }
        public Color BadgeText { get; set; }
        public string RoleTitle { get; set; }
        public string RoleSubtitle { get; set; }
        public string[] BulletPoints { get; set; }
        public string ButtonText { get; set; }
        public Color AccentColor { get; set; }
        public Color AccentDark { get; set; }
        public bool IsPatientIcon { get; set; }
        public Action OnSelect { get; set; }

        private bool _cardHover = false;
        private GradientButton _ctaBtn;

        public ClayRoleCard()
        {
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint |
                     ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw |
                     ControlStyles.SupportsTransparentBackColor, true);
            BackColor = Color.Transparent;
            Padding = new Padding(24, 22, 24, 20);

            _ctaBtn = new GradientButton();
            _ctaBtn.Height = 54;
            _ctaBtn.Dock = DockStyle.Bottom;
            _ctaBtn.Click += delegate { if (OnSelect != null) OnSelect(); };
            this.Controls.Add(_ctaBtn);
        }

        public void BindData()
        {
            if (_ctaBtn != null)
            {
                _ctaBtn.Text = ButtonText;
                _ctaBtn.GradFrom = AccentColor;
                _ctaBtn.GradTo = AccentDark;
            }
            Invalidate();
        }

        private GraphicsPath GetRoundedPath(Rectangle r, int rad)
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
            _cardHover = true;
            Invalidate();
            base.OnMouseEnter(e);
        }

        protected override void OnMouseLeave(EventArgs e)
        {
            _cardHover = false;
            Invalidate();
            base.OnMouseLeave(e);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            Graphics g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;

            Rectangle cardBody = new Rectangle(12, 10, Width - 24, Height - 22);
            int rad = 22;

            // 1. Dual clay shadows
            // Dark shadow bottom-right
            Rectangle darkShadow = new Rectangle(cardBody.X + 5, cardBody.Y + 6, cardBody.Width, cardBody.Height);
            using (GraphicsPath sp = GetRoundedPath(darkShadow, rad))
            using (SolidBrush sb = new SolidBrush(Color.FromArgb(_cardHover ? 36 : 26, 103, 112, 108)))
            {
                g.FillPath(sb, sp);
            }

            // Light highlight shadow top-left
            Rectangle lightShadow = new Rectangle(cardBody.X - 4, cardBody.Y - 4, cardBody.Width, cardBody.Height);
            using (GraphicsPath sp = GetRoundedPath(lightShadow, rad))
            using (SolidBrush sb = new SolidBrush(Color.FromArgb(_cardHover ? 210 : 190, 255, 255, 255)))
            {
                g.FillPath(sb, sp);
            }

            // 2. Card surface fill
            using (GraphicsPath cp = GetRoundedPath(cardBody, rad))
            {
                using (SolidBrush fb = new SolidBrush(Color.FromArgb(248, 247, 244)))
                {
                    g.FillPath(fb, cp);
                }

                // Inset light highlight
                using (Pen pHi = new Pen(Color.FromArgb(180, 255, 255, 255), 1.5f))
                {
                    g.DrawPath(pHi, cp);
                }
            }

            // Subtle outer border
            using (GraphicsPath cp = GetRoundedPath(cardBody, rad))
            using (Pen pBorder = new Pen(Color.FromArgb(32, 96, 99, 106), 1f))
            {
                g.DrawPath(pBorder, cp);
            }

            // 3. Top accent bar
            Rectangle topBarRect = new Rectangle(cardBody.X, cardBody.Y, cardBody.Width, rad + 4);
            using (GraphicsPath fullPath = GetRoundedPath(cardBody, rad))
            {
                Region oldClip = g.Clip;
                g.SetClip(topBarRect);
                g.IntersectClip(new Region(fullPath));
                using (LinearGradientBrush lb = new LinearGradientBrush(
                    new Rectangle(cardBody.X, cardBody.Y, cardBody.Width, 6), AccentColor, AccentDark, 0f))
                {
                    g.FillRectangle(lb, cardBody.X, cardBody.Y, cardBody.Width, 6);
                }
                g.Clip = oldClip;
            }

            // 4. Role Badge (Pill)
            int badgeX = cardBody.X + 22;
            int badgeY = cardBody.Y + 20;
            using (Font fBadge = new Font("Segoe UI", 8.2f, FontStyle.Bold))
            {
                SizeF bSize = g.MeasureString(RoleBadge ?? "", fBadge);
                int bWidth = (int)bSize.Width + 18;
                int bHeight = 24;
                Rectangle bRect = new Rectangle(badgeX, badgeY, bWidth, bHeight);
                using (GraphicsPath bp = GetRoundedPath(bRect, 12))
                using (SolidBrush bb = new SolidBrush(BadgeBg))
                {
                    g.FillPath(bb, bp);
                }
                using (SolidBrush tb = new SolidBrush(BadgeText))
                {
                    StringFormat sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
                    g.DrawString(RoleBadge ?? "", fBadge, tb, bRect, sf);
                }
            }

            // 5. Custom Vector Icon in rounded circle
            int iconBoxX = cardBody.X + 22;
            int iconBoxY = cardBody.Y + 54;
            int iconBoxSize = 50;
            Rectangle iconBox = new Rectangle(iconBoxX, iconBoxY, iconBoxSize, iconBoxSize);
            using (GraphicsPath ip = GetRoundedPath(iconBox, 16))
            using (SolidBrush ib = new SolidBrush(IsPatientIcon ? Color.FromArgb(230, 245, 241) : Color.FromArgb(230, 239, 245)))
            {
                g.FillPath(ib, ip);
            }

            // Draw crisp vector icon inside iconBox
            int icx = iconBoxX + iconBoxSize / 2;
            int icy = iconBoxY + iconBoxSize / 2;

            if (IsPatientIcon)
            {
                // Vector Patient Bed icon
                using (Pen pen = new Pen(AccentDark, 2.2f))
                {
                    pen.StartCap = LineCap.Round;
                    pen.EndCap = LineCap.Round;
                    // Head/pillow circle
                    g.DrawEllipse(pen, icx - 14, icy - 8, 8, 8);
                    // Bed horizontal mattress
                    g.DrawLine(pen, icx - 16, icy + 6, icx + 16, icy + 6);
                    // Headboard
                    g.DrawLine(pen, icx - 16, icy - 2, icx - 16, icy + 12);
                    // Footboard
                    g.DrawLine(pen, icx + 16, icy + 2, icx + 16, icy + 12);
                    // Patient blanket curve
                    g.DrawArc(pen, icx - 6, icy - 4, 16, 10, 180, 180);
                }
            }
            else
            {
                // Vector Medical Stethoscope / Cross icon
                using (Pen pen = new Pen(AccentDark, 2.2f))
                {
                    pen.StartCap = LineCap.Round;
                    pen.EndCap = LineCap.Round;
                    // Medical Cross emblem
                    g.DrawLine(pen, icx, icy - 13, icx, icy + 13);
                    g.DrawLine(pen, icx - 13, icy, icx + 13, icy);
                    // Surrounding subtle circular bracket
                    g.DrawArc(pen, icx - 15, icy - 15, 30, 30, 45, 90);
                    g.DrawArc(pen, icx - 15, icy - 15, 30, 30, 225, 90);
                }
            }

            // 6. Title and Subtitle
            int textX = cardBody.X + 22;
            int titleY = iconBoxY + iconBoxSize + 14;

            using (Font fTitle = new Font("Georgia", 16.5f, FontStyle.Bold))
            using (SolidBrush bTitle = new SolidBrush(Color.FromArgb(38, 51, 64)))
            {
                g.DrawString(RoleTitle ?? "", fTitle, bTitle, textX, titleY);
            }

            int descY = titleY + 30;
            Rectangle descRect = new Rectangle(textX, descY, cardBody.Width - 44, 40);
            using (Font fDesc = new Font("Segoe UI", 9.5f, FontStyle.Regular))
            using (SolidBrush bDesc = new SolidBrush(Color.FromArgb(93, 108, 120)))
            {
                StringFormat sfDesc = new StringFormat { Trimming = StringTrimming.Word };
                g.DrawString(RoleSubtitle ?? "", fDesc, bDesc, descRect, sfDesc);
            }

            // 7. Bullet Feature Box
            int featBoxY = descY + 44;
            int featBoxH = 145;
            Rectangle featBox = new Rectangle(textX, featBoxY, cardBody.Width - 44, featBoxH);

            using (GraphicsPath fbp = GetRoundedPath(featBox, 14))
            using (SolidBrush fbb = new SolidBrush(Color.FromArgb(244, 243, 239)))
            {
                g.FillPath(fbb, fbp);
                using (Pen fp = new Pen(Color.FromArgb(226, 221, 212), 1f))
                {
                    g.DrawPath(fp, fbp);
                }
            }

            if (BulletPoints != null)
            {
                int py = featBoxY + 12;
                using (Font fFeat = new Font("Segoe UI", 9.2f, FontStyle.Regular))
                using (SolidBrush bFeat = new SolidBrush(Color.FromArgb(38, 51, 64)))
                using (SolidBrush bCheck = new SolidBrush(AccentDark))
                using (Pen pCheck = new Pen(AccentDark, 2f))
                {
                    pCheck.StartCap = LineCap.Round;
                    pCheck.EndCap = LineCap.Round;

                    foreach (string item in BulletPoints)
                    {
                        // Draw clean mini vector checkmark
                        int chkX = textX + 16;
                        int chkY = py + 4;
                        g.DrawLine(pCheck, chkX, chkY + 5, chkX + 4, chkY + 9);
                        g.DrawLine(pCheck, chkX + 4, chkY + 9, chkX + 11, chkY + 2);

                        // Draw text
                        g.DrawString(item, fFeat, bFeat, textX + 34, py);
                        py += 30;
                    }
                }
            }

            base.OnPaint(e);
        }
    }

    // ─────────────────────────────────────────────────────────────────
    //  GradientButton: Large, friendly pill button with rounded corners,
    //  gradient fill, and smooth hover/press states.
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
            GradFrom = Color.FromArgb(63, 167, 150);
            GradTo = Color.FromArgb(51, 138, 124);
            Radius = 16;
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint |
                     ControlStyles.OptimizedDoubleBuffer, true);
            FlatStyle = FlatStyle.Flat;
            FlatAppearance.BorderSize = 0;
            ForeColor = Color.White;
            Cursor = Cursors.Hand;
            Font = new Font("Segoe UI", 12f, FontStyle.Bold);
        }

        private GraphicsPath GetRoundedPath(Rectangle r, int rad)
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
            g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
            g.Clear(Parent != null ? Parent.BackColor : Color.Transparent);

            Rectangle r = new Rectangle(0, 0, Width - 1, Height - 1);

            // Subtle drop shadow behind button when not pressed
            if (!_pressed)
            {
                Rectangle shadowR = new Rectangle(r.X + 2, r.Y + 3, r.Width, r.Height);
                using (GraphicsPath sp = GetRoundedPath(shadowR, Radius))
                using (SolidBrush sb = new SolidBrush(Color.FromArgb(28, 0, 0, 0)))
                {
                    g.FillPath(sb, sp);
                }
            }

            Color c1 = _hover ? ControlPaint.Light(GradFrom, 0.08f) : GradFrom;
            Color c2 = _hover ? ControlPaint.Light(GradTo, 0.08f) : GradTo;
            if (_pressed) { c1 = ControlPaint.Dark(GradFrom, 0.06f); c2 = ControlPaint.Dark(GradTo, 0.06f); }

            using (GraphicsPath gp = GetRoundedPath(r, Radius))
            {
                using (LinearGradientBrush lb = new LinearGradientBrush(r, c1, c2, 135f))
                {
                    g.FillPath(lb, gp);
                }

                // Inner top-edge highlight
                using (Pen pHi = new Pen(Color.FromArgb(70, 255, 255, 255), 1.2f))
                {
                    g.DrawPath(pHi, gp);
                }
            }

            // Draw crisp centered text
            TextRenderer.DrawText(g, Text, Font, r, Color.White,
                TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
        }
    }

    // ─────────────────────────────────────────────────────────────────
    //  ClayToolButton: Rounded pill toolbar button for secondary actions.
    // ─────────────────────────────────────────────────────────────────
    public class ClayToolButton : Button
    {
        private bool _hover = false;
        private readonly Color colSurface = Color.FromArgb(248, 247, 244);
        private readonly Color colLine = Color.FromArgb(215, 210, 202);
        private readonly Color colText = Color.FromArgb(38, 51, 64);

        public ClayToolButton()
        {
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint |
                     ControlStyles.OptimizedDoubleBuffer, true);
            FlatStyle = FlatStyle.Flat;
            FlatAppearance.BorderSize = 0;
            Cursor = Cursors.Hand;
            Font = new Font("Segoe UI", 9f, FontStyle.Bold);
            ForeColor = colText;
            Height = 36;
            Margin = new Padding(0, 0, 8, 0);
        }

        protected override void OnMouseEnter(EventArgs e) { _hover = true; Invalidate(); base.OnMouseEnter(e); }
        protected override void OnMouseLeave(EventArgs e) { _hover = false; Invalidate(); base.OnMouseLeave(e); }

        protected override void OnPaint(PaintEventArgs e)
        {
            Graphics g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
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
            using (Pen p = new Pen(_hover ? Color.FromArgb(170, 165, 155) : colLine, 1f)) { g.DrawPath(p, gp); }

            TextRenderer.DrawText(g, Text, Font, r, colText,
                TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);

            gp.Dispose();
        }
    }

    // ═════════════════════════════════════════════════════════════════
    //  MAIN ROLE CHOOSER WINDOW
    // ═════════════════════════════════════════════════════════════════
    public class RoleChooserForm : Form
    {
        private Process serverProcess = null;
        private bool ownsServer = false;
        private int serverPort = 8788;
        private NotifyIcon trayIcon;
        private ContextMenuStrip trayMenu;
        private Label lblStatus;
        private System.Windows.Forms.Timer healthTimer;
        private string appDir;
        private Icon customIcon;

        // Theme palette
        private readonly Color colBg      = Color.FromArgb(243, 241, 236);  // Warm hospital beige
        private readonly Color colSurface = Color.FromArgb(248, 247, 244);  // Clay card surface
        private readonly Color colLine    = Color.FromArgb(221, 216, 207);  // Border line
        private readonly Color colText    = Color.FromArgb(38, 51, 64);     // Ink text
        private readonly Color colSoft    = Color.FromArgb(93, 108, 120);   // Secondary text
        private readonly Color colMint    = Color.FromArgb(63, 167, 150);   // Patient mint
        private readonly Color colMintDk  = Color.FromArgb(51, 138, 124);   // Patient dark mint
        private readonly Color colTeal    = Color.FromArgb(63, 127, 167);   // Nurse teal
        private readonly Color colTealDk  = Color.FromArgb(47, 101, 136);   // Nurse dark teal

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
            this.Text = "INTUBATALK · Select Your Role";
            this.Size = new Size(940, 710);
            this.MinimumSize = new Size(820, 640);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.BackColor = colBg;
            this.Font = new Font("Segoe UI", 9.5f, FontStyle.Regular);
            SetStyle(ControlStyles.OptimizedDoubleBuffer | ControlStyles.AllPaintingInWmPaint, true);

            // ══════════════════ 1. HEADER ══════════════════
            Panel pnlHeader = new Panel
            {
                Dock = DockStyle.Top,
                Height = 112,
                BackColor = colSurface,
                Padding = new Padding(28, 0, 28, 0)
            };
            pnlHeader.Paint += delegate(object sender, PaintEventArgs pe)
            {
                Graphics g = pe.Graphics;
                g.SmoothingMode = SmoothingMode.AntiAlias;

                // Separator line
                using (Pen p = new Pen(colLine))
                {
                    g.DrawLine(p, 0, pnlHeader.Height - 1, pnlHeader.Width, pnlHeader.Height - 1);
                }

                // Brand Mark: rounded square with mint gradient + soundwave bars
                int markSize = 52;
                int markX = 26;
                int markY = 18;
                Rectangle markRect = new Rectangle(markX, markY, markSize, markSize);
                GraphicsPath markPath = new GraphicsPath();
                int md = 28;
                markPath.AddArc(markRect.X, markRect.Y, md, md, 180, 90);
                markPath.AddArc(markRect.Right - md, markRect.Y, md, md, 270, 90);
                markPath.AddArc(markRect.Right - md, markRect.Bottom - md, md, md, 0, 90);
                markPath.AddArc(markRect.X, markRect.Bottom - md, md, md, 90, 90);
                markPath.CloseFigure();

                using (LinearGradientBrush lb = new LinearGradientBrush(markRect, colMint, colMintDk, 135f))
                {
                    g.FillPath(lb, markPath);
                }
                using (Pen hp = new Pen(Color.FromArgb(90, 255, 255, 255), 1.5f))
                {
                    g.DrawPath(hp, markPath);
                }

                // 3 Soundwave bars
                int cx = markX + markSize / 2;
                int cy = markY + markSize / 2;
                using (Pen wp = new Pen(Color.FromArgb(240, 255, 255, 255), 2.8f))
                {
                    wp.StartCap = LineCap.Round;
                    wp.EndCap = LineCap.Round;
                    g.DrawLine(wp, cx - 9, cy - 8, cx - 9, cy + 8);
                    g.DrawLine(wp, cx, cy - 14, cx, cy + 14);
                    g.DrawLine(wp, cx + 9, cy - 7, cx + 9, cy + 7);
                }
                markPath.Dispose();
            };

            Label lblTitle = new Label
            {
                Text = "INTUBATALK",
                Font = new Font("Georgia", 22f, FontStyle.Bold),
                ForeColor = colText,
                AutoSize = true,
                BackColor = colSurface,
                Location = new Point(90, 16)
            };

            Label lblTagline = new Label
            {
                Text = "Speak without a voice. Touch, spell, blink, alert.",
                Font = new Font("Georgia", 10.5f, FontStyle.Italic),
                ForeColor = colSoft,
                AutoSize = true,
                BackColor = colSurface,
                Location = new Point(92, 52)
            };

            Label lblPrompt = new Label
            {
                Text = "Choose your role to get started:",
                Font = new Font("Segoe UI", 10f, FontStyle.Bold),
                ForeColor = Color.FromArgb(120, 130, 140),
                AutoSize = true,
                BackColor = colSurface,
                Location = new Point(92, 78)
            };

            lblStatus = new Label
            {
                Text = "● Checking server...",
                Font = new Font("Segoe UI", 9f, FontStyle.Bold),
                ForeColor = Color.DarkOrange,
                AutoSize = true,
                BackColor = colSurface,
                Anchor = AnchorStyles.Top | AnchorStyles.Right,
                Location = new Point(680, 22)
            };

            pnlHeader.Controls.Add(lblTitle);
            pnlHeader.Controls.Add(lblTagline);
            pnlHeader.Controls.Add(lblPrompt);
            pnlHeader.Controls.Add(lblStatus);
            this.Controls.Add(pnlHeader);

            // ══════════════════ 2. ROLE CARDS (PATIENT VS NURSE) ══════════════════
            TableLayoutPanel roleGrid = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 2,
                RowCount = 1,
                Padding = new Padding(16, 18, 16, 12),
                BackColor = colBg
            };
            roleGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50f));
            roleGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50f));

            // ── Card 1: Patient ──
            ClayRoleCard cardPatient = new ClayRoleCard
            {
                Dock = DockStyle.Fill,
                Margin = new Padding(8, 6, 8, 6),
                RoleBadge = "FOR THE PATIENT",
                BadgeBg = Color.FromArgb(217, 239, 233),
                BadgeText = Color.FromArgb(35, 95, 85),
                RoleTitle = "Patient Tablet",
                RoleSubtitle = "Designed for intubated or non-verbal ICU patients to communicate instantly without vocal cords.",
                BulletPoints = new string[] {
                    "1-Tap needs: Breathing, Suction, Pain, Water",
                    "Visual 0 to 10 pain rating scale",
                    "Nurse-assisted eye-blink protocol",
                    "Alphabet speller pad & emergency alert"
                },
                ButtonText = "Select Patient Role",
                AccentColor = colMint,
                AccentDark = colMintDk,
                IsPatientIcon = true,
                OnSelect = delegate { LaunchApp("/?fresh=1"); }
            };
            cardPatient.BindData();
            roleGrid.Controls.Add(cardPatient, 0, 0);

            // ── Card 2: Nurse ──
            ClayRoleCard cardNurse = new ClayRoleCard
            {
                Dock = DockStyle.Fill,
                Margin = new Padding(8, 6, 8, 6),
                RoleBadge = "FOR THE NURSE / CLINICIAN",
                BadgeBg = Color.FromArgb(217, 231, 239),
                BadgeText = Color.FromArgb(32, 75, 102),
                RoleTitle = "Nurse Dashboard",
                RoleSubtitle = "Designed for bedside nurses, doctors, and ICU staff to monitor alerts and respond to requests.",
                BulletPoints = new string[] {
                    "Live incoming feed paired via 4-digit code",
                    "Urgent repeating sirens and chimes",
                    "Instant acknowledge (\"Nurse on the way\")",
                    "Text-to-speech speaker reads requests aloud"
                },
                ButtonText = "Select Nurse Role",
                AccentColor = colTeal,
                AccentDark = colTealDk,
                IsPatientIcon = false,
                OnSelect = delegate { LaunchApp("/nurse?fresh=1"); }
            };
            cardNurse.BindData();
            roleGrid.Controls.Add(cardNurse, 1, 0);

            this.Controls.Add(roleGrid);

            // ══════════════════ 3. BOTTOM TOOLBAR ══════════════════
            Panel pnlBottom = new Panel
            {
                Dock = DockStyle.Bottom,
                Height = 62,
                BackColor = colSurface,
                Padding = new Padding(22, 12, 22, 12)
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

            ClayToolButton btnDual = new ClayToolButton { Text = "👥 Dual Simulator (Split)", Width = 180 };
            btnDual.Click += delegate { LaunchApp("/dual"); };
            ClayToolButton btnBoard = new ClayToolButton { Text = "📋 Printable Board", Width = 140 };
            btnBoard.Click += delegate { LaunchApp("/board"); };
            ClayToolButton btnWifi = new ClayToolButton { Text = "🌐 Bedside Wi-Fi Link", Width = 150 };
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

            ClayToolButton btnHelp = new ClayToolButton { Text = "❓ How It Works", Width = 125 };
            btnHelp.Click += delegate { ShowHelp(); };
            ClayToolButton btnRestart = new ClayToolButton { Text = "🔄 Restart Server", Width = 125 };
            btnRestart.Click += delegate { RestartServer(); };

            flowRight.Controls.Add(btnHelp);
            flowRight.Controls.Add(btnRestart);

            pnlBottom.Controls.Add(flowLeft);
            pnlBottom.Controls.Add(flowRight);
            this.Controls.Add(pnlBottom);
        }

        // ─────────────────────────────────────────────────────────
        //  System Tray Integration
        // ─────────────────────────────────────────────────────────
        private void InitTray()
        {
            trayMenu = new ContextMenuStrip();
            trayMenu.Items.Add("📱 Open Patient Tablet", null, delegate { LaunchApp("/?fresh=1"); });
            trayMenu.Items.Add("🩺 Open Nurse Dashboard", null, delegate { LaunchApp("/nurse?fresh=1"); });
            trayMenu.Items.Add("👥 Open Dual Simulator", null, delegate { LaunchApp("/dual"); });
            trayMenu.Items.Add("📋 Open Printable Board", null, delegate { LaunchApp("/board"); });
            trayMenu.Items.Add("-");
            trayMenu.Items.Add("Select Role / Open Hub", null, delegate { RestoreFromTray(); });
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

        // ─────────────────────────────────────────────────────────
        //  Server Process Management
        // ─────────────────────────────────────────────────────────
        private void StartServerIfNeeded()
        {
            if (IsServerAnswering(serverPort))
            {
                lblStatus.Text = "● Server Online (Port " + serverPort + ")";
                lblStatus.ForeColor = Color.ForestGreen;
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
                lblStatus.Text = "● Server Online (Port " + serverPort + ")";
                lblStatus.ForeColor = Color.ForestGreen;
            }
            else
            {
                lblStatus.Text = "● Server Offline";
                lblStatus.ForeColor = Color.Red;
            }
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

        // ─────────────────────────────────────────────────────────
        //  App Launching (Edge/Chrome App Mode or Default Browser)
        // ─────────────────────────────────────────────────────────
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
                "Bedside Wi-Fi link copied to clipboard:\n\n" + url +
                "\n\nOpen this link on any iPad, tablet, or phone connected to the same Wi-Fi network to use INTUBATALK at the bedside.",
                "Bedside Wi-Fi Connection",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
        }

        private void ShowHelp()
        {
            MessageBox.Show(
                "INTUBATALK — Quick Guide:\n\n" +
                "1. Select Patient Role:\n" +
                "   Opens the Bedside Tablet starting fresh from the registration wizard.\n" +
                "   Enter the patient name and bed number to receive a 4-digit room code.\n\n" +
                "2. Select Nurse Role:\n" +
                "   Opens the Nurse Dashboard. Enter the patient's 4-digit code to pair instantly.\n\n" +
                "3. Dual Simulator:\n" +
                "   Presents both Patient and Nurse screens side-by-side on this display.\n\n" +
                "4. Printable Board:\n" +
                "   Generates a clean, laminatable communication chart as a paper backup.",
                "INTUBATALK Guide",
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
