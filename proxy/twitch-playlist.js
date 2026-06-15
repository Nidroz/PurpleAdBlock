// usher is the only twitch host we accept as an incoming proxy source
const USHER_HOST = 'usher.ttvnw.net';

// captures the channel name / vod id from a usher playlist path.
// matches: /api/channel/hls/{channel}.m3u8
//          /api/v2/channel/hls/{channel}.m3u8
//          /vod/{id}.m3u8
const USHER_PATH_RE = /\/(?:api\/(?:v\d+\/)?channel\/hls|vod)\/([^/]+)\.m3u8$/;

// query params that identify the user — stripped before hitting the relay
const STRIP_KEYS = ['sig', 'token', 'p', 'play_session_id'];

/**
 * validates an incoming usher url and extracts what we need to relay it.
 * @param {string} rawUrl - full usher url, including its own query string
 * @returns {{ valid: boolean, reason?: string, type?: 'live'|'vod', id?: string, search?: string, originalUrl?: string }}
 */
function parseUsherUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') {
        return { valid: false, reason: 'missing url' };
    }

    let u;
    try {
        u = new URL(rawUrl);
    } catch {
        return { valid: false, reason: 'invalid url' };
    }

    if (u.protocol !== 'https:') return { valid: false, reason: 'not https' };
    if (u.hostname !== USHER_HOST) return { valid: false, reason: 'host not allowed' };

    const match = USHER_PATH_RE.exec(u.pathname);
    if (!match) return { valid: false, reason: 'unrecognised usher path' };

    const isVod = u.pathname.includes('/vod/');
    return {
        valid: true,
        type: isVod ? 'vod' : 'live',
        id: match[1],
        search: u.search,    // includes the leading '?'
        originalUrl: u.href, // full signed url, kept for the direct fallback
    };
}

/**
 * builds the relay url that returns an ad-free playlist.
 * mirrors the luminous-ttv api: GET {instance}/live/{channel} or /vod/{id}.
 * @param {string} instance - base url of the ad-free relay (e.g. https://eu.example.dev)
 * @param {{ type: 'live'|'vod', id: string, search: string }} parsed
 * @returns {string}
 */
function buildRelayUrl(instance, parsed) {
    let base = String(instance).trim();
    if (!base.startsWith('http')) base = `http://${base}`;
    if (base.endsWith('/')) base = base.slice(0, -1);

    const endpoint = parsed.type === 'vod' ? '/vod/' : '/live/';
    const url = new URL(`${base}${endpoint}${parsed.id}${parsed.search}`);
    for (const key of STRIP_KEYS) url.searchParams.delete(key);
    return url.href;
}

module.exports = { parseUsherUrl, buildRelayUrl, USHER_HOST };