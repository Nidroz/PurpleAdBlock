const PROXY_ORIGIN= 'http://127.0.0.1:8765';
const PING_INTERVAL= 5000;
const RULE_ID_HLS= 1;

let proxyAlive= false;
let blockerEnabled = true;
let proxySettings  = {};

// ping
async function pingProxy() {
    try {
        const res= await fetch(`${PROXY_ORIGIN}/ping`, { signal: AbortSignal.timeout(2000) });
        const data = await res.json();
        proxyAlive = data.alive === true;
        blockerEnabled = data.enabled === true;
    } catch {
        proxyAlive = false;
    }
    await syncRedirectRule();
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

// declarativeNetRequest redirect rule
async function syncRedirectRule() {
    const shouldBlock = proxyAlive && blockerEnabled;

    if (shouldBlock) {
        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: [RULE_ID_HLS],
            addRules: [{
                id: RULE_ID_HLS,
                priority: 1,
                action: {
                    type: 'redirect',
                    redirect: {
                        regexSubstitution: `${PROXY_ORIGIN}/hls?url=\\0`,
                    },
                },
                condition: {
                    regexFilter: 'https://(usher\\.twitchapps\\.com|[^/]+\\.hls\\.twitchapps\\.com|[^/]+\\.abs\\.hls\\.twitchapps\\.com)/[^?]*\\.m3u8(\\?.*)?$',
                    resourceTypes: ['xmlhttprequest', 'media', 'other'],
                },
            }],
        });
    } else {
        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: [RULE_ID_HLS],
        });
    }
}

// message handler
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
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
                body: JSON.stringify({ enabled: msg.enabled }),
            })
                .then((r) => r.json())
                .then(async (data) => {
                    blockerEnabled = data.enabled;
                    proxySettings = data;
                    await syncRedirectRule();
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