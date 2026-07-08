"use strict";

var ShowMMR_Debug = function (message) {
	$.Msg("[ShowMMR] " + message);
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

var ShowMMR_GameUIStateChanged = function (oldState, newState) {
	ShowMMR_Debug("base: ui_state old=" + oldState + " new=" + newState);
	if (newState !== 3) return;

	var data = ShowMMR_GetData();
	if (!data) return;

	if (data.show == null) data.show = {};
	ShowMMR_LoadHistory(data);
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
	var mmr = ShowMMR_ToNumber(value["1"], -1);
	var change = ShowMMR_ToNumber(value["2"], -1);
	data.history[epoch] = [mmr, change];
	data.historyReady = true;
	if (epoch > (data.latestHistoryEpoch || 0) && mmr > 0) {
		data.latestHistoryEpoch = epoch;
		data.latestHistoryMMR = mmr;
	}
	ShowMMR_Debug("base: table update epoch=" + epoch + " mmr=" + mmr + " change=" + change);
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
	}

	ShowMMR_GameUIStateChanged(1, 3);
	$.Schedule(45.0, function () {
		ShowMMR_Refresh(true);
	});
};
