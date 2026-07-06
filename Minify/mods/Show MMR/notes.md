<!-- LANG:EN -->
Show MMR is a Minify port of AveYo's ShowMMR dashboard mod.

- Reads the visible ranked MMR value from the local profile stats page.
- Stores recent ranked MMR history locally in controller slot 3 bindings.
- Shows stored `MMR (change)` values in the profile recent-games list.
- Replaces the last-match win/loss badge with the MMR change when history is known.

!!: Requires Dota 2 Workshop Tools in Minify because this mod patches Panorama XML and compiles Panorama JavaScript.
!!: Valve can change private dashboard panels, events, or console output at any time. If MMR cannot be read, the mod will simply leave the normal UI alone.
!!: Use at your own risk. This is a client dashboard/UI mod and does not touch gameplay logic.

Original project: https://github.com/AveYo/ShowMMR
Minify target format: https://github.com/Egezenn/dota2-minify
