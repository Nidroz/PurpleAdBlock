# PurpleAdBlock

Twitch ad blocker via local HLS proxy. No quality drop, no interruptions.

---

## How it works

Twitch uses server-side ad insertion (SSAI): ads are baked directly into the HLS stream as tagged segments. This proxy intercepts `.m3u8` playlist requests, strips the ad segments, and returns a clean playlist to the player.

```
Twitch CDN → local proxy (strips ads) → Firefox → player
```

---

## Setup

### 1. Proxy

```bash
# in the root folder
npm install
node proxy/index.js
```

Runs on `http://127.0.0.1:8765` — loopback only, not exposed to the network.

To change the port, edit `settings.json` before starting:
```json
{ "port": 8765 }
```

### 2. Extension CSS (Tailwind build)

```bash
cd extension
npm install
npm run css:build   # generates popup/popup.css
# or during development:
npm run css:watch
```

> You need to run this once before loading the extension.

### 3. Extension (Firefox)

1. Open `about:debugging` in Firefox
2. **This Firefox** → **Load Temporary Add-on**
3. Select `extension/manifest.json`

For a permanent install, build with `web-ext`:
```bash
npx web-ext build --source-dir extension
```

---

## Settings

`settings.json` is created automatically on first run.

| Key         | Default | Description                               |
|-------------|---------|-------------------------------------------|
| `enabled`   | `true`  | whether the ad blocker is active          |
| `autostart` | `false` | launch the proxy on Windows startup       |
| `port`      | `8765`  | local port (must be between 1025–65535)   |

Settings can also be changed from:
- The **extension popup** — toggle blocker, toggle autostart
- The **system tray** icon — right-click context menu

---

## Security

- The proxy binds to **127.0.0.1 only** — never accessible from the network.
- A **Host header check** blocks DNS rebinding attacks.
- The `?url=` parameter is **whitelisted** to Twitch CDN domains only (SSRF protection).
- Settings inputs are **typed and validated** — unknown keys are rejected.
- `execFileSync` (not `execSync`) is used for registry writes — no shell injection possible.
- No CORS headers — the proxy is not meant to be called from web pages.

---

## Project structure

```
PurpleAdBlock/
├── proxy/
│   ├── index.js        → Express server (loopback only)
│   ├── hls-filter.js   → strips ad tags from .m3u8 playlists
│   ├── validate.js     → SSRF protection — URL whitelist
│   ├── tray.js         → system tray icon + context menu
│   ├── settings.js     → read/write/validate settings.json
│   └── startup.js      → Windows autostart (registry, no shell injection)
├── extension/
│   ├── manifest.json
│   ├── background.js   → intercepts Twitch HLS requests
│   ├── tailwind.config.js
│   ├── package.json    → Tailwind CLI dev dependency
│   └── popup/
│       ├── popup.html
│       ├── popup.src.css   → Tailwind source (edit this)
│       ├── popup.css       → compiled output (generated, do not edit)
│       └── popup.js
├── settings.json
└── package.json
```