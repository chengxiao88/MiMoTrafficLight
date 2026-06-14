using System;
using System.Security.Principal;
using System.Windows.Forms;

namespace MiMoTrafficLight;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        var sid = WindowsIdentity.GetCurrent().User?.Value ?? Environment.UserName;
        var mutexName = $@"Local\MiMoTrafficLight_{sid}";

        using var mutex = new System.Threading.Mutex(true, mutexName, out var createdNew);
        if (!createdNew)
        {
            return;
        }
        Application.Run(new TrafficLightForm());
    }
}
