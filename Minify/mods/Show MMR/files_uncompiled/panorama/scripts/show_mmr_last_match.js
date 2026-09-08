"use strict";

var ShowMMR_LastMatchPanel = null;
var ShowMMR_LastLoggedNoCore = false;
var ShowMMR_LastLoggedEpochFail = false;

var ShowMMR_LastDebugEnabled = true;

var ShowMMR_LastDebug = function (message) {
	if (!ShowMMR_LastDebugEnabled) return;
	var dashboard = $("#Dashboard"), core = dashboard && dashboard.FindChildInLayoutFile("DashboardCore");
	var data = core && core.Data.ShowMMR;
	if (data && data.options && data.options.verbose === false) return;
	$.Msg("[ShowMMR] " + message);
};

var ShowMMR_LastPanelValid = function (panel) {
	return panel && (!panel.IsValid || panel.IsValid());
};

var ShowMMR_LastRoot = function () {
	if (ShowMMR_LastPanelValid(ShowMMR_LastMatchPanel)) return ShowMMR_LastMatchPanel;
	ShowMMR_LastMatchPanel = null;

	var panel = $.GetContextPanel();
	if (!ShowMMR_LastPanelValid(panel)) return null;
	var parent = panel.GetParent ? panel.GetParent() : null;
	ShowMMR_LastMatchPanel = panel.paneltype === "DOTADashboardBackgroundLastMatch" ? panel : panel.FindAncestor("DOTADashboardBackgroundLastMatch") || parent || panel;
	return ShowMMR_LastMatchPanel;
};

var ShowMMR_LastData = function (root) {
	if (!root) return null;
	var core = root.FindAncestor("DashboardCore");
	if (!core) {
		if (!ShowMMR_LastLoggedNoCore) {
			ShowMMR_LastLoggedNoCore = true;
			ShowMMR_LastDebug("last_match: DashboardCore not found");
		}
		return null;
	}

	core.Data.ShowMMR = core.Data.ShowMMR || {};
	if (core.Data.ShowMMR.show == null) core.Data.ShowMMR.show = {};
	return core.Data.ShowMMR;
};

var ShowMMR_LastEpoch = function (panel, dateText, found) {
	if (found && found.epoch > 0) return found.epoch;

	var epoch = 0;
	var gmt = $.Localize("{T:d:timestamp}", panel);
	var dst = $.Localize("{T:timestamp}", panel);
	var hms = gmt.match(/\d+/g) || [];
	var ymd = dateText.match(/\d+/g) || [];
	var hour = hms.length > 0 ? parseInt(hms[0], 10) : 0;
	var minute = hms.length > 1 ? parseInt(hms[1], 10) : 0;
	var second = hms.length > 2 ? parseInt(hms[2], 10) : 0;
	var year = ymd.length > 0 ? parseInt(ymd[0], 10) : 0;
	var month = ymd.length > 1 ? parseInt(ymd[1], 10) : 0;
	var day = ymd.length > 2 ? parseInt(ymd[2], 10) : 0;

	if (hms.length < 3) {
		second = minute;
		minute = hour;
		hour = 0;
	}
	if (year < 32) {
		var flip = day;
		day = year;
		year = flip;
	}

	var utc = [];
	utc[0] = Date.UTC(year, month - 1, day, hour, minute, second, 0) / 1000;
	utc[1] = Date.UTC(year, day - 1, month, hour, minute, second, 0) / 1000;
	utc[2] = utc[0] - 86400;
	utc[3] = utc[0] + 86400;
	utc[4] = utc[1] - 86400;
	utc[5] = utc[1] + 86400;

	for (var i = 0; i < utc.length; i++) panel.SetDialogVariableTime("showmmr_utc" + i, utc[i]);
	var localized = $.Localize(
		"{T:showmmr_utc0}|{T:showmmr_utc1}|{T:showmmr_utc2}|{T:showmmr_utc3}|{T:showmmr_utc4}|{T:showmmr_utc5}",
		panel
	).split("|");
	for (var j = 0; j < localized.length; j++) {
		if (localized[j] === dst) epoch = utc[j];
	}
	if (epoch === 0 && !ShowMMR_LastLoggedEpochFail) {
		ShowMMR_LastLoggedEpochFail = true;
		ShowMMR_LastDebug("last_match: epoch parse failed date=" + dateText + " gmt=" + gmt + " dst=" + dst);
	}

	return epoch;
};

var ShowMMR_LastMatchUpdated = function () {
	var root = ShowMMR_LastRoot();
	var data = ShowMMR_LastData(root);
	if (!data || !data.historyReady || data.history == null) {
		if (!data || data.history == null) ShowMMR_LastDebug("last_match: waiting for history");
		return;
	}

	var stampDate = $.Localize("{T:s:timestamp}", root);
	var stamp = "E" + (stampDate + $.Localize("{T:t:timestamp}{T:d:duration}", root)).replace(/\D/g, "");
	var found = data.show[stamp];
	var epoch = ShowMMR_LastEpoch(root, stampDate, found);

	var known = data.history[epoch];
	if (!found) {
		found = {
			label: "",
			epoch: epoch,
			mmr: known ? known[0] : -1,
			shift: known ? known[1] : -1
		};
		data.show[stamp] = found;
	}
	found.epoch = epoch;
	found.mmr = known ? known[0] : -1;
	found.shift = known ? known[1] : -1;

	var win = root.FindChildTraverse("Win");
	var loss = root.FindChildTraverse("Loss");
	if (!(data.options && data.options.show === false) && found.mmr > 0 && found.shift !== 0) {
		var numbers = (found.shift > 0 ? "+" : "") + found.shift;
		if (win) win.text = numbers;
		if (loss) loss.text = numbers;
		ShowMMR_LastDebug("last_match: applied epoch=" + epoch + " change=" + numbers);
	} else {
		if (win) win.text = $.Localize("#dota_profile_recent_game_result_win");
		if (loss) loss.text = $.Localize("#dota_profile_recent_game_result_loss");
	}
};

var ShowMMR_LastMatchInit = function () {
	var root = ShowMMR_LastRoot();
	ShowMMR_LastMatchPanel = root;
	var data = ShowMMR_LastData(root);
	if (!data) return;
	ShowMMR_LastDebug("last_match: loaded");

	if (!root._showMMRInstalled) {
		root._showMMRInstalled = true;
		$.RegisterForUnhandledEvent("DOTABackgroundLastMatchUpdated", ShowMMR_LastMatchUpdated);
	}
	ShowMMR_LastMatchUpdated();
};
