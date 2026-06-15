const SysTray = require('systray2').default;
const { loadSettings, updateSettings } = require('./settings');
const { enableAutostart, disableAutostart } = require('./startup');

// menu item indices — must match the items array order
const IDX_TOGGLE    = 0;
const IDX_AUTOSTART = 1;
// index 2 is the separator
const IDX_QUIT      = 3;

/**
 * builds and starts the system tray icon.
 * the tray menu reflects the current settings on startup
 * and stays in sync when items are clicked.
 */
function startTray() {
    let settings = loadSettings();

    const tray = new SysTray({
        menu: {
            // windows needs an .ico, other platforms a .png
            icon: getIcon(),
            isTemplateIcon: false,
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
        SysTray.separator, // built-in separator, renders as a divider line
        { title: '❌  Quit', tooltip: 'stop the PurpleAdBlock proxy', enabled: true },
    ];
}

/**
 * returns the base64-encoded tray icon for the current platform.
 * windows requires .ico; linux/macos use .png.
 * @returns {string}
 */
function getIcon() {
    return process.platform === 'win32' ? ICON_ICO : ICON_PNG;
}

// 16-64px purple rounded square (#9147ff)
const ICON_ICO = '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';
const ICON_PNG = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAbElEQVR4nO3XsQ0AIQwDwODlGOdn+XF+OqgoPgGlimnsEhA+iTSYXU7bLb59jIqy52uhD6zy093IDlQjcNpgIcAu94gwA+wIIIAAAggggAACCCAAzPY/luqsTvgFZvkPwEL4jjADlYgbT51mAvViJDzWbZ8+AAAAAElFTkSuQmCC';

module.exports = { startTray };