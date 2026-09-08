"use strict";

var ShowMMR_ProfileScannerRunning = false;
var ShowMMR_ProfileLoggedNoCore = false;
var ShowMMR_ProfileLoggedInit = false;
var ShowMMR_ProfileLoggedRows = false;
var ShowMMR_ProfileLoggedNoMMR = false;
var ShowMMR_ProfileLoggedEpochFail = false;
var ShowMMR_ProfileLastScanError = "";

var ShowMMR_ProfileDebugEnabled = true;

var ShowMMR_ProfileDebug = function (message) {
	if (!ShowMMR_ProfileDebugEnabled) return;
	var dashboard = $("#Dashboard"), core = dashboard && dashboard.FindChildInLayoutFile("DashboardCore");
	var data = core && core.Data.ShowMMR;
	if (data && data.options && data.options.verbose === false) return;
	$.Msg("[ShowMMR] " + message);
};

var ShowMMR_ProfileNow = function () {
	return Math.floor((Date.now ? Date.now() : (new Date()).getTime()) / 1000);
};

var ShowMMR_ProfileCaptureStatus = function (data, status) {
	if (data && data.CaptureStatus !== status) {
		data.CaptureStatus = status;
		ShowMMR_ProfileDebug("profile: capture " + status);
	}
	return false;
};

var ShowMMR_ProfileResetCandidate = function (data, root, status) {
	// Cached/hidden profile pages share DashboardCore but do not own its active capture.
	if (data && (!data.Candidate || data.Candidate.root === root)) {
		data.Candidate = null;
		if (status) ShowMMR_ProfileCaptureStatus(data, status);
	}
	return false;
};

var ShowMMR_ProfileRoot = function () {
	var panel = $.GetContextPanel();
	if (!panel || (panel.IsValid && !panel.IsValid())) return null;
	var parent = panel.GetParent ? panel.GetParent() : null;
	return panel.paneltype === "DOTAProfileHeroStatsPage" ? panel : panel.FindAncestor("DOTAProfileHeroStatsPage") || parent || panel;
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

var ShowMMR_ProfileEpoch = function (panel, dateText, timeText, durationText, found) {
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
	if (epoch === 0 && !ShowMMR_ProfileLoggedEpochFail) {
		ShowMMR_ProfileLoggedEpochFail = true;
		ShowMMR_ProfileDebug("profile: epoch parse failed date=" + dateText + " gmt=" + gmt + " dst=" + dst);
	}

	return epoch;
};

var ShowMMR_ProfileApplyLabel = function (entry, result, data, found) {
	var numbers = "";
	if ((data.options && data.options.show === false) || (found.mmr === -1 && found.shift === -1)) {
		if (entry._showMMROriginalResult && result.text === entry._showMMRResult) result.text = entry._showMMROriginalResult;
		return;
	} else if (found.mmr === 0 && found.shift === 0) {
		data._uncalibrated = data._uncalibrated || $.Localize("#dota_profile_recent_game_result_uncalibrated_ranked");
		numbers = data._uncalibrated;
	} else if (entry.BHasClass("Abandoned")) {
		data._abandon = data._abandon || $.Localize("#dota_profile_recent_game_result_abandon");
		numbers = data._abandon + " (" + found.shift + ")";
	} else {
		entry.SetDialogVariableInt("showmmr", found.mmr);
		numbers = $.Localize("{i:showmmr}", entry);
		if (found.shift !== 0) numbers += (found.shift > 0 ? " (+" : " (") + found.shift + ")";
	}

	if (result.text !== entry._showMMRResult) entry._showMMROriginalResult = result.text;
	result.text = numbers;
	entry._showMMRResult = numbers;
	found.label = numbers;
};

var ShowMMR_ProfileMatchID = function (panel) {
	var id = $.Localize("{s:match_id}", panel);
	if (!/^[1-9]\d{0,19}$/.test(id) || (id.length === 20 && id > "18446744073709551615")) return null;
	return id;
};

var ShowMMR_ProfileRecentGames = function (panel) {
	var entry = panel || $.GetContextPanel();
	if (!entry || (entry.IsValid && !entry.IsValid())) return null;
	var recent = entry.FindAncestor("RecentGamesTable");
	if (!recent) return null;

	var root = ShowMMR_ProfileRoot();
	var data = ShowMMR_ProfileData(root);
	if (!root || !data || !data.historyReady || !root.BHasClass("LocalUser")) return null;

	var gameType = entry.FindChildrenWithClassTraverse("GameTypeColumn");
	var result = entry.FindChildrenWithClassTraverse("ResultColumn");
	var date = entry.FindChildrenWithClassTraverse("TimestampDate");
	var time = entry.FindChildrenWithClassTraverse("TimestampTime");
	var duration = entry.FindChildrenWithClassTraverse("DurationColumn");
	if (!gameType || !result || !date || !time || !duration) return null;
	if (!gameType[0] || !result[0] || !date[0] || !time[0] || !duration[0]) return null;

	data._ranked = data._ranked || $.Localize("#dota_lobby_type_competitive");
	var typeText = gameType[0].text;
	if (!typeText) return null;
	var isRanked = typeText === data._ranked || typeText.toLowerCase() === "ranked";
	if (!isRanked) {
		ShowMMR_ProfileApplyLabel(entry, result[0], data, {mmr: -1, shift: -1});
		return {isRanked: false};
	}

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
	}
	found.epoch = epoch;
	found.mmr = known ? known[0] : -1;
	found.shift = known ? known[1] : -1;

	ShowMMR_ProfileApplyLabel(entry, result[0], data, found);
	return {
		isRanked: true,
		entry: entry,
		result: result[0],
		stamp: stamp,
		epoch: epoch,
		known: known,
		found: found,
		finished: ShowMMR_ProfileFinished(entry, duration[0].text, epoch),
		outcome: ShowMMR_ProfileOutcome(entry),
		match_id: ShowMMR_ProfileMatchID(entry),
		typeText: typeText
	};
};

