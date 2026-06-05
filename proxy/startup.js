const { execFileSync } = require('child_process');
const path = require('path');

const APP_NAME = 'PurpleAdBlock';
const APP_PATH = path.resolve(__dirname, 'index.js');

/**
 * builds the reg.exe arguments array for adding the autostart key.
 * uses execFileSync (not execSync) to avoid any shell injection risk —
 * arguments are passed as an array, never interpolated into a shell string.
 * @returns {string[]}
 */
function buildAddArgs() {
    const nodePath  = process.execPath;
    const launchCmd = `"${nodePath}" "${APP_PATH}"`;
    return [
        'add',
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
        '/v', APP_NAME,
        '/t', 'REG_SZ',
        '/d', launchCmd,
        '/f',
    ];
}

/**
 * enables autostart by writing a registry key (windows only).
 */
function enableAutostart() {
    if (process.platform !== 'win32') {
        console.warn('[startup] autostart is only supported on Windows');
        return;
    }
    try {
        execFileSync('reg', buildAddArgs(), { stdio: 'pipe' });
        console.log('[startup] autostart enabled');
    } catch (e) {
        console.error('[startup] failed to enable autostart:', e.message);
    }
}

/**
 * disables autostart by removing the registry key (windows only).
 */
function disableAutostart() {
    if (process.platform !== 'win32') return;
    try {
        execFileSync('reg', [
            'delete',
            'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
            '/v', APP_NAME,
            '/f',
        ], { stdio: 'pipe' });
        console.log('[startup] autostart disabled');
    } catch (e) {
        // key simply doesn't exist — not an error
        if (!e.stderr?.toString().includes('unable to find')) {
            console.error('[startup] failed to disable autostart:', e.message);
        }
    }
}

/**
 * returns true if the autostart registry key exists.
 * @returns {boolean}
 */
function isAutostartEnabled() {
    if (process.platform !== 'win32') return false;
    try {
        execFileSync('reg', [
            'query',
            'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
            '/v', APP_NAME,
        ], { stdio: 'pipe' });
        return true;
    } catch {
        return false;
    }
}

module.exports = { enableAutostart, disableAutostart, isAutostartEnabled };