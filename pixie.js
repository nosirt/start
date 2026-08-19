/* ============================================================
   PIXIE.JS — v01.17
   Load this AFTER core.js.

   Pixie is a small companion who wanders the screen on her own,
   occasionally flying off and coming back, can be dragged like the
   profile icon, and opens a chat panel when tapped (not dragged).

   Normal replies are AI-backed through pixie-chat.js. pixie-lines.json
   still provides greetings, idle/name flows, and a last-resort local
   fallback when the AI proxy is unavailable.

   v01.17: she can now ask for (or notice, unprompted) your name, which
   becomes your real display identity site-wide (chat/posts/comments)
   going forward — see claimDisplayName()/getDisplayLabel() in core.js.
   This is her one bit of real memory: S.pixieAwaiting tracks that she's
   waiting on a specific reply, cleared right after it's used.

   Lore (for future reference, not yet surfaced in-app beyond hints):
   Pixie is bound to this place by a curse from a wizard, and is
   reluctantly obligated to help anyone who shows up — hence the
   attitude. She's not actually mean, just extremely put-upon about the
   whole thing.
   ============================================================ */

function pickRandom(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

// ═══ v01.16: DIALOGUE DATA — loaded from pixie-lines.json ═══
// Batch 1 of many — external file specifically so it can keep growing
// (toward ~1000 lines) without ever touching this code again. See the
// "_meta" note at the top of that file for the structure.
let PIXIE_LINES=null;
let pixieLastUserMsg=null; // for spam/repeat detection
let pixieLinesLoading=null;
function loadPixieLines(){
  if(PIXIE_LINES)return Promise.resolve(PIXIE_LINES);
  if(pixieLinesLoading)return pixieLinesLoading;
  pixieLinesLoading=fetch('pixie-lines.json').then(r=>r.json()).then(data=>{
    PIXIE_LINES=data;
    return data;
  }).catch(e=>{
    console.warn('pixie lines failed to load, using fallback:',e.message);
    // Minimal safety net so she's never completely silent if the fetch fails
    PIXIE_LINES={
      greetings:{annoyed:["...Give me a second, I'm not all here yet."]},
      topics:{},
      special:{},
      fallback:{annoyed:["Ask me again in a moment — I'm still waking up."]}
    };
    return PIXIE_LINES;
  });
  return pixieLinesLoading;
}

// Mood weighting — baseline annoyed/sarcastic most of the time, with
// rarer bored/caughtOffGuard/sincereCrack moments so she doesn't read as
// one-note. Local mood picking is fallback-only now; normal replies come from the AI proxy.
const PIXIE_MOOD_WEIGHTS=[
  {mood:'annoyed',w:40},{mood:'sarcastic',w:30},{mood:'bored',w:15},
  {mood:'caughtOffGuard',w:10},{mood:'sincereCrack',w:5}
];
function pickPixieMood(){
  const total=PIXIE_MOOD_WEIGHTS.reduce((s,m)=>s+m.w,0);
  let r=Math.random()*total;
  for(const m of PIXIE_MOOD_WEIGHTS){ if(r<m.w)return m.mood; r-=m.w; }
  return 'annoyed';
}
// Pulls one line from a mood-tagged category object, e.g.
// {annoyed:[...], sarcastic:[...]}. Falls back to 'annoyed' if the
// chosen mood has no lines here, then to whatever's available at all.
function pickLineFromCategory(catObj){
  if(!catObj)return null;
  const mood=pickPixieMood();
  let pool=catObj[mood];
  if(!pool||!pool.length)pool=catObj.annoyed;
  if(!pool||!pool.length)pool=Object.values(catObj).flat();
  if(!pool||!pool.length)return null;
  return pickRandom(pool);
}

// Special-intent detection — checked before topic keywords since these
// are more specific. Simple substring/regex matching, not real NLP —
// good enough for a hardcoded placeholder engine.
const PIXIE_SPECIAL_PATTERNS=[
  {key:'rude',re:/\b(fuck you|screw you|shut up|stupid|idiot|hate you|useless)\b/},
  {key:'nice',re:/\b(thank you|thanks|ty|you're the best|good job|appreciate you)\b/},
  {key:'askIfReal',re:/\b(are you real|are you ai|are you human|are you a bot)\b/},
  {key:'flirting',re:/\b(cute|pretty|beautiful|marry me|date me|kiss|i love you)\b/},
  {key:'curseLore',re:/\b(curse|wizard|why are you here|who cursed you|your story)\b/},
  {key:'goodbye',re:/\b(bye|goodbye|see ya|see you|later|gtg|got to go)\b/},
  {key:'futureAiRequest',re:/\b(send me a (video|short)|show me a video|can you actually|are you smart)\b/},
  {key:'sayHi',re:/^\s*(hi|hello|hey|sup|yo)[\s!.]*$/},
  {key:'howAreYou',re:/\b(how are you|how're you|how you doing|how are u)\b/},
  {key:'whatDoing',re:/\b(what are you doing|whatcha doing|what're you up to|what you up to)\b/},
  {key:'apology',re:/\b(sorry|my bad|apologies)\b/},
  {key:'whoAreYou',re:/\b(who are you|what's your name|whats your name)\b/},
  {key:'howOld',re:/\b(how old are you|what's your age)\b/},
  {key:'doYouLikeHumans',re:/\b(do you like humans|do you like people)\b/},
  {key:'tellJoke',re:/\b(tell me a joke|say something funny|make me laugh)\b/},
  {key:'doYouLikeMe',re:/\b(do you like me)\b/},
  {key:'idk',re:/^\s*(i don'?t know|idk|dunno)\s*$/},
  {key:'bored',re:/\bi'?m (so )?bored\b/},
  {key:'tired',re:/\bi'?m (so )?(tired|exhausted|sleepy)\b/},
  {key:'hungry',re:/\bi'?m (so )?hungry\b/},
  {key:'failed',re:/\bi (failed|messed up|screwed up)\b/},
  {key:'scared',re:/\bi'?m (scared|afraid|nervous|anxious)\b/},
  {key:'lonely',re:/\bi'?m (so )?lonely\b/},
  {key:'happyMood',re:/\bi'?m (so )?happy\b/},
  {key:'hateMyself',re:/\bi hate myself\b/},
  {key:'confused',re:/\bi'?m (so )?confused\b/},
  {key:'goodnight',re:/\b(good ?night|gn)\b/},
  {key:'goodmorning',re:/\b(good ?morning|gm)\b/}
];

// Placeholder response engine — this is the ONLY function that needs to
// change when real AI is wired up later (see file header comment).
// v01.19: lightweight "affection" tracking — just a message count, not
// real sentiment analysis. Buckets into low/medium/high, used only for
// the doYouLikeMe response and (lightly) to bias toward warmer flavor
// lines the more someone's talked to her.
function getPixieAffectionTier(){
  const n=Number(localStorage.getItem('n_pixie_msg_count')||'0');
  if(n>=20)return 'high';
  if(n>=5)return 'medium';
  return 'low';
}
function bumpPixieAffection(){
  const n=Number(localStorage.getItem('n_pixie_msg_count')||'0')+1;
  localStorage.setItem('n_pixie_msg_count',String(n));
}

// v01.20: SITE AWARENESS — real weather Q&A + playing/linking content
// directly, instead of only canned tips about these features.
function getRealWeatherLine(){
  const e=S.environment;
  if(!e || !e.ready){
    return "I don't actually know where you are yet. Allow location (or don't — I'm not the boss of you) and I'll give you the real report instead of vibes.";
  }
  const wv=(typeof computeWeatherVisualState==='function')?computeWeatherVisualState():null;
  const temp=(e.tempC!=null)?Math.round(e.tempC):null;
  const wind=(e.windSpeed!=null)?Math.round(e.windSpeed):null;
  let desc='clear';
  if(wv){
    if(wv.kind==='rain')desc='raining';
    else if(wv.kind==='snow')desc='snowing';
    else if(wv.kind==='thunder')desc='thundering, dramatically';
    else if(wv.kind==='fog')desc='foggy';
    else if(wv.kind==='cloudy')desc='cloudy';
  }
  let line=`It's ${desc} where you are`+(temp!=null?`, about ${temp}°C`:'');
  if(wind!=null && wind>=15)line+=`, and windy — ${wind}km/h`;
  line+='. That\'s the real report, not a guess.';
  return line;
}

function pixiePlayMidnightArchive(){
  if(S.featureToggles && S.featureToggles.wireless===false)return null;
  const show=(typeof getMidnightArchiveShow==='function')?getMidnightArchiveShow():((typeof getDefaultShow==='function')?getDefaultShow():null);
  if(!show)return null;
  if(S.currentShowId!==show.id){ S.currentShowId=show.id; if(typeof refreshCurrentShowEpisodes==='function')refreshCurrentShowEpisodes(); }
  const ep=(typeof pickDefaultEpisode==='function')?pickDefaultEpisode():null;
  if(!ep)return null;
  if(typeof loadEpisode==='function')loadEpisode(ep);
  if(typeof activeMusic!=='undefined')activeMusic='podcast';
  if(typeof updateNP==='function')updateNP('🎙 '+ep.title);
  return ep;
}

// Looks up a category by key across the different places it might live
// (special/, emotions/, or a flat top-level array like goodnight).
function resolvePixieCategory(data,key){
  if(data.special && data.special[key]) return data.special[key];
  if(data.emotions && data.emotions[key]) return data.emotions[key];
  if(Array.isArray(data[key])) return data[key]; // flat pool — wrap so pickLineFromCategory still works
  return null;
}
function pickFromResolved(pool){
  if(!pool)return null;
  if(Array.isArray(pool))return pickRandom(pool);
  return pickLineFromCategory(pool);
}

// v01.20: message-shape detection (Pack #3) — reacts to HOW something
// was said when nothing else matched, instead of a flat "I don't
// understand." Order matters: most specific/cheap checks first.
function detectPixieMessageShape(raw){
  const t=(raw||'').trim();
  if(!t)return null;
  if(/^\.{2,}$/.test(t))return 'ellipsisOnly';
  if(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+$/u.test(t))return 'emojiOnly';
  const lower=t.toLowerCase();
  if(/^whatever[.!]?$/.test(lower))return 'whatever';
  if(/^what\??!?$/.test(lower))return 'whatQuestion';
  if(/^why\??!?$/.test(lower))return 'whyQuestion';
  if(t.length>280)return 'veryLong';
  const words=t.split(/\s+/);
  if(words.length===1 && t.length<=14 && /^[a-zA-Z']+$/.test(t))return 'oneWord';
  const lettersOnly=t.replace(/[^a-zA-Z]/g,'');
  if(lettersOnly.length>=6 && words.length===1){
    const vowels=(lettersOnly.match(/[aeiouAEIOU]/g)||[]).length;
    if(vowels/lettersOnly.length<0.2)return 'gibberish';
  }
  if(typeof BAD!=='undefined'){
    let badCount=0;
    BAD.forEach(w=>{ if(new RegExp('\\b'+w+'\\b','i').test(lower))badCount++; });
    if(badCount>=2)return 'swearingExcessive';
    if(badCount===1)return 'swearingPlayful';
  }
  return null;
}

// FALLBACK ONLY — normal Pixie replies are handled by sendPixieAiMessage().
function getPixieResponse(userText){
  const data=PIXIE_LINES;
  if(!data)return "...still waking up. Try that again in a second.";
  const t=(userText||'').toLowerCase();

  if(userText && userText.trim()===pixieLastUserMsg){
    const line=pickFromResolved(data.recovery&&data.recovery.spamRepeat);
    if(line){ pixieLastUserMsg=userText.trim(); return line; }
  }
  pixieLastUserMsg=(userText||'').trim();

  for(const p of PIXIE_SPECIAL_PATTERNS){
    if(p.re.test(t)){
      if(p.key==='doYouLikeMe'){
        const pool=data.special.doYouLikeMe&&data.special.doYouLikeMe[getPixieAffectionTier()];
        if(pool&&pool.length)return pickRandom(pool);
        continue;
      }
      const line=pickFromResolved(resolvePixieCategory(data,p.key));
      if(line)return line;
    }
  }
  for(const key in (data.topics||{})){
    const topic=data.topics[key];
    if(topic.keywords&&topic.keywords.some(k=>t.includes(k))){
      const line=pickLineFromCategory(topic.lines);
      if(line)return line;
    }
  }

  // Pack #3: react to the SHAPE of the message when intent is unclear —
  // gibberish, one word, "whatever", excessive swearing, etc — instead
  // of a flat "I don't understand."
  const shape=detectPixieMessageShape(userText);
  if(shape){
    const line=pickFromResolved(data.recovery&&data.recovery[shape]);
    if(line)return line;
  }

  // Occasional texture instead of always falling back to the generic
  // pool — seasonal awareness (real weather/time from environment.js),
  // running gags, a random observation, or (rarely, and more often
  // once she "knows" someone) a soft/secret-affection moment.
  const roll=Math.random();
  if(roll<0.08 && data.seasonal && typeof computeWeatherVisualState==='function'){
    const wv=computeWeatherVisualState();
    const dn=(typeof computeDayNightPhase==='function')?computeDayNightPhase():null;
    const season=(typeof computeSeason==='function')?computeSeason():null;
    let pool=null;
    if(wv.kind==='rain')pool=data.seasonal.rain;
    else if(wv.kind==='snow')pool=data.seasonal.snow;
    else if(wv.kind==='thunder')pool=data.seasonal.thunder;
    else if(wv.windy)pool=data.seasonal.windy;
    else if(dn && !dn.isDaytime)pool=data.seasonal.night;
    else if(season && data.seasonal[season])pool=data.seasonal[season];
    if(pool&&pool.length)return pickRandom(pool);
  }
  if(roll<0.10 && data.runningGags){
    const gagKeys=Object.keys(data.runningGags);
    const pool=data.runningGags[pickRandom(gagKeys)];
    if(pool&&pool.length)return pickRandom(pool);
  }
  if(roll<0.18 && data.flavor && data.flavor.randomObservations){
    return pickRandom(data.flavor.randomObservations);
  }
  const tier=getPixieAffectionTier();
  if(tier!=='low' && roll<0.24 && data.flavor && data.flavor.rareSoft){
    return pickRandom(data.flavor.rareSoft);
  }
  if(tier==='high' && roll<0.28 && data.flavor && data.flavor.secretAffection){
    return pickRandom(data.flavor.secretAffection);
  }
  // v01.20/21: the fragment combiner (Pack #4) is the main driver of
  // generic replies now — far more combinatorial variety than any
  // fixed pool, since it's built from independent fragment pieces.
  if(roll<0.75){
    const reaction=buildUniversalReaction(data);
    if(reaction)return reaction;
  }

  const finalPool=[].concat(
    data.fallback&&pickLineFromCategory(data.fallback)?[pickLineFromCategory(data.fallback)]:[],
    data.universalRecovery||[],
    (data.flavor&&data.flavor.oneLiners)||[]
  );
  return finalPool.length?pickRandom(finalPool):"Ask me something else.";
}

// ═══ CHAT PANEL ═══
// v01.25: Pixie now lives in the DM system.
// openPixieDmThread() is called from the wandering icon click AND from
// the "who's online" list — opens the chat panel, personal tab, and
// Pixie's DM thread, exactly like opening a human DM.
function openPixieDmThread(){
  if(typeof openChatPanel==='function') openChatPanel();
  if(typeof switchChatTab==='function') switchChatTab('personal');
  if(typeof openPixieDm==='function') openPixieDm();
}

// v01.27: show Pixie's wandering icon only on the map page
function updatePixieIconVisibility(){
  const icon=$('pixie-icon');
  if(!icon)return;
  // S.view is set to 'map' by showMap(), page name by showPage()
  // The old DOM check ($('page-map') / map-viewport.style.display) was
  // always returning true because map-viewport has no inline display:none.
  const isMap = (typeof S!=='undefined') && (S.view==='map' || S.view==null);
  icon.style.display = isMap ? '' : 'none';
  icon.style.pointerEvents = isMap ? 'auto' : 'none';
  if(!isMap){ pixieDragging=false; pixieMoved=false; }
}

// compat shim — any old call to openPixiePanel() (e.g. from action
// tags referencing closePixiePanel/open_wireless) just routes to the DM thread now.
function openPixiePanel(){ openPixieDmThread(); }
function closePixiePanel(){
  // When wireless action needs to close "pixie" and navigate — just do
  // the navigation; the DM thread stays open in background (fine).
  if(typeof gotoWirelessPageDirect==='function') gotoWirelessPageDirect();
}

// Tracks time since her DM was last opened, in this browser. Returns
// true (and resets the clock) if it's been 3+ days.
function checkReturnAfterDays(){
  const last=Number(localStorage.getItem('n_pixie_last_visit')||'0');
  const now=Date.now();
  localStorage.setItem('n_pixie_last_visit',String(now));
  return !!(last && (now-last) > 3*24*60*60*1000);
}

// addPixieMessage — now appends into the DM thread UI (rendered by dm.js).
// The message is stored via savePixieHistoryEntry (localStorage) AND the
// DM thread re-render picks it up immediately without needing Firestore.
function addPixieMessage(who,text,action){
  // Save to persistent history first
  savePixieHistoryEntry(who,text);
  // Re-render the DM thread view if it's currently open
  if(typeof rerenderPixieDmThread==='function') rerenderPixieDmThread();
  // Also handle action buttons — run immediately (v01.23 behaviour)
  if(action && typeof action.fn==='function' && who!=='user'){
    action.fn();
  }
}

function handlePixieInputKeydown(e){ if(e.key==='Enter')sendPixieMessage(); }

// Idle timers — still fire nudges via addPixieMessage (which now goes
// to the DM thread), but only if the thread is currently open.
let pixieIdleShortTimer=null;
let pixieIdleLongTimer=null;
function resetPixieIdleTimers(){
  clearTimeout(pixieIdleShortTimer);
  clearTimeout(pixieIdleLongTimer);
  pixieIdleShortTimer=setTimeout(()=>{
    if(typeof isPixieDmOpen==='function' && !isPixieDmOpen()) return;
    loadPixieLines().then(data=>{ if(data.idleShort&&data.idleShort.length)addPixieMessage('pixie',pickRandom(data.idleShort)); });
  },10*60*1000);
  pixieIdleLongTimer=setTimeout(()=>{
    if(typeof isPixieDmOpen==='function' && !isPixieDmOpen()) return;
    loadPixieLines().then(data=>{ if(data.idleLong&&data.idleLong.length)addPixieMessage('pixie',pickRandom(data.idleLong)); });
  },60*60*1000);
}
function clearPixieIdleTimers(){
  clearTimeout(pixieIdleShortTimer);
  clearTimeout(pixieIdleLongTimer);
}

// Poke (kept for compatibility — now just adds a message to DM thread)
function pokePixie(){
  loadPixieLines().then(data=>{
    const pool=data.flavor&&data.flavor.clickRepeat;
    if(pool&&pool.length)addPixieMessage('pixie',pickRandom(pool));
  });
}

// v01.17: NAME CAPTURE
// Substitutes {name}/{number} tokens in dialogue lines that reference
// the dynamic identity.
function fillNameTokens(line){
  if(!line)return line;
  const name=S.identity&&S.identity.name?S.identity.name:'';
  const number=S.identity&&S.identity.number!=null?String(S.identity.number):'';
  return line.replace(/\{name\}/g,name).replace(/\{number\}/g,number);
}
// Decides whether Pixie should ask for a name right now: always the
// first time ever, then just occasionally after that if she still
// doesn't know it (so she's not nagging every single time you open her).
function maybeAskForName(){
  if(S.identity && S.identity.name)return false;
  const askedBefore=localStorage.getItem('n_pixie_asked_name')==='1';
  if(!askedBefore || Math.random()<0.15){
    localStorage.setItem('n_pixie_asked_name','1');
    S.pixieAwaiting='name';
    return true;
  }
  return false;
}
// Catches someone volunteering a name without being asked — "i'm Alex",
// "my name is Alex", "call me Alex", etc. Requires an explicit marker
// phrase on purpose (per the "be careful, not clever" note) — this is
// NOT used for the "she just asked, this is the reply" case below,
// which has its own, looser check.
function detectUnpromptedName(text){
  const m=/\b(i'?m|i am|my name is|call me|name'?s)\s+([a-zA-Z][a-zA-Z0-9 _-]{0,23})\b/i.exec(text);
  return m?m[2]:null;
}
// v01.21 FIX: previously, once she asked for a name, the ENTIRE next
// message got treated as the answer no matter what it was — so asking
// her "what's your name?" back got swallowed as an attempted name
// claim. Now a reply only counts as a name if it either uses an
// explicit marker phrase, OR is short and plain (no question mark, no
// sentence structure) — a bare "Dash" or "Sarah" passes; "what's your
// name" (a question) does not.
function looksLikeNameReply(text){
  const t=(text||'').trim();
  if(!t || t.includes('?'))return false;
  if(/^(i'?m|i am|my name is|call me|name'?s)\s+/i.test(t))return true;
  const words=t.split(/\s+/);
  return words.length<=2 && /^[a-zA-Z' -]+$/.test(t) && t.length<=24;
}

// ═══ v01.21: CHAT HISTORY (persisted in this browser) ═══
const PIXIE_HISTORY_KEY='n_pixie_chat_history';
const PIXIE_HISTORY_MAX=200;
function loadPixieHistory(){
  try{
    if(pixieDevMode){
      return JSON.parse(sessionStorage.getItem(PIXIE_DEV_HISTORY_KEY)||'[]');
    }
    return JSON.parse(localStorage.getItem(PIXIE_HISTORY_KEY)||'[]');
  }catch(e){ return []; }
}
function savePixieHistoryEntry(who,text){
  try{
    const hist=loadPixieHistory();
    hist.push({who,text});
    while(hist.length>PIXIE_HISTORY_MAX)hist.shift();
    if(pixieDevMode){
      sessionStorage.setItem(PIXIE_DEV_HISTORY_KEY,JSON.stringify(hist));
    } else {
      localStorage.setItem(PIXIE_HISTORY_KEY,JSON.stringify(hist));
    }
  }catch(e){}
}

// ── Admin login/logout hooks — called by admin.js ──
window.pixieOnAdminLogin = function(){
  // Switch to dev history store, reset AI context, re-render thread
  pixieDevMode = false; // start in character mode even when admin
  pixieAiHistory = [];
  if(typeof rerenderPixieDmThread === 'function') rerenderPixieDmThread();
};
window.pixieOnAdminLogout = function(){
  // Return to regular mode and regular history
  pixieDevMode = false;
  pixieAiHistory = [];
  if(typeof rerenderPixieDmThread === 'function') rerenderPixieDmThread();
};
// Renders a past message without re-saving it (used only to replay
// history on open — saving here would just grow the log every visit).
function renderPixieHistoryLine(who,text){
  const log=$('pixie-messages');
  if(!log)return;
  const div=document.createElement('div');
  div.className='pixie-msg '+(who==='user'?'user':'pixie');
  const textEl=document.createElement('div');
  textEl.textContent=text;
  div.appendChild(textEl);
  log.appendChild(div);
}

// ═══ v01.21: CONVERSATION TREE ENGINE ═══
// Generic walker for the multi-turn trees in pixie-lines.json (trees).
// A tree has: trigger (regex string), open (lines shown immediately),
// branches (array of {match, reply, branches?}) matched against the
// NEXT user message, and an optional fallback if nothing matches.
// State lives in S.pixieAwaiting as {type:'tree', branches, fallback}
// while a tree is mid-conversation; cleared once a leaf is reached.
function findPixieTree(text){
  const data=PIXIE_LINES;
  if(!data || !data.trees)return null;
  const t=text.toLowerCase();
  for(const id in data.trees){
    const tree=data.trees[id];
    if(tree.trigger && new RegExp(tree.trigger,'i').test(t))return tree;
  }
  return null;
}
function pickFriendshipWhatAreWeLine(){
  const tier=getPixieAffectionTier();
  if(tier==='low')return "...Potentially.";
  if(tier==='medium')return "...I think we're getting there.";
  return "...Yeah. I think so. Don't make me say it twice.";
}
function resolvePixieTreeTokens(lines){
  return (lines||[]).map(l=> l==='__FRIENDSHIP_TIER__' ? pickFriendshipWhatAreWeLine() : l);
}
// Returns an array of lines to show, or null if nothing in the current
// tree state matched (caller falls through to the generic engine).
function advancePixieTree(text){
  const awaiting=S.pixieAwaiting;
  if(!awaiting || awaiting.type!=='tree')return null;
  const t=text.toLowerCase();
  const branches=awaiting.branches||[];
  for(const b of branches){
    if(b.match && new RegExp(b.match,'i').test(t)){
      const lines=resolvePixieTreeTokens(b.reply);
      if(b.branches && b.branches.length){
        S.pixieAwaiting={type:'tree', branches:b.branches, fallback:b.fallback||awaiting.fallback};
      }else{
        S.pixieAwaiting=null;
      }
      return lines;
    }
  }
  S.pixieAwaiting=null;
  return awaiting.fallback?resolvePixieTreeTokens(awaiting.fallback):null;
}

// ═══ v01.20/21: fragment combiner (Pack #4) — assembles a reply from
// 1-2 independent fragment pools instead of one fixed line, so the
// same "categories" produce a much larger number of effectively-
// unique replies without needing more raw lines. ═══
function buildUniversalReaction(data){
  const u=data.universal;
  if(!u)return null;
  const baseCats=['general','agreement','disagreement','mildSarcasm','surprise','thoughtful','mildConfusion'];
  const validBase=baseCats.filter(c=>u[c]&&u[c].length);
  if(!validBase.length)return null;
  const base=pickRandom(validBase);
  let line=pickRandom(u[base]);
  if(Math.random()<0.4){
    const tailCats=['curiosityPrompt','filler','endingThought','tinyCompliment','playfulTeasing','encouraging'];
    const validTail=tailCats.filter(c=>u[c]&&u[c].length && c!==base);
    if(validTail.length){
      line+=' '+pickRandom(u[pickRandom(validTail)]);
    }
  }
  return line;
}

async function sendPixieMessage(){
  const input=$('pixie-input');
  if(!input)return;
  const text=input.value.trim();
  if(!text)return;
  addPixieMessage('user',text);
  input.value='';
  bumpPixieAffection();
  resetPixieIdleTimers();

  // ── Dev mode toggle — admin only ──
  if(S.adminUnlocked){
    const cmd = text.toLowerCase().trim();
    if(cmd === '(open)'){
      pixieDevMode = true;
      pixieAiHistory = [];
      // Load dev mode history (sessionStorage)
      if(typeof rerenderPixieDmThread === 'function') rerenderPixieDmThread();
      addPixieMessage('pixie', '[ dev mode on — I'm just an AI now. ask me anything. ]');
      return;
    }
    if(cmd === '(close)'){
      pixieDevMode = false;
      pixieAiHistory = [];
      // Return to regular history (localStorage)
      if(typeof rerenderPixieDmThread === 'function') rerenderPixieDmThread();
      addPixieMessage('pixie', '[ back in character. sigh. ]');
      return;
    }
  }

  // ── Name capture — always goes through AI for smart validation ──
  const wasAwaitingName = S.pixieAwaiting === 'name';
  const unprompted = detectUnpromptedName(text);

  if(wasAwaitingName || unprompted){
    if(unprompted && !wasAwaitingName){
      // Volunteer name without being asked — quick claim, no AI needed
      S.pixieAwaiting = null;
      const data = await loadPixieLines();
      setTimeout(async () => {
        const res = await claimDisplayName(unprompted);
        if(res.locked){
          addPixieMessage('pixie', pickLineFromCategory(data.special&&data.special.nameLocked)||"You already used your one change.");
          return;
        }
        if(!res.ok){ addPixieMessage('pixie', "That's not really a name I can work with. Try again?"); return; }
        const cat = res.wasFirst ? 'nameGivenFresh' : 'nameGivenNumbered';
        const line = pickLineFromCategory(data.special&&data.special[cat]);
        addPixieMessage('pixie', fillNameTokens(line||(res.wasFirst?`Fine. ${res.name} it is.`:`Someone beat you to that one. You're ${res.name} ${res.number} now.`)));
      }, 350 + Math.random() * 400);
      return;
    }

    // wasAwaitingName — route through AI with isNamingCheck:true for smart validation
    // The server extracts a real name if present, or responds naturally if not.
    S.pixieAwaiting = null;
    try {
      const res = await fetch('/.netlify/functions/pixie-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: pixieAiHistory.slice(0, -1),
          isAdmin: !!(typeof S !== 'undefined' && S.adminUnlocked),
          isDevMode: pixieDevMode,
          isNamingCheck: true,
          siteContext: buildPixieSiteContext()
        })
      });
      const data = await res.json();
      if(data.extractedName){
        // AI confirmed it's a real name
        const lines = await loadPixieLines();
        const claimRes = await claimDisplayName(data.extractedName);
        if(claimRes.locked){
          addPixieMessage('pixie', pickLineFromCategory(lines.special&&lines.special.nameLocked)||"You already used your one change.");
        } else if(!claimRes.ok){
          addPixieMessage('pixie', "That's not really a name I can work with. Try again?");
          S.pixieAwaiting = 'name'; // ask again
        } else {
          // Show Pixie's natural acknowledgment reply from AI (already in-character)
          if(data.reply) addPixieMessage('pixie', data.reply);
          else {
            const cat = claimRes.wasFirst ? 'nameGivenFresh' : 'nameGivenNumbered';
            const line = pickLineFromCategory(lines.special&&lines.special[cat]);
            addPixieMessage('pixie', fillNameTokens(line||(claimRes.wasFirst?`Fine. ${claimRes.name} it is.`:`You're ${claimRes.name} ${claimRes.number} now.`)));
          }
        }
      } else if(data.reply){
        // Not a name — AI replied naturally, keep waiting for a real name
        pixieAiHistory.push({ role: 'user', text });
        pixieAiHistory.push({ role: 'model', text: data.reply });
        S.pixieAwaiting = 'name';
        addPixieMessage('pixie', data.reply);
      } else {
        // AI failed — local fallback, try name ask again later
        S.pixieAwaiting = 'name';
        const fallback = await loadPixieLines();
        addPixieMessage('pixie', getPixieResponse(text));
      }
    } catch(err) {
      console.warn('Naming AI check failed:', err.message);
      S.pixieAwaiting = 'name';
      addPixieMessage('pixie', getPixieResponse(text));
    }
    return;
  }

  // ── Everything else → AI first, local engine as fallback ──
  sendPixieAiMessage(text);
}

// ═══ LIVE SITE CONTEXT — assembled fresh on every message ═══
// Gathers everything knowable about the current state of the site and
// packages it into a plain object that gets sent to the Netlify function
// and injected into Pixie's system prompt. She can then reference real
// state rather than guessing — what's playing, the weather, who's online,
// what the latest episode is, what world the visitor is in, etc.
function buildPixieSiteContext() {
  const ctx = {};

  // ── Current view / world ──
  ctx.currentView = S.view || 'map';

  // ── Music ──
  ctx.musicPlaying = activeMusic || null; // 'lofi' | 'ancient' | 'dark' | 'podcast' | null
  // Try to get the actual track name if it's ambient
  if (activeMusic && typeof MUSIC !== 'undefined' && MUSIC[activeMusic]) {
    ctx.musicTrackName = MUSIC[activeMusic].name || activeMusic;
  }
  // Every ambient track Pixie is able to start — the exact keys she must
  // use in a play action tag (see PIXIE_AI_HISTORY_MAX comment / system
  // prompt on the server for the tag format).
  if (typeof MUSIC !== 'undefined') {
    ctx.musicTracks = Object.keys(MUSIC)
      .filter(k => k !== 'podcast') // podcast handled separately, see ctx.shows
      .map(k => ({ key: k, name: MUSIC[k].name || k }));
  }

  // ── Podcast / episode ──
  if (typeof currentEpisode !== 'undefined' && currentEpisode) {
    ctx.currentEpisode = {
      title: currentEpisode.title || null,
      isLive: !!currentEpisode.isLive
    };
  }
  // Latest episode across ALL shows (most recently added) — use showEpisodesAll
  // not S.episodes which is filtered to only the currently open show
  const allEps = (S.showEpisodesAll || []).slice();
  if (allEps.length) {
    const latest = allEps.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0))[0];
    ctx.latestEpisode = {
      title: latest.title || null,
      showId: latest.showId || null,
      addedAt: latest.addedAt ? timeAgo(latest.addedAt) : null
    };
  }
  // Show list (public shows) — includes each show's episode titles (capped)
  // so Pixie can match a request like "play episode 3 of the map show" or
  // "play the one about the lighthouse" to a real, playable episode.
  const publicShows = (S.shows || []).filter(s => {
    const t = (s.title || '').trim().toLowerCase();
    return t !== 'pixie'; // hide the pixie shorts show
  });
  if (publicShows.length) {
    ctx.shows = publicShows.map(s => {
      const eps = (S.showEpisodesAll || []).filter(e => e.showId === s.id);
      return {
        title: s.title,
        isDefault: !!s.isDefault,
        episodeCount: eps.length,
        episodeTitles: eps.slice(0, 15).map(e => e.title),
        episodeTitlesTruncated: eps.length > 15 ? eps.length - 15 : 0
      };
    });
  }


  // ── Weather / environment ──
  if (S.environment && S.environment.ready) {
    const wv = typeof computeWeatherVisualState === 'function'
      ? computeWeatherVisualState() : null;
    const dn = typeof computeDayNightPhase === 'function'
      ? computeDayNightPhase() : null;
    const season = typeof computeSeason === 'function'
      ? computeSeason() : null;
    ctx.weather = {
      condition: wv ? wv.kind : null,   // 'clear'|'rain'|'snow'|'thunder'|'fog'|'cloudy'
      windy: wv ? wv.windy : false,
      tempC: S.environment.tempC != null ? Math.round(S.environment.tempC) : null,
      isDaytime: dn ? dn.isDaytime : null,
      timeOfDay: dn
        ? (dn.twilight > 0.5 ? (dn.isDaytime ? 'dawn/dusk' : 'night') : (dn.isDaytime ? 'day' : 'night'))
        : null,
      season
    };
  }

  // ── Who's online ──
  const onlineCount = (S.onlinePresence || []).length;
  ctx.visitorsOnline = onlineCount; // includes the current visitor

  // ── Visitor identity ──
  if (S.identity && S.identity.name) {
    ctx.visitorName = S.identity.name;
    if (S.identity.number != null) ctx.visitorNumber = S.identity.number;
  }

  // ── Feature toggles (what sections are live) ──
  ctx.activeFeatures = Object.entries(S.featureToggles || {})
    .filter(([, v]) => v)
    .map(([k]) => k);

  // ── Community board / screams (counts, not content) ──
  ctx.screamCount = (S.screams || []).length;

  // ── Library (public) ──
  const lib = S.library || [];
  ctx.libraryCount = lib.filter(b=>b.isPublic).length;
  if (lib.length) {
    ctx.libraryTitles = lib.filter(b=>b.isPublic).map(b=>b.title).slice(0,5);
  }

  // ── v01.26: User-private context ──
  // Pixie knows everything about the logged-in user so she can play
  // their playlist, reference their stories, and answer personal questions.
  if (S.account) {
    ctx.user = {
      username: S.account.username,
      displayName: S.account.displayName || S.account.username,
      avatarEmoji: S.account.avatarEmoji || ''
    };

    // User's personal playlist items
    const userPlaylist = S.account.playlist || [];
    if (userPlaylist.length) {
      ctx.userPlaylist = userPlaylist.map(item => ({
        type: item.type,
        title: item.episodeTitle || item.title || '',
        showTitle: item.showTitle || ''
      }));
    }

    // User's own stories (all — private and public)
    const myStories = lib.filter(b =>
      b.owner === S.account.username || (!b.owner && S.adminUnlocked)
    );
    if (myStories.length) {
      ctx.userStories = myStories.map(b => ({
        id: b.id,
        title: b.title,
        author: b.author,
        genre: b.genreRaw || b.genreCanonical,
        isPublic: !!b.isPublic,
        chapters: b.chapters ? b.chapters.length : 0,
        status: b.status
      }));
    }

    // User's own shows/playlists (Wireless)
    const myShows = (S.shows || []).filter(s => s.owner === S.account.username);
    if (myShows.length) {
      ctx.userShows = myShows.map(s => {
        const eps = (S.showEpisodesAll || []).filter(e => e.showId === s.id);
        return {
          id: s.id,
          title: s.title,
          isPublic: !!s.isPublic,
          episodeCount: eps.length,
          episodeTitles: eps.slice(0,10).map(e=>e.title)
        };
      });
    }
  }

  // v01.27: mood + tone memory context
  const now = new Date();
  ctx.pixieMood = {
    localHour: now.getHours(),
    rudeCount: pixieRudeCount,
    hasApologised: pixieHasApologised,
    accountGaps: computeAccountGaps(),
    tipGiven: pixieTipGivenThisSession
  };

  // Thunder just struck?
  if(pixieThunderJustStruck){
    if(!ctx.weather) ctx.weather = {};
    ctx.weather.thunderJustStruck = true;
  }

  // Extra stats for dev mode (always collected, only shown in dev prompt)
  ctx.totalShows = (S.shows || []).length;
  ctx.totalEpisodes = (S.showEpisodesAll || []).length;
  ctx.totalMessages = (S.messages || []).length;
  ctx.totalLibrary = (S.library || []).length;
  if(S.calendar && S.calendar.slots){
    ctx.calendarSlotCount = S.calendar.slots.length;
    const todayISO = new Date().toISOString().slice(0,10);
    ctx.calendarOpenSlots = S.calendar.slots.filter(s => s.dateISO >= todayISO && s.status === 'open').length;
  }
  if(typeof CURRENT_VERSION !== 'undefined') ctx.siteVersion = CURRENT_VERSION;

  return ctx;
}

// Sends the message to the Gemini-backed Netlify function and renders
// the reply. Keeps the last N turns in memory (session only — not
// persisted beyond the existing localStorage chat history) so Pixie
// has short-term conversational context.
const PIXIE_AI_HISTORY_MAX = 20; // turns kept in session memory
let pixieAiHistory = []; // [{role:'user'|'model', text:string}]

// ── v01.28: Dev mode (admin only, toggled with (open)/(close)) ──
let pixieDevMode = false;
const PIXIE_DEV_HISTORY_KEY = 'n_pixie_dev_history'; // sessionStorage
const PIXIE_HISTORY_KEY_REGULAR = 'n_pixie_chat_history'; // localStorage

// v01.27: Pixie tone memory — persists within a session
let pixieRudeCount = 0;
let pixieHasApologised = false;
let pixieTipGivenThisSession = false;
let pixieThunderJustStruck = false;

function looksRude(text){
  const t=(text||'').toLowerCase();
  return [/stupid/,/idiot/,/shut up/,/f+u+c+k/,
    /worthless/,/useless/,/screw you/,/you suck/,
    /go away/,/hate you/,/you'?re (fake|not real|just an? ai)/
  ].some(r=>r.test(t));
}
function looksLikeApology(text){
  const t=(text||'').toLowerCase();
  return /(sorry|i apologise|i apologize|my bad|forgive me|i was rude)/.test(t);
}
function onPixieThunderStrike(){
  pixieThunderJustStruck=true;
  setTimeout(()=>{pixieThunderJustStruck=false;},8000);
}
function computeAccountGaps(){
  if(!S.account) return [];
  const gaps=[];
  if(!S.account.avatarEmoji||['🙂','😊','😀','👤'].includes(S.account.avatarEmoji))
    gaps.push('profile emoji not set');
  if(!(S.account.playlist||[]).length) gaps.push('personal playlist is empty');
  const myStories=(S.library||[]).filter(b=>b.owner===S.account.username);
  if(!myStories.length) gaps.push('no stories in the keep');
  return gaps;
}

// Parses and executes an [ACTION:...] tag from the end of Gemini's reply.
// Tag format: [ACTION:type|arg1|arg2] — pipe-delimited so it can carry a
// show/episode title, not just a bare keyword. Recognized types:
//   play_ambient|<key>            key is one of the MUSIC keys (e.g. lofi)
//   play_podcast                  starts the default show's next-up episode
//   play_episode|<show>|<episode> starts a specific episode of a specific show
//   stop_music                    stops whatever's currently playing
//   open_wireless                 navigates to the Wireless page
// Returns the clean reply text (tag stripped) and, if the tag matched
// something real, an action object — { label, fn } — describing what to run.
function parsePixieAiAction(rawReply) {
  const actionMatch = rawReply.match(/\[ACTION:([^\]]+)\]\s*$/m);
  if (!actionMatch) return { text: rawReply, action: null };

  const cleanText = rawReply.replace(/\[ACTION:[^\]]+\]\s*$/m, '').trim();
  const parts = actionMatch[1].split('|').map(s => s.trim());
  const type = parts[0];

  let action = null;
  switch (type) {
    case 'play_ambient': {
      const key = parts[1];
      if (typeof MUSIC !== 'undefined' && MUSIC[key]) {
        action = {
          label: '🎵 ' + (MUSIC[key].name || key),
          fn: () => pixiePlayAmbient(key)
        };
      }
      break;
    }
    case 'stop_music':
      action = { label: '⏹ stop music', fn: () => pixieStopMusic() };
      break;
    case 'open_wireless':
      action = {
        label: '🎙 take me there',
        fn: () => { closePixiePanel(); if (typeof gotoWirelessPageDirect === 'function') gotoWirelessPageDirect(); }
      };
      break;
    case 'play_podcast':
      action = { label: '🎙 play episode', fn: () => { pixiePlayMidnightArchive(); } };
      break;
    case 'play_episode': {
      const showQuery = parts[1] || '';
      const episodeQuery = parts[2] || '';
      action = {
        label: '🎙 play episode',
        fn: () => pixiePlayEpisodeByQuery(showQuery, episodeQuery)
      };
      break;
    }
    // v01.26: play a user's own playlist / show
    case 'play_user_show': {
      const showQuery = parts[1] || '';
      const episodeQuery = parts[2] || '';
      action = {
        label: '🎵 play your playlist',
        fn: () => pixiePlayUserShow(showQuery, episodeQuery)
      };
      break;
    }
    case 'open_keep': {
      action = {
        label: '📚 open your keep',
        fn: () => { if(typeof openCastle==='function') openCastle(); }
      };
      break;
    }
    case 'open_story': {
      const storyId = parts[1] || '';
      action = {
        label: '📖 open story',
        fn: () => { if(typeof openCastle==='function') openCastle(); setTimeout(()=>{ if(typeof openBook==='function') openBook(storyId); },400); }
      };
      break;
    }

    // v01.27: Set user emoji from chat
    case 'set_emoji': {
      const emoji = parts[1] || '';
      if(emoji && S.account){
        action = {
          label: emoji + ' set as your face',
          fn: async () => {
            try {
              const res = await callAccountUpdate({
                action:'setAvatar', username:S.account.username,
                token:S.account.token, avatarEmoji:emoji
              });
              if(res.ok){
                S.account.avatarEmoji = res.avatarEmoji || emoji;
                if(typeof renderAccountPanel==='function') renderAccountPanel();
                if(db) fbSavePresence(S.userId,{
                  id:S.userId, num:getChatNum(),
                  displayName:getDisplayLabel(), avatarEmoji:emoji,
                  accountUsername:S.account.username, ts:Date.now(), hidden:presenceHidden
                });
                toast('face updated to ' + emoji + ' ✓');
              }
            } catch(e){ toast('could not update emoji'); }
          }
        };
      }
      break;
    }

    // v01.27: Open profile panel
    case 'open_profile': {
      action = {
        label: '👤 open profile',
        fn: () => { const p=$('profile-panel'); if(p) p.classList.add('open'); }
      };
      break;
    }

    // v01.27: Recommend a public story — renders a tappable card in the DM thread
    case 'recommend_story': {
      const storyId   = parts[1] || '';
      const storyTitle  = parts[2] || 'a story';
      const storyAuthor = parts[3] || '';
      action = {
        label: null, // no button — card is rendered inline
        fn: () => {
          const book = (S.library||[]).find(b=>b.id===storyId);
          if(!book && !storyTitle){ return; }
          const b = book || {id:storyId, title:storyTitle, author:storyAuthor};
          // Inject a story card into the DM thread
          if(typeof renderPixieStoryCard==='function') renderPixieStoryCard(b);
        }
      };
      break;
    }

    // v01.27: Add a YouTube video to the user's playlist via link
    case 'add_youtube_video': {
      const ytUrl   = parts[1] || '';
      const epTitle = parts[2] || '';
      const showId  = parts[3] || '';
      if(ytUrl && S.account){
        action = {
          label: '➕ add to playlist',
          fn: async () => {
            try {
              // Extract videoId from URL
              const m = ytUrl.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
              const videoId = m ? m[1] : '';
              if(!videoId){ toast('could not parse YouTube URL'); return; }

              // Find or use the show
              let targetShowId = showId;
              if(!targetShowId){
                // Use first user-owned show or prompt
                const myShow = (S.shows||[]).find(s=>s.owner===S.account.username);
                if(!myShow){ toast('create a playlist in the Wireless first'); return; }
                targetShowId = myShow.id;
              }

              const ep = {
                id: 'ep_' + Date.now(),
                showId: targetShowId,
                title: epTitle || ('Video ' + new Date().toLocaleDateString()),
                videoId,
                url: ytUrl,
                desc: '',
                order: Date.now(),
                addedAt: Date.now(),
                owner: S.account.username
              };

              const res = await callAccountUpdate({
                action:'saveUserEpisode', username:S.account.username,
                token:S.account.token, episode:ep
              });
              if(res.ok){
                toast('video added to playlist ✓');
                if(typeof refreshCurrentShowEpisodes==='function') refreshCurrentShowEpisodes();
              } else {
                toast(res.error || 'could not add video');
              }
            } catch(e){ toast('error adding video: ' + e.message); }
          }
        };
      }
      break;
    }
  }

  return { text: cleanText, action };
}

// Render a story recommendation card inside the Pixie DM thread
function renderPixieStoryCard(book){
  const msgEl = $('pixie-dm-messages');
  if(!msgEl) return;

  const genre = book.genreRaw || book.genreCanonical || '';
  const chaps = book.chapters ? book.chapters.length : 0;

  const card = document.createElement('div');
  card.className = 'chat-msg';
  card.style.cssText = 'padding:0;background:none;';

  // Use a closure to safely bind the story ID without string quoting issues
  const _sid = book.id || '';
  card.innerHTML =
    '<div style="background:rgba(20,14,8,.85);border:1px solid rgba(200,137,42,.25);' +
    'border-radius:10px;padding:10px 12px;max-width:240px;cursor:pointer">' +
      '<div style="font-size:.58rem;color:var(--amber);opacity:.6;margin-bottom:4px;' +
        'font-family:var(--font-body);font-style:italic">📖 story recommendation</div>' +
      '<div style="font-family:var(--font-title);font-size:.78rem;color:var(--cream);' +
        'margin-bottom:3px;line-height:1.3">' + esc(book.title) + '</div>' +
      (book.author ? '<div style="font-size:.65rem;color:var(--fog);opacity:.7;' +
        'font-style:italic">by ' + esc(book.author) + '</div>' : '') +
      (genre ? '<div style="font-size:.6rem;color:var(--fog);opacity:.5;margin-top:2px">' +
        esc(genre) + (chaps ? ' · ' + chaps + ' chapter' + (chaps!==1?'s':'') : '') + '</div>' : '') +
      '<div style="font-size:.62rem;color:var(--amber);margin-top:6px;opacity:.7">tap to open →</div>' +
    '</div>';
  // Attach click via JS to avoid any string-quoting issues
  card.querySelector('div').addEventListener('click', () => openStoryFromPixie(_sid));
  msgEl.appendChild(card);
  msgEl.scrollTop = msgEl.scrollHeight;
}

function openStoryFromPixie(storyId){
  if(!storyId) return;
  if(typeof openCastle==='function') openCastle();
  setTimeout(()=>{ if(typeof openBook==='function') openBook(storyId); }, 400);
}

// v01.26: play a user-owned show (private or public) by fuzzy title match.
// Falls back to pixiePlayEpisodeByQuery if not found in user's shows.
function pixiePlayUserShow(showQuery, episodeQuery){
  const norm = s => (s||'').toLowerCase().trim();
  const q = norm(showQuery);
  const username = S.account ? S.account.username : null;

  // Search user's own shows first, then all visible shows
  const myShows = username
    ? (S.shows||[]).filter(s=>s.owner===username)
    : [];
  const allShows = S.shows || [];

  const findShow = pool =>
    pool.find(s=>norm(s.title)===q) ||
    pool.find(s=>norm(s.title).includes(q)||q.includes(norm(s.title)));

  const show = findShow(myShows) || findShow(allShows);
  if(!show){ return pixiePlayEpisodeByQuery(showQuery, episodeQuery); }

  // Found a show — play it
  if(S.currentShowId !== show.id){
    S.currentShowId = show.id;
    if(typeof refreshCurrentShowEpisodes==='function') refreshCurrentShowEpisodes();
  }
  const allEps = (S.showEpisodesAll||[]).filter(e=>e.showId===show.id);
  const norm2 = s=>(s||'').toLowerCase().trim();
  const eq = norm2(episodeQuery);
  let ep = eq
    ? (allEps.find(e=>norm2(e.title)===eq)||allEps.find(e=>norm2(e.title).includes(eq)||eq.includes(norm2(e.title))))
    : null;
  if(!ep) ep = allEps[0]||null;
  if(!ep) return null;

  if(typeof loadEpisode==='function') loadEpisode(ep);
  activeMusic = 'podcast';
  if(typeof updateNP==='function') updateNP('🎵 '+ep.title);
  return ep;
}

// Starts an ambient track (lofi/ancient/dark) — idempotent: if it's
// already playing, does nothing rather than toggling it off, since
// "play the lofi" should always mean "make sure it's playing."
function pixiePlayAmbient(key) {
  if (typeof MUSIC === 'undefined' || !MUSIC[key]) return;
  if (activeMusic === key) return; // already playing — leave it alone
  if (typeof toggleMusic === 'function') toggleMusic(key);
}

// Stops whatever's currently playing, ambient or podcast.
function pixieStopMusic() {
  if (typeof toggleMusic !== 'function') return;
  if (activeMusic) toggleMusic(activeMusic); // toggling the active track stops it
}

// Finds and plays a specific episode of a specific show by (fuzzy,
// case-insensitive) title match — this is how Pixie plays "episode 3"
// or "the one about the lighthouse" rather than just the default show.
// Falls back to the default Midnight Archive behavior if nothing matches
// closely enough, so a slightly-off request still does something sensible.
function pixiePlayEpisodeByQuery(showQuery, episodeQuery) {
  if (S.featureToggles && S.featureToggles.wireless === false) return null;

  const norm = s => (s || '').toLowerCase().trim();
  const shows = S.shows || [];
  const allEps = S.showEpisodesAll || [];

  let show = null;
  if (showQuery) {
    const q = norm(showQuery);
    show = shows.find(s => norm(s.title) === q) ||
           shows.find(s => norm(s.title).includes(q) || q.includes(norm(s.title)));
  }
  if (!show) show = getMidnightArchiveShow ? getMidnightArchiveShow() : null;
  if (!show) show = getDefaultShow ? getDefaultShow() : null;
  if (!show) return null;

  if (S.currentShowId !== show.id) {
    S.currentShowId = show.id;
    if (typeof refreshCurrentShowEpisodes === 'function') refreshCurrentShowEpisodes();
  }

  const showEps = allEps.filter(e => e.showId === show.id);
  let ep = null;
  if (episodeQuery) {
    const q = norm(episodeQuery);
    ep = showEps.find(e => norm(e.title) === q) ||
         showEps.find(e => norm(e.title).includes(q) || q.includes(norm(e.title)));
  }
  if (!ep) ep = (typeof pickDefaultEpisode === 'function') ? pickDefaultEpisode() : (showEps[0] || null);
  if (!ep) return null;

  if (typeof loadEpisode === 'function') loadEpisode(ep);
  activeMusic = 'podcast';
  if (typeof updateNP === 'function') updateNP('🎙 ' + ep.title);
  return ep;
}

async function sendPixieAiMessage(userText) {
  // v01.27: tone memory checks before sending
  if(looksLikeApology(userText)){
    pixieHasApologised = true;
    pixieRudeCount = Math.max(0, pixieRudeCount - 2);
  } else if(looksRude(userText)){
    pixieRudeCount++;
    // At extreme rudeness, trigger a short timeout (10 min) — no reply
    if(pixieRudeCount >= 6){
      addPixieMessage('pixie', '...');
      // Apply a soft lockout stored in sessionStorage
      sessionStorage.setItem('pixie_timeout_until', String(Date.now() + 10*60*1000));
      return;
    }
  }

  // Check if we are in a timeout
  const timeoutUntil = Number(sessionStorage.getItem('pixie_timeout_until')||'0');
  if(Date.now() < timeoutUntil){
    const remaining = Math.ceil((timeoutUntil - Date.now()) / 60000);
    addPixieMessage('pixie', 'still not talking to you. try again in ' + remaining + ' minute' + (remaining!==1?'s':'')+  '.');
    return;
  }

  // Add this message to session history for context
  pixieAiHistory.push({ role: 'user', text: userText });
  if (pixieAiHistory.length > PIXIE_AI_HISTORY_MAX) {
    pixieAiHistory = pixieAiHistory.slice(-PIXIE_AI_HISTORY_MAX);
  }

  const thinkDelay = 400 + Math.random() * 500;

  try {
    const res = await fetch('/.netlify/functions/pixie-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: userText,
        history: pixieAiHistory.slice(0, -1),
        isAdmin: !!(typeof S !== 'undefined' && S.adminUnlocked),
        isDevMode: pixieDevMode,
        siteContext: buildPixieSiteContext()
      })
    });

    const data = await res.json();

    if (data.reply) {
      let replyText = data.reply;

      // In dev mode, if they asked about the model, append meta info
      if(pixieDevMode && data._meta && /what (model|ai|provider|are you)/i.test(userText)){
        replyText += `
[ ${data._meta.provider} / ${data._meta.model} ]`;
      }

      if(pixieDevMode){
        // Dev mode: no action tags, no tip tracking, just plain exchange
        pixieAiHistory.push({ role: 'model', text: replyText });
        if(pixieAiHistory.length > PIXIE_AI_HISTORY_MAX) pixieAiHistory = pixieAiHistory.slice(-PIXIE_AI_HISTORY_MAX);
        setTimeout(() => addPixieMessage('pixie', replyText), thinkDelay);
      } else {
        // Normal Pixie mode — strip action tag, handle it
        const { text, action } = parsePixieAiAction(replyText);
        pixieAiHistory.push({ role: 'model', text });
        if(pixieAiHistory.length > PIXIE_AI_HISTORY_MAX) pixieAiHistory = pixieAiHistory.slice(-PIXIE_AI_HISTORY_MAX);
        setTimeout(() => {
          if(action && typeof action.fn === 'function') action.fn();
          addPixieMessage('pixie', text);
          if(text && (text.includes('you can') || text.includes('try ') || text.includes('you know you')) && !pixieTipGivenThisSession){
            pixieTipGivenThisSession = true;
          }
        }, thinkDelay);
      }
    } else {
      setTimeout(() => addPixieMessage('pixie', getPixieResponse(userText)), thinkDelay);
    }

  } catch (err) {
    console.warn('Pixie AI call failed, using local fallback:', err.message);
    setTimeout(() => addPixieMessage('pixie', getPixieResponse(userText)), thinkDelay);
  }
}


// ═══ v01.18: ADMIN — shorts source status/shortcut ═══
function renderPixieAdminSettings(){
  const el=document.getElementById('pixie-admin-settings');
  if(!el)return;
  const show=(typeof getPixieShow==='function')?getPixieShow():null;
  const eps=(typeof getPixieShowEpisodes==='function')?getPixieShowEpisodes():[];
  el.innerHTML=`
    <div style="font-size:.7rem;color:var(--fog);opacity:.6;margin-bottom:10px;font-family:'Cinzel Decorative',serif">shorts source</div>
    ${show
      ? `<div style="font-family:'Crimson Text',serif;font-size:.85rem;color:var(--cream);margin-bottom:8px">✓ "pixie" show exists — ${eps.length} video${eps.length===1?'':'s'} in it. Hidden from the public grid automatically.</div>
         <button class="sq-submit" style="width:100%;font-size:.72rem" onclick="goEditPixieShow('${show.id}')">manage her shorts (add/remove videos)</button>`
      : `<div class="admin-placeholder" style="padding:4px 0 12px">No "pixie" show yet. It's fed the exact same way as any other show — paste a playlist link, just under a show named exactly "pixie". It'll be hidden from the public grid automatically once created.</div>
         <button class="sq-submit" style="width:100%;font-size:.72rem" onclick="goCreatePixieShow()">create it now</button>`
    }
    <div class="admin-placeholder" style="padding:14px 0 0">More Pixie settings (curated vs. live search, dialogue tuning) will land here in later batches.</div>
  `;
}
function goEditPixieShow(showId){
  if(typeof closeAdminSettingsPanel==='function')closeAdminSettingsPanel();
  if(typeof closeProfilePanel==='function')closeProfilePanel();
  navTo('wireless');
  setTimeout(()=>{ if(typeof openShow==='function')openShow(showId); },200);
}
function goCreatePixieShow(){
  if(typeof closeAdminSettingsPanel==='function')closeAdminSettingsPanel();
  if(typeof closeProfilePanel==='function')closeProfilePanel();
  navTo('wireless');
  setTimeout(()=>{
    if(typeof openShowForm==='function')openShowForm(null);
    setTimeout(()=>{ const inp=document.getElementById('wp-show-title-input'); if(inp)inp.value='pixie'; },100);
  },200);
}
// ═══ WANDERING / DRAGGABLE ICON ═══
let pixieDragging=false;
let pixieMoved=false;
let pixieWanderTimer=null;
let pixieAway=false;

// v01.21: PERSISTENT QUICK-ACCESS TAB — her wandering icon can be off
// exploring/hiding at the edge of the screen (or mid-flight, invisible)
// right when someone wants to talk to her. This small always-visible
// tab sits just above the bottom nav and opens her panel directly, same
// as tapping her wandering icon, so people don't have to wait for her.
// v01.25: quick tab removed — Pixie is in the DM list now.
// initPixieQuickTab kept as no-op for compat.
function initPixieQuickTab(){ /* removed v01.25 */ }

function initPixie(){
  const icon=$('pixie-icon');
  if(!icon)return;
  loadPixieLines(); // prefetch, don't block on it

  icon.style.left=(window.innerWidth*0.6)+'px';
  icon.style.top=(window.innerHeight*0.22)+'px';

  // v01.27: Pixie only wanders on the map. She is hidden on all other pages.
  // The chat/DM system is the primary way to reach her everywhere else.
  updatePixieIconVisibility();

  // Click opens Pixie's DM thread (openPixieDmThread is defined above)
  // The onclick is also set directly in HTML as a fallback.

  let startX=0,startY=0;
  icon.addEventListener('pointerdown',(e)=>{
    pixieDragging=true;pixieMoved=false;
    clearTimeout(pixieWanderTimer);
    const rect=icon.getBoundingClientRect();
    startX=e.clientX-rect.left;startY=e.clientY-rect.top;
    icon.style.transition='none';
    try{ icon.setPointerCapture && icon.setPointerCapture(e.pointerId); }catch(err){}
    e.preventDefault();
  },{passive:false});
  // Touch fallback for iOS where pointer events may not fire on fixed elements over canvas
  icon.addEventListener('touchstart',(e)=>{
    if(e.touches.length!==1)return;
    pixieDragging=true;pixieMoved=false;
    clearTimeout(pixieWanderTimer);
    const rect=icon.getBoundingClientRect();
    startX=e.touches[0].clientX-rect.left;startY=e.touches[0].clientY-rect.top;
    icon.style.transition='none';
    e.preventDefault();
  },{passive:false});
  icon.addEventListener('touchmove',(e)=>{
    if(!pixieDragging||e.touches.length!==1)return;
    pixieMoved=true;
    const x=Math.max(4,Math.min(e.touches[0].clientX-startX,window.innerWidth-46));
    const y=Math.max(4,Math.min(e.touches[0].clientY-startY,window.innerHeight-46));
    icon.style.left=x+'px';icon.style.top=y+'px';
    e.preventDefault();
  },{passive:false});
  icon.addEventListener('touchend',(e)=>{
    if(!pixieDragging)return;
    pixieDragging=false;
    icon.style.transition='left 3s ease-in-out, top 3s ease-in-out, opacity 1.2s ease';
    if(!pixieMoved) openPixieDmThread(); // tap without drag = open chat
    setTimeout(()=>{ pixieMoved=false; },50);
    scheduleNextPixieWander(2000+Math.random()*3000);
    e.preventDefault();
  },{passive:false});
  document.addEventListener('pointermove',(e)=>{
    if(!pixieDragging)return;
    pixieMoved=true;
    const x=Math.max(4,Math.min(e.clientX-startX,window.innerWidth-46));
    const y=Math.max(4,Math.min(e.clientY-startY,window.innerHeight-46));
    icon.style.left=x+'px';icon.style.top=y+'px';
  });
  document.addEventListener('pointerup',()=>{
    if(!pixieDragging)return;
    pixieDragging=false;
    icon.style.transition='left 3s ease-in-out, top 3s ease-in-out, opacity 1.2s ease';
    setTimeout(()=>{ pixieMoved=false; },50);
    scheduleNextPixieWander(2000+Math.random()*3000);
  });
  // pointercancel fires on iOS when the system interrupts a touch (scroll, gesture, screen lock)
  // Without this, pixieDragging stays true forever and she never wanders again.
  document.addEventListener('pointercancel',()=>{
    if(!pixieDragging)return;
    pixieDragging=false;pixieMoved=false;
    icon.style.transition='left 3s ease-in-out, top 3s ease-in-out, opacity 1.2s ease';
    scheduleNextPixieWander(2000+Math.random()*3000);
  });

  scheduleNextPixieWander(1800);
}

function scheduleNextPixieWander(delay){
  clearTimeout(pixieWanderTimer);
  pixieWanderTimer=setTimeout(pixieWanderStep,delay);
}

// One step of Pixie's autonomous movement: usually just wanders to a
// new spot on screen; occasionally flies off-screen entirely and stays
// gone for a while before re-entering from a random edge.
function pixieWanderStep(){
  const icon=$('pixie-icon');
  if(!icon||pixieDragging)return;
  const W=window.innerWidth,H=window.innerHeight;

  if(pixieAway){
    // Re-enter from a random edge, fade in, then resume normal wandering
    const edge=Math.floor(Math.random()*4);
    let ex,ey;
    if(edge===0){ex=-50;ey=Math.random()*H*0.5+40;}
    else if(edge===1){ex=W+50;ey=Math.random()*H*0.5+40;}
    else if(edge===2){ex=Math.random()*W;ey=-50;}
    else{ex=Math.random()*W;ey=H*0.55;}
    icon.style.transition='none';
    icon.style.left=ex+'px';icon.style.top=ey+'px';
    icon.style.opacity='0';
    pixieAway=false;
    setTimeout(()=>{
      icon.style.transition='left 3s ease-in-out, top 3s ease-in-out, opacity 1.2s ease';
      icon.style.opacity='1';
      icon.style.left=(W*0.15+Math.random()*W*0.7)+'px';
      icon.style.top=(H*0.1+Math.random()*H*0.45)+'px';
      scheduleNextPixieWander(6000+Math.random()*9000);
    },300);
    return;
  }

  // Small chance each step to fly off and disappear for a while
  if(Math.random()<0.18){
    const edge=Math.floor(Math.random()*4);
    let ex,ey;
    if(edge===0){ex=-70;ey=Math.random()*H*0.5+40;}
    else if(edge===1){ex=W+70;ey=Math.random()*H*0.5+40;}
    else if(edge===2){ex=Math.random()*W;ey=-70;}
    else{ex=Math.random()*W;ey=H+70;}
    icon.style.left=ex+'px';icon.style.top=ey+'px';
    setTimeout(()=>{ icon.style.opacity='0'; },1600);
    pixieAway=true;
    scheduleNextPixieWander(20000+Math.random()*70000);
    return;
  }

  // Normal wander to a new spot within the screen
  icon.style.left=(W*0.1+Math.random()*W*0.75)+'px';
  icon.style.top=(H*0.08+Math.random()*H*0.5)+'px';
  scheduleNextPixieWander(5000+Math.random()*8000);
}
