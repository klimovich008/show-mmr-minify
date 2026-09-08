"use strict";

// Read-only discovery: do not submit historical records until identity is verified.
var ShowMMR_BattleRead = function (root) {
	if (!root || !root.IsValid()) return;
	try {
		var dashboard = $("#Dashboard"), core = root.FindAncestor("DashboardCore") || (dashboard && dashboard.FindChildInLayoutFile("DashboardCore"));
		var data = core && core.Data.ShowMMR;
		var header = root.FindChildTraverse("MatchesColumnsHeader");
		var list = root.FindChildTraverse("MatchesList");
		if (!header || !list) return;
		var headers = [], rows = list.FindChildrenWithClassTraverse("MatchRow"), samples = [];
		for (var h = 0; h < header.GetChildCount(); h++) {
			headers.push($.Localize("{s:column_name}", header.GetChild(h)));
		}
		for (var i = 0; i < Math.min(rows.length, 3); i++) {
			var cells = [];
			for (var c = 0; c < rows[i].GetChildCount(); c++) {
				var cell = rows[i].GetChild(c), label = cell.FindChildTraverse("StatValue");
				cells.push(label ? label.text : cell.text || "");
			}
			samples.push(cells);
		}
		var signature = JSON.stringify({local: root.BHasClass("LocalUser"), visible: root.BHasClass("PageVisible"), headers: headers, rows: samples, count: rows.length});
		if (samples.length && signature !== root._showMMRBattleSample) {
			root._showMMRBattleSample = signature;
			if (!(data && data.options && data.options.verbose === false)) $.Msg("[ShowMMR] dota_plus read-only: " + signature);
		}
	} catch (error) {
		if (root._showMMRBattleError !== String(error)) {
			root._showMMRBattleError = String(error);
			$.Msg("[ShowMMR] dota_plus read failed: " + error);
		}
	} finally {
		$.Schedule(2.0, function () { ShowMMR_BattleRead(root); });
	}
};

var ShowMMR_BattleStart = function () {
	var root = $.GetContextPanel();
	while (root && root.paneltype !== "DOTAProfileBattleStatsPage") root = root.GetParent();
	if (!root || root._showMMRBattleStarted) return;
	root._showMMRBattleStarted = true;
	$.Msg("[ShowMMR] dota_plus: reader loaded");
	ShowMMR_BattleRead(root);
};

$.Schedule(0.0, ShowMMR_BattleStart);
