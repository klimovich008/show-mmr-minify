# Pending Baseline Work In Progress

This branch is not ready to release. Panorama now consumes pending snapshots,
seeds a pre-match baseline, and reconciles completed history observations through
the Lua state machine. Offline cross-language checks pass. Baseline save and clean
restart restoration passed live on one calibrated account; real ranked completion,
early-leave recovery, and the before-start match-ID path remain unfinished.

## Implemented Contract

- JOY1-JOY31 remain the existing history pages. No capacity reduction or new slots.
- JOY32 accepts the legacy account marker or the following versioned marker:
  `showmmr_user:USER:p1:PHASE:MMR:AT:PREVIOUS:MATCH_ID:STARTED:REASON`.
- PHASE: 1 baseline ready, 2 identified active match, 3 uncertain (retain evidence).
- AT: Unix seconds when MMR was observed before the target match.
- PREVIOUS: most recent completed ranked epoch at baseline capture, or 0 if none.
- MATCH_ID: decimal uint64 string, 0 if start identity has not been observed.
- STARTED: time the before-start observation was received, or 0 without an ID.
- REASON: 0 normal, 1 nonconsecutive history, 2 conflicting match/record,
  3 calibration/rating change without corresponding history.
- Unknown/malformed markers or wrong ownership block writing. A parsed empty
  primary config is authoritative even without a bindings section.

`ShowMMR_Baseline` requires user, idle=1, calibrated=1, mmr, at, previous.
It persists only JOY32 plus the existing writekeybindings command. Repeated
observations do not refresh the baseline timestamp. Pending active or uncertain
evidence cannot be overwritten by reopening the profile.

`ShowMMR_Begin` requires user, before_start=1, match_id, at. It adds identity
without reading post-start MMR. Repeated same-match notifications are no-ops;
a second distinct match retains the first baseline as uncertain.

When pending exists, `ShowMMR_Refresh` reconciles only with idle=1, finished=1,
calibrated=1, outcome (1 win, -1 loss), mmr, time, previous, at, and a matching
match_id if one was saved. Missing or sign-conflicting outcomes retain pending
without writing or marking it permanently uncertain, allowing a later coherent
observation to reconcile. This is a consistency check, not proof of GC freshness.
The target must occur after baseline capture and have the exact preceding ranked
epoch. If no start identity was captured, that temporal/adjacency evidence is the
fallback. Missing, unfinished, unchanged, duplicate, or mismatched data never
consumes the pending record. A successful result stores the computed delta and
advances the pending baseline for the next match. Explicit calibrated=0 preserves
pending evidence as uncertain; mere absence of calibration data does not mutate it.

The three truth flags are assertions from the native-view adapter, not new Dota
APIs. The Lua code cannot independently prove the client match is over.
All events are account-checked, but this dashboard channel is not a security boundary
against arbitrary other local mods. Without pending, Refresh does nothing. The
old history-baseline fallback has been removed, so post-match observations cannot
invent an initial delta when pre-match MMR was never saved.

Panorama requires the native MMRCalibrated state, LocalUser/PageVisible, complete
ranked rows, and a three-second stable observation. Idle requires a DOTAPlay
panel in PlayButtonStartsSearching/FindingMatch or its native localized Play Dota
button label (the side panel can be closed), with no in-game, connecting,
disconnect, abandon, safe-leave, or reconnect flags. A watcher requests profile
capture on initial readiness, queue entry, and return to idle; throttled requests
are retained for retry. It does not block accepting a match if capture is late.

Completion currently requires an exclusive Won/Lost row class, no Abandoned
class, a valid positive duration, and an elapsed timestamp + duration. These
native signal assumptions still need live confirmation. Scanner exceptions are
logged and rescheduled rather than permanently stopping capture.

The regular adapter currently has no proven per-row match ID and does not call
Begin. It uses the persisted timestamp/previous-ranked anchor fallback. An
already identified pending match is intentionally not reconciled without its
matching ID. Do not claim the exact-ID requirement is finished.

## Offline Checks

`python -B tests/storage.py` with Lupa exercises the actual Lua code, including
simulated disk-marker reload, nonzero win/loss deltas, zero/no-final/connected
guards, duplicate events, uint64 identity, conflicts, calibration, and empty cfg
precedence. `tests/cleanup.ps1` checks recognition without executing cleanup.
`python -B tests/flow.py` runs actual Panorama payloads through actual Lua,
reconstructs a saved marker from queued commands, simulates restart, and verifies
early-leave/reconnect, completion, unchanged MMR, single-match delta, reload, and gap behavior.

