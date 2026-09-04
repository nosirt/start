/* ============================================================
   ACCOUNTS.JS — v01.24 real accounts (no password), profile emoji
   Load this AFTER core.js, BEFORE chat.js (chat.js's send functions
   check S.account, and its presence heartbeat carries the avatar).

   HOW LOGIN WORKS (see account-auth.js for the server-side half):
   This browser can hold saved credentials for MULTIPLE accounts (in
   case someone makes more than one, or several people share a device
   and each make their own). Only ONE is "active" at a time.
     n_saved_accounts  → { username: token, username2: token2, ... }
     n_active_account  → the currently active username, or '' if
                          logged out (but still saved for next time)

   "Sign in / sign up" is a SINGLE action, matching the request for one
   button: if this browser already has a saved token for that exact
   username, it verifies with that token (login). If not, it attempts
   to create the account fresh (signup). A username that's taken AND
   not already saved in this browser fails with a clear message — by
   design, there is no password-based recovery path.

   Logging out only clears the ACTIVE pointer, not the saved token —
   so switching back later on the same browser doesn't require
   remembering anything or losing access.
   ============================================================ */

// ═══ Local credential storage ═══

function getSavedAccounts(){
  try { return JSON.parse(localStorage.getItem('n_saved_accounts') || '{}'); }
  catch(e){ return {}; }
}
function saveSavedAccounts(map){
  localStorage.setItem('n_saved_accounts', JSON.stringify(map));
}
function getActiveAccountUsername(){
  return localStorage.getItem('n_active_account') || '';
}
function setActiveAccountUsername(username){
  localStorage.setItem('n_active_account', username || '');
}

// ═══ Init — called once from enterSite() in map-layout.js ═══
// Silently re-verifies the active account (if any) against the server
// on load, so avatar/name/playlist changes made elsewhere show up, and
// so a token that's somehow gone stale gets caught early rather than
// failing later on a DM send.
async function initAccounts(){
  const active = getActiveAccountUsername();
  if(!active) { renderAccountPanel(); return; }
  const saved = getSavedAccounts();
  const token = saved[active];
  if(!token){ setActiveAccountUsername(''); renderAccountPanel(); return; }

  const res = await callAccountAuth({ action:'verify', username:active, token });
  if(res.ok){
    S.account = {
      username: res.username, displayName: res.displayName,
      token: res.token, avatarEmoji: res.avatarEmoji, playlist: res.playlist || [],
      savedItems: res.savedItems || [], sandboxWorld: res.sandboxWorld || []
    };
  } else {
    // Token no longer matches server-side (rare — e.g. data was reset).
    // Don't nuke the saved credential automatically; just show logged out.
    S.account = null;
  }
  renderAccountPanel();
  // Nudge presence immediately so the avatar/name shows correctly to
  // others right away instead of waiting for the next 20s heartbeat.
  if(typeof startPresenceHeartbeat==='function' && db) fbSavePresence(S.userId, { id:S.userId, num:getChatNum(), displayName:getDisplayLabel(), avatarEmoji:getDisplayAvatar(), ts:Date.now() });
  if(S.account && typeof startDmListening==='function') startDmListening();
}

async function callAccountAuth(payload){
  try{
    const res = await fetch('/.netlify/functions/account-auth', {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)
    });
    return await res.json();
  } catch(e){
    return { ok:false, error:"Couldn't reach the account system. Try again in a moment." };
  }
}
async function callAccountUpdate(payload){
  try{
    const res = await fetch('/.netlify/functions/account-update', {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)
    });
    return await res.json();
  } catch(e){
    return { ok:false, error:"Couldn't reach the account system. Try again in a moment." };
  }
}

// ═══ Sign in / sign up — single action ═══

