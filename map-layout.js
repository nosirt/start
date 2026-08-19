/* ============================================================
   MAP-LAYOUT.JS — overall site shell
   Load this AFTER core.js.
   Contains: intro animation, the world map (drag/zoom/canvas
   drawing), page navigation, the music player, the popup/
   chat-panel widget, the Konami easter egg, and page init.
   ============================================================ */

// ═══ INTRO ═══
(function(){
  const c=$('intro-leaves'),cols=['#5a3a10','#8b4a2f','#6b5020','#3a5020','#8b2a10'];
  for(let i=0;i<14;i++){const l=document.createElement('div');l.className='leaf';
    l.style.cssText=`left:${Math.random()*100}%;background:${cols[~~(Math.random()*5)]};
    animation-duration:${6+Math.random()*10}s;animation-delay:${Math.random()*8}s;
    width:${6+Math.random()*6}px;height:${8+Math.random()*8}px;`;c.appendChild(l);}
})();

// v01.07: guards against entering twice — the early intro-toggle check
// (below) can race with the visitor's own tap on the intro screen.
let siteEntered=false;

// Pass skipAnim=true when the welcome banner is toggled off, so the site
// opens straight to the map with no fade/delay.
function enterSite(skipAnim){
  if(siteEntered)return;
  siteEntered=true;
  const intro=$('intro');
  const proceed=()=>{
    if(intro)intro.style.display='none';
    $('app').classList.add('visible');
    S.audioStarted=true;
    fbInit();
    initMap();initMapCanvas();buildWL();buildSur();buildExp();
    renderForumNav();startClock();
    // v01.10: auto-start Lofi Hip Hop as soon as the site is entered,
    // instead of leaving all music off until the visitor picks one.
    // Safe to call unconditionally — toggleMusic() no-ops nothing here
    // since activeMusic starts null. If the browser blocks autoplay
    // (e.g. the welcome banner was skipped, so there was no tap to
    // "unlock" audio), tryPlay()'s fallback below retries on the
    // visitor's first interaction anywhere on the page.
    toggleMusic('lofi');
    // Load shared data from Firebase (live-synced across all visitors)
    // v01.13: posts/recs/screams moved off the old single-blob-per-
    // collection storage (see core.js for why — real data-race bug) to
    // one Firestore doc per item. Migrate any existing data first, then
    // set up the new live listeners. notes stays on the old system —
    // it's one shared text field with no multi-writer race to fix.
    if(typeof ensureLegacyDataMigrated==='function')ensureLegacyDataMigrated();
    if(typeof fbListenCollection==='function'){
      fbListenCollection('nosirt_posts', items=>{ S.posts=(items||[]).sort((a,b)=>b.ts-a.ts); renderPosts(); });
      fbListenCollection('nosirt_recs',  items=>{ S.recs=(items||[]).sort((a,b)=>b.ts-a.ts); renderRecs(); });
      fbListenCollection('nosirt_screams',items=>{
        S.screams=(items||[]).sort((a,b)=>a.ts-b.ts);
        renderScreams();
        if(typeof cleanupExpiredScreamsOnce==='function')cleanupExpiredScreamsOnce();
      });
    }
    fbListen('notes', d=>{ S.notes=d.v||''; renderNotes(); });
    // v01.08: global chat — settings (media mode) + messages, both live
    fbListen('chat_settings', d=>{ if(typeof onChatSettingsUpdate==='function')onChatSettingsUpdate(d); });
    if(typeof fbListenChatMsgs==='function'){
      fbListenChatMsgs(items=>{ if(typeof onChatMessagesUpdate==='function')onChatMessagesUpdate(items); });
    }
    // v01.09: presence — "who's online"
    if(typeof fbListenPresence==='function'){
      fbListenPresence(items=>{ if(typeof onPresenceUpdate==='function')onPresenceUpdate(items); });
    }
    // v01.24: real accounts — kick off verifying any saved login. This
    // is async, so it won't actually finish before the first heartbeat
    // below fires (meaning that very first beat may briefly go out as
    // "logged out") — accounts.js's initAccounts() compensates by
    // pushing its own fresh presence update the moment verification
    // resolves, so the gap is at most a beat, not stuck that way.
    if(typeof initAccounts==='function')initAccounts();
    if(typeof startPresenceHeartbeat==='function')startPresenceHeartbeat();
    // v01.14: living-map environment — location + weather plumbing
    // (see environment.js). Fire-and-forget, same pattern as the other
    // init calls here — nothing else depends on it being ready yet.
    if(typeof startEnvironmentRefreshLoop==='function')startEnvironmentRefreshLoop();
    // v01.15: Pixie
    if(typeof initPixie==='function')initPixie();
    // v01.17: resume watching for renumbering if a name was already claimed before
    if(S.identity && S.identity.key && typeof startIdentityLiveListener==='function'){
      startIdentityLiveListener(S.identity.key);
    }
    // v01.07: which worlds/banner are switched on — live-synced so an
    // admin toggle takes effect for everyone immediately.
    fbListen('features', d=>{
      S.featureToggles=Object.assign({garden:true,square:true,forum:true,wireless:true,castle:true,intro:true},JSON.parse(d.v||'{}'));
      applyFeatureToggles();
      if(S.adminUnlocked&&typeof renderFeatureToggleList==='function')renderFeatureToggleList();
    });
    // View-mode (auto/mobile/desktop) — live-synced so admin changes
    // propagate to all open visitors in real-time.
    if(typeof initViewMode==='function')initViewMode();
    // Wireless show metadata starts here; episode documents are lazy-loaded
    // when someone opens the Wireless page. Keep stories are lazy-loaded
    // when someone opens the Keep.
    if(typeof initWirelessShows==='function')initWirelessShows();
    // Podcast booking calendar — public slot list (never contains names)
    if(typeof fbListen==='function'){
      fbListen('podcast_calendar', d=>{ S.calendar=d; if(typeof renderCalendarGrid==='function')renderCalendarGrid(); });
    }

    // v01.10: land directly on the page a shared/bookmarked URL points to
    const initialPath=currentRoutePath();
    if(initialPath)navigateTo(initialPath,false);
  };
  if(intro&&!skipAnim){
    intro.classList.add('fade-out');
    setTimeout(proceed,1200);
  }else{
    proceed();
  }
}

