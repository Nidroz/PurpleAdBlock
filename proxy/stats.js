const fs   = require('fs');
const path = require('path');

const STATS_PATH = path.join(__dirname, '..', 'stats.json');

// in-memory state
let stats = {
    totalBlocked: 0,   // ad-free streams served since install
    sessionBlocked: 0, // since last proxy start
};

// SSE clients waiting for live events
const sseClients = new Set();

/**
 * loads persisted stats from disk.
 * only totalBlocked is persisted — sessionBlocked always resets on start.
 */
function loadStats() {
    try {
        if (fs.existsSync(STATS_PATH)) {
            const raw = JSON.parse(fs.readFileSync(STATS_PATH, 'utf-8'));
            stats.totalBlocked = Number.isInteger(raw.totalBlocked) ? raw.totalBlocked : 0;
        }
    } catch {
        stats.totalBlocked = 0;
    }
    stats.sessionBlocked = 0;
}

/**
 * persists totalBlocked to disk (fire-and-forget, non-blocking).
 */
function saveStats() {
    try {
        fs.writeFileSync(STATS_PATH, JSON.stringify({ totalBlocked: stats.totalBlocked }, null, 2), 'utf-8');
    } catch (e) {
        console.error('[stats] failed to save stats.json:', e.message);
    }
}

/**
 * records that an ad-free playlist was served for a channel.
 * broadcasts a live event to all connected SSE clients.
 * @param {string} channel - the twitch channel/vod id the playlist was served for
 */
function recordServed(channel) {
    stats.totalBlocked   += 1;
    stats.sessionBlocked += 1;
    saveStats();
    broadcast({
        type: 'served',
        channel: channel || '',
        total: stats.totalBlocked,
        session: stats.sessionBlocked,
    });
}

/**
 * returns the current stats snapshot.
 * @returns {{ totalBlocked: number, sessionBlocked: number }}
 */
function getStats() {
    return { ...stats };
}

/**
 * registers an SSE response object as a live client.
 * @param {import('express').Response} res
 */
function addSseClient(res) {
    sseClients.add(res);
}

/**
 * removes a disconnected SSE client.
 * @param {import('express').Response} res
 */
function removeSseClient(res) {
    sseClients.delete(res);
}

/**
 * broadcasts a JSON event to all connected SSE clients.
 * @param {object} payload
 */
function broadcast(payload) {
    if (sseClients.size === 0) return;
    const data = `data: ${JSON.stringify(payload)}\n\n`;
    for (const client of sseClients) {
        try {
            client.write(data);
        } catch {
            sseClients.delete(client);
        }
    }
}

module.exports = { loadStats, getStats, recordServed, addSseClient, removeSseClient };