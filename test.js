import test from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_PORT = 3005;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

let serverProcess;

test.before(async () => {
  // Start server for testing
  serverProcess = spawn('node', ['server.js'], {
    cwd: __dirname,
    env: { ...process.env, PORT: TEST_PORT.toString(), YOUCAM_API_KEY: '' },
    stdio: 'ignore'
  });

  // Poll until server responds
  let started = false;
  for (let i = 0; i < 25; i++) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.ok) {
        started = true;
        break;
      }
    } catch (e) {
      // ignore
    }
    await new Promise(r => setTimeout(r, 200));
  }

  if (!started) {
    throw new Error('Test server failed to start within timeout.');
  }
});

test.after(() => {
  if (serverProcess) {
    serverProcess.kill();
  }
});

test('GET /api/health returns ok status', async () => {
  const res = await fetch(`${BASE_URL}/api/health`);
  assert.strictEqual(res.status, 200);
  const json = await res.json();
  assert.strictEqual(json.status, 'ok');
  assert.strictEqual(json.app, 'GlowGuide AI');
  assert.strictEqual(typeof json.hasApiKey, 'boolean');
});

test('GET /api/demo returns valid demo skin analysis metrics', async () => {
  const res = await fetch(`${BASE_URL}/api/demo`);
  assert.strictEqual(res.status, 200);
  const json = await res.json();
  assert.strictEqual(json.isDemo, true);
  assert.ok(json.data.results.output.length > 0);
  const overall = json.data.results.output.find(o => o.type === 'all');
  assert.ok(overall);
  assert.strictEqual(typeof overall.ui_score, 'number');
});

test('GET / serves index.html successfully', async () => {
  const res = await fetch(`${BASE_URL}/`);
  assert.strictEqual(res.status, 200);
  const text = await res.text();
  assert.ok(text.includes('GlowGuide AI'));
  assert.ok(text.includes('YouCam'));
});

test('GET /style.css serves CSS stylesheet', async () => {
  const res = await fetch(`${BASE_URL}/style.css`);
  assert.strictEqual(res.status, 200);
  const type = res.headers.get('content-type');
  assert.ok(type.includes('text/css'));
});

test('GET /app.js serves frontend application JavaScript', async () => {
  const res = await fetch(`${BASE_URL}/app.js`);
  assert.strictEqual(res.status, 200);
  const type = res.headers.get('content-type');
  assert.ok(type.includes('javascript'));
});

test('GET /nonexistent returns 404 Not Found', async () => {
  const res = await fetch(`${BASE_URL}/nonexistent-route-12345`);
  assert.strictEqual(res.status, 404);
});

test('POST /api/analyze without image returns 400 Bad Request', async () => {
  const res = await fetch(`${BASE_URL}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ demoMode: false, image: '' })
  });
  assert.strictEqual(res.status, 400);
  const json = await res.json();
  assert.ok(json.error);
});

test('GET /api/demo with skinType=dry and concern=hydration returns customized demo metrics', async () => {
  const res = await fetch(`${BASE_URL}/api/demo?skinType=dry&concern=hydration`);
  assert.strictEqual(res.status, 200);
  const json = await res.json();
  assert.strictEqual(json.isDemo, true);
  assert.ok(json.message.includes('dry'));
  const overall = json.data.results.output.find(o => o.type === 'all');
  assert.strictEqual(typeof overall.ui_score, 'number');
});

test('GET /api/ai/status reports configuration status correctly', async () => {
  const res = await fetch(`${BASE_URL}/api/ai/status`);
  assert.strictEqual(res.status, 200);
  const json = await res.json();
  assert.strictEqual(json.configured, false);
  assert.strictEqual(typeof json.model, 'string');
});

test('POST /api/ai/insights without Groq configured returns 503 Service Unavailable', async () => {
  const res = await fetch(`${BASE_URL}/api/ai/insights`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ metrics: [] })
  });
  assert.strictEqual(res.status, 503);
  const json = await res.json();
  assert.ok(json.error);
});

test('POST /api/ai/insights validation with mocked GROQ_API_KEY returns 400 for invalid metrics', async () => {
  const testPort2 = 3006;
  const baseUrl2 = `http://127.0.0.1:${testPort2}`;
  const proc2 = spawn('node', ['server.js'], {
    cwd: __dirname,
    env: { ...process.env, PORT: testPort2.toString(), YOUCAM_API_KEY: '', GROQ_API_KEY: 'test-key' },
    stdio: 'ignore'
  });

  try {
    let ok = false;
    for (let i = 0; i < 20; i++) {
      try {
        const res = await fetch(`${baseUrl2}/api/health`);
        if (res.ok) { ok = true; break; }
      } catch (e) {}
      await new Promise(r => setTimeout(r, 150));
    }
    assert.ok(ok, 'Secondary test server started');

    const res1 = await fetch(`${baseUrl2}/api/ai/insights`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metrics: [] })
    });
    assert.strictEqual(res1.status, 400);

    const res2 = await fetch(`${baseUrl2}/api/ai/insights`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metrics: [{ type: 'acne', ui_score: 150 }] })
    });
    assert.strictEqual(res2.status, 400);

    const res3 = await fetch(`${baseUrl2}/api/ai/insights`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metrics: [{ type: 'unknown_metric', ui_score: 80 }] })
    });
    assert.strictEqual(res3.status, 400);

  } finally {
    proc2.kill();
  }
});

test('POST /api/ai/chat without Groq configured returns 503 Service Unavailable', async () => {
  const res = await fetch(`${BASE_URL}/api/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [] })
  });
  assert.strictEqual(res.status, 503);
  const json = await res.json();
  assert.ok(json.error);
});

test('POST /api/analyze with demoMode=true returns demo response', async () => {
  const res = await fetch(`${BASE_URL}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ demoMode: true, image: 'data:image/jpeg;base64,fakebase64' })
  });
  assert.strictEqual(res.status, 200);
  const json = await res.json();
  assert.strictEqual(json.isDemo, true);
  assert.ok(json.data.results);
});
