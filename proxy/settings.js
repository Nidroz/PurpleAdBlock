const fs   = require('fs');
const path = require('path');

const SETTINGS_PATH = path.join(__dirname, '..', 'settings.json');

const DEFAULTS = {
    enabled: true,
    autostart: false,
    port: 8765,
    proxyUrl: '', // ad-free relay base url; empty means "serve original playlist"
};

/**
 * validates and sanitises a raw settings object.
 * unknown keys are dropped; values of the wrong type are replaced with defaults.
 * @param {object} raw
 * @returns {object}
 */
function sanitise(raw) {
    return {
        enabled: typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULTS.enabled,
        autostart: typeof raw.autostart === 'boolean' ? raw.autostart : DEFAULTS.autostart,
        port: Number.isInteger(raw.port) && raw.port > 1024 && raw.port < 65536 // 1025-65535 are valid non-privileged ports
            ? raw.port
            : DEFAULTS.port,
        proxyUrl: typeof raw.proxyUrl === 'string' && (raw.proxyUrl === '' || /^https?:\/\//i.test(raw.proxyUrl))
            ? raw.proxyUrl.trim()
            : DEFAULTS.proxyUrl,
    };
}

/**
 * loads settings from disk, filling in missing keys with defaults.
 * @returns {object}
 */
function loadSettings() {
    try {
        if (fs.existsSync(SETTINGS_PATH)) {
            const raw = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
            return sanitise({ ...DEFAULTS, ...raw });
        }
    } catch (e) {
        console.error('[settings] failed to read settings.json, using defaults:', e.message);
    }
    return { ...DEFAULTS };
}

/**
 * saves a settings object to disk after sanitising it.
 * @param {object} settings
 */
function saveSettings(settings) {
    try {
        const safe = sanitise(settings);
        fs.writeFileSync(SETTINGS_PATH, JSON.stringify(safe, null, 2), 'utf-8');
    } catch (e) {
        console.error('[settings] failed to write settings.json:', e.message);
    }
}

/**
 * merges a partial patch into the current settings and persists the result.
 * @param {object} patch
 * @returns {object} updated settings
 */
function updateSettings(patch) {
    const current = loadSettings();
    const updated = sanitise({ ...current, ...patch });
    saveSettings(updated);
    return updated;
}

module.exports = { loadSettings, saveSettings, updateSettings };