const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const APP_URL = process.env.PLAYTEST_URL || 'http://127.0.0.1:3000/';
const DEBUG_PORT = Number(process.env.CHROME_DEBUG_PORT || 9223);
const ROOT_DIR = path.resolve(__dirname, '..');
const ARTIFACT_DIR = path.join(ROOT_DIR, 'playtest-artifacts');
const SNAPSHOT_PROGRESS_MARKS = [18, 35, 55, 75, 90, 95, 97, 98, 99, 100];
const CHROME_PATHS = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
].filter(Boolean);

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findBrowser() {
  const browserPath = CHROME_PATHS.find((candidate) => fs.existsSync(candidate));

  if (!browserPath) {
    throw new Error('Chrome/Edge executable not found. Set CHROME_PATH to run browser playtest.');
  }

  return browserPath;
}

async function fetchJson(url, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      throw new Error(`${url} failed with ${response.status}`);
    }

    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function waitForDevtoolsTarget() {
  const deadline = Date.now() + 10000;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const targets = await fetchJson(`http://127.0.0.1:${DEBUG_PORT}/json/list`, 1000);
      const target = targets.find((entry) => entry.type === 'page' && entry.webSocketDebuggerUrl);

      if (target) {
        return target;
      }
    } catch (error) {
      lastError = error;
    }

    await delay(150);
  }

  throw new Error(`Chrome DevTools target did not start: ${lastError?.message || 'timeout'}`);
}

class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.events = new Map();

    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);

      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);

        if (message.error) {
          reject(new Error(`${message.error.message}: ${message.error.data || ''}`));
        } else {
          resolve(message.result || {});
        }
        return;
      }

      const handlers = this.events.get(message.method) || [];
      handlers.forEach((handler) => handler(message.params || {}));
    });
  }

  ready() {
    if (this.ws.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
  }

  on(method, handler) {
    if (!this.events.has(method)) {
      this.events.set(method, []);
    }

    this.events.get(method).push(handler);
  }

  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;

    this.ws.send(JSON.stringify({ id, method, params }));

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  async evaluate(expression, awaitPromise = true) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue: true,
      userGesture: true
    });

    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || 'Runtime evaluation failed');
    }

    return result.result?.value;
  }

  close() {
    this.ws.close();
  }
}

async function waitFor(client, expression, label, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let lastValue = null;

  while (Date.now() < deadline) {
    lastValue = await client.evaluate(expression);

    if (lastValue) {
      return lastValue;
    }

    await delay(120);
  }

  throw new Error(`Timed out waiting for ${label}. Last value: ${JSON.stringify(lastValue)}`);
}

async function dispatchKey(client, character) {
  await client.evaluate(`(() => {
    const input = document.querySelector('#typingInput');
    if (!input) return false;
    input.focus();
    const event = new KeyboardEvent('keydown', {
      key: ${JSON.stringify(character)},
      bubbles: true,
      cancelable: true
    });
    return input.dispatchEvent(event);
  })()`);
}

async function captureScreenshot(client, filename) {
  const result = await client.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false
  });
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(path.join(ARTIFACT_DIR, filename), Buffer.from(result.data, 'base64'));
}

