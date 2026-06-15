const express = require('express');
const axios   = require('axios');
const { parseUsherUrl, buildRelayUrl } = require('./twitch-playlist');
const { loadSettings, updateSettings } = require('./settings');
const { enableAutostart, disableAutostart } = require('./startup');
const { startTray } = require('./tray');
const { loadStats, getStats, recordBlocked, addSseClient, removeSseClient } = require('./stats');

// ad-free relay instance (luminous-ttv compatible). leave empty to configure
// it at runtime via settings.json ("proxyUrl") instead of hardcoding here.
// must point to an instance whose exit ip is in an ad-free country.
const DEFAULT_RELAY = process.env.PURPLE_RELAY_URL || '';

const TWITCH_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const app = express();

app.use('/settings', express.json({ limit: '4kb' }));

// security: only accept requests whose host is loopback — blocks dns rebinding
app.use((req, res, next) => {
    const host = req.headers.host || '';
    if (!host.startsWith('127.0.0.1:') && !host.startsWith('localhost:')) {
        return res.status(403).end();
    }
    next();
});

let settings = loadSettings();
loadStats();

app.get('/ping', (_req, res) => {
    res.json({ alive: true, enabled: settings.enabled, port: settings.port });
});

app.get('/settings', (_req, res) => {
    res.json(settings);
});

app.post('/settings', (req, res) => {
    const body = req.body;
    const allowedKeys = ['enabled', 'autostart', 'port', 'proxyUrl'];
    const hasUnknownKey = Object.keys(body).some((k) => !allowedKeys.includes(k));
    if (hasUnknownKey) {
        return res.status(400).json({ error: 'unknown settings key' });
    }
    if (typeof body.proxyUrl === 'string' && body.proxyUrl && !/^https?:\/\//i.test(body.proxyUrl)) {
        return res.status(400).json({ error: 'proxyUrl must be a http(s) url' });
    }
    if (typeof body.autostart === 'boolean') {
        if (body.autostart) enableAutostart();
        else disableAutostart();
    }
    settings = updateSettings(body);
    res.json(settings);
});

app.get('/stats', (_req, res) => {
    res.json(getStats());
});

app.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // initial heartbeat so the client knows the stream is open
    res.write('data: {"type":"connected"}\n\n');

    addSseClient(res);
    req.on('close', () => removeSseClient(res));
});

// preflight for the redirected playlist request
app.options('/hls', (req, res) => {
    setCors(req, res);
    res.status(204).end();
});

app.get('/hls', async (req, res) => {
    setCors(req, res);

    // the redirected url arrives raw (declarativeNetRequest \0 is not encoded),
    // so read it straight from the request target instead of req.query, which
    // would split on the usher url's own '&' params.
    const targetUrl = extractTargetUrl(req);
    const parsed    = parseUsherUrl(targetUrl);
    if (!parsed.valid) {
        return res.status(400).json({ error: parsed.reason });
    }

    const relay = settings.proxyUrl || DEFAULT_RELAY;

    // 1) try the ad-free relay first
    if (settings.enabled && relay) {
        try {
            const relayUrl = buildRelayUrl(relay, parsed);
            const out = await axios.get(relayUrl, {
                responseType: 'text',
                timeout: 15000, // relay does a token handshake, can take ~10s (public instances slower under load)
                maxRedirects: 3,
                headers: { 'User-Agent': TWITCH_UA },
                validateStatus: (s) => s === 200,
            });
            if (typeof out.data === 'string' && out.data.startsWith('#EXTM3U')) {
                recordBlocked(1); // one ad-free playlist served
                console.log(`[proxy] ✓ ad-free playlist served for ${parsed.id}`);
                return res
                    .status(200)
                    .setHeader('Content-Type', 'application/vnd.apple.mpegurl')
                    .setHeader('X-PurpleAdBlock', 'relay')
                    .send(out.data);
            }
            console.warn('[proxy] relay returned a non-playlist, falling back to direct');
        } catch (e) {
            console.warn('[proxy] relay failed, falling back to direct:', e.message);
        }
    }

    // 2) fallback: serve the original (ad-injected) playlist so the stream still plays
    try {
        const direct = await fetchFromTwitch(parsed.originalUrl, 'text');
        console.warn(`[proxy] ✗ served ORIGINAL (with ads) playlist for ${parsed.id} — relay unavailable`);
        return res
            .status(200)
            .setHeader('Content-Type', direct.headers['content-type'] || 'application/vnd.apple.mpegurl')
            .setHeader('X-PurpleAdBlock', 'fallback')
            .send(direct.data);
    } catch (e) {
        console.error('[proxy] /hls direct fetch failed:', e.message);
        return res.status(502).json({ error: 'upstream error' });
    }
});

app.use((_req, res) => res.status(404).end());

/**
 * extracts the raw usher url from the request target.
 * handles both encoded (firefox) and unencoded (chromium \0) forms.
 * @param {import('express').Request} req
 * @returns {string|null}
 */
function extractTargetUrl(req) {
    const marker = 'url=';
    const idx = req.originalUrl.indexOf(marker);
    if (idx === -1) return null;
    let raw = req.originalUrl.slice(idx + marker.length);
    if (/^https?%3a/i.test(raw)) {
        try { raw = decodeURIComponent(raw); } catch { /* keep raw */ }
    }
    return raw;
}

/**
 * sets permissive cors headers so the twitch player can read the redirected response.
 * echoes the origin when present to stay valid for credentialed requests.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
function setCors(req, res) {
    const origin = req.headers.origin;
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    if (origin) res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Vary', 'Origin');
}

function fetchFromTwitch(url, responseType) {
    return axios.get(url, {
        responseType,
        timeout: 10000,
        maxRedirects: 3,
        headers: {
            'User-Agent': TWITCH_UA,
            'Origin':  'https://www.twitch.tv',
            'Referer': 'https://www.twitch.tv/',
        },
    });
}

const PORT = settings.port;

const server = app.listen(PORT, '127.0.0.1', () => {
    const relay = settings.proxyUrl || DEFAULT_RELAY;
    console.log(`[PurpleAdBlock] proxy running on http://127.0.0.1:${PORT}`);
    console.log(`[PurpleAdBlock] ad blocker is ${settings.enabled ? 'ENABLED' : 'DISABLED'}`);
    console.log(`[PurpleAdBlock] relay: ${relay || '(none set — configure proxyUrl, see README)'}`);
    startTray();
});

server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
        console.error(`[PurpleAdBlock] port ${PORT} is already in use. edit settings.json to change it.`);
        process.exit(1);
    } else {
        throw e;
    }
});