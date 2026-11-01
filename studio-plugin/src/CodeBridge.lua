--[=[
	@class CodeBridge

	Roblox Studio plugin that connects Studio to the external editor **Bloxcode**.

	While **Code Mode** is on:

	- every script you open in Studio (for example with a double-click) is closed right away
	  and opened in Bloxcode instead,
	- the Explorer (Workspace, ServerScriptService, ReplicatedStorage, …) is mirrored to
	  Bloxcode live,
	- the plugin runs commands from Bloxcode (create, rename, move, delete, set source,
	  install Wally packages).

	It talks to Bloxcode over HTTP at `http://localhost:34872` (see [Protocol]).
	Every change from Bloxcode is recorded with [ChangeHistoryService], so you can undo it
	in Studio with Ctrl+Z.
]=]

local HttpService = game:GetService("HttpService")
local ScriptEditorService = game:GetService("ScriptEditorService")
local ChangeHistoryService = game:GetService("ChangeHistoryService")
local Selection = game:GetService("Selection")
local RunService = game:GetService("RunService")

-- Plugins also load inside Play-test sessions. Only the edit DataModel talks to Bloxcode.
if not RunService:IsEdit() then
	return
end

--[=[
	@prop BASE_URL string
	@within CodeBridge
	@readonly
	Address of the local Bloxcode server.
]=]
local BASE_URL = "http://localhost:34872"

--[=[
	@prop TRACKED_SERVICES { string }
	@within CodeBridge
	@readonly
	Services shown in the Bloxcode Explorer.
]=]
local TRACKED_SERVICES = {
	"Workspace",
	"Players",
	"Lighting",
	"MaterialService",
	"ReplicatedFirst",
	"ReplicatedStorage",
	"ServerScriptService",
	"ServerStorage",
	"StarterGui",
	"StarterPack",
	"StarterPlayer",
	"Teams",
	"SoundService",
	"TextChatService",
}

local BATCH_SIZE = 1500
local FLUSH_INTERVAL = 0.15

local DEFAULT_SOURCE = {
	Script = 'print("Hello world!")\n',
	LocalScript = 'print("Hello world!")\n',
	ModuleScript = "local module = {}\n\nreturn module\n",
}

-- ---------------------------------------------------------------------
-- State
-- ---------------------------------------------------------------------

local clientId = HttpService:GenerateGUID(false)
local codeMode = false
local connected = false
local session = nil
local generation = 0 -- bumps each time code mode is toggled, stops old loops

local idOf = setmetatable({}, { __mode = "k" }) -- Instance -> id
local byId = setmetatable({}, { __mode = "v" }) -- id -> Instance
local nextId = 0
local instanceConns = {} -- Instance -> { RBXScriptConnection }
local serviceConns = {}
local openInApp = {} -- id -> true while the script has a tab in Bloxcode
local lastSource = {} -- id -> last source known on both sides
local outbox = {}

local setStatus -- forward declaration (UI)

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------

--[=[
	Returns the stable ID of an instance (assigns one if needed).
	@within CodeBridge
	@private
	@param inst Instance -- any instance
	@return string
]=]
local function getId(inst: Instance): string
	local id = idOf[inst]
	if not id then
		nextId += 1
		id = tostring(nextId)
		idOf[inst] = id
		byId[id] = inst
	end
	return id
end

local function isScript(inst)
	return inst:IsA("LuaSourceContainer") and (inst:IsA("Script") or inst:IsA("ModuleScript"))
end

local function push(event)
	table.insert(outbox, event)
end

local function safeName(inst)
	local ok, name = pcall(function()
		return inst.Name
	end)
	return ok and name or "?"
end

--[=[
	Sends an HTTP request to Bloxcode. Returns the decoded JSON on success,
	otherwise `nil` and an error message.
	@within CodeBridge
	@private
	@yields
]=]
local function request(method: string, path: string, body: any?): (any?, string?)
	local ok, res = pcall(function()
		return HttpService:RequestAsync({
			Url = BASE_URL .. path,
			Method = method,
			Headers = { ["Content-Type"] = "application/json" },
			Body = body and HttpService:JSONEncode(body) or nil,
		})
	end)
	if not ok then
		return nil, tostring(res)
	end
	if not res.Success then
		return nil, ("HTTP %d"):format(res.StatusCode)
	end
	local okJson, data = pcall(function()
		return HttpService:JSONDecode(res.Body)
	end)
	if not okJson then
		return nil, "Invalid response"
	end
	return data
end