async function runPlaytest() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

  const browserPath = findBrowser();
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'typerace-playtest-'));
  const browser = spawn(browserPath, [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${profileDir}`,
    '--window-size=1365,768',
    '--no-first-run',
    '--no-default-browser-check',
    '--autoplay-policy=no-user-gesture-required',
    '--disable-background-networking',
    '--disable-extensions',
    'about:blank'
  ], {
    stdio: ['ignore', 'ignore', 'ignore']
  });

  let client = null;
  const consoleMessages = [];
  const pageErrors = [];
  const capturedSnapshots = new Map();

  try {
    const target = await waitForDevtoolsTarget();
    client = new CdpClient(target.webSocketDebuggerUrl);
    await client.ready();

    client.on('Runtime.consoleAPICalled', (event) => {
      const text = (event.args || [])
        .map((arg) => arg.value ?? arg.description ?? '')
        .join(' ');
      consoleMessages.push(`${event.type}: ${text}`);
    });
    client.on('Runtime.exceptionThrown', (event) => {
      pageErrors.push(event.exceptionDetails?.text || event.exceptionDetails?.exception?.description || 'Unknown exception');
    });

    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await client.send('Log.enable');
    await client.send('Network.enable');
    await client.send('Page.navigate', { url: APP_URL });
    await waitFor(client, "document.readyState === 'complete'", 'page load');
    await waitFor(client, "document.querySelector('#menuScreen')?.classList.contains('active')", 'menu screen', 20000);

    await delay(5000);

    await client.evaluate(`(() => {
      const input = document.querySelector('#playerNameInput');
      input.value = 'Codex Driver';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('#createRoomBtn').click();
      return true;
    })()`);

    await waitFor(client, "document.querySelector('#lobbyScreen')?.classList.contains('active')", 'lobby screen', 15000);
    const roomCode = await client.evaluate("document.querySelector('#roomCodeDisplay')?.textContent?.trim()");
    await waitFor(client, "!document.querySelector('#startRaceBtn')?.disabled", 'start button enabled', 15000);

    await client.evaluate("document.querySelector('#startRaceBtn').click()");
    await waitFor(client, "document.querySelector('#gameScreen')?.classList.contains('active')", 'game screen', 15000);
    await waitFor(client, "document.querySelector('#raceStatusLabel')?.textContent?.includes('Balapan Berjalan')", 'race start', 10000);
    await waitFor(client, "document.querySelector('#textToType')?.textContent?.trim()?.length > 0", 'typing text', 10000);

    const startedAt = Date.now();
    let typedChars = 0;

    while (Date.now() - startedAt < 90000) {
      const state = await client.evaluate(`(() => {
        const resultsActive = document.querySelector('#resultsScreen')?.classList.contains('active') || false;
        const current = document.querySelector('#textToType .current')?.textContent || '';
        const progress = Number((document.querySelector('#progressDisplay')?.textContent || '0').replace('%', '')) || 0;
        return { resultsActive, current, progress };
      })()`);

      if (state.resultsActive) {
        break;
      }

      if (!state.current) {
        await delay(100);
        continue;
      }

      await dispatchKey(client, state.current);
      typedChars += 1;
      await delay(12);

      const progress = await client.evaluate("Number((document.querySelector('#progressDisplay')?.textContent || '0').replace('%', '')) || 0");
      const pendingSnapshots = SNAPSHOT_PROGRESS_MARKS.filter((mark) => (
        progress >= mark
        && !capturedSnapshots.has(mark)
      ));

      for (const nextSnapshot of pendingSnapshots) {
        const filename = `race-${nextSnapshot}.png`;
        await captureScreenshot(client, filename);
        capturedSnapshots.set(nextSnapshot, path.join(ARTIFACT_DIR, filename));
      }
    }

    await waitFor(client, "document.querySelector('#resultsScreen')?.classList.contains('active')", 'results screen', 15000);
    await captureScreenshot(client, 'results.png');

    const result = await client.evaluate(`(() => ({
      roomCode: document.querySelector('#roomContextDisplay')?.textContent?.trim() || '',
      results: document.querySelector('#resultsList')?.textContent?.replace(/\\s+/g, ' ').trim() || '',
      progress: document.querySelector('#progressDisplay')?.textContent?.trim() || '',
      routeLogs: ${JSON.stringify(consoleMessages)}.filter((line) => line.includes('Race route source') || line.includes('Generated route rejected')),
      errors: ${JSON.stringify(pageErrors)}
    }))()`);

    return {
      ...result,
      roomCode,
      typedChars,
      midRaceScreenshot: capturedSnapshots.get(18) || null,
      raceScreenshots: Object.fromEntries(capturedSnapshots),
      resultsScreenshot: path.join(ARTIFACT_DIR, 'results.png'),
      consoleErrors: consoleMessages.filter((line) => /error/i.test(line)),
      pageErrors
    };
  } finally {
    client?.close();
    if (browser.exitCode === null) {
      browser.kill();
    }
    try {
      fs.rmSync(profileDir, { recursive: true, force: true });
    } catch (_error) {}
  }
}

runPlaytest()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error(error.stack || error.message || error);
    process.exit(1);
  });