async function handleSignInOrUp(){
  const input = $('account-username-input');
  const errorDiv = $('account-error');
  if(!input) return;
  const rawUsername = input.value.trim();
  if(errorDiv) errorDiv.textContent = '';

  if(rawUsername.length < 2){
    if(errorDiv) errorDiv.textContent = 'username must be at least 2 characters.';
    return;
  }

  const normalized = rawUsername.toLowerCase().replace(/[^a-z0-9_\-]/g,'').slice(0,20);
  const saved = getSavedAccounts();
  const existingToken = saved[normalized];

  let res;
  if(existingToken){
    res = await callAccountAuth({ action:'login', username:rawUsername, token:existingToken });
  } else {
    res = await callAccountAuth({ action:'signup', username:rawUsername });
  }

  if(!res.ok){
    if(errorDiv) errorDiv.textContent = res.error || 'something went wrong.';
    return;
  }

  saved[res.username] = res.token;
  saveSavedAccounts(saved);
  setActiveAccountUsername(res.username);
  S.account = {
    username: res.username, displayName: res.displayName,
    token: res.token, avatarEmoji: res.avatarEmoji, playlist: res.playlist || [],
    savedItems: res.savedItems || [], sandboxWorld: res.sandboxWorld || []
  };
  input.value = '';
  renderAccountPanel();
  toast(existingToken ? `welcome back, ${res.displayName}` : `account created — welcome, ${res.displayName}`);
  if(db) fbSavePresence(S.userId, { id:S.userId, num:getChatNum(), displayName:getDisplayLabel(), avatarEmoji:getDisplayAvatar(), ts:Date.now() });
  if(typeof renderChatMessages==='function') renderChatMessages();
  if(typeof startDmListening==='function') startDmListening();
}

function handleAccountLogout(silent){
  setActiveAccountUsername(''); // keeps the saved token — just deactivates
  S.account = null;
  S.adminUnlocked = false;
  // Reset hidden state on logout
  if(typeof presenceHidden !== 'undefined'){
    presenceHidden = false;
    localStorage.removeItem('n_presence_hidden');
  }
  renderAccountPanel();
  if(!silent) toast('logged out — your account is still saved on this browser');
  if(db) fbSavePresence(S.userId, { id:S.userId, num:getChatNum(), displayName:getDisplayLabel(), avatarEmoji:null, ts:Date.now() });
  if(typeof renderChatMessages==='function') renderChatMessages();
  if(typeof stopDmListening==='function') stopDmListening();
  if(typeof renderDmView==='function') renderDmView();
}

// ═══ Avatar emoji ═══

// Best-effort client-side check so people get instant feedback instead
// of waiting on a round trip — the server (account-update.js) is the
// real authority and re-validates independently.
function isSingleEmojiClient(str){
  if(!str) return false;
  try{
    const seg = [...new Intl.Segmenter('en',{granularity:'grapheme'}).segment(str)];
    if(seg.length !== 1) return false;
    return /\p{Extended_Pictographic}/u.test(seg[0].segment);
  } catch(e){
    // Intl.Segmenter not supported in this browser — fall back to a
    // looser check and let the server have final say.
    return str.trim().length > 0 && str.trim().length <= 8;
  }
}


// v01.27: curated emoji picker
const EMOJI_PICKER_SETS = [
  { label: 'faces', emojis: ['🙂','😊','😌','😎','🥺','😏','😤','😴','🤔','😶','🥹','😇','🤭','😈','👻','💀','🧸','🫠','😑','🥸','🥶','🤯','😮‍💨','🫡'] },
  { label: 'nature', emojis: ['🌿','🍄','🌸','🌙','⭐','🌊','🔥','🌪','❄','🌈','🌑','☁','🌾','🍂','🌺','🦋','🐚','🌻','🌵','🪨'] },
  { label: 'creatures', emojis: ['🐈','🦊','🐉','🦉','🐺','🐸','🐇','🦌','🐝','🦑','🐙','🦂','🐦‍⬛','🪼','🦚','🐠','🦋','🐈‍⬛','🦇','🐓'] },
  { label: 'objects', emojis: ['📖','🎵','✨','🕯','🗝','⚔','🏹','🧩','🎩','🎭','🔮','📜','🪄','💫','🎪','🧪','🪞','🫀','🧲','🎀'] },
  { label: 'symbols', emojis: ['⚡','♾','🌀','☽','✦','🔺','💧','🩸','♟','🎲','⚙','🔱','⚜','🪬','🧿','✝','☯','🌐','🔐','⛧'] }
];

let emojiPickerOpen = false;

function toggleEmojiPicker(){
  const panel = $('emoji-picker-panel');
  if(!panel) return;
  emojiPickerOpen = !emojiPickerOpen;
  panel.style.display = emojiPickerOpen ? 'block' : 'none';
  if(emojiPickerOpen) renderEmojiPickerGrid();
}