local function withRecording(name, fn)
	local recording = ChangeHistoryService:TryBeginRecording("Bloxcode: " .. name)
	local ok, err = pcall(fn)
	if recording then
		ChangeHistoryService:FinishRecording(
			recording,
			ok and Enum.FinishRecordingOperation.Commit or Enum.FinishRecordingOperation.Cancel
		)
	end
	if not ok then
		push({ op = "error", message = tostring(err) })
	end
	return ok
end

-- ---------------------------------------------------------------------
-- Tree tracking
-- ---------------------------------------------------------------------

local function nodeEvent(inst)
	local parent = inst.Parent
	return {
		op = "add",
		id = getId(inst),
		name = safeName(inst),
		cls = inst.ClassName,
		parent = (parent and parent ~= game) and getId(parent) or nil,
	}
end

local function readSource(inst)
	local ok, src = pcall(function()
		return ScriptEditorService:GetEditorSource(inst)
	end)
	if ok and type(src) == "string" then
		return src
	end
	return inst.Source
end

local function untrack(inst)
	local list = instanceConns[inst]
	if list then
		for _, c in list do
			c:Disconnect()
		end
		instanceConns[inst] = nil
	end
end

--[=[
	Listens for Name, Parent and Source changes of an instance.
	@within CodeBridge
	@private
]=]
local function track(inst: Instance)
	if instanceConns[inst] then
		return
	end
	local id = getId(inst)
	local list = {}
	local ok = pcall(function()
		table.insert(
			list,
			inst:GetPropertyChangedSignal("Name"):Connect(function()
				push({ op = "rename", id = id, name = inst.Name })
			end)
		)
		table.insert(
			list,
			inst:GetPropertyChangedSignal("Parent"):Connect(function()
				local p = inst.Parent
				if p and p ~= game and idOf[p] and instanceConns[p] then
					push({ op = "move", id = id, parent = idOf[p] })
				end
			end)
		)
		if isScript(inst) then
			table.insert(
				list,
				inst:GetPropertyChangedSignal("Source"):Connect(function()
					if not openInApp[id] then
						return
					end
					local src = inst.Source
					if src ~= lastSource[id] then
						lastSource[id] = src
						push({ op = "source", id = id, source = src })
					end
				end)
			)
		end
	end)
	if ok then
		instanceConns[inst] = list
	end
end

local function onAdded(inst)
	if not codeMode then
		return
	end
	push(nodeEvent(inst))
	track(inst)
end

local function onRemoving(inst)
	if not codeMode then
		return
	end
	local id = idOf[inst]
	if id then
		push({ op = "remove", id = id })
	end
	untrack(inst)
end

--[=[
	Sends the whole Explorer tree to Bloxcode (for example after connecting).
	@within CodeBridge
	@private
]=]
local function sendSnapshot()
	outbox = { { op = "reset" } }
	local count = 0
	for _, serviceName in TRACKED_SERVICES do
		local ok, service = pcall(function()
			return game:GetService(serviceName)
		end)
		if ok and service then
			push(nodeEvent(service))
			track(service)
			for _, d in service:GetDescendants() do
				push(nodeEvent(d))
				track(d)
				count += 1
				if count % 3000 == 0 then
					task.wait()
				end
			end
		end
	end
end

local function startTracking()
	for _, serviceName in TRACKED_SERVICES do
		local ok, service = pcall(function()
			return game:GetService(serviceName)
		end)
		if ok and service then
			table.insert(serviceConns, service.DescendantAdded:Connect(onAdded))
			table.insert(serviceConns, service.DescendantRemoving:Connect(onRemoving))
		end
	end
end

local function stopTracking()
	for _, c in serviceConns do
		c:Disconnect()
	end
	table.clear(serviceConns)
	for inst in instanceConns do
		untrack(inst)
	end
	table.clear(openInApp)
	table.clear(outbox)
end

-- ---------------------------------------------------------------------
-- Opening scripts in Bloxcode
-- ---------------------------------------------------------------------

local function pathOf(inst)
	local ok, full = pcall(function()
		return inst:GetFullName()
	end)
	return ok and full or safeName(inst)
end

--[=[
	Opens a script in Bloxcode.
	@within CodeBridge
	@param inst LuaSourceContainer
	@param focus boolean -- bring the Bloxcode window to the front
]=]
local function openInBloxcode(inst: LuaSourceContainer, focus: boolean)
	local id = getId(inst)
	local src = readSource(inst)
	openInApp[id] = true
	lastSource[id] = src
	track(inst)
	push({
		op = "open",
		id = id,
		name = inst.Name,
		cls = inst.ClassName,
		path = pathOf(inst),
		source = src,
		focus = focus,
	})
end

