if _G.MM2ValuesCleanup then
	pcall(_G.MM2ValuesCleanup)
end

local alive = true
_G.MM2ValuesCleanup = function()
	alive = false
end

local Players = game:GetService("Players")
local HttpService = game:GetService("HttpService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local StarterGui = game:GetService("StarterGui")

local LocalPlayer = Players.LocalPlayer
if not LocalPlayer then
	Players:GetPropertyChangedSignal("LocalPlayer"):Wait()
	LocalPlayer = Players.LocalPlayer
end

-- Use standard direct branch URL without refs/heads/ to prevent any 404/redirect errors in Roblox HttpGet
local RAW_JSON_URL = "https://raw.githubusercontent.com/Namedadude/Supreme-Values-MM2-Scraper/main/scraper%20beta/values_beta.json?nocache=" .. tostring(math.random(1, 1000000))

local Database = {}
local valueSource = "none"
local Sync

local detailsCache = {}
local valueCache = {}
local syncAssetIndex = {}
local indexBuilt = false

local function httpGet(url)
	local ok, res = pcall(function()
		if syn and syn.request then
			return syn.request({ Url = url, Method = "GET" }).Body
		elseif http_request then
			return http_request({ Url = url, Method = "GET" }).Body
		elseif request then
			return request({ Url = url, Method = "GET" }).Body
		elseif fluxus and fluxus.request then
			return fluxus.request({ Url = url, Method = "GET" }).Body
		else
			return game:HttpGet(url)
		end
	end)
	if ok and type(res) == "string" and #res > 10 then return res end
	return nil
end

local function loadLiveValues()
	local body = httpGet(RAW_JSON_URL)
	if not body then valueSource = "failed" return false end
	local ok, data = pcall(function() return HttpService:JSONDecode(body) end)
	if not ok or type(data) ~= "table" then valueSource = "failed" return false end
	local items = data.items or data
	if type(items) ~= "table" then valueSource = "failed" return false end

	Database = {}
	local count = 0
	for key, info in pairs(items) do
		if type(info) == "table" then
			local valStr = tostring(info.value or "N/A")
			local num = info.numericValue
			if valStr:lower():match("^x") or valStr:lower():match("t1") then
				num = 0
			end
			local itemObj = {
				name = info.name,
				value = valStr,
				val = num or 0,
				stability = info.stability,
				demand = info.demand,
				type = info.type,
				rarity = info.rarity,
				year = info.year,
				tier = info.tier
			}
			local kLower = tostring(key):lower()
			Database[kLower] = itemObj
			local noApos = kLower:gsub("['’`]", "")
			if not Database[noApos] then
				Database[noApos] = itemObj
			end
			count = count + 1
		end
	end

	if count < 1 then valueSource = "failed" return false end
	valueSource = "live (" .. tostring(count) .. ")"
	return true
end

local loaded = loadLiveValues()
print("[TradeValues] values: " .. tostring(valueSource))

local syncNameIndex = {}
local syncIdIndex = {}

local function buildSyncAssetIndex()
	if not Sync then return end
	syncAssetIndex = {}
	syncNameIndex = {}
	syncIdIndex = {}
	local count = 0
	for bagName, bag in pairs(Sync) do
		if type(bag) == "table" then
			for key, data in pairs(bag) do
				if type(data) == "table" then
					data.BagName = bagName
					local img = data.Image
					if img then
						local id = tostring(img):match("(%d+)")
						if id then
							local numId = tonumber(id)
							if numId then
								syncAssetIndex[numId] = data
								count = count + 1
							end
						end
					end
					if data.ItemID then
						local numId = tonumber(data.ItemID)
						if numId then syncAssetIndex[numId] = data count = count + 1 end
						syncIdIndex[tostring(data.ItemID):lower()] = data
					end
					if data.id then
						local numId = tonumber(data.id)
						if numId then syncAssetIndex[numId] = data end
						syncIdIndex[tostring(data.id):lower()] = data
					end
					if type(key) == "string" then
						syncIdIndex[key:lower()] = data
					elseif type(key) == "number" then
						syncAssetIndex[key] = data
					end
					local name = data.ItemName or data.Name or data.DisplayName
					if name and type(name) == "string" then
						syncNameIndex[name:lower()] = data
					end
				end
			end
		end
	end
	indexBuilt = true
end

task.spawn(function()
	local ok, mod = pcall(function()
		local root = ReplicatedStorage:FindFirstChild("ReplicatedStorage") or ReplicatedStorage
		local db = root:FindFirstChild("Database") or root:WaitForChild("Database", 5)
		if not db then return nil end
		local syncMod = db:FindFirstChild("Sync") or db:WaitForChild("Sync", 5)
		if not syncMod then return nil end
		return require(syncMod)
	end)
	if ok and mod then
		Sync = mod
		pcall(buildSyncAssetIndex)
	end
end)

local function getVariants(clean, base)
	local list = { clean }
	if clean ~= base then table.insert(list, base) end

	local noAposClean = clean:gsub("['’`]", "")
	local noAposBase = base:gsub("['’`]", "")
	local function has(tbl, val)
		for _, v in ipairs(tbl) do if v == val then return true end end
		return false
	end
	if not has(list, noAposClean) then table.insert(list, noAposClean) end
	if not has(list, noAposBase) then table.insert(list, noAposBase) end

	local plurals = {}
	for _, item in ipairs(list) do
		if item:sub(-3) == "ies" then
			table.insert(plurals, item:sub(1, -4) .. "y")
		elseif item:sub(-1) == "y" and item:sub(-2) ~= "ey" and item:sub(-2) ~= "ay" and item:sub(-2) ~= "oy" then
			table.insert(plurals, item:sub(1, -2) .. "ies")
		elseif item:sub(-1) == "s" and item:sub(-2) ~= "ss" and item:sub(-2) ~= "us" and item:sub(-2) ~= "is" then
			table.insert(plurals, item:sub(1, -2))
		elseif item:sub(-1) ~= "s" then
			table.insert(plurals, item .. "s")
		end
	end
	for _, p in ipairs(plurals) do
		if not has(list, p) then table.insert(list, p) end
	end
	return list
end

local function findItemId(slot)
	if not slot then return nil end
	local id = slot:GetAttribute("ItemID") or slot:GetAttribute("ID") or slot:GetAttribute("ItemId") or slot:GetAttribute("Weapon") or slot:GetAttribute("Item")
	if id then return tostring(id) end
	for _, name in ipairs({ "ItemID", "ID", "ItemId", "WeaponID" }) do
		local v = slot:FindFirstChild(name, true)
		if v and v:IsA("ValueBase") then return tostring(v.Value) end
	end
	return nil
end

local function findItemIdByIcon(slot)
	if not slot then return nil end
	local icon = slot:FindFirstChild("Icon", true) or slot:FindFirstChild("ImageLabel", true)
	if not icon or not icon:IsA("ImageLabel") then return nil end
	local img = icon.Image
	if not img or img == "" then return nil end
	local id = tostring(img):match("(%d+)")
	if id then return tonumber(id) end
	return nil
end

local function getItemDetails(slot, displayName)
	if not indexBuilt and Sync then
		pcall(buildSyncAssetIndex)
	end

	local assetId = findItemIdByIcon(slot)
	if assetId and detailsCache[assetId] then
		local cached = detailsCache[assetId]
		if cached.fromSync or not Sync then
			return cached.englishName, cached.rarity, cached.itemType, cached.isChroma, cached.year
		end
	end

	local itemId = findItemId(slot)
	local rawName = tostring(displayName or ""):gsub("%s*%b()", ""):gsub("%s*%b[]", ""):gsub("^%s+", ""):gsub("%s+$", "")

	local data = nil
	if rawName ~= "" and syncNameIndex[rawName:lower()] then
		data = syncNameIndex[rawName:lower()]
	elseif itemId and syncIdIndex[tostring(itemId):lower()] then
		data = syncIdIndex[tostring(itemId):lower()]
	elseif assetId and syncAssetIndex[assetId] then
		data = syncAssetIndex[assetId]
	elseif assetId and Sync then
		for offset = -15, 15 do
			local candidate = syncAssetIndex[assetId + offset]
			if candidate then
				local cName = candidate.ItemName or candidate.Name or candidate.DisplayName
				if cName and (cName:lower() == rawName:lower() or (itemId and tostring(candidate.ItemID or candidate.id or ""):lower() == tostring(itemId):lower())) then
					data = candidate
					break
				end
			end
		end
	end

	local englishName, rarity, itemType, year = nil, nil, nil, nil
	local isChroma = false

	if data then
		englishName = data.ItemName or data.Name or data.DisplayName
		rarity = data.Rarity
		itemType = data.ItemType or data.Type
		
		local bag = data.BagName
		if bag then
			local bLower = bag:lower()
			if bLower == "pets" or bLower == "walking" then
				itemType = "pet"
			elseif bLower:find("emote") or bLower:find("effect") or bLower:find("power") or bLower:find("ability") or bLower:find("perk") or bLower:find("skill") or bLower:find("radio") then
				itemType = "untradable"
			end
		end
		
		local extractedYear = data.Year
		if not extractedYear then
			for _, keyName in ipairs({ "Event", "Season", "ItemID", "id", "ItemName", "Name", "DisplayName" }) do
				local val = data[keyName]
				if val then
					local y = tostring(val):match("(20%d%d)")
					if y then
						extractedYear = y
						break
					end
				end
			end
		end
		year = extractedYear
		
		local dataId = tostring(data.ItemID or data.id or "")
		if dataId:lower():find("chroma") and not dataId:lower():find("chromatic") then
			isChroma = true
		end
	end

	if not isChroma and itemId then
		local idStr = tostring(itemId):lower()
		if idStr:find("chroma") and idStr:find("chromatic") == nil then
			isChroma = true
		end
	end

	if not englishName or englishName == "" then
		englishName = rawName ~= "" and rawName or (displayName or "")
	end

	if not itemType and englishName then
		local lowerName = englishName:lower()
		if lowerName:find("knife") or lowerName:find("blade") or lowerName:find("scythe") or lowerName:find("dagger") or lowerName:find("sword") or lowerName:find("axe") or lowerName:find("saw") then
			itemType = "knife"
		elseif lowerName:find("gun") or lowerName:find("luger") or lowerName:find("revolver") or lowerName:find("blaster") or lowerName:find("pistol") or lowerName:find("cannon") or lowerName:find("crossbow") or lowerName:find("harvester") then
			itemType = "gun"
		elseif lowerName:find("pet") then
			itemType = "pet"
		end
	end

	if slot then
		local container = slot:FindFirstChild("Container")
		local tags = slot:FindFirstChild("Tags")
		local function checkChromaTag(p)
			if not p then return false end
			for _, c in pairs(p:GetChildren()) do
				local cName = c.Name:lower()
				if cName:find("chroma") then return true end
				if c:IsA("TextLabel") and c.Text:lower():find("chroma") then return true end
			end
			return false
		end
		if checkChromaTag(tags) or checkChromaTag(container) or checkChromaTag(slot) then
			isChroma = true
		end
	end

	local dispLower = displayName and tostring(displayName):lower() or ""
	if dispLower:find("chroma") then
		isChroma = true
	end

	if englishName then englishName = tostring(englishName) end
	if rarity then rarity = tostring(rarity):lower() end
	if isChroma and englishName and not englishName:lower():find("^chroma") then
		englishName = "Chroma " .. englishName
	end

	-- Color variant name collision (Scratch)
	if englishName and englishName:lower() == "scratch" then
		local idStr = itemId and tostring(itemId):lower() or ""
		local dataIdStr = data and data.ItemID and tostring(data.ItemID):lower() or ""
		local slotName = slot and slot.Name:lower() or ""
		if idStr:find("blue") or dataIdStr:find("blue") or slotName:find("blue") then
			englishName = "Blue Scratch"
		elseif idStr:find("red") or dataIdStr:find("red") or slotName:find("red") then
			englishName = "Red Scratch"
		end
	end

	if assetId then
		detailsCache[assetId] = {
			englishName = englishName,
			rarity = rarity,
			itemType = itemType,
			isChroma = isChroma,
			year = year,
			fromSync = (data ~= nil)
		}
	end

	return englishName, rarity, itemType, isChroma, year
end

local function lookupDisplayAndNumericValue(displayName, slot)
	local assetId = findItemIdByIcon(slot)
	local cacheKey = tostring(displayName) .. "_" .. tostring(assetId or "nil")
	if valueCache[cacheKey] then
		local cached = valueCache[cacheKey]
		if cached.disp and cached.disp ~= "N/A" then
			return cached.disp, cached.val, cached.stability, cached.tier
		elseif cached.fromSync or not Sync then
			return cached.disp, cached.val, cached.stability, cached.tier
		end
	end

	local englishName, rarity, itemType, isChroma, year = getItemDetails(slot, displayName)
	if isChroma then
		rarity = "chroma"
	end

	if not englishName or englishName == "" then
		return "N/A", 0, "N/A", nil
	end

	if itemType and (itemType == "emote" or itemType == "effect" or itemType == "perk" or itemType == "untradable" or itemType == "power" or itemType == "ability" or itemType == "skill" or itemType == "radio") then
		valueCache[cacheKey] = { disp = nil, val = 0, stability = nil, tier = nil, fromSync = (Sync ~= nil) }
		return nil, 0, nil, nil
	end

	local clean = englishName:lower():gsub("^%s+", ""):gsub("%s+$", ""):gsub("%s*%b()", ""):gsub("%s*%b[]", ""):gsub("%s+$", "")
	local base = clean:gsub("%s+knife$", ""):gsub("%s+gun$", ""):gsub("%s+pet$", ""):gsub("^%s+", ""):gsub("%s+$", "")
	
	if base == "<3" or base == "heart pet" or base == "heart" then base = "<3" end
	if base == "neapolitan" then base = "neopolitan" end

	local names = getVariants(clean, base)

	local types = {}
	if itemType and itemType ~= "unknown" and itemType ~= "weapon" then
		table.insert(types, itemType)
	else
		table.insert(types, "knife")
		table.insert(types, "gun")
	end

	local candidates = {}
	for _, n in ipairs(names) do
		-- 1. Type + Rarity + Year
		if year and rarity then
			for _, t in ipairs(types) do
				table.insert(candidates, n .. " (" .. t .. ") (" .. rarity .. ") (" .. tostring(year) .. ")")
			end
		end
		-- 2. Type + Rarity
		if rarity then
			for _, t in ipairs(types) do
				table.insert(candidates, n .. " (" .. t .. ") (" .. rarity .. ")")
			end
		end
		-- 3. Non-type Rarity + Year
		if year and rarity then
			table.insert(candidates, n .. " (" .. rarity .. ") (" .. tostring(year) .. ")")
		end
		-- 4. Non-type Rarity
		if rarity then
			table.insert(candidates, n .. " (" .. rarity .. ")")
		end
		-- 5. Type + Year
		if year then
			for _, t in ipairs(types) do
				table.insert(candidates, n .. " (" .. t .. ") (" .. tostring(year) .. ")")
			end
		end
		-- 6. Type only
		for _, t in ipairs(types) do
			table.insert(candidates, n .. " (" .. t .. ")")
		end
		-- 7. Non-type Year
		if year then
			table.insert(candidates, n .. " (" .. tostring(year) .. ")")
		end
		-- 8. Simple Name
		table.insert(candidates, n)
	end

	local match = nil
	for _, c in ipairs(candidates) do
		if Database[c] ~= nil then
			match = Database[c]
			break
		end
	end

	-- Fallback 1: Year match
	if not match and year then
		local targetYear = tonumber(year)
		if targetYear then
			for dbKey, dbInfo in pairs(Database) do
				if dbInfo.year == targetYear then
					local dbBase = dbKey:gsub("%s*%b()", ""):gsub("%s+$", "")
					local dbNoApos = dbBase:gsub("['’`]", "")
					for _, n in ipairs(names) do
						if dbBase == n or dbNoApos == n then
							if dbInfo.type == itemType or dbInfo.type == "unknown" or not itemType or itemType == "weapon" then
								match = dbInfo
								break
							end
						end
					end
					if match then break end
				end
			end
		end
	end

	-- Fallback 2: Database scan by base name + rarity match
	if not match and rarity then
		for dbKey, dbInfo in pairs(Database) do
			local dbBase = dbKey:gsub("%s*%b()", ""):gsub("%s+$", "")
			local dbNoApos = dbBase:gsub("['’`]", "")
			for _, n in ipairs(names) do
				if dbBase == n or dbNoApos == n then
					if dbInfo.rarity and tostring(dbInfo.rarity):lower() == rarity then
						if dbInfo.type == itemType or dbInfo.type == "unknown" or not itemType or itemType == "weapon" then
							match = dbInfo
							break
						end
					end
				end
			end
			if match then break end
		end
	end

	-- Fallback 3: Single base match
	if not match then
		local matching = {}
		for dbKey, dbInfo in pairs(Database) do
			local dbBase = dbKey:gsub("%s*%b()", ""):gsub("%s+$", "")
			local dbNoApos = dbBase:gsub("['’`]", "")
			for _, n in ipairs(names) do
				if dbBase == n or dbNoApos == n then
					if dbInfo.type == itemType or dbInfo.type == "unknown" or not itemType or itemType == "weapon" then
						table.insert(matching, dbInfo)
						break
					end
				end
			end
		end
		if #matching == 1 then
			match = matching[1]
		elseif #matching > 1 then
			local firstVal = matching[1].value
			local allSame = true
			for i = 2, #matching do
				if matching[i].value ~= firstVal then
					allSame = false
					break
				end
			end
			if allSame then
				match = matching[1]
			end
		end
	end

	if match then
		valueCache[cacheKey] = { disp = match.value, val = match.val or 0, stability = match.stability, tier = match.tier, fromSync = (Sync ~= nil) }
		return match.value, match.val or 0, match.stability, match.tier
	end

	return "N/A", 0, "N/A", nil
end

local createdLabels = {}
local titleState = { yourBase = nil, theirBase = nil, yourTitle = nil, theirTitle = nil }

local function fmt(v)
	if not v or v == 0 then return "0" end
	local sign = v < 0 and "-" or ""
	v = math.abs(v)
	if v >= 1000000 then return sign .. string.format("%.1fM", v / 1000000) end
	if v >= 1000 then return sign .. string.format("%.1fK", v / 1000) end
	if v < 1 and v > 0 then
		local s = string.format("%.4f", v):gsub("0+$", ""):gsub("%.$", "")
		return sign .. s
	end
	return sign .. tostring(math.floor(v + 0.5))
end

local function addValueLabel(parent, itemName, slot, isOffer)
	if not parent then return end

	local disp, val, stability, tier = lookupDisplayAndNumericValue(itemName, slot)
	if not disp then
		local label = parent:FindFirstChild("ValueLabel")
		if label then
			pcall(function() label:Destroy() end)
		end
		local stabLabel = parent:FindFirstChild("StabilityLabel")
		if stabLabel then
			pcall(function() stabLabel:Destroy() end)
		end
		local tierLabel = parent:FindFirstChild("TierLabel")
		if tierLabel then
			pcall(function() tierLabel:Destroy() end)
		end
		return
	end
	
	local displayText = ""
	if disp:lower() == "n/a" then
		displayText = "N/A"
	elseif disp:sub(1, 1):lower() == "x" then
		displayText = disp
	else
		local cleanDisp = disp:gsub(",", "")
		local num = tonumber(cleanDisp)
		if num then
			displayText = fmt(num)
		else
			displayText = disp
		end
	end

	local label = parent:FindFirstChild("ValueLabel")
	if label and label:IsA("TextLabel") then
		if label.Text ~= displayText then
			label.Text = displayText
		end
		label.Position = UDim2.new(0, 4, 0, 4)
		label.ZIndex = 150
	else
		if label then
			pcall(function() label:Destroy() end)
		end
		label = Instance.new("TextLabel")
		label.Name = "ValueLabel"
		label.Size = UDim2.new(0.65, 0, 0, 14)
		label.Position = UDim2.new(0, 4, 0, 4)
		label.TextXAlignment = Enum.TextXAlignment.Left
		label.BackgroundTransparency = 1
		label.Text = displayText
		label.TextColor3 = Color3.fromRGB(255, 255, 255)
		label.TextScaled = true
		label.Font = Enum.Font.SourceSansBold
		label.ZIndex = 150
		label.TextStrokeTransparency = 0.5
		label.TextStrokeColor3 = Color3.fromRGB(0, 0, 0)
		label.Parent = parent
	end
	
	if isOffer then
		local found = false
		for _, l in ipairs(createdLabels) do
			if l == label then found = true break end
		end
		if not found then
			table.insert(createdLabels, label)
		end
	end

	-- Draw Stability Label underneath price
	local stabLabel = parent:FindFirstChild("StabilityLabel")
	if stability and stability ~= "N/A" and stability ~= "" then
		local stabColor = Color3.fromRGB(255, 255, 255)

		if stabLabel and stabLabel:IsA("TextLabel") then
			if stabLabel.Text ~= stability then
				stabLabel.Text = stability
			end
			stabLabel.TextColor3 = stabColor
			stabLabel.Position = UDim2.new(0, 4, 0, 18)
			stabLabel.ZIndex = 150
		else
			if stabLabel then
				pcall(function() stabLabel:Destroy() end)
			end
			stabLabel = Instance.new("TextLabel")
			stabLabel.Name = "StabilityLabel"
			stabLabel.Size = UDim2.new(0.65, 0, 0, 10)
			stabLabel.Position = UDim2.new(0, 4, 0, 18)
			stabLabel.TextXAlignment = Enum.TextXAlignment.Left
			stabLabel.BackgroundTransparency = 1
			stabLabel.Text = stability
			stabLabel.TextColor3 = stabColor
			stabLabel.TextScaled = true
			stabLabel.Font = Enum.Font.SourceSansBold
			stabLabel.ZIndex = 150
			stabLabel.TextStrokeTransparency = 0.5
			stabLabel.TextStrokeColor3 = Color3.fromRGB(0, 0, 0)
			stabLabel.Parent = parent
		end

		if isOffer then
			local found = false
			for _, l in ipairs(createdLabels) do
				if l == stabLabel then found = true break end
			end
			if not found then
				table.insert(createdLabels, stabLabel)
			end
		end
	else
		if stabLabel then
			pcall(function() stabLabel:Destroy() end)
		end
	end

	-- Draw Tier Label underneath Stability
	local tierLabel = parent:FindFirstChild("TierLabel")
	if tier and tier ~= "N/A" and tier ~= "" then
		local tierText = tostring(tier)
		local tierColor = Color3.fromRGB(255, 255, 255) -- White

		if tierLabel and tierLabel:IsA("TextLabel") then
			if tierLabel.Text ~= tierText then
				tierLabel.Text = tierText
			end
			tierLabel.TextColor3 = tierColor
			tierLabel.Position = UDim2.new(0, 4, 0, 28)
			tierLabel.ZIndex = 150
		else
			if tierLabel then
				pcall(function() tierLabel:Destroy() end)
			end
			tierLabel = Instance.new("TextLabel")
			tierLabel.Name = "TierLabel"
			tierLabel.Size = UDim2.new(0.65, 0, 0, 10)
			tierLabel.Position = UDim2.new(0, 4, 0, 28)
			tierLabel.TextXAlignment = Enum.TextXAlignment.Left
			tierLabel.BackgroundTransparency = 1
			tierLabel.Text = tierText
			tierLabel.TextColor3 = tierColor
			tierLabel.TextScaled = true
			tierLabel.Font = Enum.Font.SourceSansBold
			tierLabel.ZIndex = 150
			tierLabel.TextStrokeTransparency = 0.5
			tierLabel.TextStrokeColor3 = Color3.fromRGB(0, 0, 0)
			tierLabel.Parent = parent
		end

		if isOffer then
			local found = false
			for _, l in ipairs(createdLabels) do
				if l == tierLabel then found = true break end
			end
			if not found then
				table.insert(createdLabels, tierLabel)
			end
		end
	else
		if tierLabel then
			pcall(function() tierLabel:Destroy() end)
		end
	end
end

local function clearValueLabels()
	for _, l in pairs(createdLabels) do
		pcall(function() l:Destroy() end)
	end
	createdLabels = {}
end

local function processContainerDescendants(parent, isOffer)
	if not parent then return end
	for _, child in pairs(parent:GetDescendants()) do
		if child:IsA("Frame") then
			local container = child:FindFirstChild("Container")
			if container and container:FindFirstChild("Icon") then
				local nameFrame = child:FindFirstChild("ItemName")
				local label = nameFrame and nameFrame:FindFirstChild("Label")
				if label and label.Text ~= "" and label.Text ~= "Loading..." then
					addValueLabel(container, label.Text, child, isOffer)
				end
			end
		end
	end
end

local function sumOffer(offer)
	local total = 0
	if not offer then return total end
	local container = offer:FindFirstChild("Container")
	if not container then return total end
	for _, child in pairs(container:GetChildren()) do
		if child:IsA("Frame") and child.Name:find("NewItem") then
			local nameFrame = child:FindFirstChild("ItemName")
			local label = nameFrame and nameFrame:FindFirstChild("Label")
			if label and label.Text ~= "" and label.Text ~= "Loading..." then
				local _, val = lookupDisplayAndNumericValue(label.Text, child)
				total = total + val
			end
		end
	end
	return total
end

local function stripBracketSuffix(text)
	if not text then return "" end
	return (text:gsub("%s*%[[%+%-]?[%d%.]+[KkMm]?%]%s*$", ""))
end

local function getTradeGui()
	local pg = LocalPlayer:FindFirstChild("PlayerGui")
	if pg then
		local t = pg:FindFirstChild("TradeGUI") or pg:FindFirstChild("TradeGUI_Phone")
		if t then return t end
	end
	return StarterGui:FindFirstChild("TradeGUI") or StarterGui:FindFirstChild("TradeGUI_Phone")
end

local function getTitles(tradeGui)
	local container = tradeGui and tradeGui:FindFirstChild("Container")
	local trade = container and container:FindFirstChild("Trade")
	if not trade then return nil, nil, nil, nil end
	local yourOffer = trade:FindFirstChild("YourOffer")
	local theirOffer = trade:FindFirstChild("TheirOffer")
	return yourOffer and yourOffer:FindFirstChild("Title"),
		theirOffer and theirOffer:FindFirstChild("Title"),
		yourOffer, theirOffer
end

local function formatDiffBracket(diff)
	if diff > 0 then return "  [+" .. fmt(diff) .. "]" end
	if diff < 0 then return "  [" .. fmt(diff) .. "]" end
	return "  [0]"
end

local function updateTitles(trade, tradeGui)
	if not tradeGui then return end
	local yourTitle, theirTitle, yourOffer, theirOffer = getTitles(tradeGui)
	if not yourTitle and not theirTitle then return end

	if yourTitle ~= titleState.yourTitle then
		titleState.yourTitle = yourTitle
		titleState.yourBase = nil
	end
	if theirTitle ~= titleState.theirTitle then
		titleState.theirTitle = theirTitle
		titleState.theirBase = nil
	end

	local you = sumOffer(yourOffer or (trade and trade:FindFirstChild("YourOffer")))
	local them = sumOffer(theirOffer or (trade and trade:FindFirstChild("TheirOffer")))

	if yourTitle and yourTitle:IsA("TextLabel") then
		local base = titleState.yourBase
		if not base then
			base = stripBracketSuffix(yourTitle.Text)
			if base == "" then base = "YOUR OFFER" end
			titleState.yourBase = base
		end
		local newText = base .. formatDiffBracket(them - you)
		if yourTitle.Text ~= newText then yourTitle.Text = newText end
	end

	if theirTitle and theirTitle:IsA("TextLabel") then
		local base = titleState.theirBase
		if not base then
			base = stripBracketSuffix(theirTitle.Text)
			if base == "" then base = "THEIR OFFER" end
			titleState.theirBase = base
		end
		local newText = base .. formatDiffBracket(you - them)
		if theirTitle.Text ~= newText then theirTitle.Text = newText end
	end
end

local function resetTitlesIfTradeClosed()
	local tradeGui = getTradeGui()
	if not tradeGui or not tradeGui.Enabled then
		titleState.yourBase = nil
		titleState.theirBase = nil
		titleState.yourTitle = nil
		titleState.theirTitle = nil
		clearValueLabels()
	end
end

task.spawn(function()
	while alive and task.wait(0.35) do
		pcall(resetTitlesIfTradeClosed)

		pcall(function()
			local pg = LocalPlayer:FindFirstChild("PlayerGui")
			local tradeGUI = pg and pg:FindFirstChild("TradeGUI")
			if tradeGUI and tradeGUI.Enabled then
				local container = tradeGUI:FindFirstChild("Container")
				if container then
					local trade = container:FindFirstChild("Trade")
					if trade then
						local yourOffer = trade:FindFirstChild("YourOffer")
						if yourOffer then processContainerDescendants(yourOffer, true) end
						
						local theirOffer = trade:FindFirstChild("TheirOffer")
						if theirOffer then processContainerDescendants(theirOffer, true) end
						
						updateTitles(trade, tradeGUI)
					end
					local items = container:FindFirstChild("Items")
					if items then processContainerDescendants(items, false) end
					local items2 = container:FindFirstChild("Items2")
					if items2 then processContainerDescendants(items2, false) end
				end
			end
		end)

		pcall(function()
			local pg = LocalPlayer:FindFirstChild("PlayerGui")
			local tradeGUIPhone = pg and pg:FindFirstChild("TradeGUI_Phone")
			if tradeGUIPhone and tradeGUIPhone.Enabled then
				local container = tradeGUIPhone:FindFirstChild("Container")
				if container then
					local trade = container:FindFirstChild("Trade")
					if trade then
						local yourOffer = trade:FindFirstChild("YourOffer")
						if yourOffer then processContainerDescendants(yourOffer, true) end
						
						local theirOffer = trade:FindFirstChild("TheirOffer")
						if theirOffer then processContainerDescendants(theirOffer, true) end
						
						updateTitles(trade, tradeGUIPhone)
					end
					local items = container:FindFirstChild("Items")
					if items then processContainerDescendants(items, false) end
					local items2 = container:FindFirstChild("Items2")
					if items2 then processContainerDescendants(items2, false) end
				end

				local inactive = tradeGUIPhone:FindFirstChild("Inactive")
				local frame = inactive and inactive:FindFirstChild("Frame")
				local main = frame and frame:FindFirstChild("Main")
				if main then
					local trade = main:FindFirstChild("Trade")
					if trade then
						local yourOffer = trade:FindFirstChild("YourOffer")
						if yourOffer then processContainerDescendants(yourOffer, true) end
						
						local theirOffer = trade:FindFirstChild("TheirOffer")
						if theirOffer then processContainerDescendants(theirOffer, true) end
						
						updateTitles(trade, tradeGUIPhone)
					end
					local items = main:FindFirstChild("Items")
					if items then processContainerDescendants(items, false) end
					local items2 = main:FindFirstChild("Items2")
					if items2 then processContainerDescendants(items2, false) end
				end
			end
		end)

		pcall(function()
			local pg = LocalPlayer:FindFirstChild("PlayerGui")
			local rep = ReplicatedStorage:FindFirstChild("ReplicatedStorage") or ReplicatedStorage
			local repMain = rep:FindFirstChild("MainGUI")
			
			local targets = {}
			if pg then
				local mainGUI = pg:FindFirstChild("MainGUI")
				local gameFrame = mainGUI and mainGUI:FindFirstChild("Game")
				if gameFrame then table.insert(targets, gameFrame) end
				
				local lobby = mainGUI and mainGUI:FindFirstChild("Lobby")
				if lobby then
					processContainerDescendants(lobby, false)
				end
			end
			if repMain then
				local gameFrame = repMain:FindFirstChild("Game")
				if gameFrame then table.insert(targets, gameFrame) end
				
				local lobby = repMain:FindFirstChild("Lobby")
				if lobby then
					processContainerDescendants(lobby, false)
				end
			end

			for _, gameFrame in ipairs(targets) do
				local inv = gameFrame:FindFirstChild("Inventory")
				if inv and (inv.Visible or gameFrame.Parent == repMain) then
					processContainerDescendants(inv, false)
				end
				
				local inv2 = gameFrame:FindFirstChild("Inventory2")
				if inv2 and (inv2.Visible or gameFrame.Parent == repMain) then
					processContainerDescendants(inv2, false)
				end

				local viewProfile = gameFrame:FindFirstChild("ViewProfile")
				if viewProfile and (viewProfile.Visible or gameFrame.Parent == repMain) then
					processContainerDescendants(viewProfile, false)
				end

				local crafting = gameFrame:FindFirstChild("Crafting")
				if crafting and (crafting.Visible or gameFrame.Parent == repMain) then
					processContainerDescendants(crafting, false)
				end

				local leaderboard = gameFrame:FindFirstChild("Leaderboard")
				local inspect = leaderboard and leaderboard:FindFirstChild("Inspect")
				if inspect and (inspect.Visible or gameFrame.Parent == repMain) then
					processContainerDescendants(inspect, false)
				end
			end

			local phoneInv = pg and (pg:FindFirstChild("InventoryPhone") or pg:FindFirstChild("Inventory_Phone"))
			if phoneInv and phoneInv.Visible then
				processContainerDescendants(phoneInv, false)
			end
		end)
	end
end)

print("[TradeValues] LOADED | source=" .. tostring(valueSource) .. " | by Namedadude")
if valueSource == "failed" then
	warn("[TradeValues] JSON load failed — check URL / HttpService")
end
