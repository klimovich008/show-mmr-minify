-- ShowMMR dashboard mod by AveYo, ported to Minify.

if not IsServer() then return end

if ShowMMR == nil then ShowMMR = class({}) end

function ShowMMR:LoadPending(value)
	if value == nil then return end

	local user, mmr, at, match_id, processed = tostring(value):match('^showmmr_pending_v2:(%d+):(%d+):(%d+):(%d*):(%d+)$')
	if user ~= nil then
		self.pending_user = user
		self.pending = {
			mmr = tonumber(mmr) or 0,
			at = tonumber(at) or 0,
			match_id = match_id ~= '' and match_id or '0',
			processed = tonumber(processed) or 0
		}
		return
	end

	local mmr, at, match_id, processed = tostring(value):match('^showmmr_pending:(%d+):(%d+):(%d*):(%d+)$')
	if mmr == nil then return end

	self.pending_user = nil
	self.pending = {
		mmr = tonumber(mmr) or 0,
		at = tonumber(at) or 0,
		match_id = match_id ~= '' and match_id or '0',
		processed = tonumber(processed) or 0
	}
end

function ShowMMR:PublishPending()
	self.pending = self.pending or {mmr = 0, at = 0, match_id = '0', processed = 1}
	if CustomNetTables then
		CustomNetTables:SetTableValue('ShowMMR_pending', 'state', {
			mmr = self.pending.mmr or 0,
			at = self.pending.at or 0,
			match_id = tostring(self.pending.match_id or '0'),
			processed = self.pending.processed or 0
		})
	end
end

function ShowMMR:SavePending()
	if self.pending_bind == nil then self.pending_bind = 'JOY32' end
	self.pending = self.pending or {mmr = 0, at = 0, match_id = '0', processed = 1}

	local value = 'showmmr_pending_v2:' ..
		tostring(self.user or 0) .. ':' ..
		tostring(tonumber(self.pending.mmr) or 0) .. ':' ..
		tostring(tonumber(self.pending.at) or 0) .. ':' ..
		tostring(self.pending.match_id or '0') .. ':' ..
		tostring(tonumber(self.pending.processed) or 0)
	print('[ShowMMR] pending save ' .. value)
	SendToServerConsole('bindss 3 ' .. self.pending_bind .. ' "' .. value .. '";')
	SendToServerConsole('writekeybindings | grep % ^;')
end

