// Template gallery: ready-made, clean building blocks that Bloxcode inserts into the place.
// Each template creates instance trees (with scripts) in one or more services, and can install
// Wally packages first. Scripts are written for modern Luau and are safe against exploiters.

const V3 = (x, y, z) => ({ type: 'Vector3', value: [x, y, z] });
const RGB = (r, g, b) => ({ type: 'Color3', value: [r, g, b] });
const UD2 = (xs, xo, ys, yo) => ({ type: 'UDim2', value: [xs, xo, ys, yo] });
const ENUM = (v) => ({ type: 'Enum', value: v });

const TEMPLATES = [
  // ------------------------------------------------------------------
  {
    id: 'player-data',
    name: 'Leaderstats & saving',
    category: 'Data',
    description: 'Coins and Level in the leaderboard, saved with DataStoreService: retries, autosave every 2 minutes and saving on shutdown.',
    main: 'ServerScriptService.PlayerData',
    roots: [{
      parent: 'ServerScriptService',
      tree: { class: 'Script', name: 'PlayerData', source: `
-- Leaderstats with saving. Change DEFAULTS to add more stats.
local DataStoreService = game:GetService("DataStoreService")
local Players = game:GetService("Players")

local STORE = DataStoreService:GetDataStore("PlayerData_v1")
local DEFAULTS = { Coins = 0, Level = 1 }
local AUTOSAVE_SECONDS = 120
local RETRIES = 3

local function retry<T>(fn: () -> T): (boolean, T | string)
	local ok, result
	for attempt = 1, RETRIES do
		ok, result = pcall(fn)
		if ok then
			return true, result
		end
		task.wait(attempt * 2)
	end
	return false, result
end

local loaded: { [Player]: boolean } = {}

local function key(player: Player): string
	return "player_" .. player.UserId
end

local function save(player: Player)
	if not loaded[player] then
		return -- never overwrite data that failed to load
	end
	local leaderstats = player:FindFirstChild("leaderstats")
	if not leaderstats then
		return
	end
	local data = {}
	for name in DEFAULTS do
		local value = leaderstats:FindFirstChild(name) :: IntValue?
		data[name] = if value then value.Value else DEFAULTS[name]
	end
	local ok, err = retry(function()
		STORE:SetAsync(key(player), data)
	end)
	if not ok then
		warn(\`Could not save data for {player.Name}: {err}\`)
	end
end

local function onPlayerAdded(player: Player)
	-- reuse leaderstats another script (like checkpoints) may have made already
	local leaderstats = player:FindFirstChild("leaderstats") or Instance.new("Folder")
	leaderstats.Name = "leaderstats"

	local ok, data = retry(function()
		return STORE:GetAsync(key(player))
	end)
	if not ok then
		warn(\`Could not load data for {player.Name}: {data}\`)
	end
	local saved = if ok and type(data) == "table" then data else {}

	for name, default in DEFAULTS do
		local value = Instance.new("IntValue")
		value.Name = name
		value.Value = if type(saved[name]) == "number" then saved[name] else default
		value.Parent = leaderstats
	end
	leaderstats.Parent = player
	loaded[player] = ok
end

Players.PlayerAdded:Connect(onPlayerAdded)
for _, player in Players:GetPlayers() do
	task.spawn(onPlayerAdded, player)
end

Players.PlayerRemoving:Connect(function(player)
	save(player)
	loaded[player] = nil
end)

game:BindToClose(function()
	for _, player in Players:GetPlayers() do
		task.spawn(save, player)
	end
	task.wait(3) -- give the saves time to finish
end)

task.spawn(function()
	while true do
		task.wait(AUTOSAVE_SECONDS)
		for _, player in Players:GetPlayers() do
			task.spawn(save, player)
		end
	end
end)
` },
    }],
  },

  // ------------------------------------------------------------------
  {
    id: 'coins',
    name: 'Collectible coins',
    category: 'Gameplay',
    description: 'Spinning coins that give leaderstats.Coins when touched and come back after a few seconds. Add more coins by tagging any part "Coin".',
    main: 'ServerScriptService.CoinService',
    roots: [
      {
        parent: 'Workspace',
        tree: {
          class: 'Folder', name: 'Coins',
          children: [0, 1, 2, 3, 4].map((i) => ({
            class: 'Part', name: 'Coin', tags: ['Coin'], attributes: { Value: 1 },
            properties: { Shape: ENUM('Enum.PartType.Cylinder'), Size: V3(0.4, 3, 3), Position: V3(-12 + i * 6, 3, -20), Orientation: V3(0, 0, 90), Anchored: true, CanCollide: false, Material: ENUM('Enum.Material.Neon'), Color: RGB(255, 200, 40) },
          })),
        },
      },
      {
        parent: 'ServerScriptService',
        tree: { class: 'Script', name: 'CoinService', source: `
-- Every part tagged "Coin" can be collected. The "Value" attribute sets how many coins it gives.
local CollectionService = game:GetService("CollectionService")
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")

local RESPAWN_SECONDS = 8
local SPIN_SPEED = math.rad(90) -- per second

local coins: { [BasePart]: CFrame } = {}

local function addCoins(player: Player, amount: number)
	local leaderstats = player:FindFirstChild("leaderstats")
	local stat = leaderstats and leaderstats:FindFirstChild("Coins") :: IntValue?
	if stat then
		stat.Value += amount
	end
end

local function setup(coin: Instance)
	if not coin:IsA("BasePart") then
		return
	end
	coins[coin] = coin.CFrame
	local collected = false
	coin.Touched:Connect(function(hit)
		if collected then
			return
		end
		local player = Players:GetPlayerFromCharacter(hit.Parent)
		if not player then
			return
		end
		collected = true
		addCoins(player, (coin:GetAttribute("Value") :: number?) or 1)
		coin.Transparency = 1
		task.delay(RESPAWN_SECONDS, function()
			coin.Transparency = 0
			collected = false
		end)
	end)
end

CollectionService:GetInstanceAddedSignal("Coin"):Connect(setup)
CollectionService:GetInstanceRemovedSignal("Coin"):Connect(function(coin)
	coins[coin :: BasePart] = nil
end)
for _, coin in CollectionService:GetTagged("Coin") do
	setup(coin)
end

RunService.Heartbeat:Connect(function()
	local angle = os.clock() * SPIN_SPEED
	for coin, origin in coins do
		coin.CFrame = origin * CFrame.Angles(angle, 0, 0)
	end
end)
` },
      },
    ],
  },

  // ------------------------------------------------------------------
  {
    id: 'shop',
    name: 'Shop GUI',
    category: 'UI',
    description: 'A shop window that sells items for coins. The server checks every purchase, so exploiters can\'t buy for free. Edit the items in ReplicatedStorage.Shop.Items.',
    main: 'ReplicatedStorage.Shop.Items',
    roots: [
      {
        parent: 'ReplicatedStorage',
        tree: {
          class: 'Folder', name: 'Shop',
          children: [
            { class: 'RemoteFunction', name: 'Buy' },
            { class: 'ModuleScript', name: 'Items', source: `
-- The items in the shop. The server reads prices from here, never from the client.
export type Item = { id: string, name: string, price: number, description: string }

local Items: { Item } = {
	{ id = "speed", name = "Speed Coil", price = 50, description = "Run faster" },
	{ id = "jump", name = "Jump Boots", price = 75, description = "Jump higher" },
	{ id = "vip", name = "VIP Badge", price = 250, description = "Show everyone you are a VIP" },
}

return Items
` },
          ],
        },
      },
      {
        parent: 'ServerScriptService',
        tree: { class: 'Script', name: 'ShopService', source: `
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shop = ReplicatedStorage:WaitForChild("Shop")
local Items = require(Shop:WaitForChild("Items"))
local Buy = Shop:WaitForChild("Buy") :: RemoteFunction

local COOLDOWN = 0.5
local lastPurchase: { [Player]: number } = {}

local function findItem(id: string)
	for _, item in Items do
		if item.id == id then
			return item
		end
	end
	return nil
end

-- What happens when someone buys an item: change this to give tools, boosts and so on.
local function give(player: Player, itemId: string)
	if itemId == "speed" then
		local humanoid = player.Character and player.Character:FindFirstChildOfClass("Humanoid")
		if humanoid then
			humanoid.WalkSpeed = 24
		end
	elseif itemId == "jump" then
		local humanoid = player.Character and player.Character:FindFirstChildOfClass("Humanoid")
		if humanoid then
			humanoid.UseJumpPower = true
			humanoid.JumpPower = 70
		end
	end
	player:SetAttribute("Owns_" .. itemId, true)
end

Buy.OnServerInvoke = function(player: Player, itemId: unknown)
	-- never trust the client: check the type, the item, the cooldown and the price
	if typeof(itemId) ~= "string" then
		return false, "Invalid item"
	end
	local now = os.clock()
	if now - (lastPurchase[player] or 0) < COOLDOWN then
		return false, "Slow down"
	end
	lastPurchase[player] = now

	local item = findItem(itemId)
	if not item then
		return false, "Unknown item"
	end
	if player:GetAttribute("Owns_" .. item.id) then
		return false, "Already owned"
	end
	local leaderstats = player:FindFirstChild("leaderstats")
	local coins = leaderstats and leaderstats:FindFirstChild("Coins") :: IntValue?
	if not coins or coins.Value < item.price then
		return false, "Not enough coins"
	end
	coins.Value -= item.price
	give(player, item.id)
	return true, "Bought " .. item.name
end

game:GetService("Players").PlayerRemoving:Connect(function(player)
	lastPurchase[player] = nil
end)
` },
      },
      {
        parent: 'StarterGui',
        tree: {
          class: 'ScreenGui', name: 'ShopGui', properties: { ResetOnSpawn: false },
          children: [
            { class: 'TextButton', name: 'OpenButton', properties: { Text: 'Shop', Size: UD2(0, 110, 0, 40), Position: UD2(0, 16, 0.5, -20), BackgroundColor3: RGB(124, 108, 255), TextColor3: RGB(255, 255, 255), Font: ENUM('Enum.Font.GothamBold'), TextSize: 18 }, children: [{ class: 'UICorner', name: 'UICorner', properties: { CornerRadius: { type: 'UDim', value: [0, 10] } } }] },
            {
              class: 'Frame', name: 'Window', properties: { Visible: false, Size: UD2(0, 340, 0, 380), Position: UD2(0.5, -170, 0.5, -190), BackgroundColor3: RGB(20, 22, 36) },
              children: [
                { class: 'UICorner', name: 'UICorner', properties: { CornerRadius: { type: 'UDim', value: [0, 14] } } },
                { class: 'UIStroke', name: 'UIStroke', properties: { Color: RGB(60, 64, 100), Thickness: 1 } },
                { class: 'TextLabel', name: 'Title', properties: { Text: 'Shop', Size: UD2(1, 0, 0, 50), BackgroundTransparency: 1, TextColor3: RGB(255, 255, 255), Font: ENUM('Enum.Font.GothamBold'), TextSize: 24 } },
                { class: 'TextLabel', name: 'Message', properties: { Text: '', Size: UD2(1, -20, 0, 24), Position: UD2(0, 10, 1, -32), BackgroundTransparency: 1, TextColor3: RGB(200, 200, 220), Font: ENUM('Enum.Font.Gotham'), TextSize: 15 } },
                {
                  class: 'ScrollingFrame', name: 'List', properties: { Size: UD2(1, -20, 1, -96), Position: UD2(0, 10, 0, 54), BackgroundTransparency: 1, BorderSizePixel: 0, ScrollBarThickness: 4, AutomaticCanvasSize: ENUM('Enum.AutomaticSize.Y'), CanvasSize: UD2(0, 0, 0, 0) },
                  children: [{ class: 'UIListLayout', name: 'UIListLayout', properties: { Padding: { type: 'UDim', value: [0, 8] }, SortOrder: ENUM('Enum.SortOrder.LayoutOrder') } }],
                },
              ],
            },
            { class: 'LocalScript', name: 'ShopClient', source: `
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shop = ReplicatedStorage:WaitForChild("Shop")
local Items = require(Shop:WaitForChild("Items"))
local Buy = Shop:WaitForChild("Buy") :: RemoteFunction

local gui = script.Parent :: ScreenGui
local window = gui:WaitForChild("Window") :: Frame
local list = window:WaitForChild("List") :: ScrollingFrame
local message = window:WaitForChild("Message") :: TextLabel
local openButton = gui:WaitForChild("OpenButton") :: TextButton

openButton.Activated:Connect(function()
	window.Visible = not window.Visible
end)

for index, item in Items do
	local button = Instance.new("TextButton")
	button.Name = item.id
	button.LayoutOrder = index
	button.Size = UDim2.new(1, -6, 0, 56)
	button.BackgroundColor3 = Color3.fromRGB(34, 38, 60)
	button.TextColor3 = Color3.fromRGB(255, 255, 255)
	button.Font = Enum.Font.Gotham
	button.TextSize = 16
	button.Text = \`{item.name}  ·  {item.price} coins\`
	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0, 8)
	corner.Parent = button
	button.Parent = list

	button.Activated:Connect(function()
		local ok, result = Buy:InvokeServer(item.id)
		message.Text = result or (if ok then "Done" else "Something went wrong")
		message.TextColor3 = if ok then Color3.fromRGB(120, 230, 140) else Color3.fromRGB(255, 120, 120)
	end)
end
` },
          ],
        },
      },
    ],
  },

  // ------------------------------------------------------------------
  {
    id: 'checkpoints',
    name: 'Obby checkpoints',
    category: 'Gameplay',
    description: 'Checkpoints with a Stage in the leaderboard. Players respawn at the last checkpoint they touched. Tag any part "Checkpoint" and give it a Stage attribute.',
    main: 'ServerScriptService.Checkpoints',
    roots: [
      {
        parent: 'Workspace',
        tree: {
          class: 'Folder', name: 'Checkpoints',
          children: [1, 2, 3].map((stage) => ({
            class: 'Part', name: 'Stage' + stage, tags: ['Checkpoint'], attributes: { Stage: stage },
            properties: { Size: V3(8, 1, 8), Position: V3(stage * 30, 1, 30), Anchored: true, Material: ENUM('Enum.Material.SmoothPlastic'), Color: RGB(90, 200, 120) },
          })),
        },
      },
      {
        parent: 'ServerScriptService',
        tree: { class: 'Script', name: 'Checkpoints', source: `
local CollectionService = game:GetService("CollectionService")
local Players = game:GetService("Players")

local checkpoints: { [number]: BasePart } = {}

local function stageOf(player: Player): IntValue?
	local leaderstats = player:FindFirstChild("leaderstats")
	return leaderstats and leaderstats:FindFirstChild("Stage") :: IntValue?
end

local function register(part: Instance)
	if not part:IsA("BasePart") then
		return
	end
	local stage = part:GetAttribute("Stage")
	if type(stage) ~= "number" then
		warn(\`{part:GetFullName()} is tagged Checkpoint but has no Stage attribute\`)
		return
	end
	checkpoints[stage] = part
	part.Touched:Connect(function(hit)
		local player = Players:GetPlayerFromCharacter(hit.Parent)
		local value = player and stageOf(player)
		-- only move forward one stage at a time, so players can't skip
		if value and stage == value.Value + 1 then
			value.Value = stage
		end
	end)
end

for _, part in CollectionService:GetTagged("Checkpoint") do
	register(part)
end
CollectionService:GetInstanceAddedSignal("Checkpoint"):Connect(register)

Players.PlayerAdded:Connect(function(player)
	local leaderstats = player:FindFirstChild("leaderstats") or Instance.new("Folder")
	leaderstats.Name = "leaderstats"
	local stage = Instance.new("IntValue")
	stage.Name = "Stage"
	stage.Value = 0
	stage.Parent = leaderstats
	leaderstats.Parent = player

	player.CharacterAdded:Connect(function(character)
		local checkpoint = checkpoints[stage.Value]
		if checkpoint then
			local root = character:WaitForChild("HumanoidRootPart") :: BasePart
			task.defer(function()
				root.CFrame = checkpoint.CFrame + Vector3.new(0, 4, 0)
			end)
		end
	end)
end)
` },
      },
    ],
  },

  // ------------------------------------------------------------------
  {
    id: 'kill-bricks',
    name: 'Kill bricks & damage parts',
    category: 'Gameplay',
    description: 'Parts that hurt players. Tag a part "Damage" and set its Damage attribute (100 = kill). Includes a red kill brick.',
    main: 'ServerScriptService.Hazards',
    roots: [
      {
        parent: 'Workspace',
        tree: { class: 'Part', name: 'KillBrick', tags: ['Damage'], attributes: { Damage: 100 }, properties: { Size: V3(12, 1, 12), Position: V3(0, 0.5, 40), Anchored: true, Material: ENUM('Enum.Material.Neon'), Color: RGB(230, 50, 50) } },
      },
      {
        parent: 'ServerScriptService',
        tree: { class: 'Script', name: 'Hazards', source: `
-- Any part tagged "Damage" hurts players by its Damage attribute (default 100), at most every COOLDOWN seconds.
local CollectionService = game:GetService("CollectionService")
local Players = game:GetService("Players")

local COOLDOWN = 0.5
local lastHit: { [Humanoid]: number } = {}

local function setup(part: Instance)
	if not part:IsA("BasePart") then
		return
	end
	part.Touched:Connect(function(hit)
		local character = hit.Parent
		local humanoid = character and character:FindFirstChildOfClass("Humanoid")
		if not humanoid or not Players:GetPlayerFromCharacter(character) or humanoid.Health <= 0 then
			return
		end
		local now = os.clock()
		if now - (lastHit[humanoid] or 0) < COOLDOWN then
			return
		end
		lastHit[humanoid] = now
		humanoid:TakeDamage(part:GetAttribute("Damage") or 100)
		humanoid.Died:Once(function()
			lastHit[humanoid] = nil
		end)
	end)
end

for _, part in CollectionService:GetTagged("Damage") do
	setup(part)
end
CollectionService:GetInstanceAddedSignal("Damage"):Connect(setup)
` },
      },
    ],
  },

  // ------------------------------------------------------------------
  {
    id: 'rounds',
    name: 'Round system',
    category: 'Gameplay',
    description: 'Intermission, then a timed round: players are teleported to the map and back to the lobby. A status text shows the time left.',
    main: 'ServerScriptService.RoundSystem',
    roots: [
      { parent: 'ReplicatedStorage', tree: { class: 'StringValue', name: 'RoundStatus', properties: { Value: 'Waiting for players…' } } },
      { parent: 'Workspace', tree: { class: 'Part', name: 'MapSpawn', properties: { Size: V3(10, 1, 10), Position: V3(0, 1, 120), Anchored: true, Material: ENUM('Enum.Material.SmoothPlastic'), Color: RGB(70, 130, 255) } } },
      {
        parent: 'ServerScriptService',
        tree: { class: 'Script', name: 'RoundSystem', source: `
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local INTERMISSION = 15
local ROUND_LENGTH = 60
local MIN_PLAYERS = 1

local status = ReplicatedStorage:WaitForChild("RoundStatus") :: StringValue
local mapSpawn = workspace:WaitForChild("MapSpawn") :: BasePart

local function teleport(player: Player, cframe: CFrame)
	local root = player.Character and player.Character:FindFirstChild("HumanoidRootPart") :: BasePart?
	if root then
		root.CFrame = cframe
	end
end

local function countdown(label: string, seconds: number)
	for t = seconds, 1, -1 do
		status.Value = \`{label}: {t}\`
		task.wait(1)
	end
end

while true do
	while #Players:GetPlayers() < MIN_PLAYERS do
		status.Value = "Waiting for players…"
		task.wait(2)
	end

	countdown("Intermission", INTERMISSION)

	local playing: { Player } = Players:GetPlayers()
	for i, player in playing do
		teleport(player, mapSpawn.CFrame + Vector3.new((i - 1) * 3, 4, 0))
	end

	countdown("Round", ROUND_LENGTH)

	status.Value = "Round over!"
	for _, player in playing do
		if player.Parent then
			player:LoadCharacter() -- back to the lobby spawn
		end
	end
	task.wait(3)
end
` },
      },
      {
        parent: 'StarterGui',
        tree: {
          class: 'ScreenGui', name: 'RoundGui', properties: { ResetOnSpawn: false },
          children: [
            { class: 'TextLabel', name: 'Status', properties: { Size: UD2(0, 320, 0, 44), Position: UD2(0.5, -160, 0, 12), BackgroundColor3: RGB(20, 22, 36), BackgroundTransparency: 0.2, TextColor3: RGB(255, 255, 255), Font: ENUM('Enum.Font.GothamBold'), TextSize: 20, Text: '' }, children: [{ class: 'UICorner', name: 'UICorner', properties: { CornerRadius: { type: 'UDim', value: [0, 10] } } }] },
            { class: 'LocalScript', name: 'StatusClient', source: `local ReplicatedStorage = game:GetService("ReplicatedStorage")

local status = ReplicatedStorage:WaitForChild("RoundStatus") :: StringValue
local label = (script.Parent :: ScreenGui):WaitForChild("Status") :: TextLabel

local function update()
	label.Text = status.Value
end
status.Changed:Connect(update)
update()
` },
          ],
        },
      },
    ],
  },

  // ------------------------------------------------------------------
  {
    id: 'day-night',
    name: 'Day & night cycle',
    category: 'World',
    description: 'Moves the sun across the sky. Change the MinutesPerDay attribute on the script to make days longer or shorter.',
    main: 'ServerScriptService.DayNightCycle',
    roots: [{
      parent: 'ServerScriptService',
      tree: { class: 'Script', name: 'DayNightCycle', attributes: { MinutesPerDay: 10 }, source: `
local Lighting = game:GetService("Lighting")
local RunService = game:GetService("RunService")

RunService.Heartbeat:Connect(function(dt)
	local minutesPerDay = script:GetAttribute("MinutesPerDay") or 10
	local hoursPerSecond = 24 / (minutesPerDay * 60)
	Lighting.ClockTime = (Lighting.ClockTime + dt * hoursPerSecond) % 24
end)
` },
    }],
  },

  // ------------------------------------------------------------------
  {
    id: 'sprint',
    name: 'Sprint with Shift',
    category: 'Player',
    description: 'Hold Shift (or the button on mobile) to run faster, with a smooth field-of-view effect and stamina.',
    main: 'StarterPlayer.StarterCharacterScripts.Sprint',
    roots: [{
      parent: 'StarterPlayer.StarterCharacterScripts',
      tree: { class: 'LocalScript', name: 'Sprint', source: `
local ContextActionService = game:GetService("ContextActionService")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")

local WALK_SPEED = 16
local SPRINT_SPEED = 26
local MAX_STAMINA = 5 -- seconds of sprinting
local camera = workspace.CurrentCamera
local humanoid = (script.Parent :: Model):WaitForChild("Humanoid") :: Humanoid

local stamina = MAX_STAMINA
local wantsSprint = false

local function setFov(fov: number)
	TweenService:Create(camera, TweenInfo.new(0.25, Enum.EasingStyle.Quad), { FieldOfView = fov }):Play()
end

local function onSprint(_: string, state: Enum.UserInputState)
	wantsSprint = state == Enum.UserInputState.Begin
	return Enum.ContextActionResult.Pass
end

ContextActionService:BindAction("Sprint", onSprint, true, Enum.KeyCode.LeftShift, Enum.KeyCode.ButtonL3)
ContextActionService:SetTitle("Sprint", "Run")

local sprinting = false
local connection = RunService.Heartbeat:Connect(function(dt)
	local moving = humanoid.MoveDirection.Magnitude > 0
	local shouldSprint = wantsSprint and moving and stamina > 0
	if shouldSprint then
		stamina = math.max(0, stamina - dt)
	else
		stamina = math.min(MAX_STAMINA, stamina + dt * 0.5)
	end
	if shouldSprint ~= sprinting then
		sprinting = shouldSprint
		humanoid.WalkSpeed = if sprinting then SPRINT_SPEED else WALK_SPEED
		setFov(if sprinting then 80 else 70)
	end
end)

humanoid.Died:Once(function()
	connection:Disconnect()
	ContextActionService:UnbindAction("Sprint")
	setFov(70)
end)
` },
    }],
  },

  // ------------------------------------------------------------------
  {
    id: 'door',
    name: 'Door with prompt',
    category: 'World',
    description: 'A door that slides open when a player presses E (ProximityPrompt) and closes again by itself.',
    main: 'Workspace.Door.DoorScript',
    roots: [{
      parent: 'Workspace',
      tree: {
        class: 'Model', name: 'Door',
        children: [
          {
            class: 'Part', name: 'Panel', properties: { Size: V3(6, 9, 0.6), Position: V3(-30, 4.5, 0), Anchored: true, Material: ENUM('Enum.Material.Wood'), Color: RGB(140, 90, 50) },
            children: [{ class: 'ProximityPrompt', name: 'ProximityPrompt', properties: { ActionText: 'Open', ObjectText: 'Door', HoldDuration: 0, MaxActivationDistance: 10 } }],
          },
          { class: 'Script', name: 'DoorScript', source: `
local TweenService = game:GetService("TweenService")

local OPEN_SECONDS = 3
local panel = (script.Parent :: Model):WaitForChild("Panel") :: BasePart
local prompt = panel:WaitForChild("ProximityPrompt") :: ProximityPrompt
local closed = panel.CFrame
local opened = closed * CFrame.new(panel.Size.X, 0, 0)
local info = TweenInfo.new(0.6, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)

prompt.Triggered:Connect(function()
	prompt.Enabled = false
	TweenService:Create(panel, info, { CFrame = opened }):Play()
	task.wait(OPEN_SECONDS)
	local closing = TweenService:Create(panel, info, { CFrame = closed })
	closing:Play()
	closing.Completed:Wait()
	prompt.Enabled = true
end)
` },
        ],
      },
    }],
  },

  // ------------------------------------------------------------------
  {
    id: 'cmdr',
    name: 'Admin commands (Cmdr)',
    category: 'Tools',
    description: 'Installs Cmdr from Wally and sets it up: press F2 in game for the command bar. Only the users in ADMINS can use it.',
    main: 'ServerScriptService.CmdrSetup',
    packages: ['evaera/cmdr'],
    roots: [
      {
        parent: 'ServerScriptService',
        tree: { class: 'Script', name: 'CmdrSetup', source: `
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Cmdr = require(ReplicatedStorage:WaitForChild("Packages"):WaitForChild("Cmdr"))

-- Put your Roblox user id here (and anyone else who may use admin commands).
local ADMINS = {
	[game.CreatorId] = true,
}

Cmdr:RegisterDefaultCommands()

Cmdr.Registry:RegisterHook("BeforeRun", function(context)
	if context.Group == "DefaultAdmin" and not ADMINS[context.Executor.UserId] then
		return "You don't have permission to run this command."
	end
	return nil
end)
` },
      },
      {
        parent: 'StarterPlayer.StarterPlayerScripts',
        tree: { class: 'LocalScript', name: 'CmdrClient', source: `local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Cmdr = require(ReplicatedStorage:WaitForChild("CmdrClient"))
Cmdr:SetActivationKeys({ Enum.KeyCode.F2 })
` },
      },
    ],
  },
];

