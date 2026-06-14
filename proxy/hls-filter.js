// ad-related class values in EXT-X-DATERANGE tags
const AD_DATERANGE_CLASSES = [
    'twitch-stitched-ad',
    'stitched-ad',
];

// title patterns on EXTINF lines that indicate an ad segment
// twitch marks ad segments with a DCM| prefix in the segment title
const AD_EXTINF_PATTERNS = [
    /^DCM\|/,
    /^twitch-ad/i,
];

// EXT-X-DATERANGE classes that mark ad quartile tracking (not segments, just metadata)
const AD_QUARTILE_CLASS = 'twitch-ad-quartile';

function isAdDateRange(line) {
    if (!line.toUpperCase().includes('EXT-X-DATERANGE')) return false;
    const lower = line.toLowerCase();
    return AD_DATERANGE_CLASSES.some((cls) => lower.includes(cls));
}

function isAdQuartileLine(line) {
    return line.toLowerCase().includes(AD_QUARTILE_CLASS);
}

/**
 * returns true if an EXTINF title field marks an ad segment.
 * format: #EXTINF:<duration>,<title>
 * @param {string} line
 */
function isAdExtinf(line) {
    const upper = line.toUpperCase();
    if (!upper.startsWith('#EXTINF')) return false;
    const commaIdx = line.indexOf(',');
    if (commaIdx === -1) return false;
    const title = line.substring(commaIdx + 1).trim();
    return AD_EXTINF_PATTERNS.some((p) => p.test(title));
}

/**
 * parses a twitch hls playlist and removes all ad-related segments.
 *
 * twitch 2025/2026 ad format:
 *  - ad segments are tagged with DCM|<creative_id> in the EXTINF title
 *  - ad metadata comes in EXT-X-DATERANGE tags with class "twitch-stitched-ad"
 *  - ad start/end may use EXT-X-DISCONTINUITY markers
 *  - quartile tracking lines (twitch-ad-quartile) are metadata only, safe to remove
 *
 * @param {string} playlistText - raw .m3u8 content
 * @returns {{ playlist: string, blockedCount: number }}
 */
function filterPlaylist(playlistText) {
    const lines = playlistText.split('\n');
    const output = [];
    let blockedCount = 0;
    let skipNextSegment = false;

    for (let i = 0; i < lines.length; i++) {
        const line    = lines[i];
        const trimmed = line.trim();
        // drop ad stitching metadata tags
        if (isAdDateRange(trimmed)) continue;
        // drop quartile tracking tags (pure metadata, no segments attached)
        if (isAdQuartileLine(trimmed)) continue;

        // detect ad EXTINF — flag the next segment uri for removal
        if (isAdExtinf(trimmed)) {
            skipNextSegment = true;
            // don't emit this EXTINF line
            continue;
        }
        // drop the segment uri following an ad EXTINF
        if (skipNextSegment && trimmed.length > 0 && !trimmed.startsWith('#')) {
            skipNextSegment = false;
            blockedCount++;
            continue;
        }

        // reset flag if we hit another tag before finding a uri (shouldn't happen normally)
        if (skipNextSegment && trimmed.startsWith('#') && !trimmed.toUpperCase().startsWith('#EXTINF')) {
            skipNextSegment = false;
        }
        output.push(line);
    }
    return { playlist: output.join('\n'), blockedCount };
}

module.exports = { filterPlaylist };