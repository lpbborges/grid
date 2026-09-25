# Prints every path the Windows installers must put beside grid.exe, relative
# to it: each DLL in src-tauri/lib/windows, plus one licence text to prove
# LICENSES\ made it. CI's package-windows checks feed this to the MSI and NSIS
# layout checks. Run from the repository root after `npm run setup:libmpv`.
$ErrorActionPreference = 'Stop'
$lib = (Resolve-Path 'src-tauri/lib/windows').Path

$dlls = @(Get-ChildItem -File $lib -Filter *.dll | ForEach-Object { $_.Name })
# The closure is ~31 DLLs (8 built by Grid, 23 from MSYS2 on 2026-09-24); the
# floor only catches a missing or half-extracted lib/windows, not MSYS2 churn.
if ($dlls.Count -lt 25) { throw "suspiciously few DLLs in $lib`: $($dlls.Count)" }

$dlls + @('LICENSES\mpv-LGPL-2.1.txt')
