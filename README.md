# Show MMR for Minify

Minify-native port of AveYo's Dota 2 ShowMMR dashboard mod.

The mod stores local ranked MMR history and shows known `MMR (change)` values in
the Dota profile match-history list. It also replaces the last-match win/loss
badge with the MMR change when that match is known.

## Requirements

- Dota 2
- Minify 1.13 or newer
- Dota 2 Workshop Tools installed, so Minify can compile Panorama JS/XML
- Dota launch option: `-language minify`

## Install

1. Download or clone this repo.
2. Copy `Minify/mods/Show MMR` into your Minify install:

   ```text
   C:\Users\<you>\Downloads\Minify-v1.13-windows\mods\Show MMR
   ```

3. Open Minify.
4. Open `Select Mods` and enable `Show MMR`.
5. Click `Patch`.
6. Start Dota 2 with `-language minify`.

## How It Works

- Panorama reads the visible ranked MMR value from your local profile page.
- VScript stores recent ranked MMR history in Dota's local controller slot 3
  keybind file, using the original ShowMMR storage trick.
- `JOY32` is reserved for a pending snapshot, so the mod can remember the last
  known MMR when Dota leaves the dashboard and attach it to the newest ranked
  row after postgame/history loads.
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

The VScript loader reads the same data from Dota's game cfg search path:

```text
<dota 2 beta>\game\dota\cfg\user_keys_<account_id>_slot3.vcfg
```

For the current test account, that file was seeded from Steam userdata because
this Dota build did not expose `cfg/user_keys_<account_id>_slot3.vcfg` until it
existed in the game cfg folder.

## Usage

After a ranked match, open Dota normally, then open Profile -> History -> Match
History. Once the mod has stored data for a match, known ranked rows show values
like:

```text
6,000 (+25)
5,975 (-25)
```

Rows with no stored MMR history keep Dota's normal `Win` or `Loss` result text.

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

The pending marker uses `JOY32` and looks like:

```text
"JOY32" "showmmr_pending:7539:1783336560:8883733433:0"
```

Fields are `mmr:epoch:match_id:processed`. `processed` becomes `1` after the
profile history row is attached.

## Troubleshooting

- If the mod does not appear, confirm `Show MMR` is enabled in Minify and click
  `Patch` again.
- If Dota uses the normal language files, confirm launch option
  `-language minify`.
- If labels disappear after refreshing match history, patch again with this
  version; it keeps scanning while the profile page exists.
- If no rows change, the mod probably has no stored history for those matches.
  Open Profile -> History -> Match History once so the profile scanner can bind
  the current MMR to the newest ranked row.
- If logs load an old `cfg/user_keys_<account_id>_slot3.vcfg` and history is
  stale after restart, copy the Steam userdata `user_keys_0_slot3.vcfg` file to
  Dota's `game\dota\cfg\user_keys_<account_id>_slot3.vcfg`, then restart Dota.
- For live debugging, Dota's console log should contain lines starting with
  `[ShowMMR] base:`, `[ShowMMR] pregame:`, `[ShowMMR] postgame:`,
  `[ShowMMR] profile:`, and `[ShowMMR] refresh`.
- If Dota changes private dashboard XML, profile selectors, or
  `dota_game_account_client_debug`, the mod may need another update.

## Attribution

Original project: https://github.com/AveYo/ShowMMR

Minify: https://github.com/Egezenn/dota2-minify

ShowMMR code is distributed under the MIT license. See `LICENSE`.
