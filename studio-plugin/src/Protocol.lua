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
	.op "reset" | "add" | "remove" | "rename" | "move" | "open" | "source" | "created" | "error"
	.id string? -- instance ID
	.name string? -- for add, rename, open
	.cls string? -- ClassName, for add and open
	.parent string? -- parent ID, for add and move (nil = service)
	.source string? -- script source, for open and source
	.focus boolean? -- for open: bring the Bloxcode window to the front

	Events from Studio to Bloxcode. A snapshot is a `reset` followed by many `add` events.
]=]

--[=[
	@interface Command
	@within Protocol
	.type "snapshot" | "open" | "closed" | "setSource" | "create" | "rename" | "move" | "duplicate" | "delete" | "select" | "wallyInstall"
	.id string? -- target instance
	.parentId string? -- for create and move
	.className string? -- for create
	.name string? -- for create and rename
	.source string? -- for setSource
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
