-- Documentation only: describes the HTTP protocol between the Studio plugin and Bloxcode.
-- This file is not part of the plugin itself.

--[=[
	@class Protocol

	The Studio plugin ([CodeBridge]) talks to the Bloxcode server at
	`http://localhost:34872`. Studio is always the client, Bloxcode is the server.

	| Method | Path | Purpose |
	| --- | --- | --- |
	| `POST` | `/hello` | Connect. Body: [Protocol.Hello]. Response: `{ session }` |
	| `GET` | `/poll?client=…` | Long poll (up to 10 s). Response: [Protocol.PollResponse] |
	| `POST` | `/events?client=…` | Events for Bloxcode. Body: `{ events: { Event } }` |
	| `POST` | `/bye?client=…` | Disconnect |
	| `POST` | `/log` | Output from play-test sessions. Body: `{ logs: { { message, kind, context } } }` |
	| `POST` | `/agent` | Tool calls from the Bloxcode MCP server (Claude). Needs `Authorization: Bearer <key>`; requests with an `Origin` header are refused |
	| `GET` | `/ping` | Check whether Bloxcode is running |

	If a second Studio window connects, it takes over the connection. The old one gets
	`active = false` on its next poll and turns Code Mode off.
]=]

--[=[
	@interface Hello
	@within Protocol
	.clientId string -- random ID per Studio window
	.placeName string
	.placeId number
	.pluginVersion number? -- 2 since Bloxcode 1.2 (replies, output, properties)
]=]

--[=[
	@interface PollResponse
	@within Protocol
	.session string -- changes when Bloxcode was restarted
	.active boolean -- false when another Studio window is connected
	.commands { Command }
]=]

--[=[
	@interface Event
	@within Protocol
	.op "reset" | "add" | "remove" | "rename" | "move" | "open" | "source" | "created" | "error" | "log" | "reply"
	.id string? -- instance ID
	.name string? -- for add, rename, open
	.cls string? -- ClassName, for add and open
	.parent string? -- parent ID, for add and move (nil = service)
	.source string? -- script source, for open and source
	.focus boolean? -- for open: bring the Bloxcode window to the front
	.agent boolean? -- for open and created: caused by Claude
	.message string? -- for error and log
	.kind string? -- for log: MessageOutput, MessageInfo, MessageWarning or MessageError
	.reqId string? -- for reply: the reqId of the command
	.ok boolean? -- for reply
	.error string? -- for reply, when ok is false
	.result any? -- for reply: what the command returned

	Events from Studio to Bloxcode. A snapshot is a `reset` followed by many `add` events.
]=]

--[=[
	@interface Command
	@within Protocol
	.type "snapshot" | "open" | "closed" | "setSource" | "create" | "rename" | "move" | "duplicate" | "delete" | "select" | "wallyInstall" | "read" | "search" | "selection" | "getProperties" | "setProperties"
	.reqId string? -- when set, the plugin answers with a reply event
	.id string? -- target instance
	.parentId string? -- for create and move
	.className string? -- for create
	.name string? -- for create and rename
	.source string? -- for setSource, and optional for create
	.properties { [string]: any }? -- for create and setProperties
	.attributes { [string]: any }? -- for setProperties
	.addTags { string }? -- for setProperties
	.removeTags { string }? -- for setProperties
	.names { string }? -- for getProperties
	.query string? -- for search
	.agent boolean? -- set for commands from Claude
	.realm ("shared" | "server")? -- for wallyInstall
	.entries { { key: string, node: InstanceNode } }? -- for wallyInstall: one `_Index` folder per package
	.link InstanceNode? -- for wallyInstall: the top-level link module

	Commands from Bloxcode to Studio. Everything except `snapshot`, `open`, `closed` and
	`select` is recorded as a ChangeHistory step (Ctrl+Z in Studio).
]=]

--[=[
	@interface InstanceNode
	@within Protocol
	.n string -- Name
	.c string -- ClassName
	.s string? -- Source, for scripts
	.v string? -- Value, for StringValues
	.ch { InstanceNode } -- children

	An instance tree sent by Bloxcode, for example a Wally package converted with the
	same rules as Rojo (`init.lua` folders become ModuleScripts, `.server.lua` becomes a
	Script, `.client.lua` a LocalScript, `.json` a ModuleScript that returns a table).
]=]

return nil
