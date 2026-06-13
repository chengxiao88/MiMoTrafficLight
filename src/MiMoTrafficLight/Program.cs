using System;
using System.Windows.Forms;

namespace MiMoTrafficLight;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        using var mutex = new System.Threading.Mutex(true, "Global\\MiMoTrafficLight_UserInstance", out var createdNew);
        if (!createdNew)
        {
            return;
        }
        Application.Run(new TrafficLightForm());
    }
}