var ShowMMR_ProfileOutcome = function (entry) {
	if (entry.BHasClass("Abandoned") || entry.BHasClass("Won") === entry.BHasClass("Lost")) return 0;
	return entry.BHasClass("Won") ? 1 : -1;
};

var ShowMMR_ProfileFinished = function (entry, duration, epoch) {
	if (!ShowMMR_ProfileOutcome(entry)) return false;
	if (!/^\d+:\d{2}(:\d{2})?$/.test(duration)) return false;
	var parts = duration.split(":"), seconds = 0;
	for (var i = 0; i < parts.length; i++) {
		if (i > 0 && Number(parts[i]) >= 60) return false;
		seconds = seconds * 60 + Number(parts[i]);
	}
	return seconds > 0 && epoch > 0 && epoch + seconds <= ShowMMR_ProfileNow();
};

var ShowMMR_ProfileSend = function (name, payload) {
	if (typeof GameEvents === "undefined" || !GameEvents.SendCustomGameEventToServer) {
		ShowMMR_ProfileDebug("profile: refresh event unavailable");
		return false;
	}
	GameEvents.SendCustomGameEventToServer(name, payload);
	return true;
};

var ShowMMR_ProfileCalibration = function (root) {
	var panel = root.FindChildTraverse("MMRNumber"), calibrated = false;
	if (!panel) return -1;
	while (panel) {
		if (panel.BHasClass("MMRCalibrating")) return 0;
		if (panel.BHasClass("MMRNoData")) return -1;
		if (panel.BHasClass("MMRCalibrated")) calibrated = true;
		panel = panel.GetParent ? panel.GetParent() : null;
	}
	return calibrated ? 1 : -1;
};

