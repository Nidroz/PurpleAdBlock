/** @type {import('tailwindcss').Config} */
module.exports = {
    // only scan popup files so the output stays minimal
    content: ['./popup/**/*.html', './popup/**/*.js'],
    theme: {
        extend: {
            colors: {
                // twitch-inspired palette
                purple: {
                    DEFAULT: '#9147ff',
                    dark:    '#772ce8',
                    dim:     'rgba(145,71,255,0.12)',
                },
                twitch: {
                    bg:      '#0e0e10',
                    card:    '#18181b',
                    hover:   '#1f1f23',
                    border:  '#2a2a2e',
                    text:    '#efeff1',
                    muted:   '#adadb8',
                },
                status: {
                    online:  '#00c853',
                    offline: '#ff4444',
                },
            },
            fontFamily: {
                sans: ['Inter', 'ui-sans-serif', 'system-ui'],
                mono: ['"Space Mono"', 'ui-monospace'],
            },
            width:  { popup: '280px' },
            borderRadius: { card: '10px' },
        },
    },
    plugins: [],
};