// v01.07: best-effort check, before the intro even renders, for whether
// the welcome banner has been switched off in the admin panel. If so,
// skip straight to the map. If this fails for any reason (offline, no
// Firebase, etc.) the intro just shows normally — nothing breaks.
(async function checkIntroToggle(){
  try{
    fbInit();
    if(!db)return;
    // Apply view-mode override before anything renders
    try{
      const vmDoc=await db.collection('site-config').doc('display').get();
      if(vmDoc.exists && typeof applyViewMode==='function'){
        applyViewMode(vmDoc.data().viewMode||'auto');
      }
    }catch(e){}
    const doc=await db.collection('nosirt').doc('features').get();
    if(doc.exists){
      const toggles=JSON.parse(doc.data().v||'{}');
      if(toggles&&toggles.intro===false){
        S.featureToggles=Object.assign(S.featureToggles,toggles);
        enterSite(true);
      }
    }
  }catch(e){ /* fall back to showing the intro as normal */ }
})();

// ═══ MAP ═══
const PIN_LOCS={
  garden:[2500,3370],
  square:[650,3410],
  forum:[3230,2070],
  castle:[4260,1510],
  wireless:[4150,2940]
};
const MAP_MAX_SCALE=1.35;

function getMapMinScale(){
  const vw=window.innerWidth,vh=window.innerHeight;
  return Math.max(vw/MAP_W, vh/MAP_H)*1.08;
}

function fitMap(){
  const vw=window.innerWidth,vh=window.innerHeight;
  const portrait=vh>vw&&vw<640;
  const minScale=getMapMinScale();
  if(portrait){
    S.mapScale=Math.max(minScale, vw/MAP_W*1.72);
    S.mapX=vw/2-2500*S.mapScale;
    S.mapY=vh*.56-2840*S.mapScale;
  }else{
    S.mapScale=Math.max(minScale, Math.max(vw/MAP_W,vh/MAP_H)*1.16);
    S.mapX=vw/2-2520*S.mapScale;
    S.mapY=vh*.5-2520*S.mapScale;
  }
  const mc=$('map-canvas');
  if(mc){
    mc.style.transition='none';
    mc.style.transform='translate('+S.mapX+'px,'+S.mapY+'px) scale('+S.mapScale+')';
  }
  updateMapParallax();
  updatePinOverlay();
}

