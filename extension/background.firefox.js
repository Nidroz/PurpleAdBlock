/* global browser */

const PROXY_ORIGIN  = 'http://127.0.0.1:8765';
const PING_INTERVAL = 5000;

let proxyAlive     = false;
let blockerEnabled = true;
let proxySettings  = {};
let proxyStats     = { totalBlocked: 0, sessionBlocked: 0 };
let sseSource      = null;

// transient "just served an ad-free stream" state, for the icon flash + popup badge
let lastServedAt = 0;
let lastChannel  = '';
let servedTimer  = null;

async function pingProxy() {
    const wasAlive = proxyAlive;
    try {
        const res  = await fetch(`${PROXY_ORIGIN}/ping`, { signal: AbortSignal.timeout(2000) });
        const data = await res.json();
        proxyAlive     = data.alive === true;
        blockerEnabled = data.enabled === true;
    } catch {
        proxyAlive = false;
        disconnectSse();
    }
    // when the proxy just became reachable, (re)load settings + stats
    if (proxyAlive && !wasAlive) {
        fetchSettings();
        fetchStats();
    }
    updateIcon();
    if (proxyAlive && !sseSource) connectSse();
}

async function fetchSettings() {
    try {
        const res = await fetch(`${PROXY_ORIGIN}/settings`, { signal: AbortSignal.timeout(2000) });
        proxySettings = await res.json();
    } catch {
        proxySettings = {};
    }
}

async function fetchStats() {
    try {
        const res = await fetch(`${PROXY_ORIGIN}/stats`, { signal: AbortSignal.timeout(2000) });
        proxyStats = await res.json();
    } catch {
        proxyStats = { totalBlocked: 0, sessionBlocked: 0 };
    }
}

pingProxy();
fetchSettings();
fetchStats();
setInterval(pingProxy, PING_INTERVAL);

function connectSse() {
    try {
        sseSource = new EventSource(`${PROXY_ORIGIN}/events`);
        sseSource.onmessage = (e) => {
            try {
                const payload = JSON.parse(e.data);
                if (payload.type === 'served') {
                    proxyStats.totalBlocked   = payload.total;
                    proxyStats.sessionBlocked = payload.session;
                    lastServedAt = Date.now();
                    lastChannel  = payload.channel || '';
                    console.log(`[PurpleAdBlock] ✓ ad-free stream served — ${lastChannel || 'twitch'} (session ${payload.session}, total ${payload.total})`);
                    flashServed();
                }
            } catch { /* ignore malformed events */ }
        };
        sseSource.onerror = () => disconnectSse();
    } catch { /* EventSource not available in all bg contexts */ }
}

function disconnectSse() {
    if (sseSource) {
        sseSource.close();
        sseSource = null;
    }
}

// briefly show the "blocking" icon when a fresh ad-free stream is served
function flashServed() {
    updateIcon();
    if (servedTimer) clearTimeout(servedTimer);
    servedTimer = setTimeout(() => { lastServedAt = 0; updateIcon(); }, 4000);
}

// redirect only the usher master-playlist request. the channel/vod media
// playlists (weaver) and the video segments are left to load directly from
// twitch's cdn, so quality is untouched.
browser.webRequest.onBeforeRequest.addListener(
    (details) => {
        if (!proxyAlive || !blockerEnabled) return {};
        return {
            redirectUrl: `${PROXY_ORIGIN}/hls?url=${encodeURIComponent(details.url)}`,
        };
    },
    {
        urls: [
            'https://usher.ttvnw.net/api/channel/hls/*',
            'https://usher.ttvnw.net/api/v*/channel/hls/*',
            'https://usher.ttvnw.net/vod/*',
        ],
    },
    ['blocking']
);

browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    switch (msg.type) {
        case 'GET_STATUS':
            sendResponse({ proxyAlive, blockerEnabled, stats: proxyStats, lastServedAt, lastChannel });
            break;
        case 'GET_SETTINGS':
            sendResponse(proxySettings);
            break;
        case 'TOGGLE_BLOCKER':
            if (typeof msg.enabled !== 'boolean') { sendResponse({ ok: false }); break; }
            fetch(`${PROXY_ORIGIN}/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: msg.enabled }),
            })
                .then((r) => r.json())
                .then((data) => {
                    blockerEnabled = data.enabled;
                    proxySettings  = data;
                    updateIcon();
                    sendResponse({ ok: true, enabled: blockerEnabled });
                })
                .catch(() => sendResponse({ ok: false }));
            return true;
        case 'TOGGLE_AUTOSTART':
            if (typeof msg.autostart !== 'boolean') { sendResponse({ ok: false }); break; }
            fetch(`${PROXY_ORIGIN}/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ autostart: msg.autostart }),
            })
                .then((r) => r.json())
                .then((data) => { proxySettings = data; sendResponse({ ok: true, autostart: data.autostart }); })
                .catch(() => sendResponse({ ok: false }));
            return true;
        default:
            sendResponse({ ok: false, error: 'unknown message type' });
    }
});

function updateIcon() {
    const servedRecently = Date.now() - lastServedAt < 4000;
    if (!proxyAlive) {
        browser.browserAction.setIcon({ path: { 48: 'icons/icon_offline.png' } });
        browser.browserAction.setTitle({ title: 'PurpleAdBlock — proxy offline' });
    } else if (!blockerEnabled) {
        browser.browserAction.setIcon({ path: { 48: 'icons/icon_disabled.png' } });
        browser.browserAction.setTitle({ title: 'PurpleAdBlock — disabled' });
    } else if (servedRecently) {
        browser.browserAction.setIcon({ path: { 48: 'icons/icon_blocking.png' } });
        browser.browserAction.setTitle({ title: `PurpleAdBlock — ad-free stream loaded${lastChannel ? ` (${lastChannel})` : ''}` });
    } else {
        browser.browserAction.setIcon({ path: { 48: 'icons/icon48.png' } });
        browser.browserAction.setTitle({ title: 'PurpleAdBlock — active' });
    }
}