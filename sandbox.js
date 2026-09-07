/* ============================================================
   SANDBOX.JS — v01.35
   The three-layer system described in the Sandbox vision doc:

     Workshop  — paste/upload/ZIP/drag-drop code, get a compatibility
                 report, run it. Works with NO account — anyone can
                 bring code here and run it.
     App Store — every creator's PUBLISHED creations. Anyone (account
                 or not) can browse, search, and PLAY them. Saving one
                 to your own space requires an account.
     My Space  — an account's own drafts + everything they've added
                 from the App Store. Added items are references to the
                 original creation (creationId), never a copy — if the
                 creator updates their code, everyone who has it
                 "installed" automatically plays the new version next
                 time, the same way the wireless system's shows work.

   Security model (do not weaken this without re-reading the header
   comment in sandbox-adapter.js): every creation runs in an iframe
   with sandbox="allow-scripts" and NO "allow-same-origin". That's what
   actually keeps arbitrary user code from touching Nosirt's accounts,
   cookies, or data — not anything in this file. This file's job is
   just getting code INTO that iframe safely, not enforcing isolation
   itself.
   ============================================================ */

const SANDBOX_ID_REGISTRY = 'nosirt_sandbox_ids';
const SANDBOX_MAX_CODE_CHARS = 350000; // matches the server-side cap in account-update.js

let sbx = {
  files: [],           // [{name, kind, text?, blob?, size}]
  code: '',
  build: '',
  currentCreationId: null,
  currentTitle: 'Untitled Creation',
  currentDesc: '',
  isEditingPublished: false,
  publicCreations: [],
  worldEntries: [],     // resolved {creationId, addedAt, creation} — creation re-fetched live, not cached forever
  view: 'workshop'
};

function sbxEl(id){ return document.getElementById(id); }

function sbxStatus(msg){ const el=sbxEl('sbx-status'); if(el) el.textContent=msg; }
function sbxRenderFiles(){
  const el=sbxEl('sbx-file-list');
  if(!el) return;
  el.innerHTML = sbx.files.map(f=>`<span class="sbx-file-chip">${esc(f.name)} · ${esc(f.kind)}</span>`).join('');
}

// ═══ Intake: paste, multi-file upload, ZIP, drag-and-drop — all guest-accessible ═══

async function sbxReadFile(f){
  const kind = SandboxAdapter.classify(f.name, null);
  if(kind==='asset') return {name:f.name, kind, blob:f, size:f.size};
  return {name:f.name, kind, text: await f.text(), size:f.size};
}
async function sbxAddFiles(list){
  for(const f of list){
    const parsed = await sbxReadFile(f);
    const i = sbx.files.findIndex(x=>x.name===parsed.name);
    if(i<0) sbx.files.push(parsed); else sbx.files[i]=parsed;
  }
  sbxRenderFiles();
  sbxAnalyze();
}
async function sbxLoadJSZip(){
  if(window.JSZip) return;
  await new Promise((ok,no)=>{
    const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    s.onload=ok; s.onerror=no; document.head.appendChild(s);
  });
}
async function sbxUnzipOrAdd(f){
  if(!/\.zip$/i.test(f.name)) return sbxAddFiles([f]);
  await sbxLoadJSZip();
  const zip = await JSZip.loadAsync(f);
  const entries = Object.values(zip.files).filter(x=>!x.dir);
  for(const entry of entries){
    const blob = await entry.async('blob');
    await sbxAddFiles([new File([blob], entry.name)]);
  }
}

function sbxAnalyze(){
  const code = sbxEl('sbx-code') ? sbxEl('sbx-code').value : '';
  const report = SandboxAdapter.inspect(code, sbx.files);
  const hasWarn = report.some(x=>x.level==='warn');
  const pill = sbxEl('sbx-pill');
  if(pill){ pill.textContent = hasWarn?'REVIEW':'READY'; pill.className='sbx-pill '+(hasWarn?'warn':'good'); }
  const summary = sbxEl('sbx-summary');
  if(summary) summary.textContent = `${report.length} compatibility check${report.length===1?'':'s'} completed.`;
  const body = sbxEl('sbx-report-body');
  if(body) body.innerHTML = report.map(x=>
    `<div class="sbx-item"><strong><span class="sbx-dot ${x.level}"></span>${esc(x.title)}</strong><span>${esc(x.detail)}</span></div>`
  ).join('') || '<div class="sbx-empty">Paste code or upload a project.</div>';
}

