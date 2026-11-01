using System;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace RhodesNativeInput
{
    public sealed partial class NativeInputWatcher
    {
        private void StartCapture()
        {
            if (mouseHook != IntPtr.Zero && UnhookWindowsHookEx(mouseHook)) mouseHook = IntPtr.Zero;
            if (keyboardHook != IntPtr.Zero && UnhookWindowsHookEx(keyboardHook)) keyboardHook = IntPtr.Zero;
            if (keyboardHook != IntPtr.Zero || mouseHook != IntPtr.Zero)
            {
                captureFailed = true;
                EmitError("Native input hooks could not be reset.");
                return;
            }
            IntPtr module = GetModuleHandle(null);
            keyboardHook = SetWindowsHookEx(WhKeyboardLowLevel, keyboardProcedure, module, 0);
            if (keyboardHook == IntPtr.Zero) { HookFailed("keyboard"); return; }
            mouseHook = SetWindowsHookEx(WhMouseLowLevel, mouseProcedure, module, 0);
            if (mouseHook == IntPtr.Zero)
            {
                int code = Marshal.GetLastWin32Error();
                if (UnhookWindowsHookEx(keyboardHook)) keyboardHook = IntPtr.Zero;
                captureFailed = true;
                StopCapture();
                EmitError("SetWindowsHookEx mouse failed (Win32 " + code + ").");
                return;
            }
            capturing = true;
            EmitState(true);
        }

        private void HookFailed(string kind)
        {
            int code = Marshal.GetLastWin32Error();
            captureFailed = true;
            EmitError("SetWindowsHookEx " + kind + " failed (Win32 " + code + ").");
        }

        private void StopCapture()
        {
            bool wasCapturing = capturing;
            capturing = false;
            FlushPending();
            pressed.Clear();
            if (mouseHook != IntPtr.Zero && UnhookWindowsHookEx(mouseHook)) mouseHook = IntPtr.Zero;
            if (keyboardHook != IntPtr.Zero && UnhookWindowsHookEx(keyboardHook)) keyboardHook = IntPtr.Zero;
            if ((mouseHook != IntPtr.Zero || keyboardHook != IntPtr.Zero) && !disposed)
                EmitError("UnhookWindowsHookEx failed (Win32 " + Marshal.GetLastWin32Error() + ").");
            if (wasCapturing) EmitState(false);
        }

        private IntPtr KeyboardCallback(int code, IntPtr message, IntPtr data)
        {
            try
            {
                if (code >= 0 && capturing)
                {
                    int kind = unchecked((int)message.ToInt64());
                    if (kind == WmKeyboardDown || kind == WmSysKeyboardDown || kind == WmKeyboardUp || kind == WmSysKeyboardUp)
                    {
                        KeyboardData key = (KeyboardData)Marshal.PtrToStructure(data, typeof(KeyboardData));
                        if ((key.flags & (LlkhfInjected | LlkhfLowerInjected)) == 0)
                        {
                            int identity = key.scanCode == 0 ? 0x10000 | (int)key.virtualKey
                                : unchecked((int)(key.scanCode * 2 + ((key.flags & LlkhfExtended) == 0 ? 0 : 1)));
                            if (kind == WmKeyboardDown || kind == WmSysKeyboardDown)
                            {
                                if (pressed.Add(identity) && (GetAsyncKeyState((int)key.virtualKey) & 0x8000) == 0) AddInput();
                            }
                            else pressed.Remove(identity);
                        }
                    }
                }
            }
            catch (Exception) { CaptureCallbackFailed(); }
            return CallNextHookEx(IntPtr.Zero, code, message, data);
        }

        private IntPtr MouseCallback(int code, IntPtr message, IntPtr data)
        {
            try
            {
                if (code >= 0 && capturing)
                {
                    int kind = unchecked((int)message.ToInt64());
                    uint extra = kind == WmMouseXDown || kind == WmMouseXUp ? MessageData(data) : 0;
                    int identity = MouseButton(kind, extra);
                    if (identity != 0)
                    {
                        MouseData button = (MouseData)Marshal.PtrToStructure(data, typeof(MouseData));
                        if ((button.flags & (LlmhfInjected | LlmhfLowerInjected)) == 0)
                        {
                            if (kind == WmMouseLeftDown || kind == WmMouseRightDown || kind == WmMouseMiddleDown || kind == WmMouseXDown)
                            {
                                if (pressed.Add(identity)) AddInput();
                            }
                            else pressed.Remove(identity);
                        }
                    }
                }
            }
            catch (Exception) { CaptureCallbackFailed(); }
            return CallNextHookEx(IntPtr.Zero, code, message, data);
        }

        private static uint MessageData(IntPtr data)
        {
            MouseData value = (MouseData)Marshal.PtrToStructure(data, typeof(MouseData));
            return value.mouseData;
        }

        private static int MouseButton(int message, uint data)
        {
            if (message == WmMouseLeftDown || message == WmMouseLeftUp) return -1;
            if (message == WmMouseRightDown || message == WmMouseRightUp) return -2;
            if (message == WmMouseMiddleDown || message == WmMouseMiddleUp) return -3;
            if (message != WmMouseXDown && message != WmMouseXUp) return 0;
            int side = (int)((data >> 16) & 0xffff);
            return side == 1 ? -4 : side == 2 ? -5 : 0;
        }

        private void CaptureCallbackFailed()
        {
            captureFailed = true;
            wanted = false;
            StopCapture();
            EmitError("Native input callback failed.");
        }

        private void AddInput()
        {
            long second = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            if (bucketSecond != second)
            {
                if (bucketSecond > second) return;
                FlushPending();
                bucketSecond = second;
                bucketCount = 0;
            }
            if (bucketCount >= MaxInputsPerSecond) return;
            bucketCount++;
            pendingCount++;
        }

        private void FlushElapsedBucket()
        {
            if (bucketSecond >= 0 && DateTimeOffset.UtcNow.ToUnixTimeSeconds() > bucketSecond)
            {
                FlushPending();
                bucketSecond = -1;
                bucketCount = 0;
            }
        }

        private void RequestFlush()
        {
            FlushPending();
            Emit("{\"type\":\"flushed\"}");
        }

        private void FlushPending()
        {
            if (pendingCount == 0) return;
            Emit("{\"type\":\"counts\",\"counts\":[{\"second\":" + bucketSecond + ",\"count\":" + pendingCount + "}]}");
            pendingCount = 0;
        }

        private static void EmitState(bool active)
        {
            Emit("{\"type\":\"state\",\"active\":" + (active ? "true" : "false") + "}");
        }

        private static void EmitError(string message)
        {
            Emit("{\"type\":\"error\",\"message\":\"" + message + "\"}");
        }

        private static void Emit(string line)
        {
            lock (OutputLock)
            {
                Console.Out.WriteLine(line);
                Console.Out.Flush();
            }
        }

        private void Post(int message)
        {
            if (window != null && !disposed && !PostMessage(window.Handle, message, IntPtr.Zero, IntPtr.Zero))
                throw new InvalidOperationException("Native input control message failed.");
        }

        private sealed class InputWindow : NativeWindow
        {
            private readonly NativeInputWatcher owner;
            public InputWindow(NativeInputWatcher owner)
            {
                this.owner = owner;
                CreateHandle(new CreateParams());
            }
            protected override void WndProc(ref Message message)
            {
                if (!owner.HandleWindowMessage(ref message)) base.WndProc(ref message);
            }
        }

        [StructLayout(LayoutKind.Sequential)] private struct KeyboardData
        {
            public uint virtualKey;
            public uint scanCode;
            public uint flags;
            public uint time;
            public UIntPtr extraInfo;
        }
        [StructLayout(LayoutKind.Sequential)] private struct Point { public int x; public int y; }
        [StructLayout(LayoutKind.Sequential)] private struct MouseData
        {
            public Point point;
            public uint mouseData;
            public uint flags;
            public uint time;
            public UIntPtr extraInfo;
        }

        [DllImport("user32.dll", EntryPoint = "SetWindowsHookExW", SetLastError = true)] private static extern IntPtr SetWindowsHookEx(int id, HookProcedure callback, IntPtr module, uint threadId);
        [DllImport("user32.dll", SetLastError = true)] private static extern bool UnhookWindowsHookEx(IntPtr hook);
        [DllImport("user32.dll")] private static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr message, IntPtr data);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr GetModuleHandle(string moduleName);
        [DllImport("user32.dll")] private static extern short GetAsyncKeyState(int key);
    }
}
