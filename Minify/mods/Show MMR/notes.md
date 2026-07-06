<!-- LANG:EN -->
Show MMR is a Minify port of AveYo's ShowMMR dashboard mod.

- Reads the visible ranked MMR value from the local profile stats page.
- Stores a pending baseline in `JOY32` when Dota leaves dashboard/pregame/postgame is seen.
- Stores recent ranked MMR history locally in controller slot 3 bindings.
- Loads history from `game/dota/cfg/user_keys_<account_id>_slot3.vcfg` with a `user_keys_0_slot3.vcfg` fallback.
- Shows stored `MMR (change)` values in the profile recent-games list.
- Replaces the last-match win/loss badge with the MMR change when history is known.
- Logs every injected view with `[ShowMMR] base:`, `pregame:`, `postgame:`, `profile:`, or `last_match:`.

!!: Requires Dota 2 Workshop Tools in Minify because this mod patches Panorama XML and compiles Panorama JavaScript.
!!: Valve can change private dashboard panels, events, or console output at any time. If MMR cannot be read, the mod will simply leave the normal UI alone.
!!: Use at your own risk. This is a client dashboard/UI mod and does not touch gameplay logic.

Original project: https://github.com/AveYo/ShowMMR
Minify target format: https://github.com/Egezenn/dota2-minify
