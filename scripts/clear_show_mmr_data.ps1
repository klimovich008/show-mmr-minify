param(
    [string[]]$Paths = @(
        "${env:ProgramFiles(x86)}\Steam\userdata\*\570\local\cfg\user_keys*_slot3.vcfg",
        "G:\SteamLibrary\steamapps\common\dota 2 beta\game\dota\cfg\user_keys*_slot3.vcfg"
    ),
    [switch]$ClearAllJoySlots,
    [switch]$NoBackup
)

$joyLine = '^\s*"JOY([1-9]|[12][0-9]|3[0-2])"\s+"([^"]*)"\s*$'
$showMmrValue = '^(showmmr_pending(_v2)?:|[0-9]{8,}:\[[0-9-]+,[0-9-]+\](,[0-9]{8,}:\[[0-9-]+,[0-9-]+\])*)'
$backupRoot = Join-Path (Get-Location) ("showmmr_backup_" + (Get-Date -Format "yyyyMMdd-HHmmss"))
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

        if ($removedHere -gt 0) {
            if (-not $NoBackup) {
                $relative = $file.FullName -replace '^[A-Za-z]:\\', ''
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