async function sbxRun(){
  const code = sbxEl('sbx-code') ? sbxEl('sbx-code').value : '';
  if(!code.trim() && !sbx.files.length){ sbxStatus('Nothing to run yet'); return; }
  sbxStatus('Adapting…');
  try{
    sbx.code = code;
    sbx.build = await SandboxAdapter.build(code, sbx.files);
    const frame = sbxEl('sbx-runner');
    if(frame) frame.srcdoc = sbx.build;
    sbxStatus('Running');
    const consoleEl = sbxEl('sbx-console');
    if(consoleEl) consoleEl.textContent = '';
    const titleEl = sbxEl('sbx-run-title');
    if(titleEl) titleEl.textContent = (sbxEl('sbx-title-input')&&sbxEl('sbx-title-input').value) || 'Live preview';
    // v01.37: Run now takes you straight to the full-page canvas — no
    // more squeezing the actual result into a small panel alongside
    // everything else. Back to Write is always one tap away.
    sbxShowSubView('run');
  }catch(e){
    sbxStatus('Adapter error');
    console.error('Sandbox build error:', e);
    toast("couldn't adapt that code — check the console for details");
  }
}

window.addEventListener('message', e=>{
  if(!e.data || e.data.source!=='nosirt-sandbox') return;
  const consoleEl = sbxEl('sbx-console');
  if(!consoleEl) return;
  if(e.data.type==='error'){
    consoleEl.textContent = 'Error: ' + (e.data.data && e.data.data.message || 'unknown error');
    consoleEl.classList.add('sbx-console-error');
  } else if(e.data.type==='ready'){
    consoleEl.classList.remove('sbx-console-error');
  }
});

// ═══ Asset storage — images/audio/etc. in a saved or published
// creation need REAL persistent URLs, not the ephemeral blob URLs the
// adapter uses for a live-but-unsaved run (those die on page reload
// and can never be shared). Uploaded once per creation, reused after. ═══

async function sbxUploadAssets(creationId){
  const assetFiles = sbx.files.filter(f=>f.kind==='asset' && f.blob);
  if(!assetFiles.length || !storage) return {};
  const urls = {};
  for(const f of assetFiles){
    try{
      const ref = storage.ref().child(`sandbox_assets/${creationId}/${f.name}`);
      await ref.put(f.blob);
      urls[f.name] = await ref.getDownloadURL();
    }catch(e){ console.warn('asset upload failed for', f.name, e.message); }
  }
  return urls;
}

// ═══ Save (private draft) + Publish (App Store) — both require an account ═══

function sbxRequireAccount(actionLabel){
  if(!S.account){ toast(`sign in to ${actionLabel}`); return false; }
  return true;
}

async function sbxSaveDraft(){
  if(!sbxRequireAccount('save to your space')) return;
  const title = (sbxEl('sbx-title-input').value||'').trim() || 'Untitled Creation';
  const desc = (sbxEl('sbx-desc-input').value||'').trim();
  const code = sbxEl('sbx-code').value||'';
  const totalChars = code.length + sbx.files.reduce((n,f)=>n+(f.text?f.text.length:0),0);
  if(totalChars > SANDBOX_MAX_CODE_CHARS){
    toast('too large to save — 350KB text limit (large images/audio should be uploaded as assets, not pasted)');
    return;
  }
  const id = sbx.currentCreationId || ('sbx'+Date.now()+'_'+Math.random().toString(36).slice(2,8));
  sbxStatus('Saving…');
  const assetUrls = await sbxUploadAssets(id);
  const filesPayload = sbx.files.map(f=>{
    // v01.35: when editing an existing creation, previously-uploaded
    // assets arrive with f.url already set (no f.blob, since nothing
    // new was picked) — sbxUploadAssets() correctly skips re-uploading
    // those, but that also means assetUrls[f.name] is undefined for
    // them. Falling back to f.url here is what stops a re-save from
    // silently wiping out already-uploaded asset references.
    if(f.kind==='asset') return {name:f.name, kind:f.kind, url: assetUrls[f.name]||f.url||null};
    return {name:f.name, kind:f.kind, text:f.text};
  });
  const creation = {
    id, title, description:desc, code, files:filesPayload,
    owner: S.account.username
  };
  const res = await callAccountUpdate({action:'saveSandboxCreation', username:S.account.username, token:S.account.token, creation});
  if(!res.ok){ toast(res.error||"couldn't save"); sbxStatus('Save failed'); return; }
  sbx.currentCreationId = id;
  sbxStatus('Saved to your space');
  toast('saved to your space');
}

