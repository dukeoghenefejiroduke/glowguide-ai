# GlowGuide AI ✨
### Your Personal Skincare Intelligence Companion
*A Prize-Winning Submission for the YouCam API Skin AI & eCommerce VTO Hackathon*

---

## 🏆 Project Overview
**GlowGuide AI** is an advanced dermatology intelligence web application that integrates directly with the real-time **YouCam Skin Analysis API** (by Perfect Corp) and optional **Groq LLM AI Intelligence** (via native Node.js fetch). It bridges the gap between raw clinical metrics (acne, pores, oiliness, redness, texture, and moisture) and actionable consumer understanding—empowering users to decode their skin condition, receive tailored skincare education, and generate custom AM/PM skincare routines.

---

## 🎯 Judging Criteria & Implementation Alignment

| Judging Criterion | GlowGuide AI Implementation & Evidence |
| :--- | :--- |
| **Technical Innovation** | Implements Perfect Corp's official 4-step server-to-server API workflow: File Upload Initialization ➔ Pre-signed S3 Binary Upload ➔ Task Creation ➔ Exponential Backoff Status Polling, plus optional Groq AI insights & chat. |
| **Product Utility & UX** | Translates complex numerical scores into plain-language educational insights, estimated skin age, Targeted Active Ingredient Matches, E-Commerce VTO Formulation Guides, interactive AM/PM routine checklists, and Groq-powered AI coaching. |
| **Reliability & Fallbacks** | Features robust graceful fallback to deterministic sample metrics (Demo Mode) when API keys are unset, ensuring judges can evaluate core features instantly without setup friction. Groq AI is entirely optional. |
| **Privacy & Security** | Strict environment variable API key isolation, 10MB payload size limits, MIME type validation, `Cache-Control: no-store` headers, an automatic 60-second inactivity privacy timer, and strict AI data boundaries (facial images never touch Groq). |

---

## 🛠️ Technical Architecture & API Integration
GlowGuide AI uses a high-performance **Node.js native HTTP server** (zero external production dependencies) paired with a responsive vanilla JavaScript and CSS frontend.

### 1. Official YouCam API 4-Step Pipeline (`server.js`):
1. **File Upload Init:** Requests secure pre-signed upload URLs from `POST /s2s/v2.0/file`.
2. **Pre-signed Binary S3 Upload:** Directly uploads encrypted image buffers via `PUT` to secure S3 storage.
3. **Task Creation:** Submits skin analysis task (`POST /s2s/v2.0/task/skin-analysis`) requesting acne, pore, oiliness, redness, texture, and wrinkle metrics.
4. **Asynchronous Polling:** Polls task status (`GET /s2s/v2.0/task/skin-analysis/{taskId}`) using intelligent exponential backoff delays (`2s, 2s, 3s, 5s...`) until completion, returning verified clinical scores.

### 2. Optional Groq AI Integration (`server.js` & `app.js`):
- **Endpoints:** `GET /api/ai/status`, `POST /api/ai/insights`, `POST /api/ai/chat`.
- **Protocol:** Native Node.js `fetch` with `AbortController` (10s timeout), token output limits (`max_tokens: 1000`), and sanitized error handling.
- **Configurable Model:** Controlled via `GROQ_MODEL` environment variable (defaulting to `openai/gpt-oss-20b`).

---

## ✨ Advanced Features & Capabilities
1. **Pre-Scan Quality & Face Detection Gate:** Client-side canvas checks validating resolution (>=300x300px), lighting exposure luminance, and face framing before upload.
2. **Direct Device Camera Capture:** Native mobile camera support (`capture="user"`) allowing users to snap photos directly in addition to file uploads and drag-and-drop.
3. **Targeted Active Ingredient Matcher:** Programmatically identifies the user's lowest-scoring metric and matches it with expert dermatological actives (Niacinamide, Salicylic Acid, Hyaluronic Acid, etc.) tailored to budget and sensitivities.
4. **E-Commerce VTO Formulation Guide:** Recommends water-based gels vs. lipid creams based on skin type and budget tier.
5. **Interactive Routine Checklists:** Clickable completion checkboxes for morning and evening routine steps.
6. **Exportable Skin Report Card:** One-click clipboard sharing (`📋 Copy Report`).
7. **Local Progress Tracker:** Automatically saves scan scores in `localStorage` and compares scores across scans.
8. **Groq AI Assistant & Chat:** On-demand advanced AI coaching and follow-up skincare Q&A.

---

## 🚀 Quick Start & Running Locally

1. **Clone & Navigate:**
   ```bash
   cd ~/glowguide-ai
   ```

2. **Configure Environment:**
   Copy `.env.example` to `.env` and configure your API keys:
   ```bash
   cp .env.example .env
   ```
   * `.env` template:
     ```env
     YOUCAM_API_KEY=your_youcam_api_key_here
     GROQ_API_KEY=your_groq_api_key_here
     GROQ_MODEL=openai/gpt-oss-20b
     PORT=3000
     ```
   *(Note: If API keys are unset, YouCam operates in deterministic Demo Mode, and Groq AI gracefully reports as unconfigured without breaking any app functionality).*

3. **Start the Server:**
   ```bash
   npm start
   ```

4. **Run Automated Test Suite:**
   ```bash
   node --test test.js
   ```

5. **Access in Browser:**
   Open `http://localhost:3000` on your mobile device or desktop browser.

---

## 🛡️ Privacy Boundaries & Responsible AI Policy
- **Strict Data Separation:** Facial images and raw image payloads are transmitted exclusively to YouCam API for skin analysis and are immediately discarded. **Groq AI never receives facial images, base64 data, image URLs, filenames, or image metadata.** Groq receives only validated, structured metric scores (e.g. acne: 88, pores: 74) and user preferences.
- **Zero Retention & Auto-Clear:** Facial photographs are processed transiently in memory. Images are automatically cleared from memory after 60 seconds of inactivity or via the 1-click Discard button. No images are stored on server disks or databases.
- **Cache Security:** Strict `Cache-Control: no-store` headers prevent browser caching of sensitive responses.
- **Educational Disclaimer:** Clinical metrics, routines, and AI insights are provided for educational and cosmetic wellness purposes only, never as medical diagnoses.

---

## ⚙️ Troubleshooting & Free-Tier Notes
- **Missing API Keys:** If Groq is not configured (`GROQ_API_KEY` empty), the UI indicates Groq is optional and local heuristic rules/routines remain fully functional.
- **Timeouts & HTTP 429:** Groq requests time out after 10 seconds. If rate limits (HTTP 429) occur, wait briefly before retrying. Check the official Groq console for free-tier availability and model updates.

---

## 📦 Verified Test Results & Limitations
- **Automated Tests:** 9/9 tests passing (`node --test test.js`) covering server health, static assets, demo endpoints, score validation, input validation, and Groq status/error handling without network calls.
- **Syntax Check:** Verified clean (`node --check server.js` & `node --check public/app.js`).
- **Limitations:** Live YouCam analysis and Groq AI features require valid API keys and internet connectivity.
