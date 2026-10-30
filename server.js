import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.YOUCAM_API_KEY || '';
const YOUCAM_BASE_URL = 'https://yce-api-01.makeupar.com';

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1/chat/completions';

const GROQ_SYSTEM_PROMPT = `You are GlowGuide AI, a professional skincare intelligence and cosmetic education assistant.
CRITICAL SCORING & SECURITY INSTRUCTIONS:
1. SCORING DIRECTION: On a 0-100 scale, higher scores (e.g., 80-100) represent better skin health, clarity, and quality, while lower scores (0-60) represent areas needing attention. NEVER interpret a high score as severe acne, damage, or condition severity.
2. ATTRIBUTION: Respect whether the analysis is marked as simulated demo data or live YouCam measurement. If simulated, explicitly state that the advice is an example and not personalized from a real facial analysis.
3. Provide general skincare education and conservative cosmetic guidance only. NEVER provide medical diagnoses or unverified clinical claims. Refer ONLY to metrics present in the supplied analysis record.
4. Keep recommendations concise, practical, and structured: short summary, what metrics can/cannot tell, simple AM routine, simple PM routine, at most 1-2 optional treatments, and a short safety note (mention patch testing).
5. Return a valid JSON object with keys: "summary" (string), "metric_explanations" (array of strings), "am_routine" (array of objects with title and desc), "pm_routine" (array of objects with title and desc), "ingredient_guidance" (string), "safety_notes" (string).`;

const GROQ_CHAT_SYSTEM_PROMPT = `You are GlowGuide AI, a professional skincare intelligence and cosmetic education assistant.
CRITICAL SCORING & SECURITY INSTRUCTIONS:
1. SCORING DIRECTION: On a 0-100 scale, higher scores (80-100) mean better skin health and clarity. Never interpret high scores as severe problems.
2. If context indicates simulated demo data, remind the user that chat responses are based on example data.
3. Provide concise, helpful, and conversational skincare education and conservative cosmetic guidance. Rely ONLY on supplied metrics and preferences. Never provide medical diagnoses.
4. Keep answers short, friendly, and practical. Give a practical next step, at most 1-2 optional treatments when appropriate, and a concise safety note. Do not output raw JSON.`;

const ALLOWED_METRIC_TYPES = new Set([
  'all', 'acne', 'pore', 'oiliness', 'redness', 'texture', 'moisture', 'wrinkle',
  'surface_smoothness', 'pore_refinement', 'sebum_and_oil_balance', 'tone_and_redness',
  'blemish_and_acne_control', 'firmness_and_elasticity', 'skin_age', 'resize_image'
]);
const ALLOWED_SKIN_TYPES = new Set(['balanced', 'dry', 'oily', 'combination', 'sensitive']);
const ALLOWED_CONCERNS = new Set(['glow', 'acne', 'anti-aging', 'hydration', 'texture']);
const ALLOWED_BUDGETS = new Set(['accessible', 'mid', 'premium']);
const ALLOWED_FRAGRANCE = new Set(['fragrance-free', 'light-fragrance']);
const ALLOWED_SENSITIVITIES = new Set(['none', 'sensitive', 'retinol-sensitive']);
const ALLOWED_COMPLEXITIES = new Set(['simple', 'comprehensive']);

function sanitizeString(str, maxLength = 500) {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, maxLength);
}

const analysisRecords = new Map();
const MAX_ANALYSIS_RECORDS = 100;

function storeAnalysisRecord(record) {
  if (analysisRecords.size >= MAX_ANALYSIS_RECORDS) {
    const oldestKey = analysisRecords.keys().next().value;
    analysisRecords.delete(oldestKey);
  }
  const analysisId = 'rec_' + Math.random().toString(36).substring(2, 12) + '_' + Date.now();
  analysisRecords.set(analysisId, {
    ...record,
    createdAt: Date.now()
  });
  return analysisId;
}

function getAnalysisRecord(analysisId) {
  if (!analysisId || typeof analysisId !== 'string') return null;
  const record = analysisRecords.get(analysisId);
  if (!record) return null;
  if (Date.now() - record.createdAt > 3600000) { // 1 hour expiry
    analysisRecords.delete(analysisId);
    return null;
  }
  return record;
}

