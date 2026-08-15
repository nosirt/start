/* ============================================================
   SHARING.JS — v01.26
   Added sendSharedCardToChat() — called directly from wireless.js
   and keep.js share buttons to post a card into global chat.
   ============================================================ */

// Called when a user hits a "share to chat" button anywhere on the site.
// Sends the card directly to global chat (same as the share picker flow
// but without the picker UI step).
function sendSharedCardToChat(card){
  if(typeof sendSharedCard==='function'){
    sendSharedCard(card, {type:'global'});
    toast('shared to chat ✓');
  } else {
    toast('chat not ready');
  }
}

/* ============================================================
   SHARING.JS — v01.24 final slice: share playlist items, recs board
   entries, and forum (n/) posts into chat — global or DM — with a
   clean "save" on the recipient's side.

   Entry point is the 📎 button already added to both the global chat
   input bar and the DM thread input bar (see chat.js / dm.js) —
   both call openSharePicker(context), where context is either
   {type:'global'} or {type:'dm', to:username}. Whichever button was
   tapped decides where the picked item gets sent; the picker itself
   doesn't care which.

   Card shape sent in a message: { kind:'playlist'|'rec'|'post', ...}
     kind:'playlist' → same shape as a playlist item (type/key/name or
                        showTitle/episodeTitle) — saving this on the
                        recipient's side goes straight into THEIR
                        playlist via addToPlaylist(), since it's
                        directly playable there.
     kind:'rec'       → { recId, title, type, note } — saving bookmarks
                        it into the recipient's savedItems (reference
                        only, not playable, so a separate list from
                        the playlist makes sense).
     kind:'post'      → { postId, forum, title, displayName } — same
                        bookmark treatment as recs, plus a "view" link
                        that opens the actual post in the tower if
                        it's still around.

   Load this after chat.js, dm.js, playlist.js, tower.js, square.js —
   though as with the other new files here, only actually matters if
   something in here ran at parse-time; it doesn't, so order is not
   load-bearing, just tidy.
   ============================================================ */

let shareContext = null; // {type:'global'} or {type:'dm', to:username}

// ═══ Picker ═══

function openSharePicker(context){
  if(!S.account){ toast('sign in to share something'); return; }
  shareContext = context;
  const panel = $('share-picker-panel');
  if(!panel) return;
  panel.style.display = 'flex';
  switchShareTab('playlist');
}

function closeSharePicker(){
  const panel = $('share-picker-panel');
  if(panel) panel.style.display = 'none';
  shareContext = null;
}

let shareTabItems = []; // whatever list is currently shown in the picker, indexed by row

function switchShareTab(tab){
  document.querySelectorAll('.share-tab-btn').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
  const body = $('share-tab-body');
  if(!body) return;

  if(tab==='playlist'){
    shareTabItems = ((S.account && S.account.playlist) || []).map(item => ({ kind:'playlist', ...item }));
    if(!shareTabItems.length){ body.innerHTML = emptyShareMsg('nothing in your playlist yet.'); return; }
    body.innerHTML = shareTabItems.map((item,i)=>{
      const label = item.type==='ambient' ? esc(item.name) : `${esc(item.showTitle)} — ${esc(item.episodeTitle)}`;
      const icon = item.type==='ambient' ? '📻' : '🎙';
      return shareRow(icon, label, i);
    }).join('');
  }

  if(tab==='recs'){
    shareTabItems = (S.recs || []).map(r => ({ kind:'rec', recId:r.id, title:r.title, type:r.type, note:r.note||'' }));
    if(!shareTabItems.length){ body.innerHTML = emptyShareMsg('no recs on the board yet.'); return; }
    body.innerHTML = shareTabItems.map((item,i)=>{
      return shareRow('🎬', `${esc(item.title)} <span style="opacity:.6">(${esc(item.type)})</span>`, i);
    }).join('');
  }

  if(tab==='posts'){
    const posts = (S.posts || []).slice().sort((a,b)=>b.ts-a.ts).slice(0,40);
    shareTabItems = posts.map(p => ({ kind:'post', postId:p.id, forum:p.forum, title:p.title, displayName:p.displayName||'' }));
    if(!shareTabItems.length){ body.innerHTML = emptyShareMsg('no posts yet.'); return; }
    body.innerHTML = shareTabItems.map((item,i)=>{
      return shareRow('🗼', `n/${esc(item.forum)} — ${esc(item.title)}`, i);
    }).join('');
  }
}

