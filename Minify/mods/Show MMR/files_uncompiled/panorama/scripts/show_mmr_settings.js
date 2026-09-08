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
	if (!data || !root || ["show", "auto", "verbose"].indexOf(key) < 0) return;
	data.options = data.options || {};
	data.options[key] = root.FindChildTraverse(id).checked;
	if (key === "auto" && data.options.auto) data.CaptureRequested = true;
	$.DispatchEvent("DOTABackgroundLastMatchUpdated");
};

var ShowMMR_SettingsRefresh = function () {
	var data = ShowMMR_SettingsData();
	if (data && data.RefreshHistory) data.RefreshHistory();
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
		root.FindChildTraverse("ShowMMRPending").text = "Pending match: " + status;
		root.FindChildTraverse("ShowMMRHistory").text = "History: " + Object.keys(data.history || {}).length + " saved matches";
		root.FindChildTraverse("ShowMMRRefresh").enabled = !!(data.historyReady && !data.storageBlocked && data.IsIdle && data.IsIdle() && !data.Refreshing);
		root.FindChildTraverse("ShowMMRShow").checked = options.show !== false;
		root.FindChildTraverse("ShowMMRAuto").checked = options.auto !== false;
		root.FindChildTraverse("ShowMMRVerbose").checked = options.verbose !== false;
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
