"use strict";

// English defaults. The patch hook stores translations for Minify's output language
// on the settings section as the showmmr_strings attribute (see strings.json).
var ShowMMR_SettingsStrings = {
	account: "Account: {0}", waiting: "waiting",
	storage: "Storage: {0}", loading: "loading", blocked: "blocked; bindings preserved", loaded: "loaded",
	baseline: "Baseline: {0}", baseline_mmr: "{0} MMR", not_captured: "not captured",
	pending: "Pending match: {0}", none: "none", pending_ready: "baseline ready",
	pending_identified: "identified {0}", pending_uncertain: "uncertain: {0}",
	reason_1: "history gap", reason_2: "conflicting match data", reason_3: "rating/calibration changed",
	reason_unknown: "unknown", paused: "{0}; recording paused, use Start new baseline",
	recording: "Recording: {0}", off: "off", idle: "idle",
	capture_waiting_publish: "waiting for Dota to publish the last match",
	capture_saving: "saving...", capture_reading: "reading match history...",
	capture_result: "waiting for the match result", capture_checking: "checking match history...",
	capture_later: "will check match history when idle",
	history: "History: {0} saved matches (keeps the newest 100)",
	last: "Last result: {0}", last_value: "{0} -> {1} ({2})",
	age_min: "{0} min ago", age_hours: "{0} h ago", age_days: "{0} days ago",
	day: "Last 24 hours: {0}", day_value: "{0} ({1}W {2}L)", day_none: "no recorded ranked results"
};

var ShowMMR_T = function (key) {
	var text = ShowMMR_SettingsStrings[key] || key;
	for (var i = 1; i < arguments.length; i++) text = text.split("{" + (i - 1) + "}").join(String(arguments[i]));
	return text;
};

var ShowMMR_SettingsLoadStrings = function (root) {
	var json = root.GetAttributeString ? root.GetAttributeString("showmmr_strings", "") : "";
	if (!json) return;
	try {
		var translated = JSON.parse(json);
		for (var key in translated) if (typeof translated[key] === "string") ShowMMR_SettingsStrings[key] = translated[key];
	} catch (error) { $.Msg("[ShowMMR] settings: strings ignored: " + error); }
};

var ShowMMR_SettingsData = function () {
	var dashboard = $("#Dashboard");
	if (!dashboard) {
		var top = $.GetContextPanel();
		while (top.GetParent && top.GetParent()) top = top.GetParent();
		dashboard = top.FindChildTraverse("Dashboard");
	}
	var core = dashboard && dashboard.FindChildInLayoutFile("DashboardCore");
	return core && core.Data.ShowMMR;
};

var ShowMMR_SettingsRoot = function () {
	var panel = $.GetContextPanel();
	return panel.id === "ShowMMRSettingsSection" ? panel : panel.FindChildTraverse("ShowMMRSettingsSection");
};

var ShowMMR_SettingsChange = function (key, id) {
	var data = ShowMMR_SettingsData(), root = ShowMMR_SettingsRoot();
	if (!data || !root || ["show", "auto"].indexOf(key) < 0) return;
	data.options = data.options || {};
	data.options[key] = root.FindChildTraverse(id).checked;
	if (key === "auto" && data.options.auto) { data.CaptureRequested = true; data.CaptureAttempts = 0; }
	if (data.SaveSettings) data.SaveSettings();
	$.DispatchEvent("DOTABackgroundLastMatchUpdated");
};

var ShowMMR_SettingsRefresh = function () {
	var data = ShowMMR_SettingsData();
	if (data && data.RefreshHistory) data.RefreshHistory();
};

var ShowMMR_SettingsResetBaseline = function () {
	var data = ShowMMR_SettingsData();
	if (data && data.ResetBaseline) data.ResetBaseline();
};

// A locked baseline (conflict or rating change) stops recording until it is replaced.
var ShowMMR_SettingsLocked = function (pending) {
	return !!pending && pending.phase === 3 && pending.reason !== 1;
};

var ShowMMR_SettingsAge = function (seconds) {
	if (seconds < 3600) return ShowMMR_T("age_min", Math.max(1, Math.round(seconds / 60)));
	if (seconds < 172800) return ShowMMR_T("age_hours", Math.round(seconds / 3600));
	return ShowMMR_T("age_days", Math.round(seconds / 86400));
};