async function sbxPublish(){
  if(!sbxRequireAccount('publish to the App Store')) return;
  if(!sbx.currentCreationId){ await sbxSaveDraft(); if(!sbx.currentCreationId) return; }
  else { await sbxSaveDraft(); } // make sure the latest edits are saved before publishing
  // v01.35: permanent shortId, same allocation system wireless.js
  // already built — reused here as-is, since allocateShortId() only
  // ever needed a registry collection name, nothing wireless-specific.
  if(typeof allocateShortId==='function'){
    try{
      const existing = await fbGetSandboxCreation(sbx.currentCreationId);
      if(existing && !existing.shortId){
        const shortId = await allocateShortId(SANDBOX_ID_REGISTRY);
        claimShortId(SANDBOX_ID_REGISTRY, shortId, {internalId:sbx.currentCreationId, owner:S.account.username});
        await callAccountUpdate({action:'saveSandboxCreation', username:S.account.username, token:S.account.token,
          creation:{...existing, shortId}});
      }
    }catch(e){ console.warn('sandbox shortId allocation failed:', e.message); }
  }
  const res = await callAccountUpdate({action:'publishSandboxCreation', username:S.account.username, token:S.account.token, creationId:sbx.currentCreationId});
  if(!res.ok){ toast(res.error||"couldn't publish"); return; }
  toast('published — anyone can find it in the App Store now');
  sbxShowView('store');
}

function sbxNewCreation(){
  sbx.currentCreationId = null;
  sbx.files = [];
  sbxEl('sbx-title-input').value = 'My Creation';
  sbxEl('sbx-desc-input').value = '';
  sbxEl('sbx-code').value = '';
  sbxRenderFiles();
  sbxAnalyze();
  sbxSyncHighlight();
  sbxAutoResize(sbxEl('sbx-code'), 220, 640);
  const frame = sbxEl('sbx-runner'); if(frame) frame.srcdoc='';
  sbxStatus('Ready');
  sbxShowSubView('write');
}

// ═══ App Store — public browsing, guest-accessible ═══

function sbxIconFor(name){
  const n=(name||'').toLowerCase();
  if(n.includes('flappy')||n.includes('bird')) return '🐦';
  if(n.includes('blackjack')||n.includes('card')) return '🃏';
  if(n.includes('chess')) return '♟️';
  if(n.includes('music')||n.includes('sound')) return '🎵';
  if(n.includes('calculator')||n.includes('math')) return '🧮';
  if(n.includes('draw')||n.includes('paint')) return '🎨';
  if(n.includes('story')) return '📖';
  return '🧩';
}

function sbxCard(item, opts){
  opts = opts||{};
  const inWorld = (S.account && (sbx.worldEntries||[]).some(w=>w.creationId===item.id));
  return `<article class="sbx-card">
    <div class="sbx-card-icon">${sbxIconFor(item.title)}</div>
    <h3>${esc(item.title)}</h3>
    <p>${esc(item.description||'A Sandbox creation.')}</p>
    <div class="sbx-card-meta">by ${esc(item.owner)} · v${item.version||1}</div>
    <div class="sbx-card-actions">
      <button onclick="sbxPlay('${item.id}')">▶ Open</button>
      ${opts.isWorld
        ? `<button onclick="sbxRemoveFromWorld('${item.id}')">Remove</button>`
        : (inWorld
          ? `<button disabled>Added ✓</button>`
          : `<button class="sbx-primary" onclick="sbxAddToWorld('${item.id}')">+ My Space</button>`)}
      ${opts.isMine ? `<button onclick="sbxEditOwn('${item.id}')">Edit</button>` : ''}
    </div>
  </article>`;
}

