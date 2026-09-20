# Instagram Chat Auto-Scroller

Automated tools to scroll to the very top (the beginning) of an Instagram Direct Message conversation via Chrome DevTools Protocol (CDP) and Playwright.

## Features

- **Direct CDP Control (`instagram_scroll_top.mjs`)**: Lightweight Node.js script connecting directly over WebSocket to Chrome's remote debugging port (`ws://127.0.0.1:9222`), dispatching native `Input.dispatchMouseEvent` wheel events to smoothly trigger Instagram's virtualized chat infinite scroll until the header/start of the conversation is reached.
- **Playwright Python (`instagram_scroll_top.py`)**: Python alternative connecting to existing Chrome instance via CDP (`http://127.0.0.1:9222`).
- **Snippet (`scroll_snippet.js`)**: In-browser / evaluation snippet for container scroll detection.

## Setup & Prerequisites

1. Launch Google Chrome with remote debugging enabled:
   ```bash
   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
   ```
2. Navigate to your target conversation on Instagram Web (`https://www.instagram.com/direct/t/...`).

### Running the Node.js CDP Script
```bash
node instagram_scroll_top.mjs
```

### Running the Python Script
```bash
pip install playwright
python3 instagram_scroll_top.py
```
