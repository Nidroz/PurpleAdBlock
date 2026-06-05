// run this while watching a twitch stream with an ad playing:
// node debug-hls.js <m3u8_url>
// get the url from devtools > network > filter ".m3u8"

const https = require('https');

const url = process.argv[2];
if (!url) {
    console.error('usage: node debug-hls.js <m3u8_url>');
    process.exit(1);
}

https.get(url, {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Origin': 'https://www.twitch.tv',
        'Referer': 'https://www.twitch.tv/',
    }
}, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        console.log('=== RAW PLAYLIST ===');
        console.log(data);
        console.log('=== AD-RELATED LINES ===');
        data.split('\n').forEach((line, i) => {
            const upper = line.toUpperCase();
            if (upper.includes('AD') || upper.includes('CUE') || upper.includes('SCTE') ||
                upper.includes('DATERANGE') || upper.includes('DISCONTINUITY')) {
                console.log(`line ${i}: ${line}`);
            }
        });
    });
}).on('error', e => console.error(e.message));