"use strict";

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
	if (seconds < 3600) return Math.max(1, Math.round(seconds / 60)) + " min ago";
	if (seconds < 172800) return Math.round(seconds / 3600) + " h ago";
	return Math.round(seconds / 86400) + " days ago";
};

// Plain-language version of the step the profile scanner last reported.
var ShowMMR_SettingsCapture = function (data) {
	if (!data.CaptureRequested && !data.Refreshing) return "idle";
	var status = data.CaptureStatus || "";
	if (status.indexOf("waiting for match history") === 0) return "waiting for Dota to publish the last match";
	if (status.indexOf("awaiting save") === 0) return "saving...";
	if (status.indexOf("stabilizing") === 0) return "reading match history...";
	if (status.indexOf("result unfinished") === 0) return "waiting for the match result";
	return data.Refreshing ? "checking match history..." : "will check match history when idle";
};

var ShowMMR_SettingsResults = function (root, history) {
	var now = Math.floor(Date.now() / 1000);
	var epochs = Object.keys(history).map(Number).sort(function (a, b) { return b - a; });
	var signed = function (n) { return (n > 0 ? "+" : "") + n; };
	var last = epochs.length ? history[epochs[0]] : null;
	root.FindChildTraverse("ShowMMRLast").text = "Last result: " + (last ?
		signed(last[1]) + " -> " + last[0] + " (" + ShowMMR_SettingsAge(now - epochs[0]) + ")" : "none");
	var total = 0, won = 0, lost = 0;
	for (var i = 0; i < epochs.length && epochs[i] >= now - 86400; i++) {
		var change = history[epochs[i]][1];
		total += change;
		if (change > 0) won++;
		else if (change < 0) lost++;
	}
	root.FindChildTraverse("ShowMMRToday").text = "Last 24 hours: " +
		(won + lost ? signed(total) + " (" + won + "W " + lost + "L)" : "no recorded ranked results");
};

var ShowMMR_SettingsUpdate = function (root) {
	if (!root || !root.IsValid()) return;
	var data = ShowMMR_SettingsData();
	if (data) {
		var options = data.options || {}, pending = data.pending;
		root.FindChildTraverse("ShowMMRAccount").text = "Account: " + (data.user || "waiting");
		root.FindChildTraverse("ShowMMRStatus").text = "Storage: " + (!data.historyReady ? "loading" : data.storageBlocked ? "blocked; bindings preserved" : "loaded");
		root.FindChildTraverse("ShowMMRBaseline").text = "Baseline: " + (pending ? pending.mmr + " MMR" : "not captured");
		var status = "none";
		if (pending) {
			status = pending.phase === 1 ? "baseline ready" : pending.phase === 2 ? "identified " + pending.match_id :
				"uncertain: " + ({1: "history gap", 2: "conflicting match data", 3: "rating/calibration changed"}[pending.reason] || "unknown");
		}
		var usable = !!(data.historyReady && !data.storageBlocked);
		if (ShowMMR_SettingsLocked(pending)) status += "; recording paused, use Start new baseline";
		root.FindChildTraverse("ShowMMRPending").text = "Pending match: " + status;
		root.FindChildTraverse("ShowMMRCapture").text = "Recording: " + (options.auto === false ? "off" : ShowMMR_SettingsCapture(data));
		root.FindChildTraverse("ShowMMRHistory").text = "History: " + Object.keys(data.history || {}).length + " saved matches (keeps the newest 100)";
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
	$.Msg("[ShowMMR] settings: loaded");
	ShowMMR_SettingsUpdate(root);
};

$.Schedule(0.0, ShowMMR_SettingsStart);
