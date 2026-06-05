const express  = require('express');
const axios= require('axios');
const { filterPlaylist } = require('./hls-filter');
const { validateProxyTarget } = require('./validate');
const { loadSettings, updateSettings } = require('./settings');
const { enableAutostart, disableAutostart } = require('./startup');
const { startTray } = require('./tray');
const { loadStats, getStats, recordBlocked, broadcastAdActive, addSseClient, removeSseClient } = require('./stats');

const app = express();

app.use('/settings', express.json({ limit: '4kb' }));

// security: only accept requests from localhost — blocks dns rebinding
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

app.get('/stats', (_req, res) => {
    res.json(getStats());
});



app.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // send an initial heartbeat so the client knows the connection is open
    res.write('data: {"type":"connected"}\n\n');

    addSseClient(res);

    req.on('close', () => removeSseClient(res));
});

app.get('/hls', async (req, res) => {
    const { valid, reason, parsed } = validateProxyTarget(req.query.url);
    if (!valid) {
        return res.status(400).json({ error: reason });
    }

    try {
        const response = await fetchFromTwitch(parsed.href, 'text');
        let playlist = response.data;
        let blocked     = 0;

        if (settings.enabled) {
            const result = filterPlaylist(playlist);
            playlist = result.playlist;
            blocked = result.blockedCount;

            if (blocked > 0) {
                recordBlocked(blocked);
                broadcastAdActive(true);
                // signal ad_active: false shortly after — the ad window has been stripped
                setTimeout(() => broadcastAdActive(false), 4000);
            }
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

app.use((_req, res) => res.status(404).end());

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

            const { valid } = validateProxyTarget(absoluteUrl);
            if (!valid) return line;

            const endpoint = absoluteUrl.includes('.m3u8') ? 'hls' : 'segment';
            return `http://127.0.0.1:${port}/${endpoint}?url=${encodeURIComponent(absoluteUrl)}`;
        })
        .join('\n');
}

const PORT = settings.port;

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