/* global browser, chrome */
const ext = typeof browser !== 'undefined' ? browser : chrome;

const statusDot         = document.getElementById('statusDot');
const statusLabel       = document.getElementById('statusLabel');
const offlineBanner     = document.getElementById('offlineBanner');
const mainToggle        = document.getElementById('mainToggle');
const toggleSubtitle    = document.getElementById('toggleSubtitle');
const enabledCheckbox   = document.getElementById('enabledCheckbox');
const autostartCheckbox = document.getElementById('autostartCheckbox');
const proxyPortLabel    = document.getElementById('proxyPortLabel');
const adActiveBadge     = document.getElementById('adActiveBadge');
const adActiveText      = document.getElementById('adActiveText');
const statSession       = document.getElementById('statSession');
const statTotal         = document.getElementById('statTotal');

// how long the "just served" badge stays visible after a stream is served
const SERVED_WINDOW_MS = 4000;
let servedHideTimer = null;

ext.runtime.sendMessage({ type: 'GET_STATUS' }, (res) => {
    if (!res) return;
    renderProxy(res.proxyAlive);
    renderBlocker(res.blockerEnabled);
    renderServed(res.lastServedAt, res.lastChannel);
    renderStats(res.stats || {});
});

ext.runtime.sendMessage({ type: 'GET_SETTINGS' }, (res) => {
    if (!res) return;
    autostartCheckbox.checked  = res.autostart === true;
    proxyPortLabel.textContent = `Port: ${res.port}`;
});

setInterval(() => {
    ext.runtime.sendMessage({ type: 'GET_STATUS' }, (res) => {
        if (!res) return;
        renderProxy(res.proxyAlive);
        renderServed(res.lastServedAt, res.lastChannel);
        renderStats(res.stats || {});
    });
}, 2000);

enabledCheckbox.addEventListener('change', () => {
    ext.runtime.sendMessage(
        { type: 'TOGGLE_BLOCKER', enabled: enabledCheckbox.checked },
        (res) => {
            if (res?.ok) renderBlocker(res.enabled);
            else enabledCheckbox.checked = !enabledCheckbox.checked;
        }
    );
});

mainToggle.addEventListener('click', (e) => {
    if (e.target !== enabledCheckbox) enabledCheckbox.click();
});
mainToggle.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') enabledCheckbox.click();
});

autostartCheckbox.addEventListener('change', () => {
    ext.runtime.sendMessage(
        { type: 'TOGGLE_AUTOSTART', autostart: autostartCheckbox.checked },
        (res) => {
            if (!res?.ok) autostartCheckbox.checked = !autostartCheckbox.checked;
        }
    );
});

document.getElementById('autostartRow').addEventListener('click', (e) => {
    if (e.target !== autostartCheckbox) autostartCheckbox.click();
});
document.getElementById('autostartRow').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') autostartCheckbox.click();
});

function renderProxy(alive) {
    if (alive) {
        statusDot.className   = 'status-dot online';
        statusLabel.innerHTML = 'Proxy <span class="text-twitch-text font-medium">online</span>';
        offlineBanner.classList.add('hidden');
    } else {
        statusDot.className   = 'status-dot offline';
        statusLabel.innerHTML = 'Proxy <span class="text-status-offline font-medium">offline</span>';
        offlineBanner.classList.remove('hidden');
    }
}

function renderBlocker(enabled) {
    enabledCheckbox.checked = enabled;
    mainToggle.setAttribute('aria-pressed', String(enabled));
    if (enabled) {
        mainToggle.classList.add('bg-purple-dim', 'border-purple');
        mainToggle.classList.remove('border-twitch-border');
        toggleSubtitle.textContent = 'Ads are being blocked on Twitch';
    } else {
        mainToggle.classList.remove('bg-purple-dim', 'border-purple');
        mainToggle.classList.add('border-twitch-border');
        toggleSubtitle.textContent = 'Blocker is paused';
    }
}

// shows a transient badge when an ad-free stream was just served
function renderServed(lastServedAt, channel) {
    const elapsed = lastServedAt ? Date.now() - lastServedAt : Infinity;
    if (elapsed < SERVED_WINDOW_MS) {
        adActiveText.textContent = channel
            ? `Ad-free stream loaded — ${channel}`
            : 'Ad-free stream loaded';
        adActiveBadge.classList.remove('hidden');
        if (servedHideTimer) clearTimeout(servedHideTimer);
        servedHideTimer = setTimeout(
            () => adActiveBadge.classList.add('hidden'),
            SERVED_WINDOW_MS - elapsed
        );
    } else {
        adActiveBadge.classList.add('hidden');
    }
}

function renderStats(stats) {
    statSession.textContent = stats.sessionBlocked ?? 0;
    statTotal.textContent   = stats.totalBlocked   ?? 0;
}