# PurpleAdBlock

Twitch ad blocker via local HLS proxy. No quality drop, no interruptions.

## How it works

Twitch uses server-side ad injection (SSAI): ads are baked directly into the HLS stream.
This proxy intercepts the `.m3u8` playlist requests, strips the ad segments, and returns a clean playlist to the player.

```
Twitch CDN → local proxy (strips ads) → browser player
```

---

## Setup

### 1. Proxy (Node.js)

```bash
npm install
node proxy/index.js
```

The proxy runs on `http://127.0.0.1:8765` by default.

To change the port, edit `settings.json`:
```json
{
  "port": 8765
}
```

### 2. Extension (Firefox)

1. Open `about:debugging` in Firefox
2. Click **This Firefox** → **Load Temporary Add-on**
3. Select `extension/manifest.json`

For permanent install, package as `.xpi` with `web-ext build`.

---

## Settings

`settings.json` is created automatically on first run:

| Key         | Default | Description                              |
|-------------|---------|------------------------------------------|
| `enabled`   | `true`  | whether the ad blocker is active         |
| `autostart` | `false` | launch proxy on Windows startup          |
| `port`      | `8765`  | local port for the proxy                 |

Settings can also be changed from:
- The **extension popup** (toggle blocker, toggle autostart)
- The **system tray** icon (right-click menu)

---

## System tray

Run with tray support:

```bash
node proxy/index.js  # tray is initialized inside index.js
```

Right-click the tray icon to:
- Toggle the blocker on/off
- Toggle autostart
- Quit

---

## Project structure

```
PurpleAdBlock/
├── proxy/
│   ├── index.js        → Express proxy server
│   ├── hls-filter.js   → strips ad tags from .m3u8 playlists
│   ├── tray.js         → system tray icon
│   ├── settings.js     → read/write settings.json
│   └── startup.js      → Windows autostart (registry)
├── extension/
│   ├── manifest.json
│   ├── background.js   → intercepts Twitch HLS requests
│   └── popup/
│       ├── popup.html
│       └── popup.js
├── settings.json       → persistent config
└── package.json
```