function sbxRenderStore(){
  const q = (sbxEl('sbx-search') ? sbxEl('sbx-search').value : '').trim().toLowerCase();
  const items = (sbx.publicCreations||[]).filter(x =>
    !q || `${x.title} ${x.description} ${x.owner}`.toLowerCase().includes(q)
  );
  const grid = sbxEl('sbx-store-grid');
  if(!grid) return;
  grid.innerHTML = items.length ? items.map(x=>sbxCard(x,{isMine:S.account&&x.owner===S.account.username})).join('')
    : `<div class="sbx-empty">No published creations ${q?'match that search':'yet'}.<br><br>${q?'':'Be the first — head to the Workshop and publish something.'}</div>`;
}

let sbxPublicListenerUnsub = null;
function sbxEnsureStoreListener(){
  if(sbxPublicListenerUnsub || typeof fbListenPublicSandboxCreations!=='function') return;
  sbxPublicListenerUnsub = fbListenPublicSandboxCreations(items=>{
    sbx.publicCreations = items||[];
    if(sbx.view==='store') sbxRenderStore();
  });
}

// ═══ My Space — account required ═══

async function sbxRefreshWorld(){
  if(!S.account){ sbx.worldEntries=[]; return; }
  const list = S.account.sandboxWorld || [];
  const resolved = [];
  for(const entry of list){
    // Live-fetched every time, not cached — this IS the "linked, not
    // copied" behavior: whatever the creator has published right now
    // is what plays, automatically, with no separate update step.
    const creation = await fbGetSandboxCreation(entry.creationId);
    if(creation) resolved.push({creationId:entry.creationId, addedAt:entry.addedAt, creation});
  }
  sbx.worldEntries = resolved;
}
async function sbxRenderWorld(){
  const grid = sbxEl('sbx-world-grid');
  if(!grid) return;
  grid.innerHTML = `<div class="sbx-empty">Loading your space…</div>`;
  await sbxRefreshWorld();
  const mine = (sbx.myDrafts||[]);
  const items = [...mine.map(c=>({item:c,isMine:true})), ...sbx.worldEntries.map(w=>({item:w.creation,isWorld:true}))];
  grid.innerHTML = items.length ? items.map(x=>sbxCard(x.item,{isMine:x.isMine,isWorld:x.isWorld})).join('')
    : `<div class="sbx-empty">Your space is empty.<br><br>Create something in the Workshop, or add a creation from the App Store.</div>`;
}
async function sbxLoadMyDrafts(){
  if(!S.account || !db){ sbx.myDrafts=[]; return; }
  try{
    const snap = await db.collection('nosirt_sandbox_creations').where('owner','==',S.account.username).get();
    sbx.myDrafts = snap.docs.map(d=>d.data());
  }catch(e){ sbx.myDrafts=[]; }
}

async function sbxAddToWorld(creationId){
  if(!sbxRequireAccount('add this to your space')) return;
  const list = S.account.sandboxWorld || [];
  if(list.some(w=>w.creationId===creationId)){ toast('already in your space'); return; }
  const updated = [...list, {creationId, addedAt:Date.now()}];
  const res = await callAccountUpdate({action:'setSandboxWorld', username:S.account.username, token:S.account.token, world:updated});
  if(!res.ok){ toast(res.error||"couldn't add it"); return; }
  S.account.sandboxWorld = res.world;
  toast('added to your space');
  sbxRenderStore();
}
async function sbxRemoveFromWorld(creationId){
  if(!S.account) return;
  const updated = (S.account.sandboxWorld||[]).filter(w=>w.creationId!==creationId);
  const res = await callAccountUpdate({action:'setSandboxWorld', username:S.account.username, token:S.account.token, world:updated});
  if(!res.ok){ toast(res.error||"couldn't remove it"); return; }
  S.account.sandboxWorld = res.world;
  toast('removed from your space');
  sbxRenderWorld();
}

