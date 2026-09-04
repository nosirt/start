/* ============================================================
   CORE.JS — shared foundation for the whole site
   Load this FIRST (before every other JS file).
   Contains: Firebase setup, global config, shared state,
   and small helper functions every other file relies on.
   ============================================================ */

// ═══ VERSION HISTORY ═══
// Current release number. Full changelog lives in version-history.js.
const CURRENT_VERSION = '01.35';

// ═══ FIREBASE ═══
const firebaseConfig = {
  apiKey: "AIzaSyBDOV1E15XA04WpTCSoFLoc4SxW4ec0bNw",
  authDomain: "nosirt-197ae.firebaseapp.com",
  projectId: "nosirt-197ae",
  storageBucket: "nosirt-197ae.firebasestorage.app",
  messagingSenderId: "454046464323",
  appId: "1:454046464323:web:a5ff6a23dfcf4f9c9517f6"
};

// db is set after Firebase loads — starts null, safe to call fbSave/fbListen before it's ready
let db = null;
// v01.08: Firebase Storage — only actually used if admin turns on "image
// upload" mode for global chat. Safe to init even if never used.
let storage = null;

function fbInit() {
  try {
    if (typeof firebase !== 'undefined' && !firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    db = firebase.firestore();
    if (typeof firebase.storage === 'function') storage = firebase.storage();
  } catch(e) {
    console.warn('Firebase init failed, using localStorage only:', e.message);
  }
}

function fbSave(docName, data) {
  if (!db) return;
  try { db.collection('nosirt').doc(docName).set(data); } catch(e) {}
}

function fbListen(docName, cb) {
  if (!db) return;
  try {
    db.collection('nosirt').doc(docName).onSnapshot(snap => {
      if (snap && snap.exists) cb(snap.data());
    });
  } catch(e) {}
}

// Stories/novels get their own document each (not crammed into one shared
// blob like posts/recs/episodes) because a full novel's text can be large —
// Firestore caps a single document at ~1MB, so one-doc-per-story scales much better.
function fbSaveStory(id, data) {
  if (!db) return;
  try { db.collection('nosirt_stories').doc(id).set(data); } catch(e) {}
}
function fbDeleteStory(id) {
  if (!db) return;
  try { db.collection('nosirt_stories').doc(id).delete(); } catch(e) {}
}
function fbListenStories(cb) {
  if (!db) return null;
  try {
    return db.collection('nosirt_stories').onSnapshot(snap => {
      const items=[];
      snap.forEach(doc=>items.push(doc.data()));
      cb(items);
    });
  } catch(e) { return null; }
}

// ═══ WIRELESS SHOWS — one doc per show, one doc per episode/video, one
// doc per comment (same one-doc-per-item reasoning as stories above —
// scales fine and each collection just gets listened to as a whole and
// filtered client-side, matching the rest of this app's pattern). ═══
function fbSaveShow(id, data, merge) {
  if (!db) return;
  try { db.collection('nosirt_shows').doc(id).set(data, {merge: !!merge}); } catch(e) {}
}
function fbDeleteShow(id) {
  if (!db) return;
  try { db.collection('nosirt_shows').doc(id).delete(); } catch(e) {}
}
function fbListenShows(cb) {
  if (!db) return;
  try {
    db.collection('nosirt_shows').onSnapshot(snap => {
      const items=[];
      snap.forEach(doc=>items.push(doc.data()));
      cb(items);
    });
  } catch(e) {}
}
function fbSaveShowEpisode(id, data, merge) {
  if (!db) return;
  try { db.collection('nosirt_show_episodes').doc(id).set(data, {merge: !!merge}); } catch(e) {}
}
function fbDeleteShowEpisode(id) {
  if (!db) return;
  try { db.collection('nosirt_show_episodes').doc(id).delete(); } catch(e) {}
}
function fbListenShowEpisodes(cb) {
  if (!db) return null;
  try {
    return db.collection('nosirt_show_episodes').onSnapshot(snap => {
      const items=[];
      snap.forEach(doc=>items.push(doc.data()));
      cb(items);
    });
  } catch(e) { return null; }
}

// v01.35: Sandbox — only public creations are synced client-side (via
// the where() filter), not everyone's private drafts. Full creation
// docs (including code) are fetched on-demand by id when someone
// actually opens/plays one — see sandbox.js — rather than kept in this
// listener, since code payloads are the one thing in this app actually
// worth not blindly syncing to every visitor's browser at once.
function fbListenPublicSandboxCreations(cb) {
  if (!db) return null;
  try {
    return db.collection('nosirt_sandbox_creations').where('isPublic','==',true).onSnapshot(snap => {
      const items=[];
      snap.forEach(doc=>items.push(doc.data()));
      cb(items);
    });
  } catch(e) { return null; }
}
async function fbGetSandboxCreation(id) {
  if (!db) return null;
  try {
    const doc = await db.collection('nosirt_sandbox_creations').doc(id).get();
    return doc.exists ? doc.data() : null;
  } catch(e) { return null; }
}
function fbSaveComment(id, data) {
  if (!db) return;
  try { db.collection('nosirt_comments').doc(id).set(data); } catch(e) {}
}
function fbDeleteComment(id) {
  if (!db) return;
  try { db.collection('nosirt_comments').doc(id).delete(); } catch(e) {}
}
function fbListenComments(cb) {
  if (!db) return null;
  try {
    return db.collection('nosirt_comments').onSnapshot(snap => {
      const items=[];
      snap.forEach(doc=>items.push(doc.data()));
      cb(items);
    });
  } catch(e) {}
}

// ═══ v01.08: GLOBAL CHAT — one doc per message (same pattern as posts/
// comments/etc above). "Delete on next visit" cleanup for messages older
// than 24h happens in chat.js (cleanupOldChatMessages), not here. ═══
function fbSaveChatMsg(id, data) {
  if (!db) return;
  try { db.collection('nosirt_chat_global').doc(id).set(data); } catch(e) {}
}
function fbDeleteChatMsg(id) {
  if (!db) return;
  try { db.collection('nosirt_chat_global').doc(id).delete(); } catch(e) {}
}
function fbListenChatMsgs(cb) {
  if (!db) return;
  try {
    db.collection('nosirt_chat_global').onSnapshot(snap => {
      const items=[];
      snap.forEach(doc=>items.push(doc.data()));
      cb(items);
    });
  } catch(e) {}
}
function fbGetChatMsgsOnce() {
  if (!db) return Promise.resolve([]);
  return db.collection('nosirt_chat_global').get().then(snap=>{
    const items=[]; snap.forEach(doc=>items.push(doc.data())); return items;
  }).catch(()=>[]);
}

// ═══ v01.09: PRESENCE — "who's online" ═══
// One doc per browser, keyed by userId, overwritten every heartbeat.
// There's no real "disconnect" event on Firestore (that's a Realtime
// Database feature), so "online" is inferred client-side as "heartbeat
// seen in the last ~45s" — see ONLINE_THRESHOLD_MS in chat.js.
function fbSavePresence(id, data) {
  if (!db) return;
  try { db.collection('nosirt_presence').doc(id).set(data); } catch(e) {}
}
function fbDeletePresence(id) {
  if (!db) return;
  try { db.collection('nosirt_presence').doc(id).delete(); } catch(e) {}
}
function fbListenPresence(cb) {
  if (!db) return;
  try {
    db.collection('nosirt_presence').onSnapshot(snap => {
      const items=[];
      snap.forEach(doc=>items.push(doc.data()));
      cb(items);
    });
  } catch(e) {}
}

// ═══ v01.13: GENERIC PER-ITEM COLLECTION HELPERS ═══
// Same one-doc-per-item pattern already used above for stories/shows/
// episodes/comments/chat/presence, generalized so posts/recs/screams
// (below) can use it too, instead of the old single-blob-per-collection
// storage. That old pattern (one Firestore doc holding an entire array
// as a JSON string) had a real bug: every write re-uploaded the WHOLE
// array, so two people acting around the same time (e.g. two votes on
// the same post) could silently overwrite each other. Existing bespoke
// helpers (fbSaveStory etc.) are left as-is — they already work and
// don't have the race issue this fixes — this is only used for the new
// posts/recs/screams code below.
function fbSaveItem(collection, id, data) {
  if (!db) return;
  try { db.collection(collection).doc(id).set(data); } catch(e) {}
}
function fbDeleteItem(collection, id) {
  if (!db) return;
  try { db.collection(collection).doc(id).delete(); } catch(e) {}
}
function fbListenCollection(collection, cb) {
  if (!db) return;
  try {
    db.collection(collection).onSnapshot(snap => {
      const items=[];
      snap.forEach(doc=>items.push(doc.data()));
      cb(items);
    });
  } catch(e) {}
}

// v01.24: READ-ONLY lookup of another users account doc (for showing
// their display name/avatar in a DM thread, friend list, etc). This site
// writes straight to Firestore client-side for almost everything else —
// deliberately NOT for nosirt_users. All writes to that collection go
// through account-auth.js / account-update.js (Netlify functions using
// the Admin SDK), which check the account's token first. If Firestore
// security rules for nosirt_users ever allow client writes, that
// server-side check becomes pointless — keep that collection
// write-locked to admin-SDK-only in the Firestore rules console.
function fbGetUserDoc(username){
  if(!db || !username) return Promise.resolve(null);
  return db.collection('nosirt_users').doc(username).get()
    .then(doc=>doc.exists?doc.data():null)
    .catch(()=>null);
}

// v01.24: DMs — read-only listener, filtered to MY threads only via
// array-contains on `participants`. Deliberately NOT a blanket listen
// on the whole nosirt_dms collection (unlike this site's other
// collections) — a DM is supposed to be private, so a browser should
// only ever pull down messages it's actually part of. Sending goes
// through dm-send.js (Admin SDK, token-checked) — this is read-only.
let dmUnsub=null;
function fbListenMyDms(myUsername, cb){
  if(!db || !myUsername) return;
  if(dmUnsub){ try{dmUnsub();}catch(e){} dmUnsub=null; }
  try{
    dmUnsub = db.collection('nosirt_dms')
      .where('participants','array-contains',myUsername)
      .onSnapshot(snap=>{
        const items=[];
        snap.forEach(doc=>items.push(doc.data()));
        cb(items);
      });
  } catch(e){}
}
function fbStopListeningDms(){
  if(dmUnsub){ try{dmUnsub();}catch(e){} dmUnsub=null; }
}
// Proper read-modify-write transaction against a single item's doc.
// mutateFn receives the CURRENT server-side data for that item (not
// whatever stale copy the caller had locally) and returns the updated
// object to save. Used anywhere two people could plausibly act on the
// same item at the same instant (voting/commenting on the same post) —
// each transaction re-reads the latest state before applying its own
// change, so simultaneous actions merge instead of one clobbering the
// other.
async function fbTransactItem(collection, id, mutateFn) {
  if (!db) return null;
  try {
    return await db.runTransaction(async (tx) => {
      const ref = db.collection(collection).doc(id);
      const snap = await tx.get(ref);
      const current = snap.exists ? snap.data() : null;
      const updated = mutateFn(current);
      if (updated) tx.set(ref, updated);
      return updated;
    });
  } catch(e) { console.warn('transaction failed:', e.message); return null; }
}

// One-time migration: posts/recs/screams used to each live as a single
// doc holding the whole collection as a JSON string (see above). This
// moves any existing data into the new per-item collections the first
// time it runs, and does nothing on every run after that (each check is
// "does the new collection already have anything in it?"). Safe to call
// on every page load, from every visitor's browser — whoever gets there
// first does the migration, everyone else's check just finds it already
// done. The old blob docs are left in place afterward as an untouched
// backup, not deleted.
// TODO: remove after v02.00 once the legacy single-doc data migration is no longer needed.
async function ensureLegacyDataMigrated(){
  if(!db)return;
  try{
    const postsSnap=await db.collection('nosirt_posts').limit(1).get();
    if(postsSnap.empty){
      const legacy=await db.collection('nosirt').doc('posts').get();
      const items=legacy.exists?(JSON.parse(legacy.data().v||'[]')||[]):[];
      if(items.length){
        const batch=db.batch();
        items.forEach(p=>{
          // posts already had real ids (e.g. "p1737000000000") from
          // creation — reuse them so this is naturally idempotent even
          // if two browsers race to run the migration at once.
          const id=p.id||('legacy-post-'+items.indexOf(p));
          batch.set(db.collection('nosirt_posts').doc(id),Object.assign({},p,{id}));
        });
        await batch.commit();
      }
    }
  }catch(e){console.warn('posts migration error:',e.message);}

  try{
    const recsSnap=await db.collection('nosirt_recs').limit(1).get();
    if(recsSnap.empty){
      const legacy=await db.collection('nosirt').doc('recs').get();
      const items=legacy.exists?(JSON.parse(legacy.data().v||'null')||[]):[];
      if(items.length){
        const batch=db.batch();
        // recs never had ids — use a deterministic index-based id so
        // concurrent migrations converge on the same docs instead of
        // duplicating. Original array was newest-first; fabricate a
        // descending ts so the new sort-by-ts rendering preserves that
        // same order.
        const baseTs=Date.now();
        items.forEach((r,i)=>{
          const id='legacy-rec-'+i;
          batch.set(db.collection('nosirt_recs').doc(id),Object.assign({},r,{id,ts:r.ts||(baseTs-i)}));
        });
        await batch.commit();
      }
    }
  }catch(e){console.warn('recs migration error:',e.message);}

  try{
    const screamsSnap=await db.collection('nosirt_screams').limit(1).get();
    if(screamsSnap.empty){
      const legacy=await db.collection('nosirt').doc('screams').get();
      const items=legacy.exists?(JSON.parse(legacy.data().v||'[]')||[]):[];
      if(items.length){
        const batch=db.batch();
        items.forEach((s,i)=>{
          const id='legacy-scream-'+i;
          batch.set(db.collection('nosirt_screams').doc(id),Object.assign({},s,{id}));
        });
        await batch.commit();
      }
    }
  }catch(e){console.warn('screams migration error:',e.message);}
}

// Uploads an image for "image upload" chat mode. Enforces type/size
// client-side (server-side Firestore/Storage rules should mirror this —
// see storage.rules). Returns {url, path} or null on failure.
const CHAT_IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5MB
async function fbUploadChatImage(file) {
  if (!storage || !file) return null;
  if (!/^image\//.test(file.type)) { toast('only image files are allowed'); return null; }
  if (file.size > CHAT_IMAGE_MAX_BYTES) { toast('image too big — 5MB max'); return null; }
  try {
    const path = `chat_images/${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    const ref = storage.ref().child(path);
    await ref.put(file);
    const url = await ref.getDownloadURL();
    return { url, path };
  } catch(e) {
    console.warn('chat image upload failed:', e.message);
    toast('image upload failed');
    return null;
  }
}
function fbDeleteChatImage(path) {
  if (!storage || !path) return;
  try { storage.ref().child(path).delete().catch(()=>{}); } catch(e) {}
}

// Paste a free YouTube Data API v3 key here to enable "import playlist" on
// the wireless page. Get one at https://console.cloud.google.com →
// create/select a project → APIs & Services → Library → enable
// "YouTube Data API v3" → Credentials → Create API Key. Free quota
// (10,000 units/day) covers this site's usage many times over.
const YOUTUBE_API_KEY = 'AIzaSyBrv5ZR9ylYgxg2BIr8crg24lge0OWzwpI';

// v01.08: Paste a free GIPHY API key here to enable "GIF search" mode in
// global chat. Get one at https://developers.giphy.com — create a free
// developer account → Create an App → choose "API" → copy the key. New
// keys start as rate-limited "beta" (100 requests/hour), which is
// plenty for a small chat; upgrade later only if you outgrow it.
// (Note: Tenor's API — the other common GIF option — stopped accepting
// new signups in Jan 2026 and shut down entirely on June 30, 2026, so
// GIPHY is the only viable option here now.)
const GIPHY_API_KEY = 'PASTE_YOUR_GIPHY_API_KEY_HERE';


// ═══ CONFIG ═══
let activeMusic=null;
const MUSIC={
  ancient:{src:null,builtIn:true,name:'🏰 Ancient ambience · built in'},
  lofi:{src:'https://ice1.somafm.com/groovesalad-128-mp3',name:'📻 Groove Salad · lofi/ambient'},
  dark:{src:'https://ice1.somafm.com/dronezone-128-mp3',name:'🌑 Drone Zone · dark ambient'},
  podcast:{podcast:true,name:'🎙 The Wireless · podcast'},
};
let synthMusic=null;

const FORUMS=['movies','shows','anime','books','music','venting','shopping','random'];
const BAD=['fuck','shit','cunt','nigger','faggot','retard'];
// Passwords (admin/podcast/keep) are no longer hardcoded here, and as of
// v01.06 they're no longer readable from the browser at all — they live
// only as Netlify environment variables and are checked by a serverless
// function (netlify/functions/check-password.js) via validatePassword()
// below. See README-PASSWORDS.md.

function genId(){const id=(Math.floor(Math.random()*9e9)+1e9)+'';localStorage.setItem('n_uid',id);return id;}

// v01.08: this browser's global-chat display number — "user(#####)".
// Persisted separately from S.userId so it stays a clean 5 digits.
function getChatNum(){
  let n = localStorage.getItem('n_chat_num');
  if(!n){ n = String(Math.floor(10000 + Math.random()*90000)); localStorage.setItem('n_chat_num', n); }
  return n;
}

// ═══ v01.17: DISPLAY IDENTITY — self-reported name (via Pixie), with
// auto-numbering when two people claim the same one. Replaces
// "user(#####)" for chat/posts/comments going forward once set — past
// activity keeps whatever label was baked into it at the time, exactly
// like the rest of this site's "changes apply going forward" pattern.
function sanitizeDisplayName(raw){
  let n=(raw||'').trim();
  n=n.replace(/^(i'?m|i am|my name is|call me|name'?s|it'?s)\s+/i,'').trim();
  n=n.replace(/[\r\n\t]+/g,' ').replace(/\s+/g,' ').trim();
  if(n.length>24)n=n.slice(0,24).trim();
  if(!/[a-zA-Z]/.test(n))return null; // needs at least one letter — keeps it distinct from raw numbers
  n=filt(n); // same profanity filter used everywhere else on the site
  return n||null;
}
function getDisplayLabel(){
  // v01.24: a real account's name takes priority over the anonymous
  // self-reported identity system — if you're logged in, that's who
  // you are, full stop.
  if(S.account && S.account.displayName){
    return S.account.displayName;
  }
  if(S.identity && S.identity.name){
    return S.identity.name + (S.identity.number!=null ? (' '+S.identity.number) : '');
  }
  return 'user('+getChatNum()+')';
}

// v01.24: the emoji "face" shown next to a message/presence entry, if
// the sender is logged into an account. Anonymous visitors (no account)
// simply don't have one — this returns null and callers render nothing.
function getDisplayAvatar(){
  return (S.account && S.account.avatarEmoji) ? S.account.avatarEmoji : null;
}

let identityUnsub=null;
// Watches this browser's claimed-name doc live, so if someone else
// claims the same name later (causing this browser's number to change,
// e.g. bare "Alex" \u2192 "Alex 1"), it catches the update without a
// reload. Sets a pending flag Pixie checks for and mentions next time
// her panel opens.
function startIdentityLiveListener(key){
  if(!db || !key)return;
  if(identityUnsub){ try{identityUnsub();}catch(e){} identityUnsub=null; }
  try{
    identityUnsub = db.collection('nosirt_names').doc(key).onSnapshot(doc=>{
      if(!doc.exists)return;
      const data=doc.data();
      const mine=(data.holders||[]).find(h=>h.userId===S.userId);
      if(!mine)return;
      const prevNumber=S.identity.number;
      S.identity.number=mine.number;
      localStorage.setItem('n_identity_number', mine.number==null?'':String(mine.number));
      if(prevNumber==null && mine.number!=null){
        localStorage.setItem('n_identity_renumber_pending','1');
      }
    });
  }catch(e){}
}

// The actual claim, via a proper transaction so two people claiming the
// same name at nearly the same instant can't corrupt each other's
// state. First holder of a name gets it bare (no number). Anyone after
// that gets the next number \u2014 and if they're specifically the SECOND
// holder, the first holder retroactively gets bumped to "1" in the same
// transaction (the "oh, someone else showed up" moment).
async function claimDisplayName(rawName){
  const name=sanitizeDisplayName(rawName);
  if(!name)return {ok:false};
  const key=name.toLowerCase();
  // v01.21: at most one deliberate name CHANGE after the initial claim.
  // Re-confirming the name you already have doesn't count (isSameAsCurrent).
  // Getting auto-renumbered because someone else claimed your base name
  // doesn't touch this counter at all — that happens via the live
  // listener, not here.
  const isSameAsCurrent = S.identity && S.identity.key===key;
  const setCount=Number(localStorage.getItem('n_identity_set_count')||'0');
  if(!isSameAsCurrent && setCount>=2){
    return {ok:false, locked:true};
  }
  const result=await fbTransactItem('nosirt_names', key, current=>{
    if(!current) return {name, holders:[{userId:S.userId,name,number:null}], nextNumber:2};
    const existing=(current.holders||[]).find(h=>h.userId===S.userId);
    if(existing) return current; // already holds this name, nothing to change
    const holders=(current.holders||[]).slice();
    if(holders.length===1 && holders[0].number==null){
      holders[0]=Object.assign({},holders[0],{number:1});
    }
    const myNumber=current.nextNumber||2;
    holders.push({userId:S.userId,name,number:myNumber});
    return {name, holders, nextNumber:myNumber+1};
  });
  if(!result)return {ok:false};
  const mine=result.holders.find(h=>h.userId===S.userId);
  if(!mine)return {ok:false};
  S.identity={name:mine.name, number:mine.number, key};
  localStorage.setItem('n_identity_name', mine.name);
  localStorage.setItem('n_identity_number', mine.number==null?'':String(mine.number));
  localStorage.setItem('n_identity_key', key);
  if(!isSameAsCurrent){
    localStorage.setItem('n_identity_set_count', String(setCount+1));
  }
  startIdentityLiveListener(key);
  return {ok:true, name:mine.name, number:mine.number, wasFirst: mine.number==null};
}

const S={
  view:'map',mood:null,musicMode:'mood',audioStarted:false,
  currentForum:'movies',forumSort:'new',currentPost:null,
  mapX:0,mapY:0,mapScale:1,
  posts:JSON.parse(localStorage.getItem('n_posts')||'[]'),
  recs:JSON.parse(localStorage.getItem('n_recs')||'null')||[
    {title:'Over the Garden Wall',type:'series',note:'start here. trust.'},
    {title:'Annihilation',type:'film',note:'beautiful and unsettling.'}
  ],
  notes:localStorage.getItem('n_notes')||'',
  screams:JSON.parse(localStorage.getItem('n_screams')||'[]'),
  episodes:JSON.parse(localStorage.getItem('n_episodes')||'[]'),
  library:JSON.parse(localStorage.getItem('n_library')||'[]')||[],
  userId:localStorage.getItem('n_uid')||genId(),
  adminUnlocked:false,
  // v01.07: admin can temporarily "turn off" a world/section from the
  // profile panel. true = active/visible, false = under review. Synced
  // live via Firebase ('features' doc) so it applies for every visitor,
  // and to this browser before the intro banner even renders.
  featureToggles:{garden:true,square:true,forum:true,wireless:true,castle:true,intro:true},
  // v01.08: global chat
  chatSettings:{mediaMode:'off'}, // 'off' | 'gif' | 'upload'
  chatMessages:[],
  chatLastSeenTs:Number(localStorage.getItem('n_chat_seen')||0),
  // v01.14: who's online
  onlinePresence:[],
  // v01.14: living-map environment (location/weather) — see environment.js.
  // hemisphere defaults 'N' until a real location comes back, per the
  // "fall back to north if we truly can't tell" decision.
  environment:{
    ready:false, lat:null, lon:null, hemisphere:'N',
    weatherCode:0, cloudCover:0, precipitation:0, snowfall:0, windSpeed:0,
    isDay:true, sunrise:null, sunset:null, tempC:null, fetchedAt:0
  },
  // v01.14 step 4: admin "preview weather/time" override — this browser
  // only, never synced to Firebase. null = use real weather/time.
  // v01.17: self-reported display identity (name + auto-number),
  // replacing "user(#####)" for this browser once set. See core.js
  // identity helpers below and pixie.js for how it gets set.
  identity:{
    name: localStorage.getItem('n_identity_name')||null,
    number: localStorage.getItem('n_identity_number') ? Number(localStorage.getItem('n_identity_number')) : null,
    key: localStorage.getItem('n_identity_key')||null
  },
  // v01.24: real signed-up account (username, no password — see
  // accounts.js). Separate from the identity system above, which is
  // just a self-reported chat name with no persistence beyond a name
  // string. An account additionally unlocks DMs, a personal playlist,
  // and a profile emoji "face" others can see live. null = logged out —
  // everything else on the site (including the identity system above)
  // works exactly the same as before with no account at all.
  account: null,
  // Pixies tiny bit of conversational memory — what she's currently
  // waiting on a reply for (e.g. 'name'). Cleared after each use.
  pixieAwaiting:null,
  envPreview:null,
};

function filt(t){let s=t||'';BAD.forEach(w=>{s=s.replace(new RegExp(w,'gi'),'***')});return s;}
function esc(s){const d=document.createElement('div');d.textContent=s||'';return d.innerHTML;}
function timeAgo(ts){const d=(Date.now()-ts)/1e3;if(d<60)return'just now';if(d<3600)return~~(d/60)+'m ago';if(d<86400)return~~(d/3600)+'h ago';return~~(d/86400)+'d ago';}
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200);}
function $(id){return document.getElementById(id);}

// ═══ v01.06: SERVER-SIDE PASSWORD VALIDATION (Netlify Function) ═══
// Passwords are no longer stored anywhere the browser can read them.
// This calls a Netlify Function which checks the input against env vars
// on Netlify's servers and returns ONLY true/false — the real password
// value is never sent to the client. See README-PASSWORDS.md for setup.
async function validatePassword(passwordType, inputValue) {
  try {
    const res = await fetch('/.netlify/functions/check-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passwordType, inputValue }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (data.error === 'not_configured') {
      console.warn(`Password "${passwordType}" has no value set in Netlify env vars yet.`);
    }
    return !!data.ok;
  } catch (e) {
    console.error('Password validation error:', e);
    return false;
  }
}

// Fetch site bio (editable by admin)
async function fetchSiteBio() {
  try {
    const docRef = db.collection('site-config').doc('info');
    const doc = await docRef.get();
    if (doc.exists) {
      return doc.data().bio || 'collector of strange things and quiet moments.';
    }
  } catch (e) {
    console.error('Fetch bio error:', e);
  }
  return 'collector of strange things and quiet moments.';
}

// Save site bio (admin only)
async function saveSiteBio(newBio) {
  if (!S.adminUnlocked) {
    toast('admin access required');
    return false;
  }
  try {
    await db.collection('site-config').doc('info').set({ bio: newBio }, { merge: true });
    toast('bio updated');
    return true;
  } catch (e) {
    console.error('Save bio error:', e);
    toast('error saving bio');
    return false;
  }
}
