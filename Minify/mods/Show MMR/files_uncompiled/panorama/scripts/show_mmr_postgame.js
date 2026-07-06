"use strict";

(function () {
	var PREFIX = "[ShowMMR]";
	var VERSION = "0.1.0";
	var MAX_PANELS = 900;
	var attempt = 0;
	var lastSignature = "";

	if ($.ShowMMRPostgameLoaded) {
		$.Msg(PREFIX + " postgame: already loaded v" + VERSION);
		return;
	}
	$.ShowMMRPostgameLoaded = true;

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

	var panelText = function (panel) {
		try {
			if (panel && typeof panel.text !== "undefined") return safeText(panel.text, 120);
		} catch (err) {
		}
		return "";
	};

	var children = function (panel) {
		var list = [];
		try {
			var count = panel.GetChildCount();
			for (var index = 0; index < count; index++) list.push(panel.GetChild(index));
		} catch (err) {
		}
		return list;
	};

	var walk = function (root) {
		var panels = [];
		var queue = [root];
		var head = 0;
		while (head < queue.length && panels.length < MAX_PANELS) {
			var panel = queue[head++];
			if (!panel) continue;
			panels.push(panel);
			var kids = children(panel);
			for (var index = 0; index < kids.length; index++) queue.push(kids[index]);
		}
		return panels;
	};

	var findText = function (root, ids) {
		for (var index = 0; index < ids.length; index++) {
			try {
				var panel = root.FindChildTraverse(ids[index]);
				var text = panelText(panel);
				if (text) return text;
			} catch (err) {
			}
		}
		return "";
	};

	var flattenText = function (root, limit) {
		var parts = [];
		var panels = walk(root);
		for (var index = 0; index < panels.length && parts.length < limit; index++) {
			var text = panelText(panels[index]);
			if (text) parts.push(text);
		}
		return parts;
	};

	var readMatchId = function (root) {
		var text = findText(root, ["MatchID", "MatchId", "match_id"]);
		var match = text.match(/\d{5,}/);
		return match ? match[0] : "";
	};

	var sendPostgame = function (matchId) {
		if (!matchId || typeof GameEvents === "undefined" || !GameEvents.SendCustomGameEventToServer) return;
		GameEvents.SendCustomGameEventToServer("ShowMMR_PostGame", {
			match_id: matchId,
			at: now()
		});
	};

	var scan = function () {
		attempt++;
		var root = $.GetContextPanel();
		if (!root || root.visible === false) return schedule();

		var matchId = readMatchId(root);
		var raw = flattenText(root, 28).join(" | ");
		var signature = matchId + "|" + raw;
		if (signature && signature !== lastSignature) {
			lastSignature = signature;
			log("postgame: scan v" + VERSION + " match_id=" + (matchId || "0") + " raw=" + safeText(raw, 500));
			sendPostgame(matchId);
		}
		schedule();
	};

	var schedule = function () {
		$.Schedule(attempt < 10 ? 2.0 : 5.0, scan);
	};

	log("postgame: loaded v" + VERSION);
	scan();
})();
