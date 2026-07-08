-- ShowMMR dashboard mod by AveYo, ported to Minify.

if not IsServer() then return end

if ShowMMR == nil then ShowMMR = class({}) end

function ShowMMR:StorageUser(bindings)
	if bindings == nil then return nil end

	local marker = tostring(bindings.JOY32 or '')
	return marker:match('^showmmr_user:(%d+)$')
end

function ShowMMR:HasHistory(bindings)
	if bindings == nil then return false end

	for _, hotkey in ipairs(self.bind or {}) do
		local val = bindings[hotkey]
		if val ~= nil and val:sub(11, 11) == ':' and val:sub(12, 12) == '[' then return true end
	end
	return false
end

function ShowMMR:HasStorage(data_file)
	if data_file == nil then return false end

	return self:HasHistory(data_file.bindings) or self:StorageUser(data_file.bindings) ~= nil
end

function ShowMMR:SaveMarker()
	if self.user == nil then return end

	SendToServerConsole('bindss 3 JOY32 "showmmr_user:' .. tostring(self.user) .. '";')
end

function ShowMMR:Init(e)
	if GameRules then return end

	self.user = e.networkid:match('^%[%a:[0-5]:(%d+).*%]$') or 0
	self.data = self.data or {}
	self.history = self.history or {}

	if self.bind == nil then
		self.bind = {}
		for i = 1, 31 do table.insert(self.bind, 'JOY' .. i) end
	end

	local data_file, data_path = nil, nil
	-- The absolute path is a best-effort candidate for the default Steam install;
	-- LoadKeyValues resolves it when Steam userdata lives on C:. Other layouts
	-- fall through to the Dota cfg search paths below.
	local data_paths = {
		{path = 'C:/Program Files (x86)/Steam/userdata/' .. self.user .. '/570/local/cfg/user_keys_0_slot3.vcfg', shared = false},
		{path = 'cfg/user_keys_' .. self.user .. '_slot3.vcfg', shared = false},
		{path = 'cfg/user_keys_0_slot3.vcfg', shared = true}
	}
	for _, candidate in ipairs(data_paths) do
		local candidate_file = LoadKeyValues(candidate.path)
		if candidate_file ~= nil then
			if not self:HasStorage(candidate_file) then
				print('[ShowMMR] ignore empty bindings path=' .. candidate.path)
			elseif candidate.shared then
				local storage_user = self:StorageUser(candidate_file.bindings)
				if tostring(storage_user or '') ~= tostring(self.user) then
					print('[ShowMMR] ignore shared bindings path=' .. candidate.path .. ' user=' .. tostring(storage_user or 'none'))
				else
					data_file = candidate_file
					data_path = candidate.path
					break
				end
			else
				data_file = candidate_file
				data_path = candidate.path
				break
			end
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
	end

	if CustomNetTables then
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
	end

	local history_count = 0
	for _ in pairs(self.history) do history_count = history_count + 1 end
	print('[ShowMMR] init user=' .. tostring(self.user) .. ' history=' .. tostring(history_count))

	if self.cfg == nil then
		self.cfg = {}

		Convars:RegisterCommand('showmmr_cfg', function(_, key, _, val, ...)
			if key and key:match('^%l[%l%d_]+$') and val then
				self.cfg[key] = val
				if key == 'recent_game_time_3' then
					self:Save({round_name = 'cfg_updated'})
				end
				if key == 'cfg_updated' and val == '1' then
					FireGameEvent('round_start', {round_name = 'cfg_updated', round_number = 1})
				end
			end
		end, 'pipe console keyvalue-like output to ShowMMR [recent_game_time_1=timestamp]..', 0)

		if CustomGameEventManager then
			CustomGameEventManager:RegisterListener('ShowMMR_Refresh', function(...) return ShowMMR:Refresh(...) end)
		end
	end
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
		return
	end

	SendToServerConsole('dota_game_account_client_debug | showmmr_cfg;')
end

function ShowMMR:Save(e)
	if type(e) ~= 'table' or e.round_name ~= 'cfg_updated' then return end

	local time_1, time_2, time_3 = self.cfg.recent_game_time_1, self.cfg.recent_game_time_2, self.cfg.recent_game_time_3
	local find_1, find_2, find_3 = self.history[tonumber(time_1)], self.history[tonumber(time_2)], self.history[tonumber(time_3)]
	local rank_1 = self.mmr or 0
	local serialize = false

	if time_1 ~= nil and rank_1 > 0 then
		local change, t = 0, tonumber(time_1)
		if self.manual_change ~= nil then
			change = self.manual_change
		elseif find_2 ~= nil and find_2[1] > 0 then
			change = rank_1 - find_2[1]
		end
		if t ~= nil and (find_1 == nil or find_1[1] ~= rank_1 or find_1[2] ~= change) then
			vlua.tableadd(self.data, {[t] = {rank_1, change}})
			vlua.tableadd(self.history, {[t] = {rank_1, change}})
			if CustomNetTables then CustomNetTables:SetTableValue('ShowMMR_update', ' ' .. time_1, {rank_1, change}) end
			serialize = true
		end
	end

	if find_2 ~= nil and find_2[1] > 0 and find_2[2] == 0 and find_3 ~= nil and find_3[1] > 1 then
		local rank_2, change, t = find_2[1], find_2[1] - find_3[1], tonumber(time_2)
		vlua.tableadd(self.data, {[t] = {rank_2, change}})
		vlua.tableadd(self.history, {[t] = {rank_2, change}})
		if CustomNetTables then CustomNetTables:SetTableValue('ShowMMR_update', ' ' .. time_2, {rank_2, change}) end
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
			if CustomNetTables then CustomNetTables:SetTableValue('ShowMMR_update', ' ' .. fixup, {self.data[fixup][1], self.data[fixup][2]}) end
			fixup = -1
			serialize = true
		end
	end

	if serialize == true then
		print('[ShowMMR] saving bindings entries=' .. tostring(#ordered))
		if table.nkeys == nil then require 'table.nkeys' end
		-- Capacity: 31 pages (JOY1-JOY31) x 20 records = 620. Records are written
		-- newest-first, so on overflow the oldest records are dropped from storage.
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
				if pages > limit then
					print('[ShowMMR] storage capacity reached, oldest ' .. tostring(remain) .. ' record(s) not saved')
					break
				end
			end
		end
		self:SaveMarker()
		SendToServerConsole('writekeybindings | grep % ^;')
	end
end

ListenToGameEvent('player_connect', Dynamic_Wrap(ShowMMR, 'Init'), ShowMMR)
ListenToGameEvent('round_start', Dynamic_Wrap(ShowMMR, 'Save'), ShowMMR)
