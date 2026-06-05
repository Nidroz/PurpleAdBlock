/**
 * build script: copies the browser-specific manifest and background
 * into the root of the extension folder, so it can be loaded directly.
 *
 * usage:
 *   node build.js firefox
 *   node build.js chromium
 */

const fs= require('fs');
const path = require('path');

const target = process.argv[2];

if (target !== 'firefox' && target !== 'chromium') {
    console.error('usage: node build.js <firefox|chromium>');
    process.exit(1);
}

const ROOT = __dirname;

const files = {
    firefox: {
        manifest: 'manifest.firefox.json',
        background: 'background.firefox.js',
    },
    chromium: {
        manifest: 'manifest.chromium.json',
        background: 'background.chromium.js',
    },
};

const src = files[target];

// copy manifest
fs.copyFileSync(
    path.join(ROOT, src.manifest),
    path.join(ROOT, 'manifest.json')
);

// copy background
fs.copyFileSync(
    path.join(ROOT, src.background),
    path.join(ROOT, 'background.js')
);

console.log(`[build] built for ${target}`);
console.log(`  manifest.json  ← ${src.manifest}`);
console.log(`  background.js  ← ${src.background}`);