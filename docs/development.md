# Development

## Tests

```text
node tests/panorama.js
python -m pip install lupa defusedxml
python -B tests/flow.py
python -B tests/settings.py
python -B tests/dev_logs.py
```

These run the actual Panorama scripts with mocked UI APIs and the actual storage
script in Lua 5.1. They do not launch Dota or modify real bindings. In-game
capture and clean-restart persistence still require an end-to-end game check.

The cleanup script supports `-WhatIf`, refuses real cleanup while Dota runs,
and backs up to a unique directory in the system temporary folder. Running it
is not part of installation or upgrade.

`tests/cleanup.ps1` checks which binding values `tools/clear_show_mmr_data.ps1`
recognizes, without running it.

## Logs

Dota's `console.log` holds every `[ShowMMR]` line. The
[optional local log collector](dev-logs.md) archives full Dota/Minify logs across
restarts. It is separate from the mod: no bindings are changed and the mod never
reads its files.

## Dota+ Battle Stats probe

The development build includes a read-only Dota+ Battle Stats probe. It samples
the first three loaded match rows and their column headings into console logs,
without attaching unverified rows to account storage or writing bindings.
Automatic historical import is not implemented. Match identity, account ownership,
column semantics, and history completeness must be verified before backfilling.
Live testing confirmed that Rank Change, Match ID, and Ranked labels are readable.
Battle Stats does not set the regular profile's `LocalUser` flag on the tested
account, and panel order is not visible date order; neither can be used to assign
historical records safely.

## Open questions

See [open-questions.md](open-questions.md) for capture cases that still need live proof.