// Plain-language version of the step the profile scanner last reported.
var ShowMMR_SettingsCapture = function (data) {
	if (!data.CaptureRequested && !data.Refreshing) return ShowMMR_T("idle");
	var status = data.CaptureStatus || "";
	if (status.indexOf("waiting for match history") === 0) return ShowMMR_T("capture_waiting_publish");
	if (status.indexOf("awaiting save") === 0) return ShowMMR_T("capture_saving");
	if (status.indexOf("stabilizing") === 0) return ShowMMR_T("capture_reading");
	if (status.indexOf("result unfinished") === 0) return ShowMMR_T("capture_result");
	return ShowMMR_T(data.Refreshing ? "capture_checking" : "capture_later");
};

var ShowMMR_SettingsResults = function (root, history) {
	var now = Math.floor(Date.now() / 1000);
	var epochs = Object.keys(history).map(Number).sort(function (a, b) { return b - a; });
	var signed = function (n) { return (n > 0 ? "+" : "") + n; };
	var last = epochs.length ? history[epochs[0]] : null;
	root.FindChildTraverse("ShowMMRLast").text = ShowMMR_T("last", last ?
		ShowMMR_T("last_value", signed(last[1]), last[0], ShowMMR_SettingsAge(now - epochs[0])) : ShowMMR_T("none"));
	var total = 0, won = 0, lost = 0;
	for (var i = 0; i < epochs.length && epochs[i] >= now - 86400; i++) {
		var change = history[epochs[i]][1];
		total += change;
		if (change > 0) won++;
		else if (change < 0) lost++;
	}
	root.FindChildTraverse("ShowMMRToday").text = ShowMMR_T("day",
		won + lost ? ShowMMR_T("day_value", signed(total), won, lost) : ShowMMR_T("day_none"));
};

var ShowMMR_SettingsPending = function (pending) {
	if (!pending) return ShowMMR_T("none");
	if (pending.phase === 1) return ShowMMR_T("pending_ready");
	if (pending.phase === 2) return ShowMMR_T("pending_identified", pending.match_id);
	var reason = [1, 2, 3].indexOf(pending.reason) >= 0 ? "reason_" + pending.reason : "reason_unknown";
	var text = ShowMMR_T("pending_uncertain", ShowMMR_T(reason));
	return ShowMMR_SettingsLocked(pending) ? ShowMMR_T("paused", text) : text;
};

var ShowMMR_SettingsUpdate = function (root) {
	if (!root || !root.IsValid()) return;
	var data = ShowMMR_SettingsData();
	if (data) {
		var options = data.options || {}, pending = data.pending;
		var usable = !!(data.historyReady && !data.storageBlocked);
		root.FindChildTraverse("ShowMMRAccount").text = ShowMMR_T("account", data.user || ShowMMR_T("waiting"));
		root.FindChildTraverse("ShowMMRStatus").text = ShowMMR_T("storage",
			ShowMMR_T(!data.historyReady ? "loading" : data.storageBlocked ? "blocked" : "loaded"));
		root.FindChildTraverse("ShowMMRBaseline").text = ShowMMR_T("baseline",
			pending ? ShowMMR_T("baseline_mmr", pending.mmr) : ShowMMR_T("not_captured"));
		root.FindChildTraverse("ShowMMRPending").text = ShowMMR_T("pending", ShowMMR_SettingsPending(pending));
		root.FindChildTraverse("ShowMMRCapture").text = ShowMMR_T("recording",
			options.auto === false ? ShowMMR_T("off") : ShowMMR_SettingsCapture(data));
		root.FindChildTraverse("ShowMMRHistory").text = ShowMMR_T("history", Object.keys(data.history || {}).length);
		ShowMMR_SettingsResults(root, data.history || {});
		root.FindChildTraverse("ShowMMRRefresh").enabled = usable && !!(data.IsIdle && data.IsIdle() && !data.Refreshing);
		root.FindChildTraverse("ShowMMRReset").enabled = usable && ShowMMR_SettingsLocked(pending);
		root.FindChildTraverse("ShowMMRShow").checked = options.show !== false;
		root.FindChildTraverse("ShowMMRAuto").checked = options.auto !== false;
	}
	$.Schedule(1.0, function () { ShowMMR_SettingsUpdate(root); });
};

var ShowMMR_SettingsStart = function () {
	var panel = $.GetContextPanel();
	if (!panel || (panel.IsValid && !panel.IsValid())) return;
	var root = ShowMMR_SettingsRoot();
	if (!root) { $.Schedule(1.0, ShowMMR_SettingsStart); return; }
	if (root._showMMRSettings) return;
	root._showMMRSettings = true;
	ShowMMR_SettingsLoadStrings(root);
	$.Msg("[ShowMMR] settings: loaded");
	ShowMMR_SettingsUpdate(root);
};

$.Schedule(0.0, ShowMMR_SettingsStart);
