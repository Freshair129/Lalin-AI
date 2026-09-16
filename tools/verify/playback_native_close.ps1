param([Parameter(Mandatory = $true)][int]$ProcessId)
$ErrorActionPreference = 'Stop'
$nativeProcess = Get-Process -Id $ProcessId
if ($nativeProcess.Path -ne (Join-Path $PSScriptRoot '../../apps/desktop/src-tauri/target/debug/g-music.exe' | Resolve-Path).Path) {
    throw 'The process must be this workspace debug app.'
}
Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class PlaybackCloseProbe {
    public delegate bool EnumProc(IntPtr hwnd, IntPtr data);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc callback, IntPtr data);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hwnd, StringBuilder title, int size);
    [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hwnd, uint msg, IntPtr wParam, IntPtr lParam);
    public static bool ClosePlay(uint pid) {
        bool sent = false;
        EnumWindows((hwnd, data) => {
            uint actual;
            GetWindowThreadProcessId(hwnd, out actual);
            var title = new StringBuilder(256);
            GetWindowText(hwnd, title, title.Capacity);
            if (actual == pid && title.ToString() == "Lalin Play") {
                sent = PostMessage(hwnd, 0x0010, IntPtr.Zero, IntPtr.Zero);
                return false;
            }
            return true;
        }, IntPtr.Zero);
        return sent;
    }
}
'@
if (-not [PlaybackCloseProbe]::ClosePlay($ProcessId)) { throw 'Play window was not found or WM_CLOSE failed.' }
