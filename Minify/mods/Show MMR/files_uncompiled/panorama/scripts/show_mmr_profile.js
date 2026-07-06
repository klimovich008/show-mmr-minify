"use strict";

var ShowMMR_ProfileScannerRunning = false;

var ShowMMR_ProfileRoot = function () {
	var panel = $.GetContextPanel();
	var parent = panel.GetParent ? panel.GetParent() : null;
	return panel.FindAncestor("DOTAProfileHeroStatsPage") || parent || panel;
};

var ShowMMR_ProfileData = function (root) {
	var core = root.FindAncestor("DashboardCore");
	if (!core) return null;

	core.Data.ShowMMR = core.Data.ShowMMR || {};
	if (core.Data.ShowMMR.show == null) core.Data.ShowMMR.show = {};
	return core.Data.ShowMMR;
};

var ShowMMR_ProfileEpoch = function (panel, dateText, timeText, durationText, found) {
	if (found) return found.epoch;

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

	return epoch;
};

var ShowMMR_ProfileRecentGames = function (panel) {
	var entry = panel || $.GetContextPanel();
	var recent = entry.FindAncestor("RecentGamesTable");
	if (!recent) return;

	var root = ShowMMR_ProfileRoot();
	var data = ShowMMR_ProfileData(root);
	if (!data || data.history == null) return;

	var gameType = entry.FindChildrenWithClassTraverse("GameTypeColumn");
	var result = entry.FindChildrenWithClassTraverse("ResultColumn");
	var date = entry.FindChildrenWithClassTraverse("TimestampDate");
	var time = entry.FindChildrenWithClassTraverse("TimestampTime");
	var duration = entry.FindChildrenWithClassTraverse("DurationColumn");
	if (!gameType || !result || !date || !time || !duration) return;

	data._ranked = data._ranked || $.Localize("#dota_lobby_type_competitive");
	var typeText = gameType[0].text;
	if (typeText !== data._ranked && typeText.toLowerCase().indexOf("ranked") === -1) {
		return;
	}

	var stampDate = date[0].text;
	var stamp = "E" + (stampDate + time[0].text + duration[0].text).replace(/\D/g, "");
	var found = data.show[stamp];
	var epoch = ShowMMR_ProfileEpoch(entry, stampDate, time[0].text, duration[0].text, found);

	if (!found) {
		var known = data.history[epoch];
		found = {
			label: "",
			epoch: epoch,
			mmr: known ? known[0] : -1,
			shift: known ? known[1] : -1
		};
		data.show[stamp] = found;
	} else {
		var updated = data.history[epoch];
		if (updated && (found.mmr !== updated[0] || found.shift !== updated[1])) {
			found.mmr = updated[0];
			found.shift = updated[1];
		}
	}

	var numbers = "";
	if (found.mmr === -1 && found.shift === -1) {
		return;
	} else if (found.mmr === 0 && found.shift === 0) {
		data._uncalibrated = data._uncalibrated || $.Localize("#dota_profile_recent_game_result_uncalibrated_ranked");
		numbers = data._uncalibrated;
	} else if (entry.BHasClass("Abandoned")) {
		data._abandon = data._abandon || $.Localize("#dota_profile_recent_game_result_abandon");
		numbers = data._abandon + " (" + found.shift + ")";
	} else {
		entry.SetDialogVariableInt("showmmr", found.mmr);
		numbers = $.Localize("{i:showmmr}", entry) + (found.shift > 0 ? " (+" : " (") + found.shift + ")";
	}

	result[0].text = numbers;
	found.label = numbers;
};

var ShowMMR_ProfileScanRows = function () {
	if (!ShowMMR_ProfileScannerRunning) return;

	var root = ShowMMR_ProfileRoot();
	var rows = root.FindChildrenWithClassTraverse("RecentGame") || [];
	for (var i = 0; i < rows.length; i++) ShowMMR_ProfileRecentGames(rows[i]);

	$.Schedule(1.0, function () {
		ShowMMR_ProfileScanRows();
	});
};

var ShowMMR_ProfileStartScanner = function () {
	if (ShowMMR_ProfileScannerRunning) return;

	ShowMMR_ProfileScannerRunning = true;
	ShowMMR_ProfileScanRows();
};

var ShowMMR_SendRefresh = function (mmr) {
	if (mmr < 0 || typeof GameEvents === "undefined" || !GameEvents.SendCustomGameEventToServer) return;

	GameEvents.SendCustomGameEventToServer("ShowMMR_Refresh", {mmr: mmr});
};

var ShowMMR_ProfileReadMMR = function (root) {
	if (!root.BHasClass("MMRCalibrated")) return -1;

	return parseInt($.Localize("#ranked_mmr_value", root).replace(/\D+/g, ""), 10) || -1;
};

var ShowMMR_ProfileCaptureFromOpenPage = function (root, data) {
	if (data.Refreshing) return;

	var now = Date.now ? Date.now() : (new Date()).getTime();
	if (data.LastProfileCaptureAt && now - data.LastProfileCaptureAt < 300000) return;

	var mmr = ShowMMR_ProfileReadMMR(root);
	if (mmr < 0) return;

	data.LastProfileCaptureAt = now;
	ShowMMR_SendRefresh(mmr);
};

var ShowMMR_ProfileValue = function () {
	var root = ShowMMR_ProfileRoot();
	var data = ShowMMR_ProfileData(root);
	if (!data) return;

	ShowMMR_ProfileStartScanner();
	ShowMMR_ProfileCaptureFromOpenPage(root, data);

	if (!data.Refreshing) return;

	$.DispatchEvent("DOTAProfileHeroStatsTab", 1);

	data.mmr = -1;
	root.style.visibility = "collapse";
	data.mmr = ShowMMR_ProfileReadMMR(root);

	if (data.mmr > -1 || --data.retries < 1) {
		data.retries = -1;
		root.style.visibility = "visible";
		ShowMMR_SendRefresh(data.mmr);
		$.DispatchEvent("DOTABackgroundLastMatchUpdated");
		data.Refreshing = false;
		$.DispatchEvent("DOTANavigateBack", root);
		return;
	}

	$.Schedule(3.0, function () {
		ShowMMR_ProfileValue();
	});
};
