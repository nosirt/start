/* ============================================================
   SQUARE.JS — "town square" feature
   Load this AFTER core.js.
   Contains: recs list, the community board (notes), and the
   screaming door. All synced through Firebase via fbSave/fbListen.
   ============================================================ */

// ═══ SQUARE ═══
function openTab(tab){
  document.querySelectorAll('.sq-tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.sq-panel').forEach(p=>p.classList.remove('active'));
  document.querySelector(`.sq-tab[onclick="openTab('${tab}')"]`).classList.add('active');
  $('panel-'+tab).classList.add('active');
}
function renderRecs(){
  $('rec-list').innerHTML=S.recs.map(r=>`<div class="rec-item">
    <div class="rec-item-title">${esc(r.title)}</div>
    <div class="rec-item-type">${esc(r.type)}</div>
    ${r.note?`<div class="rec-item-note">${esc(r.note)}</div>`:''}
  </div>`).join('');
}
function addRec(){
  const t=$('rec-title').value.trim();if(!t)return;
  const rec={id:'r'+Date.now()+Math.random().toString(36).slice(2,6),
    title:filt(t),type:$('rec-type').value,note:filt($('rec-note').value.trim()),ts:Date.now()};
  S.recs.unshift(rec);
  fbSaveItem('nosirt_recs',rec.id,rec);
  if(S.recs.length>60){
    const removed=S.recs.pop();
    if(removed&&removed.id)fbDeleteItem('nosirt_recs',removed.id);
  }
  localStorage.setItem('n_recs',JSON.stringify(S.recs));
  renderRecs();$('rec-title').value='';$('rec-note').value='';toast('rec added ✓');
}
function renderNotes(){$('notes-text').value=S.notes;}
function saveNotes(){S.notes=filt($('notes-text').value);localStorage.setItem('n_notes',S.notes);fbSave('notes',{v:S.notes});toast('posted ✓');}
const SCOLS=['#d4a5a5','#b4a5d4','#a5c4d4','#d4c4a5','#c4d4a5'];
// v01.13: render-only now. It used to also filter+re-save S.screams on
// every call — including calls triggered purely by the incoming
// Firebase listener itself — which meant every remote update re-wrote
// the whole collection, which re-triggered the listener, and so on.
// Expiry is now a separate explicit step (cleanupExpiredScreams below).
function renderScreams(){
  const now=Date.now(),wk=7*24*60*60*1e3;
  const visible=S.screams.filter(s=>now-s.ts<wk);
  const v=$('scream-void');if(!v)return;v.innerHTML='';
  visible.forEach((s,i)=>{
    const m=document.createElement('div');m.className='void-message';
    const age=(now-s.ts)/wk;
    m.style.cssText=`left:${8+Math.random()*68}%;top:${8+Math.random()*68}%;
      color:${SCOLS[i%5]};font-size:${.58+Math.random()*.3}rem;opacity:${.8-age*.5};
      --tx:${(Math.random()-.5)*170}px;--ty:${(Math.random()-.5)*170}px;
      animation-duration:${48+Math.random()*50}s;animation-delay:${Math.random()*-28}s;`;
    m.textContent=s.text;v.appendChild(m);
  });
}
// Deletes any screams older than a week — each gets its own delete now
// instead of the whole collection being rewritten. Called once per
// session from the screams listener (see map-layout.js) plus after
// sending a new one, matching the same lazy-cleanup pattern already
// used for global chat.
function cleanupExpiredScreams(){
  const now=Date.now(),wk=7*24*60*60*1e3;
  const expired=S.screams.filter(s=>now-s.ts>=wk);
  if(!expired.length)return;
  expired.forEach(s=>{ if(s.id)fbDeleteItem('nosirt_screams',s.id); });
  S.screams=S.screams.filter(s=>now-s.ts<wk);
  localStorage.setItem('n_screams',JSON.stringify(S.screams));
}
let screamsCleanupSessionDone=false;
function cleanupExpiredScreamsOnce(){
  if(screamsCleanupSessionDone)return;
  screamsCleanupSessionDone=true;
  cleanupExpiredScreams();
}
function sendScream(){
  const t=$('scream-text').value.trim();if(!t)return;
  const scream={id:'s'+Date.now()+Math.random().toString(36).slice(2,6),text:filt(t),ts:Date.now()};
  S.screams.push(scream);
  localStorage.setItem('n_screams',JSON.stringify(S.screams));
  fbSaveItem('nosirt_screams',scream.id,scream);
  renderScreams();$('scream-text').value='';
  const v=$('scream-void');
  v.style.background='radial-gradient(ellipse at center,#2a0520 0%,#050508 70%)';
  setTimeout(()=>{v.style.background='';},450);toast('hurled into the void');
  cleanupExpiredScreams();
}
