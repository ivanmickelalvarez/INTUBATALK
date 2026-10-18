using System;
using System.Reflection;
using IntubaTalk;

internal static class WindowsModeTests
{
    private static int _assertions;

    private static void Equal<T>(T expected, T actual, string name)
    {
        _assertions++;
        if (!Object.Equals(expected, actual))
            throw new Exception(name + ": expected " + expected + ", got " + actual);
    }

    private static void Throws<T>(Action action, string name) where T : Exception
    {
        _assertions++;
        try { action(); }
        catch (T) { return; }
        throw new Exception(name + ": expected " + typeof(T).Name);
    }

    private static Uri BuildCloudProbeUri(string origin)
    {
        MethodInfo method = typeof(LauncherMode).GetMethod("BuildCloudProbeUri");
        if (method == null) return null;
        return (Uri)method.Invoke(null, new object[] { origin });
    }

    private static bool IsCloudProbeStatusReachable(int statusCode)
    {
        MethodInfo method = typeof(LauncherMode).GetMethod("IsCloudProbeStatusReachable");
        if (method == null) return false;
        return (bool)method.Invoke(null, new object[] { statusCode });
    }

    public static int Main()
    {
        Equal(AppMode.Cloud, LauncherMode.ParseMode(new string[0]), "default mode is cloud");
        Equal(AppMode.Cloud, LauncherMode.ParseMode(new string[] { "--cloud", "--patient" }), "cloud flag");
        Equal(AppMode.Local, LauncherMode.ParseMode(new string[] { "--local", "--nurse" }), "local flag");
        Throws<ArgumentException>(delegate { LauncherMode.ParseMode(new string[] { "--cloud", "--local" }); }, "conflicting mode flags");

        string[] routes = { "/?fresh=1", "/nurse?fresh=1", "/dual", "/board" };
        foreach (string route in routes)
        {
            Equal(new Uri("https://care.example" + route),
                LauncherMode.BuildTargetUri(AppMode.Cloud, "https://care.example/", 8788, route),
                "cloud route " + route);
            Equal(new Uri("http://127.0.0.1:8788" + route),
                LauncherMode.BuildTargetUri(AppMode.Local, "https://care.example/", 8788, route),
                "local route " + route);
        }

        Throws<ArgumentException>(delegate {
            LauncherMode.BuildTargetUri(AppMode.Cloud, "http://care.example", 8788, "/");
        }, "cloud requires https");
        foreach (string invalidOrigin in new string[] {
            "https://user@care.example", "https://care.example/app",
            "https://care.example?", "https://care.example#"
        })
        {
            Throws<ArgumentException>(delegate {
                LauncherMode.BuildTargetUri(AppMode.Cloud, invalidOrigin, 8788, "/");
            }, "invalid cloud origin " + invalidOrigin);
        }

        Equal(new Uri("https://care.example/manifest.webmanifest"),
            BuildCloudProbeUri("https://care.example/"),
            "cloud probe uses the public install manifest, not the Access-gated app route");
        Equal(true, IsCloudProbeStatusReachable(200), "healthy manifest response");
        Equal(true, IsCloudProbeStatusReachable(302), "Cloudflare Access redirect still means the origin is reachable");
        Equal(true, IsCloudProbeStatusReachable(403), "Access denial is reachable and should be shown in the browser");
        Equal(false, IsCloudProbeStatusReachable(503), "server failure is not a healthy probe response");

        Console.WriteLine("WINDOWS_MODE_TESTS_OK " + _assertions);
        return 0;
    }
}