These automated checks are not filesystem durability tests. Command submission
and net-table acknowledgement do not prove that Dota flushed bindings to disk.

The offline reload regression also covers two different snapshots sharing one
account/revision pair, as can happen when the Lua revision counter restarts.
The loader validates every page before comparing normalized snapshot contents.
Missing headers/pages invalidate readiness and the capture stability window;
changed contents reset observation/submission state even when the revision is
unchanged. Identical complete snapshots preserve stability without rebuilding
overlays. This cache fix was deployed on September 6 after live testing resumed.
It does not establish an engine session identity or prove cross-generation
page/header ordering in Dota.

## Live Check: September 5, 2026

Minify v1.14rc6 compiled the development build with 10 successes and zero failures.
On a calibrated account, the profile adapter captured a genuine 7811 MMR baseline.
JOY32 was inspected on disk after the write, after clean shutdown, and after
relaunch; the marker and original capture timestamp were unchanged, and the Lua
loader published the restored pending baseline. No existing bindings were cleared.

This also exposed a guard bug: PlayButtonStartsSearching is absent when the side
panel is closed. Exact localized native Play Dota button text now provides the
closed-panel idle signal; reconnect and ready-up flags still override it.
After repatching, live logs confirmed automatic profile capture with the Play side
panel closed and the unchanged baseline restored through a second clean restart.
The dashboard runtime has no Game.GetMatchID or GameInterfaceAPI.ConsoleCommand
method. Baseline persistence is verified, but native identity and ranked-match
early-leave reconciliation still need separate live validation.

## Next Integration Work

### Native Transport Evidence (September 5)

A read-only probe reaches dashboard Lua while idle, stops being acknowledged
during a local solo-practice connection, and reaches it again after disconnect.
The loading sidebar exposes MatchID 0 in that local practice session. This is
not a ranked-match ID test and does not rule out a direct client-side writer.
The persisted 7811 baseline was unchanged before, during, and after this test.

The running client's `cl_panorama_script_help_2` lists
`Game.CreateCustomKeyBind(key, command)`, `Game.AddCommand(...)`,
`Game.ServerCmd(message)`, `GameUI.SavePersistentEventGameData(value)`, and
`GameUI.LoadPersistentEventGameData(...)`. None has been verified here as a
durable, account-scoped in-game storage writer. In particular, the keybind API
does not document split-screen slot selection, and event-game storage may belong
to Valve's event rather than this mod. Do not invoke either writer against user
data without establishing ownership and a reversible isolated test.

Read-only disassembly subsequently narrowed these candidates on client.dll SHA256
`D83771B4F61C2B7D882A0FCFC06F83B8D59B11AF6F3AFD4A1F85D68A449CAD78`:

- `CreateCustomKeyBind`, RVA `0x1ef5290`, calls `0x21c09f0`, then `0x21c3ba0`
  with input-map index 1. This updates a Panorama input table. The latter routine's
  DeveloperKeys persistence branch requires index 0, so this caller skips it.
  It is not a direct `bindss`/`user_keys` writer. No real binding was changed to
  reach this conclusion.
- Event-game save/load, RVAs `0x1f5fe40` / `0x1f48c80`, use the fixed filename
  `custom_eventgamedata.txt` and `GAME` path ID. Both require guard `0x15fa110`,
  which accepts mode 19 or conditional mode 15 with an EventGame tag, matching the
  published event/custom mode constants. Ordinary ranked modes do not pass this
  branch. No account-specific filename or mod namespace is supplied by the APIs.
  Do not use this fixed file as general mod storage or overwrite existing content.
- Client Lua registers `SendToConsole`, but a usable automatic client Lua
  bootstrap is not yet proven. A one-time log before the existing `IsServer()`
  guard reports the VM context and available APIs. The client path still returns
  without any storage operations; its no-write regression passes. The diagnostic
  was deployed on September 6; the live observations are recorded below.

The `Console` logging channel was `ConsoleOnly`, excluding this API output from
`console.log`. Temporarily removing that flag captured the dump; the original
flag was restored afterwards. Ordinary ShowMMR Panorama/VScript logs were
already captured. An on-screen diagnostic message alone is not evidence that
the diagnostic was written to disk either.

### Resumed Live Check (September 6)

