/* ============================================================
   DM.JS — v01.24 personal messages
   Load AFTER accounts.js and chat.js (uses S.account, getDisplayLabel,
   getDisplayAvatar, esc, toast, $, the chat panel's tab-switching).

   Data model: one Firestore doc per message in 'nosirt_dms', each
   carrying `participants:[from,to]` so a single array-contains query
   (fbListenMyDms in core.js) returns exactly this account's threads —
   nothing else on the site pulls a whole collection for DMs, since
   these are meant to actually be private between two people.

   Sending goes through the dm-send.js Netlify function (token-checked
   server-side) rather than a direct Firestore write, so a message's
   "from" can't be spoofed the way it technically could be for global
   chat (lower stakes there — global chat is public and anonymous by
   default anyway).

   Only accounts can DM each other — anonymous "user(#####)" visitors
   have no persistent identity to send to or receive as, matching the
   boundary already established when accounts were built.
   ============================================================ */

let dmMessages = [];      // all of MY messages across all threads, live-synced
let dmOpenThreadWith = null; // the OTHER username, if a thread is currently open
let dmLastSentAt = 0;
const DM_SEND_COOLDOWN_MS = 1000;
const DM_MAX_LEN = 1000;

// ═══ v01.25: PIXIE AS A DM CONTACT ═══
// Pixie lives in the DM system as a pseudo-account named '__pixie__'.
// Her messages are stored in localStorage (same pixie chat history as before),
// never in Firestore — she's always "online" and never a real user account.
const PIXIE_DM_ID = '__pixie__';
const PIXIE_DM_DISPLAY = '🧚 Pixie';

// Called from pixie.js after each of Pixie's responses to re-render the thread.
function rerenderPixieDmThread(){
  if(dmOpenThreadWith !== PIXIE_DM_ID) return;
  const container = $('chat-tab-personal');
  if(!container) return;
  renderPixieDmThreadView(container);
  updatePersonalTabBadge();
}

// True when the Pixie DM thread is the currently open view.
function isPixieDmOpen(){
  return dmOpenThreadWith === PIXIE_DM_ID;
}

// Entry point — open the Pixie DM thread (called from icon click, online list, etc.)
function openPixieDm(){
  dmOpenThreadWith = PIXIE_DM_ID;
  const container = $('chat-tab-personal');
  if(container) renderPixieDmThreadView(container);
  updatePersonalTabBadge();
  // Kick off first-open greeting if history is empty
  if(typeof loadPixieHistory === 'function'){
    const hist = loadPixieHistory();
    if(!hist.length){
      if(typeof loadPixieLines === 'function'){
        loadPixieLines().then(data=>{
          const isReturning = typeof checkReturnAfterDays==='function' && checkReturnAfterDays();
          if(isReturning && data.returnAfterDays && data.returnAfterDays.length){
            if(typeof addPixieMessage==='function') addPixieMessage('pixie', pickRandom(data.returnAfterDays));
          } else {
            const greeting = (typeof pickLineFromCategory==='function') ? pickLineFromCategory(data.greetings) : null;
            if(typeof addPixieMessage==='function') addPixieMessage('pixie', greeting || "...Hi. What do you want?");
          }
          // Renumber notice or name ask a beat later
          setTimeout(()=>{
            if(localStorage.getItem('n_identity_renumber_pending')==='1'){
              localStorage.removeItem('n_identity_renumber_pending');
              if(typeof loadPixieLines==='function') loadPixieLines().then(d=>{
                const line = typeof pickLineFromCategory==='function' ? pickLineFromCategory(d.special&&d.special.renumberNotice) : null;
                if(typeof addPixieMessage==='function') addPixieMessage('pixie', typeof fillNameTokens==='function' ? fillNameTokens(line||"Oh — someone else called themselves {name}. You're {name} {number} now.") : (line||"You got renumbered."));
              });
            } else if(typeof maybeAskForName==='function' && maybeAskForName()){
              if(typeof loadPixieLines==='function') loadPixieLines().then(d=>{
                const line = typeof pickLineFromCategory==='function' ? pickLineFromCategory(d.special&&d.special.askName) : null;
                if(typeof addPixieMessage==='function') addPixieMessage('pixie', line || "What should I even call you?");
              });
            }
          }, 900);
          if(typeof resetPixieIdleTimers==='function') resetPixieIdleTimers();
        });
      }
    } else {
      if(typeof checkReturnAfterDays==='function') checkReturnAfterDays();
      if(typeof resetPixieIdleTimers==='function') resetPixieIdleTimers();
    }
  }
}

