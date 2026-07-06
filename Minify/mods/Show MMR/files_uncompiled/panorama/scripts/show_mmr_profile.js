"use strict";

var ShowMMR_ProfileScannerRunning = false;
var ShowMMR_ProfileLoggedNoCore = false;
var ShowMMR_ProfileLoggedInit = false;
var ShowMMR_ProfileLoggedRows = false;
var ShowMMR_ProfileLoggedNoMMR = false;

var ShowMMR_ProfileDebug = function (message) {
	$.Msg("[ShowMMR] " + message);
};

var ShowMMR_ProfileToNumber = function (value, fallback) {
	var number = Number(value);
	return isFinite(number) ? number : fallback;
};

var ShowMMR_ProfileNow = function () {
	return Math.floor((Date.now ? Date.now() : (new Date()).getTime()) / 1000);
};

var ShowMMR_ProfileRoot = function () {
	var panel = $.GetContextPanel();
	var parent = panel.GetParent ? panel.GetParent() : null;
	return panel.FindAncestor("DOTAProfileHeroStatsPage") || parent || panel;
};

var ShowMMR_ProfileData = function (root) {
	var core = root ? root.FindAncestor("DashboardCore") : null;
	if (!core) {
		var dashboard = $("#Dashboard");
		core = dashboard ? dashboard.FindChildInLayoutFile("DashboardCore") : null;
	}
	if (!core) {
		if (!ShowMMR_ProfileLoggedNoCore) {
			ShowMMR_ProfileLoggedNoCore = true;
			ShowMMR_ProfileDebug("profile: DashboardCore not found");
		}
		return null;
	}

	core.Data.ShowMMR = core.Data.ShowMMR || {};
	if (core.Data.ShowMMR.show == null) core.Data.ShowMMR.show = {};
	return core.Data.ShowMMR;
};

var ShowMMR_ProfileLoadPending = function (data) {
	if (!data || typeof CustomNetTables === "undefined" || !CustomNetTables.GetTableValue) return;

	var pending = CustomNetTables.GetTableValue("ShowMMR_pending", "state");
	if (!pending) return;
	data.PendingStartMMR = ShowMMR_ProfileToNumber(pending.mmr, data.PendingStartMMR || 0);
	data.PendingStartedAt = ShowMMR_ProfileToNumber(pending.at, data.PendingStartedAt || 0);
	data.PendingMatchId = String(pending.match_id || data.PendingMatchId || "0");
	data.PendingProcessed = ShowMMR_ProfileToNumber(pending.processed, data.PendingProcessed || 0);
};

