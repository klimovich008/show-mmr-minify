[CmdletBinding()]
param(
    [string]$DotaPath,
    [string]$MinifyPath,
    [string]$PythonPath = 'pythonw.exe',
    [switch]$Uninstall
)
$ErrorActionPreference = 'Stop'
# Packaged launchers can virtualize AppData; this path is visible at normal sign-in.
$root = Join-Path $env:USERPROFILE 'ShowMMRDevLogs'
$script = Join-Path $root 'collect_dev_logs.py'
$config = Join-Path $root 'config.json'
$arguments = '"' + $script + '" --config "' + $config + '"'
$shortcutPath = Join-Path ([Environment]::GetFolderPath('Startup')) 'Show MMR Development Logs.lnk'
$shell = New-Object -ComObject WScript.Shell
if (Test-Path -LiteralPath $shortcutPath) {
    $existing = $shell.CreateShortcut($shortcutPath)
    if ($existing.Arguments -ne $arguments) { throw "An unrelated startup shortcut already exists: $shortcutPath" }
}
if (!$Uninstall) {
    $dota = (Resolve-Path -LiteralPath $DotaPath).Path
    $dotaLogs = Join-Path $dota 'game\dota'
    if (!(Test-Path -LiteralPath $dotaLogs -PathType Container)) { throw 'DotaPath must name the dota 2 beta directory' }
    $python = (Get-Command $PythonPath -CommandType Application -ErrorAction Stop).Source
    if ([IO.Path]::GetFileName($python) -ne 'pythonw.exe') { throw 'Pass pythonw.exe so the collector has no console window' }
    $watch = @(@{ directory = $dotaLogs; patterns = @('*.log') })
    if ($MinifyPath) {
        $minify = (Resolve-Path -LiteralPath $MinifyPath).Path
        $watch += @{ directory = (Join-Path $minify 'logs'); patterns = @('*.log', '*.txt') }
    }
}
if (Test-Path -LiteralPath $root) {
    [IO.File]::WriteAllText((Join-Path $root 'stop.request'), '')
    $deadline = (Get-Date).AddSeconds(15)
    do {
        try {
            $lock = [IO.File]::Open((Join-Path $root 'collector.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
            $lock.Dispose()
            break
        } catch [IO.IOException] {
            if ((Get-Date) -gt $deadline) { throw 'Collector did not stop; installation files were not replaced' }
            Start-Sleep -Milliseconds 250
        }
    } while ($true)
}
if ($Uninstall) {
    if (Test-Path -LiteralPath $shortcutPath) { Remove-Item -LiteralPath $shortcutPath }
    Write-Output "Autostart removed and collector stopped. Archives preserved in $root"
    return
}
New-Item -ItemType Directory -Force -Path $root | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'collect_dev_logs.py') -Destination $script -Force
$json = @{ watch = $watch } | ConvertTo-Json -Depth 5
[IO.File]::WriteAllText($config, $json, [Text.UTF8Encoding]::new($false))
$stop = Join-Path $root 'stop.request'
if (Test-Path -LiteralPath $stop) { Remove-Item -LiteralPath $stop }
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $python
$shortcut.Arguments = $arguments
$shortcut.WorkingDirectory = $root
$shortcut.WindowStyle = 7
$shortcut.Description = 'Local Dota and Minify log archives for Show MMR development; not required by the mod'
$shortcut.Save()
$process = Start-Process -FilePath $python -ArgumentList $arguments -WorkingDirectory $root -WindowStyle Hidden -PassThru
$deadline = (Get-Date).AddSeconds(15)
do {
    Start-Sleep -Milliseconds 250
    if ($process.HasExited) { throw "Collector exited. Check $root\collector.log" }
    $statusPath = Join-Path $root 'status.json'
    if (Test-Path -LiteralPath $statusPath) {
        $status = Get-Content -LiteralPath $statusPath -Raw | ConvertFrom-Json
        if ($status.pid -eq $process.Id -and $status.state -eq 'running') { break }
    }
    if ((Get-Date) -gt $deadline) { throw "Collector did not report readiness. Check $root\collector.log" }
} while ($true)
Write-Output "Started collector PID $($process.Id). Autostart: $shortcutPath"
Write-Output "Archives and status: $root"
