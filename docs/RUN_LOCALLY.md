How to run Flourish Visual Novel Engine locally (double-click to start)

Goal: Let end users download the ZIP, extract it, and start the app with a single action.

Why this is needed
- Modern browsers block many features when loading files over file://. The production build uses a JavaScript module bundle and expects to be served over HTTP.

What we provide
- start.bat (Windows double-click) — tries to use Node (npx http-server) or Python to serve the `dist/` folder and opens the browser.
- start.ps1 (PowerShell) — an alternative one-click launcher for PowerShell.

How to distribute
1. Zip the project `dist/` folder and the two start scripts (`start.bat` and `start.ps1`) and include this README.
2. Tell users to extract the ZIP and double-click `start.bat` (recommended) or run `.\\
un.ps1` in PowerShell.

Notes & alternatives
- If you prefer not to depend on Node or Python on the user machine, host the `dist/` folder on a static site host (GitHub Pages, Netlify, Vercel). This requires no user setup — they just visit a URL.
- For a fully native single-file executable experience you can bundle a minimal electron wrapper. That requires building an Electron distribution (additional work).

Troubleshooting
- If the browser shows a blank page when double-clicking index.html, that’s expected: the app requires an HTTP server.
- If `start.bat` fails, run `start.ps1` in PowerShell (right-click -> Run with PowerShell) or install Node/Python.