function createTemplates({ studio, packages }) {
  function list() {
    return TEMPLATES.map((t) => ({ id: t.id, name: t.name, category: t.category, description: t.description, packages: t.packages || [], creates: t.roots.map((r) => `${r.parent}.${r.tree.name}`) }));
  }

  /** Inserts a template. Returns what was created. */
  async function insert(id, { agent = false } = {}) {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) throw new Error(`Unknown template "${id}". Use one of: ${TEMPLATES.map((x) => x.id).join(', ')}.`);
    studio.requireStudio(3);
    for (const spec of t.packages || []) {
      const { command } = await packages.buildInstall(spec, () => {});
      await studio.ask(command, { timeout: 60000, agent });
    }
    const created = [];
    for (const root of t.roots) {
      const parentId = studio.resolve(root.parent);
      // don't overwrite: add a number when something with the same name exists
      let name = root.tree.name;
      const taken = new Set([...studio.kids(parentId)].map((c) => studio.nodes.get(c) && studio.nodes.get(c).name));
      for (let i = 2; taken.has(name); i++) name = `${root.tree.name}${i}`;
      const r = await studio.ask({ type: 'createTree', parentId, tree: { ...root.tree, name } }, { timeout: 60000, minVersion: 3, agent });
      if (r) created.push(r);
    }
    const mainId = (() => { try { return studio.resolve(t.main); } catch (_) { return null; } })();
    return { template: t.name, created, mainId };
  }

  return { list, insert };
}

module.exports = { createTemplates, TEMPLATES };
