"use strict";

// Read-only transport check. Never send a baseline or Begin from an unverified view.
var ShowMMR_MatchProbeAttempts = 0, ShowMMR_MatchProbeLast = "", ShowMMR_MatchProbeRunning = false;
var ShowMMR_MatchProbe = function () {
	var panel = $.GetContextPanel();
	if (!panel || !panel.IsValid() || ShowMMR_MatchProbeAttempts++ >= 30) {
		ShowMMR_MatchProbeRunning = false;
		return;
	}
	try {
		var idLabel = panel.FindChildTraverse("MatchID");
		var sample = {
			source: panel.id || panel.paneltype,
			match_id: $.Localize("{s:match_id}", idLabel || panel),
			label: idLabel ? idLabel.text : "",
			state: typeof Game !== "undefined" && typeof Game.GetState === "function" ? Game.GetState() : -1,
			match_api: typeof Game !== "undefined" && typeof Game.GetMatchID === "function" ? 1 : 0
		};
		var signature = JSON.stringify(sample);
		if (signature !== ShowMMR_MatchProbeLast) {
			ShowMMR_MatchProbeLast = signature;
			$.Msg("[ShowMMR] match probe: " + signature);
			if (typeof GameEvents !== "undefined" && GameEvents.SendCustomGameEventToServer) {
				GameEvents.SendCustomGameEventToServer("ShowMMR_Probe", {source: sample.source});
			}
		}
	} catch (error) {
		$.Msg("[ShowMMR] match probe failed: " + error);
	} finally {
		$.Schedule(1.0, ShowMMR_MatchProbe);
	}
};

var ShowMMR_MatchProbeStart = function () {
	ShowMMR_MatchProbeAttempts = 0;
	ShowMMR_MatchProbeLast = "";
	if (ShowMMR_MatchProbeRunning) return;
	ShowMMR_MatchProbeRunning = true;
	ShowMMR_MatchProbe();
};

// Dota preloads PreGame at startup; wake the bounded probe again on entering a game.
$.RegisterForUnhandledEvent("DOTAGameUIStateChanged", ShowMMR_MatchProbeStart);
$.Schedule(0.0, ShowMMR_MatchProbeStart);
