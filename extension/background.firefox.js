const PROXY_ORIGIN = 'http://127.0.0.1:8765';
const PING_INTERVAL = 5000;

let proxyAlive = false;
let blockerEnabled= true;
let proxySettings= {};

// ping
async function pingProxy() {
    try {
        const res = await fetch(`${PROXY_ORIGIN}/ping`, { signal: AbortSignal.timeout(2000) });
        const data = await res.json();
        proxyAlive = data.alive === true;
        blockerEnabled = data.enabled === true;
    } catch {
        proxyAlive = false;
    }
    updateIcon();
}

async function fetchSettings() {
    try {
        const res = await fetch(`${PROXY_ORIGIN}/settings`, { signal: AbortSignal.timeout(2000) });
        proxySettings = await res.json();
    } catch {
        proxySettings = {};
    }
}

pingProxy();
fetchSettings();
setInterval(pingProxy, PING_INTERVAL);

// intercept twitch hls requests (MV2 webRequest)
browser.webRequest.onBeforeRequest.addListener(
    (details) => {
        if (!proxyAlive || !blockerEnabled) return {};
        if (!details.url.includes('.m3u8')) return {};
        return {
            redirectUrl: `${PROXY_ORIGIN}/hls?url=${encodeURIComponent(details.url)}`,
        };
    },
    {
        urls: [
            '*://usher.twitchapps.com/*.m3u8*',
            '*://*.hls.twitchapps.com/*.m3u8*',
            '*://*.abs.hls.twitchapps.com/*.m3u8*',
        ],
    },
    ['blocking']
);

// message handler
browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    switch (msg.type) {
        case 'GET_STATUS':
            sendResponse({ proxyAlive, blockerEnabled });
            break;
        case 'GET_SETTINGS':
            sendResponse(proxySettings);
            break;
        case 'TOGGLE_BLOCKER':
            if (typeof msg.enabled !== 'boolean') {
                sendResponse({ ok: false, error: 'invalid value' });
                break;
            }
            fetch(`${PROXY_ORIGIN}/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body:  JSON.stringify({ enabled: msg.enabled }),
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
            if (typeof msg.autostart !== 'boolean') {
                sendResponse({ ok: false, error: 'invalid value' });
                break;
            }
            fetch(`${PROXY_ORIGIN}/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body:  JSON.stringify({ autostart: msg.autostart }),
            })
                .then((r) => r.json())
                .then((data) => {
                    proxySettings = data;
                    sendResponse({ ok: true, autostart: data.autostart });
                })
                .catch(() => sendResponse({ ok: false }));
            return true;
        default:
            sendResponse({ ok: false, error: 'unknown message type' });
    }
});

// icon
function updateIcon() {
    if (!proxyAlive) {
        browser.browserAction.setIcon({ path: { 48: 'icons/icon_offline.png' } });
        browser.browserAction.setTitle({ title: 'PurpleAdBlock — proxy offline' });
    } else if (!blockerEnabled) {
        browser.browserAction.setIcon({ path: { 48: 'icons/icon_disabled.png' } });
        browser.browserAction.setTitle({ title: 'PurpleAdBlock — disabled' });
    } else {
        browser.browserAction.setIcon({ path: { 48: 'icons/icon48.png' } });
        browser.browserAction.setTitle({ title: 'PurpleAdBlock — active' });
    }
}