// Renders the Pixie DM thread inside the personal tab container.
function renderPixieDmThreadView(container){
  const history = (typeof loadPixieHistory==='function') ? loadPixieHistory() : [];
  container.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid rgba(200,137,42,.15)">
      <button onclick="closeDmThread()" style="background:none;border:none;color:var(--amber);font-size:1rem;cursor:pointer">←</button>
      <div style="font-family:'Cinzel Decorative',serif;font-size:.85rem;color:var(--amber)">🧚 Pixie</div>
      <div style="font-size:.65rem;color:var(--fog);opacity:.5;font-family:'IM Fell English',serif;font-style:italic">always here • tap her fairy icon too</div>
    </div>
    <div id="pixie-dm-messages" class="chat-messages" style="flex:1"></div>
    <div class="chat-input-bar">
      <input id="pixie-dm-input" class="chat-text-input" type="text" placeholder="say something…" maxlength="300" onkeydown="handlePixieDmInputKeydown(event)">
      <button class="chat-send-btn" onclick="sendPixieDmMessage()">➤</button>
    </div>
  `;
  const msgEl = $('pixie-dm-messages');
  if(!msgEl) return;
  if(!history.length){
    msgEl.innerHTML = `<div class="chat-empty">say hi.</div>`;
  } else {
    history.forEach(h=>{
      const div = document.createElement('div');
      div.className = 'chat-msg' + (h.who==='user' ? ' mine' : '');
      const span = document.createElement('span');
      span.className = 'chat-text';
      span.textContent = h.text;
      div.appendChild(span);
      msgEl.appendChild(div);
    });
    msgEl.scrollTop = msgEl.scrollHeight;
  }
}

function handlePixieDmInputKeydown(e){
  if(e.key==='Enter'){ e.preventDefault(); sendPixieDmMessage(); }
}

function sendPixieDmMessage(){
  const input = $('pixie-dm-input');
  if(!input) return;
  const text = input.value.trim();
  if(!text) return;
  input.value = '';
  // Route through pixie.js's sendPixieMessage logic — but we need to
  // feed it the text directly since the input element it normally reads
  // (pixie-input) no longer exists. We call the core handlers directly.
  if(typeof savePixieHistoryEntry==='function') savePixieHistoryEntry('user', text);
  rerenderPixieDmThread();
  if(typeof bumpPixieAffection==='function') bumpPixieAffection();
  if(typeof resetPixieIdleTimers==='function') resetPixieIdleTimers();
  // Name capture flow
  const wasAwaitingName = (typeof S!=='undefined') && S.pixieAwaiting==='name';
  const unprompted = (typeof detectUnpromptedName==='function') ? detectUnpromptedName(text) : null;
  const nameReplyValid = wasAwaitingName ? ((typeof looksLikeNameReply==='function') && looksLikeNameReply(text)) : true;
  if((wasAwaitingName && nameReplyValid) || unprompted){
    S.pixieAwaiting = null;
    const raw = (wasAwaitingName && nameReplyValid) ? text : unprompted;
    if(typeof loadPixieLines==='function') loadPixieLines().then(async data=>{
      const res = await claimDisplayName(raw);
      if(res.locked){
        if(typeof addPixieMessage==='function') addPixieMessage('pixie', (typeof pickLineFromCategory==='function' ? pickLineFromCategory(data.special&&data.special.nameLocked) : null)||"You already used your one change. Clear your browser data if you really want a new name.");
        return;
      }
      if(!res.ok){ if(typeof addPixieMessage==='function') addPixieMessage('pixie',"That's not really a name I can work with. Try again?"); return; }
      const cat = res.wasFirst?'nameGivenFresh':'nameGivenNumbered';
      const line = (typeof pickLineFromCategory==='function') ? pickLineFromCategory(data.special&&data.special[cat]) : null;
      if(typeof addPixieMessage==='function') addPixieMessage('pixie', (typeof fillNameTokens==='function') ? fillNameTokens(line||(res.wasFirst?`Fine. ${res.name} it is.`:`Someone beat you to that one. You're ${res.name} ${res.number} now.`)) : (line||''));
    });
    return;
  }
  if(wasAwaitingName && !nameReplyValid) S.pixieAwaiting = null;
  // Everything else → Gemini AI (same as before)
  if(typeof sendPixieAiMessage==='function') sendPixieAiMessage(text);
}