function emptyShareMsg(text){
  return `<div class="chat-under-construction" style="padding:20px 10px">${text}</div>`;
}
function shareRow(icon, labelHtml, index){
  return `<div class="dm-thread-row" onclick="shareCardNow(shareTabItems[${index}])"
    style="display:flex;align-items:center;gap:10px;padding:10px;border-bottom:1px solid rgba(200,137,42,.1);cursor:pointer">
    <div style="font-size:1.2rem">${icon}</div>
    <div style="flex:1;font-size:.78rem;color:var(--cream);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${labelHtml}</div>
  </div>`;
}

function shareCardNow(card){
  if(!shareContext) return;
  if(shareContext.type==='global'){
    if(typeof sendChatSharedCard==='function') sendChatSharedCard(card);
  } else if(shareContext.type==='dm'){
    if(typeof sendDmSharedCard==='function') sendDmSharedCard(shareContext.to, card);
  }
  closeSharePicker();
}

// ═══ Rendering a received shared card, with a save button ═══
// isMine = true when the CURRENT viewer sent this card themselves —
// saving your own share back to yourself is pointless, so no button.

// Full HTML-attribute-safe escaping for JSON embedded in an onclick="".
// Quote-only escaping isn't enough — an unescaped & in, say, a movie
// title ("Tom & Jerry") can get misread as the start of an HTML entity
// by the parser before it ever reaches the JS engine. Order matters:
// & must be escaped first, or its own escape sequences get re-escaped.
function escAttrJson(obj){
  return JSON.stringify(obj)
    .replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function renderSharedCardHtml(card, isMine){
  if(!card || !card.kind) return '';

  let icon, label, sub = '';
  if(card.kind==='playlist'){
    icon = card.type==='ambient' ? '📻' : '🎙';
    label = card.type==='ambient' ? esc(card.name) : `${esc(card.showTitle)} — ${esc(card.episodeTitle)}`;
  } else if(card.kind==='rec'){
    icon = '🎬';
    label = esc(card.title);
    sub = esc(card.type||'');
  } else if(card.kind==='post'){
    icon = '🗼';
    label = esc(card.title);
    sub = 'n/'+esc(card.forum||'');
  } else {
    return '';
  }

  const saveBtn = isMine ? '' :
    `<button class="wp-ep-btn" style="margin-left:auto" onclick="saveSharedCard(${escAttrJson(card)})">💾 save</button>`;
  const viewBtn = (card.kind==='post') ?
    `<button class="wp-ep-btn" onclick="viewSharedPost('${esc(card.postId)}','${esc(card.forum)}')">view</button>` : '';

  return `<div style="margin-top:6px;padding:8px;border:1px solid rgba(200,137,42,.25);border-radius:8px;display:flex;align-items:center;gap:8px">
    <div style="font-size:1.1rem">${icon}</div>
    <div style="flex:1;min-width:0">
      <div style="font-size:.78rem;color:var(--cream);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${label}</div>
      ${sub?`<div style="font-size:.68rem;color:var(--fog);opacity:.7">${sub}</div>`:''}
    </div>
    ${viewBtn}${saveBtn}
  </div>`;
}

// ═══ Saving a received card ═══

async function saveSharedCard(card){
  if(!S.account){ toast('sign in to save this'); return; }

  if(card.kind==='playlist'){
    // Reuses the exact same function the "+" buttons elsewhere use —
    // same dedupe/cap/error handling, no special-casing needed here.
    const { kind, ...item } = card;
    await addToPlaylist(item);
    return;
  }

  // rec or post — bookmark into savedItems
  const list = (S.account.savedItems || []);
  const dupeKey = card.kind==='rec' ? 'rec:'+card.recId : 'post:'+card.postId;
  if(list.some(i => (i.kind==='rec'?'rec:'+i.recId:'post:'+i.postId) === dupeKey)){
    toast('already saved');
    return;
  }
  if(list.length >= 200){ toast('your saved list is full — remove something first'); return; }
  const updated = [...list, { ...card, savedAt: Date.now() }];
  const res = await callAccountUpdate({ action:'setSavedItems', username:S.account.username, token:S.account.token, savedItems:updated });
  if(!res.ok){ toast(res.error || "couldn't save"); return; }
  S.account.savedItems = res.savedItems;
  toast('saved to your bookmarks');
  if(typeof renderSavedItemsTab==='function') renderSavedItemsTab();
}

function viewSharedPost(postId, forum){
  const post = (S.posts||[]).find(p=>p.id===postId);
  if(!post){ toast("that post isn't around anymore"); return; }
  if(typeof navigateTo==='function') navigateTo('tower');
  if(typeof switchForum==='function') switchForum(forum);
  if(typeof openPost==='function') openPost(postId);
}

// ═══ Bookmarks tab inside the playlist panel ═══
// Reuses the existing playlist-panel chrome (open/close, layout)
// rather than building yet another standalone panel — playlist.js's
// openPlaylistPanel() shows a "playing"/"saved" tab switcher at the
// top; this renders the "saved" side of it.

function renderSavedItemsTab(){
  const el = $('playlist-saved-items');
  if(!el) return;
  const list = (S.account && S.account.savedItems) || [];
  if(!list.length){
    el.innerHTML = emptyShareMsg('nothing bookmarked yet — save a shared rec or post to see it here.');
    return;
  }
  el.innerHTML = list.map((item,i)=>{
    const icon = item.kind==='rec' ? '🎬' : '🗼';
    const label = item.kind==='rec' ? esc(item.title) : `n/${esc(item.forum)} — ${esc(item.title)}`;
    const viewBtn = item.kind==='post'
      ? `<button class="wp-ep-btn" onclick="viewSharedPost('${esc(item.postId)}','${esc(item.forum)}')">view</button>` : '';
    return `<div style="display:flex;align-items:center;gap:8px;padding:8px;border-bottom:1px solid rgba(200,137,42,.1)">
      <div style="font-size:1.1rem">${icon}</div>
      <div style="flex:1;font-size:.78rem;color:var(--cream);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${label}</div>
      ${viewBtn}
      <button class="wp-ep-btn delete" onclick="removeSavedItem(${i})">✕</button>
    </div>`;
  }).join('');
}

async function removeSavedItem(index){
  if(!S.account) return;
  const list = (S.account.savedItems||[]).slice();
  if(index<0||index>=list.length) return;
  list.splice(index,1);
  const res = await callAccountUpdate({ action:'setSavedItems', username:S.account.username, token:S.account.token, savedItems:list });
  if(!res.ok){ toast(res.error || "couldn't remove"); return; }
  S.account.savedItems = res.savedItems;
  renderSavedItemsTab();
}

function switchPlaylistPanelTab(tab){
  document.querySelectorAll('.playlist-panel-tab-btn').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
  const playing = $('playlist-items');
  const transport = $('playlist-transport');
  const saved = $('playlist-saved-items');
  if(!playing || !saved) return;
  if(tab==='playing'){
    playing.style.display = 'block';
    if(typeof renderPlaylistPanel==='function') renderPlaylistPanel();
    saved.style.display = 'none';
  } else {
    playing.style.display = 'none';
    if(transport) transport.style.display = 'none';
    saved.style.display = 'block';
    renderSavedItemsTab();
  }
}
