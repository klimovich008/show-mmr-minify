"use strict";

var ShowMMR_Debug = function (message) {
	$.Msg("[ShowMMR] " + message);
};

var ShowMMR_Now = function () {
	return Math.floor((Date.now ? Date.now() : (new Date()).getTime()) / 1000);
};

var ShowMMR_GetDashboardCore = function () {
	var dashboard = $("#Dashboard");
	return dashboard ? dashboard.FindChildInLayoutFile("DashboardCore") : null;
};

var ShowMMR_GetData = function () {
	var core = ShowMMR_GetDashboardCore();
	if (!core) return null;

	core.Data.ShowMMR = core.Data.ShowMMR || {};
	return core.Data.ShowMMR;
};

var ShowMMR_ToNumber = function (value, fallback) {
	var number = Number(value);
	return isFinite(number) ? number : fallback;
};

var ShowMMR_SendEvent = function (name, payload) {
	if (typeof GameEvents === "undefined" || !GameEvents.SendCustomGameEventToServer) return false;
	GameEvents.SendCustomGameEventToServer(name, payload || {});
	return true;
};

var ShowMMR_ApplyPending = function (data, pending) {
	if (!data || !pending) return;

	data.PendingStartMMR = ShowMMR_ToNumber(pending.mmr, data.PendingStartMMR || 0);
	data.PendingStartedAt = ShowMMR_ToNumber(pending.at, data.PendingStartedAt || 0);
	data.PendingMatchId = String(pending.match_id || data.PendingMatchId || "0");
	data.PendingProcessed = ShowMMR_ToNumber(pending.processed, data.PendingProcessed || 0);
};

var ShowMMR_LoadPending = function (data) {
	if (!data || typeof CustomNetTables === "undefined" || !CustomNetTables.GetTableValue) return;
	ShowMMR_ApplyPending(data, CustomNetTables.GetTableValue("ShowMMR_pending", "state"));
};

var ShowMMR_LoadHistory = function (data) {
	if (!data || data.historyReady) return;

	data.history = {};
	data.latestHistoryEpoch = 0;
	data.latestHistoryMMR = -1;
	if (typeof CustomNetTables === "undefined" || !CustomNetTables.GetAllTableValues) return;

	var history = CustomNetTables.GetAllTableValues("ShowMMR_history") || [];
	var count = 0;
	for (var i = 0; i < history.length; ++i) {
		var kv = history[i].value;
		if (!kv) continue;

		for (var key in kv) {
			if (!Object.prototype.hasOwnProperty.call(kv, key)) continue;
			var value = kv[key];
			var epoch = parseInt(key, 10);
			var mmr = ShowMMR_ToNumber(value["1"], -1);
			data.history[epoch] = [mmr, ShowMMR_ToNumber(value["2"], -1)];
			if (epoch > data.latestHistoryEpoch && mmr > 0) {
				data.latestHistoryEpoch = epoch;
				data.latestHistoryMMR = mmr;
			}
			count++;
		}
	}
	if (count > 0) {
		data.historyReady = true;
		data.historyRetries = 0;
		ShowMMR_Debug("base: history loaded count=" + count + " latest=" + data.latestHistoryEpoch + " mmr=" + data.latestHistoryMMR);
		return;
	}

	data.historyRetries = (data.historyRetries || 0) + 1;
	if (data.historyRetries > 10) {
		ShowMMR_Debug("base: history empty after retries");
		return;
	}

	$.Schedule(1.0, function () {
		var retry = ShowMMR_GetData();
		ShowMMR_LoadHistory(retry);
		$.DispatchEvent("DOTABackgroundLastMatchUpdated");
	});
};

var ShowMMR_IsDashboard = function () {
	return typeof GameUI === "undefined" || !GameUI.GetDotaGameUIState || GameUI.GetDotaGameUIState() === 3;
};

var ShowMMR_MarkPending = function (reason) {
	var data = ShowMMR_GetData();
	if (!data) return;

	ShowMMR_LoadPending(data);
	var mmr = ShowMMR_ToNumber(data.LastMMR, -1);
	if (mmr < 1) mmr = ShowMMR_ToNumber(data.latestHistoryMMR, -1);

	var payload = {
		mmr: mmr > 0 ? mmr : 0,
		at: ShowMMR_Now(),
		reason: reason || "unknown"
	};
	if (data.PendingMatchId) payload.match_id = data.PendingMatchId;

	data.PendingStartMMR = payload.mmr;
	data.PendingStartedAt = payload.at;
	data.PendingProcessed = 0;
	ShowMMR_Debug("base: pending reason=" + payload.reason + " mmr=" + payload.mmr + " match_id=" + (payload.match_id || "0"));
	ShowMMR_SendEvent("ShowMMR_Pending", payload);
};

