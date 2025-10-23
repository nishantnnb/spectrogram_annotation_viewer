// review_table.js
// Robust, DOM-ready implementation for the review table.
// - Waits for DOMContentLoaded before running
// - Sticky header (frozen like Excel), resizable columns, single-select Play, Reviewed OK + remarks
// - Improved wheel handling so mouse wheel scroll works when pointer is over the table
// - Save Review integration: creates/enables button with id "saveReview" and downloads reviewed table.
// - Keeps play-checkbox state and row highlight (selected-row) consistently in sync
// - Defaults: Low/High frequency default to 0 and 25000 Hz when absent
// - If no row has valid Begin/Start and End times, disable all Play checkboxes
(function(){
  const UNIFORM_DEFAULT_WIDTH = 90;
  const FRAME_ID = 'reviewTableFrame';

  // --- start: review table defaults and key resolution ---
  const DEFAULT_LOW_HZ = 0;
  const DEFAULT_HIGH_HZ = 25000;

  function resolveKeyByCandidates(headers, candidatesRegex) {
    if (!Array.isArray(headers)) return '';
    const lower = headers.map(h => String(h).toLowerCase());
    for (let i = 0; i < lower.length; i++) {
      if (candidatesRegex.test(lower[i])) return headers[i];
    }
    return '';
  }
  // --- end: review table defaults and key resolution ---

  function run() {
    const frame = document.getElementById(FRAME_ID);
    if(!frame){
      console.warn('review_table: frame not found');
      return;
    }

    // If saveReview button missing, try to create it next to annFile input (so index.html need not change)
    (function ensureSaveButton() {
      try {
        if (document.getElementById('saveReview')) return;
        const annInput = document.querySelector('#controls .ctrl input#annFile');
        if (!annInput) return;
        const btn = document.createElement('button');
        btn.id = 'saveReview';
        btn.className = 'save-review-btn';
        btn.disabled = true;
        btn.textContent = 'Save Review';
        annInput.insertAdjacentElement('afterend', btn);
      } catch (e) { /* non-fatal */ }
    })();

    // prepare container
    frame.innerHTML = '';
    frame.style.position = 'relative';
    frame.style.boxSizing = 'border-box';
    frame.style.padding = frame.style.padding || '6px';
    frame.style.overflow = 'hidden'; // inner .tableWrap will handle scrolling
    frame.style.webkitOverflowScrolling = 'touch';

    const inner = document.createElement('div');
    inner.style.width = '100%';
    inner.style.boxSizing = 'border-box';
    frame.appendChild(inner);

    // table structure
    const table = document.createElement('table');
    table.className = 'review-table';
    table.style.width = '100%';
    table.style.tableLayout = 'fixed';
    table.style.borderCollapse = 'separate';
    table.style.borderSpacing = '0';
    table.style.fontSize = '12px';
    table.style.color = 'var(--white, #e6eef8)';

    const colgroup = document.createElement('colgroup');
    const thead = document.createElement('thead');
    const tbody = document.createElement('tbody');
    table.appendChild(colgroup);
    table.appendChild(thead);
    table.appendChild(tbody);

    inner.appendChild(table);

    // styles (sticky header + scrollable body)
    const style = document.createElement('style');
    style.textContent = `
      /* sticky header like Excel; table body scrolls inside .tableWrap */
      #${FRAME_ID} .tableWrap {
        width: 100%;
        overflow: auto;
        max-height: 280px; /* adjust as needed */
        position: relative;
      }
      #${FRAME_ID} table {
        width: 100%;
        table-layout: fixed;
        border-collapse: separate;
      }
      #${FRAME_ID} table thead th {
        position: sticky;
        top: 0;
        z-index: 6;
        background: #121316;
        border-bottom: 1px solid #333;
        padding: 6px 8px;
        text-align: left;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      #${FRAME_ID} table tbody td {
        padding: 6px 8px;
        border-bottom: 1px solid rgba(255,255,255,0.04);
        vertical-align: middle;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      #${FRAME_ID} .resizer {
        position: absolute; top: 0; width: 10px; margin-left: -5px; cursor: col-resize; z-index: 4; background: transparent;
      }
      #${FRAME_ID} .compact-input {
        padding: 4px 6px; font-size: 12px; border-radius: 4px; border: 1px solid #333;
        background: #0b0b0b; color: var(--white,#e6eef8); width: 100%; box-sizing: border-box;
      }
      #${FRAME_ID} .compact-checkbox, #${FRAME_ID} .play-checkbox {
        width: 14px; height: 14px; margin: 0; vertical-align: middle;
      }
      #${FRAME_ID} .sr-cell { text-align: right; padding-right: 12px; font-variant-numeric: tabular-nums; }
      /* selected-row highlight */
      #${FRAME_ID} tr.selected-row { background: rgba(173,216,230,0.4); }
    `;
    document.head.appendChild(style);

    // helpers
    function clearChildren(n){ while(n.firstChild) n.removeChild(n.firstChild); }
    function createCol(px){ const c = document.createElement('col'); if(px!=null) c.style.width = px + 'px'; return c; }

    // deterministic text width using canvas (matches header font size)
    const measureCanvas = document.createElement('canvas');
    const measureCtx = measureCanvas.getContext('2d');
    function measureHeaderTextPx(text){
      // header uses font-weight 600 and font-size 12px per CSS; use same for canvas
      measureCtx.font = '600 12px system-ui, Segoe UI, Roboto, Arial, sans-serif';
      const metrics = measureCtx.measureText(String(text));
      // add small padding to account for th padding
      return Math.ceil(metrics.width) + 16;
    }

    // build skeleton: Play, Sr, Reviewed OK, Rejection remarks, ...headers
    function buildTableSkeleton(headers){
      clearChildren(colgroup);
      clearChildren(thead);
      clearChildren(tbody);

      const allCols = ['Play','Sr.','Reviewed OK','Rejection remarks'].concat(headers || []);
      const headerRow = document.createElement('tr');

      // add placeholder cols with uniform width
      allCols.forEach(()=> colgroup.appendChild(createCol(UNIFORM_DEFAULT_WIDTH)));

      // header cells
      allCols.forEach((name, idx) => {
        const th = document.createElement('th');
        th.dataset.colIndex = String(idx);
        th.style.padding = '6px 8px';
        th.style.minWidth = '0';
        th.style.boxSizing = 'border-box';
        th.title = name;
        th.textContent = name;
        headerRow.appendChild(th);
      });
      thead.appendChild(headerRow);

      // attach a horizontal scroll wrapper and ensure table is in DOM
      inner.innerHTML = '';
      const tableWrap = document.createElement('div');
      tableWrap.className = 'tableWrap';
      tableWrap.style.position = 'relative';
      tableWrap.style.width = '100%';
      tableWrap.style.overflow = 'auto';
      tableWrap.style.maxHeight = '280px';
      tableWrap.appendChild(table);
      inner.appendChild(tableWrap);

      // measure Play and Sr using canvas (deterministic); apply widths
      try {
        const playW = Math.max(24, measureHeaderTextPx('Play'));
        //const srW = Math.max(24, measureHeaderTextPx('Sr.'));
        const srW = 40
		const cols = colgroup.children;
        if(cols[0]) cols[0].style.width = playW + 'px';
        if(cols[1]) cols[1].style.width = srW + 'px';
      } catch (e) {
        // fallback: leave uniform widths
        console.debug('review_table: measure failed, using uniform widths', e);
      }

      // create initial resizers
      requestAnimationFrame(createResizers);

      // After skeleton is built, update Save Review button state (if present)
      updateSaveButtonState();
    }

    // resizer creation
    function createResizers(){
      // remove any existing
      frame.querySelectorAll('.resizer').forEach(n => n.remove());
      const headerCells = thead.querySelectorAll('th');
      if(!headerCells || headerCells.length === 0) return;
      const cols = Array.from(colgroup.children);
      const parent = table.parentElement || inner;

      // compute cumulative left offsets using col widths
      let cum = 0;
      cols.forEach((col, idx) => {
        const w = (col.style.width && col.style.width.endsWith('px')) ? Number(col.style.width.slice(0,-2)) : Math.round((headerCells[idx] && headerCells[idx].getBoundingClientRect().width) || UNIFORM_DEFAULT_WIDTH);
        cum += isNaN(w) ? 0 : w;

        if(idx < cols.length - 1){
          const res = document.createElement('div');
          res.className = 'resizer';
          res.dataset.colIndex = String(idx);
          parent.appendChild(res);
          res.style.left = (cum - 5) + 'px';
          res.style.top = '0';
          res.style.height = parent.clientHeight + 'px';

          let startX = 0;
          let leftOrig = 0;
          let rightOrig = 0;
          const leftCol = cols[idx];
          const rightCol = cols[idx + 1];

          function onPointerDown(e){
            e.preventDefault();
            startX = e.clientX || (e.touches && e.touches[0] && e.touches[0].clientX) || 0;
            leftOrig = parseInt(leftCol.style.width || leftCol.getBoundingClientRect().width, 10) || 0;
            rightOrig = parseInt(rightCol.style.width || rightCol.getBoundingClientRect().width, 10) || 0;
            document.addEventListener('pointermove', onPointerMove, { passive:false });
            document.addEventListener('pointerup', onPointerUp, { passive:false });
            document.addEventListener('pointercancel', onPointerUp, { passive:false });
          }
          function onPointerMove(ev){
            ev.preventDefault();
            const curX = ev.clientX || (ev.touches && ev.touches[0] && ev.touches[0].clientX) || 0;
            const dx = curX - startX;
            const newLeft = Math.max(0, leftOrig + dx);
            const newRight = Math.max(0, rightOrig - dx);
            leftCol.style.width = newLeft + 'px';
            rightCol.style.width = newRight + 'px';
            // reposition resizers on next paint
            requestAnimationFrame(createResizers);
          }
          function onPointerUp(){
            document.removeEventListener('pointermove', onPointerMove);
            document.removeEventListener('pointerup', onPointerUp);
            document.removeEventListener('pointercancel', onPointerUp);
          }

          res.addEventListener('pointerdown', onPointerDown, { passive:false });
        }
      });
    }

    // render body rows
    function renderRows(parsed){
      clearChildren(tbody);
      if(!parsed || !Array.isArray(parsed.headers) || !Array.isArray(parsed.rows)) return;
      const headers = parsed.headers;
      const rows = parsed.rows;

      // keep track of which tr was selected to maintain class
      const prevSel = (window.__spectro && typeof window.__spectro.selectedRowIndex === 'number') ? window.__spectro.selectedRowIndex : -1;

      // Resolve canonical header keys and determine if any row has valid start/end
      const startKey = resolveKeyByCandidates(headers, /start|onset|time|tstart/ ) || (headers[0] || '');
      const endKey   = resolveKeyByCandidates(headers, /end|offset|tend|time_end/ ) || (headers[1] || startKey);
      const lowKey   = resolveKeyByCandidates(headers, /low|fmin|minfreq/ ) || resolveKeyByCandidates(headers, /freq/ ) || '';
      const highKey  = resolveKeyByCandidates(headers, /high|fmax|maxfreq/ ) || lowKey;

      window.__review_table = window.__review_table || {};
      window.__review_table._resolvedKeys = { startKey, endKey, lowKey, highKey };

      const hasValidStartEnd = Array.isArray(rows) && rows.some(row => {
        const s = Number.parseFloat(String((row[startKey] || row.start || row['Start'] || row['Begin Time (s)'] || '')).trim());
        const e = Number.parseFloat(String((row[endKey]   || row.end   || row['End']   || '')).trim());
        return Number.isFinite(s) && Number.isFinite(e) && e > s;
      });
      window.__review_table._hasValidStartEnd = !!hasValidStartEnd;

      // determine whether Play should be interactive
      const globalPlayEnabled = !!hasValidStartEnd;

      rows.forEach((row, rIdx) => {
        const tr = document.createElement('tr');
        tr.dataset.rowIndex = String(rIdx);

        // compute low/high for the row and attach defaults when absent
        (function attachFreqDefaults() {
          const lk = (window.__review_table && window.__review_table._resolvedKeys && window.__review_table._resolvedKeys.lowKey) || '';
          const hk = (window.__review_table && window.__review_table._resolvedKeys && window.__review_table._resolvedKeys.highKey) || '';
          const rawLow = lk ? (row[lk] ?? row['Low'] ?? row['fmin'] ?? '') : (row['Low'] ?? row['fmin'] ?? '');
          const rawHigh = hk ? (row[hk] ?? row['High'] ?? row['fmax'] ?? '') : (row['High'] ?? row['fmax'] ?? '');
          const lowVal = Number.parseFloat(String(rawLow).trim());
          const highVal = Number.parseFloat(String(rawHigh).trim());
          tr.dataset.lowHz = Number.isFinite(lowVal) ? String(lowVal) : String(DEFAULT_LOW_HZ);
          tr.dataset.highHz = Number.isFinite(highVal) ? String(highVal) : String(DEFAULT_HIGH_HZ);
        })();

        // Play
        const playTd = document.createElement('td');
        playTd.style.textAlign = 'center';
        const playChk = document.createElement('input');
        playChk.type = 'checkbox';
        playChk.className = 'play-checkbox';
        playChk.disabled = !globalPlayEnabled;
        // set checked if this index matches exported selectedRowIndex (only if enabled)
        if(rIdx === prevSel && globalPlayEnabled) playChk.checked = true;
        playChk.addEventListener('change', () => {
          if(playChk.checked){
            // uncheck others
            tbody.querySelectorAll('input.play-checkbox').forEach(cb => { if(cb !== playChk) cb.checked = false; });
            // update global selected index
            if(window.__spectro) window.__spectro.selectedRowIndex = rIdx;
            // apply tr styling
            tbody.querySelectorAll('tr').forEach(rowEl => rowEl.classList.remove('selected-row'));
            tr.classList.add('selected-row');
            // notify play selection change so Play-from-start label updates
            if (window.__review_table && typeof window.__review_table.notifySelectionChange === 'function') {
              try { window.__review_table.notifySelectionChange(rIdx); } catch (e) {}
            }
          } else {
            // clear selection if unchecked
            if(window.__spectro) window.__spectro.selectedRowIndex = -1;
            tr.classList.remove('selected-row');
            if (window.__review_table && typeof window.__review_table.notifySelectionChange === 'function') {
              try { window.__review_table.notifySelectionChange(-1); } catch (e) {}
            }
          }
        });
        playTd.appendChild(playChk);
        tr.appendChild(playTd);

        // Sr.
        const srTd = document.createElement('td');
        srTd.className = 'sr-cell';
        srTd.textContent = String(rIdx + 1);
        tr.appendChild(srTd);

        // Reviewed OK
        const reviewedTd = document.createElement('td');
        reviewedTd.style.textAlign = 'center';
        const revChk = document.createElement('input');
        revChk.type = 'checkbox';
        revChk.className = 'compact-checkbox';
        revChk.checked = true;
        reviewedTd.appendChild(revChk);
        tr.appendChild(reviewedTd);

        // Rejection remarks
        const remarksTd = document.createElement('td');
        const remarksInput = document.createElement('input');
        remarksInput.type = 'text';
        remarksInput.className = 'compact-input';
        remarksInput.disabled = true;
        remarksInput.style.width = '100%';
        revChk.addEventListener('change', () => {
          remarksInput.disabled = revChk.checked;
          if(remarksInput.disabled) remarksInput.value = '';
        });
        // NEW: ensure Tab from remarks goes to the play/pause control (id="playToggle")
        remarksInput.addEventListener('keydown', (ev) => {
          if (ev.key === 'Tab' && !ev.shiftKey) {
            ev.preventDefault();
            const playToggleEl = document.getElementById('playToggle');
            if (playToggleEl) playToggleEl.focus();
          }
        });
        remarksTd.appendChild(remarksInput);
        tr.appendChild(remarksTd);

        // annotation columns
        headers.forEach(h => {
          const td = document.createElement('td');
          const v = row[h] == null ? '' : String(row[h]);
          td.textContent = v;
          td.title = v;
          tr.appendChild(td);
        });

        // restore selected-row class if applicable
        if(rIdx === prevSel) tr.classList.add('selected-row');

        tbody.appendChild(tr);
      });

      // After rendering rows, update Save Review button state (if present)
      updateSaveButtonState();
    }

    // Clear any selected play state and row highlight inside the table
    function clearTableSelection() {
      try {
        const frameEl = document.getElementById(FRAME_ID);
        if (!frameEl) return;
        const tbodyEl = frameEl.querySelector('tbody');
        if (!tbodyEl) return;

        // Uncheck any play-checkboxes
        tbodyEl.querySelectorAll('input.play-checkbox:checked').forEach(cb => { cb.checked = false; });

        // Remove the selected-row class from all rows
        tbodyEl.querySelectorAll('tr.selected-row').forEach(tr => tr.classList.remove('selected-row'));

        // Reset shared selection index to keep internal state consistent
        if (window.__spectro && typeof window.__spectro.selectedRowIndex === 'number') {
          window.__spectro.selectedRowIndex = -1;
        }
      } catch (err) {
        console.error('clearTableSelection', err);
      }
    }

    // Improved wheel handler that delegates to the inner scrollable .tableWrap when possible
    function trapWheel(e){
      try {
        const tableWrap = frame.querySelector('.tableWrap');
        if (!tableWrap) {
          e.preventDefault(); e.stopPropagation(); return;
        }

        const rect = tableWrap.getBoundingClientRect();
        const x = e.clientX, y = e.clientY;
        const overTableWrap = (y >= rect.top && y <= rect.bottom && x >= rect.left && x <= rect.right);

        if (!overTableWrap) {
          e.stopPropagation();
          return;
        }

        const delta = e.deltaY;
        const atTop = tableWrap.scrollTop <= 0;
        const atBottom = tableWrap.scrollTop + tableWrap.clientHeight >= tableWrap.scrollHeight - 1;

        if ((delta < 0 && atTop) || (delta > 0 && atBottom)) {
          // trying to scroll past boundaries — prevent outer page from moving
          e.preventDefault();
          e.stopPropagation();
        } else {
          // Let the tableWrap handle the scroll, but stop propagation so parent won't scroll
          e.stopPropagation();
        }
      } catch (err) {
        try { e.stopPropagation(); e.preventDefault(); } catch(e){}
      }
    }

    // attach improved wheel listener
    frame.removeEventListener('wheel', trapWheel); // safe no-op if not attached
    frame.addEventListener('wheel', trapWheel, { passive:false });

    // orchestrator: watch window.__spectro.parsedAnnotations
    let lastHeaders = null;
    let lastRows = -1;
    function updateFromSpectro(){
      const spectro = window.__spectro || null;
      const parsed = spectro && spectro.parsedAnnotations ? spectro.parsedAnnotations : null;
      if(!parsed || !Array.isArray(parsed.headers)){
        // clear DOM and selection when annotations removed or invalid
        inner.innerHTML = '';
        lastHeaders = null;
        lastRows = -1;
        // ensure any visual selection is cleared
        try { clearTableSelection(); } catch(e){}
        updateSaveButtonState();
        return;
      }
      const headers = parsed.headers.slice(0);
      const rows = parsed.rows || [];

      const headersChanged = !lastHeaders || headers.length !== lastHeaders.length || headers.some((h,i) => h !== lastHeaders[i]);
      const rowsChanged = rows.length !== lastRows;

      if(headersChanged){
        buildTableSkeleton(headers);
        lastHeaders = headers.slice(0);
        lastRows = -1;
      }
      if(rowsChanged || headersChanged){
        renderRows(parsed);
        lastRows = rows.length;
      }
      requestAnimationFrame(createResizers);

      // ensure save button updated
      updateSaveButtonState();

      // keep DOM highlight in sync with window.__spectro.selectedRowIndex
      try {
        const selIdx = (window.__spectro && typeof window.__spectro.selectedRowIndex === 'number') ? window.__spectro.selectedRowIndex : -1;
        const frameEl = document.getElementById(FRAME_ID);
        if (frameEl) {
          const tbodyEl = frameEl.querySelector('tbody');
          if (tbodyEl) {
            tbodyEl.querySelectorAll('tr').forEach(tr => {
              const idx = Number(tr.dataset.rowIndex);
              if (idx === selIdx) tr.classList.add('selected-row');
              else tr.classList.remove('selected-row');
            });
          }
        }
      } catch(e){ /* swallow */ }
    }

    // Save Review button logic — placed here so it can access table/DOM directly
    function updateSaveButtonState(){
      try {
        const btn = document.getElementById('saveReview');
        if(!btn) return;
        const parsed = window.__spectro && window.__spectro.parsedAnnotations ? window.__spectro.parsedAnnotations : null;
        const enabled = !!(parsed && Array.isArray(parsed.headers) && Array.isArray(parsed.rows) && parsed.rows.length > 0);
        btn.disabled = !enabled;
      } catch(e) { /* swallow */ }
    }

    function downloadReviewedTable() {
      try {
        const parsed = (window.__spectro && window.__spectro.parsedAnnotations) ? window.__spectro.parsedAnnotations : null;
        if(!parsed || !Array.isArray(parsed.headers)) {
          alert('No annotation table available to save.');
          return;
        }
        const headers = parsed.headers.slice();
        const rows = parsed.rows || [];

        // Build TSV header: Sr. + original headers + Reviewed OK + Rejection remarks
        const outHeaders = ['Sr.'].concat(headers).concat(['Reviewed OK','Rejection remarks']);
        const lines = [];
        lines.push(outHeaders.join('\t'));

        // For each row, find matching DOM tr to read Reviewed checkbox and remarks input
        const frameEl = document.getElementById(FRAME_ID);
        const tbodyEl = frameEl ? frameEl.querySelector('tbody') : null;
        const trNodes = tbodyEl ? Array.from(tbodyEl.querySelectorAll('tr')) : [];

        rows.forEach((rowObj, idx) => {
          const sr = String(idx + 1);
          // original values in original header order
          const vals = headers.map(h => {
            const v = rowObj.hasOwnProperty(h) ? rowObj[h] : '';
            return String(v).replace(/\t/g,' ').replace(/\r?\n/g,' ');
          });

          // find corresponding tr by data-row-index attribute
          let reviewedOK = 'Not OK';
          let remarks = '';
          const tr = trNodes.find(t => Number(t.dataset.rowIndex) === idx);
          if(tr){
            const revChk = tr.querySelector('input.compact-checkbox[type="checkbox"]');
            if(revChk) reviewedOK = revChk.checked ? 'OK' : 'Not OK';
            const remarksInp = tr.querySelector('input.compact-input[type="text"]');
            if(remarksInp) remarks = String(remarksInp.value || '').replace(/\t/g,' ').replace(/\r?\n/g,' ');
          } else {
            // default fallback (review_table sets checked by default)
            reviewedOK = 'OK';
            remarks = '';
          }

          const lineParts = [sr].concat(vals).concat([reviewedOK, remarks]);
          lines.push(lineParts.join('\t'));
        });

        // filename: derive from annotations source name if available via window.__spectro._annotationSourceName
        // Fallbacks: annFile input filename; default name otherwise
        let outName = 'annotations-Reviewed.txt';
        try {
          let src = '';
          if (window.__spectro && window.__spectro._annotationSourceName) src = String(window.__spectro._annotationSourceName);
          if (!src) {
            const annInput = document.querySelector('#annFile');
            if (annInput && annInput.files && annInput.files[0] && annInput.files[0].name) {
              src = String(annInput.files[0].name);
            }
          }
          if (src) {
            const dot = src.lastIndexOf('.');
            const base = dot>0?src.substring(0,dot):src;
            const ext = dot>0?src.substring(dot):'.txt';
            outName = base + '-Reviewed' + ext;
          }
        } catch(e){ /* ignore */ }

        const blob = new Blob([lines.join('\n')], { type: 'text/tab-separated-values;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = outName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(()=> URL.revokeObjectURL(url), 5000);
      } catch (e) {
        console.error('downloadReviewedTable failed', e);
        alert('Failed to save review. See console for details.');
      }
    }

    // wire Save Review button to click handler if present
    (function wireSaveReviewButton(){
      try{
        const btn = document.getElementById('saveReview');
        if(!btn) return;
        btn.addEventListener('click', (ev) => {
          ev.preventDefault();
          downloadReviewedTable();
        });
        // initial state
        updateSaveButtonState();
      }catch(e){ console.error('wireSaveReviewButton failed', e); }
    })();

    // poll for updates (simple, robust)
    let poll = null;
    function startPoll(){
      if(poll) return;
      poll = setInterval(() => {
        try { updateFromSpectro(); } catch(e){ console.error('review_table poll error', e); }
      }, 300);
    }
    startPoll();
    updateFromSpectro();

    window.addEventListener('beforeunload', () => {
      if(poll){ clearInterval(poll); poll = null; }
      // remove listener if present
      try { frame.removeEventListener('wheel', trapWheel); } catch(e){}
    });

    // expose debug and clearSelection for external callers
    window.__review_table = window.__review_table || {};
    window.__review_table.refresh = updateFromSpectro;
    window.__review_table.clearSelection = clearTableSelection;
    window.__review_table._debug = { table, colgroup, thead, tbody };
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', run);
  } else run();
})();
