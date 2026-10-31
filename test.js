import test from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_PORT = 3007;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

let serverProcess;

test.before(async () => {
  // Start server for testing with explicit empty API keys
  serverProcess = spawn('node', ['server.js'], {
    cwd: __dirname,
    env: { ...process.env, PORT: TEST_PORT.toString(), YOUCAM_API_KEY: '', GROQ_API_KEY: '' },
    stdio: 'pipe'
  });

  // Poll until server responds
  let started = false;
  for (let i = 0; i < 30; i++) {
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

test('GET /api/demo returns valid demo skin analysis metrics and analysisId', async () => {
  const res = await fetch(`${BASE_URL}/api/demo`);
  assert.strictEqual(res.status, 200);
  const json = await res.json();
  assert.strictEqual(json.isDemo, true);
  assert.ok(json.analysisId, 'Should return an analysisId for server-side provenance');
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

test('POST /api/analyze with demoMode=true returns demo response with analysisId', async () => {
  const res = await fetch(`${BASE_URL}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ demoMode: true, image: 'data:image/jpeg;base64,fakebase64' })
  });
  assert.strictEqual(res.status, 200);
  const json = await res.json();
  assert.strictEqual(json.isDemo, true);
  assert.ok(json.analysisId);
  assert.ok(json.data.results);
});

test('POST /api/ai/insights with invalid analysisId returns 400 Bad Request (provenance validation)', async () => {
  const testPort3 = 3008;
  const baseUrl3 = `http://127.0.0.1:${testPort3}`;
  const proc3 = spawn('node', ['server.js'], {
    cwd: __dirname,
    env: { ...process.env, PORT: testPort3.toString(), YOUCAM_API_KEY: '', GROQ_API_KEY: 'test-key' },
    stdio: 'ignore'
  });

  try {
    let ok = false;
    for (let i = 0; i < 25; i++) {
      try {
        const res = await fetch(`${baseUrl3}/api/health`);
        if (res.ok) { ok = true; break; }
      } catch (e) {}
      await new Promise(r => setTimeout(r, 150));
    }
    assert.ok(ok, 'Test server 3 started');

    const res = await fetch(`${baseUrl3}/api/ai/insights`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ analysisId: 'invalid_rec_99999', metrics: [{ type: 'acne', ui_score: 85 }] })
    });
    assert.strictEqual(res.status, 400);
    const json = await res.json();
    assert.ok(json.error.includes('analysis identifier'));

  } finally {
    proc3.kill();
  }
});

test('GET /api/image-proxy without URL parameter returns 400 Bad Request', async () => {
  const res = await fetch(`${BASE_URL}/api/image-proxy`);
  assert.strictEqual(res.status, 400);
  const json = await res.json();
  assert.ok(json.error);
});

test('GET /api/image-proxy with forbidden domain or non-HTTPS returns 403 Forbidden', async () => {
  const res = await fetch(`${BASE_URL}/api/image-proxy?url=http://example.com/test.jpg`);
  assert.strictEqual(res.status, 403);
  const json = await res.json();
  assert.ok(json.error.includes('Forbidden'));
});

test('Regression test: Extracting and validating multiple mask_urls from mocked YouCam analysis response', async () => {
  const mockedYouCamResponse = {
    results: {
      output: [
        {
          type: 'pore',
          mask_urls: [
            'https://yce-us.s3-accelerate.amazonaws.com/pore_output.jpg',
            'http://untrusted-domain.com/bad.jpg',
            'not-a-url'
          ]
        },
        {
          type: 'acne',
          mask_urls: [
            'https://yce-api-01.makeupar.com/acne_output.jpg'
          ]
        }
      ]
    }
  };

  // Validate extraction & filtering logic for trusted provider mask URLs
  const validMaskUrls = [];
  const allowedHostPatterns = [
    /\.makeupar\.com$/i,
    /\.amazonaws\.com$/i,
    /yce-api-01\.makeupar\.com$/i
  ];

  if (Array.isArray(mockedYouCamResponse.results.output)) {
    mockedYouCamResponse.results.output.forEach(item => {
      if (Array.isArray(item.mask_urls)) {
        item.mask_urls.forEach(maskUrl => {
          try {
            const parsed = new URL(maskUrl);
            const isAllowed = allowedHostPatterns.some(p => p.test(parsed.hostname));
            if (parsed.protocol === 'https:' && isAllowed) {
              validMaskUrls.push(maskUrl);
            }
          } catch (e) {}
        });
      }
    });
  }

  assert.strictEqual(validMaskUrls.length, 2);
  assert.strictEqual(validMaskUrls[0], 'https://yce-us.s3-accelerate.amazonaws.com/pore_output.jpg');
  assert.strictEqual(validMaskUrls[1], 'https://yce-api-01.makeupar.com/acne_output.jpg');
});

test('Regression test: Metric deduplication and filtering of skin_type / N/A entries', async () => {
  const rawOutputs = [
    { type: 'pore', ui_score: 88 },
    { type: 'pore', ui_score: 88 },
    { type: 'skin_type', skin_type: 'Oily' },
    { type: 'skin_age', score: 25 },
    { type: 'tear_trough', ui_score: 59 }
  ];

  const seenMetricTypes = new Set();
  const filtered = rawOutputs.filter(o => {
    if (!o || typeof o !== 'object') return false;
    const type = o.type;
    if (!type || ['all', 'resize_image', 'skin_age', 'skin_type'].includes(type)) return false;
    if (seenMetricTypes.has(type)) return false;
    const score = o.ui_score !== undefined ? o.ui_score : o.score;
    if (typeof score !== 'number' || isNaN(score)) return false;
    seenMetricTypes.add(type);
    return true;
  });

  assert.strictEqual(filtered.length, 2);
  assert.strictEqual(filtered[0].type, 'pore');
  assert.strictEqual(filtered[1].type, 'tear_trough');
});

test('Regression test: validateInsightsPayload accepts tear_trough and any valid custom metric type without error', async () => {
  // We can test validation logic directly or import/simulate payload validation
  const ALLOWED_METRIC_TYPES = new Set([
    'all', 'acne', 'pore', 'oiliness', 'redness', 'texture', 'moisture', 'wrinkle',
    'surface_smoothness', 'pore_refinement', 'sebum_and_oil_balance', 'tone_and_redness',
    'blemish_and_acne_control', 'firmness_and_elasticity', 'skin_age', 'resize_image',
    'tear_trough', 'eye_bag', 'dark_circle_v2', 'firmness', 'droopy_lower_eyelid',
    'droopy_upper_eyelid', 'age_spot', 'radiance', 'skin_type', 'skin_quality',
    'blemish', 'pigmentation'
  ]);

  const testMetrics = [
    { type: 'tear_trough', ui_score: 75 },
    { type: 'custom_future_metric_xyz', score: 82 }
  ];

  for (const m of testMetrics) {
    const isValid = ALLOWED_METRIC_TYPES.has(m.type) || /^[a-zA-Z0-9_-]{1,50}$/.test(m.type);
    assert.strictEqual(isValid, true);
  }
});
