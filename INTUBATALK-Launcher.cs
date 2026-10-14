// INTUBATALK Windows Desktop Application & Role Chooser
// Native Windows executable compiled with C# (.NET Framework 4.x).
// Designed with authentic Clinical Claymorphism:
// - Puffy matte 3D cards with dual diffused blur shadows & inset rim highlights
// - Soft medical palette (warm beige bg, mint & teal clay accents)
// - Tactile 3D puffy buttons to directly select Patient or Nurse
// - Enforces a brand-new patient login whenever the app is reopened

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

using System.Reflection;

[assembly: AssemblyTitle("INTUBATALK")]
[assembly: AssemblyDescription("Adaptive communication system for intubated ICU patients. Desktop hub with patient tablet, nurse dashboard, dual simulator and printable backup board.")]
[assembly: AssemblyProduct("INTUBATALK ICU System")]
[assembly: AssemblyVersion("2.0.0.0")]
[assembly: AssemblyFileVersion("2.0.0.0")]

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
                else if (arg.Equals("--choose", StringComparison.OrdinalIgnoreCase)) initialRoute = "/choose";
                else if (arg.Equals("--tray", StringComparison.OrdinalIgnoreCase)) startInTray = true;
            }

            Application.Run(new RoleChooserForm(initialRoute, startInTray));
        }
    }

    // ─────────────────────────────────────────────────────────────────
    //  ClayRoleCard: Authentic Claymorphism card panel
    //  Features multi-pass Gaussian-diffused dual shadows, inset rim
    //  highlights, recessed feature well, and puffy 3D tactile button.
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
        private ClayPuffyButton _ctaBtn;

        public ClayRoleCard()
        {
            SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint |
                     ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw |
                     ControlStyles.SupportsTransparentBackColor, true);
            BackColor = Color.Transparent;
            Padding = new Padding(26, 22, 26, 22);

            _ctaBtn = new ClayPuffyButton();
            _ctaBtn.Height = 56;
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
            if (d > r.Width) d = r.Width;
            if (d > r.Height) d = r.Height;
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

            Rectangle cardBody = new Rectangle(14, 12, Width - 28, Height - 24);
            int rad = 26;

            // ── 1. AUTHENTIC CLAYMORPHISM DUAL DIFFUSED SHADOWS ──
            // Bottom-right soft dark diffused shadow (multi-pass blur)
            int darkBlur = _cardHover ? 12 : 9;
            int darkMaxAlpha = _cardHover ? 14 : 11;
            int darkOffX = _cardHover ? 7 : 5;
            int darkOffY = _cardHover ? 8 : 6;

            for (int i = darkBlur; i >= 1; i--)
            {
                int alpha = (int)(darkMaxAlpha * ((float)(darkBlur - i + 1) / darkBlur));
                Rectangle sr = new Rectangle(
                    cardBody.X + darkOffX - i,
                    cardBody.Y + darkOffY - i,
                    cardBody.Width + i * 2,
                    cardBody.Height + i * 2);
                using (GraphicsPath sp = GetRoundedPath(sr, rad + i))
                using (SolidBrush sb = new SolidBrush(Color.FromArgb(alpha, 103, 112, 108)))
                {
                    g.FillPath(sb, sp);
                }
            }

            // Top-left soft white ambient glow (multi-pass light)
            int lightBlur = _cardHover ? 11 : 8;
            int lightMaxAlpha = _cardHover ? 48 : 38;
            int lightOffX = -5;
            int lightOffY = -5;

            for (int i = lightBlur; i >= 1; i--)
            {
                int alpha = (int)(lightMaxAlpha * ((float)(lightBlur - i + 1) / lightBlur));
                Rectangle lr = new Rectangle(
                    cardBody.X + lightOffX - i,
                    cardBody.Y + lightOffY - i,
                    cardBody.Width + i * 2,
                    cardBody.Height + i * 2);
                using (GraphicsPath lp = GetRoundedPath(lr, rad + i))
                using (SolidBrush lb = new SolidBrush(Color.FromArgb(alpha, 255, 255, 255)))
                {
                    g.FillPath(lb, lp);
                }
            }

            // ── 2. PUFFY 3D CLAY CARD SURFACE FILL ──
            using (GraphicsPath cp = GetRoundedPath(cardBody, rad))
            {
                // Gentle gradient from top-left soft light to bottom-right warm matte clay
                using (LinearGradientBrush lgb = new LinearGradientBrush(
                    cardBody,
                    Color.FromArgb(253, 252, 250),
                    Color.FromArgb(246, 244, 239),
                    135f))
                {
                    g.FillPath(lgb, cp);
                }

                // Inset 3D top-left curved rim highlight (simulating light hitting clay curve)
                using (Pen pRimHi = new Pen(Color.FromArgb(220, 255, 255, 255), 2.2f))
                {
                    g.DrawPath(pRimHi, cp);
                }

                // Inset 3D bottom-right curved rim shadow (simulating clay curve depth)
                using (Pen pRimShade = new Pen(Color.FromArgb(26, 96, 99, 106), 1.2f))
                {
                    g.DrawPath(pRimShade, cp);
                }
            }

            // ── 3. TOP CLAY ACCENT STRIP ──
            Rectangle topAccentRect = new Rectangle(cardBody.X, cardBody.Y, cardBody.Width, rad + 4);
            using (GraphicsPath fullPath = GetRoundedPath(cardBody, rad))
            {
                Region oldClip = g.Clip;
                g.SetClip(topAccentRect);
                g.IntersectClip(new Region(fullPath));
                using (LinearGradientBrush lb = new LinearGradientBrush(
                    new Rectangle(cardBody.X, cardBody.Y, cardBody.Width, 6), AccentColor, AccentDark, 0f))
                {
                    g.FillRectangle(lb, cardBody.X, cardBody.Y, cardBody.Width, 6);
                }
                g.Clip = oldClip;
            }

            // ── 4. SOFT PASTEL PILL BADGE ──
            int badgeX = cardBody.X + 22;
            int badgeY = cardBody.Y + 20;
            using (Font fBadge = new Font("Segoe UI", 8.2f, FontStyle.Bold))
            {
                SizeF bSize = g.MeasureString(RoleBadge ?? "", fBadge);
                int bWidth = (int)bSize.Width + 20;
                int bHeight = 25;
                Rectangle bRect = new Rectangle(badgeX, badgeY, bWidth, bHeight);
                using (GraphicsPath bp = GetRoundedPath(bRect, 12))
                {
                    using (SolidBrush bb = new SolidBrush(BadgeBg))
                    {
                        g.FillPath(bb, bp);
                    }
                    // Inset highlight on badge
                    using (Pen bpPen = new Pen(Color.FromArgb(140, 255, 255, 255), 1f))
                    {
                        g.DrawPath(bpPen, bp);
                    }
                }
                using (SolidBrush tb = new SolidBrush(BadgeText))
                {
                    StringFormat sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
                    g.DrawString(RoleBadge ?? "", fBadge, tb, bRect, sf);
                }
            }

            // ── 5. 3D CLAY ICON CONTAINER ──
            int iconBoxX = cardBody.X + 22;
            int iconBoxY = cardBody.Y + 54;
            int iconBoxSize = 52;
            Rectangle iconBox = new Rectangle(iconBoxX, iconBoxY, iconBoxSize, iconBoxSize);
            using (GraphicsPath ip = GetRoundedPath(iconBox, 16))
            {
                // Soft tinted circular background with clay lighting
                Color iconBg1 = IsPatientIcon ? Color.FromArgb(234, 248, 244) : Color.FromArgb(233, 242, 248);
                Color iconBg2 = IsPatientIcon ? Color.FromArgb(217, 239, 233) : Color.FromArgb(217, 231, 239);
                using (LinearGradientBrush ib = new LinearGradientBrush(iconBox, iconBg1, iconBg2, 135f))
                {
                    g.FillPath(ib, ip);
                }
                using (Pen ihPen = new Pen(Color.FromArgb(180, 255, 255, 255), 1.5f))
                {
                    g.DrawPath(ihPen, ip);
                }
            }

            // Draw clean medical vector icon
            int icx = iconBoxX + iconBoxSize / 2;
            int icy = iconBoxY + iconBoxSize / 2;

            if (IsPatientIcon)
            {
                using (Pen pen = new Pen(AccentDark, 2.4f))
                {
                    pen.StartCap = LineCap.Round;
                    pen.EndCap = LineCap.Round;
                    g.DrawEllipse(pen, icx - 14, icy - 8, 8, 8);
                    g.DrawLine(pen, icx - 16, icy + 6, icx + 16, icy + 6);
                    g.DrawLine(pen, icx - 16, icy - 2, icx - 16, icy + 12);
                    g.DrawLine(pen, icx + 16, icy + 2, icx + 16, icy + 12);
                    g.DrawArc(pen, icx - 6, icy - 4, 16, 10, 180, 180);
                }
            }
            else
            {
                using (Pen pen = new Pen(AccentDark, 2.4f))
                {
                    pen.StartCap = LineCap.Round;
                    pen.EndCap = LineCap.Round;
                    g.DrawLine(pen, icx, icy - 13, icx, icy + 13);
                    g.DrawLine(pen, icx - 13, icy, icx + 13, icy);
                    g.DrawArc(pen, icx - 15, icy - 15, 30, 30, 45, 90);
                    g.DrawArc(pen, icx - 15, icy - 15, 30, 30, 225, 90);
                }
            }

            // ── 6. TITLE AND SUBTITLE ──
            int textX = cardBody.X + 22;
            int titleY = iconBoxY + iconBoxSize + 14;

            using (Font fTitle = new Font("Georgia", 17f, FontStyle.Bold))
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

            // ── 7. RECESSED CLAY WELL FOR FEATURES ──
            int featBoxY = descY + 40;
            int maxFeatH = (_ctaBtn != null) ? Math.Max(110, _ctaBtn.Top - featBoxY - 14) : 145;
            int featBoxH = maxFeatH;
            Rectangle featBox = new Rectangle(textX, featBoxY, cardBody.Width - 44, featBoxH);

            using (GraphicsPath fbp = GetRoundedPath(featBox, 16))
            {
                // Soft recessed fill (slightly darker than card body)
                using (SolidBrush fbb = new SolidBrush(Color.FromArgb(241, 239, 234)))
                {
                    g.FillPath(fbb, fbp);
                }
                // Inset depression bevel (top inner shadow)
                using (Pen fpTop = new Pen(Color.FromArgb(32, 103, 112, 108), 1.2f))
                {
                    g.DrawPath(fpTop, fbp);
                }
                // Bottom inner highlight
                using (Pen fpBot = new Pen(Color.FromArgb(160, 255, 255, 255), 1.2f))
                {
                    Rectangle botR = new Rectangle(featBox.X, featBox.Y + 1, featBox.Width, featBox.Height);
                    using (GraphicsPath bpPath = GetRoundedPath(botR, 16))
                    {
                        g.DrawPath(fpBot, bpPath);
                    }
                }
            }

            if (BulletPoints != null && BulletPoints.Length > 0)
            {
                int py = featBoxY + 10;
                int lineStep = Math.Min(30, (featBoxH - 20) / BulletPoints.Length);
                using (Font fFeat = new Font("Segoe UI", 9.1f, FontStyle.Regular))
                using (SolidBrush bFeat = new SolidBrush(Color.FromArgb(38, 51, 64)))
                using (Pen pCheck = new Pen(AccentDark, 2.2f))
                {
                    pCheck.StartCap = LineCap.Round;
                    pCheck.EndCap = LineCap.Round;

                    foreach (string item in BulletPoints)
                    {
                        int chkX = textX + 16;
                        int chkY = py + 4;
                        g.DrawLine(pCheck, chkX, chkY + 5, chkX + 4, chkY + 9);
                        g.DrawLine(pCheck, chkX + 4, chkY + 9, chkX + 11, chkY + 2);

                        g.DrawString(item, fFeat, bFeat, textX + 34, py);
                        py += lineStep;
                    }
                }
            }

            base.OnPaint(e);
        }
    }

    // ─────────────────────────────────────────────────────────────────
    //  ClayPuffyButton: 3D Puffy Claymorphism CTA Button
    //  Large, tactile, rounded with gradient fill, top rim highlight,
    //  bottom bevel, and physical depression press animation.
    // ─────────────────────────────────────────────────────────────────
    public class ClayPuffyButton : Button
    {
        public Color GradFrom { get; set; }
        public Color GradTo { get; set; }
        public int Radius { get; set; }
        private bool _hover = false;
        private bool _pressed = false;

        public ClayPuffyButton()
        {
            GradFrom = Color.FromArgb(63, 167, 150);
            GradTo = Color.FromArgb(51, 138, 124);
            Radius = 18;
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
            if (d > r.Width) d = r.Width;
            if (d > r.Height) d = r.Height;
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

            int yOffset = _pressed ? 2 : 0;
            Rectangle r = new Rectangle(0, yOffset, Width - 1, Height - 1 - yOffset);

            // Button drop shadow (only when unpressed)
            if (!_pressed)
            {
                int shadowBlur = _hover ? 8 : 5;
                for (int i = shadowBlur; i >= 1; i--)
                {
                    int alpha = (int)((_hover ? 14 : 10) * ((float)(shadowBlur - i + 1) / shadowBlur));
                    Rectangle sr = new Rectangle(r.X + 2 - i, r.Y + 4 - i, r.Width + i * 2, r.Height + i * 2);
                    using (GraphicsPath sp = GetRoundedPath(sr, Radius + i))
                    using (SolidBrush sb = new SolidBrush(Color.FromArgb(alpha, 25, 65, 60)))
                    {
                        g.FillPath(sb, sp);
                    }
                }
            }

            Color c1 = _hover ? ControlPaint.Light(GradFrom, 0.08f) : GradFrom;
            Color c2 = _hover ? ControlPaint.Light(GradTo, 0.08f) : GradTo;
            if (_pressed)
            {
                c1 = ControlPaint.Dark(GradFrom, 0.06f);
                c2 = ControlPaint.Dark(GradTo, 0.06f);
            }

            using (GraphicsPath gp = GetRoundedPath(r, Radius))
            {
                using (LinearGradientBrush lb = new LinearGradientBrush(r, c1, c2, 135f))
                {
                    g.FillPath(lb, gp);
                }

                // Inset puffy 3D top-edge highlight
                using (Pen pHi = new Pen(Color.FromArgb(_pressed ? 40 : 110, 255, 255, 255), 1.8f))
                {
                    g.DrawPath(pHi, gp);
                }
            }

            TextRenderer.DrawText(g, Text, Font, r, Color.White,
                TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
        }
    }

    // ─────────────────────────────────────────────────────────────────
    //  ClayPillButton: Rounded tool buttons with clay hover effects.
    // ─────────────────────────────────────────────────────────────────
    public class ClayPillButton : Button
    {
        private bool _hover = false;
        private readonly Color colSurface = Color.FromArgb(248, 247, 244);
        private readonly Color colLine = Color.FromArgb(215, 210, 202);
        private readonly Color colText = Color.FromArgb(38, 51, 64);

        public ClayPillButton()
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
            int rad = 12;
            int d = rad * 2;
            gp.AddArc(r.X, r.Y, d, d, 180, 90);
            gp.AddArc(r.Right - d, r.Y, d, d, 270, 90);
            gp.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
            gp.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
            gp.CloseFigure();

            Color fill = _hover ? Color.White : colSurface;
            using (SolidBrush sb = new SolidBrush(fill)) { g.FillPath(sb, gp); }
            using (Pen p = new Pen(_hover ? Color.FromArgb(170, 165, 155) : colLine, 1f)) { g.DrawPath(p, gp); }

            // Inner top highlight
            using (Pen hi = new Pen(Color.FromArgb(140, 255, 255, 255), 1f))
            {
                Rectangle rHi = new Rectangle(r.X + 1, r.Y + 1, r.Width - 2, r.Height - 2);
                using (GraphicsPath gpHi = new GraphicsPath())
                {
                    int d2 = (rad - 1) * 2;
                    gpHi.AddArc(rHi.X, rHi.Y, d2, d2, 180, 90);
                    gpHi.AddArc(rHi.Right - d2, rHi.Y, d2, d2, 270, 90);
                    g.DrawPath(hi, gpHi);
                }
            }

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

        // Clinical Claymorphism palette
        private readonly Color colBg      = Color.FromArgb(248, 249, 250);  // Warm hospital beige (matching #f8f9fa)
        private readonly Color colSurface = Color.FromArgb(248, 247, 244);  // Clay card surface
        private readonly Color colLine    = Color.FromArgb(221, 216, 207);  // Border line
        private readonly Color colText    = Color.FromArgb(38, 51, 64);     // Primary text
        private readonly Color colSoft    = Color.FromArgb(93, 108, 120);   // Secondary text
        private readonly Color colMint    = Color.FromArgb(56, 152, 136);   // Patient mint (matching #389884)
        private readonly Color colMintDk  = Color.FromArgb(51, 138, 124);   // Patient dark mint
        private readonly Color colTeal    = Color.FromArgb(32, 112, 144);   // Nurse teal (matching #32709c)
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
            this.Text = "INTUBATALK v2 · Choose Your Role";
            this.Size = new Size(960, 740);
            this.MinimumSize = new Size(880, 680);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.BackColor = colBg;
            this.Font = new Font("Segoe UI", 9.5f, FontStyle.Regular);
            SetStyle(ControlStyles.OptimizedDoubleBuffer | ControlStyles.AllPaintingInWmPaint, true);

            // Ambient background glow painting
            this.Paint += delegate(object s, PaintEventArgs pe)
            {
                Graphics g = pe.Graphics;
                g.SmoothingMode = SmoothingMode.AntiAlias;

                // Subtle top-right ambient mint glow
                Rectangle trGlow = new Rectangle(Width - 360, -100, 460, 320);
                using (GraphicsPath gp = new GraphicsPath())
                {
                    gp.AddEllipse(trGlow);
                    using (PathGradientBrush pgb = new PathGradientBrush(gp))
                    {
                        pgb.CenterColor = Color.FromArgb(16, 63, 167, 150);
                        pgb.SurroundColors = new Color[] { Color.FromArgb(0, 63, 167, 150) };
                        g.FillPath(pgb, gp);
                    }
                }
            };

            // ══════════════════ 1. HEADER ══════════════════
            Panel pnlHeader = new Panel
            {
                Dock = DockStyle.Top,
                Height = 114,
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

                // Brand Mark: puffy 3D rounded square with mint gradient + soundwave bars
                int markSize = 54;
                int markX = 26;
                int markY = 18;
                Rectangle markRect = new Rectangle(markX, markY, markSize, markSize);
                GraphicsPath markPath = new GraphicsPath();
                int md = 30;
                markPath.AddArc(markRect.X, markRect.Y, md, md, 180, 90);
                markPath.AddArc(markRect.Right - md, markRect.Y, md, md, 270, 90);
                markPath.AddArc(markRect.Right - md, markRect.Bottom - md, md, md, 0, 90);
                markPath.AddArc(markRect.X, markRect.Bottom - md, md, md, 90, 90);
                markPath.CloseFigure();

                using (LinearGradientBrush lb = new LinearGradientBrush(markRect, colMint, colMintDk, 135f))
                {
                    g.FillPath(lb, markPath);
                }
                using (Pen hp = new Pen(Color.FromArgb(100, 255, 255, 255), 1.8f))
                {
                    g.DrawPath(hp, markPath);
                }

                // 3 Soundwave bars
                int cx = markX + markSize / 2;
                int cy = markY + markSize / 2;
                using (Pen wp = new Pen(Color.FromArgb(245, 255, 255, 255), 2.8f))
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
                Location = new Point(92, 16)
            };

            Label lblTagline = new Label
            {
                Text = "Speak without a voice. Touch, spell, blink, alert.",
                Font = new Font("Georgia", 10.5f, FontStyle.Italic),
                ForeColor = colSoft,
                AutoSize = true,
                BackColor = colSurface,
                Location = new Point(94, 52)
            };

            Label lblPrompt = new Label
            {
                Text = "Select your role to get started:",
                Font = new Font("Segoe UI", 10f, FontStyle.Bold),
                ForeColor = Color.FromArgb(120, 130, 140),
                AutoSize = true,
                BackColor = colSurface,
                Location = new Point(94, 79)
            };

            lblStatus = new Label
            {
                Text = "● Checking server...",
                Font = new Font("Segoe UI", 9f, FontStyle.Bold),
                ForeColor = Color.DarkOrange,
                AutoSize = true,
                BackColor = colSurface,
                Anchor = AnchorStyles.Top | AnchorStyles.Right,
                Location = new Point(690, 22)
            };

            pnlHeader.Controls.Add(lblTitle);
            pnlHeader.Controls.Add(lblTagline);
            pnlHeader.Controls.Add(lblPrompt);
            pnlHeader.Controls.Add(lblStatus);
            this.Controls.Add(pnlHeader);

            // ══════════════════ 2. ROLE SELECTION CARDS ══════════════════
            TableLayoutPanel roleGrid = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 2,
                RowCount = 1,
                Padding = new Padding(16, 18, 16, 12),
                BackColor = Color.Transparent
            };
            roleGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50f));
            roleGrid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50f));

            // ── Card 1: Patient ──
            ClayRoleCard cardPatient = new ClayRoleCard
            {
                Dock = DockStyle.Fill,
                Margin = new Padding(8, 6, 8, 6),
                RoleBadge = "BEDSIDE PATIENT",
                BadgeBg = Color.FromArgb(217, 239, 233),
                BadgeText = Color.FromArgb(35, 95, 85),
                RoleTitle = "I Am the Patient",
                RoleSubtitle = "For intubated or non-verbal ICU patients to communicate instantly without vocal cords.",
                BulletPoints = new string[] {
                    "1-Tap needs: Breathing, Suction, Pain, Water",
                    "Visual 0 to 10 pain rating scale",
                    "Nurse-assisted eye-blink protocol",
                    "Alphabet speller & emergency alert"
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
            // The dashboard's own sign-in card collects the nurse's name (and
            // ward), attaches it to every acknowledgement, and matches the web
            // role chooser exactly — so no legacy InputBox prompt here.
            ClayRoleCard cardNurse = new ClayRoleCard
            {
                Dock = DockStyle.Fill,
                Margin = new Padding(8, 6, 8, 6),
                RoleBadge = "NURSE STATION",
                BadgeBg = Color.FromArgb(217, 231, 239),
                BadgeText = Color.FromArgb(32, 75, 102),
                RoleTitle = "I Am the Nurse",
                RoleSubtitle = "Sign in with your name so every request is answered in your name. Monitor several beds at once.",
                BulletPoints = new string[] {
                    "Sign in with your name (shows on every ack)",
                    "Multi-patient bed monitor (simultaneous rooms)",
                    "Create & pair patients by 4-digit room code",
                    "Urgent repeating sirens & audible TTS speaker"
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

            ClayPillButton btnWeb = new ClayPillButton { Text = "✨ Web View", Width = 130 };
            btnWeb.Click += delegate { LaunchApp("/choose"); };
            ClayPillButton btnDual = new ClayPillButton { Text = "👥 Dual Simulator", Width = 140 };
            btnDual.Click += delegate { LaunchApp("/dual"); };
            ClayPillButton btnBoard = new ClayPillButton { Text = "📋 Backup Board", Width = 130 };
            btnBoard.Click += delegate { LaunchApp("/board"); };
            ClayPillButton btnWifi = new ClayPillButton { Text = "🌐 Wi-Fi Link", Width = 115 };
            btnWifi.Click += delegate { CopyLanUrl(); };

            flowLeft.Controls.Add(btnWeb);
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

            ClayPillButton btnHelp = new ClayPillButton { Text = "❓ How It Works", Width = 125 };
            btnHelp.Click += delegate { ShowHelp(); };
            ClayPillButton btnPrivacy = new ClayPillButton { Text = "🔒 Privacy", Width = 95 };
            btnPrivacy.Click += delegate { LaunchApp("/privacy"); };
            ClayPillButton btnRestart = new ClayPillButton { Text = "🔄 Restart Server", Width = 125 };
            btnRestart.Click += delegate { RestartServer(); };

            flowRight.Controls.Add(btnPrivacy);
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
            trayMenu.Items.Add("📱 Open Patient Tablet (New Login)", null, delegate { LaunchApp("/?fresh=1"); });
            trayMenu.Items.Add("🩺 Open Nurse Dashboard", null, delegate { LaunchApp("/nurse?fresh=1"); });
            trayMenu.Items.Add("👥 Open Dual Simulator", null, delegate { LaunchApp("/dual"); });
            trayMenu.Items.Add("📋 Open Printable Board", null, delegate { LaunchApp("/board"); });
            trayMenu.Items.Add("🔒 Privacy & Data Handling", null, delegate { LaunchApp("/privacy"); });
            trayMenu.Items.Add("📖 Usage Guidelines", null, delegate { LaunchApp("/guidelines"); });
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
                "   Opens the Bedside Tablet. Every time this is opened, a new patient login\n" +
                "   is required (Patient Name & Bed Number) to generate a fresh room code.\n\n" +
                "2. Select Nurse Role:\n" +
                "   Opens the Nurse Dashboard. Sign in with your name, then enter the\n" +
                "   patient's 4-digit code to pair instantly (or create patients there).\n\n" +
                "3. Dual Simulator:\n" +
                "   Presents both Patient and Nurse screens side-by-side on this display.\n\n" +
                "4. Printable Board:\n" +
                "   Generates a clean, laminatable communication chart as a paper backup.\n\n" +
                "Privacy: nothing leaves this device except on your Wi-Fi; no data is\n" +
                "ever recorded, tracked, or sold. See the Privacy button for details.",
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