function clampMap(){
  const vw=window.innerWidth,vh=window.innerHeight;
  const mw=MAP_W*S.mapScale, mh=MAP_H*S.mapScale;
  // Allow generous panning - just prevent map from going completely offscreen
  const minX = Math.min(0, vw - mw);
  const minY = Math.min(0, vh - mh);
  const maxX = Math.max(0, vw - mw) + (mw > vw ? 0 : 0);
  const maxY = Math.max(0, vh - mh) + (mh > vh ? 0 : 0);
  // Simple: don't let the map go more than 80% offscreen in any direction
  const buffer = 80;
  S.mapX = Math.min(vw - buffer, Math.max(buffer - mw, S.mapX));
  S.mapY = Math.min(vh - buffer, Math.max(buffer - mh, S.mapY));
}

function applyMap(){
  const mc=$('map-canvas');
  if(mc){
    mc.style.transition='none';
    mc.style.transform='translate('+S.mapX+'px,'+S.mapY+'px) scale('+S.mapScale+')';
  }
  updateMapParallax();
  updatePinOverlay();
}

function updateMapParallax(){
  const world=$('map-world');
  if(!world)return;
  const vw=window.innerWidth,vh=window.innerHeight;
  const centerX=(S.mapX+MAP_W*S.mapScale/2)-vw/2;
  const centerY=(S.mapY+MAP_H*S.mapScale/2)-vh/2;
  world.style.setProperty('--map-parallax-x', Math.max(-80,Math.min(80,-centerX*.025))+'px');
  world.style.setProperty('--map-parallax-y', Math.max(-70,Math.min(70,-centerY*.022))+'px');
  world.style.setProperty('--map-zoom', S.mapScale.toFixed(3));
}

function zoomAt(factor,cx,cy){
  const newScale=Math.min(MAP_MAX_SCALE,Math.max(getMapMinScale(),S.mapScale*factor));
  S.mapX=cx-(cx-S.mapX)*(newScale/S.mapScale);
  S.mapY=cy-(cy-S.mapY)*(newScale/S.mapScale);
  S.mapScale=newScale;
  clampMap();applyMap();
}

function resetMap(){
  const mc=$('map-canvas');
  if(mc) mc.style.transition='transform 0.45s cubic-bezier(0.25,0.46,0.45,0.94)';
  fitMap();
  setTimeout(()=>{const mc2=$('map-canvas');if(mc2)mc2.style.transition='none';},500);
  toast('map centered ⊕');
}

function updatePinOverlay(){
  const vw=window.innerWidth,vh=window.innerHeight;
  let nearest='the living map',best=Infinity;
  Object.entries(PIN_LOCS).forEach(([name,[sx,sy]])=>{
    const el=$('fpin-'+name);if(!el)return;
    const screenX=S.mapX+sx*S.mapScale;
    const screenY=S.mapY+sy*S.mapScale;
    const dist=Math.hypot(screenX-vw/2,screenY-vh/2);
    if(dist<best){best=dist;nearest={garden:'near the garden',square:'near town square',forum:'near the tower',castle:"near nosirt's keep",wireless:'near the wireless'}[name]||name;}
    el.style.left=screenX+'px';
    el.style.top=screenY+'px';
    const labelScale=Math.max(0.5,Math.min(1.6,1/S.mapScale));
    el.style.transform=`translate(-50%,-50%) scale(${labelScale})`;
    const lab=el.querySelector('.pin-label');
    if(lab){
      const lw=lab.offsetWidth||92;
      let nudge=0;
      if(screenX+lw/2>vw-12)nudge=(vw-12)-(screenX+lw/2);
      if(screenX-lw/2<12)nudge=12-(screenX-lw/2);
      lab.style.transform=`translateX(${nudge}px)`;
    }
    const margin=60;
    const vis=screenX>-margin&&screenX<vw+margin&&screenY>-margin&&screenY<vh+margin;
    el.style.opacity=vis?'1':'0';
    el.style.pointerEvents=vis?'all':'none';
  });
  const ro=$('map-readout');
  if(ro)ro.textContent=`${nearest} · ${Math.round(S.mapScale*100)}%`;
}

