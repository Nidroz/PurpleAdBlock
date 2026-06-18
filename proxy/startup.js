const { execFileSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const APP_NAME = 'PurpleAdBlock';
const APP_PATH = path.resolve(__dirname, 'index.js');

// local hidden-launch wrapper, also handy to double-click manually
const VBS_LOCAL = path.resolve(__dirname, 'launch-hidden.vbs');

// the windows per-user startup folder runs everything inside it at login
const STARTUP_DIR = process.env.APPDATA
    ? path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup')
    : null;
const VBS_STARTUP = STARTUP_DIR ? path.join(STARTUP_DIR, `${APP_NAME}.vbs`) : null;

// legacy autostart location used by older versions — cleaned up on enable/disable
const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';

/**
 * builds the .vbs content that launches the proxy with a hidden window.
 * node.exe is a console app; wscript running this starts it with windowStyle 0
 * (hidden), leaving only the tray icon. Chr(34) supplies the quotes around the
 * paths (which contain spaces) without escaping headaches.
 * @returns {string}
 */
function vbsContent() {
    return [
        'Set WshShell = CreateObject("WScript.Shell")',
        'q = Chr(34)',
        `WshShell.Run q & "${process.execPath}" & q & " " & q & "${APP_PATH}" & q, 0, False`,
    ].join('\r\n') + '\r\n';
}

/**
 * removes the legacy Run registry key if present (migration cleanup).
 */
function removeLegacyRunKey() {
    if (process.platform !== 'win32') return;
    try {
        execFileSync('reg', ['delete', RUN_KEY, '/v', APP_NAME, '/f'], { stdio: 'pipe' });
    } catch { /* key absent — fine */ }
}

/**
 * enables autostart by dropping a hidden-launch .vbs in the windows startup folder.
 */
function enableAutostart() {
    if (process.platform !== 'win32') {
        console.warn('[startup] autostart is only supported on Windows');
        return;
    }
    try {
        const vbs = vbsContent();
        fs.writeFileSync(VBS_LOCAL, vbs, 'utf-8'); // keep a local copy to double-click
        if (VBS_STARTUP) fs.writeFileSync(VBS_STARTUP, vbs, 'utf-8');
        removeLegacyRunKey(); // avoid launching twice
        console.log('[startup] autostart enabled (startup folder, hidden launch)');
    } catch (e) {
        console.error('[startup] failed to enable autostart:', e.message);
    }
}

/**
 * disables autostart by removing the .vbs from the startup folder.
 * the local launch-hidden.vbs is kept so it can still be launched manually.
 */
function disableAutostart() {
    if (process.platform !== 'win32') return;
    try {
        if (VBS_STARTUP && fs.existsSync(VBS_STARTUP)) fs.unlinkSync(VBS_STARTUP);
        removeLegacyRunKey();
        console.log('[startup] autostart disabled');
    } catch (e) {
        console.error('[startup] failed to disable autostart:', e.message);
    }
}

/**
 * returns true if the startup-folder launcher exists.
 * @returns {boolean}
 */
function isAutostartEnabled() {
    if (process.platform !== 'win32' || !VBS_STARTUP) return false;
    return fs.existsSync(VBS_STARTUP);
}

module.exports = { enableAutostart, disableAutostart, isAutostartEnabled };