var ShowMMR_ProfileReadMMR = function (root) {
	if (!root || !root.BHasClass("LocalUser") || ShowMMR_ProfileCalibration(root) !== 1) return -1;
	var label = root.FindChildTraverse("MMRNumber");
	var text = label ? label.text : "";
	if (!text || text.charAt(0) === "#") text = $.Localize("#ranked_mmr_value", label || root);

	if (!/^[\d\s,.]+$/.test(text)) return -1;
	var mmr = Number(text.replace(/[\s,.]/g, ""));
	return mmr > 0 && mmr <= 100000 ? mmr : -1;
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

var ShowMMR_ProfileAttachNewest = function (data, row, root, previous) {
	if (!data || !data.historyReady || data.storageBlocked || !row || !row.isRanked || row.epoch <= 0) return ShowMMR_ProfileCaptureStatus(data, "storage/row not ready");
	if (!root.BHasClass("LocalUser") || !root.BHasClass("PageVisible") || data.UIState !== 3) return false;
	if (!data.IsIdle || !data.IsIdle()) return ShowMMR_ProfileResetCandidate(data, root, "not idle");
	var pending = data.pending;
	if (pending && pending.phase === 3) {
		if (data.ReportedUncertainty !== data.historyRevision) {
			data.ReportedUncertainty = data.historyRevision;
			ShowMMR_ProfileDebug("profile: pending retained; uncertain reason=" + pending.reason);
		}
		return false;
	}
	var calibrated = ShowMMR_ProfileCalibration(root);
	var mmr = ShowMMR_ProfileCaptureFromOpenPage(root, data);
	if (calibrated < 0 || (calibrated === 1 && mmr < 1)) return ShowMMR_ProfileResetCandidate(data, root, "rating not ready calibrated=" + calibrated);
	var now = ShowMMR_ProfileNow();
	var signature = [data.user, data.historyRevision, row.epoch, previous, mmr, calibrated, row.finished, row.outcome, row.match_id || "0"].join(":");
	if (!data.Candidate || data.Candidate.root !== root || data.Candidate.signature !== signature) {
		data.Candidate = {root: root, signature: signature, since: now};
		return ShowMMR_ProfileCaptureStatus(data, "stabilizing " + signature);
	}
	if (now - data.Candidate.since < 3) return false;
	if (pending && pending.phase === 1 && row.epoch === pending.previous && mmr === pending.mmr && calibrated === 1) {
		ShowMMR_ProfileCaptureStatus(data, "baseline acknowledged epoch=" + row.epoch);
		return true;
	}
	if (data.LastSubmission === signature && now - (data.LastSubmittedAt || 0) < 10) return false;
	var name = "ShowMMR_Baseline";
	var payload = {user: data.user, idle: 1, calibrated: calibrated, mmr: mmr, at: now, previous: row.epoch};
	if (calibrated === 0) {
		if (!pending) return false;
	} else if (pending) {
		if (row.epoch <= pending.previous || row.epoch < pending.at) return ShowMMR_ProfileCaptureStatus(data, "history not newer than baseline");
		if (mmr === pending.mmr) return ShowMMR_ProfileCaptureStatus(data, "unchanged MMR epoch=" + row.epoch);
		if (!row.finished) return ShowMMR_ProfileCaptureStatus(data, "result unfinished epoch=" + row.epoch + " outcome=" + row.outcome);
		name = "ShowMMR_Refresh";
		payload.time = row.epoch;
		payload.previous = previous;
		payload.finished = 1;
		payload.outcome = row.outcome;
		// No guessed match ID. An identified pending match needs a matching row ID.
		if (row.match_id) payload.match_id = row.match_id;
	} else if (!row.finished) {
		return false;
	}
	if (ShowMMR_ProfileSend(name, payload)) {
		data.LastSubmission = signature;
		data.LastSubmittedAt = now;
		ShowMMR_ProfileDebug("profile: submitted " + name + " epoch=" + row.epoch + " mmr=" + mmr);
		ShowMMR_ProfileCaptureStatus(data, "awaiting save acknowledgement epoch=" + row.epoch);
	}
	return false; // Wait for the pending/history snapshot, not event submission.
};

var ShowMMR_ProfileScanRows = function () {
	if (!ShowMMR_ProfileScannerRunning) return;
	var data = null;
	try {
		var root = ShowMMR_ProfileRoot();
		if (!root || (root.IsValid && !root.IsValid())) {
			ShowMMR_ProfileScannerRunning = false;
			return;
		}
		data = ShowMMR_ProfileData(root);
		if (!data || !root.BHasClass("LocalUser") || !root.BHasClass("PageVisible") || root.visible === false || data.UIState !== 3) {
			if (data && data.Candidate && data.Candidate.root === root) {
				ShowMMR_ProfileResetCandidate(data, root, "page not active");
			}
			return;
		}

		var table = root.FindChildTraverse("RecentGamesTable");
		var rows = table ? table.FindChildrenWithClassTraverse("RecentGame") : root.FindChildrenWithClassTraverse("RecentGame");
		rows = rows || [];
		if (!ShowMMR_ProfileLoggedRows && rows.length > 0) {
			ShowMMR_ProfileLoggedRows = true;
			ShowMMR_ProfileDebug("profile: rows=" + rows.length);
		}

		var ranked = [], incomplete = false;
		for (var i = 0; i < rows.length; i++) {
			var row = ShowMMR_ProfileRecentGames(rows[i]);
			if (!row || (row.isRanked && row.epoch <= 0)) incomplete = true;
			if (row && row.isRanked && row.epoch > 0) ranked.push(row);
		}
		ranked.sort(function (a, b) { return b.epoch - a.epoch; });
		var newestRanked = ranked[0];
		if (newestRanked && data.LastCandidateEpoch !== newestRanked.epoch) {
			data.LastCandidateEpoch = newestRanked.epoch;
			ShowMMR_ProfileDebug("profile: newest ranked candidate epoch=" + newestRanked.epoch + " known=" + (newestRanked.known ? 1 : 0) + " match_id=" + (newestRanked.match_id || "unavailable"));
		}
		var done = false;
		if (!incomplete) done = ShowMMR_ProfileAttachNewest(data, newestRanked, root, ranked.length > 1 ? ranked[1].epoch : 0);
		else {
			ShowMMR_ProfileResetCandidate(data, root, "incomplete rows total=" + rows.length + " ranked=" + ranked.length);
		}
		if (data.Refreshing && (done || Date.now() >= data.RefreshDeadline)) {
			data.Refreshing = false;
			$.DispatchEvent("DOTANavigateBack", root);
		}
		ShowMMR_ProfileLastScanError = "";
	} catch (error) {
		ShowMMR_ProfileResetCandidate(data, root, "scan failed");
		if (ShowMMR_ProfileLastScanError !== String(error)) {
			ShowMMR_ProfileLastScanError = String(error);
			ShowMMR_ProfileDebug("profile: scan failed: " + error);
		}
	} finally {
		if (ShowMMR_ProfileScannerRunning) $.Schedule(1.0, ShowMMR_ProfileScanRows);
	}
};

var ShowMMR_ProfileStartScanner = function () {
	if (ShowMMR_ProfileScannerRunning) return;

	ShowMMR_ProfileScannerRunning = true;
	ShowMMR_ProfileScanRows();
};

var ShowMMR_ProfileValue = function () {
	var root = ShowMMR_ProfileRoot();
	if (!root) return;
	var data = ShowMMR_ProfileData(root);
	if (!data) return;
	if (!ShowMMR_ProfileLoggedInit) {
		ShowMMR_ProfileLoggedInit = true;
		ShowMMR_ProfileDebug("profile: loaded");
	}

	ShowMMR_ProfileStartScanner();
};
