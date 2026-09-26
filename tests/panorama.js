// Run with: node tests/panorama.js. No Dota process or real bindings are touched.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const scripts = path.join(__dirname, '../Minify/mods/Show MMR/files_uncompiled/panorama/scripts');
let now = 1783409000000, local = true, mmr = '6,025', calibration = 'MMRCalibrated';
const data = {UIState: 3}, tables = {}, sent = [], scheduled = [], events = [], names = [];
const playClasses = new Set(['PlayButtonStartsSearching']), dashboardClasses = new Set();
const core = {Data: {ShowMMR: data}};
const root = {
    paneltype: 'DOTAProfileHeroStatsPage', visible: true,
    BHasClass: name => name === 'PageVisible' || name === calibration || (name === 'LocalUser' && local),
    FindAncestor: name => name === 'DashboardCore' ? core : null,
    GetParent: () => null,
    FindChildTraverse: id => id === 'MMRNumber' ? {text: mmr, BHasClass: () => false, GetParent: () => root} : null,
};
const play = {paneltype: 'DOTAPlay', BHasClass: name => playClasses.has(name)};
const dashboard = {FindChildInLayoutFile: () => core, FindChildTraverse: () => play,
    BHasClass: name => dashboardClasses.has(name)};
const $ = id => id === '#Dashboard' ? dashboard : null;
Object.assign($, {
    Msg() {}, GetContextPanel: () => root,
    Schedule: (delay, callback) => scheduled.push(callback),
    DispatchEvent: name => events.push(name), RegisterForUnhandledEvent() {},
    Localize: (text, panel) => text === '{i:showmmr}' ? String(panel.mmr) : text,
});
const context = vm.createContext({$, Date: class extends Date { static now() { return now; } },
    GameUI: {}, // Current Dota dashboard has no GetDotaGameUIState method.
    GameEvents: {SendCustomGameEventToServer: (name, payload) => { names.push(name); sent.push(payload); }},
    CustomNetTables: {GetTableValue: (_, key) => tables[key], SubscribeNetTableListener() {}},
});
for (const script of ['base', 'profile', 'last_match']) {
    vm.runInContext(fs.readFileSync(path.join(scripts, `show_mmr_${script}.js`), 'utf8'), context);
}
data.IsIdle = context.ShowMMR_IsIdle;
data.FinishCapture = success => context.ShowMMR_FinishCapture(data, success);
const snapshot = (revision, records, user = '123', pending = {phase: 0}) => {
    tables.page1 = {user, revision, records};
    tables.state = {user, revision, pages: Object.keys(records).length ? 1 : 0,
        count: Object.keys(records).length, blocked: 0, pending};
    context.ShowMMR_LoadHistory(data);
};

// Reuse this minimal Panorama environment for the Lua/JS round-trip check.
exports.step = input => {
    now = input.now * 1000;
    mmr = input.mmr;
    local = input.local !== false;
    calibration = input.calibration || 'MMRCalibrated';
    playClasses.clear();
    for (const name of input.playClasses || ['PlayButtonStartsSearching']) playClasses.add(name);
    for (const key of Object.keys(tables)) delete tables[key];
    Object.assign(tables, input.tables);
    context.ShowMMR_LoadHistory(data);
    const row = {...input.row, isRanked: true};
    const entry = {BHasClass: name => (input.row.classes || ['Won']).includes(name)};
    row.finished = context.ShowMMR_ProfileFinished(entry, input.row.duration || '30:00', row.epoch);
    row.outcome = context.ShowMMR_ProfileOutcome(entry);
    const start = sent.length;
    context.ShowMMR_ProfileAttachNewest(data, row, root, input.previous);
    const getContext = $.GetContextPanel;
    const running = context.ShowMMR_ProfileScannerRunning;
    try {
        $.GetContextPanel = () => ({...root, visible: false});
        context.ShowMMR_ProfileScannerRunning = true;
        context.ShowMMR_ProfileScanRows();
    } finally {
        $.GetContextPanel = getContext;
        context.ShowMMR_ProfileScannerRunning = running;
    }
    return sent.slice(start).map((payload, index) => ({name: names[start + index], payload}));
};

