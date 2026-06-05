const express  = require('express');
const axios    = require('axios');
const { filterPlaylist }      = require('./hls-filter');
const { validateProxyTarget } = require('./validate');
const { loadSettings, updateSettings } = require('./settings');
const { enableAutostart, disableAutostart } = require('./startup');
const { startTray } = require('./tray');

const app = express();

// only parse json bodies on routes that need it — cap body size to prevent dos
app.use('/settings', express.json({ limit: '4kb' }));

// ─── security: only accept requests from the extension ───────────────────────
// the proxy must never be reachable from a web page or external network.
// we bind to 127.0.0.1 (loopback only) in app.listen, and additionally
// reject any request whose Host header isn't our localhost address.
app.use((req, res, next) => {
    const host = req.headers.host || '';
    // allow only localhost:<port> — blocks dns rebinding attacks
    if (!host.startsWith('127.0.0.1:') && !host.startsWith('localhost:')) {
        return res.status(403).end();
    }
    next();
});

let settings = loadSettings();

// health check
app.get('/ping', (_req, res) => {
    res.json({ alive: true, enabled: settings.enabled, port: settings.port });
});

app.get('/settings', (_req, res) => {
    res.json(settings);
});

// update settings
app.post('/settings', (req, res) => {
    const body = req.body;
    // only accept known boolean/numeric keys — reject anything else
    const allowedKeys = ['enabled', 'autostart', 'port'];
    const hasUnknownKey = Object.keys(body).some((k) => !allowedKeys.includes(k));
    if (hasUnknownKey) {
        return res.status(400).json({ error: 'unknown settings key' });
    }
    if (typeof body.autostart === 'boolean') {
        if (body.autostart) enableAutostart();
        else disableAutostart();
    }
    settings = updateSettings(body);
    res.json(settings);
});

// hls playlist proxy, hls for "HTTP Live Streaming", the streaming format used by Twitch.
app.get('/hls', async (req, res) => {
    const { valid, reason, parsed } = validateProxyTarget(req.query.url);
    if (!valid) {
        return res.status(400).json({ error: reason });
    }

    try {
        const response = await fetchFromTwitch(parsed.href, 'text');
        let playlist = response.data;
        if (settings.enabled) {
            playlist = filterPlaylist(playlist);
        }
        playlist = rewriteSegmentUrls(playlist, parsed.href);
        res.status(200)
            .setHeader('Content-Type', response.headers['content-type'] || 'application/vnd.apple.mpegurl')
            .send(playlist);
    } catch (e) {
        console.error('[proxy] /hls error:', e.message);
        res.status(502).json({ error: 'upstream error' });
    }
});

// segment pass-through
app.get('/segment', async (req, res) => {
    const { valid, reason, parsed } = validateProxyTarget(req.query.url);
    if (!valid) {
        return res.status(400).json({ error: reason });
    }

    try {
        const response = await fetchFromTwitch(parsed.href, 'arraybuffer');
        res.status(200)
            .setHeader('Content-Type', response.headers['content-type'] || 'video/MP2T')
            .send(Buffer.from(response.data));
    } catch (e) {
        console.error('[proxy] /segment error:', e.message);
        res.status(502).json({ error: 'upstream error' });
    }
});

// catch-all, no information leakage
app.use((_req, res) => res.status(404).end());

/////// HELPERS ///////
/**
 * fetches an url from the twitch cdn with a fixed set of headers.
 * the axios instance is not reused globally to avoid state leakage.
 * @param {string} url - already validated absolute url
 * @param {'text'|'arraybuffer'} responseType
 */
function fetchFromTwitch(url, responseType) {
    return axios.get(url, {
        responseType,
        timeout: 10000,
        maxRedirects: 3,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Origin':  'https://www.twitch.tv',
            'Referer': 'https://www.twitch.tv/',
        },
    });
}

/**
 * rewrites all segment/sub-playlist urls in a media playlist
 * so they route through the local proxy.
 * handles absolute urls, root-relative (/path), and relative paths.
 *
 * @param {string} playlist
 * @param {string} baseUrl - original url of the playlist (for resolving relative paths)
 * @returns {string}
 */
function rewriteSegmentUrls(playlist, baseUrl) {
    const base = new URL(baseUrl);
    const port = settings.port;

    return playlist.split('\n')
        .map((line) => {
            const trimmed = line.trim();
            if (trimmed === '' || trimmed.startsWith('#')) return line;

            let absoluteUrl;
            if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
                absoluteUrl = trimmed;
            } else if (trimmed.startsWith('/')) {
                absoluteUrl = `${base.origin}${trimmed}`;
            } else {
                const dir = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
                absoluteUrl = dir + trimmed;
            }
            // validate the resolved url before embedding it in the playlist
            const { valid } = validateProxyTarget(absoluteUrl);
            if (!valid) return line; // leave unknown urls untouched rather than breaking playback

            const endpoint = absoluteUrl.includes('.m3u8') ? 'hls' : 'segment';
            return `http://127.0.0.1:${port}/${endpoint}?url=${encodeURIComponent(absoluteUrl)}`;
        })
        .join('\n');
}

// start
const PORT = settings.port;
// bind to loopback only — the proxy must not be reachable from the network
const server = app.listen(PORT, '127.0.0.1', () => {
    console.log(`[PurpleAdBlock] proxy running on http://127.0.0.1:${PORT}`);
    console.log(`[PurpleAdBlock] ad blocker is ${settings.enabled ? 'ENABLED' : 'DISABLED'}`);
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