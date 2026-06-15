# PurpleAdBlock v2 — relay method (anti-SSAI)

Twitch ad blocker: browser extension (Firefox MV2 + Chromium/Brave MV3) + local
Node.js proxy. No interruptions, no quality drop.

## Why v2

v1 stripped `DCM|` ad segments from the playlist. That no longer works:
- Twitch uses **SSAI** — ads are stitched into the stream, indistinguishable
  from content at the network layer.
- The local proxy used **your own IP** → Twitch injected ads regardless.

v2 strips nothing. It fetches the master playlist through a **relay in an
ad-free country**. Twitch serves no ads there → the playlist is clean at the
source. Media playlists (weaver) and **video segments load directly from the
CDN** → quality is untouched.

```
player → usher.ttvnw.net            (intercepted by the extension)
       → 127.0.0.1:8765/hls         (local proxy)
       → {ad-free relay}/live/{channel}   → clean playlist
weaver + segments: direct CDN, full quality
```

## Setup

### 1. Configure the relay

The proxy needs a **luminous-ttv compatible** instance (endpoint
`GET /live/{channel}`) whose exit IP is in an ad-free country. Set it in
`settings.json`:

```json
{
  "enabled": true,
  "autostart": false,
  "port": 8765,
  "proxyUrl": "https://eu.luminous.dev"
}
```

Known public EU instances (free, community-maintained by luminous / perfprod):
- `https://eu.luminous.dev`
- `https://eu2.luminous.dev`
- `https://lb-eu.cdn-perfprod.com` (often faster to start)

If `proxyUrl` is empty, the proxy serves the original (ad) playlist as a
fallback so the stream never breaks.

### 2. Run the proxy

```bash
node proxy/index.js
```
On startup you should see `relay: https://eu.luminous.dev`.

### 3. Build + load the extension

```bash
cd extension
npm run build:brave   # or build:firefox
```
Then load/reload the extension in `brave://extensions`.

## Verifying it works

Easiest check: **the proxy terminal**.
- `✓ ad-free playlist served for {channel}` → relay OK, no ads
- `✗ served ORIGINAL (with ads) playlist ... — relay unavailable` → fallback,
  the relay failed or was too slow → switch instance in `proxyUrl`

In DevTools: the `hls?url=...` request returns an `X-PurpleAdBlock` header
(`relay` or `fallback`), and its response contains `USER-COUNTRY` (≠ `FR` =
clean). The `usher.ttvnw.net` request must be a **307** (redirected).

## Important technical notes

- **`twitch.tv` permission is mandatory.** For `declarativeNetRequest` to
  redirect a request, Chrome requires a host permission for the URL **and for
  the initiator**. usher's initiator is the `twitch.tv` page/worker, hence
  `*://*.twitch.tv/*` in the manifest. Without it the rule matches but the
  redirect is silently dropped (request stays 200, ads play).
- **Only usher is redirected** (`usher.ttvnw.net/api/(v2/)?channel/hls/...`).
  Weaver and segments go direct → full quality.
- **Stale-rule cleanup.** `syncRedirectRule` removes any leftover dynamic rule
  from a previous version on every sync.
- **15s relay timeout.** luminous does a token handshake that can take ~10s.
  Beyond that, the proxy falls back.

## Files

- `proxy/twitch-playlist.js` — parse usher + build the relay url
- `proxy/index.js` — `/hls` route (relay + fallback + CORS + logs)
- `proxy/stats.js` — counters + live SSE events
- `proxy/settings.js` — handles the `proxyUrl` key
- `extension/background.chromium.js` — single DNR rule, usher only
- `extension/background.firefox.js` — webRequest on usher only
- `extension/manifest.{chromium,firefox}.json` — usher + twitch.tv + localhost permissions

`hls-filter.js` and `validate.js` are no longer used.

## Limitations

- **It's an arms race.** Any Twitch ad blocker can break within 24-48h if Twitch
  rotates its tokens. If an instance shows ads or lags, switch EU instance in
  `proxyUrl`.
- **Public instances** get congested; Twitch may show the purple
  "commercial break in progress" screen past a concurrent-connection threshold.
  Don't reload repeatedly when that happens.
- **The counter** reflects ad-free streams served (one per stream load /
  channel switch), not individual ads — with the relay method there are no
  discrete ads to count, they're avoided at the source.