if (require.main === module) {
const originalLocalize = $.Localize;
$.Localize = (_, panel) => panel.idText;
for (const id of ['8883733433', '18446744073709551615']) {
    assert.equal(context.ShowMMR_ProfileMatchID({idText: id}), id);
}
for (const id of ['{s:match_id}', '', '0', '000123', '8,883,733,433', '1e10', '18446744073709551616']) {
    assert.equal(context.ShowMMR_ProfileMatchID({idText: id}), null);
}
$.Localize = originalLocalize;
playClasses.clear();
assert.equal(context.ShowMMR_IsIdle(), false, 'unresolved labels cannot establish idle');
$.Localize = text => text === '#dota_play' || text === '{s:play_button_label}' ? 'Jouer a Dota' : originalLocalize(text);
assert.equal(context.ShowMMR_IsIdle(), true, 'closed play panel uses the localized native idle label');
for (const active of ['CanReconnect', 'CanDisconnect', 'CanAbandonGame', 'CanSafeLeaveGame', 'Connecting', 'InReadyUp', 'ReturningToQueue', 'FindMsgInFlight', 'LobbyVisible']) {
    playClasses.add(active);
    assert.equal(context.ShowMMR_IsIdle(), false, active + ' must override a stale idle label');
    playClasses.delete(active);
}
$.Localize = originalLocalize;
playClasses.add('PlayButtonStartsSearching');
snapshot(1, {' 1783404000': {'1': 6000, '2': 25}}, '789',
    {phase: 1, mmr: 6000, at: 1783405000, previous: 1783404000, match_id: '0', started: 0, reason: 0});
data.Candidate = {signature: 'before Lua reload', since: 1783405001};
snapshot(1, {' 1783406000': {'1': 6025, '2': 25}}, '789',
    {phase: 3, mmr: 6025, at: 1783407000, previous: 1783406000, match_id: '0', started: 0, reason: 1});
assert.equal(data.history[1783406000]?.[0], 6025, 'reused Lua revision must not hide a changed snapshot');
assert.equal(data.history[1783404000], undefined);
assert.equal(data.pending.phase, 3);
assert.equal(data.Candidate, null, 'new pending evidence must restart the observation window');
const sameCandidate = data.Candidate = {signature: 'stable snapshot'};
const overlayEvents = events.length;
context.ShowMMR_AccountUpdated();
assert.equal(data.Candidate, sameCandidate, 'identical complete snapshots preserve stability');
assert.equal(events.length, overlayEvents, 'identical snapshots do not rebuild overlays');
const currentPage = tables.page1;
delete tables.page1;
context.ShowMMR_AccountUpdated();
assert.equal(data.historyReady, false, 'cached revision cannot conceal a missing page');
assert.equal(data.Candidate, null);
tables.page1 = currentPage;
context.ShowMMR_AccountUpdated();
assert.equal(data.historyReady, true, 'same complete snapshot can recover after a missing page');
const currentHeader = tables.state;
delete tables.state;
context.ShowMMR_AccountUpdated();
assert.equal(data.historyReady, false, 'missing header invalidates old readiness');
tables.state = currentHeader;
context.ShowMMR_AccountUpdated();
assert.equal(data.historyReady, true);
snapshot(1, {});
assert.equal(data.historyReady, true, 'empty storage must be ready before seeding');
snapshot(2, {' 1783404000': {'1': 6000, '2': 25}});
snapshot(3, {' 1783404000': {'1': 6000, '2': 25}, ' 1783405000': {'1': 6025, '2': 25}});
context.ShowMMR_AccountUpdated();
assert.equal(data.history[1783405000][1], 25, 'account refresh must retain new saves');
tables.state = {...tables.state, revision: 4};
context.ShowMMR_LoadHistory(data);
assert.equal(data.historyReady, false, 'partial snapshots cannot be used to capture');
assert.equal(data.history[1783405000][1], 25);
snapshot(4, {}, '456');
assert.equal(Object.keys(data.history).length, 0, 'account switch must not merge histories');

const row = {isRanked: true, epoch: 1783406000, finished: true, outcome: 1};
context.ShowMMR_ProfileAttachNewest(data, row, root, 1783405000);
assert.equal(sent.length, 0, 'wait for stable rows/MMR');
now += 4000;
context.ShowMMR_ProfileAttachNewest(data, row, root, 1783405000);
assert.equal(sent.length, 1);
assert.equal(sent[0].user, '456');
assert.equal(names[0], 'ShowMMR_Baseline');
assert.equal(sent[0].previous, row.epoch);
assert.equal(sent[0].idle, 1);
assert.equal(sent[0].calibrated, 1);
assert.equal(sent[0].time, undefined, 'seed pending baseline, not a fictitious historical result');
assert.equal('change' in sent[0], false, 'Lua computes delta');
snapshot(5, {}, '456', {phase: 1, mmr: 6025, previous: row.epoch, at: 1783409004, match_id: '0', started: 0, reason: 0});
row.epoch = 1783410000;
now += 20000;
context.ShowMMR_ProfileAttachNewest(data, row, root, 1783406000);
now += 4000;
context.ShowMMR_ProfileAttachNewest(data, row, root, 1783406000);
assert.equal(sent.length, 1, 'unchanged MMR must not be written');
mmr = '6,050';
now = 1783415000000;
playClasses.add('CanReconnect');
context.ShowMMR_ProfileAttachNewest(data, row, root, 1783406000);
assert.equal(sent.length, 1, 'disconnected with reconnect available is not idle');
playClasses.delete('CanReconnect');
context.ShowMMR_ProfileAttachNewest(data, row, root, 1783406000);
now += 4000;
context.ShowMMR_ProfileAttachNewest(data, row, root, 1783406000);
assert.equal(sent.length, 2);
assert.equal(names[1], 'ShowMMR_Refresh');
assert.equal(sent[1].finished, 1);
assert.equal(sent[1].outcome, 1);
assert.equal(sent[1].previous, 1783406000);
assert.equal('change' in sent[1], false);
// A second, cached profile keeps scanning while hidden. It must not reset the
// visible local profile's shared stability timer or suppress its next save.
data.Candidate = null;
data.LastSubmission = null;
const activeContext = $.GetContextPanel;
const hiddenProfile = {...root, visible: false};
context.ShowMMR_ProfileScannerRunning = true;
const writesBeforeHiddenProfile = sent.length;
for (let tick = 0; tick < 5; tick++) {
    now += 1000;
    $.GetContextPanel = activeContext;
    context.ShowMMR_ProfileAttachNewest(data, row, root, 1783406000);
    $.GetContextPanel = () => hiddenProfile;
    context.ShowMMR_ProfileScanRows();
}
$.GetContextPanel = activeContext;
assert.equal(sent.length, writesBeforeHiddenProfile + 1, 'hidden profile must not starve active capture');
const activeCandidate = data.Candidate;
assert.equal(activeCandidate.root, root);
context.ShowMMR_ProfileResetCandidate(data, hiddenProfile, 'foreign scanner failed');
assert.equal(data.Candidate, activeCandidate, 'another profile exception cannot invalidate this capture');
root.visible = false;
context.ShowMMR_ProfileScanRows();
assert.equal(data.Candidate, null, 'hiding the owning profile must invalidate its capture');
root.visible = true;
const replacementProfile = {...root};
data.Candidate = {...activeCandidate, since: Math.floor(now / 1000) - 10};
context.ShowMMR_ProfileAttachNewest(data, row, replacementProfile, 1783406000);
assert.equal(data.Candidate.root, replacementProfile);
assert.equal(data.Candidate.since, Math.floor(now / 1000), 'replacement profile needs a fresh stability window');
data.Candidate = null;
// Keep the existing assertion counts below independent of this extra save.
sent.splice(writesBeforeHiddenProfile);
names.splice(writesBeforeHiddenProfile);
local = false;
assert.equal(context.ShowMMR_ProfileReadMMR(root), -1);
context.ShowMMR_ProfileAttachNewest(data, row, root, 1783406000);
assert.equal(sent.length, 2, 'other profiles cannot capture');
local = true;
mmr = '#ranked_mmr_value';
assert.equal(context.ShowMMR_ProfileReadMMR(root), -1);
mmr = '6000 (+25)';
assert.equal(context.ShowMMR_ProfileReadMMR(root), -1);
mmr = '6,050'; context.ShowMMR_GameUIStateChanged(3, 2);
context.ShowMMR_ProfileAttachNewest(data, row, root, 1783406000);
assert.equal(sent.length, 2, 'outside-dashboard capture must not send');
context.ShowMMR_GameUIStateChanged(1, 3);
calibration = 'MMRCalibrating';
assert.equal(context.ShowMMR_ProfileReadMMR(root), -1, 'hidden stale numeric MMR is not calibrated');
calibration = 'MMRCalibrated';
const won = {BHasClass: name => name === 'Won'};
assert.equal(context.ShowMMR_ProfileOutcome(won), 1);
assert.equal(context.ShowMMR_ProfileOutcome({BHasClass: name => name === 'Lost'}), -1);
assert.equal(context.ShowMMR_ProfileOutcome({BHasClass: () => true}), 0);
assert.equal(context.ShowMMR_ProfileFinished(won, '30:00', 1783410000), true);
assert.equal(context.ShowMMR_ProfileFinished(won, '30:99', 1783410000), false);
assert.equal(context.ShowMMR_ProfileFinished(won, '30:00', Math.floor(now / 1000)), false);
assert.equal(context.ShowMMR_ProfileFinished({BHasClass: name => name === 'Won' || name === 'Abandoned'}, '30:00', 1783410000), false);

// Failed epoch parsing must retry and update the cache once dialog variables load.
const epochPanel = {SetDialogVariableTime() {}};
const localize = $.Localize;
$.Localize = text => text === '{T:d:timestamp}' ? '12:00:00' :
    text === '{T:timestamp}' ? 'resolved' : text.includes('|') ? 'resolved|x|x|x|x|x' : text;
const epoch = context.ShowMMR_ProfileEpoch(epochPanel, '07/07/2026', '', '', {epoch: 0});
assert.equal(epoch, Date.UTC(2026, 6, 7, 12) / 1000);
assert.equal(context.ShowMMR_LastEpoch(epochPanel, '07/07/2026', {epoch: 0}), epoch);
$.Localize = localize;
const label = {text: 'Win'};
const entry = {BHasClass: () => false, SetDialogVariableInt: (_, value) => { entry.mmr = value; }};
context.ShowMMR_ProfileApplyLabel(entry, label, data, {mmr: 6025, shift: 0});
assert.equal(label.text, '6025', 'baseline has no invented zero delta');
context.ShowMMR_ProfileApplyLabel(entry, label, data, {mmr: -1, shift: -1});
assert.equal(label.text, 'Win', 'reused unknown rows regain original labels');
context.ShowMMR_Refresh(true);
assert.equal(data.Refreshing, true);
now += 27000;
scheduled.splice(0).forEach(callback => callback());
assert.equal(data.Refreshing, false, 'missing layout cannot permanently lock refresh');
data.Candidate = {root, signature: 'stale'};
root.FindChildrenWithClassTraverse = () => { throw new Error('row replaced'); };
context.ShowMMR_ProfileScannerRunning = true;
const callbacksBefore = scheduled.length;
assert.doesNotThrow(() => context.ShowMMR_ProfileScanRows());
assert.equal(scheduled.length, callbacksBefore + 1, 'transient panel exception must not kill scanner');
assert.equal(data.Candidate, null, 'failed scan breaks the stability window');
root.FindChildrenWithClassTraverse = () => [];
assert.doesNotThrow(() => context.ShowMMR_ProfileScanRows());
assert.equal(context.ShowMMR_ProfileLastScanError, '');
const hasClass = play.BHasClass;
play.BHasClass = () => { throw new Error('play panel replaced'); };
data.Candidate = {signature: 'stale'};
const watchCallbacksBefore = scheduled.length;
assert.doesNotThrow(() => context.ShowMMR_WatchDashboard());
assert.equal(scheduled.length, watchCallbacksBefore + 1, 'watcher must retry native panel failures');
assert.equal(data.Candidate, null);
assert.equal(data.CaptureRequested, true, 'failed transition capture must retry');
play.BHasClass = hasClass;
assert.doesNotThrow(() => context.ShowMMR_WatchDashboard());
assert.equal(context.ShowMMR_WatchError, '');
data.options = {auto: false, show: false};
data.Refreshing = false;
data.LastRefreshAt = 0;
assert.equal(context.ShowMMR_Refresh(true), undefined, 'automatic capture toggle applies to forced scheduled refreshes');
assert.equal(context.ShowMMR_Refresh(true, true), true, 'manual refresh remains available');
label.text = '6025';
entry._showMMRResult = '6025';
entry._showMMROriginalResult = 'Win';
context.ShowMMR_ProfileApplyLabel(entry, label, data, {mmr: 6025, shift: 25});
assert.equal(label.text, 'Win', 'hidden overlay restores native result without deleting history');
vm.runInContext(fs.readFileSync(path.join(scripts, 'show_mmr_settings.js'), 'utf8'), context);
const controls = Object.fromEntries(['ShowMMRAccount', 'ShowMMRStatus', 'ShowMMRBaseline', 'ShowMMRPending', 'ShowMMRHistory', 'ShowMMRRefresh', 'ShowMMRShow', 'ShowMMRAuto', 'ShowMMRVerbose'].map(id => [id, {}]));
const settingsRoot = {id: 'ShowMMRSettingsSection', IsValid: () => true, FindChildTraverse: id => controls[id]};
const getContext = $.GetContextPanel;
$.GetContextPanel = () => settingsRoot;
context.ShowMMR_SettingsStart();
assert.equal(controls.ShowMMRShow.checked, false);
assert.equal(controls.ShowMMRAccount.text, 'Account: 456');
controls.ShowMMRShow.checked = true;
context.ShowMMR_SettingsChange('show', 'ShowMMRShow');
assert.equal(data.options.show, true);
const settingsCallbacks = scheduled.length;
settingsRoot.IsValid = () => false;
context.ShowMMR_SettingsUpdate(settingsRoot);
assert.equal(scheduled.length, settingsCallbacks, 'closed settings stop polling');
$.GetContextPanel = getContext;
vm.runInContext(fs.readFileSync(path.join(scripts, 'show_mmr_battle_stats.js'), 'utf8'), context);
const children = values => ({GetChildCount: () => values.length, GetChild: i => values[i]});
const battleHeader = children([{title: 'Date / Time'}, {title: 'Rank Change'}]);
const battleRow = children(['4/9/2026 23:32', '21'].map(text => ({FindChildTraverse: () => ({text})})));
const battleRoot = {IsValid: () => true, BHasClass: () => true, FindAncestor: () => core,
    FindChildTraverse: id => id === 'MatchesColumnsHeader' ? battleHeader : {FindChildrenWithClassTraverse: () => [battleRow]}};
$.Localize = (text, panel) => text === '{s:column_name}' ? panel.title : originalLocalize(text, panel);
const submissionsBeforeRead = sent.length;
context.ShowMMR_BattleRead(battleRoot);
assert.deepEqual(JSON.parse(battleRoot._showMMRBattleSample).rows[0], ['4/9/2026 23:32', '21']);
assert.equal(data.BattleStatsSample, undefined, 'unverified discovery must not attach data to the account');
battleRoot.paneltype = 'DOTAProfileBattleStatsPage';
$.GetContextPanel = () => ({paneltype: 'Panel', GetParent: () => battleRoot});
context.ShowMMR_BattleStart();
assert.equal(battleRoot._showMMRBattleStarted, true, 'native page has a type but no matching ID');
$.GetContextPanel = getContext;
assert.equal(sent.length, submissionsBeforeRead, 'Dota+ discovery must never submit a storage event');
$.Localize = originalLocalize;
// Native loading/pregame discovery has no storage event and stops after a short sample.
vm.runInContext(fs.readFileSync(path.join(scripts, 'show_mmr_match_probe.js'), 'utf8'), context);
$.GetContextPanel = () => ({id: 'PreGame', IsValid: () => true, FindChildTraverse: () => null});
const probeEventsBefore = names.length;
for (let i = 0; i < 35; i++) context.ShowMMR_MatchProbe();
assert.deepEqual(names.slice(probeEventsBefore), ['ShowMMR_Probe']);
const probeCallbacks = scheduled.length;
context.ShowMMR_MatchProbe();
assert.equal(scheduled.length, probeCallbacks, 'diagnostic probe is bounded');
context.ShowMMR_MatchProbeStart();
assert.equal(names.length, probeEventsBefore + 2, 'preloaded pregame probe wakes on a later game transition');
const restartedCallbacks = scheduled.length;
context.ShowMMR_MatchProbeStart();
assert.equal(scheduled.length, restartedCallbacks, 'repeated transitions must not create parallel polling loops');
$.GetContextPanel = getContext;
// Sept 12: the owned history page disappears two seconds into stabilization.
// Retry before ready-up, but never consider an event submission a completed save.
data.options = {};
data.Refreshing = false;
data.LastRefreshAt = 0;
data.InitialBaselineRequested = false;
data.CaptureAttempts = 0;
data.UIState = 3;
now = 1789250253000;
mmr = '6321';
snapshot(20, {}, '161969812', {phase: 1, mmr: 6281, previous: 1789241774,
    at: 1789246883, match_id: '0', started: 0, reason: 0});
const retryRow = {isRanked: true, epoch: 1789246981, finished: true, outcome: 1};
context.ShowMMR_WatchDashboard();
assert.equal(data.CaptureRequested, true, 'opening history is not a save acknowledgement');
assert.equal(data.CaptureAttempts, 1);
const oldTimeout = scheduled[scheduled.length - 2];
context.ShowMMR_ProfileAttachNewest(data, retryRow, root, 1789241774);
now += 2000;
root.visible = false;
context.ShowMMR_ProfileScanRows();
assert.equal(data.Refreshing, false, 'owned page interruption releases the active attempt');
assert.equal(data.CaptureRequested, true);
root.visible = true;
context.ShowMMR_WatchDashboard();
assert.equal(data.Refreshing, false, 'retry must be throttled');
now += 3000;
context.ShowMMR_WatchDashboard();
assert.equal(data.Refreshing, true, 'retry after five seconds, not the old 30-second cooldown');
assert.equal(data.CaptureAttempts, 2);
const retryWrites = sent.length;
context.ShowMMR_ProfileAttachNewest(data, retryRow, root, 1789241774);
now += 3000;
context.ShowMMR_ProfileAttachNewest(data, retryRow, root, 1789241774);
assert.equal(sent.length, retryWrites + 1);
assert.equal(data.CaptureRequested, true, 'submission is not acknowledgement');
now += 18000;
oldTimeout();
assert.equal(data.Refreshing, true, 'old timeout must not end a newer attempt');
snapshot(21, {' 1789246981': {'1': 6321, '2': 40}}, '161969812',
    {phase: 1, mmr: 6321, previous: 1789246981, at: 1789250261, match_id: '0', started: 0, reason: 0});
assert.equal(data.Refreshing, false, 'matching snapshot immediately completes the save');
assert.equal(data.AwaitingCapture, null);
assert.equal(context.ShowMMR_ProfileAttachNewest(data, retryRow, root, 1789241774), true);
assert.equal(data.CaptureRequested, false, 'only confirmed baseline ends pending capture');
assert.equal(data.CaptureAttempts, 0);
data.Refreshing = false;
// Bounded retries retain the request without endlessly navigating; manual refresh resets the budget.
for (let attempt = 0; attempt < 3; attempt++) {
    now += 30000;
    assert.equal(context.ShowMMR_Refresh(true), true);
    data.FinishCapture(false);
}
now += 30000;
assert.equal(context.ShowMMR_Refresh(true), undefined);
assert.equal(data.CaptureRequested, true);
playClasses.add('InReadyUp');
assert.equal(context.ShowMMR_Refresh(true, true), undefined, 'never retry through ready-up');
playClasses.delete('InReadyUp');
assert.equal(context.ShowMMR_Refresh(true, true), true);
assert.equal(data.CaptureAttempts, 1);
// Empty views retry early; active stabilization and in-flight saves keep their full window.
data.FinishCapture(true);
now += 30000;
context.ShowMMR_Refresh(true);
const emptyTimeout = scheduled[scheduled.length - 2];
now += 8000;
emptyTimeout();
assert.equal(data.Refreshing, false, 'empty view need not wait 26 seconds');
assert.equal(data.CaptureRequested, true);
context.ShowMMR_Refresh(true);
const activeTimeout = scheduled[scheduled.length - 2];
data.Candidate = {root, since: Math.floor(now / 1000)};
now += 8000;
activeTimeout();
assert.equal(data.Refreshing, true, 'early timeout must not reset a stabilizing row');
data.Candidate = null;
data.AwaitingCapture = {user: data.user, epoch: 1789256000, mmr: 6352, at: Math.floor(now / 1000), change: 31, root};
activeTimeout();
assert.equal(data.Refreshing, true, 'early timeout must not interrupt an in-flight save');
const expected = {...data.AwaitingCapture};
snapshot(22, {}, data.user, {phase: 1, mmr: expected.mmr, at: expected.at,
    previous: expected.epoch, match_id: '0', started: 0, reason: 0});
assert.equal(data.Refreshing, true, 'normal result acknowledgement also requires its history record');
snapshot(23, {' 1789256000': {'1': 6352, '2': 31}}, data.user,
    {phase: 1, mmr: expected.mmr, at: expected.at - 1, previous: expected.epoch, match_id: '0', started: 0, reason: 0});
assert.equal(data.Refreshing, true, 'an older observation is not this submission acknowledgement');
root.visible = false;
tables.state = {user: data.user, revision: 24, pages: 1, count: 1, blocked: 0,
    pending: {phase: 1, mmr: expected.mmr, at: expected.at, previous: expected.epoch, match_id: '0', started: 0, reason: 0}};
delete tables.page1;
context.ShowMMR_AccountUpdated();
assert.equal(data.Refreshing, true, 'partial snapshots must not acknowledge a save');
const navigationBeforeAck = events.length;
snapshot(24, {' 1789256000': {'1': 6352, '2': 31}}, data.user,
    {phase: 1, mmr: expected.mmr, at: expected.at, previous: expected.epoch, match_id: '0', started: 0, reason: 0});
assert.equal(data.Refreshing, false, 'saved snapshot acknowledges even when the profile has disappeared');
assert.equal(events.slice(navigationBeforeAck).includes('DOTANavigateBack'), false);
assert.equal(data.CaptureRequested, false);
root.visible = true;
// Sept 26: returning from a game before GC publishes it must not end capture as
// "baseline acknowledged"; that left the match unrecorded until the next queue.
data.options = {};
data.Refreshing = false;
data.AwaitingCapture = null;
data.CaptureRequested = false;
data.CaptureAttempts = 0;
data.ExpectResultAfter = 0;
now = 1789300000000;
mmr = '6400';
const anchorEpoch = 1789290000;
snapshot(30, {}, data.user, {phase: 1, mmr: 6400, previous: anchorEpoch, at: 1789295000, match_id: '0', started: 0, reason: 0});
const enteredGame = Math.floor(now / 1000);
context.ShowMMR_GameUIStateChanged(3, 2);
assert.equal(data.ExpectResultAfter, enteredGame - 120, 'leaving the dashboard expects a new result');
now += 2400000;
context.ShowMMR_GameUIStateChanged(2, 3);
const anchorRow = {isRanked: true, epoch: anchorEpoch, finished: true, outcome: 1};
assert.equal(context.ShowMMR_ProfileAttachNewest(data, anchorRow, root, 0, anchorEpoch), false,
    'unpublished post-game history is not a baseline acknowledgement');
assert.match(data.CaptureStatus, /waiting for match history after game/);
data.CaptureRequested = true;
const retryGaps = [];
let lastAttempt = now;
for (let attempt = 0; attempt < 6; attempt++) {
    let waited = 0;
    while (context.ShowMMR_Refresh(true) !== true) {
        now += 1000;
        assert.ok(++waited < 120, 'post-game retry must eventually run');
    }
    retryGaps.push((now - lastAttempt) / 1000);
    lastAttempt = now;
    data.FinishCapture(false);
}
assert.deepEqual(retryGaps.slice(1), [5, 5, 15, 30, 60], 'post-game retries back off instead of stopping at three');
assert.equal(data.ExpectResultAfter, 0, 'exhausted post-game budget stops treating the anchor as stale');
now += 120000;
assert.equal(context.ShowMMR_Refresh(true), undefined);
assert.equal(data.CaptureRequested, true, 'request is retained for later re-arms');
// A newer unranked row proves history caught up; the anchor is acknowledged.
context.ShowMMR_GameUIStateChanged(3, 2);
const turboStart = Math.floor(now / 1000);
now += 1800000;
context.ShowMMR_GameUIStateChanged(2, 3);
const cells = text => [{text}];
const historyRow = (type, date, epoch) => {
    data.show['E' + (date + '12:00' + '30:00').replace(/\D/g, '')] = {label: '', epoch, mmr: -1, shift: -1};
    return {FindAncestor: name => name === 'RecentGamesTable' ? {} : null, BHasClass: name => name === 'Won',
        SetDialogVariableInt() {}, FindChildrenWithClassTraverse: name => ({GameTypeColumn: cells(type),
            ResultColumn: [{text: 'Win'}], TimestampDate: cells(date), TimestampTime: cells('12:00'),
            DurationColumn: cells('30:00')})[name]};
};
let historyRows = [historyRow('#dota_lobby_type_competitive', '2', anchorEpoch)];
root.FindChildrenWithClassTraverse = () => historyRows;
context.ShowMMR_ProfileScannerRunning = true;
data.CaptureRequested = true;
context.ShowMMR_ProfileScanRows();
assert.equal(data.CaptureRequested, true, 'scanner keeps waiting while only the anchor is listed');
historyRows = [historyRow('Turbo', '1', turboStart + 30), historyRows[0]];
context.ShowMMR_ProfileScanRows();
assert.equal(data.CaptureRequested, false, 'newer unranked row acknowledges the unchanged anchor');
assert.equal(data.ExpectResultAfter, 0);
assert.equal(data.LatestRowEpoch, turboStart + 30);
root.FindChildrenWithClassTraverse = () => [];
context.ShowMMR_ProfileScannerRunning = false;
// Dota's last-match panel updating with an unrecorded, newer match re-arms capture once.
data.CaptureAttempts = 3;
const published = Math.floor(now / 1000) - 600;
data.SignalLastMatch = epoch => context.ShowMMR_LastMatchSignal(data, epoch);
context.ShowMMR_LastMatchPanel = {IsValid: () => true, FindAncestor: () => core, FindChildTraverse: () => null};
data.show.E = {label: '', epoch: published, mmr: -1, shift: -1};
context.ShowMMR_LastMatchUpdated();
assert.equal(data.CaptureRequested, true, 'last-match update requests capture');
assert.equal(data.CaptureAttempts, 0, 'last-match update resets the retry budget');
assert.equal(data.ExpectResultAfter, published, 'profile must show the signalled match before acknowledging');
assert.equal(context.ShowMMR_ProfileAttachNewest(data, anchorRow, root, 0, turboStart + 30), false);
data.CaptureAttempts = 2;
context.ShowMMR_LastMatchUpdated();
assert.equal(data.CaptureAttempts, 2, 'the same last match signals only once');
data.ExpectResultAfter = 0;
context.ShowMMR_LastMatchSignal(data, anchorEpoch);
context.ShowMMR_LastMatchSignal(data, turboStart + 30);
context.ShowMMR_LastMatchSignal(data, Math.floor(now / 1000) + 3600);
assert.equal(data.ExpectResultAfter, 0, 'anchor, already-listed and future epochs are not new results');
console.log('Panorama regression checks passed');
}