// ═══ Popup (tap a name in global chat) ═══

function openDmPopup(username, displayName){
  if(!S.account){ toast('sign in to send a DM'); return; }
  if(username === S.account.username){ toast("that's you"); return; }

  closeDmPopup(); // in case one's already open
  const popup = document.createElement('div');
  popup.id = 'dm-popup';
  popup.style.cssText = [
    'position:fixed','top:50%','left:50%','transform:translate(-50%,-50%)',
    'background:rgba(10,8,6,.98)','border:1px solid rgba(200,137,42,.35)',
    'border-radius:14px','box-shadow:0 8px 32px rgba(0,0,0,.7)','z-index:120',
    'padding:20px','min-width:200px','text-align:center'
  ].join(';');
  popup.innerHTML = `
    <div style="font-family:'Cinzel Decorative',serif;color:var(--amber);font-size:.9rem;margin-bottom:14px">${esc(displayName)}</div>
    <button class="sq-submit" style="width:100%;font-size:.8rem;margin-bottom:8px" onclick="startDmThread('${esc(username)}','${esc(displayName)}')">💬 chat</button>
    <button class="sq-cancel" style="width:100%;font-size:.75rem" onclick="closeDmPopup()">close</button>
  `;
  document.body.appendChild(popup);

  // tap-outside-to-close
  setTimeout(()=>{
    document.addEventListener('click', dmPopupOutsideClick);
  }, 10);
}
function dmPopupOutsideClick(e){
  const popup = $('dm-popup');
  if(popup && !popup.contains(e.target)) closeDmPopup();
}
function closeDmPopup(){
  const popup = $('dm-popup');
  if(popup) popup.remove();
  document.removeEventListener('click', dmPopupOutsideClick);
}

function startDmThread(username, displayName){
  closeDmPopup();
  openChatPanel();
  switchChatTab('personal');
  openDmThread(username);
}

// ═══ Live sync — called once from enterSite() alongside other listeners ═══

function startDmListening(){
  if(!S.account) return;
  fbListenMyDms(S.account.username, items=>{
    dmMessages = items.sort((a,b)=>a.ts-b.ts);
    renderDmView();
  });
}
function stopDmListening(){
  if(typeof fbStopListeningDms==='function') fbStopListeningDms();
  dmMessages = [];
  dmOpenThreadWith = null;
}

// ═══ Deriving threads from the flat message list ═══

function getDmThreads(){
  if(!S.account) return [];
  const mine = S.account.username;
  const byOther = {};
  dmMessages.forEach(m=>{
    const other = m.from === mine ? m.to : m.from;
    if(!byOther[other] || m.ts > byOther[other].lastMessage.ts){
      byOther[other] = byOther[other] || { other, lastMessage:m, unread:0 };
      byOther[other].lastMessage = m;
    }
  });
  // unread = messages FROM the other person, after this thread's last-seen marker
  Object.keys(byOther).forEach(other=>{
    const seenKey = 'n_dm_seen_'+other;
    const lastSeen = Number(localStorage.getItem(seenKey)||0);
    byOther[other].unread = dmMessages.filter(m=>m.from===other && m.to===mine && m.ts>lastSeen).length;
  });
  return Object.values(byOther).sort((a,b)=>b.lastMessage.ts - a.lastMessage.ts);
}

function getTotalDmUnread(){
  return getDmThreads().reduce((sum,t)=>sum+t.unread, 0);
}

// ═══ Rendering — inbox list or open thread, inside the existing
// "personal" tab body (#chat-tab-personal) ═══

function renderDmView(){
  const container = $('chat-tab-personal');
  if(!container) return;

  // v01.25: Pixie thread is always available — no account required.
  if(dmOpenThreadWith === PIXIE_DM_ID){
    renderPixieDmThreadView(container);
    updatePersonalTabBadge();
    return;
  }

  if(!S.account){
    // Not logged in — show Pixie as the only available contact
    container.innerHTML = `<div style="display:flex;flex-direction:column;height:100%">
      <div style="padding:8px;font-size:.7rem;color:var(--fog);opacity:.5;font-family:'IM Fell English',serif;font-style:italic;text-align:center">
        sign in to DM other users
      </div>
      <div class="dm-thread-row" onclick="openPixieDm()"
        style="display:flex;align-items:center;gap:10px;padding:10px;border-bottom:1px solid rgba(200,137,42,.1);cursor:pointer;margin:0 8px">
        <div style="font-size:1.4rem">🧚</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:.8rem;color:var(--amber);font-family:'Cinzel Decorative',serif">Pixie</div>
          <div style="font-size:.72rem;color:var(--fog);opacity:.7">always here</div>
        </div>
        <div style="font-size:.65rem;color:var(--amber);opacity:.6">chat</div>
      </div>
    </div>`;
    return;
  }

  if(dmOpenThreadWith){
    renderDmThreadView(container);
  } else {
    renderDmInboxView(container);
  }
  updatePersonalTabBadge();
}