// ═══ v01.07: FEATURE TOGGLES ═══
// Lets admin temporarily switch off a world (or the welcome banner)
// from the profile panel. Bottom-nav icons for a switched-off world
// disappear, its map pin gets a 🚧 mark, and tapping the pin shows a
// note instead of entering. See VERSION_HISTORY / README for details.
const FEATURE_LABELS={
  garden:'🌿 garden',square:'🏚 square',forum:'🗼 tower (n/)',
  wireless:'🎙 wireless',castle:"🏰 nosirt's keep",intro:'🚪 welcome banner'
};
const REVIEW_LABELS={
  garden:'the garden',square:'town square',forum:'the tower',
  castle:"nosirt's keep",wireless:'the wireless'
};
const NAV_TOGGLE_KEYS=['garden','square','forum','wireless'];
const PIN_TOGGLE_KEYS=['garden','square','forum','castle','wireless'];

// Applies the current S.featureToggles state to the bottom nav + map pins.
// Safe to call any time (e.g. right after a Firebase sync, or on load).
function applyFeatureToggles(){
  NAV_TOGGLE_KEYS.forEach(key=>{
    const btn=$('nav-'+key);
    if(btn)btn.style.display=(S.featureToggles[key]===false)?'none':'';
  });
  PIN_TOGGLE_KEYS.forEach(key=>{
    const pin=$('fpin-'+key);
    if(pin)pin.classList.toggle('pin-disabled',S.featureToggles[key]===false);
  });
}

// Renders the checkbox list in the admin panel. Called when admin
// unlocks, and again whenever a features update comes in from Firebase.
function renderFeatureToggleList(){
  const el=$('feature-toggle-list');
  if(!el)return;
  el.innerHTML=Object.keys(FEATURE_LABELS).map(key=>{
    const on=S.featureToggles[key]!==false;
    return `<label style="display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:.75rem;color:var(--cream);font-family:'IM Fell English',serif;font-style:italic;cursor:pointer">
      <span>${FEATURE_LABELS[key]}</span>
      <input type="checkbox" ${on?'checked':''} onchange="toggleFeature('${key}',this.checked)" style="accent-color:#c8892a;width:16px;height:16px;cursor:pointer">
    </label>`;
  }).join('');
}

// Flips one toggle, saves it (live-synced to every visitor via
// Firebase), and applies it immediately in this browser too.
function toggleFeature(key,isOn){
  if(!S.adminUnlocked){toast('admin access required');return;}
  S.featureToggles[key]=isOn;
  fbSave('features',{v:JSON.stringify(S.featureToggles)});
  applyFeatureToggles();
  toast(`${(FEATURE_LABELS[key]||key).replace(/^[^\s]+\s/,'')} ${isOn?'switched on':'switched off'}`);
}

// The "🚧 under temporary review" note shown when tapping a disabled pin
// or landing on a disabled page's URL directly.
function showUnderReviewNote(key){
  const t=$('review-text');
  if(t)t.textContent=`${REVIEW_LABELS[key]||'this feature'} is under temporary review. check back soon.`;
  const m=$('review-modal');
  if(m)m.classList.add('open');
}
function closeReviewNote(){
  const m=$('review-modal');
  if(m)m.classList.remove('open');
}

function initMap(){
  const vp = $('map-viewport');
  if(!vp) return;
  fitMap();

  // ── Mobile pinch/pan; Hammer if it loads, native pointer fallback otherwise ──
  if(window.Hammer){
    const mc2 = new Hammer.Manager(vp, {
      recognizers:[
        [Hammer.Pan,  {direction: Hammer.DIRECTION_ALL, threshold:0}],
        [Hammer.Pinch,{enable:true}, ['pan']],
      ]
    });

    let startX=0, startY=0, startScale=1;
    mc2.on('panstart', ()=>{startX=S.mapX; startY=S.mapY;});
    mc2.on('panmove', e=>{
      S.mapX = startX + e.deltaX;
      S.mapY = startY + e.deltaY;
      clampMap(); applyMap();
    });

    mc2.on('pinchstart', ()=>{
      startScale = S.mapScale;
      startX = S.mapX; startY = S.mapY;
    });
    mc2.on('pinchmove', e=>{
      const newScale = Math.min(MAP_MAX_SCALE, Math.max(getMapMinScale(), startScale * e.scale));
      const cx = e.center.x, cy = e.center.y;
      S.mapX = cx - (cx - startX) * (newScale / startScale);
      S.mapY = cy - (cy - startY) * (newScale / startScale);
      S.mapScale = newScale;
      clampMap(); applyMap();
    });
  }else{
    bindPointerMap(vp);
  }

  // ── Desktop mouse drag ──
  let mdrag=false, msx=0, msy=0, mstartX=0, mstartY=0;
  vp.addEventListener('mousedown', e=>{
    if(e.target.closest('.map-pin')) return;
    mdrag=true; msx=e.clientX; msy=e.clientY;
    mstartX=S.mapX; mstartY=S.mapY;
    e.preventDefault();
  });
  window.addEventListener('mousemove', e=>{
    if(!mdrag) return;
    S.mapX = mstartX + (e.clientX - msx);
    S.mapY = mstartY + (e.clientY - msy);
    clampMap(); applyMap();
  });
  window.addEventListener('mouseup', ()=>{ mdrag=false; });

  // ── Desktop scroll wheel ──
  vp.addEventListener('wheel', e=>{
    e.preventDefault();
    zoomAt(e.deltaY<0 ? 1.12 : 0.9, e.clientX, e.clientY);
  },{passive:false});

  // ── Reset button ──
  const rb=$('map-reset');
  if(rb) rb.onclick = resetMap;
}