Minify v1.14rc6 compiled 16 files with zero failures, including the snapshot-cache
fix and Lua-context diagnostic. A calibrated account restored six saved ranked
records and a 7775 MMR phase-1 baseline from disk. The actual history view showed
all six deltas, newest 7775 (-21). Earlier session logs contain corresponding
reconciliation events. The user cannot remember whether any were early leaves,
so these observations do not verify the early-leave scenario.

Local solo practice repeated the event transport failure: probes logged while
connected without dashboard acknowledgement, then acknowledgements resumed after
disconnect. The new entry diagnostic reported only server=true at dashboard
startup, practice initialization, and dashboard restoration. SendToConsole was
registered in those server contexts; no automatic client invocation was observed.
The in-game console listed cl_script_* commands as cheat-protected and rejected
cl_script_help without cheats. This does not establish a ranked-compatible client
bootstrap. No cheats, new binding writer, or companion were enabled.

The full account slot3 file was byte-for-byte identical to its pre-test backup
after local practice and after clean shutdown. A second launch restored the same
six records and baseline; all 104 backed-up user_keys files across accounts had
unchanged hashes. This verifies preservation, not an in-match write or runtime
account switching. Logs and backups are retained in the local scratch workspace's
live-resume-20260906-014501 directory, not committed to the repository.

Remote spectator follow-up: watching a public live game at 01:55:03-01:56:11
also produced no client-Lua entry diagnostic or dashboard probe acknowledgement
while connected. The native connection log identified spectated match 8984866243,
but the loading-sidebar probe reported match_id=0 and PreGame reported an empty
ID. Therefore neither label is sufficient proof of the current match identity,
and a spectator observation must not become this account's pending ranked match.
Dashboard acknowledgements returned at 01:56:14 after disconnect; slot3 remained
byte-for-byte identical to the backup. console-remote-spectator.log preserves the
test. This narrows the tested remote behavior, but does not substitute for a
ranked participant or controlled early-leave test.

### Remaining Gates

September 6 evening capture fix: hidden cached profile scanners previously cleared
the shared DashboardCore candidate unconditionally. An offline regression that
alternates a visible local capture with a hidden profile scanner reproduced an
indefinite stability reset and no submission. Candidates now include their owning
panel; profile-local invalidation only clears that panel's candidate. A replacement
panel starts a fresh stability window; dashboard/account invalidation still applies
globally. Regression covers hidden/failed foreign scanners and hiding the owner.
Capture guards and refresh timeouts now log their reason and candidate age.
This is consistent with the missed-game timeouts, but older logs lack the panel
identity/guard evidence needed to prove that this was their specific cause.
No changes to binding serialization, zero-change suppression, or the helper dependency.

An optional development-only collector is now available; see
[its operating guide](../scripts/DEV_LOGS.md). It archives raw Dota/Minify logs
at Windows sign-in for debugging. The mod does not read its files. It is not a
match-ID transport or runtime dependency, and does not close any gate below.

The native Hotkeys settings screen was also inspected without opening or changing
a binding. Its loaded Panorama API dump exposed settings enum/checkbox/slider
controls but no keybinder script setter. The reconstructed keybinder layouts use
parameterless confirm/clear events, not a demonstrated arbitrary payload/slot API.
No control was invoked to write or clear a binding. This investigation has not
established another in-match writer; it does not prove all native routes impossible.

1. Establish the before-start identity path without depending on a custom game
   event reaching dashboard Lua while connected to a remote ranked server.
2. Verify the idle/calibration/queue states above in the actual client. A user can
   still enter a match before a fresh readable baseline is available; no rating
   should be invented for that case.
3. Establish completion separately from merely opening history or disconnecting.
   An abandoned row is not by itself proof the match has finished.
4. Verify native timestamp semantics and row identity, complete ranked adjacency,
   and calibration transitions before release.
5. Baseline disk save and clean restart passed on one calibrated account. Validate
   real ranked completion/early-leave and account isolation next; do not join ranked
   games or switch accounts on the user's behalf.

The `klimovich008/dota-lobby-player-probe` repo has guarded
Game.GetMatchID/Game.GetGameWinner observations, but an external log-reading app
persists them. It is not evidence that a ranked-server custom event reaches the
dashboard Lua writer. Do not reuse its higher-kill-count winner heuristic: kills
do not determine Dota's winner. No files in that repo were changed.

No automatic repair of uncertain pending state is provided yet. Do not clear it
or infer individual deltas across a gap. Repeated known-good evidence or an explicit
user-directed recovery path needs to be designed before release.