function ShowMMR:Init(e)
	if GameRules then return end

	self.user = e.networkid:match('^%[%a:[0-5]:(%d+).*%]$') or 0
	self.data = self.data or {}
	self.matches = self.matches or {}
	self.history = self.history or {}
	self.pending = self.pending or {mmr = 0, at = 0, match_id = '0', processed = 1}
	self.pending_bind = 'JOY32'

	if self.bind == nil then
		self.bind = {}
		for i = 1, 31 do table.insert(self.bind, 'JOY' .. i) end
	end

	local data_file, data_path = nil, nil
	local data_paths = {
		{path = 'cfg/user_keys_' .. self.user .. '_slot3.vcfg', shared = false},
		{path = 'cfg/user_keys_0_slot3.vcfg', shared = true}
	}
	for _, candidate in ipairs(data_paths) do
		data_file = LoadKeyValues(candidate.path)
		if data_file ~= nil then
			data_path = candidate.path
			if candidate.shared and data_file.bindings ~= nil then
				local pending_user = tostring(data_file.bindings[self.pending_bind] or ''):match('^showmmr_pending_v2:(%d+):')
				if tostring(pending_user or '') ~= tostring(self.user) then
					print('[ShowMMR] ignore shared bindings path=' .. data_path .. ' user=' .. tostring(pending_user or 'none'))
					data_file = nil
				end
			end
			if data_file ~= nil then break end
		end
	end
	print('[ShowMMR] load bindings path=' .. tostring(data_path or 'none'))
	if data_file ~= nil and data_file.bindings ~= nil then
		local list = {}
		for _, hotkey in ipairs(self.bind) do
			local val = data_file.bindings[hotkey]
			if val ~= nil and val:sub(11, 11) == ':' and val:sub(12, 12) == '[' then
				table.insert(list, val)
			end
		end
		if #list > 0 then
			self.data = json.decode('{' .. table.concat(list, ',') .. '}') or {}
			vlua.tableadd(self.history, self.data)
		end
		self:LoadPending(data_file.bindings[self.pending_bind])
	end

	if data_file ~= nil and data_file.matches ~= nil then
		for _, v in pairs(data_file.matches) do
			self.matches[v.date] = {v.mmr, v.outcome}
		end
		vlua.tableadd(self.history, self.matches)
	end

	local kv, i, j, limit = {}, 1, 1, 500
	for k, v in pairs(self.history) do
		kv[' ' .. k] = {v[1], v[2]}
		i = i + 1
		if i > limit then
			if table.clear == nil then require 'table.clear' end
			CustomNetTables:SetTableValue('ShowMMR_history', 'kv' .. j, kv)
			j = j + 1
			i = 1
			table.clear(kv)
		end
	end
	CustomNetTables:SetTableValue('ShowMMR_history', 'kv', kv)
	self:PublishPending()

	local history_count = 0
	for _ in pairs(self.history) do history_count = history_count + 1 end
	print('[ShowMMR] init user=' .. tostring(self.user) .. ' history=' .. tostring(history_count) .. ' pending_mmr=' .. tostring(self.pending.mmr) .. ' pending_match_id=' .. tostring(self.pending.match_id))

	if self.cfg == nil then
		self.cfg = {}

		Convars:RegisterCommand('cfg', function(_, key, _, val, ...)
			if key and key:match('%l[%l%d_]+') and val then
				self.cfg[key] = val
				if key == 'recent_game_time_3' then
					self:Save({round_name = 'cfg_updated'})
				end
				if key == 'cfg_updated' and val == '1' then
					FireGameEvent('round_start', {round_name = 'cfg_updated', round_number = 1})
				end
			end
		end, 'pipe console keyvalue-like output to vscript cfg [recent_game_time_1=timestamp]..', 0)

		if CustomGameEventManager then
			CustomGameEventManager:RegisterListener('ShowMMR_Refresh', function(...) return ShowMMR:Refresh(...) end)
			CustomGameEventManager:RegisterListener('ShowMMR_Pending', function(...) return ShowMMR:Pending(...) end)
			CustomGameEventManager:RegisterListener('ShowMMR_PostGame', function(...) return ShowMMR:PostGame(...) end)
		end
	end
end

function ShowMMR:Pending(_, e)
	if e == nil then return end

	self.pending = self.pending or {mmr = 0, at = 0, match_id = '0', processed = 1}
	local mmr = tonumber(e.mmr) or 0
	if mmr > 0 then self.pending.mmr = mmr end
	if self.pending.mmr == nil then self.pending.mmr = 0 end

	local at = tonumber(e.at) or 0
	if at > 0 then self.pending.at = at end
	if e.match_id ~= nil and tostring(e.match_id) ~= '' and tostring(e.match_id) ~= '0' then
		self.pending.match_id = tostring(e.match_id)
	end
	self.pending.processed = 0

	print('[ShowMMR] pending reason=' .. tostring(e.reason or 'unknown') .. ' mmr=' .. tostring(self.pending.mmr) .. ' match_id=' .. tostring(self.pending.match_id) .. ' at=' .. tostring(self.pending.at))
	self:PublishPending()
	self:SavePending()
end

function ShowMMR:PostGame(_, e)
	if e == nil then return end

	e.reason = 'postgame'
	self:Pending(nil, e)
	print('[ShowMMR] postgame match_id=' .. tostring(e.match_id or '0'))
end