function bindPointerMap(vp){
  const points=new Map();
  let base=null;
  function mid(){
    const arr=[...points.values()];
    return {x:(arr[0].x+arr[1].x)/2,y:(arr[0].y+arr[1].y)/2,d:Math.hypot(arr[0].x-arr[1].x,arr[0].y-arr[1].y)};
  }
  vp.addEventListener('pointerdown',e=>{
    if(e.target.closest('.map-pin'))return;
    vp.setPointerCapture(e.pointerId);
    points.set(e.pointerId,{x:e.clientX,y:e.clientY});
    base=points.size===2?{...mid(),x0:S.mapX,y0:S.mapY,s0:S.mapScale}:{x:e.clientX,y:e.clientY,x0:S.mapX,y0:S.mapY,s0:S.mapScale};
  });
  vp.addEventListener('pointermove',e=>{
    if(!points.has(e.pointerId)||!base)return;
    points.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(points.size>=2){
      const m=mid(),newScale=Math.min(MAP_MAX_SCALE,Math.max(getMapMinScale(),base.s0*(m.d/base.d)));
      S.mapX=m.x-(base.x-base.x0)*(newScale/base.s0);
      S.mapY=m.y-(base.y-base.y0)*(newScale/base.s0);
      S.mapScale=newScale;
    }else{
      S.mapX=base.x0+(e.clientX-base.x);
      S.mapY=base.y0+(e.clientY-base.y);
    }
    clampMap();applyMap();
  });
  ['pointerup','pointercancel','pointerleave'].forEach(type=>vp.addEventListener(type,e=>{
    points.delete(e.pointerId);
    base=points.size?{x:[...points.values()][0].x,y:[...points.values()][0].y,x0:S.mapX,y0:S.mapY,s0:S.mapScale}:null;
  }));
}

// ═══ v01.10: URL ROUTING ═══
// Gives each section its own real, shareable URL:
//   /            → the map
//   /garden      → the garden
//   /square      → town square
//   /tower       → the tower (internal page id is 'forum' — kept for
//                  backwards compatibility with existing code)
//   /wireless    → the wireless
//   /keep        → nosirt's keep (password gate)
const ROUTE_TO_PAGE={garden:'garden',square:'square',tower:'forum',wireless:'wireless'};

function currentRoutePath(){
  return location.pathname.replace(/^\/|\/$/g,'').toLowerCase();
}

// v01.11: plain, non-smart way to land on the wireless page + sync the
// URL — used when a caller (like the dedicated Midnight Archive badge)
// has already decided exactly what should be shown and just needs the
// page + URL to catch up. Bypasses openWirelessSmart() entirely.
function gotoWirelessPageDirect(){
  const url='/wireless';
  if(location.pathname!==url)history.pushState({path:'wireless'},'',url);
  showPage('wireless');
}

// v01.11: the general-purpose "go to wireless" behavior — used by the
// bottom-nav wireless button, the map's wireless pin, direct/bookmarked
// URLs, browser back/forward, and the music modal's "The Wireless"
// option. Three cases:
//  1. Already viewing a specific show's player → step back out to the
//     main wireless page (the show grid).
//  2. Something is actively playing from wireless and we're not
//     already looking at it → jump straight to that show/episode.
//  3. Nothing playing → the main wireless page.
function openWirelessSmart(){
  if(S.view==='wireless' && S.currentShowId){
    S.currentShowId=null;
    showPage('wireless');
    return;
  }
  if(activeMusic==='podcast' && typeof currentEpisode!=='undefined' && currentEpisode && currentEpisode.showId){
    if(S.currentShowId!==currentEpisode.showId){
      S.currentShowId=currentEpisode.showId;
      if(typeof refreshCurrentShowEpisodes==='function')refreshCurrentShowEpisodes();
    }
    showPage('wireless');
    if(typeof setActiveShow==='function')setActiveShow(currentEpisode.showId,{autoplay:false});
    return;
  }
  S.currentShowId=null;
  showPage('wireless');
}

