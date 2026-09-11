-- RecordsWebRoleplayIdentityClient.client.lua
-- Place this LocalScript in StarterPlayer > StarterPlayerScripts.
-- Requires RecordsWebRoleplayIdentityBridge in ServerScriptService.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

local function waitForIdentityRemote()
	while player.Parent do
		local remotes = ReplicatedStorage:FindFirstChild("RecordsWebRemotes")
		if remotes then
			local remote = remotes:FindFirstChild("RecordsWebIdentityRequest")
			if remote and remote:IsA("RemoteFunction") then
				return remote
			end
		end
		task.wait(0.25)
	end
	return nil
end

local IdentityRequest = waitForIdentityRemote()
if not IdentityRequest then
	return
end

local gui
local submitting = false

local function destroyGui()
	if gui then
		gui:Destroy()
		gui = nil
	end
end

local function makeLabel(parent, text, size, position, font, textSize)
	local label = Instance.new("TextLabel")
	label.BackgroundTransparency = 1
	label.Size = size
	label.Position = position
	label.Font = font or Enum.Font.Gotham
	label.TextSize = textSize or 14
	label.TextColor3 = Color3.fromRGB(30, 52, 66)
	label.TextXAlignment = Enum.TextXAlignment.Left
	label.Text = text
	label.Parent = parent
	return label
end

local function makeBox(parent, placeholder, position)
	local box = Instance.new("TextBox")
	box.Size = UDim2.new(1, -48, 0, 42)
	box.Position = position
	box.BackgroundColor3 = Color3.fromRGB(248, 251, 253)
	box.BorderSizePixel = 0
	box.Font = Enum.Font.Gotham
	box.TextSize = 15
	box.TextColor3 = Color3.fromRGB(24, 52, 70)
	box.PlaceholderColor3 = Color3.fromRGB(120, 139, 152)
	box.PlaceholderText = placeholder
	box.ClearTextOnFocus = false
	box.Text = ""
	box.Parent = parent

	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0, 6)
	corner.Parent = box

	local stroke = Instance.new("UIStroke")
	stroke.Color = Color3.fromRGB(197, 217, 229)
	stroke.Thickness = 1
	stroke.Parent = box

	local padding = Instance.new("UIPadding")
	padding.PaddingLeft = UDim.new(0, 12)
	padding.PaddingRight = UDim.new(0, 12)
	padding.Parent = box

	return box
end

local function showExistingIdentity()
	destroyGui()

	local fullName = player:GetAttribute("RecordsWebRoleplayName")
	if not fullName or fullName == "" then
		return
	end

	player:SetAttribute("RecordsWebIdentityReady", true)
end


local function toIsoDateFromUK(value)
	local day, month, year = value:match("^(%d%d)%-(%d%d)%-(%d%d%d%d)$")
	if not day or not month or not year then
		return nil
	end

	local d = tonumber(day)
	local m = tonumber(month)
	local y = tonumber(year)

	if not d or not m or not y then
		return nil
	end

	if m < 1 or m > 12 then
		return nil
	end

	local daysInMonth = {
		31,
		(y % 4 == 0 and (y % 100 ~= 0 or y % 400 == 0)) and 29 or 28,
		31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
	}

	if d < 1 or d > daysInMonth[m] then
		return nil
	end

	return string.format("%04d-%02d-%02d", y, m, d)
end


local SEX_OPTIONS = {
	"Male",
	"Female",
	"Other",
}

local function makeChoiceButton(parent, text, position, width)
	local button = Instance.new("TextButton")
	button.Size = UDim2.fromOffset(width, 38)
	button.Position = position
	button.BackgroundColor3 = Color3.fromRGB(248, 251, 253)
	button.BorderSizePixel = 0
	button.Font = Enum.Font.GothamMedium
	button.TextSize = 13
	button.TextColor3 = Color3.fromRGB(30, 52, 66)
	button.Text = text
	button.AutoButtonColor = true
	button.Parent = parent

	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0, 6)
	corner.Parent = button

	local stroke = Instance.new("UIStroke")
	stroke.Color = Color3.fromRGB(197, 217, 229)
	stroke.Thickness = 1
	stroke.Parent = button

	return button, stroke
end

