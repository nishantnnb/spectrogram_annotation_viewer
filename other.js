(function(){
  const place = document.getElementById('otherControlsPlace');
  if(!place) return;

  const wrap = document.createElement('div');
  wrap.style.display = 'flex';
  wrap.style.gap = '8px';
  wrap.style.alignItems = 'center';

  const yLabel = document.createElement('label');
  yLabel.textContent = 'Y preset';
  yLabel.htmlFor = 'yPreset';

  const ySelect = document.createElement('select');
  ySelect.id = 'yPreset';
  ySelect.style.minWidth = '150px';
  [
    {v:'3000', t:'0 - 3 kHz'},
    {v:'10000', t:'0 - 10 kHz'},
    {v:'15000', t:'0 - 15 kHz'},
    {v:'nyq', t:'0 - Nyquist'}
  ].forEach(o=>{
    const opt = document.createElement('option'); opt.value = o.v; opt.textContent = o.t; ySelect.appendChild(opt);
  });

  const xLabel = document.createElement('label');
  xLabel.textContent = 'X zoom';
  xLabel.htmlFor = 'xZoom';

  const xSelect = document.createElement('select');
  xSelect.id = 'xZoom';
  xSelect.style.minWidth = '100px';
  [
    {v:'1', t:'1x'},
    {v:'2', t:'2x'},
    {v:'3', t:'3x'},
    {v:'4', t:'4x'},
    {v:'5', t:'5x'}
  ].forEach(o=>{
    const opt = document.createElement('option'); opt.value = o.v; opt.textContent = o.t; xSelect.appendChild(opt);
  });

  // Annotation Label control (always present visually, but disabled until annotation file loads)
  const annLabelLabel = document.createElement('label');
  annLabelLabel.textContent = 'Annotation Label';
  annLabelLabel.htmlFor = 'annLabel';

  const annLabelSelect = document.createElement('select');
  annLabelSelect.id = 'annLabel';
  annLabelSelect.style.width = '180px';
  annLabelSelect.style.minWidth = '180px';
  annLabelSelect.disabled = true;

  // Always include a blank (empty) option first
  const emptyOpt = document.createElement('option');
  emptyOpt.value = '';
  emptyOpt.textContent = '';
  annLabelSelect.appendChild(emptyOpt);

  wrap.appendChild(yLabel);
  wrap.appendChild(ySelect);
  wrap.appendChild(xLabel);
  wrap.appendChild(xSelect);
  wrap.appendChild(annLabelLabel);
  wrap.appendChild(annLabelSelect);
  place.appendChild(wrap);

  function spectro(){ return window.__spectro || null; }
  function DrawAPI(){ const s = spectro(); return s ? s.Draw : null; }
  function AudioAPI(){ const s = spectro(); return s ? s.Audio : null; }

  function applyYPreset(preset){
    const draw = DrawAPI();
    if(draw){
      draw.clearStampedAnnotations && draw.clearStampedAnnotations();
      draw.redrawAnnotationsOnResume && draw.redrawAnnotationsOnResume();
    }
  }

  function applyXZoom(value){
    const existing = document.getElementById('speed');
    if(existing){
      const num = Number(value);
      if(Number.isFinite(num) && num >= 1){
        existing.value = String(num);
        const ev = new Event('change');
        existing.dispatchEvent(ev);
      }
    }
    const draw = DrawAPI();
    if(draw){
      draw.clearStampedAnnotations && draw.clearStampedAnnotations();
      draw.redrawAnnotationsOnResume && draw.redrawAnnotationsOnResume();
    }
  }

  function populateAnnotationLabelOptions(headers){
    while(annLabelSelect.options.length > 1) annLabelSelect.remove(1);
    if(!headers || !headers.length) return;
    for(let i=0;i<headers.length;i++){
      const h = headers[i] == null ? '' : String(headers[i]);
      const opt = document.createElement('option');
      opt.value = h;
      opt.textContent = h;
      annLabelSelect.appendChild(opt);
    }
  }

  function setAnnotationLabelDefault(headers){
    if(!headers || !headers.length) {
      annLabelSelect.value = '';
      const s = spectro();
      if(s && s.mapping) s.mapping.label = '';
      return;
    }
    const idx = headers.findIndex(h => typeof h === 'string' && h.toLowerCase() === 'scientific name');
    if(idx >= 0){
      annLabelSelect.value = headers[idx];
      const s = spectro();
      if(s && s.mapping) s.mapping.label = headers[idx];
    } else {
      annLabelSelect.value = '';
      const s = spectro();
      if(s && s.mapping) s.mapping.label = '';
    }
  }

  annLabelSelect.addEventListener('change', ()=>{
    const s = spectro();
    if(s && s.mapping) s.mapping.label = annLabelSelect.value || '';
    const draw = DrawAPI();
    if(draw){
      draw.clearStampedAnnotations && draw.clearStampedAnnotations();
      draw.redrawAnnotationsOnResume && draw.redrawAnnotationsOnResume();
    }
  });

  ySelect.addEventListener('change', ()=> {
    applyYPreset(ySelect.value);
    updateDisabledState();
  });

  xSelect.addEventListener('change', ()=> {
    applyXZoom(xSelect.value);
    updateDisabledState();
  });

  function isStopped(){
    const s = spectro();
    if(!s || !s.Audio) return false;
    const audio = s.Audio;
    const hasBuffer = !!audio.getBuffer();
    if(!hasBuffer) return false;
    return !audio.isPlayingNow() && Math.abs(audio.getCurrentPosition() - 0) < 1e-9;
  }

  function updateDisabledState(){
    const s = spectro();
    const audio = s && s.Audio ? s.Audio : null;
    const hasBuffer = audio && !!audio.getBuffer();
    const stopped = hasBuffer && !audio.isPlayingNow() && Math.abs(audio.getCurrentPosition() - 0) < 1e-9;
    ySelect.disabled = !hasBuffer || !stopped;
    xSelect.disabled = !hasBuffer || !stopped;

    const parsed = s && s.parsedAnnotations ? s.parsedAnnotations : null;
    const hasAnnHeaders = parsed && Array.isArray(parsed.headers) && parsed.headers.length > 0;
    annLabelSelect.disabled = !hasAnnHeaders;

    // Update Play-from-start button label based on selection state
    const pf = document.getElementById('playFromStart');
    if(pf){
      const sel = s && typeof s.selectedRowIndex === 'number' && s.selectedRowIndex >= 0;
      pf.textContent = sel ? 'Play from selected' : 'Play from start';
    }
  }

  const poll = setInterval(()=>{
    updateDisabledState();
    const s = spectro();
    if(s && s.parsedAnnotations && Array.isArray(s.parsedAnnotations.headers)){
      const headers = s.parsedAnnotations.headers.slice(0);
      if(annLabelSelect.options.length !== (1 + headers.length)){
        populateAnnotationLabelOptions(headers);
        setAnnotationLabelDefault(headers);
      }
    }
    const audio = AudioAPI();
    if(audio){
      const ctx = audio.getCtx && audio.getCtx();
      if(ctx && ctx.sampleRate){
        applyYPreset(ySelect.value);
      }
    }
  }, 300);

  ySelect.value = '15000';
  xSelect.value = '1';
  annLabelSelect.value = '';
  applyYPreset(ySelect.value);
  applyXZoom(xSelect.value);
  updateDisabledState();

  window.addEventListener('beforeunload', ()=> clearInterval(poll));
})();