// Central router — shows the right view for a path. Pass push:false when
// responding to the browser's own back/forward (don't add a new entry).
function navigateTo(path,push){
  path=(path||'').replace(/^\/|\/$/g,'').toLowerCase();
  if(push!==false){
    const url=path?('/'+path):'/';
    if(location.pathname!==url)history.pushState({path},'',url);
  }
  if(path==='keep'){
    if(S.featureToggles.castle===false){showUnderReviewNote('castle');showMap();return;}
    showMap();openCastle();return;
  }
  const internal=ROUTE_TO_PAGE[path];
  if(internal){
    if(S.featureToggles[internal]===false){showUnderReviewNote(internal);showMap();return;}
    if(internal==='wireless'){openWirelessSmart();return;}
    showPage(internal);
  }else showMap();
}

window.addEventListener('popstate',()=>{navigateTo(currentRoutePath(),false);});

function goToLocation(loc){
  if(loc==='castle'){navigateTo('keep');return;}
  navigateTo(loc==='forum'?'tower':loc);
}

// Called from nav buttons — also resets any zoom/pan to sensible defaults
function navTo(page){
  navigateTo(page==='forum'?'tower':page);
}

// ═══ NAV ═══
function showPage(page){
  // Hide map and all mood worlds
  $('map-world').style.display='none';
  $('map-reset').style.display='none';
  if($('pin-overlay'))$('pin-overlay').style.display='none';
  document.querySelectorAll('.mood-world').forEach(w=>{
    w.classList.remove('active');
    w.style.opacity='0';
    w.style.pointerEvents='none';
  });
  // Reset ALL pages display then show the right one
  document.querySelectorAll('.page').forEach(p=>{
    p.classList.remove('active');
    p.style.display='none';
  });
  $('mood-back').classList.remove('visible');
  $('bottom-nav').style.display='block';
  $('profile-icon').style.display='block';
  $('float-chat').style.display='flex';
  const pg=$('page-'+page);
  if(pg){pg.style.display='flex';pg.classList.add('active');}
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  const nb=$('nav-'+page);if(nb)nb.classList.add('active');
  S.view=page;
  // v01.27: hide Pixie's wandering icon on non-map pages
  if(typeof updatePixieIconVisibility==='function') updatePixieIconVisibility();
  if(page==='forum')renderPosts();
  if(page==='wireless'){
    if(typeof ensureWirelessEpisodesListener==='function')ensureWirelessEpisodesListener();
    if(S.currentShowId&&typeof renderEpisodes==='function')renderEpisodes();
    else if(typeof renderShowGrid==='function')renderShowGrid();
  }
}

function showMap(){
  document.querySelectorAll('.page').forEach(p=>{p.classList.remove('active');p.style.display='none';});
  document.querySelectorAll('.mood-world').forEach(w=>{w.classList.remove('active');w.style.opacity='0';w.style.pointerEvents='none';});
  $('map-world').style.display='block';
  $('map-reset').style.display='flex';
  $('mood-back').classList.remove('visible');
  $('bottom-nav').style.display='none';
  $('profile-icon').style.display='block';
  $('float-chat').style.display='flex';
  if($('pin-overlay'))$('pin-overlay').style.display='block';
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  S.view='map';S.mood=null;
  if(typeof updatePixieIconVisibility==='function') updatePixieIconVisibility();
  updatePinOverlay();
}

