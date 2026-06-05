const fs   = require('fs');
const path = require('path');

const STATS_PATH = path.join(__dirname, '..', 'stats.json');

// in-memory state
let stats = {
    totalBlocked: 0,   // total ad segments blocked since install
    sessionBlocked: 0, // blocked since last proxy start
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
 * records that n ad segments were blocked in a single playlist.
 * broadcasts a live event to all connected SSE clients.
 * @param {number} n - number of segments blocked
 */
function recordBlocked(n) {
    if (n <= 0) return;
    stats.totalBlocked   += n;
    stats.sessionBlocked += n;
    saveStats();
    broadcast({ type: 'blocked', count: n, total: stats.totalBlocked, session: stats.sessionBlocked });
}

/**
 * signals that an active ad is currently being stripped (called per request).
 * @param {boolean} active
 */
function broadcastAdActive(active) {
    broadcast({ type: 'ad_active', active });
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

module.exports = { loadStats, getStats, recordBlocked, broadcastAdActive, addSseClient, removeSseClient };