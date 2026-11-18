// Public app ids (not secrets). Env variables override them for testing.
module.exports = {
  // GitHub OAuth app "Bloxcode" (device flow, no client secret needed)
  GITHUB_CLIENT_ID: process.env.BLOXCODE_GITHUB_CLIENT_ID || 'Ov23li2FqKg8y0ZOyaJm',
  // Discord application "Bloxcode" for Rich Presence (assets: "bloxcode", "claude")
  DISCORD_CLIENT_ID: process.env.BLOXCODE_DISCORD_CLIENT_ID || '',
};
