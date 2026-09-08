-- ShowMMR dashboard mod by AveYo, ported to Minify.
print('[ShowMMR] Lua context: server=' .. tostring(IsServer()) .. ' client_console=' .. type(SendToConsole) ..
    ' events=' .. type(ListenToGameEvent) .. ' rules=' .. type(GameRules))
if not IsServer() then return end
if ShowMMR == nil then ShowMMR = class({}) end

local function integer(value, minimum, maximum)
	local n = tonumber(value)
	return n and n == math.floor(n) and n >= minimum and n <= maximum and n or nil
end

function ShowMMR:StorageUser(bindings)
	local marker = tostring((bindings or {}).JOY32 or '')
	return marker:match('^showmmr_user:(%d+)$') or marker:match('^showmmr_user:(%d+):p1:')
end

local function match_id(value)
	local text = tostring(value or '')
	-- Keep uint64 IDs as strings; Lua doubles cannot represent all of them exactly.
	if not text:match('^%d+$') or (#text > 1 and text:sub(1, 1) == '0') then return nil end
	if #text > 20 or (#text == 20 and text > '18446744073709551615') then return nil end
	return text
end

function ShowMMR:ReadPending(marker)
	if marker == '' or marker == 'showmmr_user:' .. self.user then return nil, true end
	local user, phase, mmr, at, previous, id, started, reason = marker:match(
		'^showmmr_user:(%d+):p1:(%d+):(%d+):(%d+):(%d+):(%d+):(%d+):(%d+)$')
	phase, mmr = integer(phase, 1, 3), integer(mmr, 1, 100000)
	at, previous = integer(at, 1000000000, 9999999999), integer(previous, 0, 9999999999)
	started, reason = integer(started, 0, 9999999999), integer(reason, 0, 3)
	id = match_id(id)
	if user ~= self.user or not phase or not mmr or not at or not previous or not id
		or not started or not reason or previous >= at then return nil, false end
	if phase == 1 and (id ~= '0' or started ~= 0 or reason ~= 0) then return nil, false end
	if phase == 2 and (id == '0' or started < at or reason ~= 0) then return nil, false end
	if phase == 3 and reason == 0 then return nil, false end
	if (id == '0' and started ~= 0) or (id ~= '0' and started < at) then return nil, false end
	return {phase=phase, mmr=mmr, at=at, previous=previous, match_id=id, started=started, reason=reason}, true
end

function ShowMMR:Marker()
	local marker = 'showmmr_user:' .. self.user
	local p = self.pending
	if p then
		marker = marker .. ':p1:' .. table.concat(
			{p.phase, p.mmr, p.at, p.previous, p.match_id, p.started, p.reason}, ':')
	end
	return marker
end

function ShowMMR:ReadBindings(bindings)
	local records, pending = {}, nil
	for i = 1, 32 do
		local value = tostring(bindings['JOY' .. i] or '')
		if i == 32 then
			local valid
			pending, valid = self:ReadPending(value)
			if not valid then return nil end
		elseif value ~= '' then
			-- Preserve the original numeric-key binding format, but decode strict JSON.
			if not value:match('^%d+:%[') then return nil end
			local quoted = value:gsub('(%d+):%[', '"%1":[')
			local ok, page = pcall(json.decode, '{' .. quoted .. '}')
			if not ok or type(page) ~= 'table' then return nil end
			for key, record in pairs(page) do
				-- Ten-digit match epochs are compatible with the existing on-disk format.
				local epoch = integer(key, 1000000000, 9999999999)
				if not epoch or type(record) ~= 'table' or #record ~= 2
					or not integer(record[1], 0, 100000) or not integer(record[2], -100000, 100000)
					or records[epoch] then return nil end
				records[epoch] = {record[1], record[2]}
			end
		end
	end
	return records, pending
end

function ShowMMR:Publish()
	if not CustomNetTables then return end
	self.revision = (self.revision or 0) + 1
	local page, pages, count, size = {}, 0, 0, 0
	for epoch, record in pairs(self.data) do
		page[' ' .. epoch] = {record[1], record[2]}
		count, size = count + 1, size + 1
		if size == 100 then
			pages = pages + 1
			CustomNetTables:SetTableValue('ShowMMR_history', 'page' .. pages,
				{user = self.user, revision = self.revision, records = page})
			page, size = {}, 0
		end
	end
	if size > 0 then
		pages = pages + 1
		CustomNetTables:SetTableValue('ShowMMR_history', 'page' .. pages,
			{user = self.user, revision = self.revision, records = page})
	end
	-- Publish the header last; clients wait for every page of this revision.
	CustomNetTables:SetTableValue('ShowMMR_history', 'state',
		{user = self.user, revision = self.revision, pages = pages, count = count,
		 blocked = self.blocked and 1 or 0, pending = self.pending or {phase=0}})
end

function ShowMMR:Init(e)
	if GameRules or type(e) ~= 'table' then return end
	local user = tostring(e.networkid or ''):match('^%[U:1:(%d+)%]$')
	if not integer(user, 1, 4294967295) or self.user == user then return end
	self.user, self.data, self.blocked, self.pending = user, {}, false, nil
	self.outcomeConflict = nil
	local paths = LoadKeyValues('scripts/show_mmr_paths.txt') or {}
	local steam = paths.steam_root or 'C:/Program Files (x86)/Steam'
	local candidates = {
		{path = steam .. '/userdata/' .. user .. '/570/local/cfg/user_keys_0_slot3.vcfg'},
		{path = 'cfg/user_keys_' .. user .. '_slot3.vcfg'},
		{path = 'cfg/user_keys_0_slot3.vcfg', shared = true}
	}
	for _, candidate in ipairs(candidates) do
		local file = LoadKeyValues(candidate.path)
		if type(file) == 'table' then
			local bindings = file.bindings
			-- A parsed empty config is empty storage, not permission to resurrect a fallback.
			if bindings == nil and next(file) == nil then bindings = {} end
			local owner = type(bindings) == 'table' and self:StorageUser(bindings) or nil
			if candidate.shared and owner ~= user then
				print('[ShowMMR] ignore shared bindings path=' .. candidate.path)
			else
				local records, pending
				if type(bindings) == 'table' then records, pending = self:ReadBindings(bindings) end
				if records then self.data, self.pending = records, pending else self.blocked = true end
				print('[ShowMMR] load path=' .. candidate.path .. ' blocked=' .. tostring(self.blocked))
				-- An existing account file, including an empty one, is authoritative.
				break
			end
		end
	end
	self:Publish()
	print('[ShowMMR] init user=' .. user .. ' revision=' .. tostring(self.revision))
	if not self.listener and CustomGameEventManager then
		self.listener = true
		CustomGameEventManager:RegisterListener('ShowMMR_Refresh', function(...) return self:Refresh(...) end)
		CustomGameEventManager:RegisterListener('ShowMMR_Baseline', function(...) return self:Baseline(...) end)
		CustomGameEventManager:RegisterListener('ShowMMR_Begin', function(...) return self:Begin(...) end)
		CustomGameEventManager:RegisterListener('ShowMMR_Probe', function(_, payload)
			if type(payload) == 'table' then
				print('[ShowMMR] dashboard received probe user=' .. self.user .. ' source=' .. tostring(payload.source):sub(1, 64))
			end
		end)
	end
end

function ShowMMR:OwnEvent(e)
	return type(e) == 'table' and self.user and not self.blocked and tostring(e.user) == self.user
end

function ShowMMR:SavePending()
	if not self.user or self.blocked then return end
	SendToServerConsole('bindss 3 JOY32 "' .. self:Marker() .. '";')
	SendToServerConsole('writekeybindings | grep % ^;')
	print('[ShowMMR] pending write queued phase=' .. tostring(self.pending and self.pending.phase or 0))
	self:Publish()
end

function ShowMMR:Uncertain(reason)
	if not self.pending or self.pending.phase == 3 then return end
	self.pending.phase, self.pending.reason = 3, reason
	print('[ShowMMR] pending retained: uncertain reason=' .. reason)
	self:SavePending()
end

function ShowMMR:Baseline(_, e)
	if not self:OwnEvent(e) then return end
	if tonumber(e.calibrated) == 0 then self:Uncertain(3); return end
	if tonumber(e.idle) ~= 1 or tonumber(e.calibrated) ~= 1 then return end
	local mmr, at = integer(e.mmr, 1, 100000), integer(e.at, 1000000000, 9999999999)
	local previous = integer(e.previous, 0, 9999999999)
	if not mmr or not at or not previous or previous >= at then return end
	if self.pending then
		-- Never refresh an unresolved baseline from a post-match or reconnect view.
		if self.pending.phase == 1 and self.pending.previous == previous and self.pending.mmr ~= mmr then
			self:Uncertain(3) -- Rating changed without a corresponding completed match.
		end
		return
	end
	for epoch in pairs(self.data) do if epoch > previous then return end end
	self.pending = {phase=1, mmr=mmr, at=at, previous=previous, match_id='0', started=0, reason=0}
	self:SavePending()
end

function ShowMMR:Begin(_, e)
	if not self:OwnEvent(e) or tonumber(e.before_start) ~= 1 then return end
	local p, id = self.pending, match_id(e.match_id)
	local at = integer(e.at, 1000000000, 9999999999)
	if not p or p.phase == 3 or not id or id == '0' or not at or at < p.at then return end
	if p.phase == 2 then
		if p.match_id ~= id then self:Uncertain(2) end
		return
	end
	p.phase, p.match_id, p.started = 2, id, at
	self:SavePending()
end

function ShowMMR:Reconcile(e)
	local p = self.pending
	if not p or p.phase == 3 or tonumber(e.idle) ~= 1 or tonumber(e.finished) ~= 1
		or tonumber(e.calibrated) ~= 1 then return end
	local mmr, epoch = integer(e.mmr, 1, 100000), integer(e.time, 1000000000, 9999999999)
	local previous, at = integer(e.previous, 0, 9999999999), integer(e.at, 1000000000, 9999999999)
	if not mmr or not epoch or not previous or not at or epoch >= at or epoch < p.at then return end
	if mmr == p.mmr then return end -- GC can publish history before the new rating.
	local change, outcome = mmr - p.mmr, integer(e.outcome, -1, 1)
	if not outcome or outcome == 0 or change * outcome < 0 then
		if self.outcomeConflict ~= epoch then
			print('[ShowMMR] reconcile waiting: missing/conflicting outcome epoch=' .. epoch)
			self.outcomeConflict = epoch
		end
		return -- Keep the baseline: stale UI or an unrelated rating adjustment is not a result.
	end
	self.outcomeConflict = nil
	if previous ~= p.previous then self:Uncertain(1); return end
	if p.match_id ~= '0' and match_id(e.match_id) ~= p.match_id then return end
	for time in pairs(self.data) do if time > epoch then self:Uncertain(1); return end end
	local known = self.data[epoch]
	if known and (known[1] ~= mmr or known[2] ~= change) then self:Uncertain(2); return end
	self.data[epoch] = {mmr, change}
	-- The post-match observation becomes the next pre-match baseline only after reconciliation.
	self.pending = {phase=1, mmr=mmr, at=at, previous=epoch, match_id='0', started=0, reason=0}
	print('[ShowMMR] reconciled epoch=' .. epoch .. ' change=' .. change)
	self:Save()
end

function ShowMMR:Refresh(_, e)
	if not self:OwnEvent(e) then return end
	if self.pending and tonumber(e.calibrated) == 0 then self:Uncertain(3); return end
	self:Reconcile(e)
end

function ShowMMR:Save()
	if not self.user or self.blocked or not self.data then return end
	local ordered, pages, page, kept, size = {}, {}, {}, {}, 0
	for epoch in pairs(self.data) do table.insert(ordered, epoch) end
	table.sort(ordered, function(a, b) return a > b end)
	for _, epoch in ipairs(ordered) do
		local record = self.data[epoch]
		local text = epoch .. ':[' .. record[1] .. ',' .. record[2] .. ']'
		if #page == 20 or size + #text + (#page > 0 and 1 or 0) > 500 then
			table.insert(pages, table.concat(page, ','))
			page, size = {}, 0
		end
		if #pages == 31 then break end
		size = size + #text + (#page > 0 and 1 or 0)
		table.insert(page, text)
		kept[epoch] = record
	end
	if #page > 0 then table.insert(pages, table.concat(page, ',')) end
	-- ponytail: bounded newest-first history, at most 620 records; no compression.
	self.data = kept
	for i = 1, 31 do
		SendToServerConsole('bindss 3 JOY' .. i .. ' "' .. (pages[i] or '') .. '";')
	end
	SendToServerConsole('bindss 3 JOY32 "' .. self:Marker() .. '";')
	SendToServerConsole('writekeybindings | grep % ^;')
	print('[ShowMMR] binding write queued pages=' .. #pages)
	self:Publish()
end

ListenToGameEvent('player_connect', Dynamic_Wrap(ShowMMR, 'Init'), ShowMMR)
