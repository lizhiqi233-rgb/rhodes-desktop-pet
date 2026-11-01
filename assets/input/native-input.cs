using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace RhodesNativeInput
{
    public sealed partial class NativeInputWatcher : IDisposable
    {
        private const int WmKeyboardDown = 0x0100;
        private const int WmSysKeyboardDown = 0x0104;
        private const int WmKeyboardUp = 0x0101;
        private const int WmSysKeyboardUp = 0x0105;
        private const int WmMouseLeftDown = 0x0201;
        private const int WmMouseLeftUp = 0x0202;
        private const int WmMouseRightDown = 0x0204;
        private const int WmMouseRightUp = 0x0205;
        private const int WmMouseMiddleDown = 0x0207;
        private const int WmMouseMiddleUp = 0x0208;
        private const int WmMouseXDown = 0x020B;
        private const int WmMouseXUp = 0x020C;
        private const int WmPowerBroadcast = 0x0218;
        private const int WmSessionChange = 0x02B1;
        private const int WmTimer = 0x0113;
        private const int WmApp = 0x8000;
        private const int WmEnable = WmApp + 1;
        private const int WmDisable = WmApp + 2;
        private const int WmFlush = WmApp + 3;
        private const int WmExit = WmApp + 4;
        private const int TimerId = 1;
        private const int WhKeyboardLowLevel = 13;
        private const int WhMouseLowLevel = 14;
        private const int LlkhfExtended = 0x01;
        private const int LlkhfInjected = 0x10;
        private const int LlkhfLowerInjected = 0x02;
        private const int LlmhfInjected = 0x01;
        private const int LlmhfLowerInjected = 0x02;
        private const int WtsSessionLock = 0x7;
        private const int WtsSessionUnlock = 0x8;
        private const int WtsConsoleDisconnect = 0x2;
        private const int WtsRemoteDisconnect = 0x4;
        private const int WtsConsoleConnect = 0x1;
        private const int WtsRemoteConnect = 0x3;
        private const int PowerSuspend = 0x4;
        private const int PowerResume = 0x7;
        private const int PowerResumeAutomatic = 0x12;
        private const uint NotifyThisSession = 0;
        private const uint DesktopReadObjects = 0x0001;
        private const int UserObjectName = 2;
        private const int MaxInputsPerSecond = 20;
        private static readonly object OutputLock = new object();

        private delegate IntPtr HookProcedure(int code, IntPtr message, IntPtr data);
        private readonly ManualResetEvent initialized = new ManualResetEvent(false);
        private readonly HashSet<int> pressed = new HashSet<int>();
        private readonly HookProcedure keyboardProcedure;
        private readonly HookProcedure mouseProcedure;
        private readonly Thread messageThread;
        private InputWindow window;
        private IntPtr keyboardHook;
        private IntPtr mouseHook;
        private bool wanted;
        private bool locked;
        private bool suspended;
        private bool defaultDesktop;
        private bool desktopErrorReported;
        private bool capturing;
        private bool captureFailed;
        private bool disposed;
        private long bucketSecond = -1;
        private int bucketCount;
        private int pendingCount;
        private Exception startupFailure;

        public NativeInputWatcher()
        {
            keyboardProcedure = KeyboardCallback;
            mouseProcedure = MouseCallback;
            messageThread = new Thread(RunMessageLoop);
            messageThread.IsBackground = true;
            messageThread.Name = "Native input message loop";
            messageThread.SetApartmentState(ApartmentState.STA);
            messageThread.Start();
            if (!initialized.WaitOne(5000)) throw new InvalidOperationException("Native input message loop did not start.");
            if (startupFailure != null) throw new InvalidOperationException("Native input message loop failed.");
        }

        public void Enable() { Post(WmEnable); }
        public void Disable() { Post(WmDisable); }
        public void Flush() { Post(WmFlush); }

        public void Dispose()
        {
            if (disposed) return;
            Post(WmExit);
            if (!messageThread.Join(2000)) EmitError("Native input message loop did not stop.");
            disposed = true;
            initialized.Dispose();
        }

        private void RunMessageLoop()
        {
            try
            {
                window = new InputWindow(this);
                if (SetTimer(window.Handle, TimerId, 250, IntPtr.Zero) == IntPtr.Zero)
                    throw new InvalidOperationException();
                if (!WtsRegisterSessionNotification(window.Handle, NotifyThisSession))
                    throw new InvalidOperationException();
                CheckInputDesktop();
                initialized.Set();
                Application.Run();
            }
            catch (Exception)
            {
                startupFailure = new InvalidOperationException();
                initialized.Set();
            }
            finally
            {
                StopCapture();
                if (window != null)
                {
                    KillTimer(window.Handle, TimerId);
                    WtsUnregisterSessionNotification(window.Handle);
                    window.DestroyHandle();
                }
            }
        }

        private bool HandleWindowMessage(ref Message message)
        {
            int id = message.Msg;
            if (id == WmEnable)
            {
                captureFailed = false;
                wanted = true;
                CheckInputDesktop();
                UpdateCapture();
            }
            else if (id == WmDisable)
            {
                wanted = false;
                captureFailed = false;
                UpdateCapture();
            }
            else if (id == WmFlush)
            {
                RequestFlush();
            }
            else if (id == WmExit)
            {
                wanted = false;
                UpdateCapture();
                FlushPending();
                disposed = true;
                Application.ExitThread();
            }
            else if (id == WmTimer)
            {
                CheckInputDesktop();
                FlushPending();
                FlushElapsedBucket();
            }
            else if (id == WmSessionChange)
            {
                int reason = unchecked((int)message.WParam.ToInt64());
                if (reason == WtsSessionLock || reason == WtsConsoleDisconnect || reason == WtsRemoteDisconnect) locked = true;
                if (reason == WtsSessionUnlock || reason == WtsConsoleConnect || reason == WtsRemoteConnect) locked = false;
                UpdateCapture();
            }
            else if (id == WmPowerBroadcast)
            {
                int reason = unchecked((int)message.WParam.ToInt64());
                if (reason == PowerSuspend) suspended = true;
                if (reason == PowerResume || reason == PowerResumeAutomatic) suspended = false;
                UpdateCapture();
            }
            else return false;
            message.Result = IntPtr.Zero;
            return true;
        }

        private void CheckInputDesktop()
        {
            IntPtr desktop = OpenInputDesktop(0, false, DesktopReadObjects);
            bool isDefault = false;
            if (desktop == IntPtr.Zero)
            {
                if (wanted && !locked && !suspended && !desktopErrorReported)
                {
                    desktopErrorReported = true;
                    EmitError("OpenInputDesktop failed (Win32 " + Marshal.GetLastWin32Error() + ").");
                }
            }
            else
            {
                desktopErrorReported = false;
                try
                {
                    uint needed;
                    GetUserObjectInformation(desktop, UserObjectName, null, 0, out needed);
                    if (needed > 0)
                    {
                        StringBuilder name = new StringBuilder((int)(needed / 2));
                        if (GetUserObjectInformation(desktop, UserObjectName, name, needed, out needed))
                            isDefault = String.Equals(name.ToString(), "Default", StringComparison.OrdinalIgnoreCase);
                    }
                }
                finally { CloseDesktop(desktop); }
            }
            if (defaultDesktop != isDefault)
            {
                defaultDesktop = isDefault;
                UpdateCapture();
            }
        }

        private void UpdateCapture()
        {
            bool shouldCapture = wanted && !locked && !suspended && defaultDesktop && !captureFailed;
            if (shouldCapture && !capturing) StartCapture();
            else if (!shouldCapture && (capturing || keyboardHook != IntPtr.Zero || mouseHook != IntPtr.Zero))
            {
                StopCapture();
            }
        }

        [DllImport("user32.dll", SetLastError = true)] private static extern bool PostMessage(IntPtr window, int message, IntPtr wParam, IntPtr lParam);
        [DllImport("user32.dll", SetLastError = true)] private static extern IntPtr SetTimer(IntPtr window, int id, uint milliseconds, IntPtr callback);
        [DllImport("user32.dll")] private static extern bool KillTimer(IntPtr window, int id);
        [DllImport("user32.dll", SetLastError = true)] private static extern IntPtr OpenInputDesktop(uint flags, bool inherit, uint access);
        [DllImport("user32.dll", SetLastError = true)] private static extern bool CloseDesktop(IntPtr desktop);
        [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern bool GetUserObjectInformation(IntPtr handle, int index, StringBuilder info, uint length, out uint needed);
        [DllImport("wtsapi32.dll", EntryPoint = "WTSRegisterSessionNotification", SetLastError = true)] private static extern bool WtsRegisterSessionNotification(IntPtr window, uint flags);
        [DllImport("wtsapi32.dll", EntryPoint = "WTSUnRegisterSessionNotification", SetLastError = true)] private static extern bool WtsUnregisterSessionNotification(IntPtr window);
    }
}
