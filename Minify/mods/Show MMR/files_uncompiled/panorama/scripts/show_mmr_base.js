"use strict";

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

var ShowMMR_LoadHistory = function (data) {
	if (!data || data.historyReady) return;

	data.history = {};
	if (typeof CustomNetTables === "undefined" || !CustomNetTables.GetAllTableValues) return;

	var history = CustomNetTables.GetAllTableValues("ShowMMR_history") || [];
	var count = 0;
	for (var i = 0; i < history.length; ++i) {
		var kv = history[i].value;
		if (!kv) continue;

		for (var key in kv) {
			if (!Object.prototype.hasOwnProperty.call(kv, key)) continue;
			var value = kv[key];
			data.history[parseInt(key, 10)] = [value["1"], value["2"]];
			count++;
		}
	}
	if (count > 0) {
		data.historyReady = true;
		data.historyRetries = 0;
		return;
	}

	data.historyRetries = (data.historyRetries || 0) + 1;
	if (data.historyRetries > 10) return;

	$.Schedule(1.0, function () {
		var retry = ShowMMR_GetData();
		ShowMMR_LoadHistory(retry);
		$.DispatchEvent("DOTABackgroundLastMatchUpdated");
	});
};

var ShowMMR_GameUIStateChanged = function (oldState, newState) {
	if (oldState !== 1 || newState !== 3) return;

	var data = ShowMMR_GetData();
	if (!data) return;

	if (data.show == null) data.show = {};
	ShowMMR_LoadHistory(data);
	$.DispatchEvent("DOTABackgroundLastMatchUpdated");
};

var ShowMMR_Refresh = function () {
	var data = ShowMMR_GetData();
	if (!data || data.Refreshing) return;

	var now = Date.now ? Date.now() : (new Date()).getTime();
	if (data.StartupGraceUntil && now < data.StartupGraceUntil) return;
	if (data.LastRefreshAt && now - data.LastRefreshAt < 30000) return;
	data.LastRefreshAt = now;

	data.Refreshing = true;
	data.retries = 8;
	$.DispatchEvent("DOTAShowLocalProfileHeroStatsPage");
};

var ShowMMR_AccountUpdated = function () {
	var data = ShowMMR_GetData();
	if (!data) return;

	ShowMMR_LoadHistory(data);
	$.DispatchEvent("DOTABackgroundLastMatchUpdated");
};

var ShowMMR_RankUpdated = function () {
	ShowMMR_AccountUpdated();
	$.Schedule(8.0, ShowMMR_Refresh);
};

var ShowMMR_TableUpdated = function (_, key, value) {
	var data = ShowMMR_GetData();
	if (!data) return;

	ShowMMR_LoadHistory(data);
	data.history[parseInt(key, 10)] = [value["1"], value["2"]];
	data.historyReady = true;
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

	$.RegisterForUnhandledEvent("DOTAGameUIStateChanged", ShowMMR_GameUIStateChanged);
	$.RegisterForUnhandledEvent("DOTARankUpdated", ShowMMR_RankUpdated);
	$.RegisterForUnhandledEvent("DOTAGameAccountClientUpdated", ShowMMR_AccountUpdated);
	if (typeof CustomNetTables !== "undefined" && CustomNetTables.SubscribeNetTableListener) {
		CustomNetTables.SubscribeNetTableListener("ShowMMR_update", ShowMMR_TableUpdated);
	}

	ShowMMR_GameUIStateChanged(1, 3);
};