local function setChoiceSelected(button, stroke, selected)
	if selected then
		button.BackgroundColor3 = Color3.fromRGB(226, 242, 252)
		button.TextColor3 = Color3.fromRGB(15, 111, 189)
		stroke.Color = Color3.fromRGB(15, 111, 189)
		stroke.Thickness = 2
	else
		button.BackgroundColor3 = Color3.fromRGB(248, 251, 253)
		button.TextColor3 = Color3.fromRGB(30, 52, 66)
		stroke.Color = Color3.fromRGB(197, 217, 229)
		stroke.Thickness = 1
	end
end

local function showRegistration()
	if gui or submitting then
		return
	end

	gui = Instance.new("ScreenGui")
	gui.Name = "RecordsWebRoleplayIdentity"
	gui.ResetOnSpawn = false
	gui.IgnoreGuiInset = true
	gui.DisplayOrder = 10000
	gui.Parent = playerGui

	local overlay = Instance.new("Frame")
	overlay.Size = UDim2.fromScale(1, 1)
	overlay.BackgroundColor3 = Color3.fromRGB(5, 23, 34)
	overlay.BackgroundTransparency = 0.18
	overlay.BorderSizePixel = 0
	overlay.Parent = gui

	local card = Instance.new("Frame")
	card.AnchorPoint = Vector2.new(0.5, 0.5)
	card.Position = UDim2.fromScale(0.5, 0.5)
	card.Size = UDim2.fromOffset(520, 575)
	card.BackgroundColor3 = Color3.fromRGB(255, 255, 255)
	card.BorderSizePixel = 0
	card.Parent = overlay

	local cardCorner = Instance.new("UICorner")
	cardCorner.CornerRadius = UDim.new(0, 10)
	cardCorner.Parent = card

	local cardStroke = Instance.new("UIStroke")
	cardStroke.Color = Color3.fromRGB(196, 217, 230)
	cardStroke.Thickness = 1
	cardStroke.Parent = card

	makeLabel(
		card,
		"RecordsWeb",
		UDim2.new(1, -48, 0, 28),
		UDim2.fromOffset(24, 22),
		Enum.Font.GothamBold,
		20
	).TextColor3 = Color3.fromRGB(15, 111, 189)

	makeLabel(
		card,
		"Create your roleplay patient identity",
		UDim2.new(1, -48, 0, 30),
		UDim2.fromOffset(24, 57),
		Enum.Font.GothamBold,
		18
	)

	local description = makeLabel(
		card,
		"This identity is saved to your Roblox account for this community. When you return to this community, RecordsWeb will load the same patient automatically.",
		UDim2.new(1, -48, 0, 56),
		UDim2.fromOffset(24, 94),
		Enum.Font.Gotham,
		13
	)
	description.TextWrapped = true
	description.TextColor3 = Color3.fromRGB(88, 110, 124)

	makeLabel(card, "First name", UDim2.new(1, -48, 0, 20), UDim2.fromOffset(24, 166), Enum.Font.GothamMedium, 13)
	local firstName = makeBox(card, "e.g. Daniel", UDim2.fromOffset(24, 190))

	makeLabel(card, "Last name", UDim2.new(1, -48, 0, 20), UDim2.fromOffset(24, 244), Enum.Font.GothamMedium, 13)
	local lastName = makeBox(card, "e.g. Carter", UDim2.fromOffset(24, 268))

	makeLabel(card, "Date of birth (DD-MM-YYYY)", UDim2.new(1, -48, 0, 20), UDim2.fromOffset(24, 322), Enum.Font.GothamMedium, 13)
	local dob = makeBox(card, "DD-MM-YYYY", UDim2.fromOffset(24, 346))

	makeLabel(card, "Sex / Gender", UDim2.new(1, -48, 0, 20), UDim2.fromOffset(24, 400), Enum.Font.GothamMedium, 13)

	local selectedSex = ""
	local sexButtons = {}

	for index, option in ipairs(SEX_OPTIONS) do
		local width = 145
		local x = 24 + ((index - 1) * 157)
		local button, stroke = makeChoiceButton(card, option, UDim2.fromOffset(x, 424), width)

		sexButtons[option] = {
			button = button,
			stroke = stroke,
		}

		button.Activated:Connect(function()
			selectedSex = option

			for name, refs in pairs(sexButtons) do
				setChoiceSelected(refs.button, refs.stroke, name == selectedSex)
			end
		end)
	end

	local status = makeLabel(
		card,
		"",
		UDim2.new(1, -48, 0, 34),
		UDim2.fromOffset(24, 474),
		Enum.Font.Gotham,
		12
	)
	status.TextWrapped = true
	status.TextColor3 = Color3.fromRGB(180, 45, 45)

	local submit = Instance.new("TextButton")
	submit.Size = UDim2.new(1, -48, 0, 44)
	submit.Position = UDim2.fromOffset(24, 515)
	submit.BackgroundColor3 = Color3.fromRGB(15, 111, 189)
	submit.BorderSizePixel = 0
	submit.Font = Enum.Font.GothamBold
	submit.TextSize = 15
	submit.TextColor3 = Color3.fromRGB(255, 255, 255)
	submit.Text = "Create patient identity"
	submit.Parent = card

	local buttonCorner = Instance.new("UICorner")
	buttonCorner.CornerRadius = UDim.new(0, 6)
	buttonCorner.Parent = submit

	submit.Activated:Connect(function()
		if submitting then
			return
		end

		local f = firstName.Text:match("^%s*(.-)%s*$") or ""
		local l = lastName.Text:match("^%s*(.-)%s*$") or ""
		local birthDate = dob.Text:match("^%s*(.-)%s*$") or ""

		if #f < 1 or #l < 1 then
			status.Text = "Enter both a first name and last name."
			return
		end

		local isoBirthDate = toIsoDateFromUK(birthDate)
		if not isoBirthDate then
			status.Text = "Enter a valid date of birth as DD-MM-YYYY."
			return
		end

		if selectedSex == "" then
			status.Text = "Select the patient's Sex / Gender."
			return
		end

		submitting = true
		submit.Active = false
		submit.AutoButtonColor = false
		submit.Text = "Creating identity..."
		status.Text = ""

		local ok, result = pcall(function()
			return IdentityRequest:InvokeServer("register", {
				firstName = f,
				lastName = l,
				dob = isoBirthDate,
				sex = selectedSex,
			})
		end)

		if not ok then
			status.Text = tostring(result)
			submitting = false
			submit.Active = true
			submit.AutoButtonColor = true
			submit.Text = "Create patient identity"
			return
		end

		if type(result) ~= "table" or result.ok ~= true then
			status.Text = type(result) == "table" and tostring(result.error or "RecordsWeb could not create the identity.") or "RecordsWeb could not create the identity."
			submitting = false
			submit.Active = true
			submit.AutoButtonColor = true
			submit.Text = "Create patient identity"
			return
		end

		submitting = false
		showExistingIdentity()
	end)
