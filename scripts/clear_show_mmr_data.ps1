[CmdletBinding(SupportsShouldProcess)]
param(
    [string[]]$Paths,
    [switch]$ClearAllJoySlots,
    [switch]$NoBackup
)

$ErrorActionPreference = 'Stop'
if (-not $WhatIfPreference -and (Get-Process dota2 -ErrorAction SilentlyContinue)) {
    throw "Close Dota before clearing bindings; it can rewrite them on exit."
}

if (-not $Paths) {
    $steam = (Get-ItemProperty "HKCU:\Software\Valve\Steam" -ErrorAction SilentlyContinue).SteamPath
    if (-not $steam) { throw "Steam install not found in registry; pass -Paths explicitly." }
    $Paths = @(Join-Path $steam "userdata\*\570\local\cfg\user_keys*_slot3.vcfg")
    $vdf = Join-Path $steam "steamapps\libraryfolders.vdf"
    if (Test-Path $vdf) {
        foreach ($match in [regex]::Matches((Get-Content -Raw $vdf), '"path"\s+"([^"]+)"')) {
            $library = $match.Groups[1].Value -replace '\\\\', '\'
            $Paths += Join-Path $library "steamapps\common\dota 2 beta\game\dota\cfg\user_keys*_slot3.vcfg"
        }
    }
}

$joyLine = '^\s*"JOY([1-9]|[12][0-9]|3[0-2])"\s+"([^"]*)"\s*$'
$showMmrValue = '^(showmmr_user:[0-9]+:p1:[1-3]:[0-9]+:[0-9]{10}:[0-9]+:[0-9]+:[0-9]+:[0-3]|showmmr_(pending(_v2)?|user):[0-9,:\[\]-]+|[0-9]{8,}:\[[0-9]+,-?[0-9]+\](,[0-9]{8,}:\[[0-9]+,-?[0-9]+\])*)$'
$backupRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("showmmr_backup_" + [guid]::NewGuid().ToString('N'))
$utf8NoBom = New-Object System.Text.UTF8Encoding -ArgumentList $false
$filesChanged = 0
$linesRemoved = 0

foreach ($path in $Paths) {
    foreach ($file in Get-ChildItem -Path $path -ErrorAction SilentlyContinue | Where-Object { -not $_.PSIsContainer }) {
        $text = Get-Content -LiteralPath $file.FullName
        $kept = New-Object System.Collections.Generic.List[string]
        $removedHere = 0

        foreach ($line in $text) {
            $match = [regex]::Match($line, $joyLine)
            if ($match.Success -and ($ClearAllJoySlots -or $match.Groups[2].Value -match $showMmrValue)) {
                $removedHere++
                continue
            }
            $kept.Add($line)
        }

        if ($removedHere -gt 0 -and $PSCmdlet.ShouldProcess($file.FullName, "Remove $removedHere binding line(s)")) {
            if (-not $NoBackup) {
                $relative = $file.FullName -replace ':', '' -replace '^\\+', ''
                $backup = Join-Path $backupRoot $relative
                New-Item -ItemType Directory -Force -Path (Split-Path -Parent $backup) | Out-Null
                Copy-Item -LiteralPath $file.FullName -Destination $backup -Force
            }
            [System.IO.File]::WriteAllLines($file.FullName, [string[]]$kept, $utf8NoBom)
            $filesChanged++
            $linesRemoved += $removedHere
            Write-Output ("cleared {0} line(s): {1}" -f $removedHere, $file.FullName)
        }
    }
}

Write-Output ("done: files={0} lines={1} backup={2}" -f $filesChanged, $linesRemoved, $(if ($NoBackup -or $filesChanged -eq 0) { "none" } else { $backupRoot }))