var ShowMMR_ProfileLatestKnown = function (data) {
	var latest = {epoch: 0, mmr: -1};
	if (!data || !data.history) return latest;

	for (var key in data.history) {
		if (!Object.prototype.hasOwnProperty.call(data.history, key)) continue;
		var epoch = parseInt(key, 10);
		var value = data.history[key];
		if (epoch > latest.epoch && value && value[0] > 0) {
			latest.epoch = epoch;
			latest.mmr = value[0];
		}
	}
	return latest;
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

var ShowMMR_ProfileApplyLabel = function (entry, result, data, found) {
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

	result.text = numbers;
	found.label = numbers;
};

var ShowMMR_ProfileRecentGames = function (panel) {
	var entry = panel || $.GetContextPanel();
	var recent = entry.FindAncestor("RecentGamesTable");
	if (!recent) return null;

	var root = ShowMMR_ProfileRoot();
	var data = ShowMMR_ProfileData(root);
	if (!data) return null;

	var gameType = entry.FindChildrenWithClassTraverse("GameTypeColumn");
	var result = entry.FindChildrenWithClassTraverse("ResultColumn");
	var date = entry.FindChildrenWithClassTraverse("TimestampDate");
	var time = entry.FindChildrenWithClassTraverse("TimestampTime");
	var duration = entry.FindChildrenWithClassTraverse("DurationColumn");
	if (!gameType || !result || !date || !time || !duration) return null;
	if (!gameType[0] || !result[0] || !date[0] || !time[0] || !duration[0]) return null;

	data._ranked = data._ranked || $.Localize("#dota_lobby_type_competitive");
	var typeText = gameType[0].text;
	var isRanked = typeText === data._ranked || typeText.toLowerCase().indexOf("ranked") !== -1;
	if (!isRanked) return {isRanked: false};

	var stampDate = date[0].text;
	var stamp = "E" + (stampDate + time[0].text + duration[0].text).replace(/\D/g, "");
	var found = data.show[stamp];
	var epoch = ShowMMR_ProfileEpoch(entry, stampDate, time[0].text, duration[0].text, found);
	var known = data.history ? data.history[epoch] : null;

	if (!found) {
		found = {
			label: "",
			epoch: epoch,
			mmr: known ? known[0] : -1,
			shift: known ? known[1] : -1
		};
		data.show[stamp] = found;
	} else if (known && (found.mmr !== known[0] || found.shift !== known[1])) {
		found.mmr = known[0];
		found.shift = known[1];
	}

	ShowMMR_ProfileApplyLabel(entry, result[0], data, found);
	return {
		isRanked: true,
		entry: entry,
		result: result[0],
		stamp: stamp,
		epoch: epoch,
		known: known,
		found: found,
		typeText: typeText
	};
};

var ShowMMR_SendRefresh = function (mmr, time, change) {
	if (mmr < 0 || typeof GameEvents === "undefined" || !GameEvents.SendCustomGameEventToServer) return;

	var payload = {mmr: mmr};
	if (time > 0) payload.time = time;
	if (typeof change !== "undefined") payload.change = change;
	GameEvents.SendCustomGameEventToServer("ShowMMR_Refresh", payload);
};

var ShowMMR_ProfileReadMMR = function (root) {
	var label = root.FindChildTraverse("MMRNumber");
	var text = label ? label.text : "";
	if (!text || text.charAt(0) === "#") text = $.Localize("#ranked_mmr_value", label || root);

	return parseInt(text.replace(/\D+/g, ""), 10) || -1;
};

var ShowMMR_ProfileCaptureFromOpenPage = function (root, data) {
	var mmr = ShowMMR_ProfileReadMMR(root);
	if (mmr < 0) {
		if (!ShowMMR_ProfileLoggedNoMMR) {
			ShowMMR_ProfileLoggedNoMMR = true;
			ShowMMR_ProfileDebug("profile: MMRNumber not readable");
		}
		return -1;
	}

	if (data.LastMMR !== mmr) {
		ShowMMR_ProfileDebug("profile: mmr visible=" + mmr);
	}
	data.LastMMR = mmr;
	data.LastMMRAt = ShowMMR_ProfileNow();
	return mmr;
};

var ShowMMR_ProfileAttachNewest = function (data, row, root) {
	if (!data || !row || !row.isRanked || row.epoch <= 0) return;
	ShowMMR_ProfileLoadPending(data);
	if (row.known && row.known[0] > 0) return;

	var mmr = ShowMMR_ProfileCaptureFromOpenPage(root, data);
	if (mmr < 1) return;

	var latest = ShowMMR_ProfileLatestKnown(data);
	if (row.epoch <= latest.epoch) return;
	var now = ShowMMR_ProfileNow();
	if (data.LastAttachedEpoch === row.epoch && data.LastAttachedMMR === mmr && now - (data.LastAttachedAt || 0) < 10) return;

	var pendingMMR = ShowMMR_ProfileToNumber(data.PendingStartMMR, 0);
	var hasPending = pendingMMR > 0 && data.PendingProcessed !== 1;
	var baseline = hasPending ? pendingMMR : latest.mmr;
	if (baseline < 1) {
		ShowMMR_ProfileDebug("profile: newest ranked epoch=" + row.epoch + " mmr=" + mmr + " waiting for baseline");
		return;
	}

	var change = mmr - baseline;
	data.LastAttachedEpoch = row.epoch;
	data.LastAttachedMMR = mmr;
	data.LastAttachedAt = now;
	data.PendingProcessed = 1;
	ShowMMR_ProfileDebug(
		"profile: attach newest epoch=" + row.epoch +
		" mmr=" + mmr +
		" change=" + change +
		" baseline=" + baseline +
		" latest=" + latest.epoch +
		" pending_match_id=" + (data.PendingMatchId || "0")
	);
	ShowMMR_SendRefresh(mmr, row.epoch, change);

	row.found.mmr = mmr;
	row.found.shift = change;
	ShowMMR_ProfileApplyLabel(row.entry, row.result, data, row.found);
};

var ShowMMR_ProfileScanRows = function () {
	if (!ShowMMR_ProfileScannerRunning) return;

	var root = ShowMMR_ProfileRoot();
	var data = ShowMMR_ProfileData(root);
	if (data) ShowMMR_ProfileCaptureFromOpenPage(root, data);

	var table = root.FindChildTraverse("RecentGamesTable");
	var rows = table ? table.FindChildrenWithClassTraverse("RecentGame") : root.FindChildrenWithClassTraverse("RecentGame");
	rows = rows || [];
	if (!ShowMMR_ProfileLoggedRows && rows.length > 0) {
		ShowMMR_ProfileLoggedRows = true;
		ShowMMR_ProfileDebug("profile: rows=" + rows.length);
	}

	var newestRanked = null;
	for (var i = 0; i < rows.length; i++) {
		var row = ShowMMR_ProfileRecentGames(rows[i]);
		if (row && row.isRanked && row.epoch > 0 && (!newestRanked || row.epoch > newestRanked.epoch)) newestRanked = row;
	}
	if (data && newestRanked && data.LastCandidateEpoch !== newestRanked.epoch) {
		data.LastCandidateEpoch = newestRanked.epoch;
		ShowMMR_ProfileDebug("profile: newest ranked candidate epoch=" + newestRanked.epoch + " known=" + (newestRanked.known ? 1 : 0));
	}
	if (data) ShowMMR_ProfileAttachNewest(data, newestRanked, root);

	$.Schedule(1.0, function () {
		ShowMMR_ProfileScanRows();
	});
};

var ShowMMR_ProfileStartScanner = function () {
	if (ShowMMR_ProfileScannerRunning) return;

	ShowMMR_ProfileScannerRunning = true;
	ShowMMR_ProfileScanRows();
};

var ShowMMR_ProfileValue = function () {
	var root = ShowMMR_ProfileRoot();
	var data = ShowMMR_ProfileData(root);
	if (!data) return;
	if (!ShowMMR_ProfileLoggedInit) {
		ShowMMR_ProfileLoggedInit = true;
		ShowMMR_ProfileDebug("profile: loaded");
	}

	ShowMMR_ProfileLoadPending(data);
	ShowMMR_ProfileCaptureFromOpenPage(root, data);
	ShowMMR_ProfileStartScanner();

	if (!data.Refreshing) return;

	data.mmr = -1;
	data.mmr = ShowMMR_ProfileReadMMR(root);

	if (data.mmr > -1 || --data.retries < 1) {
		data.retries = -1;
		ShowMMR_ProfileCaptureFromOpenPage(root, data);
		$.DispatchEvent("DOTABackgroundLastMatchUpdated");
		data.Refreshing = false;
		$.DispatchEvent("DOTANavigateBack", root);
		return;
	}

	$.Schedule(3.0, function () {
		ShowMMR_ProfileValue();
	});
};
