-- RecordsWebRoleplayIdentityBridge.server.lua
-- RecordsWeb v3.3.4+
-- Place this Script in ServerScriptService.
--
-- This is intentionally separate from the waiting-room/display RecordsWebBridge.
-- It handles persistent, community-scoped Roblox roleplay patient identities.
--
-- RecordsWebConfig may remain inside:
-- Workspace > RecordsWeb - Screens > RecordsWebConfig
--
-- Required RecordsWebConfig values:
--   ApiUrl = "https://api.recordsweb.org"
--   ConnectionCode = "rw_live_..."
--
-- The script creates:
--   ReplicatedStorage > RecordsWebRemotes > RecordsWebIdentityRequest (RemoteFunction)
--
-- Player attributes created/updated:
--   RecordsWebIdentityNeedsRegistration
--   RecordsWebPatientId
--   RecordsWebRoleplayFirstName
--   RecordsWebRoleplayLastName
--   RecordsWebRoleplayName
--   RecordsWebRoleplayDOB
--   RecordsWebRoleplaySex
--   RecordsWebRoleplayGender

local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")
local ServerStorage = game:GetService("ServerStorage")

local function waitForLicence()
	while script.Parent do
		local state = ServerScriptService:GetAttribute("RecordsWebLicenseState")

		if state == "Licensed" then
			return true
		end

		if state == "Rejected" then
			return false
		end

		task.wait(0.25)
	end

	return false
end

if not waitForLicence() then
	warn("[RecordsWeb] RP identity bridge stopped because the RecordsWeb licence was rejected.")
	return
end

local function findConfig()
	local direct = script.Parent and script.Parent:FindFirstChild("RecordsWebConfig")
	if direct and direct:IsA("ModuleScript") then
		return direct
	end

	local screens = workspace:FindFirstChild("RecordsWeb - Screens")
	if screens then
		local config = screens:FindFirstChild("RecordsWebConfig", true)
		if config and config:IsA("ModuleScript") then
			return config
		end
	end

	local system = ServerStorage:FindFirstChild("System")
	if system then
		local templateScreens = system:FindFirstChild("RecordsWeb - Screens")
		if templateScreens then
			local config = templateScreens:FindFirstChild("RecordsWebConfig", true)
			if config and config:IsA("ModuleScript") then
				return config
			end
		end
	end

	return nil
end

local ConfigModule = findConfig()
if not ConfigModule then
	warn("[RecordsWeb] RecordsWebConfig could not be found for the RP identity bridge.")
	return
end

local ok, Config = pcall(require, ConfigModule)
if not ok or type(Config) ~= "table" then
	warn("[RecordsWeb] RecordsWebConfig could not be loaded for the RP identity bridge.")
	return
end

local API_URL = tostring(Config.ApiUrl or "https://api.recordsweb.org")

if type(Config.ConnectionCode) ~= "string" or Config.ConnectionCode == "" then
	warn("[RecordsWeb] ConnectionCode is missing from RecordsWebConfig.")
	return
end

local function getOrCreate(parent, className, name)
	local existing = parent:FindFirstChild(name)

	if existing and existing.ClassName == className then
		return existing
	end

	if existing then
		existing:Destroy()
	end

	local object = Instance.new(className)
	object.Name = name
	object.Parent = parent
	return object
end

local Remotes = getOrCreate(ReplicatedStorage, "Folder", "RecordsWebRemotes")
local IdentityRequest = getOrCreate(Remotes, "RemoteFunction", "RecordsWebIdentityRequest")

local busyPlayers = {}

local function debugPrint(...)
	if Config.Debug then
		print("[RecordsWeb RP Identity]", ...)
	end
end

local function requestApi(player, action, roleplay)
	if ServerScriptService:GetAttribute("RecordsWebLicenseState") ~= "Licensed" then
		error("RecordsWeb licensing is unavailable.")
	end

	local bodyData = {
		action = action,
		universeId = tostring(game.GameId),
		placeId = tostring(game.PlaceId),
		serverId = game.JobId,

		robloxUserId = tostring(player.UserId),
		robloxUsername = player.Name,
		robloxDisplayName = player.DisplayName,

		roleplay = roleplay,
	}

	local response = HttpService:RequestAsync({
		Url = API_URL,
		Method = "POST",
		Headers = {
			["Content-Type"] = "application/json",
			["x-recordsweb-key"] = Config.ConnectionCode,
		},
		Body = HttpService:JSONEncode(bodyData),
	})

	local payload = nil
	local decoded = pcall(function()
		payload = HttpService:JSONDecode(response.Body)
	end)

	if not response.Success then
		if decoded and type(payload) == "table" and payload.error then
			error(tostring(payload.error))
		end

		error(
			string.format(
				"RecordsWeb identity API returned HTTP %d: %s",
				response.StatusCode,
				tostring(response.Body)
			)
		)
	end

	if not decoded or type(payload) ~= "table" then
		error("RecordsWeb identity API returned an invalid response.")
	end

	if payload.ok ~= true then
		error(tostring(payload.error or "RecordsWeb rejected the identity request."))
	end

	return payload