function ShowMMR:Refresh(_, e)
	if e == nil then return end

	self.mmr = tonumber(e.mmr) or -1
	if self.mmr < 0 then return end

	local manual_time = tonumber(e.time) or 0
	local manual_change = e.change ~= nil and tonumber(e.change) or nil
	print('[ShowMMR] refresh mmr=' .. tostring(self.mmr) .. ' time=' .. tostring(manual_time) .. ' change=' .. tostring(manual_change))
	if manual_time > 0 then
		self.cfg.recent_game_time_1 = tostring(manual_time)
		self.manual_change = manual_change
		self:Save({round_name = 'cfg_updated'})
		self.manual_change = nil

		self.pending = self.pending or {}
		self.pending.mmr = self.mmr
		self.pending.processed = 1
		self:PublishPending()
		self:SavePending()
		return
	end

	SendToServerConsole('dota_game_account_client_debug | cfg;')
end

function ShowMMR:Save(e)
	if type(e) ~= 'table' or e.round_name ~= 'cfg_updated' then return end

	local time_1, time_2, time_3 = self.cfg.recent_game_time_1, self.cfg.recent_game_time_2, self.cfg.recent_game_time_3
	local find_1, find_2, find_3 = self.history[tonumber(time_1)], self.history[tonumber(time_2)], self.history[tonumber(time_3)]
	local rank_1 = self.mmr or 0
	local serialize = false

	if time_1 ~= nil and rank_1 > 0 and (find_1 == nil or find_1[1] == 0 or find_1[2] == 0) then
		local change, t = 0, tonumber(time_1)
		if self.manual_change ~= nil then
			change = self.manual_change
		elseif find_2 ~= nil and find_2[1] > 0 then
			change = rank_1 - find_2[1]
		end
		vlua.tableadd(self.data, {[t] = {rank_1, change}})
		vlua.tableadd(self.history, {[t] = {rank_1, change}})
		CustomNetTables:SetTableValue('ShowMMR_update', ' ' .. time_1, {rank_1, change})
		serialize = true
	end

	if find_2 ~= nil and find_2[1] > 0 and find_2[2] == 0 and find_3 ~= nil and find_3[1] > 1 then
		local rank_2, change, t = find_2[1], find_2[1] - find_3[1], tonumber(time_2)
		vlua.tableadd(self.data, {[t] = {rank_2, change}})
		vlua.tableadd(self.history, {[t] = {rank_2, change}})
		CustomNetTables:SetTableValue('ShowMMR_update', ' ' .. time_2, {rank_2, change})
		serialize = true
	end

	local fixup = -1
	local ordered = {}
	for n in pairs(self.data) do table.insert(ordered, n) end
	table.sort(ordered, function(a, b) return a > b end)
	for _, v in ipairs(ordered) do
		local v1, v2 = self.data[v][1], self.data[v][2]
		if fixup == -1 and v1 ~= 0 and v2 == 0 then fixup = v end
		if fixup ~= -1 and v1 ~= 0 and v1 ~= self.data[fixup][1] then
			self.data[fixup][2] = self.data[fixup][1] - v1
			CustomNetTables:SetTableValue('ShowMMR_update', ' ' .. fixup, {self.data[fixup][1], self.data[fixup][2]})
			fixup = -1
			serialize = true
		end
	end

	if serialize == true then
		print('[ShowMMR] saving bindings entries=' .. tostring(#ordered))
		if table.nkeys == nil then require 'table.nkeys' end
		local remain, limit, pages, line, text = table.nkeys(self.data), table.nkeys(self.bind), 1, 0, ''
		for _, v in ipairs(ordered) do
			line = line + 1
			text = text .. ',' .. v .. ':[' .. self.data[v][1] .. ',' .. self.data[v][2] .. ']'
			if line == remain or line == math.min(20, remain) then
				SendToServerConsole('bindss 3 ' .. self.bind[pages] .. ' "' .. text:sub(2) .. '";')
				remain = remain - line
				line = 0
				pages = pages + 1
				text = ''
				if pages > limit then break end
			end
		end
		SendToServerConsole('writekeybindings | grep % ^;')
	end
end

ListenToGameEvent('player_connect', Dynamic_Wrap(ShowMMR, 'Init'), ShowMMR)
ListenToGameEvent('round_start', Dynamic_Wrap(ShowMMR, 'Save'), ShowMMR)
