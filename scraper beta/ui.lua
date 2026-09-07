--[[
    MM2 Trade Values — Standalone UI Module
    Only visual interface / labels styling without backend scraping logic.
]]

local UI = {}

local createdLabels = {}
local titleState = {
    yourTitle = nil,
    theirTitle = nil,
    yourBase = nil,
    theirBase = nil
}

-- Format number to clean shorthand (e.g. 1.5K, 2.3M)
function UI.formatValue(v)
    if not v or v == 0 then return "0" end
    if type(v) == "string" then
        local num = tonumber(v:gsub(",", ""))
        if not num then return v end
        v = num
    end
    local sign = v < 0 and "-" or ""
    v = math.abs(v)
    if v >= 1000000 then
        return sign .. string.format("%.1fM", v / 1000000):gsub("%.0M", "M")
    elseif v >= 1000 then
        return sign .. string.format("%.1fK", v / 1000):gsub("%.0K", "K")
    elseif v < 1 and v > 0 then
        local s = string.format("%.4f", v):gsub("0+$", ""):gsub("%.$", "")
        return sign .. s
    end
    return sign .. tostring(math.floor(v + 0.5))
end

-- Format difference bracket string (e.g. [+500], [-200], [0])
function UI.formatDiffBracket(diff)
    diff = diff or 0
    if diff > 0 then
        return "  [+" .. UI.formatValue(diff) .. "]"
    elseif diff < 0 then
        return "  [" .. UI.formatValue(diff) .. "]"
    end
    return "  [0]"
end

-- Create or update Value Label (Price)
function UI.createValueLabel(parent, valueText)
    if not parent then return nil end
    local text = valueText and tostring(valueText) or "N/A"
    
    local label = parent:FindFirstChild("ValueLabel")
    if label and label:IsA("TextLabel") then
        if label.Text ~= text then
            label.Text = text
        end
        label.Position = UDim2.new(0, 4, 0, 4)
        label.ZIndex = 150
        return label
    end

    if label then
        pcall(function() label:Destroy() end)
    end

    label = Instance.new("TextLabel")
    label.Name = "ValueLabel"
    label.Size = UDim2.new(0.7, 0, 0, 14)
    label.Position = UDim2.new(0, 4, 0, 4)
    label.TextXAlignment = Enum.TextXAlignment.Left
    label.BackgroundTransparency = 1
    label.Text = text
    label.TextColor3 = Color3.fromRGB(255, 255, 255)
    label.TextScaled = true
    label.Font = Enum.Font.SourceSansBold
    label.ZIndex = 150
    label.TextStrokeTransparency = 0.5
    label.TextStrokeColor3 = Color3.fromRGB(0, 0, 0)
    label.Parent = parent

    table.insert(createdLabels, label)
    return label
end

-- Create or update Stability Label (Under Value)
function UI.createStabilityLabel(parent, stabilityText)
    if not parent then return nil end
    if not stabilityText or stabilityText == "" or stabilityText == "N/A" then
        local existing = parent:FindFirstChild("StabilityLabel")
        if existing then pcall(function() existing:Destroy() end) end
        return nil
    end

    local label = parent:FindFirstChild("StabilityLabel")
    if label and label:IsA("TextLabel") then
        if label.Text ~= stabilityText then
            label.Text = stabilityText
        end
        label.Position = UDim2.new(0, 4, 0, 18)
        label.ZIndex = 150
        return label
    end

    if label then
        pcall(function() label:Destroy() end)
    end

    label = Instance.new("TextLabel")
    label.Name = "StabilityLabel"
    label.Size = UDim2.new(0.7, 0, 0, 10)
    label.Position = UDim2.new(0, 4, 0, 18)
    label.TextXAlignment = Enum.TextXAlignment.Left
    label.BackgroundTransparency = 1
    label.Text = tostring(stabilityText)
    label.TextColor3 = Color3.fromRGB(255, 255, 255)
    label.TextScaled = true
    label.Font = Enum.Font.SourceSansBold
    label.ZIndex = 150
    label.TextStrokeTransparency = 0.5
    label.TextStrokeColor3 = Color3.fromRGB(0, 0, 0)
    label.Parent = parent

    table.insert(createdLabels, label)
    return label
end

-- Create or update Tier Label (Under Stability, e.g. T1, T2)
function UI.createTierLabel(parent, tierText)
    if not parent then return nil end
    if not tierText or tierText == "" or tierText == "N/A" then
        local existing = parent:FindFirstChild("TierLabel")
        if existing then pcall(function() existing:Destroy() end) end
        return nil
    end

    local label = parent:FindFirstChild("TierLabel")
    if label and label:IsA("TextLabel") then
        if label.Text ~= tierText then
            label.Text = tierText
        end
        label.Position = UDim2.new(0, 4, 0, 28)
        label.ZIndex = 150
        return label
    end

    if label then
        pcall(function() label:Destroy() end)
    end

    label = Instance.new("TextLabel")
    label.Name = "TierLabel"
    label.Size = UDim2.new(0.7, 0, 0, 10)
    label.Position = UDim2.new(0, 4, 0, 28)
    label.TextXAlignment = Enum.TextXAlignment.Left
    label.BackgroundTransparency = 1
    label.Text = tostring(tierText)
    label.TextColor3 = Color3.fromRGB(255, 255, 255)
    label.TextScaled = true
    label.Font = Enum.Font.SourceSansBold
    label.ZIndex = 150
    label.TextStrokeTransparency = 0.5
    label.TextStrokeColor3 = Color3.fromRGB(0, 0, 0)
    label.Parent = parent

    table.insert(createdLabels, label)
    return label
end

-- Attach all 3 labels to a slot container
function UI.attachLabels(container, value, stability, tier)
    if not container then return end
    UI.createValueLabel(container, value)
    UI.createStabilityLabel(container, stability)
    UI.createTierLabel(container, tier)
end

-- Remove all labels from a container
function UI.removeLabels(parent)
    if not parent then return end
    for _, name in ipairs({ "ValueLabel", "StabilityLabel", "TierLabel" }) do
        local l = parent:FindFirstChild(name)
        if l then
            pcall(function() l:Destroy() end)
        end
    end
end

-- Update Trade Title with difference bracket (e.g. "YOUR OFFER [+250]")
function UI.updateTitleBracket(titleLabel, isYourTitle, diff)
    if not titleLabel or not titleLabel:IsA("TextLabel") then return end
    
    local baseKey = isYourTitle and "yourBase" or "theirBase"
    local base = titleState[baseKey]
    if not base then
        base = titleLabel.Text:gsub("%s*%[[%+%-]?[%d%.]+[KkMm]?%]%s*$", "")
        if base == "" then
            base = isYourTitle and "YOUR OFFER" or "THEIR OFFER"
        end
        titleState[baseKey] = base
    end

    local bracket = UI.formatDiffBracket(diff)
    local newText = base .. bracket
    if titleLabel.Text ~= newText then
        titleLabel.Text = newText
    end
end

-- Clear all tracked UI labels
function UI.clearAll()
    for _, l in pairs(createdLabels) do
        pcall(function() l:Destroy() end)
    end
    createdLabels = {}
    titleState.yourBase = nil
    titleState.theirBase = nil
    titleState.yourTitle = nil
    titleState.theirTitle = nil
end

return UI
