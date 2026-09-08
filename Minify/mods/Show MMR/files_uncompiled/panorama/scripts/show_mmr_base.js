"use strict";

var ShowMMR_DebugEnabled = true;
var ShowMMR_WatchError = "";
var ShowMMR_Debug = function (message) {
	var data = ShowMMR_GetData();
	if (ShowMMR_DebugEnabled && !(data && data.options && data.options.verbose === false)) $.Msg("[ShowMMR] " + message);
};

var ShowMMR_GetData = function () {
	var dashboard = $("#Dashboard");
	var core = dashboard ? dashboard.FindChildInLayoutFile("DashboardCore") : null;
	if (!core) return null;
	core.Data.ShowMMR = core.Data.ShowMMR || {};
	return core.Data.ShowMMR;
};

var ShowMMR_LoadHistory = function (data) {
	if (!data) return;
	var candidate = data.Candidate;
	data.Candidate = null;
	data.historyReady = false;
	if (typeof CustomNetTables === "undefined") return;
	var state = CustomNetTables.GetTableValue("ShowMMR_history", "state");
	if (!state) return;
	var history = {}, count = 0;
	for (var i = 1; i <= state.pages; i++) {
		var page = CustomNetTables.GetTableValue("ShowMMR_history", "page" + i);
		if (!page || page.revision !== state.revision || String(page.user) !== String(state.user)) return;
		for (var key in page.records) {
			if (!Object.prototype.hasOwnProperty.call(page.records, key)) continue;
			var epoch = Number(key), value = page.records[key];
			if (!isFinite(epoch) || epoch < 1000000000 || !value ||
				!isFinite(Number(value["1"])) || !isFinite(Number(value["2"]))) return;
			history[epoch] = [Number(value["1"]), Number(value["2"])];
			count++;
		}
	}
	if (count !== Number(state.count)) return;
	var pending = state.pending;
	pending = pending && Number(pending.phase) > 0 ? {
		phase: Number(pending.phase), mmr: Number(pending.mmr), at: Number(pending.at),
		previous: Number(pending.previous), match_id: String(pending.match_id),
		started: Number(pending.started), reason: Number(pending.reason)
	} : null;
	// Lua revisions restart with the VM; only a complete, identical snapshot is a cache hit.
	var snapshot = JSON.stringify([String(state.user), state.revision, Number(state.blocked), pending, history]);
	if (data.historySnapshot === snapshot) {
		data.Candidate = candidate;
		data.historyReady = true;
		return;
	}
	if (data.user !== String(state.user)) {
		data.LastAttachedAt = 0;
		data.Candidate = null;
		data.InitialBaselineRequested = false;
		data.CaptureRequested = false;
	}
	data.user = String(state.user);
	data.history = history;
	data.show = {};
	data.historyRevision = state.revision;
	data.historySnapshot = snapshot;
	data.LastSubmission = null;
	data.ReportedUncertainty = null;
	data.storageBlocked = Number(state.blocked) === 1;
	data.pending = pending;
	data.historyReady = true; // Empty is a valid, fully loaded account snapshot.
	ShowMMR_Debug("base: history user=" + data.user + " count=" + count + " revision=" + state.revision + " blocked=" + state.blocked);
	if (data.pending) ShowMMR_Debug("base: pending phase=" + data.pending.phase + " mmr=" + data.pending.mmr +
		" previous=" + data.pending.previous + " at=" + data.pending.at + " match_id=" + data.pending.match_id);
	$.DispatchEvent("DOTABackgroundLastMatchUpdated");
};

var ShowMMR_IsDashboard = function () {
	var data = ShowMMR_GetData();
	return data && data.UIState === 3;
};

var ShowMMR_IsIdle = function () {
	var dashboard = $("#Dashboard");
	var play = dashboard && dashboard.FindChildTraverse ? dashboard.FindChildTraverse("Play") : null;
	if (!ShowMMR_IsDashboard() || !play || play.paneltype !== "DOTAPlay") return false;
	if (dashboard.BHasClass("IsInGame") || dashboard.BHasClass("Connecting") || dashboard.BHasClass("PreConnected")) return false;
	var active = ["CanReconnect", "CanDisconnect", "CanAbandonGame", "CanSafeLeaveGame", "Connecting", "ReconnectInProgress",
		"InReadyUp", "ReturningToQueue", "FindMsgInFlight", "LobbyVisible"];
	for (var i = 0; i < active.length; i++) if (play.BHasClass(active[i])) return false;
	if (play.BHasClass("PlayButtonStartsSearching") || play.BHasClass("FindingMatch")) return true;
	// With the side panel closed, native Dota exposes idle through its button label.
	var idleLabel = $.Localize("#dota_play");
	return idleLabel !== "#dota_play" && idleLabel !== "" && $.Localize("{s:play_button_label}", play) === idleLabel;
};

