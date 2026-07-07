<!-- LANG:EN -->
Show MMR is a Minify port of AveYo's ShowMMR dashboard mod.

- Reads the visible ranked MMR value from the local profile stats page.
- Stores a pending baseline in `JOY32` when Dota leaves dashboard/pregame/postgame is seen.
- Stores recent ranked MMR history locally in controller slot 3 bindings, prefixed as `showmmr_history:`.
- Loads history from `game/dota/cfg/user_keys_<account_id>_slot3.vcfg` with a same-account `user_keys_0_slot3.vcfg` fallback, skipping empty binding files.
- Shows stored `MMR (change)` values in the profile recent-games list.
- Replaces the last-match win/loss badge with the MMR change when history is known.
- Logs every injected view with `[ShowMMR] base:`, `pregame:`, `postgame:`, `profile:`, or `last_match:`.

Storage notes:

- Current storage uses `slot3` `JOY1`-`JOY31` for history and `JOY32` for pending state.
- Older raw history pages are still readable, but new writes use `showmmr_history:` so Dota does not see a binding value that starts with a number.
- Current readable format stores about 620 match records.
- Local inspection showed `slot1` and `slot2` are usually empty, while `slot0` contains real user binds and should not be used for mod storage.
- A future Minify-level storage helper could allocate `JOY1`-`JOY32` pages across slots 1-3, namespace pages per mod, and add checksums.
- A compact delta/varint codec could conservatively raise Show MMR capacity to about 1,500-2,500 records on slot3 only, or about 4,500-7,000 records using slots 1-3.

!!: Requires Dota 2 Workshop Tools in Minify because this mod patches Panorama XML and compiles Panorama JavaScript.
!!: Valve can change private dashboard panels, events, or console output at any time. If MMR cannot be read, the mod will simply leave the normal UI alone.
!!: Use at your own risk. This is a client dashboard/UI mod and does not touch gameplay logic.

Original project: https://github.com/AveYo/ShowMMR
Minify target format: https://github.com/Egezenn/dota2-minify
