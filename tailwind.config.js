/**
 * Tailwind is compiled at build time into `tailwind.css`. It used to be pulled
 * from the CDN at runtime, which meant remote JavaScript executing in the
 * window that holds the IPC bridge.
 *
 * Run `npm run build:css` after changing classes in the files listed below.
 */
module.exports = {
    darkMode: 'class',
    content: [
        './index.html',
        './error.html',
        './more-menu.html',
        './renderer.js',
        './prompts-library.js',
        './prompts-catalog.js'
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
                display: ['"Big Shoulders Display"', 'Impact', 'sans-serif']
            },
            colors: {
                seizia: {
                    DEFAULT: '#0066FF',
                    hover: '#1a75ff'
                },
                zinc: {
                    50: '#f3eee6',
                    100: '#ebe4d4',
                    200: '#d8cfc0',
                    300: '#c4b9a6',
                    400: '#9a9286',
                    500: '#7a7368',
                    600: '#5c564c',
                    700: '#3a3834',
                    750: '#22252b',
                    800: '#2a2d33',
                    850: '#1a1c20',
                    900: '#14161a',
                    950: '#0a0b0d'
                }
            }
        }
    }
};