var ShowMMR_GameUIStateChanged = function (oldState, newState) {
	ShowMMR_Debug("base: ui_state old=" + oldState + " new=" + newState);
	if (oldState === 3 && newState !== 3) ShowMMR_MarkPending("leave_dashboard_" + newState);
	if (newState !== 3) return;

	var data = ShowMMR_GetData();
	if (!data) return;

	if (data.show == null) data.show = {};
	ShowMMR_LoadHistory(data);
	ShowMMR_LoadPending(data);
	$.DispatchEvent("DOTABackgroundLastMatchUpdated");

	if (oldState !== 1 && oldState !== 3) {
		$.Schedule(20.0, function () {
			ShowMMR_Refresh(true);
		});
	}
};

var ShowMMR_Refresh = function (force) {
	var data = ShowMMR_GetData();
	if (!data || data.Refreshing) return;
	if (!ShowMMR_IsDashboard()) {
		ShowMMR_Debug("base: refresh skipped outside dashboard");
		return;
	}

	var now = Date.now ? Date.now() : (new Date()).getTime();
	if (!force && data.StartupGraceUntil && now < data.StartupGraceUntil) return;
	if (data.LastRefreshAt && now - data.LastRefreshAt < 30000) return;
	data.LastRefreshAt = now;

	ShowMMR_Debug("base: refresh profile force=" + (force ? 1 : 0));
	data.Refreshing = true;
	data.retries = 8;
	$.DispatchEvent("DOTAShowLocalProfileHeroStatsPage");
};

var ShowMMR_AccountUpdated = function () {
	var data = ShowMMR_GetData();
	if (!data) return;

	data.historyReady = false;
	ShowMMR_LoadHistory(data);
	ShowMMR_LoadPending(data);
	$.DispatchEvent("DOTABackgroundLastMatchUpdated");
};

var ShowMMR_RankUpdated = function () {
	ShowMMR_Debug("base: rank updated");
	ShowMMR_AccountUpdated();
	$.Schedule(8.0, ShowMMR_Refresh);
};

var ShowMMR_TableUpdated = function (_, key, value) {
	var data = ShowMMR_GetData();
	if (!data) return;

	ShowMMR_LoadHistory(data);
	var epoch = parseInt(key, 10);
	data.history[epoch] = [value["1"], value["2"]];
	data.historyReady = true;
	if (epoch > (data.latestHistoryEpoch || 0) && value["1"] > 0) {
		data.latestHistoryEpoch = epoch;
		data.latestHistoryMMR = value["1"];
	}
	ShowMMR_Debug("base: table update epoch=" + epoch + " mmr=" + value["1"] + " change=" + value["2"]);
};

var ShowMMR_PendingUpdated = function (_, key, value) {
	var data = ShowMMR_GetData();
	if (!data) return;

	ShowMMR_ApplyPending(data, value);
	ShowMMR_Debug("base: pending update mmr=" + (value && value.mmr) + " match_id=" + (value && value.match_id) + " processed=" + (value && value.processed));
};

var ShowMMR_Init = function () {
	var data = ShowMMR_GetData();
	if (!data) {
		$.Schedule(1.0, ShowMMR_Init);
		return;
	}

	if (data.Installed) return;
	data.Installed = true;
	data.StartupGraceUntil = (Date.now ? Date.now() : (new Date()).getTime()) + 120000;
	ShowMMR_Debug("base: loaded");

	$.RegisterForUnhandledEvent("DOTAGameUIStateChanged", ShowMMR_GameUIStateChanged);
	$.RegisterForUnhandledEvent("DOTARankUpdated", ShowMMR_RankUpdated);
	$.RegisterForUnhandledEvent("DOTAGameAccountClientUpdated", ShowMMR_AccountUpdated);
	if (typeof CustomNetTables !== "undefined" && CustomNetTables.SubscribeNetTableListener) {
		CustomNetTables.SubscribeNetTableListener("ShowMMR_update", ShowMMR_TableUpdated);
		CustomNetTables.SubscribeNetTableListener("ShowMMR_pending", ShowMMR_PendingUpdated);
	}

	ShowMMR_GameUIStateChanged(1, 3);
	$.Schedule(45.0, function () {
		ShowMMR_Refresh(true);
	});
};
