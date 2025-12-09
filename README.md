// ...existing code...
# Smart Reimbursement Assistant (Plasmo Extension)

Smart Reimbursement Assistant is a Plasmo-based browser extension to assist with fapiao and expense reimbursement workflows. It provides a popup UI for quick entry, content scripts / utilities for data extraction and processing, and an optional local server to handle PDF/OCR workflows.

Quick links
- Repo root: /Users/joeyli/Desktop/extension/smart/smart-reimbursement-assistant
- Extension source: src/
- Local helper server: server/

Prerequisites
- Node.js 18+ (or the version specified in package.json)
- pnpm recommended (npm/yarn supported)
- macOS development: Chrome or Chromium-based browser for loading unpacked extension

Install dependencies (project root)
```bash
pnpm install
# or
npm install
```

Development (extension)
```bash
pnpm dev
# or
npm run dev
```
- This runs the Plasmo dev server and outputs a development build (e.g. build/chrome-mv3-dev).
- Load the unpacked build folder in Chrome at chrome://extensions (enable Developer mode).

Build production bundle
```bash
pnpm build
# or
npm run build
```
- Output: build/<target> — zip that folder for store submission.

Run local helper server (optional)
- The repository includes a simple server in server/ for PDF parsing or other local tasks.
```bash
cd server
pnpm install
# or
npm install
node server.js
# or if package.json has a start script:
npm start
```
- The server.js and pdf.js files are located in the server/ directory. Configure any API keys or ports as needed.

Configuration & credentials
- Store external API keys (OCR, AI services) in environment variables or in the extension options page (do not commit secrets).
- If using the local server, provide keys/ports via environment variables or server config.

Development tips (macOS)
- In Chrome: open chrome://extensions, enable Developer mode, then "Load unpacked" and point to the build/<target> folder.
- Use DevTools for the popup, content script context, and service worker (background) console to debug messages and errors.
- When changing extension source, re-run pnpm dev (or rebuild) and reload the extension in chrome://extensions.

Contributing
- Open issues and PRs. Use topic branches from main and include a short description and repro steps.

License
- MIT (update if your project uses a different license)

Resources
- Plasmo docs: https://docs.plasmo.com/

// ...existing code...