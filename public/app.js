document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');
  const cameraInput = document.getElementById('camera-input');
  const selectFileBtn = document.getElementById('select-file-btn');
  const takeCameraBtn = document.getElementById('take-camera-btn');
  const demoModeBtn = document.getElementById('demo-mode-btn');
  const uploadPromptContent = document.getElementById('upload-prompt-content');
  const previewContainer = document.getElementById('preview-container');
  const imagePreview = document.getElementById('image-preview');
  const fileNameSpan = document.getElementById('file-name');
  const removeFileBtn = document.getElementById('remove-file-btn');
  const consentCheckbox = document.getElementById('consent-checkbox');
  const analyzeBtn = document.getElementById('analyze-btn');
  const skinTypeSelect = document.getElementById('skin-type-select');
  const primaryConcern = document.getElementById('primary-concern');

  // Screens
  const uploadSection = document.getElementById('upload-section');
  const loadingSection = document.getElementById('loading-section');
  const dashboardSection = document.getElementById('dashboard-section');

  // Loading elements
  const loadingImage = document.getElementById('loading-image');
  const loadingTitle = document.getElementById('loading-title');
  const loadingStepText = document.getElementById('loading-step-text');
  const progressFill = document.getElementById('progress-fill');

  // Dashboard elements
  const demoBanner = document.getElementById('demo-banner');
  const overallScoreVal = document.getElementById('overall-score-val');
  const skinAgeVal = document.getElementById('skin-age-val');
  const summaryNarrative = document.getElementById('summary-narrative');
  const metricsGrid = document.getElementById('metrics-grid');
  const analysisTimestamp = document.getElementById('analysis-timestamp');
  const newAnalysisBtn = document.getElementById('new-analysis-btn');
  const copyReportBtn = document.getElementById('copy-report-btn');
  const discardPhotoBtn = document.getElementById('discard-photo-btn');
  const progressText = document.getElementById('progress-text');

  // Routine elements
  const tabBtns = document.querySelectorAll('.tab-btn');
  const routineAmContent = document.getElementById('routine-am-content');
  const routinePmContent = document.getElementById('routine-pm-content');

  // Modal elements
  const privacyLink = document.getElementById('privacy-link');
  const privacyModal = document.getElementById('privacy-modal');
  const closeModal = document.getElementById('close-modal');
  const acceptModal = document.getElementById('accept-modal');

  let selectedFileBase64 = null;
  let selectedFileName = '';
  let analysisResultData = null;

  // Event Listeners for File Selection & Camera Capture
  selectFileBtn.addEventListener('click', () => fileInput.click());
  takeCameraBtn.addEventListener('click', () => cameraInput.click());

  dropzone.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
  });

  cameraInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
  });

  // Drag and drop
  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    }, false);
  });

  dropzone.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  removeFileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    resetUploadState();
  });

  consentCheckbox.addEventListener('change', updateAnalyzeButtonState);

  function handleFile(file) {
    // Validate type
    if (!['image/jpeg', 'image/png', 'image/jpg'].includes(file.type)) {
      alert('Please upload a valid JPEG or PNG image file.');
      return;
    }
    // Validate size (<10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert('File size exceeds 10MB limit. Please choose a smaller image.');
      return;
    }

    selectedFileName = file.name;
    const reader = new FileReader();
    reader.onload = (e) => {
      selectedFileBase64 = e.target.result;
      imagePreview.src = selectedFileBase64;
      loadingImage.src = selectedFileBase64;
      fileNameSpan.textContent = selectedFileName;
      uploadPromptContent.classList.add('hidden');
      previewContainer.classList.remove('hidden');

      // Run pre-scan quality gate
      const testImg = new Image();
      testImg.onload = () => {
        runPreScanQualityGate(testImg, (passed) => {
          updateAnalyzeButtonState();
        });
      };
      testImg.src = selectedFileBase64;
    };
    reader.readAsDataURL(file);
  }

  function runPreScanQualityGate(img, callback) {
    const qualityCard = document.getElementById('quality-gate-card');
    const qualityChecks = document.getElementById('quality-gate-checks');
    if (!qualityCard || !qualityChecks) return;

    qualityCard.classList.remove('hidden');

    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;

    // 1. Resolution Check
    const isResolutionValid = width >= 300 && height >= 300;

    // 2. Lighting & Exposure Check via Canvas
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 100;
    canvas.height = 100;
    ctx.drawImage(img, 0, 0, 100, 100);
    const imgData = ctx.getImageData(0, 0, 100, 100).data;

    let totalLuminance = 0;
    for (let i = 0; i < imgData.length; i += 4) {
      const r = imgData[i], g = imgData[i+1], b = imgData[i+2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      totalLuminance += lum;
    }
    const avgLuminance = totalLuminance / (100 * 100);
    const isLightingValid = avgLuminance >= 30 && avgLuminance <= 240;

    // 3. Central Region / Face Presence Heuristic
    let skinPixelCount = 0;
    let centralSamples = 0;
    for (let y = 30; y < 70; y++) {
      for (let x = 30; x < 70; x++) {
        const idx = (y * 100 + x) * 4;
        const r = imgData[idx], g = imgData[idx+1], b = imgData[idx+2];
        if (r > 50 && g > 30 && b > 15 && r > g && r > b && Math.abs(r - g) > 10) {
          skinPixelCount++;
        }
        centralSamples++;
      }
    }
    const skinRatio = skinPixelCount / centralSamples;
    const isFaceFramed = skinRatio >= 0.12;

    qualityChecks.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <span>📏 Resolution (${width}x${height}px)</span>
        <span style="color: ${isResolutionValid ? '#059669' : '#dc2626'}; font-weight: 600;">${isResolutionValid ? '✓ Passed' : '⚠️ Low Resolution'}</span>
      </div>
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <span>💡 Lighting & Exposure (${Math.round(avgLuminance)}/255)</span>
        <span style="color: ${isLightingValid ? '#059669' : '#d97706'}; font-weight: 600;">${isLightingValid ? '✓ Balanced' : (avgLuminance < 30 ? '⚠️ Too Dark (Move to light)' : '⚠️ Overexposed')}</span>
      </div>
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <span>👤 Face Framing & Center Check</span>
        <span style="color: ${isFaceFramed ? '#059669' : '#d97706'}; font-weight: 600;">${isFaceFramed ? '✓ Centered & Detected' : '⚠️ Adjust Face Framing'}</span>
      </div>
    `;

    const isValid = isResolutionValid && isLightingValid;
    if (callback) callback(isValid);
  }

  function isValidScore(val) {
    return typeof val === 'number' && !isNaN(val) && val >= 0 && val <= 100;
  }

  function getValidScore(metric) {
    if (!metric) return null;
    if (isValidScore(metric.ui_score)) return metric.ui_score;
    if (isValidScore(metric.raw_score)) return Math.round(metric.raw_score);
    return null;
  }

  function resetUploadState() {
    selectedFileBase64 = null;
    selectedFileName = '';
    analysisResultData = null;
    fileInput.value = '';
    if (typeof cameraInput !== 'undefined' && cameraInput) cameraInput.value = '';
    if (imagePreview) imagePreview.src = '';
    if (loadingImage) loadingImage.src = '';
    uploadPromptContent.classList.remove('hidden');
    previewContainer.classList.add('hidden');
    const qualityCard = document.getElementById('quality-gate-card');
    if (qualityCard) qualityCard.classList.add('hidden');
    updateAnalyzeButtonState();
  }

  function updateAnalyzeButtonState() {
    if (selectedFileBase64 && consentCheckbox.checked) {
      analyzeBtn.removeAttribute('disabled');
    } else {
      analyzeBtn.setAttribute('disabled', 'true');
    }
  }

  // Demo mode button
  demoModeBtn.addEventListener('click', () => {
    runAnalysis(true);
  });

  // Analyze button (Live API or Fallback)
  analyzeBtn.addEventListener('click', () => {
    runAnalysis(false);
  });

  async function runAnalysis(isDemo) {
    // Switch to loading screen
    uploadSection.classList.remove('active');
    loadingSection.classList.add('active');

    // Simulate progress animation steps
    let progress = 10;
    progressFill.style.width = `${progress}%`;
    loadingStepText.textContent = isDemo ? 'Loading YouCam AI demo dataset...' : 'Initializing file upload with YouCam API...';

    const steps = [
      { p: 35, text: isDemo ? 'Processing facial landmarks...' : 'Uploading encrypted image to S3 storage...' },
      { p: 65, text: 'Running YouCam AI skin metrics analysis...' },
      { p: 90, text: 'Synthesizing skincare intelligence & routine...' }
    ];

    let stepIdx = 0;
    const progressInterval = setInterval(() => {
      if (stepIdx < steps.length) {
        progress = steps[stepIdx].p;
        progressFill.style.width = `${progress}%`;
        loadingStepText.textContent = steps[stepIdx].text;
        stepIdx++;
      }
    }, 700);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: selectedFileBase64 || 'data:image/jpeg;base64,/9j/4AAQSkZJRg...',
          filename: selectedFileName || 'skin-photo.jpg',
          skinType: skinTypeSelect.value,
          concern: primaryConcern.value,
          demoMode: isDemo
        })
      });

      const result = await response.json();
      clearInterval(progressInterval);
      progressFill.style.width = '100%';

      if (!response.ok) {
        throw new Error(result.error || 'Server error during analysis.');
      }

      analysisResultData = result;

      setTimeout(() => {
        loadingSection.classList.remove('active');
        renderDashboard(result);
        dashboardSection.classList.add('active');
      }, 500);

    } catch (err) {
      clearInterval(progressInterval);
      console.error(err);
      alert(`Analysis Error: ${err.message}\nReturning to main screen.`);

      loadingSection.classList.remove('active');
      dashboardSection.classList.remove('active');
      uploadSection.classList.add('active');
      resetUploadState();
    }
  }

  function renderDashboard(result) {
    // Privacy Auto-Discard Inactivity Timer (60s inactivity memory/reference clear)
    if (window._autoDiscardTimer) clearTimeout(window._autoDiscardTimer);

    function resetAndRedirectToUpload() {
      selectedFileBase64 = null;
      selectedFileName = '';
      analysisResultData = null;
      if (imagePreview) imagePreview.src = '';
      if (loadingImage) loadingImage.src = '';
      resetUploadState();
      dashboardSection.classList.remove('active');
      uploadSection.classList.add('active');
    }

    function resetInactivityTimer() {
      if (window._autoDiscardTimer) clearTimeout(window._autoDiscardTimer);
      window._autoDiscardTimer = setTimeout(() => {
        if (dashboardSection.classList.contains('active')) {
          resetAndRedirectToUpload();
          alert('🔒 Privacy Auto-Discard: Image reference cleared from local application state and preview after 60 seconds of inactivity.');
        }
      }, 60000); // 60 seconds inactivity
    }

    resetInactivityTimer();
    const activityEvents = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    activityEvents.forEach(evt => {
      window.removeEventListener(evt, window._inactivityHandler);
    });
    window._inactivityHandler = () => {
      if (dashboardSection.classList.contains('active')) {
        resetInactivityTimer();
      }
    };
    activityEvents.forEach(evt => {
      window.addEventListener(evt, window._inactivityHandler);
    });

    const isDemo = result.isDemo;
    if (isDemo) {
      demoBanner.classList.remove('hidden');
    } else {
      demoBanner.classList.add('hidden');
    }

    const outputs = (result.data && result.data.results && Array.isArray(result.data.results.output)) ? result.data.results.output : [];

    // Find overall score and skin age with strict validation
    const overallObj = outputs.find(o => o.type === 'all') || outputs[0] || {};
    const overallScore = isValidScore(overallObj.ui_score) ? overallObj.ui_score : (isValidScore(overallObj.raw_score) ? Math.round(overallObj.raw_score) : null);
    const skinAge = (overallObj.skin_age !== undefined && typeof overallObj.skin_age === 'number' && !isNaN(overallObj.skin_age)) ? overallObj.skin_age : null;

    overallScoreVal.textContent = overallScore !== null ? overallScore : 'N/A';
    skinAgeVal.textContent = skinAge !== null ? skinAge : 'N/A';

    // Local Progress Tracker via localStorage (persisted in browser storage)
    if (progressText) {
      if (overallScore !== null) {
        const lastScore = localStorage.getItem('glowguide_last_score');
        if (lastScore) {
          const diff = overallScore - parseInt(lastScore, 10);
          if (diff > 0) {
            progressText.textContent = `📈 +${diff} pts since last scan (Stored locally)`;
          } else if (diff < 0) {
            progressText.textContent = `📉 ${diff} pts since last scan (Stored locally)`;
          } else {
            progressText.textContent = `⚖️ Score stable since last scan (Stored locally)`;
          }
        } else {
          progressText.textContent = `📈 Baseline Scan Saved (Stored locally)`;
        }
        localStorage.setItem('glowguide_last_score', overallScore.toString());
      } else {
        progressText.textContent = `📈 Score Unavailable`;
      }
    }

    // Update score ring gradient
    const ring = document.querySelector('.score-ring');
    if (ring) {
      if (overallScore !== null) {
        ring.style.background = `conic-gradient(var(--primary) 0% ${overallScore}%, #e2e8f0 ${overallScore}% 100%)`;
      } else {
        ring.style.background = `conic-gradient(#cbd5e1 0% 100%, #e2e8f0 0% 100%)`;
      }
    }

    // Narrative based on score
    if (overallScore !== null) {
      if (overallScore >= 80) {
        summaryNarrative.textContent = "Your skin displays wonderful balance and clarity. Maintain current hydration habits while focusing on targeted protection.";
      } else if (overallScore >= 65) {
        summaryNarrative.textContent = "Your skin is in moderate condition with minor areas of congestion or dryness. A consistent targeted routine will yield rapid improvement.";
      } else {
        summaryNarrative.textContent = "Your skin shows signs of fatigue and barrier stress. Focus on gentle cleansing, soothing hydration, and daily SPF protection.";
      }
    } else {
      summaryNarrative.textContent = "Skin score currently unavailable from analysis data.";
    }

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (isDemo) {
      analysisTimestamp.textContent = `Simulated Demo Analysis via YouCam API (${timeStr})`;
    } else {
      analysisTimestamp.textContent = `Analyzed via YouCam API at ${timeStr} (Live Result)`;
    }

    // Render metrics grid
    metricsGrid.innerHTML = '';
    outputs.forEach(metric => {
      if (metric.type === 'all') return; // skip overall in individual grid

      const score = isValidScore(metric.ui_score) ? metric.ui_score : (isValidScore(metric.raw_score) ? Math.round(metric.raw_score) : null);
      const badgeColor = score !== null ? (score >= 80 ? 'var(--success)' : score >= 70 ? 'var(--warning)' : 'var(--danger)') : '#94a3b8';
      const badgeBg = score !== null ? (score >= 80 ? '#d1fae5' : score >= 70 ? '#fef3c7' : '#fee2e2') : '#f1f5f9';
      const scoreDisplay = score !== null ? `${score}/100` : 'N/A';
      const barWidth = score !== null ? score : 0;

      const metricSourceLabel = isDemo
        ? `<span style="font-size: 10px; color: #b45309; background: #fef3c7; padding: 2px 6px; border-radius: 4px; margin-left: 6px; font-weight: 500;">Simulated Metric</span>`
        : `<span style="font-size: 10px; color: #047857; background: #d1fae5; padding: 2px 6px; border-radius: 4px; margin-left: 6px; font-weight: 500;">YouCam API Metric</span>`;

      const descSourceLabel = `<span style="font-size: 10px; color: #3b82f6; background: #eff6ff; padding: 2px 6px; border-radius: 4px; margin-left: 6px; font-weight: 500;">GlowGuide Interpretation</span>`;

      const rawDesc = metric.description || getDefaultDescription(metric.type, score !== null ? score : 75);
      const cleanDesc = rawDesc.replace(/\[GlowGuide Score Interpretation\]/g, '').trim();

      const card = document.createElement('div');
      card.className = 'metric-card';
      card.innerHTML = `
        <div class="metric-header">
          <span class="metric-title">${getMetricIcon(metric.type)} ${formatMetricName(metric.type)} ${metricSourceLabel}</span>
          <span class="metric-score-badge" style="background: ${badgeBg}; color: ${badgeColor}">${scoreDisplay}</span>
        </div>
        <div class="metric-bar-track">
          <div class="metric-bar-fill" style="width: ${barWidth}%; background: ${badgeColor}"></div>
        </div>
        <p class="metric-desc">${cleanDesc} ${descSourceLabel}</p>
      `;
      metricsGrid.appendChild(card);
    });

    // Render Active Ingredient Matcher
    const ingredientContent = document.getElementById('ingredient-match-content');
    const ecommerceGuideContent = document.getElementById('ecommerce-guide-content');

    const budget = document.getElementById('budget-select')?.value || 'accessible';
    const fragrance = document.getElementById('fragrance-pref')?.value || 'fragrance-free';
    const sensitivity = document.getElementById('sensitivity-pref')?.value || 'none';
    const complexity = document.getElementById('complexity-pref')?.value || 'simple';

    if (ingredientContent) {
      const validOutputs = outputs.filter(o => o.type !== 'all' && getValidScore(o) !== null);
      validOutputs.sort((a, b) => getValidScore(a) - getValidScore(b));
      const lowest = validOutputs[0] || null;

      const budgetLabels = {
        accessible: 'Accessible / Drugstore ($ - Budget Friendly)',
        mid: 'Mid-Range ($$ - Balanced Value)',
        premium: 'Clinical / Advanced ($$$ - Specialized Formulations)'
      };

      const recommendations = {
        pore: { active: 'Niacinamide (Vitamin B3) 5-10%', benefit: 'Regulates sebum production, tightens enlarged pores, and reinforces skin barrier resilience.', productType: 'Lightweight Serum or Toner' },
        acne: { active: sensitivity === 'retinol-sensitive' ? 'Azelaic Acid 10% (Gentle Alternative)' : 'Salicylic Acid (BHA) 2%', benefit: 'Penetrates oil glands to dissolve dead skin cells, clear congestion, and prevent active breakouts.', productType: 'Blemish Treatment Gel' },
        moisture: { active: 'Hyaluronic Acid & Ceramides', benefit: 'Draws ambient moisture deep into epidermal layers while repairing the lipid moisture barrier.', productType: 'Hydrating Essence & Barrier Cream' },
        redness: { active: 'Centella Asiatica & Green Tea Extract', benefit: 'Instantly calms capillary reactivity, reduces flush, and soothes inflammation.', productType: 'Calming Gel Cream' },
        texture: { active: sensitivity === 'sensitive' ? 'PHA (Gluconolactone) - Gentle Exfoliant' : 'Gentle Lactic Acid (AHA)', benefit: 'Encourages gentle cellular turnover for smoother surface micro-texture without irritation.', productType: 'Exfoliating Night Serum' },
        oiliness: { active: 'Zinc PCA & Niacinamide', benefit: 'Balances T-zone sebum production and reduces shine throughout the day.', productType: 'Oil-Free Mattifying Gel' }
      };

      if (!lowest) {
        ingredientContent.innerHTML = `<p style="margin: 0; color: #6b7280;">No valid metric scores available for active ingredient targeting.</p>`;
      } else {
        const lowestScore = getValidScore(lowest);
        const rec = recommendations[lowest.type] || recommendations.pore;
        const sensitivityNote = sensitivity !== 'none' ? `<p style="margin: 6px 0 0 0; font-size: 12px; color: #b45309; background: #fef3c7; padding: 6px 10px; border-radius: 6px;">⚠️ <strong>Sensitivity Caution:</strong> Formulated with ${sensitivity === 'retinol-sensitive' ? 'acid-safe alternative actives' : 'extra-gentle barrier support'} to prevent reactivity.</p>` : '';
        const fragranceNote = fragrance === 'fragrance-free' ? ' • 🌿 100% Fragrance-Free' : '';
        const targetScoreDisplay = lowestScore !== null ? `${lowestScore}/100` : 'N/A';

        ingredientContent.innerHTML = `
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
              <span style="font-weight: 600; color: #065f46;">🎯 Primary Target: ${formatMetricName(lowest.type)} (${targetScoreDisplay})${fragranceNote}</span>
              <span style="background: #ffffff; padding: 4px 10px; border-radius: 8px; border: 1px solid #a7f3d0; font-size: 12px; font-weight: 600; color: #047857;">Tier: ${budgetLabels[budget]}</span>
            </div>
            <p style="margin: 0; color: #064e3b;"><strong>Recommended Active:</strong> ${rec.active}</p>
            <p style="margin: 0; color: #374151; font-size: 13px;">${rec.benefit}</p>
            ${sensitivityNote}
            <p style="margin: 4px 0 0 0; font-size: 11px; color: #6b7280; font-style: italic;">Disclaimer: Cosmetic wellness guidance only. Not a medical diagnosis. Individual results vary.</p>
          </div>
        `;
      }
    }

    if (ecommerceGuideContent) {
      ecommerceGuideContent.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <p style="margin: 0; color: #1e3a8a;"><strong>Selected VTO Profile:</strong> ${complexity === 'simple' ? 'Essential 3-Step Routine' : 'Comprehensive Multi-Step Regimen'} | <strong>Budget:</strong> ${budget.toUpperCase()}</p>
          <p style="margin: 0; font-size: 13px; color: #334155;">When selecting skincare formulations online, match your skin type (${skinTypeSelect.value}) with water-based gels for oily zones or lipid-rich creams for dry areas. Always patch-test new active ingredients for 24-48 hours prior to full facial application.</p>
        </div>
      `;
    }

    // Render personalized routines
    renderRoutines(skinTypeSelect.value, primaryConcern.value, outputs, complexity, fragrance);

    // Check Groq status
    checkGroqStatus();
  }

  function formatMetricName(type) {
    const names = {
      acne: 'Blemish & Acne Control',
      pore: 'Pore Refinement',
      oiliness: 'Sebum & Oil Balance',
      redness: 'Tone & Redness',
      texture: 'Surface Smoothness',
      moisture: 'Hydration Level',
      wrinkle: 'Firmness & Elasticity'
    };
    return names[type] || type;
  }

  function getMetricIcon(type) {
    const icons = {
      acne: '🌿',
      pore: '🔍',
      oiliness: '💧',
      redness: '🌸',
      texture: '✨',
      moisture: '🌊',
      wrinkle: '⚡'
    };
    return icons[type] || '📊';
  }

  function getDefaultDescription(type, score) {
    const descriptions = {
      acne: score > 80 ? 'Minimal blemishes detected. Clear and calm surface.' : 'Slight breakout activity detected around stress zones.',
      pore: score > 80 ? 'Pores are tight and refined across facial zones.' : 'Moderate pore enlargement observed around the nose and T-zone.',
      oiliness: score > 80 ? 'Balanced lipid barrier with healthy sebum regulation.' : 'Slight excess shine detected in T-zone area.',
      redness: score > 80 ? 'Even skin tone with minimal capillary reactivity.' : 'Mild transient redness detected on cheeks.',
      texture: score > 80 ? 'Exceptionally smooth micro-texture and cellular renewal.' : 'Minor unevenness in skin texture detected.',
      moisture: score > 80 ? 'Optimal skin hydration and moisture retention.' : 'Mild dehydration detected on outer facial contours.'
    };
    const text = descriptions[type] || 'Clinical analysis completed successfully.';
    return `[GlowGuide Score Interpretation] ${text}`;
  }

  function renderRoutines(skinType, goal, outputs, complexity = 'simple', fragrance = 'fragrance-free') {
    const isFragranceFree = fragrance === 'fragrance-free';
    const tag = isFragranceFree ? ' (Preference: Fragrance-Free Formulation)' : '';

    let amSteps = [
      { num: 1, title: 'Gentle Hydrating Cleanser' + tag, desc: 'Use a pH-balanced, non-stripping cleanser suited for ' + skinType + ' skin.' },
      { num: 2, title: 'Targeted Serum / Antioxidant', desc: 'Apply Vitamin C or niacinamide to protect against environmental stressors.' },
      { num: 3, title: 'Broad-Spectrum SPF 30+', desc: 'Essential daily protection to preserve skin health and prevent photo-aging.' }
    ];

    if (complexity === 'comprehensive') {
      amSteps.splice(2, 0, { num: 3, title: 'Hydrating Essence or Toner', desc: 'Preps skin barrier for enhanced active ingredient absorption.' });
      // re-number
      amSteps.forEach((s, idx) => s.num = idx + 1);
    }

    let pmSteps = [
      { num: 1, title: 'Gentle Cleanser' + tag, desc: 'Remove daily impurities and mineral sunscreen.' },
      { num: 2, title: goal === 'acne' ? 'Blemish Clarifying Treatment' : goal === 'pore' ? 'Salicylic Acid Refiner' : 'Nourishing Repair Serum', desc: 'Targeted active formulation chosen for your goal of ' + goal + '.' },
      { num: 3, title: 'Barrier Recovery Night Cream', desc: 'Rich lipid-replenishing formula to support overnight cellular renewal.' }
    ];

    if (complexity === 'comprehensive') {
      pmSteps.push({ num: 4, title: 'Hydrating Facial Oil (Optional)', desc: 'Seal in moisture for extremely dry areas.' });
    }

    routineAmContent.innerHTML = amSteps.map((s, idx) => `
      <div class="routine-step-item" style="display: flex; align-items: flex-start; gap: 12px; transition: opacity 0.2s;">
        <input type="checkbox" title="Mark step complete" style="margin-top: 4px; width: 18px; height: 18px; accent-color: var(--primary); cursor: pointer;" onchange="this.closest('.routine-step-item').style.opacity = this.checked ? '0.5' : '1'">
        <div class="step-num">${s.num}</div>
        <div class="step-info">
          <h5>${s.title}</h5>
          <p>${s.desc}</p>
        </div>
      </div>
    `).join('');

    routinePmContent.innerHTML = pmSteps.map((s, idx) => `
      <div class="routine-step-item" style="display: flex; align-items: flex-start; gap: 12px; transition: opacity 0.2s;">
        <input type="checkbox" title="Mark step complete" style="margin-top: 4px; width: 18px; height: 18px; accent-color: var(--primary); cursor: pointer;" onchange="this.closest('.routine-step-item').style.opacity = this.checked ? '0.5' : '1'">
        <div class="step-num">${s.num}</div>
        <div class="step-info">
          <h5>${s.title}</h5>
          <p>${s.desc}</p>
        </div>
      </div>
    `).join('');
  }

  // Copy Report Button
  copyReportBtn.addEventListener('click', () => {
    if (!analysisResultData) {
      alert('No analysis data available to copy.');
      return;
    }
    const outputs = analysisResultData.data.results.output || [];
    const overall = outputs.find(o => o.type === 'all') || outputs[0] || {};
    const scoreVal = isValidScore(overall.ui_score) ? overall.ui_score : 'N/A';
    const skinAgeValReport = (typeof overall.skin_age === 'number' && !isNaN(overall.skin_age)) ? overall.skin_age : 'N/A';
    const isDemoReport = analysisResultData.isDemo;

    let reportText = `✨ GlowGuide AI Skin Report (${isDemoReport ? 'Simulated Demo' : 'Live Analysis'}) ✨\nOverall Score: ${scoreVal}/100 | Estimated Skin Age: ${skinAgeValReport} yrs\n\nMetric Breakdown:\n`;
    outputs.forEach(o => {
      if (o.type !== 'all') {
        const s = isValidScore(o.ui_score) ? o.ui_score : 'N/A';
        reportText += `- ${formatMetricName(o.type)}: ${s}/100 (${isDemoReport ? 'Simulated' : 'YouCam API'})\n`;
      }
    });
    reportText += `\nGenerated via GlowGuide AI & YouCam Skin AI API.`;
    navigator.clipboard.writeText(reportText).then(() => {
      alert('📋 Skin intelligence report copied to clipboard!');
    }).catch(() => {
      alert('Failed to copy report to clipboard.');
    });
  });

  // Routine Tabs Switching
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      if (tab === 'am') {
        routineAmContent.classList.remove('hidden');
        routinePmContent.classList.add('hidden');
      } else {
        routineAmContent.classList.add('hidden');
        routinePmContent.classList.remove('hidden');
      }
    });
  });

  // Reset / New Analysis
  newAnalysisBtn.addEventListener('click', () => {
    dashboardSection.classList.remove('active');
    resetUploadState();
    uploadSection.classList.add('active');
  });

  discardPhotoBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to discard your photo and reset all analysis data?')) {
      dashboardSection.classList.remove('active');
      resetUploadState();
      uploadSection.classList.add('active');
    }
  });

  // Privacy Modal
  privacyLink.addEventListener('click', (e) => {
    e.preventDefault();
    privacyModal.classList.remove('hidden');
  });

  closeModal.addEventListener('click', () => privacyModal.classList.add('hidden'));
  acceptModal.addEventListener('click', () => privacyModal.classList.add('hidden'));
  privacyModal.addEventListener('click', (e) => {
    if (e.target === privacyModal) privacyModal.classList.add('hidden');
  });

  // Groq AI Integration Client Logic
  const groqStatusBadge = document.getElementById('groq-status-badge');
  const groqInsightsBtn = document.getElementById('groq-insights-btn');
  const groqLoading = document.getElementById('groq-loading');
  const groqInsightsContainer = document.getElementById('groq-insights-container');
  const groqChatWrapper = document.getElementById('groq-chat-wrapper');
  const groqChatMessages = document.getElementById('groq-chat-messages');
  const groqChatInput = document.getElementById('groq-chat-input');
  const groqChatSendBtn = document.getElementById('groq-chat-send-btn');

  let chatConversationHistory = [];

  function renderMarkdown(text) {
    if (!text || typeof text !== 'string') return '';
    let escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    if (escaped.includes('|')) {
      const lines = escaped.split('\n');
      let cleanedLines = [];
      for (const line of lines) {
        if (line.includes('---')) continue;
        if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
          const cells = line.split('|').map(c => c.trim()).filter(Boolean);
          if (cells.length >= 2) {
            cleanedLines.push(`<strong>${cells[0]}</strong>: ${cells.slice(1).join(' — ')}`);
            continue;
          }
        }
        cleanedLines.push(line);
      }
      escaped = cleanedLines.join('\n');
    }

    escaped = escaped.replace(/^###\s+(.+)$/gm, '<h5 style="margin: 6px 0 2px 0; color: #5b21b6; font-size: 13px;">$1</h5>');
    escaped = escaped.replace(/^##\s+(.+)$/gm, '<h4 style="margin: 8px 0 4px 0; color: #5b21b6; font-size: 14px;">$1</h4>');
    escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    escaped = escaped.replace(/__(.*?)__/g, '<strong>$1</strong>');
    escaped = escaped.replace(/^\s*[-*]\s+(.+)$/gm, '<li style="margin-left: 14px; margin-bottom: 2px;">$1</li>');
    escaped = escaped.replace(/(<li.*?>.*?<\/li>\s*)+/g, '<ul style="margin: 4px 0; padding-left: 14px;">$&</ul>');
    escaped = escaped.replace(/\n/g, '<br>');
    return escaped;
  }

  async function checkGroqStatus() {
    if (!groqStatusBadge) return;
    try {
      const res = await fetch('/api/ai/status');
      const data = await res.json();
      if (data.configured) {
        groqStatusBadge.textContent = `🟢 Groq Active (${data.model})`;
        groqStatusBadge.style.background = '#d1fae5';
        groqStatusBadge.style.color = '#047857';
        if (groqInsightsBtn) groqInsightsBtn.removeAttribute('disabled');
        if (groqChatWrapper) groqChatWrapper.classList.remove('hidden');
      } else {
        groqStatusBadge.textContent = '⚪ Groq Not Configured (Optional)';
        groqStatusBadge.style.background = '#f1f5f9';
        groqStatusBadge.style.color = '#64748b';
        if (groqInsightsBtn) {
          groqInsightsBtn.setAttribute('title', 'Groq API key not configured on server.');
        }
      }
    } catch (e) {
      groqStatusBadge.textContent = '⚪ Groq Status Unavailable';
    }
  }

  if (groqInsightsBtn) {
    groqInsightsBtn.addEventListener('click', async () => {
      if (!analysisResultData) {
        alert('Please complete a skin analysis first.');
        return;
      }

      groqLoading.classList.remove('hidden');
      groqInsightsContainer.classList.add('hidden');

      try {
        const outputs = analysisResultData.data?.results?.output || [];
        const validMetrics = outputs.filter(o => o.type !== 'all' && getValidScore(o) !== null).map(m => ({
          type: m.type,
          ui_score: m.ui_score,
          raw_score: m.raw_score
        }));

        const response = await fetch('/api/ai/insights', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            metrics: validMetrics,
            skinType: skinTypeSelect?.value || 'balanced',
            concern: primaryConcern?.value || 'glow',
            budget: document.getElementById('budget-select')?.value || 'accessible',
            fragrance: document.getElementById('fragrance-pref')?.value || 'fragrance-free',
            sensitivity: document.getElementById('sensitivity-pref')?.value || 'none',
            complexity: document.getElementById('complexity-pref')?.value || 'simple'
          })
        });

        const json = await response.json();
        groqLoading.classList.add('hidden');

        if (!response.ok) {
          throw new Error(json.error || 'Failed to generate Groq AI insights.');
        }

        const data = json.data || {};
        const renderSteps = (routineArr) => {
          if (!Array.isArray(routineArr) || routineArr.length === 0) return '<li>Standard routine recommended.</li>';
          return routineArr.map((s, i) => {
            if (typeof s === 'string') {
              return `<li style="margin-bottom: 4px;"><strong>Step ${i+1}:</strong> ${s}</li>`;
            }
            const title = s.title || `Step ${i+1}`;
            const desc = s.desc || s.description || JSON.stringify(s);
            return `<li style="margin-bottom: 4px;"><strong>${title}:</strong> ${desc}</li>`;
          }).join('');
        };

        const amStepsHtml = renderSteps(data.am_routine);
        const pmStepsHtml = renderSteps(data.pm_routine);
        const metricExplHtml = Array.isArray(data.metric_explanations) && data.metric_explanations.length > 0
          ? `<div style="margin-top: 4px;"><strong style="color: #5b21b6; font-size: 13px;">🔍 Metric Explanations:</strong><ul style="margin: 4px 0 8px 20px; padding: 0; font-size: 13px; color: #475569;">${data.metric_explanations.map(m => `<li>${m}</li>`).join('')}</ul></div>`
          : '';

        groqInsightsContainer.innerHTML = `
          <div style="display: flex; flex-direction: column; gap: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <strong style="color: #5b21b6;">🤖 Groq-Powered AI Guidance (${json.model || 'LLM'})</strong>
              <span style="font-size: 11px; background: #ede9fe; color: #6d28d9; padding: 2px 6px; border-radius: 4px;">AI-Generated Interpretation</span>
            </div>
            <div style="margin: 0; color: #334155;">${renderMarkdown(data.summary || 'Personalized analysis generated successfully.')}</div>
            ${metricExplHtml}
            <div>
              <strong style="color: #5b21b6; font-size: 13px;">☀️ AI Morning Routine:</strong>
              <ul style="margin: 4px 0 8px 20px; padding: 0; font-size: 13px; color: #475569;">${amStepsHtml}</ul>
              <strong style="color: #5b21b6; font-size: 13px;">🌙 AI Evening Routine:</strong>
              <ul style="margin: 4px 0 8px 20px; padding: 0; font-size: 13px; color: #475569;">${pmStepsHtml}</ul>
            </div>
            ${data.ingredient_guidance ? `<div style="margin: 0; font-size: 13px; color: #1e293b;"><strong>💡 Ingredient Guidance:</strong> ${renderMarkdown(data.ingredient_guidance)}</div>` : ''}
            ${data.safety_notes ? `<div style="margin: 0; font-size: 12px; color: #b45309; background: #fef3c7; padding: 6px 10px; border-radius: 6px;">⚠️ <strong>Safety Note:</strong> ${renderMarkdown(data.safety_notes)}</div>` : ''}
          </div>
        `;
        groqInsightsContainer.classList.remove('hidden');

      } catch (err) {
        groqLoading.classList.add('hidden');
        alert(`Groq AI Error: ${err.message}`);
      }
    });
  }

  if (groqChatSendBtn && groqChatInput && groqChatMessages) {
    async function sendChatMessage() {
      const text = groqChatInput.value.trim();
      if (!text) return;

      groqChatInput.value = '';
      chatConversationHistory.push({ role: 'user', content: text });

      const userMsgDiv = document.createElement('div');
      userMsgDiv.style.alignSelf = 'flex-end';
      userMsgDiv.style.background = '#ede9fe';
      userMsgDiv.style.color = '#5b21b6';
      userMsgDiv.style.padding = '8px 12px';
      userMsgDiv.style.borderRadius = '8px';
      userMsgDiv.style.maxWidth = '80%';
      userMsgDiv.textContent = text;
      groqChatMessages.appendChild(userMsgDiv);
      groqChatMessages.scrollTop = groqChatMessages.scrollHeight;

      const loadingDiv = document.createElement('div');
      loadingDiv.style.color = '#6b7280';
      loadingDiv.style.fontStyle = 'italic';
      loadingDiv.textContent = 'Groq is thinking...';
      groqChatMessages.appendChild(loadingDiv);
      groqChatMessages.scrollTop = groqChatMessages.scrollHeight;

      try {
        const outputs = analysisResultData?.data?.results?.output || [];
        const validMetrics = outputs.filter(o => o.type !== 'all' && getValidScore(o) !== null).map(m => ({
          type: m.type,
          score: m.ui_score !== undefined ? m.ui_score : m.raw_score
        }));

        const response = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: chatConversationHistory,
            context: {
              metrics: validMetrics,
              skinType: skinTypeSelect?.value || 'balanced',
              concern: primaryConcern?.value || 'glow'
            }
          })
        });

        const json = await response.json();
        groqChatMessages.removeChild(loadingDiv);

        if (!response.ok) {
          throw new Error(json.error || 'Chat request failed.');
        }

        const reply = json.reply || 'No response received.';
        chatConversationHistory.push({ role: 'assistant', content: reply });

        const aiMsgDiv = document.createElement('div');
        aiMsgDiv.style.alignSelf = 'flex-start';
        aiMsgDiv.style.background = '#f1f5f9';
        aiMsgDiv.style.color = '#1e293b';
        aiMsgDiv.style.padding = '8px 12px';
        aiMsgDiv.style.borderRadius = '8px';
        aiMsgDiv.style.maxWidth = '80%';
        aiMsgDiv.innerHTML = renderMarkdown(reply);
        groqChatMessages.appendChild(aiMsgDiv);
        groqChatMessages.scrollTop = groqChatMessages.scrollHeight;

      } catch (err) {
        if (loadingDiv.parentNode) groqChatMessages.removeChild(loadingDiv);
        const errDiv = document.createElement('div');
        errDiv.style.color = '#dc2626';
        errDiv.textContent = `Error: ${err.message}`;
        groqChatMessages.appendChild(errDiv);
        groqChatMessages.scrollTop = groqChatMessages.scrollHeight;
      }
    }

    groqChatSendBtn.addEventListener('click', sendChatMessage);
    groqChatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendChatMessage();
    });
  }
});