end


local function showSexCompletion()
	if gui or submitting then
		return
	end

	gui = Instance.new("ScreenGui")
	gui.Name = "RecordsWebRoleplayIdentity"
	gui.ResetOnSpawn = false
	gui.IgnoreGuiInset = true
	gui.DisplayOrder = 10000
	gui.Parent = playerGui

	local overlay = Instance.new("Frame")
	overlay.Size = UDim2.fromScale(1, 1)
	overlay.BackgroundColor3 = Color3.fromRGB(5, 23, 34)
	overlay.BackgroundTransparency = 0.18
	overlay.BorderSizePixel = 0
	overlay.Parent = gui

	local card = Instance.new("Frame")
	card.AnchorPoint = Vector2.new(0.5, 0.5)
	card.Position = UDim2.fromScale(0.5, 0.5)
	card.Size = UDim2.fromOffset(520, 335)
	card.BackgroundColor3 = Color3.fromRGB(255, 255, 255)
	card.BorderSizePixel = 0
	card.Parent = overlay

	local cardCorner = Instance.new("UICorner")
	cardCorner.CornerRadius = UDim.new(0, 10)
	cardCorner.Parent = card

	local cardStroke = Instance.new("UIStroke")
	cardStroke.Color = Color3.fromRGB(196, 217, 230)
	cardStroke.Thickness = 1
	cardStroke.Parent = card

	makeLabel(
		card,
		"RecordsWeb",
		UDim2.new(1, -48, 0, 28),
		UDim2.fromOffset(24, 22),
		Enum.Font.GothamBold,
		20
	).TextColor3 = Color3.fromRGB(15, 111, 189)

	makeLabel(
		card,
		"Complete your roleplay patient identity",
		UDim2.new(1, -48, 0, 30),
		UDim2.fromOffset(24, 57),
		Enum.Font.GothamBold,
		18
	)

	local rpName = tostring(player:GetAttribute("RecordsWebRoleplayName") or "your patient")
	local description = makeLabel(
		card,
		"RecordsWeb already has " .. rpName .. " linked to this Roblox account. Select Sex / Gender to complete the patient record.",
		UDim2.new(1, -48, 0, 58),
		UDim2.fromOffset(24, 94),
		Enum.Font.Gotham,
		13
	)
	description.TextWrapped = true
	description.TextColor3 = Color3.fromRGB(88, 110, 124)

	makeLabel(card, "Sex / Gender", UDim2.new(1, -48, 0, 20), UDim2.fromOffset(24, 166), Enum.Font.GothamMedium, 13)

	local selectedSex = ""
	local sexButtons = {}

	for index, option in ipairs(SEX_OPTIONS) do
		local width = 145
		local x = 24 + ((index - 1) * 157)
		local button, stroke = makeChoiceButton(card, option, UDim2.fromOffset(x, 190), width)

		sexButtons[option] = {
			button = button,
			stroke = stroke,
		}

		button.Activated:Connect(function()
			selectedSex = option

			for name, refs in pairs(sexButtons) do
				setChoiceSelected(refs.button, refs.stroke, name == selectedSex)
			end
		end)
	end

	local status = makeLabel(
		card,
		"",
		UDim2.new(1, -48, 0, 34),
		UDim2.fromOffset(24, 238),
		Enum.Font.Gotham,
		12
	)
	status.TextWrapped = true
	status.TextColor3 = Color3.fromRGB(180, 45, 45)

	local submit = Instance.new("TextButton")
	submit.Size = UDim2.new(1, -48, 0, 44)
	submit.Position = UDim2.fromOffset(24, 277)
	submit.BackgroundColor3 = Color3.fromRGB(15, 111, 189)
	submit.BorderSizePixel = 0
	submit.Font = Enum.Font.GothamBold
	submit.TextSize = 15
	submit.TextColor3 = Color3.fromRGB(255, 255, 255)
	submit.Text = "Save patient details"
	submit.Parent = card

	local buttonCorner = Instance.new("UICorner")
	buttonCorner.CornerRadius = UDim.new(0, 6)
	buttonCorner.Parent = submit

	submit.Activated:Connect(function()
		if submitting then
			return
		end

		if selectedSex == "" then
			status.Text = "Select the patient's Sex / Gender."
			return
		end

		submitting = true
		submit.Active = false
		submit.AutoButtonColor = false
		submit.Text = "Saving..."
		status.Text = ""

		local ok, result = pcall(function()
			return IdentityRequest:InvokeServer("update", {
				sex = selectedSex,
			})
		end)

		if not ok then
			status.Text = tostring(result)
			submitting = false
			submit.Active = true
			submit.AutoButtonColor = true
			submit.Text = "Save patient details"
			return
		end

		if type(result) ~= "table" or result.ok ~= true then
			status.Text = type(result) == "table" and tostring(result.error or "RecordsWeb could not update the identity.") or "RecordsWeb could not update the identity."
			submitting = false
			submit.Active = true
			submit.AutoButtonColor = true
			submit.Text = "Save patient details"
			return
		end

		submitting = false
		destroyGui()
		player:SetAttribute("RecordsWebIdentityReady", true)
	end)
end

local function refreshIdentityUi()
	local needsRegistration = player:GetAttribute("RecordsWebIdentityNeedsRegistration")
	local sex = tostring(player:GetAttribute("RecordsWebRoleplaySex") or "")

	if needsRegistration == true then
		showRegistration()
	elseif needsRegistration == false and sex == "" then
		showSexCompletion()
	elseif needsRegistration == false then
		showExistingIdentity()
	end
end

player:GetAttributeChangedSignal("RecordsWebIdentityNeedsRegistration"):Connect(refreshIdentityUi)
player:GetAttributeChangedSignal("RecordsWebRoleplaySex"):Connect(refreshIdentityUi)

refreshIdentityUi()

-- Ask the server for the latest state in case the attribute was set before this
-- LocalScript finished loading.
task.spawn(function()
	local ok, result = pcall(function()
		return IdentityRequest:InvokeServer("get")
	end)

	if not ok then
		warn("[RecordsWeb] Unable to refresh RP identity:", result)
		return
	end

	if type(result) == "table" and result.ok ~= true and result.error then
		warn("[RecordsWeb] Unable to refresh RP identity:", result.error)
	end

	refreshIdentityUi()
end)
