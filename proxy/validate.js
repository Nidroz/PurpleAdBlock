const { URL } = require('url');

/**
 * allowed twitch cdn hostnames for proxy requests.
 * only these domains can be proxied — any other url is rejected.
 * this prevents ssrf (server-side request forgery) attacks.
 */
const ALLOWED_HOSTNAMES = [
    'usher.twitchapps.com',
    'video-weaver.fra05.hls.twitchapps.com',
];

/**
 * pattern matching all twitch hls cdn subdomains.
 * covers: video-weaver.<region>.hls.twitchapps.com
 *         video-edge-<id>.abs.hls.twitchapps.com
 */
const ALLOWED_HOSTNAME_PATTERNS = [
    /^video-weaver\.[a-z0-9-]+\.hls\.twitchapps\.com$/,
    /^video-edge-[a-z0-9-]+\.abs\.hls\.twitchapps\.com$/,
    /^[a-z0-9-]+\.hls\.twitchapps\.com$/,
];

/**
 * validates that a url is safe to proxy.
 * - must be a valid url
 * - must use https
 * - hostname must match the twitch cdn whitelist
 * - must not contain credentials (user:pass@)
 * - must not be a private/loopback address
 *
 * @param {string} rawUrl
 * @returns {{ valid: boolean, reason?: string, parsed?: URL }}
 */
function validateProxyTarget(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') {
        return { valid: false, reason: 'missing url' };
    }

    let parsed;
    try {
        parsed = new URL(rawUrl);
    } catch {
        return { valid: false, reason: 'invalid url' };
    }
    // only https — no http, no file://, no data:// etc.
    if (parsed.protocol !== 'https:') {
        return { valid: false, reason: 'only https is allowed' };
    }
    // reject urls with embedded credentials
    if (parsed.username || parsed.password) {
        return { valid: false, reason: 'credentials in url are not allowed' };
    }

    const hostname = parsed.hostname.toLowerCase();
    // block loopback and private ranges by hostname
    const blockedHostnames = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];
    if (blockedHostnames.includes(hostname)) {
        return { valid: false, reason: 'loopback addresses are not allowed' };
    }

    // block private ip ranges (basic check — covers common cases)
    const privateIpPattern = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/;
    if (privateIpPattern.test(hostname)) {
        return { valid: false, reason: 'private ip ranges are not allowed' };
    }
    // check exact hostname whitelist
    if (ALLOWED_HOSTNAMES.includes(hostname)) {
        return { valid: true, parsed };
    }
    // check pattern whitelist
    for (const pattern of ALLOWED_HOSTNAME_PATTERNS) {
        if (pattern.test(hostname)) {
            return { valid: true, parsed };
        }
    }
    return { valid: false, reason: `hostname not allowed: ${hostname}` };
}

module.exports = { validateProxyTarget };