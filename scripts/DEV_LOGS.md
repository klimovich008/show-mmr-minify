# Optional Development Log Collector

This is a diagnostic tool, **not a dependency of Show MMR**. It does not supply
data to the mod, infer MMR, modify bindings, patch/launch/control Dota, or upload
anything. Disabling or uninstalling it does not change the mod's behavior.

## Install on Windows

Requires an existing Python 3.10+ installation with `pythonw.exe`. No third-party
Python packages or administrator rights are required. In PowerShell, from the
repository root:

```powershell
.\scripts\install_dev_log_collector.ps1 `
  -DotaPath 'C:\Program Files (x86)\Steam\steamapps\common\dota 2 beta' `
  -MinifyPath "$env:USERPROFILE\Downloads\Minify-v1.14rc6-windows" `
  -PythonPath 'C:\Path\To\Python\pythonw.exe'
```

Use your actual paths; `MinifyPath` is optional. Dota needs its existing
`-condebug` launch option to write `console.log`. The installer does not change
Steam launch options. It starts the collector now and adds a **current-user
sign-in shortcut**, not a system service or an administrator task. It runs
silently after sign-in, even when Codex and Minify are closed. Python must remain
installed at the configured path. Re-run the installer to update that path/code.

## Files and Scope

Everything is local under `%USERPROFILE%\ShowMMRDevLogs`.
The user-profile folder avoids AppData redirection
when the installer is launched from a packaged desktop application:

- `archives\*.log`: raw byte-preserving copies of full selected logs, not only
  ShowMMR messages. Files are split at 64 MiB and never automatically deleted.
- `archives\index.jsonl`: source path, creation time, reason, and original byte
  offset for each archived segment. Consecutive `segment-limit` pieces belong to
  the same source generation until a rewrite or collector restart.
- `status.json`: PID, heartbeat (about every two seconds), source offsets/errors,
  current archive paths, and running/stopped state. A stale heartbeat is a warning;
  the file alone is not proof the process is still running.
- `collector.log`: collector diagnostics, rotated at 1 MiB with two backups.
- `config.json`: selected directories and filename patterns.

The defaults collect `*.log` directly under Dota's `game\dota` directory and
`*.log`/`*.txt` directly under Minify's `logs` directory. They do not recursively
copy game files, Steam account files, chat applications, or unrelated PC logs.
Existing selected logs are captured from the beginning at collector startup.
New matching files are discovered every two seconds. Appends are polled every
250 ms. Replaced/truncated/rewritten logs start new archives; old archives remain.
Starting the collector again deliberately captures the current logs again, so
archives from separate collector runs may overlap. Source logs are read-only and
opened with shared read/write/delete access and closed after each read. Rename-away
rotation was tested while a reader was open. Windows can still reject some direct
replace-over-open-file operations, so no reader handle is kept between polls.

## Limits and Privacy

This preserves bytes Dota/Minify actually write and the collector manages to read.
It cannot capture console-only messages, recover data from before installation,
or guarantee recovery of bytes written and erased entirely between polls. A crash
before Dota flushes its own log can still lose those messages. Prefix/tail checks
detect common truncate-and-regrow cases, not every possible same-content rewrite.
Archive writes are flushed before advancing source offsets. Filesystem failures
are retried and surfaced in status/collector diagnostics where disk access permits.

No automatic archive deletion is performed. Monitor disk space and remove or move
old archives yourself when they are no longer useful. Insufficient space can cause
capture gaps; old evidence is never sacrificed silently to make room.

Full Dota logs can contain account IDs, player names, chat, network addresses,
and other personal data. Archives stay on this PC. Review/redact them before
sharing. The helper neither scrapes the screen nor records keystrokes.

## Stop and Remove Autostart

```powershell
.\scripts\install_dev_log_collector.ps1 -Uninstall
```

This requests a graceful stop and removes only this tool's startup shortcut.
Archives, configuration, and installed script are kept. Re-running the install
command resumes collection. No Dota restart/repatch is necessary.

## Checks

```powershell
python -B tests/dev_logs.py
Get-Content "$env:USERPROFILE\ShowMMRDevLogs\status.json"
```

The regression check uses temporary files and a temporary collector subprocess;
it never changes Dota logs or real bindings. Actual sign-in launch needs a later
sign-out/sign-in test; the installer does not sign you out to test it.
