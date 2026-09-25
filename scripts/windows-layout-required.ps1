# Prints every path the Windows installers must put beside grid.exe, relative
# to it: each DLL in src-tauri/lib/windows and each file under its LICENSES
# (as LICENSES\<path>). CI's package-windows checks feed this to the MSI and
# NSIS layout checks. Run from the repository root after `npm run setup:libmpv`.
$ErrorActionPreference = 'Stop'
$lib = (Resolve-Path 'src-tauri/lib/windows').Path

$dlls = @(Get-ChildItem -File $lib -Filter *.dll | ForEach-Object { $_.Name })
# The closure is ~31 DLLs (8 built by Grid, 23 from MSYS2 on 2026-09-24); the
# floor only catches a missing or half-extracted lib/windows, not MSYS2 churn.
if ($dlls.Count -lt 25) { throw "suspiciously few DLLs in $lib`: $($dlls.Count)" }

$licenceRoot = Join-Path $lib 'LICENSES'
$licences = @(Get-ChildItem -Recurse -File $licenceRoot | ForEach-Object {
    'LICENSES\' + $_.FullName.Substring($licenceRoot.Length + 1).Replace('/', '\')
  })
# The b4 archive ships 54 licence files; the floor catches a missing or
# half-copied LICENSES (which would make the checks pass vacuously), with
# headroom for a dependency dropping out of the closure.
if ($licences.Count -lt 50) { throw "suspiciously few licence files in $licenceRoot`: $($licences.Count)" }

# Sanity: the notices of the libraries Grid builds and of the MinGW runtime.
foreach ($named in @('LICENSES\mpv-LGPL-2.1.txt', 'LICENSES\ffmpeg-LGPL-2.1.txt',
    'LICENSES\libplacebo-LGPL-2.1.txt', 'LICENSES\libass\COPYING',
    'LICENSES\crt\COPYING.MinGW-w64-runtime.txt', 'LICENSES\glslang\LICENSE.txt')) {
  if ($licences -notcontains $named) { throw "$named is missing from $licenceRoot" }
}

$dlls + $licences