function renderDmInboxView(container){
  const threads = getDmThreads();
  // v01.25: Pixie is always the first entry — pinned at top of inbox.
  const pixieHistory = (typeof loadPixieHistory==='function') ? loadPixieHistory() : [];
  const pixiePreview = pixieHistory.length
    ? (pixieHistory[pixieHistory.length-1].text||'').slice(0,40) + (pixieHistory[pixieHistory.length-1].text.length>40?'…':'')
    : 'tap to chat';
  const pixieRow = `<div class="dm-thread-row" onclick="openPixieDm()"
    style="display:flex;align-items:center;gap:10px;padding:10px;border-bottom:1px solid rgba(200,137,42,.1);cursor:pointer">
    <div style="font-size:1.4rem">🧚</div>
    <div style="flex:1;min-width:0">
      <div style="font-size:.8rem;color:var(--amber);font-family:'Cinzel Decorative',serif">Pixie</div>
      <div style="font-size:.72rem;color:var(--fog);opacity:.7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(pixiePreview)}</div>
    </div>
    <div style="font-size:.6rem;color:var(--amber);opacity:.7">🟢</div>
  </div>`;

  container.innerHTML = `<div id="dm-inbox-list" style="flex:1;overflow-y:auto;padding:8px 0"></div>`;
  const listEl = $('dm-inbox-list');

  if(!threads.length){
    listEl.innerHTML = pixieRow + `<div style="padding:16px;font-size:.75rem;color:var(--fog);opacity:.6;font-family:'IM Fell English',serif;font-style:italic;text-align:center">tap someone's name in global chat to start a DM</div>`;
    return;
  }
  listEl.innerHTML = pixieRow + threads.map(t=>{
    const preview = t.lastMessage.text
      ? esc(t.lastMessage.text.slice(0,40)) + (t.lastMessage.text.length>40?'…':'')
      : (t.lastMessage.sharedCard ? '📎 shared something' : '');
    const mine = t.lastMessage.from === S.account.username;
    return `<div class="dm-thread-row" onclick="openDmThread('${esc(t.other)}')"
      style="display:flex;align-items:center;gap:10px;padding:10px;border-bottom:1px solid rgba(200,137,42,.1);cursor:pointer">
      <div style="font-size:1.4rem">${esc(t.lastMessage.fromAvatarEmoji||'🙂')}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:.8rem;color:var(--cream);font-family:'Cinzel Decorative',serif">${esc(t.other)}</div>
        <div style="font-size:.72rem;color:var(--fog);opacity:.7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${mine?'you: ':''}${preview}</div>
      </div>
      ${t.unread>0?`<div style="background:var(--amber);color:#1a1208;font-size:.65rem;font-weight:bold;border-radius:10px;padding:2px 7px">${t.unread>9?'9+':t.unread}</div>`:''}
    </div>`;
  }).join('');
}

function openDmThread(username){
  dmOpenThreadWith = username;
  localStorage.setItem('n_dm_seen_'+username, String(Date.now()));
  renderDmView();
}
function closeDmThread(){
  if(dmOpenThreadWith === PIXIE_DM_ID && typeof clearPixieIdleTimers==='function'){
    clearPixieIdleTimers();
  }
  dmOpenThreadWith = null;
  renderDmView();
}

