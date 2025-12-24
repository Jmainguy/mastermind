// Mastermind frontend - cleaned and consolidated
(function(){
  // ---------- State ----------
  let gameID = null;
  let codeLength = 4;
  let colors = 6;
  let attemptsMax = 10;
  let currentRow = 0;
  let boardState = [];
  let selectedColor = null;
  let slotElems = [];
  let resultElems = [];
  let rowElems = [];
  let nextFillIndex = 0; // next index to auto-fill in the current row
  let pendingGuess = false; // guard to avoid duplicate submits
  let confettiAnimId = null;
  let confettiStopped = false;

  const colorHexes = ['#ef4444','#3b82f6','#f59e0b','#10b981','#8b5cf6','#ec4899','#6366f1','#14b8a6','#6b7280','#9ca3af'];

  // ---------- Utilities ----------
  const $ = id => document.getElementById(id);

  function safeText(el, text){ if(el) el.textContent = text; }

  // ---------- Server API ----------
  async function startNewGame(){
    codeLength = parseInt($('codeLength')?.value || 4, 10) || 4;
    // cap colors to 10 maximum to avoid missing hex entries
    colors = Math.min(10, parseInt($('colors')?.value || 6, 10) || 6);
    const attempts = parseInt($('attempts')?.value || 10, 10) || 10;

    const res = await fetch('/api/new', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({codeLength, colors, attempts})
    });
    const data = await res.json();

    gameID = data.id;
    attemptsMax = data.attemptsMax || attempts;

    boardState = Array.from({length: attemptsMax}, ()=> Array(codeLength).fill(null));
    currentRow = 0; selectedColor = null; nextFillIndex = 0; pendingGuess = false;

    // if there are many attempts, enable compact mode for denser layout
    if(attemptsMax >= 10) document.body.classList.add('mm-compact'); else document.body.classList.remove('mm-compact');

    renderBoard(); renderPalette();
    const gameArea = $('gameArea'); if(gameArea) gameArea.classList.remove('hidden');
    safeText($('showCodeLength'), codeLength);
    safeText($('showColors'), colors);
    safeText($('status'), `Attempts left: ${data.attemptsLeft}`);
    // ensure board is scrolled to the top (first row) on new game
    setTimeout(()=> scrollToCurrentRow(), 50);
  }

  async function postGuess(guess){
    const res = await fetch('/api/guess', {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({id:gameID, guess})
    });
    return res.json();
  }

  // ---------- Rendering ----------
  function clearChildren(el){ if(!el) return; while(el.firstChild) el.removeChild(el.firstChild); }

  function renderBoard(){
    const board = $('board'); if(!board) return; clearChildren(board);

    slotElems = Array.from({length:attemptsMax}, ()=> Array(codeLength).fill(null));
    resultElems = Array.from({length:attemptsMax}, ()=> Array(codeLength).fill(null));
    rowElems = Array(attemptsMax).fill(null);

    for(let r=0;r<attemptsMax;r++){
      // use tighter spacing if compact mode is enabled
      const compact = document.body.classList.contains('mm-compact');
      const row = document.createElement('div'); row.className='flex items-center justify-between ' + (compact ? 'py-0.5 px-2 text-xs' : 'py-1 px-2');
      if(r===currentRow) row.classList.add('bg-blue-50','ring-1','ring-blue-200');

      const left = document.createElement('div'); left.className='flex items-center space-x-3';
      const number = document.createElement('div'); number.className='w-5 text-sm text-gray-600'; number.textContent = (attemptsMax - r);
      left.appendChild(number);

      const slots = document.createElement('div'); slots.className='flex space-x-2';
      for(let c=0;c<codeLength;c++){
          const s = document.createElement('div');
          s.className = (compact ? 'w-6 h-6 sm:w-8 sm:h-8' : 'w-8 h-8 sm:w-9 sm:h-9') + ' rounded-full border flex items-center justify-center bg-gray-100 cursor-pointer';
        s.dataset.row = r; s.dataset.col = c;
        const val = (boardState[r] && boardState[r][c] !== undefined) ? boardState[r][c] : null;
        s.style.backgroundColor = val===null ? '#f3f4f6' : (colorHexes[val] || '');

        s.addEventListener('click', ()=>{
          if(r !== currentRow) return; // only allow editing current row
          if(selectedColor === null) return; // require a selected palette color

          // prefer to auto-fill at nextFillIndex, but allow clicking a column
          const placeIndex = nextFillIndex < codeLength ? nextFillIndex : parseInt(s.dataset.col, 10);
          boardState[r][placeIndex] = selectedColor;
          const target = slotElems[r][placeIndex]; if(target) target.style.backgroundColor = colorHexes[selectedColor] || '';
          nextFillIndex = Math.min(codeLength, placeIndex + 1);
        });

        slots.appendChild(s); slotElems[r][c] = s;
      }

      left.appendChild(slots);
      const right = document.createElement('div'); right.className='grid grid-cols-2 gap-1 w-14 h-8';
      for(let i=0;i<codeLength;i++){ const rp = document.createElement('div'); rp.className='w-3 h-3 rounded-full bg-gray-200 border'; right.appendChild(rp); resultElems[r][i] = rp; }

      row.appendChild(left); row.appendChild(right); board.appendChild(row); rowElems[r] = row;
    }
    // ensure current row is visible after render
    setTimeout(()=> scrollToCurrentRow(), 30);
  }

  function scrollToCurrentRow(){
    try{
      const el = rowElems[currentRow]; if(!el) return;
      const board = $('board'); if(!board) return;
      const rect = el.getBoundingClientRect(); const bRect = board.getBoundingClientRect();
      // if the row is outside board view, scroll it into view centered
      if(rect.top < bRect.top || rect.bottom > bRect.bottom){
        el.scrollIntoView({behavior:'smooth', block:'center'});
      }
    }catch(e){}
  }

  function renderPalette(){
    const pal = $('palette'); if(!pal) return; clearChildren(pal);
    const paletteCount = Math.min(colors, 10);
    for(let i=0;i<paletteCount;i++){
      const b = document.createElement('button');
      // responsive button sizes: slightly smaller on very small screens
      b.className = 'w-9 h-9 sm:w-10 sm:h-10 rounded-full border flex-shrink-0'; b.dataset.value = i; b.style.backgroundColor = colorHexes[i] || '';
      b.addEventListener('click', ()=>{
        if(currentRow >= attemptsMax) return;
        const placeIndex = nextFillIndex < codeLength ? nextFillIndex : codeLength - 1;
        boardState[currentRow][placeIndex] = i;
        const target = slotElems[currentRow] && slotElems[currentRow][placeIndex]; if(target) target.style.backgroundColor = colorHexes[i] || '';
        nextFillIndex = Math.min(codeLength, placeIndex + 1);
        selectedColor = i;
        // visual selection
        Array.from(pal.children).forEach(ch => ch.classList.remove('ring-4','ring-offset-2','ring-blue-300'));
        b.classList.add('ring-4','ring-offset-2','ring-blue-300');
      });
      pal.appendChild(b);
    }
  }

  // ---------- Handlers ----------
  async function guessHandler(){
    const guessBtn = $('guessBtn');
    if(pendingGuess) return; // extra guard
    if(!gameID) return alert('Start a new game');

    const guess = (boardState[currentRow] || []).map(v => v === undefined ? null : v);
    if(guess.length !== codeLength || guess.some(v => v === null)) return alert('Fill all slots in the current row');

    pendingGuess = true; if(guessBtn) guessBtn.disabled = true;
    try{
      const data = await postGuess(guess);

      // render feedback pegs (black = exact, white = partial)
      let idx = 0;
      for(let i=0;i<(data.exact||0);i++){ const peg = resultElems[currentRow][idx++]; if(peg){ peg.style.backgroundColor='black'; peg.style.border='none'; }}
      for(let i=0;i<(data.partial||0);i++){ const peg = resultElems[currentRow][idx++]; if(peg){ peg.style.backgroundColor='white'; peg.style.border='1px solid #9ca3af'; peg.style.boxShadow='0 0 0 2px rgba(156,163,175,0.08)'; }}
      for(; idx<codeLength; idx++){ const peg = resultElems[currentRow][idx]; if(peg){ peg.style.backgroundColor='#e5e7eb'; peg.style.border='1px solid #d1d5db'; peg.style.boxShadow='none'; }}

      safeText($('status'), `Attempts left: ${data.attemptsLeft}`);

      if(data.won){ celebrate(data.secret); }
      else if(data.lost){ showLoss(data.secret); playSadTone(); }
      else {
        // move to next row
        const prev = currentRow; currentRow = Math.min(attemptsMax-1, currentRow + 1);
        nextFillIndex = 0; selectedColor = null;
        if(rowElems[prev]) rowElems[prev].classList.remove('bg-blue-50','ring-1','ring-blue-200');
        if(rowElems[currentRow]) rowElems[currentRow].classList.add('bg-blue-50','ring-1','ring-blue-200');
        const pal = $('palette'); if(pal) Array.from(pal.children).forEach(ch=>ch.classList.remove('ring-4','ring-offset-2','ring-blue-300'));
        setTimeout(()=> scrollToCurrentRow(), 40);
      }
    } catch(e){ console.error('guess failed', e); alert('Network error during guess'); }
    finally{ pendingGuess = false; if(guessBtn) guessBtn.disabled = false; }
  }

  function undoHandler(){
    if(nextFillIndex === 0) return;
    const idx = Math.max(0, nextFillIndex - 1);
    boardState[currentRow][idx] = null;
    const target = slotElems[currentRow] && slotElems[currentRow][idx]; if(target) target.style.backgroundColor = '#f3f4f6';
    nextFillIndex = idx;
  }

  function showLoss(secret){
    const cele = $('celebrate'); if(!cele) return;
    // ensure overlay text is always populated (fixes missing text on second playthrough)
    const titleEl = $('celeTitle'); const msgEl = $('celeMessage');
    safeText(titleEl, 'You Lost');
    safeText(msgEl, 'Good try — here is the code. Have another go!');
    const secretDiv = $('celeSecret'); if(secretDiv) { secretDiv.innerHTML = ''; if(Array.isArray(secret)){ secret.forEach(v=>{ const dot = document.createElement('div'); dot.className='inline-block w-6 h-6 rounded-full mr-2 border'; dot.style.backgroundColor = colorHexes[v] || '#e5e7eb'; secretDiv.appendChild(dot); }); } }
    cele.classList.remove('opacity-0'); cele.classList.add('opacity-100'); cele.style.pointerEvents='auto'; cele.style.display='flex';
    runConfetti(80,'#9ca3af');
  }

  function celebrate(secret){
    const cele = $('celebrate'); if(!cele) return;
    // ensure text is present every time we show the overlay
    safeText($('celeTitle'), 'You Won!');
    safeText($('celeMessage'), 'Nice job — the code has been cracked.');
    const secretDiv = $('celeSecret'); if(secretDiv){ secretDiv.innerHTML = ''; if(Array.isArray(secret) && secret.length){ secret.forEach(v=>{ const dot = document.createElement('div'); dot.className='inline-block w-6 h-6 rounded-full mr-2 border'; dot.style.backgroundColor = colorHexes[v] || '#e5e7eb'; secretDiv.appendChild(dot); }); } }
    cele.classList.remove('opacity-0'); cele.classList.add('opacity-100'); cele.style.pointerEvents='auto'; cele.style.display='flex';
    runConfetti(150);
    try{ playHappyMelody(); }catch(e){ /* ignore audio errors */ }
  }

  // ---------- Sound helpers ----------
  function playSadTone(){
    const Ctx = window.AudioContext || window.webkitAudioContext; if(!Ctx) return;
    const ctx = new Ctx(); const now = ctx.currentTime;
    // C, C, D, D, E7, G, G, D, D, E7, A, A, D, D, E7, F, F, E7, E7, D
    const notes = [130, 130, 146, 146, 164, 25, 25, 146, 146, 164, 220, 220, 146, 146, 164, 174, 174, 164, 164, 146]; // default mournful sequence (Hz)
    const dur = 0.6; // each note duration
    const gainPeak = 0.06;

    notes.forEach((freq, i) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(freq, now + i * dur);
      o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0, now + i * dur);
      g.gain.linearRampToValueAtTime(gainPeak, now + i * dur + 0.05);
      g.gain.linearRampToValueAtTime(0.0001, now + i * dur + dur);
      o.start(now + i * dur);
      o.stop(now + i * dur + dur + 0.02);
    });
  }

  function playHappyMelody(){
    const Ctx = window.AudioContext || window.webkitAudioContext; if(!Ctx) return;
    const ctx = new Ctx(); const now = ctx.currentTime;
    const notes = [880,660,990,880]; // short joyful desc/asc
    const dur = 0.18;
    notes.forEach((freq,i)=>{
      const o = ctx.createOscillator(); const g = ctx.createGain(); o.type='sine'; o.frequency.setValueAtTime(freq, now + i*dur);
      o.connect(g); g.connect(ctx.destination); g.gain.setValueAtTime(0, now + i*dur); g.gain.linearRampToValueAtTime(0.12, now + i*dur + 0.02);
      g.gain.linearRampToValueAtTime(0.0001, now + i*dur + dur);
      o.start(now + i*dur); o.stop(now + i*dur + dur + 0.02);
    });
  }

  function runConfetti(count, fixedColor){
    const confDiv = $('confetti'); if(!confDiv) return; confDiv.innerHTML = '';
    const c = document.createElement('canvas'); c.width = window.innerWidth; c.height = window.innerHeight; confDiv.appendChild(c);
    const ctx = c.getContext('2d'); const pieces = [];
    for(let i=0;i<count;i++){ pieces.push({ x: Math.random()*c.width, y: Math.random()*c.height - c.height, r: Math.random()*6+3, dx:(Math.random()-0.5)*(fixedColor?1.5:4), dy: Math.random()*(fixedColor?2:3)+1, color: fixedColor || colorHexes[Math.floor(Math.random()*colors)] || '#f59e0b' }); }
    let t = 0; confettiStopped = false;
    function draw(){ if(confettiStopped) return; ctx.clearRect(0,0,c.width,c.height); for(const p of pieces){ ctx.fillStyle = p.color; ctx.beginPath(); ctx.ellipse(p.x,p.y,p.r,p.r*0.6,0,0,Math.PI*2); ctx.fill(); p.x += p.dx; p.y += p.dy; p.dy += fixedColor?0.02:0.05; if(p.y > c.height + 50){ p.y = -10; p.x = Math.random()*c.width; p.dy = Math.random()*(fixedColor?2:3)+1; } } t++; if(t < 600) confettiAnimId = requestAnimationFrame(draw); }
    draw();
  }

  async function hideOverlayAndStartNew(){
    const cele = $('celebrate'); if(cele){ cele.classList.add('opacity-0'); cele.style.pointerEvents='none'; cele.style.display='none'; }
    confettiStopped = true; if(confettiAnimId) { cancelAnimationFrame(confettiAnimId); confettiAnimId = null; }
    const confDiv = $('confetti'); if(confDiv) confDiv.innerHTML = '';
    safeText($('celeTitle'), ''); safeText($('celeMessage'), ''); if($('celeSecret')) $('celeSecret').innerHTML = '';
    try{ await startNewGame(); } finally { confettiStopped = false; }
  }

  // ---------- Setup: attach listeners once ----------
  let listenersInstalled = false;
  function setup(){
    if(listenersInstalled) return; listenersInstalled = true;
    const newBtn = $('newBtn'); if(newBtn) newBtn.addEventListener('click', startNewGame);
    const guessBtn = $('guessBtn'); if(guessBtn) guessBtn.addEventListener('click', guessHandler);
    const undoBtn = $('undoBtn'); if(undoBtn) undoBtn.addEventListener('click', undoHandler);
    const playAgainBtn = $('playAgain'); if(playAgainBtn) playAgainBtn.addEventListener('click', ()=> hideOverlayAndStartNew());

    // small auto-start after DOM ready to ensure elements exist
    setTimeout(()=>{ const nb = $('newBtn'); if(nb) nb.click(); }, 100);
  }

  window.addEventListener('DOMContentLoaded', setup);
  window.addEventListener('load', setup);

  // expose for debugging in console (only when needed)
  window.__mm = { _state: () => ({gameID, codeLength, colors, attemptsMax, currentRow, pendingGuess}), startNewGame };

})();