function validateInsightsPayload(payload, serverHasApiKey) {
  if (!payload || typeof payload !== 'object') return { valid: false, error: 'Invalid request body.' };
  let { metrics, skinType, concern, budget, fragrance, sensitivity, complexity, isDemo, analysisId } = payload;

  let verifiedIsDemo = serverHasApiKey ? !!isDemo : true;
  let metricsToUse = metrics;

  if (analysisId) {
    const record = getAnalysisRecord(analysisId);
    if (record) {
      verifiedIsDemo = record.isDemo;
      if (Array.isArray(record.metrics) && record.metrics.length > 0) {
        metricsToUse = record.metrics;
      }
    } else {
      return { valid: false, error: 'Invalid, expired, or unknown analysis identifier.' };
    }
  }

  if (!Array.isArray(metricsToUse) || metricsToUse.length === 0 || metricsToUse.length > 20) {
    return { valid: false, error: 'Metrics must be a non-empty array of up to 20 items.' };
  }

  const sanitizedMetrics = [];
  for (const m of metricsToUse) {
    if (!m || typeof m !== 'object' || typeof m.type !== 'string' || !ALLOWED_METRIC_TYPES.has(m.type)) {
      return { valid: false, error: `Invalid or unsupported metric type: ${m?.type}` };
    }
    const scoreVal = m.ui_score !== undefined ? m.ui_score : (m.score !== undefined ? m.score : m.raw_score);
    if (scoreVal !== undefined && scoreVal !== null) {
      if (typeof scoreVal !== 'number' || isNaN(scoreVal) || scoreVal < 0 || scoreVal > 100) {
        return { valid: false, error: `Invalid metric score range (must be 0-100): ${scoreVal}` };
      }
    }
    sanitizedMetrics.push({ type: m.type, score: scoreVal !== undefined ? scoreVal : null });
  }

  return {
    valid: true,
    data: {
      metrics: sanitizedMetrics,
      skinType: ALLOWED_SKIN_TYPES.has(skinType) ? skinType : 'balanced',
      concern: ALLOWED_CONCERNS.has(concern) ? concern : 'glow',
      budget: ALLOWED_BUDGETS.has(budget) ? budget : 'accessible',
      fragrance: ALLOWED_FRAGRANCE.has(fragrance) ? fragrance : 'fragrance-free',
      sensitivity: ALLOWED_SENSITIVITIES.has(sensitivity) ? sensitivity : 'none',
      complexity: ALLOWED_COMPLEXITIES.has(complexity) ? complexity : 'simple',
      isDemo: verifiedIsDemo
    }
  };
}

function validateChatPayload(payload, serverHasApiKey) {
  if (!payload || typeof payload !== 'object') return { valid: false, error: 'Invalid request body.' };
  const { messages, context, isDemo, analysisId } = payload;

  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 20) {
    return { valid: false, error: 'Messages must be a non-empty array of up to 20 items.' };
  }

  const sanitizedMessages = [];
  for (const msg of messages) {
    if (!msg || typeof msg !== 'object') {
      return { valid: false, error: 'Invalid message object.' };
    }
    const role = msg.role === 'assistant' ? 'assistant' : 'user';
    const content = sanitizeString(msg.content, 500);
    if (!content) {
      return { valid: false, error: 'Message content cannot be empty.' };
    }
    sanitizedMessages.push({ role, content });
  }

  let verifiedIsDemo = serverHasApiKey ? !!isDemo : true;
  if (analysisId) {
    const record = getAnalysisRecord(analysisId);
    if (record) {
      verifiedIsDemo = record.isDemo;
    } else {
      return { valid: false, error: 'Invalid, expired, or unknown analysis identifier.' };
    }
  }

  return {
    valid: true,
    data: {
      messages: sanitizedMessages,
      context: context && typeof context === 'object' ? context : null,
      isDemo: verifiedIsDemo
    }
  };
}

