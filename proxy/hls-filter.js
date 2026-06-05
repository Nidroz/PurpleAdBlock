/**
 * ad-related tags injected by twitch's server-side ad insertion (ssai).
 * a line containing any of these is treated as ad metadata.
 */
const AD_TAG_KEYWORDS = [
    'EXT-X-AD-POD-START',
    'EXT-X-AD-POD-END',
    'EXT-X-CUE-OUT',
    'EXT-X-CUE-IN',
    'EXT-X-SCTE35',
];

/**
 * class values used in EXT-X-DATERANGE tags that identify ad ranges.
 * non-ad daterange tags (e.g. chapter markers) must not be removed.
 */
const AD_DATERANGE_CLASSES = [
    'twitch-stitched-ad',
    'stitched-ad',
];

function isAdBoundaryTag(line) {
    const upper = line.toUpperCase();
    return AD_TAG_KEYWORDS.some((kw) => upper.includes(kw));
}

function isAdDateRange(line) {
    if (!line.toUpperCase().includes('EXT-X-DATERANGE')) return false;
    const lower = line.toLowerCase();
    return AD_DATERANGE_CLASSES.some((cls) => lower.includes(cls));
}

/**
 * parses a twitch hls playlist and removes all ad-related segments.
 *
 * @param {string} playlistText - raw .m3u8 content
 * @returns {{ playlist: string, blockedCount: number }}
 */
function filterPlaylist(playlistText) {
    const lines = playlistText.split('\n');
    const output = [];

    let inAdPod        = false;
    let skipNextExtinf = false;
    let blockedCount   = 0;

    for (let i = 0; i < lines.length; i++) {
        const line    = lines[i];
        const trimmed = line.trim();

        /* ad pod boundaries */
        if (trimmed.toUpperCase().includes('EXT-X-AD-POD-START') ||
            trimmed.toUpperCase().includes('EXT-X-CUE-OUT')) {
            inAdPod = true;
            continue;
        }
        if (trimmed.toUpperCase().includes('EXT-X-AD-POD-END') ||
            trimmed.toUpperCase().includes('EXT-X-CUE-IN')) {
            inAdPod        = false;
            skipNextExtinf = false;
            continue;
        }

        /* drop everything inside an ad pod */
        if (inAdPod) continue;
        /* drop ad daterange tags and flag the following segment */
        if (isAdDateRange(trimmed)) {
            skipNextExtinf = true;
            continue;
        }
        /* drop other ad boundary/cue tags */
        if (isAdBoundaryTag(trimmed)) {
            skipNextExtinf = true;
            continue;
        }

        /* drop the EXTINF + segment uri flagged by a preceding ad tag */
        if (skipNextExtinf) {
            if (trimmed.toUpperCase().startsWith('#EXTINF')) {
                continue;
            }
            if (trimmed.length > 0 && !trimmed.startsWith('#')) {
                // this is an ad segment uri — count it
                skipNextExtinf = false;
                blockedCount++;
                continue;
            }
            if (trimmed.startsWith('#') && !trimmed.toUpperCase().startsWith('#EXTINF')) {
                skipNextExtinf = false;
            }
        }
        output.push(line);
    }
    return { playlist: output.join('\n'), blockedCount };
}

module.exports = { filterPlaylist };