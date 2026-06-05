const SysTray = require('systray2').default;
const { loadSettings, updateSettings } = require('./settings');
const { enableAutostart, disableAutostart } = require('./startup');

// menu item indices — must match the items array order
const IDX_TOGGLE= 0;
const IDX_AUTOSTART= 1;
// index 2 is the separator
const IDX_QUIT= 3;

/**
 * builds and starts the system tray icon.
 * the tray menu reflects the current settings on startup
 * and stays in sync when items are clicked.
 */
function startTray() {
    let settings = loadSettings();

    const tray = new SysTray({
        menu: {
            icon: getIconBase64(),
            title: 'PurpleAdBlock',
            tooltip: 'PurpleAdBlock — Twitch Ad Blocker',
            items: buildItems(settings),
        },
        debug: false,
        copyDir: true,
    });

    tray.onClick((action) => {
        // reload settings from disk before each action, so we're always in sync
        settings = loadSettings();
        switch (action.seq_id) {
            case IDX_TOGGLE: {
                const enabled = !settings.enabled;
                settings = updateSettings({ enabled });
                console.log(`[tray] blocker ${enabled ? 'enabled' : 'disabled'}`);
                tray.sendAction({
                    type: 'update-item',
                    item: buildToggleItem(enabled),
                    seq_id: IDX_TOGGLE,
                });
                break;
            }
            case IDX_AUTOSTART: {
                const autostart = !settings.autostart;
                if (autostart) enableAutostart();
                else disableAutostart();
                settings = updateSettings({ autostart });
                tray.sendAction({
                    type: 'update-item',
                    item: buildAutostartItem(autostart),
                    seq_id: IDX_AUTOSTART,
                });
                break;
            }
            case IDX_QUIT:
                console.log('[tray] quitting PurpleAdBlock');
                tray.kill(false);
                process.exit(0);
                break;
        }
    });
    return tray;
}

/* item builders */

function buildToggleItem(enabled) {
    return {
        title: enabled ? '✅  Blocker: ON' : '❌  Blocker: OFF',
        tooltip: 'toggle the ad blocker on or off',
        enabled: true,
    };
}

function buildAutostartItem(autostart) {
    return {
        title: autostart ? '✅  Launch at startup' : '⬜  Launch at startup',
        tooltip: 'toggle autostart on Windows login',
        enabled: true,
    };
}

function buildItems(settings) {
    return [
        buildToggleItem(settings.enabled),
        buildAutostartItem(settings.autostart),
        { title: '<separator>' },
        { title: '❌  Quit', tooltip: 'stop the PurpleAdBlock proxy', enabled: true },
    ];
}

/**
 * returns a minimal base64-encoded PNG for the tray icon (16x16 purple square).
 * replace with a proper .ico / .png for production.
 * @returns {string}
 */
function getIconBase64() {
    return 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMklEQVQ4T2NkoBAwUqifgWTA////GckwgGQDRg2giksMjGiuGDWAKi4xMKK5AgCZ1hERAhwkFAAAAABJRU5ErkJggg==';
}

module.exports = { startTray };