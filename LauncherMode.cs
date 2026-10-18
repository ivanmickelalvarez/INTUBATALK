using System;

namespace IntubaTalk
{
    public enum AppMode
    {
        Cloud,
        Local
    }

    public static class LauncherMode
    {
        public static AppMode ParseMode(string[] args)
        {
            bool cloud = false;
            bool local = false;
            if (args != null)
            {
                foreach (string arg in args)
                {
                    if (String.Equals(arg, "--cloud", StringComparison.OrdinalIgnoreCase)) cloud = true;
                    if (String.Equals(arg, "--local", StringComparison.OrdinalIgnoreCase)) local = true;
                }
            }
            if (cloud && local) throw new ArgumentException("Choose either --cloud or --local, not both.");
            return local ? AppMode.Local : AppMode.Cloud;
        }

        public static Uri BuildTargetUri(AppMode mode, string cloudOrigin, int serverPort, string route)
        {
            if (String.IsNullOrEmpty(route) || !route.StartsWith("/", StringComparison.Ordinal) || route.StartsWith("//", StringComparison.Ordinal))
                throw new ArgumentException("The app route must be an absolute path on the selected host.", "route");

            Uri baseUri;
            if (mode == AppMode.Local)
            {
                if (serverPort < 1 || serverPort > 65535) throw new ArgumentOutOfRangeException("serverPort");
                baseUri = new Uri("http://127.0.0.1:" + serverPort.ToString(System.Globalization.CultureInfo.InvariantCulture) + "/");
            }
            else if (mode == AppMode.Cloud)
            {
                if (!Uri.TryCreate(cloudOrigin, UriKind.Absolute, out baseUri) ||
                    baseUri.Scheme != Uri.UriSchemeHttps ||
                    !String.IsNullOrEmpty(baseUri.UserInfo) ||
                    (baseUri.AbsolutePath != "/" && baseUri.AbsolutePath != String.Empty) ||
                    !String.IsNullOrEmpty(baseUri.Query) || !String.IsNullOrEmpty(baseUri.Fragment))
                    throw new ArgumentException("Cloud mode requires a configured HTTPS origin without a path, query, or fragment.", "cloudOrigin");
            }
            else
            {
                throw new ArgumentOutOfRangeException("mode");
            }

            return new Uri(baseUri, route.TrimStart('/'));
        }

        public static Uri BuildCloudProbeUri(string cloudOrigin)
        {
            return BuildTargetUri(AppMode.Cloud, cloudOrigin, 1, "/manifest.webmanifest");
        }

        public static bool IsCloudProbeStatusReachable(int statusCode)
        {
            return (statusCode >= 200 && statusCode < 400) || statusCode == 401 || statusCode == 403;
        }
    }
}