ScriptEditorService.TextDocumentDidOpen:Connect(function(doc)
	if not (codeMode and connected) then
		return
	end
	local okCmd, isCmd = pcall(function()
		return doc:IsCommandBar()
	end)
	if okCmd and isCmd then
		return
	end
	local inst = doc:GetScript()
	if not inst then
		return
	end
	openInBloxcode(inst, true)
	task.defer(function()
		pcall(function()
			doc:CloseAsync()
		end)
	end)
end)

-- ---------------------------------------------------------------------
-- Commands from Bloxcode
-- ---------------------------------------------------------------------

local commands = {}

function commands.snapshot()
	sendSnapshot()
end

function commands.open(cmd)
	local inst = byId[cmd.id]
	if inst and isScript(inst) then
		openInBloxcode(inst, false)
	else
		push({ op = "error", message = "Script not found." })
	end
end

function commands.closed(cmd)
	openInApp[cmd.id] = nil
end

function commands.setSource(cmd)
	local inst = byId[cmd.id]
	if not (inst and isScript(inst)) then
		push({ op = "error", message = "Script no longer exists." })
		return
	end
	local source = cmd.source
	lastSource[cmd.id] = source
	withRecording("Edit script", function()
		local ok = pcall(function()
			ScriptEditorService:UpdateSourceAsync(inst, function()
				return source
			end)
		end)
		if not ok then
			inst.Source = source
		end
	end)
end

function commands.create(cmd)
	local parent = byId[cmd.parentId]
	if not parent then
		push({ op = "error", message = "Target not found." })
		return
	end
	local inst
	local ok = withRecording("New " .. tostring(cmd.className), function()
		inst = Instance.new(cmd.className)
		inst.Name = cmd.name or cmd.className
		if DEFAULT_SOURCE[cmd.className] then
			inst.Source = DEFAULT_SOURCE[cmd.className]
		end
		inst.Parent = parent
	end)
	if ok and inst then
		-- send the node right away so the app can select it, even with deferred signals
		push(nodeEvent(inst))
		track(inst)
		push({ op = "created", id = getId(inst), parent = getId(parent) })
		if isScript(inst) then
			openInBloxcode(inst, false)
		end
	end
end

function commands.rename(cmd)
	local inst = byId[cmd.id]
	if inst then
		withRecording("Rename", function()
			inst.Name = cmd.name
		end)
	end
end

function commands.move(cmd)
	local inst, parent = byId[cmd.id], byId[cmd.parentId]
	if inst and parent then
		withRecording("Move", function()
			inst.Parent = parent
		end)
	end
end

function commands.duplicate(cmd)
	local inst = byId[cmd.id]
	if inst then
		withRecording("Duplicate", function()
			local copy = inst:Clone()
			if copy then
				copy.Parent = inst.Parent
			end
		end)
	end
end

function commands.delete(cmd)
	local inst = byId[cmd.id]
	if inst then
		withRecording("Delete", function()
			-- Parent = nil instead of Destroy() so Ctrl+Z can bring it back
			inst.Parent = nil
		end)
	end
end

-- Builds an instance tree sent by Bloxcode: { n = name, c = className, s = source?, v = value?, ch = children }
local function buildNode(node, parent)
	local inst = Instance.new(node.c)
	inst.Name = node.n
	if node.s ~= nil and inst:IsA("LuaSourceContainer") then
		(inst :: any).Source = node.s
	end
	if node.v ~= nil and inst:IsA("StringValue") then
		(inst :: any).Value = node.v
	end
	for _, child in node.ch or {} do
		buildNode(child, inst)
	end
	inst.Parent = parent
	return inst
end

