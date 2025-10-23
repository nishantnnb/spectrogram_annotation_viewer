// mouse.js
// Filtering is strictly visual. Do not mutate selection or call notifySelectionChange.
// When filtering, only uncheck play-checkboxes that belong to hidden rows.
// Reapply visual filter after review_table updates; Resume/Stop/Play-from-start restore table.
(function () {
  const canvas = document.getElementById('canvas');
  let reviewFrame = document.getElementById('reviewTableFrame');
  const playToggle = document.getElementById('playToggle');
  const stopBtn = document.getElementById('stop');

  if (!canvas || !reviewFrame) return;

  // state
  let filteredActive = false;
  let lastMatchedIndices = [];
  let reapplyTimer = null;

  // small helpers (mapping time/freq -> rows reused from earlier)
  function dpr() { return window.devicePixelRatio || 1; }
  function secondsPerPixel() {
    const xSel = document.getElementById('xZoom');
    const speedEl = xSel || document.getElementById('speed');
    const speed = speedEl ? Math.max(1, Number(speedEl.value) || 1) : 1;
    return 1 / (speed * 60);
  }
  function getYMaxHz() {
    const sel = document.getElementById('yPreset');
    if (!sel) return 15000;
    const v = sel.value;
    if (v === 'nyq') {
      const ctx = (window.__spectro && window.__spectro.Audio && typeof window.__spectro.Audio.getCtx === 'function')
        ? window.__spectro.Audio.getCtx()
        : null;
      if (ctx && ctx.sampleRate) return ctx.sampleRate / 2;
      return 22050;
    }
    const num = Number(v);
    return Number.isFinite(num) ? num : 15000;
  }
  function computeVisible(totalCols) {
    const axisLeft = 64;
    const axisBottom = 48;
    const cssCanvasW = Math.max(300, Math.round(canvas.clientWidth || (canvas.width / dpr())));
    const cssCanvasH = Math.max(120, Math.round(canvas.clientHeight || (canvas.height / dpr())));
    const vpW_css = Math.max(64, Math.round(cssCanvasW - axisLeft));
    const visibleCols = Math.max(4, Math.round(vpW_css));
    const sPerPx = secondsPerPixel();
    const totalColsClamped = Math.max(0, totalCols || 0);
    const visibleColsUsed = Math.max(1, Math.min(visibleCols, totalColsClamped || 1));
    const rightmostLogical = Math.max(0, totalColsClamped - 1);
    const leftmostLogical = Math.max(0, rightmostLogical - visibleColsUsed + 1);
    const leftmostTime = leftmostLogical * sPerPx;
    const deviceVpW = Math.round(vpW_css * dpr());
    const deviceVpH = Math.round((cssCanvasH - axisBottom) * dpr());
    return { axisLeft, axisLeftPx: Math.round(axisLeft * dpr()), leftmostTime, visibleCols, sPerPx, deviceVpW, deviceVpH, cssCanvasH };
  }
  function clientPointToTimeFreq(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const dprVal = dpr();

    const totalCols = (window.__spectro && window.__spectro.Draw && window.__spectro.Draw._debug && typeof window.__spectro.Draw._debug.getTotalCols === 'function')
      ? window.__spectro.Draw._debug.getTotalCols()
      : 0;

    const info = computeVisible(totalCols);
    const axisLeft = info.axisLeft;
    const leftmostTime = info.leftmostTime;
    const visibleCols = info.visibleCols;
    const sPerPx = info.sPerPx;
    const deviceVpW = info.deviceVpW;
    const deviceVpH = info.deviceVpH;

    if (x < axisLeft) return null;

    const localX_css = Math.max(0, x - axisLeft);
    const localX_dev = localX_css * dprVal;

    const visibleColsCss = Math.max(4, Math.round(Math.max(300, Math.round(canvas.clientWidth || (canvas.width / dprVal))) - axisLeft));
    const visibleColsCount = Math.max(4, Math.round(visibleColsCss));

    const totalColsClamped = Math.max(0, totalCols);
    const visibleColsUsed = Math.max(1, Math.min(visibleColsCount, totalColsClamped || 1));
    const emptyCols = visibleColsCount - visibleColsUsed;
    const xOffsetPx = Math.round((emptyCols / visibleColsCount) * deviceVpW);

    const frac = (localX_dev - xOffsetPx) / deviceVpW;
    const timeSeconds = leftmostTime + frac * (visibleCols * sPerPx);

    const localY_dev = Math.round(y * dprVal);
    const shownMaxHz = Math.max(100, Math.min((window.__spectro && window.__spectro.Audio && window.__spectro.Audio.getCtx && window.__spectro.Audio.getCtx() && window.__spectro.Audio.getCtx().sampleRate) ? window.__spectro.Audio.getCtx().sampleRate / 2 : 22050, getYMaxHz()));
    const fracTop = localY_dev / deviceVpH;
    const freqHz = (1 - fracTop) * shownMaxHz;

    return { timeSeconds, freqHz };
  }
  function findAnnotationRowsAtPoint(timeSec, freqHz) {
    const parsedAnnotations = window.__spectro && window.__spectro.parsedAnnotations;
    const mapping = window.__spectro && window.__spectro.mapping || {};
    if (!parsedAnnotations || !Array.isArray(parsedAnnotations.rows)) return [];
    const rows = parsedAnnotations.rows;
    const matches = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const startRaw = row[mapping.start] || row.start || row['Start'] || row['start_time'] || row['t_start'] || row['Begin Time (s)'] || '';
      const endRaw = row[mapping.end] || row.end || row['End'] || row['end_time'] || row['t_end'] || '';
      const startSec = Number.parseFloat(String(startRaw).trim());
      const endSec = Number.parseFloat(String(endRaw).trim());
      if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec <= startSec) continue;
      if (timeSec < startSec - 1e-9 || timeSec > endSec + 1e-9) continue;
      let lowHz = 0, highHz = (window.__spectro && window.__spectro.Audio && window.__spectro.Audio.getCtx && window.__spectro.Audio.getCtx() && window.__spectro.Audio.getCtx().sampleRate) ? window.__spectro.Audio.getCtx().sampleRate / 2 : 22050;
      if (mapping.low || mapping.high) {
        const lowRaw = row[mapping.low] || row.low || row['Low'] || row['fmin'] || '';
        const highRaw = row[mapping.high] || row.high || row['High'] || row['fmax'] || '';
        const l = Number.parseFloat(String(lowRaw).trim());
        const h = Number.parseFloat(String(highRaw).trim());
        if (Number.isFinite(l)) lowHz = l;
        if (Number.isFinite(h)) highHz = h;
      }
      if (freqHz >= lowHz - 1e-9 && freqHz <= highHz + 1e-9) matches.push(i);
    }
    return matches;
  }

  // show all rows (visual only). do not change selection/notify.
  function restoreTableState() {
    reviewFrame = document.getElementById('reviewTableFrame');
    if (!reviewFrame) return;
    const table = reviewFrame.querySelector('table');
    if (!table) return;
    const tbody = table.tBodies[0] || table.querySelector('tbody');
    if (!tbody) return;
    Array.from(tbody.querySelectorAll('tr')).forEach(tr => {
      tr.style.display = '';
      tr.classList.remove('annotation-selected');
    });
    filteredActive = false;
    lastMatchedIndices = [];
  }

  // apply visual filter; uncheck only play-checkboxes that belong to hidden rows.
  function applyFilterRows(matchedIndices) {
    reviewFrame = document.getElementById('reviewTableFrame');
    if (!reviewFrame) return;
    const table = reviewFrame.querySelector('table');
    if (!table) return;
    const tbody = table.tBodies[0] || table.querySelector('tbody');
    if (!tbody) return;
    const trs = Array.from(tbody.querySelectorAll('tr'));
    const matchSet = new Set(matchedIndices.map(i => Number(i)));

    // 1) show/hide and mark visual class
    trs.forEach(tr => {
      const idx = Number(tr.dataset.rowIndex);
      if (!Number.isFinite(idx)) {
        tr.style.display = '';
        tr.classList.remove('annotation-selected');
        return;
      }
      if (matchSet.has(idx)) {
        tr.style.display = '';
        tr.classList.add('annotation-selected');
      } else {
        tr.style.display = 'none';
        tr.classList.remove('annotation-selected');
      }
    });

    // 2) uncheck only those play-checkboxes that ended up hidden
    trs.forEach(tr => {
      const idx = Number(tr.dataset.rowIndex);
      if (!Number.isFinite(idx)) return;
      const playCb = tr.querySelector('input.play-checkbox[type="checkbox"]');
      if (!playCb) return;
      const isHidden = tr.style.display === 'none';
      if (isHidden && playCb.checked) {
        // clear state visually; let the table checkbox handler (if it runs) manage notify/selectedRowIndex
        playCb.checked = false;
        tr.classList.remove('selected-row');
      }
    });

    // Do NOT set window.__spectro.selectedRowIndex or call notifySelectionChange here.
    // Table's own checkbox handlers are the single source of truth for selection.

    filteredActive = true;
    lastMatchedIndices = Array.from(matchSet);
  }

  function pausePlaybackNow() {
    try {
      if (window.__spectro && window.__spectro.Audio) {
        const Audio = window.__spectro.Audio;
        if (Audio.isPlayingNow && Audio.isPlayingNow()) {
          try { Audio.pausePlayback(); } catch (e) {}
          if (window.__spectro && window.__spectro.Draw && typeof window.__spectro.Draw.stopLoop === 'function') {
            try { window.__spectro.Draw.stopLoop(); } catch (e) {}
          }
          const playToggleEl = document.getElementById('playToggle');
          if (playToggleEl) {
            playToggleEl.classList.remove('btn-resume', 'btn-pause');
            playToggleEl.classList.add('btn-resume');
            playToggleEl.textContent = 'Resume';
          }
        }
      }
    } catch (e) { console.error('mouse.js pausePlaybackNow', e); }
  }

  // cursor hint
  canvas.addEventListener('mousemove', function (ev) {
    try {
      const pt = clientPointToTimeFreq(ev.clientX, ev.clientY);
      if (!pt) { canvas.style.cursor = ''; return; }
      const matches = findAnnotationRowsAtPoint(pt.timeSeconds, pt.freqHz);
      canvas.style.cursor = (matches && matches.length) ? 'pointer' : '';
    } catch (e) { console.error('mouse.js mousemove', e); }
  }, { passive: true });

  // click to filter
  canvas.addEventListener('click', function (ev) {
    try {
      const pt = clientPointToTimeFreq(ev.clientX, ev.clientY);
      if (!pt) return;
      const matches = findAnnotationRowsAtPoint(pt.timeSeconds, pt.freqHz);
      if (!matches || matches.length === 0) return;

      if (filteredActive) restoreTableState();

      pausePlaybackNow();

      applyFilterRows(matches);
    } catch (err) { console.error('mouse.js click handler', err); }
  }, { passive: false });

  // Resume/Stop restore
  if (playToggle) {
    playToggle.addEventListener('click', function () {
      try { if (filteredActive) restoreTableState(); } catch (e) { console.error('mouse.js playToggle handler', e); }
    }, { passive: true });
  }
  if (stopBtn) {
    stopBtn.addEventListener('click', function () { try { restoreTableState(); } catch (e) { console.error('mouse.js stop handler', e); } }, { passive: true });
  }

  // Play-from-start should also clear filter (no selection mutation here)
  const playFromStartBtn = document.getElementById('playFromStart');
  if (playFromStartBtn) {
    playFromStartBtn.addEventListener('click', function () {
      try { if (filteredActive) restoreTableState(); } catch (e) { console.error('mouse.js playFromStart handler', e); }
    }, { passive: true });
  }

  // Reapply visual filter after DOM updates, debounced. Do not change selection.
  const observer = new MutationObserver((mutations) => {
    try {
      if (!filteredActive) return;
      if (reapplyTimer) clearTimeout(reapplyTimer);
      reapplyTimer = setTimeout(() => {
        try {
          if (Array.isArray(lastMatchedIndices) && lastMatchedIndices.length) {
            applyFilterRows(lastMatchedIndices);
          } else {
            restoreTableState();
          }
        } catch (e) { console.error('mouse.js reapply filter error', e); }
        reapplyTimer = null;
      }, 140);
    } catch (e) { /* ignore */ }
  });

  try {
    observer.observe(reviewFrame, { childList: true, subtree: true, attributes: false, characterData: false });
  } catch (e) { /* ignore if observe fails */ }

  // keyboard accessibility
  canvas.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter' || ev.key === ' ') {
      const rect = canvas.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const clickEv = new MouseEvent('click', { clientX: cx, clientY: cy });
      canvas.dispatchEvent(clickEv);
      ev.preventDefault();
    }
  });

})();