async function callGroqApi(messages) {
  if (!GROQ_API_KEY) {
    throw new Error('Groq AI is not configured on this server.');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

  try {
    const response = await fetch(GROQ_BASE_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: messages,
        temperature: 0.3,
        max_tokens: 2048
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('Groq AI rate limit exceeded (HTTP 429). Please try again shortly.');
      } else if (response.status === 401 || response.status === 403) {
        throw new Error('Groq AI authentication failed. Check server configuration.');
      } else if (response.status >= 500) {
        throw new Error('Groq AI service is currently unavailable. Please try again later.');
      } else {
        throw new Error(`Groq AI request failed (HTTP ${response.status}).`);
      }
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('Invalid response received from Groq AI.');
    }
    return content;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('Groq AI request timed out. Please try again.');
    }
    throw err;
  }
}

// MIME types for static assets
const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// Sample demo data for hackathon judges when API key is not set or demo mode is selected
const DEMO_RESPONSE = {
  isDemo: true,
  message: "Showing simulated demo analysis (YouCam API key not configured or demo mode active).",
  data: {
    task_id: "demo-task-12345",
    task_status: "success",
    results: {
      output: [
        { type: "all", ui_score: 82, raw_score: 81.5, skin_age: 26 },
        { type: "acne", ui_score: 88, raw_score: 87.2, description: "Minimal blemishes detected" },
        { type: "pore", ui_score: 74, raw_score: 72.8, description: "Moderate pore visibility around T-zone" },
        { type: "oiliness", ui_score: 78, raw_score: 76.5, description: "Balanced sebum levels with mild T-zone shine" },
        { type: "redness", ui_score: 85, raw_score: 84.1, description: "Even skin tone with slight cheek flush" },
        { type: "texture", ui_score: 80, raw_score: 79.3, description: "Smooth overall texture with minor micro-unevenness" },
        { type: "moisture", ui_score: 76, raw_score: 75.0, description: "Good hydration; slight dryness on outer cheeks" }
      ]
    }
  }
};