--[=[
	Installs a Wally package (and its dependencies) using the same layout as Wally:
	`ReplicatedStorage.Packages` for shared packages, `ServerScriptService.ServerPackages`
	for server packages, with the package code in `_Index` and a link module per package.
	@within CodeBridge
	@private
]=]
function commands.wallyInstall(cmd: any)
	local serviceName = cmd.realm == "server" and "ServerScriptService" or "ReplicatedStorage"
	local folderName = cmd.realm == "server" and "ServerPackages" or "Packages"
	withRecording("Install " .. tostring(cmd.label), function()
		local service = game:GetService(serviceName)
		local container = service:FindFirstChild(folderName)
		if not container then
			container = Instance.new("Folder")
			container.Name = folderName
			container.Parent = service
		end
		local index = container:FindFirstChild("_Index")
		if not index then
			index = Instance.new("Folder")
			index.Name = "_Index"
			index.Parent = container
		end
		-- When updating, drop older versions of the root package.
		local rootKey = cmd.entries[1] and cmd.entries[1].key
		local prefix = rootKey and rootKey:match("^(.-@)")
		if prefix then
			for _, child in index:GetChildren() do
				if child.Name ~= rootKey and child.Name:sub(1, #prefix) == prefix then
					child.Parent = nil
				end
			end
		end
		for _, entry in cmd.entries do
			local existing = index:FindFirstChild(entry.key)
			if existing then
				existing.Parent = nil
			end
			buildNode(entry.node, index)
		end
		local oldLink = container:FindFirstChild(cmd.link.n)
		if oldLink then
			oldLink.Parent = nil
		end
		buildNode(cmd.link, container)
	end)
end

function commands.select(cmd)
	local inst = byId[cmd.id]
	if inst then
		Selection:Set({ inst })
	end
end

local function runCommand(cmd)
	local fn = commands[cmd.type]
	if not fn then
		return
	end
	local ok, err = pcall(fn, cmd)
	if not ok then
		push({ op = "error", message = tostring(err) })
	end
end

-- ---------------------------------------------------------------------
-- Connection loops
-- ---------------------------------------------------------------------

local function flushLoop(gen)
	while codeMode and gen == generation do
		if connected and #outbox > 0 then
			-- Take the batch out first; a snapshot may replace the outbox while we wait.
			local box = outbox
			local n = math.min(BATCH_SIZE, #box)
			local batch = table.move(box, 1, n, 1, {})
			local rest = table.move(box, n + 1, #box, 1, {})
			outbox = rest
			local res = request("POST", "/events?client=" .. clientId, { events = batch })
			if not res and outbox == rest and gen == generation then
				-- failed: put the batch back in front
				outbox = table.move(rest, 1, #rest, #batch + 1, batch)
				task.wait(0.5)
			end
		else
			task.wait(FLUSH_INTERVAL)
		end
	end
end

local function pollLoop(gen)
	while codeMode and gen == generation do
		if not connected then
			setStatus("Connecting to Bloxcode…", "wait")
			local res, err = request("POST", "/hello", {
				clientId = clientId,
				placeName = game.Name,
				placeId = game.PlaceId,
			})
			if gen ~= generation then
				return
			end
			if res then
				session = res.session
				connected = true
				setStatus("Connected. Scripts open in Bloxcode.", "ok")
				sendSnapshot()
			else
				setStatus("Can't reach Bloxcode. Is the app running?\n" .. tostring(err), "error")
				task.wait(2)
			end
		else
			local res = request("GET", "/poll?client=" .. clientId)
			if gen ~= generation then
				return
			end
			if not res then
				connected = false
				setStatus("Connection lost. Retrying…", "wait")
				task.wait(1)
			elseif res.session ~= session then
				connected = false -- Bloxcode was restarted
			elseif not res.active then
				connected = false
				setStatus("Another Studio window is now connected to Bloxcode.", "error")
				codeMode = false
				generation += 1
				stopTracking()
				setStatus(nil)
				return
			else
				for _, cmd in res.commands do
					runCommand(cmd)
				end
			end
		end
	end
end

--[=[
	Turns Code Mode on or off.
	@within CodeBridge
	@param enabled boolean
]=]
local function setCodeMode(enabled: boolean)
	if enabled == codeMode then
		return
	end
	codeMode = enabled
	generation += 1
	connected = false
	plugin:SetSetting("BloxcodeCodeMode", enabled)
	if enabled then
		startTracking()
		local gen = generation
		task.spawn(pollLoop, gen)
		task.spawn(flushLoop, gen)
	else
		stopTracking()
		task.spawn(request, "POST", "/bye?client=" .. clientId)
	end
	setStatus(nil)
end

-- ---------------------------------------------------------------------
-- UI
-- ---------------------------------------------------------------------

local toolbar = plugin:CreateToolbar("Bloxcode")
local toolbarButton = toolbar:CreateButton(
	"Bloxcode",
	"Open the Bloxcode window (external code editor)",
	"rbxasset://textures/ui/Settings/Help/AdvancedIcon@2x.png"
)
toolbarButton.ClickableWhenViewportHidden = true

local widget = plugin:CreateDockWidgetPluginGui(
	"BloxcodeWidget",
	DockWidgetPluginGuiInfo.new(Enum.InitialDockState.Float, false, false, 280, 170, 240, 150)
)
widget.Title = "Bloxcode"
widget.Name = "Bloxcode"

local function themeColor(style, modifier)
	return settings().Studio.Theme:GetColor(style, modifier)
end

local root = Instance.new("Frame")
root.Size = UDim2.fromScale(1, 1)
root.BorderSizePixel = 0
root.Parent = widget

local padding = Instance.new("UIPadding")
padding.PaddingTop = UDim.new(0, 12)
padding.PaddingBottom = UDim.new(0, 12)
padding.PaddingLeft = UDim.new(0, 12)
padding.PaddingRight = UDim.new(0, 12)
padding.Parent = root

local layout = Instance.new("UIListLayout")
layout.Padding = UDim.new(0, 10)
layout.SortOrder = Enum.SortOrder.LayoutOrder
layout.Parent = root

local toggle = Instance.new("TextButton")
toggle.LayoutOrder = 1
toggle.Size = UDim2.new(1, 0, 0, 44)
toggle.AutoButtonColor = true
toggle.Font = Enum.Font.GothamBold
toggle.TextSize = 15
toggle.TextColor3 = Color3.new(1, 1, 1)
toggle.Parent = root
local corner = Instance.new("UICorner")
corner.CornerRadius = UDim.new(0, 6)
corner.Parent = toggle

local statusRow = Instance.new("Frame")
statusRow.LayoutOrder = 2
statusRow.BackgroundTransparency = 1
statusRow.Size = UDim2.new(1, 0, 0, 0)
statusRow.AutomaticSize = Enum.AutomaticSize.Y
statusRow.Parent = root

local dot = Instance.new("Frame")
dot.Size = UDim2.fromOffset(9, 9)
dot.Position = UDim2.fromOffset(0, 4)
dot.BorderSizePixel = 0
dot.Parent = statusRow
local dotCorner = Instance.new("UICorner")
dotCorner.CornerRadius = UDim.new(1, 0)
dotCorner.Parent = dot

local statusLabel = Instance.new("TextLabel")
statusLabel.BackgroundTransparency = 1
statusLabel.Position = UDim2.fromOffset(16, 0)
statusLabel.Size = UDim2.new(1, -16, 0, 0)
statusLabel.AutomaticSize = Enum.AutomaticSize.Y
statusLabel.Font = Enum.Font.Gotham
statusLabel.TextSize = 13
statusLabel.TextWrapped = true
statusLabel.TextXAlignment = Enum.TextXAlignment.Left
statusLabel.TextYAlignment = Enum.TextYAlignment.Top
statusLabel.Parent = statusRow

local hint = Instance.new("TextLabel")
hint.LayoutOrder = 3
hint.BackgroundTransparency = 1
hint.Size = UDim2.new(1, 0, 0, 0)
hint.AutomaticSize = Enum.AutomaticSize.Y
hint.Font = Enum.Font.Gotham
hint.TextSize = 12
hint.TextWrapped = true
hint.TextXAlignment = Enum.TextXAlignment.Left
hint.Text = "When on, scripts you open in Studio open in Bloxcode instead of the Studio editor."
hint.Parent = root

local currentStatus, currentKind = nil, nil

function setStatus(text, kind)
	if text then
		currentStatus, currentKind = text, kind
	end
	if not codeMode then
		currentStatus, currentKind = "Code Mode is off", "off"
	end
	local colors = {
		ok = Color3.fromRGB(63, 185, 80),
		wait = Color3.fromRGB(210, 153, 34),
		error = Color3.fromRGB(248, 81, 73),
		off = Color3.fromRGB(120, 120, 120),
	}
	dot.BackgroundColor3 = colors[currentKind] or colors.off
	statusLabel.Text = currentStatus or ""
	toggle.Text = codeMode and "Code Mode: ON" or "Code Mode: OFF"
	toggle.BackgroundColor3 = codeMode and Color3.fromRGB(22, 130, 93) or Color3.fromRGB(70, 70, 70)
end

local function applyTheme()
	root.BackgroundColor3 = themeColor(Enum.StudioStyleGuideColor.MainBackground)
	statusLabel.TextColor3 = themeColor(Enum.StudioStyleGuideColor.MainText)
	hint.TextColor3 = themeColor(Enum.StudioStyleGuideColor.DimmedText)
end
applyTheme()
settings().Studio.ThemeChanged:Connect(applyTheme)

toggle.Activated:Connect(function()
	setCodeMode(not codeMode)
end)

toolbarButton.Click:Connect(function()
	widget.Enabled = not widget.Enabled
end)
widget:GetPropertyChangedSignal("Enabled"):Connect(function()
	toolbarButton:SetActive(widget.Enabled)
end)
toolbarButton:SetActive(widget.Enabled)

plugin.Unloading:Connect(function()
	if codeMode then
		generation += 1
		stopTracking()
		pcall(request, "POST", "/bye?client=" .. clientId)
	end
end)

setStatus(nil)
if plugin:GetSetting("BloxcodeCodeMode") then
	setCodeMode(true)
end
