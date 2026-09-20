/**
 * instagram_scroll_top.mjs
 *
 * Connects directly to Chrome's Remote Debugging server (ws://127.0.0.1:9222/devtools/browser)
 * via Chrome DevTools Protocol (CDP) using Node's built-in WebSocket.
 *
 * Dispatches native Chromium mouseWheel events (Input.dispatchMouseEvent) over the chat
 * thread to trigger Instagram's virtualized infinite scroll, continuing until
 * the conversation's very first message / profile header is reached.
 *
 * Usage:
 *   node instagram_scroll_top.mjs
 */

const WS_URL = process.env.CDP_WS_URL || 'ws://127.0.0.1:9222/devtools/browser';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class ChromeCDP {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(new Error('WebSocket connection error to ' + this.wsUrl));
      this.ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.id && this.pending.has(data.id)) {
          const { resolve: res, reject: rej } = this.pending.get(data.id);
          this.pending.delete(data.id);
          if (data.error) {
            rej(new Error(data.error.message || JSON.stringify(data.error)));
          } else {
            res(data.result);
          }
        }
      };
    });
  }

  async send(method, params = {}, sessionId = undefined) {
    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) {
      payload.sessionId = sessionId;
    }
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(payload));
    });
  }

  close() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

async function main() {
  console.log(`[+] Connecting to Chrome DevTools server at ${WS_URL}...`);
  const cdp = new ChromeCDP(WS_URL);

  try {
    await cdp.connect();
  } catch (err) {
    console.error(`[-] Could not connect to Chrome at ${WS_URL}.`);
    console.error(`    Ensure remote debugging is enabled on chrome://inspect/#remote-debugging`);
    process.exit(1);
  }

  console.log('[+] Connected to Chrome.');

  // Find Instagram tab
  const { targetInfos } = await cdp.send('Target.getTargets');
  const igTarget = targetInfos.find((t) => t.type === 'page' && t.url.includes('instagram.com'));

  if (!igTarget) {
    console.error('[-] No open Instagram tab found in Chrome.');
    console.error('    Please open an Instagram conversation in Chrome and rerun.');
    cdp.close();
    process.exit(1);
  }

  console.log(`[+] Found Instagram tab: "${igTarget.title}"`);
  console.log(`    URL: ${igTarget.url}`);

  // Attach specifically to the Instagram tab
  const { sessionId } = await cdp.send('Target.attachToTarget', {
    targetId: igTarget.targetId,
    flatten: true,
  });

  console.log('[+] Attached to Instagram tab session.');

  const evaluate = async (expression) => {
    const res = await cdp.send(
      'Runtime.evaluate',
      {
        expression,
        returnByValue: true,
        awaitPromise: true,
      },
      sessionId
    );
    return res.result ? res.result.value : null;
  };

  // Get chat thread center coordinates for native mouseWheel dispatch
  const getThreadCoordinatesExpr = `
    (() => {
      const article = document.querySelector('div[role="article"], div[role="group"]');
      if (article) {
        let curr = article;
        while (curr && curr !== document.body) {
          const s = window.getComputedStyle(curr);
          if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && curr.scrollHeight > curr.clientHeight) {
            const r = curr.getBoundingClientRect();
            return {
              x: Math.round(r.left + r.width / 2),
              y: Math.round(r.top + r.height / 2),
              found: true
            };
          }
          curr = curr.parentElement;
        }
      }
      return { x: 750, y: 400, found: false };
    })()
  `;

  const coords = await evaluate(getThreadCoordinatesExpr);
  console.log(`[+] Chat viewport target: (${coords.x}, ${coords.y})`);
  console.log('[+] Starting native wheel auto-scroll up...');

  // State inspection expression
  const checkChatStateExpr = `
    (() => {
      const articles = Array.from(document.querySelectorAll('div[role="article"]'));
      const textNodes = articles.map(a => a.innerText.trim()).filter(Boolean);
      
      // Look for the profile card / bio at the very beginning of the chat
      const topProfile = Array.from(document.querySelectorAll('div[role="main"] a, div[role="main"] button, div[role="main"] h2'))
        .some(el => {
          const text = (el.innerText || '').toLowerCase();
          return text.includes('view profile') || text.includes('instagram');
        });

      return {
        count: textNodes.length,
        firstMessage: textNodes[0] || '',
        lastMessage: textNodes[textNodes.length - 1] || '',
        topProfileReached: topProfile
      };
    })()
  `;

  let lastFirstMessage = '';
  let unchangedChecks = 0;
  let iteration = 0;
  const MAX_UNCHANGED = 5;

  while (unchangedChecks < MAX_UNCHANGED) {
    iteration++;

    // Dispatch native wheel-up events
    for (let i = 0; i < 3; i++) {
      await cdp.send(
        'Input.dispatchMouseEvent',
        {
          type: 'mouseWheel',
          x: coords.x,
          y: coords.y,
          deltaX: 0,
          deltaY: -800,
        },
        sessionId
      );
      await sleep(150);
    }

    // Wait for Instagram's network response & React rendering
    await sleep(1500);

    const state = await evaluate(checkChatStateExpr);
    if (!state) {
      console.warn('[-] Unable to read chat state. Retrying...');
      await sleep(1000);
      continue;
    }

    const currentFirst = state.firstMessage;
    const preview = currentFirst.replace(/\n/g, ' ').slice(0, 50);

    if (state.topProfileReached) {
      console.log(`\n[✓] Detected top profile card / conversation start header!`);
      break;
    }

    if (currentFirst && currentFirst === lastFirstMessage) {
      unchangedChecks++;
      console.log(
        `[#${iteration}] First message unchanged ("${preview}"). Checking if top reached (${unchangedChecks}/${MAX_UNCHANGED})...`
      );
      await sleep(1000);
    } else {
      unchangedChecks = 0;
      console.log(
        `[#${iteration}] Loaded older messages! Earliest loaded: "${preview}"`
      );
      lastFirstMessage = currentFirst;
    }
  }

  console.log('\n=========================================================');
  console.log('[✓] Successfully reached the very top of the Instagram conversation!');
  console.log('=========================================================');

  cdp.close();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
