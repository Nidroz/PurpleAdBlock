const { execFileSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const APP_NAME = 'PurpleAdBlock';
const APP_PATH = path.resolve(__dirname, 'index.js');
const VBS_PATH = path.resolve(__dirname, 'launch-hidden.vbs');
const RUN_KEY  = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';

/**
 * writes a .vbs wrapper that launches the proxy with a hidden window.
 * node.exe is a console app, so launching it directly at login pops a black
 * console window. wscript running this vbs starts node with windowStyle 0
 * (hidden), leaving only the tray icon.
 */
function writeVbsWrapper() {
    // Chr(34) is a double-quote — avoids escaping headaches inside the vbs string.
    // the Run argument ends up as: "<node.exe>" "<index.js>"
    const vbs = [
        'Set WshShell = CreateObject("WScript.Shell")',
        'q = Chr(34)',
        `WshShell.Run q & "${process.execPath}" & q & " " & q & "${APP_PATH}" & q, 0, False`,
    ].join('\r\n') + '\r\n';

    fs.writeFileSync(VBS_PATH, vbs, 'utf-8');
}

/**
 * builds the reg.exe arguments to register the hidden launcher at login.
 * uses execFileSync (not execSync) — args are passed as an array, never
 * interpolated into a shell string, so there's no shell injection risk.
 * @returns {string[]}
 */
function buildAddArgs() {
    const launchCmd = `wscript.exe "${VBS_PATH}"`;
    return [
        'add', RUN_KEY,
        '/v', APP_NAME,
        '/t', 'REG_SZ',
        '/d', launchCmd,
        '/f',
    ];
}

/**
 * enables autostart: writes the hidden-launch wrapper and registers it (windows only).
 */
function enableAutostart() {
    if (process.platform !== 'win32') {
        console.warn('[startup] autostart is only supported on Windows');
        return;
    }
    try {
        writeVbsWrapper();
        execFileSync('reg', buildAddArgs(), { stdio: 'pipe' });
        console.log('[startup] autostart enabled (hidden launch)');
    } catch (e) {
        console.error('[startup] failed to enable autostart:', e.message);
    }
}

/**
 * disables autostart: removes the registry key and the wrapper file (windows only).
 */
function disableAutostart() {
    if (process.platform !== 'win32') return;
    try {
        execFileSync('reg', ['delete', RUN_KEY, '/v', APP_NAME, '/f'], { stdio: 'pipe' });
        console.log('[startup] autostart disabled');
    } catch (e) {
        // key simply doesn't exist — not an error
        if (!e.stderr?.toString().includes('unable to find')) {
            console.error('[startup] failed to disable autostart:', e.message);
        }
    }
    // clean up the wrapper file
    try {
        if (fs.existsSync(VBS_PATH)) fs.unlinkSync(VBS_PATH);
    } catch { /* ignore */ }
}

/**
 * returns true if the autostart registry key exists.
 * @returns {boolean}
 */
function isAutostartEnabled() {
    if (process.platform !== 'win32') return false;
    try {
        execFileSync('reg', ['query', RUN_KEY, '/v', APP_NAME], { stdio: 'pipe' });
        return true;
    } catch {
        return false;
    }
}

module.exports = { enableAutostart, disableAutostart, isAutostartEnabled };