function enterMoodWorld(mood){
  // Hide all pages and map
  document.querySelectorAll('.page').forEach(p=>{p.classList.remove('active');p.style.display='none';});
  $('map-world').style.display='none';
  $('map-reset').style.display='none';
  if($('pin-overlay'))$('pin-overlay').style.display='none';
  // Hide all mood worlds first
  document.querySelectorAll('.mood-world').forEach(w=>{
    w.classList.remove('active');
    w.style.opacity='0';
    w.style.pointerEvents='none';
  });
  // Show selected mood world
  const world=$('world-'+mood);
  if(world){
    world.style.opacity='';
    world.style.pointerEvents='';
    world.classList.add('active');
  }
  $('mood-back').classList.add('visible');
  $('bottom-nav').style.display='none';
  $('profile-icon').style.display='none';
  $('float-chat').style.display='flex';
  S.mood=mood;S.view='mood';
  if(mood==='expressionist'){
    bindExpTap();
    setTimeout(()=>{const cv=$('space-canvas');if(cv){cv.width=window.innerWidth;cv.height=window.innerHeight;initSpace();}},50);
  }
  if(mood==='wonderland'){
    bindWLDrag();
    setTimeout(()=>{
      spawnFireflies();
      spawnCardSoldiers();
      const cv=$('sparkle-canvas');
      if(cv){cv.width=window.innerWidth;cv.height=window.innerHeight;}
    },50);
  }
}
function exitMoodWorld(){
  document.querySelectorAll('.mood-world').forEach(w=>w.classList.remove('active'));
  navTo('garden');
}


// ═══ STONE NOTE ═══
// v01.08: the old standalone "carved in stone" overlay (openStoneNote/
// closeStoneNote) has been folded into the chat panel as a tab — see
// chat.js (openChatPanel, switchChatTab, saveStoneDebounced).

// ═══ EASTER EGGS ═══
const KONAMI=[38,38,40,40,37,39,37,39,66,65];let ki=0;
document.addEventListener('keydown',e=>{
  if(e.keyCode===KONAMI[ki]){ki++;if(ki===KONAMI.length){ki=0;toast('the beast watches');spawnBeast();}}else ki=0;
});
function spawnBeast(){
  const b=document.createElement('div');
  b.style.cssText='position:fixed;bottom:80px;left:50%;transform:translateX(-50%);font-size:3rem;z-index:999;pointer-events:none;';
  b.textContent='🐻';document.body.appendChild(b);setTimeout(()=>b.remove(),3000);
}
let nTaps=0,nTimer=null;

// ── WATERFALL AMBIENT SOUND ────────────────────────────────────────────────
function playWaterfallSound(){
  try{
    const ac=new(window.AudioContext||window.webkitAudioContext)();
    const buf=ac.createBuffer(1,ac.sampleRate*.8,ac.sampleRate);
    const data=buf.getChannelData(0);
    for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*.4;
    const src=ac.createBufferSource();src.buffer=buf;
    const flt=ac.createBiquadFilter();flt.type='bandpass';flt.frequency.value=800;flt.Q.value=.5;
    const g=ac.createGain();g.gain.setValueAtTime(0,ac.currentTime);
    g.gain.linearRampToValueAtTime(.15,ac.currentTime+.2);
    g.gain.linearRampToValueAtTime(0,ac.currentTime+.8);
    src.connect(flt);flt.connect(g);g.connect(ac.destination);
    src.start();src.stop(ac.currentTime+.8);
  }catch(e){}
}

// Waterfall click on map
document.addEventListener('click',function(e){
  if(S.view!=='map')return;
  // Check if near waterfall (approx screen position)
  const wfX=S.mapX+865*S.mapScale, wfY=S.mapY+755*S.mapScale;
  if(Math.hypot(e.clientX-wfX,e.clientY-wfY)<30*S.mapScale){
    playWaterfallSound();
    toast('the falls rush on');
  }
});

// ═══ INIT ═══
window.addEventListener('load',()=>{
  $('map-world').style.display='block';
  $('map-reset').style.display='flex';
  $('bottom-nav').style.display='none';
  document.querySelectorAll('.page').forEach(p=>{p.classList.remove('active');p.style.display='none';});
  // Use fitMap so the whole map is visible and centered
  setTimeout(()=>{fitMap();},50);
  // Bind element-specific listeners safely after DOM confirmed ready
  const _nfEl2=$('profile-icon');
  if(_nfEl2)_nfEl2.addEventListener('click',()=>{
    nTaps++;clearTimeout(nTimer);nTimer=setTimeout(()=>nTaps=0,2000);
    if(nTaps>=5){nTaps=0;toast('the wanderer returns...');setTimeout(showMap,800);}
  });
});
window.addEventListener('resize',()=>{
  const cv=$('sparkle-canvas');if(cv){cv.width=window.innerWidth;cv.height=window.innerHeight;}
  if(S.view==='map'){fitMap();updatePinOverlay();}
});
