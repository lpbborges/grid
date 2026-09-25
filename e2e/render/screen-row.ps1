# Prints the colours of one screen row through the middle of Grid's window as
# `#RRGGBB` lines (the render smoke test's Windows counterpart of ImageMagick's
# `import`). WebDriver screenshots only see WebView2, never mpv's child window,
# so this reads what the desktop actually shows. With -Png, also saves the
# whole screen there (for a failure capture).
param([string]$Png)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing, System.Windows.Forms
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class GridWindow {
  [StructLayout(LayoutKind.Sequential)]
  public struct Rect { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out Rect rect);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
'@
# Physical pixels for both the window rectangle and the capture.
[GridWindow]::SetProcessDPIAware() | Out-Null

$screen = [System.Windows.Forms.SystemInformation]::VirtualScreen
if ($Png) {
  $shot = New-Object System.Drawing.Bitmap $screen.Width, $screen.Height
  $g = [System.Drawing.Graphics]::FromImage($shot)
  $g.CopyFromScreen($screen.Left, $screen.Top, 0, 0, $shot.Size)
  $shot.Save($Png, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $shot.Dispose()
}

$grid = Get-Process grid -ErrorAction SilentlyContinue | Where-Object MainWindowHandle -ne 0 | Select-Object -First 1
if (-not $grid) { throw 'no grid.exe window' }
$rect = New-Object GridWindow+Rect
if (-not [GridWindow]::GetWindowRect($grid.MainWindowHandle, [ref]$rect)) { throw 'GetWindowRect failed' }

# The part of the window that is on screen: the runner's desktop can be smaller
# than Grid's default window.
$left = [Math]::Max($rect.Left, $screen.Left)
$right = [Math]::Min($rect.Right, $screen.Right)
$top = [Math]::Max($rect.Top, $screen.Top)
$bottom = [Math]::Min($rect.Bottom, $screen.Bottom)
if ($right -le $left -or $bottom -le $top) { throw "grid.exe window $($rect.Left),$($rect.Top),$($rect.Right),$($rect.Bottom) is off screen $screen" }
$y = [int](($top + $bottom) / 2)
$width = $right - $left

$row = New-Object System.Drawing.Bitmap $width, 1
$g = [System.Drawing.Graphics]::FromImage($row)
$g.CopyFromScreen($left, $y, 0, 0, $row.Size)
$lines = for ($x = 0; $x -lt $width; $x++) {
  $c = $row.GetPixel($x, 0)
  '#{0:X2}{1:X2}{2:X2}' -f $c.R, $c.G, $c.B
}
$g.Dispose(); $row.Dispose()
$lines -join "`n"
