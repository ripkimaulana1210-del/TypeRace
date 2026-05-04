const { spawn } = require('child_process');
const net = require('net');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const RECORD_SEPARATOR = String.fromCharCode(30);
const SERVER_START_TIMEOUT_MS = 8000;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

function splitPayload(text) {
  return String(text || '').split(RECORD_SEPARATOR).filter(Boolean);
}

function parseEnginePacket(packet) {
  if (!packet) {
    return null;
  }

  const engineType = packet[0];

  if (engineType === '0') {
    return {
      engineType,
      open: JSON.parse(packet.slice(1)),
      raw: packet
    };
  }

  if (engineType !== '4') {
    return {
      engineType,
      raw: packet
    };
  }

  const socketPacket = packet.slice(1);
  const socketType = socketPacket[0];
  const jsonIndexes = ['[', '{']
    .map((character) => socketPacket.indexOf(character))
    .filter((index) => index >= 0);
  const jsonIndex = jsonIndexes.length ? Math.min(...jsonIndexes) : -1;

  return {
    engineType,
    socketType,
    id: jsonIndex > 1 ? socketPacket.slice(1, jsonIndex) : '',
    data: jsonIndex >= 0 ? JSON.parse(socketPacket.slice(jsonIndex)) : null,
    raw: packet
  };
}

function eventName(packet) {
  return packet?.socketType === '2' && Array.isArray(packet.data)
    ? packet.data[0]
    : null;
}

function ackId(packet) {
  return packet?.socketType === '3' ? packet.id : null;
}

class PollingSocket {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.sid = null;
    this.socketId = null;
    this.ackId = 1;
    this.consumedPackets = [];
  }

  async request(method, pathName, body) {
    const response = await fetch(`${this.baseUrl}${pathName}`, {
      method,
      headers: body === undefined
        ? undefined
        : { 'Content-Type': 'text/plain;charset=UTF-8' },
      body
    });
    const text = await response.text();

    if (!response.ok) {
      throw new Error(`${method} ${pathName} failed with ${response.status}: ${text}`);
    }

    return text;
  }

  async connect() {
    const openText = await this.request(
      'GET',
      `/socket.io/?EIO=4&transport=polling&t=${Date.now()}`
    );
    const openPacket = parseEnginePacket(splitPayload(openText)[0]);

    if (!openPacket?.open?.sid) {
      throw new Error(`Socket.IO polling handshake failed: ${openText}`);
    }

    this.sid = openPacket.open.sid;
    await this.post('40');
    const connectPacket = await this.pollUntil(
      (packet) => packet.socketType === '0',
      'socket namespace connect'
    );
    this.socketId = connectPacket.data?.sid || null;
  }

  async post(payload) {
    return this.request(
      'POST',
      `/socket.io/?EIO=4&transport=polling&sid=${encodeURIComponent(this.sid)}&t=${Date.now()}`,
      payload
    );
  }

  async poll() {
    const text = await this.request(
      'GET',
      `/socket.io/?EIO=4&transport=polling&sid=${encodeURIComponent(this.sid)}&t=${Date.now()}`
    );
    const packets = splitPayload(text).map(parseEnginePacket).filter(Boolean);
    this.consumedPackets.push(...packets);
    return packets;
  }

  async pollUntil(predicate, label, timeoutMs = 8000) {
    const existingPacket = this.consumedPackets.find(predicate);

    if (existingPacket) {
      return existingPacket;
    }

    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const packets = await this.poll();
      const packet = packets.find(predicate);

      if (packet) {
        return packet;
      }

      await delay(50);
    }

    const seen = this.consumedPackets
      .map((packet) => packet.raw || packet.engineType)
      .join(' | ');
    throw new Error(`Timed out waiting for ${label}. Seen packets: ${seen}`);
  }

  async emit(event, ...args) {
    await this.post(`42${JSON.stringify([event, ...args])}`);
  }

  async emitWithAck(event, ...args) {
    const id = String(this.ackId);
    this.ackId += 1;

    await this.post(`42${id}${JSON.stringify([event, ...args])}`);
    const packet = await this.pollUntil(
      (candidate) => ackId(candidate) === id,
      `${event} ack`
    );
    const response = packet.data?.[0];

    if (!response?.success) {
      throw new Error(`${event} failed: ${JSON.stringify(response)}`);
    }

    return response;
  }

  async emitKeyText(text) {
    const characters = Array.from(text);

    for (let index = 0; index < characters.length; index += 25) {
      const payload = characters
        .slice(index, index + 25)
        .map((char) => `42${JSON.stringify(['keyTyped', { char }])}`)
        .join(RECORD_SEPARATOR);

      await this.post(payload);
      await delay(8);
    }
  }
}