async function sbxEditOwn(creationId){
  const creation = await fbGetSandboxCreation(creationId);
  if(!creation){ toast("couldn't load that creation"); return; }
  sbx.currentCreationId = creation.id;
  sbx.files = (creation.files||[]).map(f=> f.kind==='asset' ? {name:f.name,kind:'asset',url:f.url} : {name:f.name,kind:f.kind,text:f.text});
  sbxEl('sbx-title-input').value = creation.title;
  sbxEl('sbx-desc-input').value = creation.description||'';
  sbxEl('sbx-code').value = creation.code||'';
  sbxRenderFiles();
  sbxAnalyze();
  sbxSyncHighlight();
  sbxAutoResize(sbxEl('sbx-code'), 220, 640);
  sbxShowView('workshop');
  sbxRun();
}

// ═══ Play — guest-accessible, fetches the CURRENT creation on demand ═══

async function sbxPlay(creationId){
  sbxShowView('play');
  const titleEl = sbxEl('sbx-play-title'), metaEl = sbxEl('sbx-play-meta'), frame = sbxEl('sbx-play-frame');
  if(titleEl) titleEl.textContent = 'Loading…';
  const creation = await fbGetSandboxCreation(creationId);
  if(!creation){ if(titleEl) titleEl.textContent='Not found'; if(metaEl) metaEl.textContent="that creation doesn't exist (or was removed)."; return; }
  if(titleEl) titleEl.textContent = creation.title;
  if(metaEl) metaEl.textContent = `by ${creation.owner} · version ${creation.version||1}`;
  // Assets on a saved/published creation carry real persistent Storage
  // URLs already (see sbxUploadAssets) — pass those straight through so
  // the adapter doesn't try to make ephemeral blob URLs for them.
  const persistentUrls = {};
  (creation.files||[]).forEach(f=>{ if(f.kind==='asset' && f.url) persistentUrls[f.name]=f.url; });
  const filesForBuild = (creation.files||[]).map(f=> f.kind==='asset' ? {name:f.name,kind:'asset'} : f);
  try{
    const built = await SandboxAdapter.build(creation.code||'', filesForBuild, persistentUrls);
    if(frame) frame.srcdoc = built;
  }catch(e){
    if(metaEl) metaEl.textContent = "this creation couldn't be adapted to run: " + e.message;
  }
}

// ═══ View switching ═══

function sbxShowView(view){
  sbx.view = view;
  document.querySelectorAll('.sbx-view').forEach(v=>v.classList.remove('active'));
  const el = sbxEl('sbx-view-'+view);
  if(el) el.classList.add('active');
  document.querySelectorAll('.sbx-nav-btn').forEach(b=>b.classList.toggle('active', b.dataset.sbxView===view));
  if(view==='store'){ sbxEnsureStoreListener(); sbxRenderStore(); }
  if(view==='world'){ sbxLoadMyDrafts().then(sbxRenderWorld); }
}

