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

The VScript loader reads the same data from Dota's account-specific game cfg
search path:

```text
<dota 2 beta>\game\dota\cfg\user_keys_<account_id>_slot3.vcfg
```

The mod also accepts `cfg/user_keys_0_slot3.vcfg` when it contains a
same-account `showmmr_pending_v2` marker written by this mod. Unmarked shared
slot files are ignored so another account's MMR history cannot leak into a
fresh account.

## Binding Storage Findings

The current mod uses Dota's local `user_keys_*_slot3.vcfg` controller bindings
as a small persistent key-value store:

- `JOY1` through `JOY31` store ranked MMR history.
- `JOY32` stores the pending baseline marker.
- Each history page currently stores up to 20 match records.
- Current capacity is about `31 * 20 = 620` match records, plus one pending
  marker.

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

## Shared Storage Design Notes

If this becomes a Minify upstream feature, Minify should own allocation instead
of letting each mod claim random keys.

Example mod manifest:

```json
{
  "storage": {
    "id": "show_mmr",
    "pages": 24,
    "codec": "vlq-delta-v1"
  }
}
```

Example physical layout:

```text
slot3 JOY32 = "MS1:acct=161969812;show_mmr=s1:1-24;probe=s1:25-28;crc=ab12"
slot1 JOY1  = "MS1:show_mmr:01:crc:<payload>"
slot1 JOY2  = "MS1:show_mmr:02:crc:<payload>"
```

Rules for a shared binding-backed store:

- Minify owns page allocation.
- Every mod gets a stable namespace/id.
- Mods never write unallocated binding cells.
- Every page includes storage version, mod id, page number, and checksum.
- Unknown mod pages are ignored, not deleted.
- If the directory corrupts, pages should still be scannable by prefix.

This is still Dota runtime storage. Minify can generate helpers and allocate
pages at patch time, but runtime writes still need an in-Dota writable channel
such as `bindss` plus `writekeybindings`.

## Compression Notes

The current readable format stores repeated absolute timestamps and MMR values.
A compact Show MMR codec can store the same data as deltas:

- Store the first timestamp once.
- Store the first MMR once.
- Store later match times as deltas from the previous match.
- Store MMR changes as signed small integers.
- Add a full MMR checkpoint every 16 or 32 records.
- Encode integers with a small base64url/varint alphabet.

Conceptual data:

```text
t0=1783404065,m0=7657 | dt,chg | dt,chg | dt,chg
```

Actual compact page shape:

```text
MS1:show_mmr:01:k9F:T7q3aFQfB0az9Lx2_mP...
```

Capacity estimates, assuming conservative bind values around 450-500
characters:

- Current readable slot3-only storage: about 620 records.
- Compressed slot3-only storage: about 1,500-2,500 records.
- Compressed slot1-slot3 storage: about 4,500-7,000 records.
- More may be possible, but should not be promised without stress-testing Dota
  bind string truncation and `LoadKeyValues` behavior.

The practical target for a shared storage layer should be about 5,000 records
per account before requiring external tooling or a different persistence
channel.

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
"JOY32" "showmmr_pending_v2:1665041461:7539:1783336560:8883733433:0"
```

Fields are `account_id:mmr:epoch:match_id:processed`. `processed` becomes `1`
after the profile history row is attached.

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
- `Script failed to LoadKeyValues cfg/user_keys_<account_id>_slot3.vcfg` is
  normal on a fresh account before any ShowMMR history exists.
- If logs say `ignore shared bindings`, the shared slot belongs to another
  account or an older unmarked build; play one game with this build active or
  seed the account-specific file manually.
- For live debugging, Dota's console log should contain lines starting with
  `[ShowMMR] base:`, `[ShowMMR] pregame:`, `[ShowMMR] postgame:`,
  `[ShowMMR] profile:`, and `[ShowMMR] refresh`.
- If Dota changes private dashboard XML, profile selectors, or
  `dota_game_account_client_debug`, the mod may need another update.

## Attribution

Original project: https://github.com/AveYo/ShowMMR

Minify: https://github.com/Egezenn/dota2-minify

ShowMMR code is distributed under the MIT license. See `LICENSE`.
