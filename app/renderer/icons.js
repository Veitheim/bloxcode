// Small inline SVG icons for Roblox classes in the explorer.
(function () {
  const svg = (body) => `<svg viewBox="0 0 16 16" class="ico">${body}</svg>`;
  const scroll = (c, letter) => svg(
    `<path d="M4 1.5h6l3 3v10H4z" fill="${c}" fill-opacity=".18" stroke="${c}" stroke-width="1.1" stroke-linejoin="round"/>` +
    `<text x="8.5" y="12" font-size="7.5" font-family="Segoe UI, sans-serif" font-weight="700" fill="${c}" text-anchor="middle">${letter}</text>`);
  const folder = (c) => svg(`<path d="M1.5 3.5h5l1.5 1.5h6.5v8h-13z" fill="${c}" fill-opacity=".85"/>`);
  const bolt = (c) => svg(`<path d="M9 1.5L3.5 9H8l-1 5.5L12.5 7H8z" fill="${c}"/>`);
  const fn = (c) => svg(`<rect x="2" y="2" width="12" height="12" rx="3" fill="none" stroke="${c}" stroke-width="1.2"/><text x="8" y="11.3" font-size="8" font-family="Segoe UI" font-style="italic" font-weight="700" fill="${c}" text-anchor="middle">f</text>`);
  const cube = (c) => svg(`<path d="M8 1.8l5.5 3v6.4L8 14.2l-5.5-3V4.8z" fill="${c}" fill-opacity=".25" stroke="${c}" stroke-width="1.1" stroke-linejoin="round"/><path d="M2.6 4.9L8 8l5.4-3.1M8 8v6" fill="none" stroke="${c}" stroke-width="1"/>`);
  const model = (c) => svg(`<rect x="1.5" y="5" width="6" height="6" fill="${c}" fill-opacity=".35" stroke="${c}"/><rect x="8.5" y="2" width="6" height="6" fill="${c}" fill-opacity=".6" stroke="${c}"/><rect x="8.5" y="9" width="5" height="5" fill="none" stroke="${c}"/>`);
  const gear = (c) => svg(`<circle cx="8" cy="8" r="2.4" fill="none" stroke="${c}" stroke-width="1.3"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" stroke="${c}" stroke-width="1.3" stroke-linecap="round"/>`);
  const value = (c) => svg(`<rect x="2" y="4" width="12" height="8" rx="2" fill="${c}" fill-opacity=".2" stroke="${c}"/><circle cx="8" cy="8" r="1.6" fill="${c}"/>`);
  const gui = (c) => svg(`<rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="${c}" stroke-width="1.1"/><path d="M1.5 5.5h13" stroke="${c}"/>`);
  const globe = (c) => svg(`<circle cx="8" cy="8" r="6" fill="none" stroke="${c}" stroke-width="1.2"/><path d="M2 8h12M8 2c2.5 2.8 2.5 9.2 0 12M8 2c-2.5 2.8-2.5 9.2 0 12" fill="none" stroke="${c}"/>`);
  const person = (c) => svg(`<circle cx="8" cy="5" r="2.6" fill="${c}"/><path d="M3 14c.5-3 2.4-4.5 5-4.5s4.5 1.5 5 4.5" fill="${c}"/>`);
  const sun = (c) => svg(`<circle cx="8" cy="8" r="3" fill="${c}"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M3 13l1.4-1.4M11.6 4.4L13 3" stroke="${c}" stroke-linecap="round"/>`);
  const sound = (c) => svg(`<path d="M2.5 6h2.5L8.5 3v10L5 10H2.5z" fill="${c}"/><path d="M11 5.5a3.5 3.5 0 0 1 0 5M12.8 3.8a6 6 0 0 1 0 8.4" fill="none" stroke="${c}" stroke-linecap="round"/>`);
  const dot = (c) => svg(`<circle cx="8" cy="8" r="3.2" fill="${c}" fill-opacity=".8"/>`);
  const box = (c) => svg(`<rect x="2.5" y="3.5" width="11" height="9" rx="1" fill="${c}" fill-opacity=".25" stroke="${c}"/><path d="M2.5 6.5h11" stroke="${c}"/>`);

  const MAP = {
    Script: scroll('#4ea1ff', 'S'),
    LocalScript: scroll('#4ec9b0', 'L'),
    ModuleScript: scroll('#c586c0', 'M'),
    Folder: folder('#dcb862'),
    RemoteEvent: bolt('#f0a14a'),
    UnreliableRemoteEvent: bolt('#e57f5a'),
    RemoteFunction: fn('#f0a14a'),
    BindableEvent: bolt('#d7ba7d'),
    BindableFunction: fn('#d7ba7d'),
    Model: model('#9da5b4'),
    Tool: model('#c0a080'),
    Part: cube('#a0a8b4'), MeshPart: cube('#8fb3d9'), WedgePart: cube('#a0a8b4'), TrussPart: cube('#a0a8b4'),
    UnionOperation: cube('#9fd98f'), SpawnLocation: cube('#7cd992'), Seat: cube('#a0a8b4'), Terrain: cube('#6fbf73'),
    Workspace: globe('#4ea1ff'),
    Players: person('#4ec9b0'), Player: person('#4ec9b0'), Teams: person('#e5c07b'), Team: person('#e5c07b'),
    Lighting: sun('#e5c07b'),
    SoundService: sound('#c586c0'), Sound: sound('#c586c0'), SoundGroup: sound('#c586c0'),
    ReplicatedStorage: box('#4ea1ff'), ServerStorage: box('#e06c75'), ReplicatedFirst: box('#4ec9b0'),
    ServerScriptService: gear('#e06c75'), StarterPlayer: person('#9cdcfe'),
    StarterPlayerScripts: gear('#4ec9b0'), StarterCharacterScripts: gear('#4ec9b0'),
    StarterGui: gui('#4ec9b0'), StarterPack: box('#c0a080'), TextChatService: gear('#9da5b4'),
    MaterialService: gear('#9da5b4'),
    ScreenGui: gui('#4ec9b0'), SurfaceGui: gui('#4ec9b0'), BillboardGui: gui('#4ec9b0'),
    Frame: gui('#9cdcfe'), ScrollingFrame: gui('#9cdcfe'), TextLabel: gui('#d4d4d4'), TextButton: gui('#d4d4d4'),
    TextBox: gui('#d4d4d4'), ImageLabel: gui('#d4d4d4'), ImageButton: gui('#d4d4d4'),
    StringValue: value('#ce9178'), NumberValue: value('#b5cea8'), IntValue: value('#b5cea8'),
    BoolValue: value('#569cd6'), ObjectValue: value('#4ec9b0'), CFrameValue: value('#9cdcfe'),
    Vector3Value: value('#9cdcfe'), Color3Value: value('#c586c0'), Configuration: gear('#d7ba7d'),
    Camera: globe('#9da5b4'),
  };

  window.classIcon = function (cls) {
    return MAP[cls] || (/Service$/.test(cls) ? gear('#9da5b4') : /Value$/.test(cls) ? value('#b5cea8') : dot('#7f8a99'));
  };
})();