function initSandboxPage(){
  if(sbxEl('sbx-code') && !sbxEl('sbx-code').value) sbxNewCreation();
  sbxUpdateAiCredits((typeof S!=='undefined' && S.adminUnlocked) ? null : 5);
  document.querySelectorAll('[data-sbx-view]').forEach(btn=>{
    btn.addEventListener('click', ()=>sbxShowView(btn.dataset.sbxView));
  });
  document.querySelectorAll('[data-sbx-subview]').forEach(btn=>{
    btn.addEventListener('click', ()=>sbxShowSubView(btn.dataset.sbxSubview));
  });
  const codeEl = sbxEl('sbx-code');
  if(codeEl){
    codeEl.addEventListener('input', ()=>{
      sbxAnalyze();
      sbxSyncHighlight();
      sbxAutoResize(codeEl, 220, 640);
    });
    codeEl.addEventListener('scroll', sbxSyncHighlight);
    sbxAutoResize(codeEl, 220, 640);
  }
  const promptEl = sbxEl('sbx-ai-prompt');
  if(promptEl){
    promptEl.addEventListener('input', ()=>sbxAutoResize(promptEl, 44, 300));
    promptEl.addEventListener('keydown', e=>{
      if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); sbxSubmitAiPrompt(); }
    });
  }
  const searchEl = sbxEl('sbx-search');
  if(searchEl) searchEl.addEventListener('input', sbxRenderStore);
  const filesInput = sbxEl('sbx-files-input');
  if(filesInput) filesInput.addEventListener('change', async e=>{
    for(const f of e.target.files){ try{ await sbxUnzipOrAdd(f); }catch(x){ toast(`couldn't import ${f.name}: ${x.message}`); } }
    e.target.value='';
  });
  const dropZone = sbxEl('sbx-drop');
  if(dropZone){
    let dragDepth=0;
    document.addEventListener('dragenter', e=>{ if(sbx.view!=='workshop')return; dragDepth++; dropZone.classList.add('on'); });
    document.addEventListener('dragleave', e=>{ if(sbx.view!=='workshop')return; dragDepth--; if(dragDepth<=0)dropZone.classList.remove('on'); });
    document.addEventListener('dragover', e=>{ if(sbx.view!=='workshop')return; e.preventDefault(); });
    document.addEventListener('drop', async e=>{
      if(sbx.view!=='workshop')return;
      e.preventDefault(); dragDepth=0; dropZone.classList.remove('on');
      for(const f of e.dataTransfer.files){ try{ await sbxUnzipOrAdd(f); }catch(x){ toast(`couldn't import ${f.name}: ${x.message}`); } }
    });
  }
  sbxAnalyze();
  sbxSyncHighlight();
}

// ═══ Ask Sandbox's built-in AI to write the code — v01.36 ═══
// Deliberately code-only: a "hi" prompt gets nothing back, not chat.
// 5 prompts/day per account (or per IP if signed out), admin exempt —
// enforced server-side in pixie-chat.js, this is just the UI for it.

// ═══ Sub-view switching within Workshop (Write <-> Run) — v01.37 ═══
function sbxShowSubView(view){
  document.querySelectorAll('.sbx-subview').forEach(v=>v.classList.remove('active'));
  const el = sbxEl('sbx-sub-'+view);
  if(el) el.classList.add('active');
  document.querySelectorAll('[data-sbx-subview]').forEach(b=>b.classList.toggle('active', b.dataset.sbxSubview===view));
}

// ═══ Auto-resizing inputs — the prompt box and code box grow to fit
// whatever's typed/pasted/generated, rather than staying a fixed size
// with an internal scrollbar. ═══
function sbxAutoResize(el, minPx, maxPx){
  el.style.height = 'auto';
  const h = Math.max(minPx||0, maxPx?Math.min(el.scrollHeight,maxPx):el.scrollHeight);
  el.style.height = h+'px';
}

// ═══ Lightweight syntax highlighter — v01.37 ═══
// No dependency, single regex pass over comments/strings/tags/keywords/
// numbers, in priority order so a keyword inside a string never gets
// re-colored as a keyword, etc. Good enough to look like a real editor
// for the HTML/JS/CSS mixes Sandbox actually deals with; not a full
// per-language parser.
const SBX_TOKEN_RE = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(<\/?[a-zA-Z][\w-]*|\/?>)|(\b(?:function|const|let|var|if|else|for|while|return|class|new|this|true|false|null|undefined|typeof|async|await|break|continue|switch|case|default|try|catch|finally|throw|import|export|from|of|in|do|extends|super|static|get|set|yield|delete|instanceof|void)\b)|(\b\d+\.?\d*\b)/g;
function sbxHighlightCode(code){
  if(!code) return '';
  let out='', last=0, m;
  SBX_TOKEN_RE.lastIndex=0;
  while((m=SBX_TOKEN_RE.exec(code))){
    out += esc(code.slice(last, m.index));
    const cls = m[1]?'sbx-tok-comment' : m[2]?'sbx-tok-string' : m[3]?'sbx-tok-tag' : m[4]?'sbx-tok-keyword' : 'sbx-tok-number';
    out += `<span class="${cls}">${esc(m[0])}</span>`;
    last = m.index + m[0].length;
  }
  out += esc(code.slice(last));
  return out;
}
function sbxSyncHighlight(){
  const codeEl = sbxEl('sbx-code'), hl = sbxEl('sbx-code-highlight');
  if(!codeEl || !hl) return;
  hl.querySelector('code').innerHTML = sbxHighlightCode(codeEl.value) + '\n';
  hl.scrollTop = codeEl.scrollTop;
  hl.scrollLeft = codeEl.scrollLeft;
}

