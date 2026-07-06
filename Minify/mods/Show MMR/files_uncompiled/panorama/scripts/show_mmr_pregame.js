"use strict";

(function () {
	var PREFIX = "[ShowMMR]";
	var VERSION = "0.1.0";
	var lastSignature = "";

	if ($.ShowMMRPregameLoaded) {
		$.Msg(PREFIX + " pregame: already loaded v" + VERSION);
		return;
	}
	$.ShowMMRPregameLoaded = true;

	var log = function (message) {
		$.Msg(PREFIX + " " + message);
	};

	var safeText = function (value, maxLength) {
		if (value === null || typeof value === "undefined") return "";
		var text = String(value).replace(/\s+/g, " ").replace(/"/g, "'").trim();
		if (maxLength && text.length > maxLength) return text.substring(0, maxLength - 1) + "...";
		return text;
	};

	var now = function () {
		return Math.floor((Date.now ? Date.now() : (new Date()).getTime()) / 1000);
	};

	var readMatchId = function () {
		try {
			if (typeof Game !== "undefined" && typeof Game.GetMatchID === "function") return safeText(Game.GetMatchID(), 32);
		} catch (err) {
		}
		return "";
	};

	var readState = function () {
		try {
			if (typeof Game !== "undefined" && typeof Game.GetState === "function") return safeText(Game.GetState(), 32);
		} catch (err) {
		}
		return "";
	};

	var sendPending = function (reason, matchId) {
		if (typeof GameEvents === "undefined" || !GameEvents.SendCustomGameEventToServer) return;
		GameEvents.SendCustomGameEventToServer("ShowMMR_Pending", {
			mmr: 0,
			at: now(),
			match_id: matchId || "0",
			reason: reason
		});
	};

	var scan = function () {
		var root = $.GetContextPanel();
		if (!root || root.visible === false) return schedule();

		var matchId = readMatchId();
		var state = readState();
		var signature = matchId + "|" + state;
		if (signature !== lastSignature) {
			lastSignature = signature;
			log("pregame: scan v" + VERSION + " match_id=" + (matchId || "0") + " state=" + (state || "unknown"));
			sendPending("pregame", matchId);
		}
		schedule();
	};

	var schedule = function () {
		$.Schedule(5.0, scan);
	};

	log("pregame: loaded v" + VERSION);
	scan();
})();
