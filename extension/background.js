/* global chrome */

const PROXY_ORIGIN  = 'http://127.0.0.1:8765';
const PING_INTERVAL = 5000;

// single rule: redirect the usher master-playlist request to the local proxy.
// the trailing .* makes \0 include the usher query string so the proxy can
// rebuild the relay request (and fall back to the original signed url).
const RULE_USHER = 1;

let proxyAlive     = false;
let blockerEnabled = true;
let proxySettings  = {};
let proxyStats     = { totalBlocked: 0, sessionBlocked: 0 };
let sseSource      = null;

async function pingProxy() {
    try {
        const res  = await fetch(`${PROXY_ORIGIN}/ping`, { signal: AbortSignal.timeout(2000) });
        const data = await res.json();
        proxyAlive     = data.alive === true;
        blockerEnabled = data.enabled === true;
    } catch {
        proxyAlive = false;
        disconnectSse();
    }
    await syncRedirectRule();
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
                if (payload.type === 'blocked') {
                    proxyStats.totalBlocked   = payload.total;
                    proxyStats.sessionBlocked = payload.session;
                }
            } catch { /* ignore malformed events */ }
        };
        sseSource.onerror = () => disconnectSse();
    } catch { /* not available in all service worker contexts */ }
}

function disconnectSse() {
    if (sseSource) {
        sseSource.close();
        sseSource = null;
    }
}

async function syncRedirectRule() {
    const shouldBlock = proxyAlive && blockerEnabled;
    if (shouldBlock) {
        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: [RULE_USHER],
            addRules: [{
                id: RULE_USHER,
                priority: 1,
                action: {
                    type: 'redirect',
                    redirect: { regexSubstitution: `${PROXY_ORIGIN}/hls?url=\\0` },
                },
                condition: {
                    regexFilter: '^https://usher\\.ttvnw\\.net/(?:api/(?:v\\d+/)?channel/hls|vod)/[^/]+\\.m3u8.*$',
                    resourceTypes: ['xmlhttprequest', 'media', 'other'],
                },
            }],
        });
    } else {
        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: [RULE_USHER],
        });
    }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    switch (msg.type) {
        case 'GET_STATUS':
            sendResponse({ proxyAlive, blockerEnabled, stats: proxyStats });
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
                .then(async (data) => {
                    blockerEnabled = data.enabled;
                    proxySettings  = data;
                    await syncRedirectRule();
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
    if (!proxyAlive) {
        chrome.action.setIcon({ path: { 48: 'icons/icon_offline.png' } });
        chrome.action.setTitle({ title: 'PurpleAdBlock — proxy offline' });
    } else if (!blockerEnabled) {
        chrome.action.setIcon({ path: { 48: 'icons/icon_disabled.png' } });
        chrome.action.setTitle({ title: 'PurpleAdBlock — disabled' });
    } else {
        chrome.action.setIcon({ path: { 48: 'icons/icon48.png' } });
        chrome.action.setTitle({ title: 'PurpleAdBlock — active' });
    }
}