function renderDmThreadView(container){
  const other = dmOpenThreadWith;
  const mine = S.account.username;
  const threadMsgs = dmMessages.filter(m=>m.from===other||m.to===other).filter(m=> (m.from===mine&&m.to===other)||(m.from===other&&m.to===mine) );

  container.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid rgba(200,137,42,.15)">
      <button onclick="closeDmThread()" style="background:none;border:none;color:var(--amber);font-size:1rem;cursor:pointer">←</button>
      <div style="font-family:'Cinzel Decorative',serif;font-size:.85rem;color:var(--amber)">${esc(other)}</div>
    </div>
    <div id="dm-thread-messages" class="chat-messages" style="flex:1"></div>
    <div class="chat-input-bar">
      <button class="chat-send-btn" onclick="openSharePicker({type:'dm', to:'${esc(other)}'})" title="share something">📎</button>
      <input id="dm-thread-input" class="chat-text-input" type="text" placeholder="message ${esc(other)}…" maxlength="1000" onkeydown="handleDmInputKeydown(event)">
      <button class="chat-send-btn" onclick="sendDmMessage()">➤</button>
    </div>
  `;

  const msgEl = $('dm-thread-messages');
  if(!threadMsgs.length){
    msgEl.innerHTML = `<div class="chat-empty">say hi.</div>`;
  } else {
    msgEl.innerHTML = threadMsgs.map(m=>{
      const isMine = m.from === mine;
      let media = '';
      if(m.sharedCard && typeof renderSharedCardHtml==='function') media = renderSharedCardHtml(m.sharedCard, isMine);
      const textPart = m.text ? `<span class="chat-text">${esc(m.text)}</span>` : '';
      return `<div class="chat-msg${isMine?' mine':''}">
        ${textPart}
        ${media}
      </div>`;
    }).join('');
    msgEl.scrollTop = msgEl.scrollHeight;
  }
  // opening the thread marks it seen — refresh the badge/inbox unread count
  localStorage.setItem('n_dm_seen_'+other, String(Date.now()));
  updatePersonalTabBadge();
}

function handleDmInputKeydown(evt){
  if(evt.key==='Enter'){ evt.preventDefault(); sendDmMessage(); }
}

async function sendDmMessage(){
  if(!S.account || !dmOpenThreadWith) return;
  const input = $('dm-thread-input');
  if(!input) return;
  const now = Date.now();
  if(now - dmLastSentAt < DM_SEND_COOLDOWN_MS){ toast('slow down a little'); return; }
  let text = input.value.trim();
  if(!text) return;
  if(text.length > DM_MAX_LEN) text = text.slice(0, DM_MAX_LEN);
  dmLastSentAt = now;
  input.value = '';

  const res = await fetch('/.netlify/functions/dm-send', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ username:S.account.username, token:S.account.token, to:dmOpenThreadWith, text:filt(text) })
  }).then(r=>r.json()).catch(()=>({ok:false,error:"couldn't send — try again"}));

  if(!res.ok){
    toast(res.error || "couldn't send");
    input.value = text; // give it back so they don't lose what they typed
  }
  // no need to manually append the message — fbListenMyDms picks up the
  // new doc live and re-renders, same pattern as global chat
}

// Called by sharing.js's picker when the share context is a DM thread.
async function sendDmSharedCard(toUsername, card){
  if(!S.account) return;
  const now = Date.now();
  if(now - dmLastSentAt < DM_SEND_COOLDOWN_MS){ toast('slow down a little'); return; }
  dmLastSentAt = now;
  const res = await fetch('/.netlify/functions/dm-send', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ username:S.account.username, token:S.account.token, to:toUsername, text:'', sharedCard:card })
  }).then(r=>r.json()).catch(()=>({ok:false,error:"couldn't send — try again"}));
  if(!res.ok) toast(res.error || "couldn't send");
  else toast('shared');
}

// ═══ Personal tab unread badge — same idea as the existing global
// chat unread badge (updateChatUnreadBadge in chat.js), applied to the
// "personal" tab button specifically. ═══
function updatePersonalTabBadge(){
  const btn = $('chat-tabbtn-personal');
  if(!btn) return;
  const unread = getTotalDmUnread();
  let badge = btn.querySelector('.dm-tab-badge');
  if(unread > 0 && !(chatCurrentTab==='personal' && $('chat-panel').classList.contains('open'))){
    if(!badge){
      badge = document.createElement('span');
      badge.className = 'dm-tab-badge';
      badge.style.cssText = 'background:var(--amber);color:#1a1208;font-size:.6rem;font-weight:bold;border-radius:8px;padding:1px 5px;margin-left:5px';
      btn.appendChild(badge);
    }
    badge.textContent = unread>9?'9+':String(unread);
  } else if(badge){
    badge.remove();
  }
}

// Shared-card rendering and the share picker itself now live in
// sharing.js (loaded after this file).