function sbxUpdateAiCredits(remaining){
  const el = sbxEl('sbx-ai-credits');
  if(!el) return;
  if(remaining==null){ el.textContent = '∞ ⚡'; el.classList.remove('empty'); return; }
  el.textContent = `${remaining}/5 ⚡`;
  el.classList.toggle('empty', remaining<=0);
}

async function sbxSubmitAiPrompt(){
  const input = sbxEl('sbx-ai-prompt');
  const btn = sbxEl('sbx-ai-submit');
  const prompt = (input.value||'').trim();
  if(!prompt){ toast('describe what you want built first'); return; }
  btn.disabled = true; btn.classList.add('sbx-thinking'); btn.textContent = 'Thinking…';
  try{
    const res = await fetch('/.netlify/functions/pixie-chat', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        mode: 'sandboxCode',
        prompt,
        isAdmin: !!(typeof S!=='undefined' && S.adminUnlocked),
        username: (typeof S!=='undefined' && S.account) ? S.account.username : null
      })
    });
    const data = await res.json();
    if(!data.ok){ toast(data.error || "couldn't generate that"); return; }
    if(data.remaining!=null) sbxUpdateAiCredits(data.remaining);
    if(!data.code || !data.code.trim()){
      toast("that doesn't look like a coding request — try describing something to build, like \"a calculator\" or \"flappy bird\"");
      return;
    }
    await sbxTypewriteCode(data.code);
    input.value = '';
    sbxAutoResize(input, 44, 300);
    sbxAnalyze();
  }catch(e){
    console.error('sandbox AI request failed:', e);
    toast("couldn't reach the AI right now");
  }finally{
    btn.disabled = false; btn.classList.remove('sbx-thinking'); btn.textContent = 'Generate';
  }
}

// Types the generated code into the editor a chunk at a time, rather
// than dumping it in instantly — matches the "watching code appear"
// feel of an AI actually writing it, not just a paste.
// v01.37: types the generated code in like it's being written live —
// small random-ish burst sizes so it doesn't look like a robotic fixed
// tick, syntax-highlighted and auto-resized every frame so the color
// and box size both keep pace with the text instead of popping in only
// once typing finishes.
function sbxTypewriteCode(fullText){
  return new Promise(resolve=>{
    const codeEl = sbxEl('sbx-code');
    if(!codeEl){ resolve(); return; }
    codeEl.value = '';
    codeEl.classList.add('sbx-typing');
    let i = 0;
    const BASE_CHUNK = Math.max(1, Math.round(fullText.length/300)); // finishes in ~1.5-2s regardless of length
    const step = ()=>{
      i += BASE_CHUNK + Math.floor(Math.random()*BASE_CHUNK); // slight variance = feels less mechanical
      codeEl.value = fullText.slice(0, i);
      sbxSyncHighlight();
      sbxAutoResize(codeEl, 220, 640);
      codeEl.scrollTop = codeEl.scrollHeight;
      if(i < fullText.length){ requestAnimationFrame(step); }
      else{
        codeEl.value = fullText;
        sbxSyncHighlight();
        sbxAutoResize(codeEl, 220, 640);
        codeEl.classList.remove('sbx-typing');
        resolve();
      }
    };
    requestAnimationFrame(step);
  });
}