var ShowMMR_WatchDashboard = function () {
	var data = null;
	try {
		data = ShowMMR_GetData();
		if (!data) return;
		var idle = ShowMMR_IsIdle();
		var dashboard = $("#Dashboard"), play = dashboard && dashboard.FindChildTraverse ? dashboard.FindChildTraverse("Play") : null;
		var queued = !!(play && play.BHasClass("FindingMatch"));
		if (ShowMMR_DebugEnabled && play) {
			var nativeState = "type=" + play.paneltype + " label=" + $.Localize("{s:play_button_label}", play);
			if (data.LastNativePlayState !== nativeState) {
				data.LastNativePlayState = nativeState;
				ShowMMR_Debug("base: play " + nativeState);
			}
		}
		if (idle && data.historyReady && !data.storageBlocked && (!data.pending || data.pending.phase !== 3)) {
			if (!data.InitialBaselineRequested || (!data.WasQueued && queued) || data.WasIdle === false) {
				data.CaptureRequested = true;
			}
			if (data.CaptureRequested && ShowMMR_Refresh(true)) {
				data.CaptureRequested = false;
				data.InitialBaselineRequested = true;
			}
		}
		if (data.WasIdle !== idle) ShowMMR_Debug("base: capture_idle=" + (idle ? 1 : 0));
		data.WasIdle = idle;
		data.WasQueued = queued;
		ShowMMR_WatchError = "";
	} catch (error) {
		if (data) {
			data.Candidate = null;
			data.CaptureRequested = true;
			data.Refreshing = false;
		}
		if (ShowMMR_WatchError !== String(error)) {
			ShowMMR_WatchError = String(error);
			ShowMMR_Debug("base: watch failed: " + error);
		}
	} finally {
		$.Schedule(1.0, ShowMMR_WatchDashboard);
	}
};

var ShowMMR_Refresh = function (force, manual) {
	var data = ShowMMR_GetData();
	if (!data || data.Refreshing || !ShowMMR_IsIdle()) return;
	if (!manual && data.options && data.options.auto === false) return;
	var now = Date.now();
	if (!force && data.StartupGraceUntil && now < data.StartupGraceUntil) return;
	if (data.LastRefreshAt && now - data.LastRefreshAt < 30000) return;
	data.LastRefreshAt = now;
	data.Refreshing = true;
	data.RefreshDeadline = now + 25000;
	data.Candidate = null;
	ShowMMR_Debug("base: refresh profile");
	$.DispatchEvent("DOTAShowLocalProfileHeroStatsPage");
	$.Schedule(26.0, function () {
		// A missing/replaced profile layout must not lock out every future refresh.
		if (data.Refreshing && Date.now() >= data.RefreshDeadline) {
			data.Refreshing = false;
			ShowMMR_Debug("base: profile refresh timed out status=" + (data.CaptureStatus || "no scan") +
				" candidate_age=" + (data.Candidate ? Math.floor(Date.now() / 1000) - data.Candidate.since : "none"));
		}
	});
	return true;
};

var ShowMMR_GameUIStateChanged = function (oldState, newState) {
	var data = ShowMMR_GetData();
	if (!data) return;
	data.UIState = Number(newState);
	ShowMMR_Debug("base: ui_state=" + data.UIState);
	data.Candidate = null;
	if (Number(newState) !== 3) { data.Refreshing = false; return; }
	ShowMMR_LoadHistory(data);
	$.DispatchEvent("DOTABackgroundLastMatchUpdated");
	if (oldState !== 1 && oldState !== 3) {
		$.Schedule(12.0, function () { ShowMMR_Refresh(true); });
	}
};

var ShowMMR_AccountUpdated = function () {
	ShowMMR_LoadHistory(ShowMMR_GetData());
};

var ShowMMR_RankUpdated = function () {
	ShowMMR_AccountUpdated();
	$.Schedule(5.0, function () { ShowMMR_Refresh(false); });
};

var ShowMMR_Init = function () {
	var data = ShowMMR_GetData();
	if (!data) { $.Schedule(1.0, ShowMMR_Init); return; }
	if (data.Installed) return;
	data.Installed = true;
	data.IsIdle = ShowMMR_IsIdle;
	data.RefreshHistory = function () { return ShowMMR_Refresh(true, true); };
	data.StartupGraceUntil = Date.now() + 120000;
	ShowMMR_Debug("base: loaded");
	ShowMMR_Debug("base: capabilities match_id=" + (typeof Game !== "undefined" && typeof Game.GetMatchID === "function") +
		" game_state=" + (typeof Game !== "undefined" && typeof Game.GetState === "function") +
		" client_console=" + (typeof GameInterfaceAPI !== "undefined" && typeof GameInterfaceAPI.ConsoleCommand === "function"));
	$.RegisterForUnhandledEvent("DOTAGameUIStateChanged", ShowMMR_GameUIStateChanged);
	$.RegisterForUnhandledEvent("DOTARankUpdated", ShowMMR_RankUpdated);
	$.RegisterForUnhandledEvent("DOTAGameAccountClientUpdated", ShowMMR_AccountUpdated);
	if (typeof CustomNetTables !== "undefined" && CustomNetTables.SubscribeNetTableListener) {
		CustomNetTables.SubscribeNetTableListener("ShowMMR_history", ShowMMR_AccountUpdated);
	}
	ShowMMR_GameUIStateChanged(1, 3);
	$.Schedule(1.0, ShowMMR_WatchDashboard);
	$.Schedule(45.0, function () { ShowMMR_Refresh(true); });
};