end

local function clearIdentityAttributes(player)
	player:SetAttribute("RecordsWebPatientId", nil)
	player:SetAttribute("RecordsWebRoleplayFirstName", nil)
	player:SetAttribute("RecordsWebRoleplayLastName", nil)
	player:SetAttribute("RecordsWebRoleplayName", nil)
	player:SetAttribute("RecordsWebRoleplayDOB", nil)
player:SetAttribute("RecordsWebRoleplaySex", nil)
player:SetAttribute("RecordsWebRoleplayGender", nil)
end

local function applyIdentity(player, payload)
	local identity = payload and payload.identity
	local patient = identity and identity.patient

	player:SetAttribute(
		"RecordsWebIdentityNeedsRegistration",
		payload and payload.needsRegistration == true
	)

	if patient then
		player:SetAttribute("RecordsWebPatientId", patient.id)
		player:SetAttribute("RecordsWebRoleplayFirstName", patient.firstName)
		player:SetAttribute("RecordsWebRoleplayLastName", patient.lastName)
		player:SetAttribute("RecordsWebRoleplayName", patient.fullName)
		player:SetAttribute("RecordsWebRoleplayDOB", patient.dob)
player:SetAttribute("RecordsWebRoleplaySex", patient.sex or "")
player:SetAttribute("RecordsWebRoleplayGender", patient.gender or patient.sex or "")
	else
		clearIdentityAttributes(player)
	end

	return payload
end

local function resolvePlayer(player)
	local success, result = pcall(function()
		return requestApi(player, "identity-resolve", nil)
	end)

	if not player.Parent then
		return
	end

	if success then
		applyIdentity(player, result)

		if result.needsRegistration == true then
			debugPrint(player.Name, "needs a community RP patient identity.")
		else
			local rpName = player:GetAttribute("RecordsWebRoleplayName")
			debugPrint(player.Name, "resolved to", rpName or "an existing RecordsWeb patient")
		end
	else
		warn(
			"[RecordsWeb] RP identity lookup failed for "
				.. player.Name
				.. ": "
				.. tostring(result)
		)

		player:SetAttribute("RecordsWebIdentityNeedsRegistration", nil)
		clearIdentityAttributes(player)
	end
end

Players.PlayerAdded:Connect(function(player)
	task.spawn(resolvePlayer, player)
end)

Players.PlayerRemoving:Connect(function(player)
	busyPlayers[player] = nil
end)

for _, player in ipairs(Players:GetPlayers()) do
	task.spawn(resolvePlayer, player)
end

IdentityRequest.OnServerInvoke = function(player, operation, roleplay)
	if busyPlayers[player] then
		return {
			ok = false,
			error = "A RecordsWeb identity request is already being processed.",
		}
	end

	busyPlayers[player] = true

	local success, result = pcall(function()
		if operation == "get" then
			local payload = requestApi(player, "identity-get", nil)
			return applyIdentity(player, payload)
		end

		if operation == "register" then
			if type(roleplay) ~= "table" then
				return {
					ok = false,
					error = "Roleplay patient details are required.",
				}
			end

			local payload = requestApi(player, "identity-register", roleplay)
			return applyIdentity(player, payload)
		end

		if operation == "update" then
			if type(roleplay) ~= "table" then
				return {
					ok = false,
					error = "Roleplay patient details are required.",
				}
			end

			local payload = requestApi(player, "identity-update", roleplay)
			return applyIdentity(player, payload)
		end

		return {
			ok = false,
			error = "Unknown RecordsWeb identity operation.",
		}
	end)

	busyPlayers[player] = nil

	if not success then
		warn(
			"[RecordsWeb] RP identity operation failed for "
				.. player.Name
				.. ": "
				.. tostring(result)
		)

		return {
			ok = false,
			error = tostring(result),
		}
	end

	return result
end

print("[RecordsWeb] Roleplay identity bridge ready.")