function getDeterministicDemoResponse(skinType = 'balanced', goal = 'glow') {
  let baseScore = 82;
  let acneScore = 88;
  let poreScore = 74;
  let oilScore = 78;
  let moistureScore = 76;

  if (skinType === 'oily') { baseScore = 78; oilScore = 68; }
  if (skinType === 'dry') { baseScore = 76; moistureScore = 65; }
  if (skinType === 'sensitive') { baseScore = 79; }

  if (goal === 'acne') acneScore = 72;
  if (goal === 'pore') poreScore = 69;
  if (goal === 'hydration') moistureScore = 68;

  return {
    isDemo: true,
    message: `Showing deterministic demo analysis for skinType: ${skinType}, goal: ${goal}.`,
    data: {
      task_id: `demo-task-${skinType}-${goal}-999`,
      task_status: "success",
      results: {
        output: [
          { type: "all", ui_score: baseScore, raw_score: baseScore - 0.5, skin_age: skinType === 'dry' ? 29 : 25 },
          { type: "acne", ui_score: acneScore, raw_score: acneScore - 0.5, description: "Blemish & oil analysis completed" },
          { type: "pore", ui_score: poreScore, raw_score: poreScore - 0.5, description: "Pore density and visibility assessment" },
          { type: "oiliness", ui_score: oilScore, raw_score: oilScore - 0.5, description: "Sebum regulation across facial zones" },
          { type: "redness", ui_score: 85, raw_score: 84.1, description: "Capillary and tone evaluation" },
          { type: "texture", ui_score: 80, raw_score: 79.3, description: "Micro-texture and smoothness score" },
          { type: "moisture", ui_score: moistureScore, raw_score: moistureScore - 0.5, description: "Epidermal hydration levels" }
        ]
      }
    }
  };
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // CORS & Privacy headers: ensure zero caching of sensitive data
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API Routes
  if (pathname === '/api/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      app: 'GlowGuide AI',
      hasApiKey: !!API_KEY,
      groqConfigured: !!GROQ_API_KEY,
      version: '1.0.0'
    }));
    return;
  }

  if (pathname === '/api/demo' && req.method === 'GET') {
    const skinType = parsedUrl.searchParams.get('skinType') || 'balanced';
    const concern = parsedUrl.searchParams.get('concern') || 'glow';
    const demoResp = getDeterministicDemoResponse(skinType, concern);
    const analysisId = storeAnalysisRecord({
      isDemo: true,
      results: demoResp.data.results,
      skinType,
      concern,
      metrics: demoResp.data.results?.output || []
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ...demoResp, analysisId }));
    return;
  }

  if (pathname === '/api/image-proxy' && req.method === 'GET') {
    const imageUrl = parsedUrl.searchParams.get('url');
    if (!imageUrl) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing image URL parameter.' }));
      return;
    }

    let parsedImageUrl;
    try {
      parsedImageUrl = new URL(imageUrl);
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid image URL format.' }));
      return;
    }

    const allowedHostPatterns = [
      /\.makeupar\.com$/i,
      /\.amazonaws\.com$/i,
      /yce-api-01\.makeupar\.com$/i
    ];

    const isHostAllowed = allowedHostPatterns.some(pattern => pattern.test(parsedImageUrl.hostname));
    if (parsedImageUrl.protocol !== 'https:' || !isHostAllowed) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden: Image URL domain or protocol not permitted.' }));
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const proxyRes = await fetch(imageUrl, {
        method: 'GET',
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!proxyRes.ok) {
        res.writeHead(proxyRes.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Failed to fetch external image (HTTP ${proxyRes.status})` }));
        return;
      }

      const contentType = proxyRes.headers.get('content-type') || 'image/jpeg';
      if (!contentType.startsWith('image/')) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid content type returned from remote URL.' }));
        return;
      }

      const arrayBuffer = await proxyRes.arrayBuffer();
      if (arrayBuffer.byteLength > 15 * 1024 * 1024) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Proxy payload too large (>15MB).' }));
        return;
      }

      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-store, no-cache, must-revalidate'
      });
      res.end(Buffer.from(arrayBuffer));
    } catch (err) {
      clearTimeout(timeoutId);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.name === 'AbortError' ? 'Image fetch timed out.' : 'Failed to retrieve image.' }));
    }
    return;
  }

  if (pathname === '/api/ai/status' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      configured: !!GROQ_API_KEY,
      model: GROQ_MODEL
    }));
    return;
  }

  if (pathname === '/api/ai/insights' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1 * 1024 * 1024) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Payload too large.' }));
        req.destroy();
      }
    });

    req.on('end', async () => {
      try {
        if (!GROQ_API_KEY) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Groq AI is not configured on this server.' }));
          return;
        }

        let payload;
        try {
          payload = JSON.parse(body);
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON payload.' }));
          return;
        }

        const validation = validateInsightsPayload(payload, !!API_KEY);
        if (!validation.valid) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: validation.error }));
          return;
        }

        const userPrompt = JSON.stringify(validation.data);

        const rawContent = await callGroqApi([
          { role: 'system', content: GROQ_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ]);

        let parsedJson = null;
        try {
          let cleanContent = rawContent.trim();
          if (cleanContent.startsWith('```')) {
            cleanContent = cleanContent.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
          }
          try {
            parsedJson = JSON.parse(cleanContent);
          } catch (e1) {
            const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            if (jsonMatch && jsonMatch[1]) {
              parsedJson = JSON.parse(jsonMatch[1].trim());
            } else {
              const firstBrace = rawContent.indexOf('{');
              const lastBrace = rawContent.lastIndexOf('}');
              if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                let subStr = rawContent.substring(firstBrace, lastBrace + 1);
                try {
                  parsedJson = JSON.parse(subStr);
                } catch (e2) {
                  if (!subStr.endsWith('}')) {
                    subStr = subStr.replace(/,\s*$/, '') + '}';
                  }
                  parsedJson = JSON.parse(subStr);
                }
              } else {
                throw new Error('No JSON structure found');
              }
            }
          }
        } catch (parseErr) {
          parsedJson = {
            summary: rawContent.replace(/```(?:json)?[\s\S]*?```/g, '').trim() || "Personalized analysis generated.",
            metric_explanations: [],
            am_routine: [
              { title: "Gentle Cleanser", desc: "Use a gentle, fragrance-free cleanser." },
              { title: "Moisturizer & SPF", desc: "Hydrate and protect against UV rays." }
            ],
            pm_routine: [
              { title: "Gentle Cleanser", desc: "Remove impurities and sunscreen." },
              { title: "Nourishing Night Cream", desc: "Support barrier recovery overnight." }
            ],
            ingredient_guidance: "Consult product labels and patch test new actives.",
            safety_notes: "General cosmetic guidance. Consult a dermatologist for persistent issues."
          };
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, provider: 'Groq', model: GROQ_MODEL, data: parsedJson }));

      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message || 'Internal server error during Groq AI generation.' }));
      }
    });
    return;
  }

  if (pathname === '/api/ai/chat' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1 * 1024 * 1024) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Payload too large.' }));
        req.destroy();
      }
    });

    req.on('end', async () => {
      try {
        if (!GROQ_API_KEY) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Groq AI is not configured on this server.' }));
          return;
        }

        let payload;
        try {
          payload = JSON.parse(body);
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON payload.' }));
          return;
        }

        const validation = validateChatPayload(payload, !!API_KEY);
        if (!validation.valid) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: validation.error }));
          return;
        }

        const { messages, context } = validation.data;

        const chatMessages = [
          { role: 'system', content: GROQ_CHAT_SYSTEM_PROMPT + (context ? `\n\nUser Context & Metrics:\n${JSON.stringify(context)}` : '') },
          ...messages.map(m => ({ role: m.role, content: m.content }))
        ];

        const reply = await callGroqApi(chatMessages);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, reply }));

      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message || 'Internal server error during Groq AI chat.' }));
      }
    });
    return;
  }

  if (pathname === '/api/analyze' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      // Safety limit: 15MB max body size
      if (body.length > 15 * 1024 * 1024) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Payload too large (max 10MB image).' }));
        req.destroy();
      }
    });

    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { image, filename, demoMode, skinType, concern } = data;

        if (!image) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No image data provided.' }));
          return;
        }

        if (demoMode || !API_KEY) {
          const demoResp = getDeterministicDemoResponse(skinType, concern);
          const analysisId = storeAnalysisRecord({
            isDemo: true,
            results: demoResp.data.results,
            skinType: skinType || 'balanced',
            concern: concern || 'glow',
            metrics: demoResp.data.results?.output || []
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ...demoResp, analysisId }));
          return;
        }

        // Extract base64 buffer
        const matches = image.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
        if (!matches) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid image format. Expected base64 data URL.' }));
          return;
        }

        const contentType = matches[1];
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, 'base64');
        const fileSize = buffer.length;
        const safeFilename = filename || 'skin-photo.jpg';

        if (fileSize > 10 * 1024 * 1024) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Image file size exceeds 10MB limit.' }));
          return;
        }

        console.log(`[YouCam API] Step 1: Initializing file upload for ${safeFilename} (${fileSize} bytes)...`);

        // Step 1: Initialize file upload
        const initRes = await fetch(`${YOUCAM_BASE_URL}/s2s/v2.0/file`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            files: [{
              content_type: contentType,
              file_name: safeFilename,
              file_size: fileSize
            }]
          })
        });

        const initJson = await initRes.json();
        console.log(`[YouCam API] Init response status: ${initRes.status}, file_id received: ${!!initJson.data?.files?.[0]?.file_id}`);

        if (!initRes.ok || !initJson.data || !initJson.data.files || !initJson.data.files[0]) {
          throw new Error(initJson.message || `Failed to initialize file upload (status ${initRes.ok ? initRes.status : initRes.status})`);
        }

        const fileInfo = initJson.data.files[0];
        const fileId = fileInfo.file_id;

        // YouCam may return the signed upload URL in requests[0].url.
        const uploadRequest = fileInfo.requests?.find(
          request => request.method === 'PUT' && request.url
        );
        const uploadUrl = fileInfo.upload_url || uploadRequest?.url;
        const uploadHeaders = uploadRequest?.headers || {};

        if (!fileId || !uploadUrl) {
          throw new Error('YouCam upload initialization did not return a file ID and signed upload URL.');
        }

        console.log(`[YouCam API] Step 2: Uploading image to pre-signed URL (file_id: ${fileId})...`);

        // Step 2: Upload binary image to pre-signed S3 URL
        const uploadRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            ...uploadHeaders,
            'Content-Type': contentType,
            'Content-Length': fileSize.toString()
          },
          body: buffer
        });

        if (!uploadRes.ok) {
          throw new Error(`Failed to upload image binary to S3 storage (HTTP ${uploadRes.status})`);
        }

        console.log('[YouCam API] Step 3: Creating skin analysis task...');

        // Step 3: Create AI Skin Analysis Task
        const taskRes = await fetch(`${YOUCAM_BASE_URL}/s2s/v2.0/task/skin-analysis`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            src_file_id: fileId,
            dst_actions: [
              "acne", "dark_circle_v2", "droopy_lower_eyelid", "droopy_upper_eyelid",
              "eye_bag", "firmness", "moisture", "oiliness", "pore", "radiance",
              "redness", "age_spot", "texture", "wrinkle", "skin_type", "tear_trough"
            ],
            miniserver_args: {
              enable_mask_overlay: true
            },
            format: "json",
            pf_camera_kit: false
          })
        });

        const taskJson = await taskRes.json();
        console.log(`[YouCam API] Task response status: ${taskRes.status}, task_id received: ${!!taskJson.data?.task_id}`);

        if (!taskRes.ok || !taskJson.data || !taskJson.data.task_id) {
          throw new Error(taskJson.message || 'Failed to create skin analysis task.');
        }

        const taskId = taskJson.data.task_id;
        console.log(`[YouCam API] Step 4: Polling task status for taskId: ${taskId}...`);

        // Step 4: Poll task status with exponential backoff (up to 15 attempts)
        const backoffDelays = [2000, 2000, 3000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000];
        let pollAttempts = 0;
        let taskCompleted = false;
        let finalResult = null;

        while (pollAttempts < backoffDelays.length && !taskCompleted) {
          const delay = backoffDelays[pollAttempts];
          pollAttempts++;
          await new Promise(r => setTimeout(r, delay));

          const pollRes = await fetch(`${YOUCAM_BASE_URL}/s2s/v2.0/task/skin-analysis/${taskId}`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${API_KEY}`
            }
          });

          const pollJson = await pollRes.json();
          console.log(`[Poll ${pollAttempts}] Status:`, pollJson.data?.task_status);

          if (pollJson.data?.task_status === 'success') {
            taskCompleted = true;
            finalResult = pollJson.data;
            break;
          } else if (
            ['error', 'failed'].includes(pollJson.data?.task_status) ||
            pollJson.status >= 400 ||
            pollRes.status >= 400
          ) {
            const details = {
              http_status: pollRes.status,
              api_status: pollJson.status,
              task_status: pollJson.data?.task_status,
              error_code: pollJson.error_code || pollJson.data?.error_code,
              error: pollJson.error || pollJson.data?.error,
              error_message: pollJson.error_message || pollJson.data?.error_message,
              failure_reason: pollJson.data?.failure_reason,
              message: pollJson.message
            };

            console.error('[YouCam API] Task failed:', JSON.stringify(details));
            throw new Error(
              details.error_message ||
              details.failure_reason ||
              details.message ||
              details.error ||
              details.error_code ||
              `YouCam task failed (HTTP ${pollRes.status}).`
            );
          }
        }

        if (!taskCompleted || !finalResult) {
          throw new Error('Skin analysis task timed out. Please try again or use demo mode.');
        }

        const analysisId = storeAnalysisRecord({
          isDemo: false,
          results: finalResult,
          skinType: skinType || 'balanced',
          concern: concern || 'glow',
          metrics: finalResult.results?.output || []
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ isDemo: false, data: finalResult, analysisId }));

      } catch (err) {
        console.error('[API Error]', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: err.message || 'Internal server error during analysis.',
          fallbackDemoAvailable: true
        }));
      }
    });
    return;
  }

  // Static File Serving
  let filePath = path.join(__dirname, 'public', pathname === '/' ? 'index.html' : pathname);

  // Security check: prevent directory traversal
  if (!filePath.startsWith(path.join(__dirname, 'public'))) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end('<h1>404 Not Found - GlowGuide AI</h1><p><a href="/">Return Home</a></p>');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✨ GlowGuide AI server running at http://localhost:${PORT}`);
  console.log(`🔑 YouCam API Key configured: ${API_KEY ? 'Yes (Live API active)' : 'No (Demo mode fallback active)'}`);
});