async function waitForServer(baseUrl, child) {
  const deadline = Date.now() + SERVER_START_TIMEOUT_MS;
  let lastError = null;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited before ready with code ${child.exitCode}`);
    }

    try {
      const response = await fetch(`${baseUrl}/`);

      if (response.ok) {
        return;
      }
    } catch (error) {
      lastError = error;
    }

    await delay(150);
  }

  throw new Error(`Server did not start in time: ${lastError?.message || 'timeout'}`);
}

function stopServer(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve();
      return;
    }

    const timer = setTimeout(() => {
      if (child.exitCode === null) {
        child.kill();
      }
      resolve();
    }, 2500);

    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill('SIGINT');
  });
}

async function runSmoke(baseUrl) {
  const host = new PollingSocket(baseUrl);
  const guest = new PollingSocket(baseUrl);
  const circuit = { id: 'smoke-track', trackLength: 300, lapCount: 2 };

  await host.connect();
  await guest.connect();

  const createdRoom = await host.emitWithAck('createRoom', 'Smoke Host', circuit);
  const roomCode = createdRoom.roomCode;

  await guest.emitWithAck('joinRoom', roomCode, 'Smoke Guest', circuit);
  await host.pollUntil(
    (packet) => eventName(packet) === 'roomUpdated'
      && (packet.data?.[1]?.players || []).length === 2,
    'roomUpdated with two players'
  );

  await host.emit('startRace', roomCode, circuit);

  const countdownPacket = await host.pollUntil(
    (packet) => eventName(packet) === 'countdownStart',
    'countdownStart',
    6000
  );
  const raceText = countdownPacket.data?.[1]?.text || '';
  const raceCircuit = countdownPacket.data?.[1]?.circuit || {};

  if (raceText.length < 50) {
    throw new Error(`Race text is missing or too short: ${raceText.length}`);
  }

  if (raceCircuit.lapCount !== 2) {
    throw new Error(`Race lap count was not preserved: ${JSON.stringify(raceCircuit)}`);
  }

  await host.pollUntil(
    (packet) => eventName(packet) === 'raceStart',
    'raceStart',
    6000
  );

  await host.emitKeyText(raceText);

  const finishedPacket = await host.pollUntil(
    (packet) => eventName(packet) === 'raceFinished',
    'raceFinished after first player completes',
    10000
  );
  const results = finishedPacket.data?.[1]?.results || [];
  const hostResult = results.find((player) => player.name === 'Smoke Host');
  const guestResult = results.find((player) => player.name === 'Smoke Guest');

  if (results.length !== 2 || !hostResult || !guestResult) {
    throw new Error(`Unexpected race results: ${JSON.stringify(results)}`);
  }

  if (hostResult.position !== 1 || hostResult.progress !== 100) {
    throw new Error(`Host should win with 100% progress: ${JSON.stringify(hostResult)}`);
  }

  if (guestResult.progress >= 100) {
    throw new Error(`Guest should be ranked unfinished: ${JSON.stringify(guestResult)}`);
  }

  await host.emit('leaveRoom');
  await guest.emit('leaveRoom');

  return {
    roomCode,
    raceTextLength: raceText.length,
    results
  };
}

async function main() {
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      PORT: String(port)
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stdout = '';
  let stderr = '';

  server.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });
  server.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  try {
    await waitForServer(baseUrl, server);
    const result = await runSmoke(baseUrl);
    console.log(`Smoke test passed on ${baseUrl}`);
    console.log(`Room ${result.roomCode}, text length ${result.raceTextLength}, players ${result.results.length}`);
  } catch (error) {
    error.message += `\n\nServer stdout:\n${stdout || '(empty)'}\nServer stderr:\n${stderr || '(empty)'}`;
    throw error;
  } finally {
    await stopServer(server);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
