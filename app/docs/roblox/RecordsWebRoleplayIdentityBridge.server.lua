-- RecordsWeb 3.3.4 example server bridge.
-- Put this in ServerScriptService and keep RecordsWebConfig server-side.
-- A game-specific LocalScript/UI can invoke RecordsWebIdentityRequest to register
-- a first-time player's community-scoped RP identity.

local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")
local ServerStorage = game:GetService("ServerStorage")

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
assert(ConfigModule, "RecordsWebConfig could not be found")

local Config = require(ConfigModule)
local API_URL = Config.ApiUrl or "https://api.recordsweb.org"
assert(type(Config.ConnectionCode) == "string" and Config.ConnectionCode ~= "", "RecordsWeb ConnectionCode is missing")

local remotes = ReplicatedStorage:FindFirstChild("RecordsWebRemotes")
if not remotes then
    remotes = Instance.new("Folder")
    remotes.Name = "RecordsWebRemotes"
    remotes.Parent = ReplicatedStorage
end

local identityRequest = remotes:FindFirstChild("RecordsWebIdentityRequest")
if not identityRequest then
    identityRequest = Instance.new("RemoteFunction")
    identityRequest.Name = "RecordsWebIdentityRequest"
    identityRequest.Parent = remotes
end

local function requestApi(player, action, roleplay)
    local response = HttpService:RequestAsync({
        Url = API_URL,
        Method = "POST",
        Headers = {
            ["Content-Type"] = "application/json",
            ["x-recordsweb-key"] = Config.ConnectionCode,
        },
        Body = HttpService:JSONEncode({
            action = action,
            universeId = tostring(game.GameId),
            placeId = tostring(game.PlaceId),
            serverId = game.JobId,
            robloxUserId = tostring(player.UserId),
            robloxUsername = player.Name,
            robloxDisplayName = player.DisplayName,
            roleplay = roleplay,
        }),
    })

    local payload
    local ok = pcall(function()
        payload = HttpService:JSONDecode(response.Body)
    end)

    if not response.Success then
        error((ok and payload and payload.error) or ("RecordsWeb API HTTP " .. tostring(response.StatusCode)))
    end

    if not ok or type(payload) ~= "table" or payload.ok ~= true then
        error((payload and payload.error) or "RecordsWeb rejected the identity request")
    end

    return payload
end

local function applyIdentity(player, payload)
    local identity = payload and payload.identity
    local patient = identity and identity.patient

    player:SetAttribute("RecordsWebIdentityNeedsRegistration", payload and payload.needsRegistration == true)
    player:SetAttribute("RecordsWebPatientId", patient and patient.id or nil)
    player:SetAttribute("RecordsWebRoleplayFirstName", patient and patient.firstName or nil)
    player:SetAttribute("RecordsWebRoleplayLastName", patient and patient.lastName or nil)
    player:SetAttribute("RecordsWebRoleplayName", patient and patient.fullName or nil)
    player:SetAttribute("RecordsWebRoleplayDOB", patient and patient.dob or nil)

    return payload
end

local function resolvePlayer(player)
    local ok, payload = pcall(requestApi, player, "identity-resolve", nil)
    if ok then
        applyIdentity(player, payload)
    else
        warn("[RecordsWeb] RP identity lookup failed for " .. player.Name .. ": " .. tostring(payload))
        player:SetAttribute("RecordsWebIdentityNeedsRegistration", nil)
    end
end

Players.PlayerAdded:Connect(function(player)
    task.spawn(resolvePlayer, player)
end)

for _, player in ipairs(Players:GetPlayers()) do
    task.spawn(resolvePlayer, player)
end

identityRequest.OnServerInvoke = function(player, operation, roleplay)
    if operation == "get" then
        local payload = requestApi(player, "identity-get", nil)
        return applyIdentity(player, payload)
    end

    if operation == "register" then
        if type(roleplay) ~= "table" then
            return { ok = false, error = "Roleplay patient details are required." }
        end
        local payload = requestApi(player, "identity-register", roleplay)
        return applyIdentity(player, payload)
    end

    if operation == "update" then
        if type(roleplay) ~= "table" then
            return { ok = false, error = "Roleplay patient details are required." }
        end
        local payload = requestApi(player, "identity-update", roleplay)
        return applyIdentity(player, payload)
    end

    return { ok = false, error = "Unknown RecordsWeb identity operation." }
end
