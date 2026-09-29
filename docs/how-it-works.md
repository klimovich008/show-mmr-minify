# How Show MMR works

- Panorama reads the visible ranked MMR value from your local profile page.
- VScript stores recent ranked MMR history in Dota's local controller slot 3
  keybind file, using the original ShowMMR storage trick.
- Opening the local profile match-history page while idle saves current MMR and
  the latest completed ranked epoch as a separate pending baseline. It does not
  invent a result for the historical row used as the anchor.
- Capture requires your visible local profile, a loaded account snapshot, and
  stable ranked rows/MMR for three seconds. Lua validates the capture and computes
  the delta; existing observations cannot be overwritten by later UI refreshes.
- For a consecutive result, unchanged MMR or an available reconnect leaves pending intact.
  A win/loss result that conflicts with the MMR change also leaves pending intact.
  After a forward history gap, a stable completed/calibrated observation advances
  only the baseline, even if net MMR is unchanged. Missing results stay unknown;
  the next consecutive game can be recorded normally. Existing history-gap locks
  recover this way, but calibration and conflicting-match locks are retained.
- Opening history is not a save acknowledgement. Interrupted automatic captures
  retry with a five-second minimum interval, up to three attempts per request.
  A fresh idle/queue transition, rating update, or manual refresh re-arms capture.
- After returning from a game, history that still ends at the saved baseline row
  with unchanged MMR means Dota has not published the result yet; it is not
  treated as an acknowledgement. Post-game capture gets three more attempts,
  backing off 15, 30, and 60 seconds. A newer unranked row shows history has caught up.
  When Dota's last-match panel shows an unrecorded match newer than the
  baseline, capture is re-armed once for that match.
  A matching complete save snapshot is acknowledged immediately, without another
  three-second wait. Empty views retry after eight seconds; active stabilization
  and in-flight saves retain the longer timeout. Snapshot acknowledgement is not
  independent verification that the binding file has flushed to disk.
- The profile match-history page is scanned while it is open, so if Dota reloads
  the rows the MMR labels are applied again.
- Normal matches without known stored MMR data stay unchanged.
- Console logging is intentionally verbose while this port is being stabilized:
  search `console.log` for `[ShowMMR]`.

The local storage file Dota writes is account-specific and lives under Steam
userdata:

```text
C:\Program Files (x86)\Steam\userdata\<steam_user_id>\570\local\cfg\user_keys_0_slot3.vcfg
```

Minify's patch hook supplies its actual Steam installation path to the runtime.
The loader checks that userdata path first, then falls back to Dota's game cfg
paths. Absolute `LoadKeyValues` support is an engine dependency, not a portable
file-I/O guarantee. The default path above is used only if the generated path
file is unavailable.

The VScript loader reads the same data from Dota's account-specific game cfg
search path:

```text
<dota 2 beta>\game\dota\cfg\user_keys_<account_id>_slot3.vcfg
```

The mod also accepts `cfg/user_keys_0_slot3.vcfg` when `JOY32` contains the
same-account `showmmr_user:<account_id>` marker written by this mod. Unmarked
shared slot files are ignored so another account's MMR history cannot leak into
a fresh account.

## Binding Storage Findings

The current mod uses Dota's local `user_keys_*_slot3.vcfg` controller bindings
as a small persistent key-value store:

- `JOY1` through `JOY30` store ranked MMR history; `JOY31` stores the settings toggles.
- `JOY32` stores the account marker and versioned pending baseline.
- Each history page stores at most 20 records and at most 500 characters.
- Only the newest 100 matches are kept (about five pages). Files from older builds that used `JOY31` for history still load.
  Oldest records are dropped from both memory and serialized history on overflow.
- A malformed loaded page, conflicting account marker, or occupied non-mod
  binding blocks writing. It is not automatically cleared or repaired.

A stored history record currently looks like:

```text
1783404065:[7657,38]
```

That format is intentionally readable and conservative, but not space optimal.

Local inspection showed Dota creates these user key files:

```text
user_keys_0_slot0.vcfg
user_keys_0_slot1.vcfg
user_keys_0_slot2.vcfg
user_keys_0_slot3.vcfg
```

On the tested machine:

- `slot0` contains real user binds, such as `toggleconsole`, so it should be
  treated as off-limits.
- `slot1` and `slot2` were empty across sampled accounts.
- `slot3` was empty except for this mod's storage.

So a future shared Minify storage layer could conservatively use `slot1`,
`slot2`, and `slot3`, while avoiding `slot0`. With `JOY1` through `JOY32` in
three slots, this gives 96 possible binding cells. Reserving one cell for a
directory leaves about 95 data pages.

Candidate binding names seen in Dota key files include keyboard keys, mouse
buttons, gamepad buttons, analog axes, and joystick keys. For storage,
`JOY1` through `JOY32` are the least invasive because keyboard, mouse, and
gamepad names can collide with real player controls.

## Manual Test Seed

For debugging without waiting for a new ranked result, you can seed local data
manually. Close Dota first, then edit:

```text
C:\Program Files (x86)\Steam\userdata\<steam_user_id>\570\local\cfg\user_keys_0_slot3.vcfg
```

Example:

```text
"config"
{
	"bindings"
	{
		"JOY1" "1700000000:[6000,25],1699996400:[5975,-25]"
	}
}
```

The key is the match timestamp epoch. The value is `[mmr,change]`. Start Dota,
open your profile match history, and matching ranked rows should show the seeded
MMR values.

The account marker uses `JOY32` and looks like:

```text
"JOY32" "showmmr_user:1665041461"
```