function renderEmojiPickerGrid(){
  const grid = $('emoji-picker-grid');
  if(!grid) return;
  grid.innerHTML = EMOJI_PICKER_SETS.map(cat =>
    '<div style="width:100%;margin-bottom:8px">' +
      '<div style="font-size:.58rem;color:var(--fog);opacity:.45;margin-bottom:4px;font-style:italic">' + cat.label + '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:3px">' +
        cat.emojis.map(e =>
          '<button data-emoji="'+e+'" onclick="pickEmojiFromBtn(this)" style="background:none;border:none;font-size:1.4rem;cursor:pointer;' +
          'padding:3px;border-radius:6px;line-height:1;transition:background .15s" ' +
          'onmouseover="this.style.background=\'rgba(200,137,42,.2)\'" ' +
          'onmouseout="this.style.background=\'none\'">' + e + '</button>'
        ).join('') +
      '</div></div>'
  ).join('');
}

function pickEmojiFromBtn(btn){
  const emoji = btn ? btn.getAttribute('data-emoji') : null;
  if(emoji) pickEmoji(emoji);
}

async function pickEmoji(emoji){
  if(!S.account){ toast('sign in first'); return; }
  toggleEmojiPicker();
  const res = await callAccountUpdate({ action:'setAvatar', username:S.account.username, token:S.account.token, avatarEmoji:emoji });
  if(!res.ok){ toast(res.error || "couldn't update"); return; }
  S.account.avatarEmoji = res.avatarEmoji;
  renderAccountPanel();
  toast('face updated ✓');
  if(db) fbSavePresence(S.userId, { id:S.userId, num:getChatNum(), displayName:getDisplayLabel(), avatarEmoji:getDisplayAvatar(), ts:Date.now(), hidden:presenceHidden });
}

// Close picker when clicking outside it
document.addEventListener('click', e => {
  if(!emojiPickerOpen) return;
  const panel = $('emoji-picker-panel');
  if(!panel) return;
  if(!panel.contains(e.target) && !e.target.closest('button[onclick*="toggleEmojiPicker"]')){
    emojiPickerOpen = false;
    panel.style.display = 'none';
  }
});

async function handleAvatarEmojiChange(inputEl){
  if(!S.account){ toast('sign in first'); return; }
  const raw = inputEl.value;
  if(!isSingleEmojiClient(raw)){
    toast('pick just one emoji');
    inputEl.value = S.account.avatarEmoji || '🙂';
    return;
  }
  const res = await callAccountUpdate({ action:'setAvatar', username:S.account.username, token:S.account.token, avatarEmoji:raw });
  if(!res.ok){
    toast(res.error || "couldn't update — try again");
    inputEl.value = S.account.avatarEmoji || '🙂';
    return;
  }
  S.account.avatarEmoji = res.avatarEmoji;
  renderAccountPanel();
  toast('face updated');
  // Live to others right away, not just on the next 20s heartbeat.
  if(db) fbSavePresence(S.userId, { id:S.userId, num:getChatNum(), displayName:getDisplayLabel(), avatarEmoji:getDisplayAvatar(), ts:Date.now() });
}

async function handleAccountDisplayNameChange(){
  if(!S.account) return;
  const input = $('account-displayname-input');
  if(!input) return;
  const name = input.value.trim();
  if(!name){ toast('name cannot be empty'); return; }
  const res = await callAccountUpdate({ action:'setDisplayName', username:S.account.username, token:S.account.token, displayName:name });
  if(!res.ok){ toast(res.error || "couldn't update"); return; }
  S.account.displayName = res.displayName;
  renderAccountPanel();
  toast('name updated');
  if(db) fbSavePresence(S.userId, { id:S.userId, num:getChatNum(), displayName:getDisplayLabel(), avatarEmoji:getDisplayAvatar(), ts:Date.now() });
  if(typeof renderChatMessages==='function') renderChatMessages();
}

// ═══ Rendering ═══

function renderAccountPanel(){
  const loggedOutView = $('account-logged-out');
  const loggedInView = $('account-logged-in');
  if(!loggedOutView || !loggedInView) return;

  if(S.account){
    loggedOutView.style.display = 'none';
    loggedInView.style.display = 'block';
    const avatarEl = $('account-avatar-display');
    if(avatarEl) avatarEl.textContent = S.account.avatarEmoji || '🙂';
    const nameEl = $('account-name-display');
    if(nameEl) nameEl.textContent = S.account.displayName;
  } else {
    loggedOutView.style.display = 'block';
    loggedInView.style.display = 'none';
  }
}

// DM popup and thread UI now live in dm.js (loaded after this file).
