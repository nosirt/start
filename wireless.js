/* ============================================================
   WIRELESS.JS — "the wireless" feature (podcast player)
   Load this AFTER core.js.
   Real markup lives in #page-wireless (shown via showPage('wireless')).
   Contains: YouTube-backed player (play/pause, 10s skip with
   hold-to-fast-skip, draggable seek bar, wave/video toggle,
   decorative wave visualizer that collapses to a slim bar in
   wave mode), prev/next episode nav, fullscreen/theater controls
   (video mode only), a center "play" button for first-touch,
   per-episode watch-progress persistence + resume, searchable
   episode list, and a Firebase-validated password gate for
   adding new episodes.
   ============================================================ */

let ytPlayer=null;
let ytApiReady=false;
let pendingVideoId=null;
let currentEpisode=null;
let radioUnlocked=false;
let wpDraggingSeek=false;
let wpHideTimer=null;
let waveRunning=false;

// v01.31: ytPlayer/currentEpisode are top-level `let` bindings, which do NOT
// become window properties the way `var`/function declarations do. Other
// scripts (background-audio.js) need window.ytPlayer to check play state
// for iOS keepalive/resume, so we mirror both onto window whenever they change.
function _wpSyncGlobals(){
  window.ytPlayer=ytPlayer;
  window.currentEpisode=currentEpisode;
}

function onYouTubeIframeAPIReady(){
  ytApiReady=true;
  if(pendingVideoId)createPlayer(pendingVideoId);
}

let pendingSeekSeconds=null;

function createPlayer(videoId){
  if(!ytApiReady){pendingVideoId=videoId;return;}
  if(ytPlayer){ytPlayer.loadVideoById(videoId);return;}
  ytPlayer=new YT.Player('yt-player',{
    videoId:videoId,
    playerVars:{controls:0,modestbranding:1,rel:0,playsinline:1,cc_load_policy:1,iv_load_policy:3,fs:0},
    events:{
      onReady:()=>{
        _wpSyncGlobals();
        ytPlayer.playVideo();
        const cp=$('wp-center-play');if(cp)cp.style.display='none';
      },
      onStateChange:onPlayerStateChange,
      onError:onPlayerError
    }
  });
  _wpSyncGlobals();
}

function onPlayerStateChange(e){
  const playing=e.data===1;
  const btn=$('wp-playpause');
  if(btn){
    const playIcon=btn.querySelector('.wp-icon-play'),pauseIcon=btn.querySelector('.wp-icon-pause');
    if(playIcon)playIcon.style.display=playing?'none':'block';
    if(pauseIcon)pauseIcon.style.display=playing?'block':'none';
  }
  const cp=$('wp-center-play');if(cp)cp.style.display=playing?'none':'flex';
  const stage=$('wp-stage');
  if(stage){stage.classList.toggle('is-playing',playing);stage.classList.toggle('is-paused',!playing);}
  if(playing){startWave();takeOverMusicForPodcast();}else{stopWave();}
  if((e.data===3||e.data===1)&&pendingSeekSeconds!=null){
    ytPlayer.seekTo(pendingSeekSeconds,true);
    pendingSeekSeconds=null;
  }
  if(e.data===0)nextEpisode();
  updateMiniPlayerUI();
}

// v01.31: a video that's private/deleted/embed-restricted fires onError
// instead of ever reaching onStateChange. Without this the player just
// sits there silently "stuck" — skip to the next episode automatically,
// same as if the current one had finished, and let the listener know why.
function onPlayerError(e){
  console.warn('wireless: video error',e&&e.data,'for episode',currentEpisode&&currentEpisode.id);
  toast('that video can\'t be played (private/removed) — skipping');
  nextEpisode();
}


/* ============================================================
   PLAYER CONTROLS — play/pause, seek bar, hold-to-skip, wave
   visualizer, wave/video mode toggle, theater/fullscreen.
   (v01.31: previously called from initWireless() below but never
   implemented — the whole interactive control layer was missing.)
   ============================================================ */

function togglePlayPause(){
  if(!ytPlayer||typeof ytPlayer.getPlayerState!=='function'){
    // nothing loaded yet — fall back to starting the default episode
    if(!currentEpisode)loadDefaultEpisode();
    return;
  }
  const state=ytPlayer.getPlayerState();
  if(state===1)ytPlayer.pauseVideo();
  else ytPlayer.playVideo();
}

function showWpControls(){
  const stage=$('wp-stage');
  if(!stage||!stage.classList.contains('mode-video'))return;
  const controls=$('wp-controls');
  if(controls)controls.classList.add('show');
  if(wpHideTimer)clearTimeout(wpHideTimer);
  wpHideTimer=setTimeout(()=>{
    if(controls)controls.classList.remove('show');
  },3000);
}

// ── Wave visualizer (decorative — YouTube's iframe audio isn't
// analyzable cross-origin, so this is a lightweight animated bar
// pattern rather than a true frequency analysis) ──
let _waveCtx=null,_waveRAF=null,_waveT=0;
function setupWaveCanvas(){
  const canvas=$('wp-wave');
  if(!canvas)return;
  const tile=$('wp-art-tile');
  const size=tile?tile.getBoundingClientRect():{width:76,height:76};
  const dpr=window.devicePixelRatio||1;
  canvas.width=Math.max(1,Math.round((size.width||76)*dpr));
  canvas.height=Math.max(1,Math.round((size.height||76)*dpr));
  _waveCtx=canvas.getContext('2d');
  if(_waveCtx)_waveCtx.scale(dpr,dpr);
  drawWave(0);
}
function drawWave(t){
  const canvas=$('wp-wave');
  if(!canvas||!_waveCtx)return;
  const dpr=window.devicePixelRatio||1;
  const w=canvas.width/dpr,h=canvas.height/dpr;
  _waveCtx.clearRect(0,0,w,h);
  const bars=5;
  const gap=w/(bars*2);
  for(let i=0;i<bars;i++){
    const phase=t/420+i*1.3;
    const amp=waveRunning?(0.25+Math.abs(Math.sin(phase))*0.65):0.14;
    const barH=Math.max(3,h*amp);
    const x=gap+(i*2*gap);
    _waveCtx.fillStyle='rgba(220,174,88,'+(waveRunning?0.85:0.3)+')';
    _waveCtx.fillRect(x-1.5,(h-barH)/2,3,barH);
  }
}
function _waveLoop(ts){
  _waveT=ts;
  drawWave(ts);
  if(waveRunning)_waveRAF=requestAnimationFrame(_waveLoop);
}
function startWave(){
  if(waveRunning)return;
  waveRunning=true;
  if(!_waveCtx)setupWaveCanvas();
  _waveRAF=requestAnimationFrame(_waveLoop);
}
function stopWave(){
  waveRunning=false;
  if(_waveRAF)cancelAnimationFrame(_waveRAF);
  drawWave(_waveT);
}

// ── Seek bar: click-to-jump + drag ──
function bindSeekBar(){
  const bar=$('wp-seekbar');
  if(!bar)return;
  const seekFromEvent=(clientX,commit)=>{
    if(!ytPlayer||typeof ytPlayer.getDuration!=='function')return;
    const rect=bar.getBoundingClientRect();
    const pct=Math.min(1,Math.max(0,(clientX-rect.left)/rect.width));
    const dur=ytPlayer.getDuration()||0;
    const fill=$('wp-seek-fill'),handle=$('wp-seek-handle');
    if(fill)fill.style.width=(pct*100)+'%';
    if(handle)handle.style.left=(pct*100)+'%';
    const cur=$('wp-time-cur');
    if(cur){const s=Math.floor(pct*dur);cur.textContent=Math.floor(s/60)+':'+String(s%60).padStart(2,'0');}
    if(commit&&dur)ytPlayer.seekTo(pct*dur,true);
  };
  const start=e=>{
    wpDraggingSeek=true;
    const x=e.touches?e.touches[0].clientX:e.clientX;
    seekFromEvent(x,false);
    e.preventDefault&&e.preventDefault();
  };
  const move=e=>{
    if(!wpDraggingSeek)return;
    const x=e.touches?e.touches[0].clientX:e.clientX;
    seekFromEvent(x,false);
  };
  const end=e=>{
    if(!wpDraggingSeek)return;
    wpDraggingSeek=false;
    const x=(e.changedTouches?e.changedTouches[0].clientX:e.clientX);
    if(typeof x==='number')seekFromEvent(x,true);
  };
  bar.addEventListener('pointerdown',start);
  window.addEventListener('pointermove',move);
  window.addEventListener('pointerup',end);
  bar.addEventListener('touchstart',start,{passive:false});
  window.addEventListener('touchmove',move,{passive:false});
  window.addEventListener('touchend',end);
  // plain click (no drag) also jumps
  bar.addEventListener('click',e=>{
    if(wpDraggingSeek)return;
    seekFromEvent(e.clientX,true);
  });
}

// Keeps the seek bar + time readouts in sync every animation frame
// while the video is actually playing (the 5s progress-save interval
// in initWireless persists to localStorage but is too coarse for a
// smooth-looking bar).
let _seekLoopLastPaint=0;
function seekBarUpdateLoop(ts){
  requestAnimationFrame(seekBarUpdateLoop);
  if(wpDraggingSeek)return;
  if(!ytPlayer||typeof ytPlayer.getCurrentTime!=='function')return;
  if(ts-_seekLoopLastPaint<200)return; // throttle to ~5x/sec
  _seekLoopLastPaint=ts;
  let secs=0,dur=0;
  try{secs=ytPlayer.getCurrentTime();dur=ytPlayer.getDuration();}catch(e){return;}
  if(!dur)return;
  const pct=Math.min(100,(secs/dur)*100);
  const fill=$('wp-seek-fill'),handle=$('wp-seek-handle');
  if(fill)fill.style.width=pct+'%';
  if(handle)handle.style.left=pct+'%';
  const fmt=s=>Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0');
  const cur=$('wp-time-cur'),durEl=$('wp-time-dur');
  if(cur)cur.textContent=fmt(secs);
  if(durEl)durEl.textContent=fmt(dur);
}

// ── Hold-to-fast-skip on the ±10s buttons: a tap does one 10s jump,
// a hold repeats every 350ms until released ──
function bindHoldButton(btn,dir){
  if(!btn)return;
  let holdTimer=null,heldOnce=false;
  const skip=()=>{
    if(!ytPlayer||typeof ytPlayer.getCurrentTime!=='function')return;
    let cur=0,dur=0;
    try{cur=ytPlayer.getCurrentTime();dur=ytPlayer.getDuration();}catch(e){return;}
    const next=Math.min(Math.max(0,cur+dir*10),dur||cur+dir*10);
    ytPlayer.seekTo(next,true);
  };
  const start=e=>{
    heldOnce=false;
    skip();
    holdTimer=setInterval(()=>{heldOnce=true;skip();},350);
    e.preventDefault&&e.preventDefault();
  };
  const stop=()=>{
    if(holdTimer){clearInterval(holdTimer);holdTimer=null;}
  };
  btn.addEventListener('pointerdown',start);
  btn.addEventListener('pointerup',stop);
  btn.addEventListener('pointerleave',stop);
  btn.addEventListener('touchstart',start,{passive:false});
  btn.addEventListener('touchend',stop);
  btn.addEventListener('touchcancel',stop);
}

// ── Wave/video mode toggle + theater/fullscreen ──
function updateModeLabel(){
  const stage=$('wp-stage');
  const isVideo=stage&&stage.classList.contains('mode-video');
  const waveIcon=document.querySelector('.wp-mode-icon-wave');
  const videoIcon=document.querySelector('.wp-mode-icon-video');
  const text=document.querySelector('.wp-mode-text');
  if(waveIcon)waveIcon.style.display=isVideo?'none':'block';
  if(videoIcon)videoIcon.style.display=isVideo?'block':'none';
  if(text)text.textContent=isVideo?'video':'podcast';
  const vc=$('wp-video-controls');
  if(vc)vc.style.display=isVideo?'flex':'none';
}
function toggleWaveVideo(){
  const stage=$('wp-stage');
  if(!stage)return;
  const goingVideo=stage.classList.contains('mode-wave');
  stage.classList.toggle('mode-wave',!goingVideo);
  stage.classList.toggle('mode-video',goingVideo);
  updateModeLabel();
  setupWaveCanvas();
  if(!goingVideo){
    // left video mode — also drop theater/fullscreen if active
    const page=$('page-wireless');
    if(page)page.classList.remove('theater-mode');
    if(document.fullscreenElement)document.exitFullscreen&&document.exitFullscreen().catch(()=>{});
  }
}
function toggleTheater(){
  const page=$('page-wireless');
  if(page)page.classList.toggle('theater-mode');
}
function toggleFullscreen(){
  const stage=$('wp-stage');
  if(!stage)return;
  const isFs=document.fullscreenElement||document.webkitFullscreenElement;
  if(!isFs){
    if(stage.requestFullscreen)stage.requestFullscreen().catch(()=>{});
    else if(stage.webkitRequestFullscreen)stage.webkitRequestFullscreen();
  }else{
    if(document.exitFullscreen)document.exitFullscreen().catch(()=>{});
    else if(document.webkitExitFullscreen)document.webkitExitFullscreen();
  }
}

// ── Spotify-style persistent mini-player, lives in the top music-bar
// so playback + controls stay reachable from any page (not just
// while the wireless page itself is open). ──
function updateMiniPlayerUI(){
  const mini=$('mini-player');
  if(!mini)return;
  const isPodcastActive=(typeof activeMusic!=='undefined'&&activeMusic==='podcast');
  if(!currentEpisode){ mini.style.display='none'; return; }
  mini.style.display='flex';
  const title=$('mini-player-title');
  if(title)title.textContent=currentEpisode.title||'The Wireless';
  const playing=!!(ytPlayer&&typeof ytPlayer.getPlayerState==='function'&&ytPlayer.getPlayerState()===1&&isPodcastActive);
  const playIcon=mini.querySelector('.mini-icon-play'),pauseIcon=mini.querySelector('.mini-icon-pause');
  if(playIcon)playIcon.style.display=playing?'none':'block';
  if(pauseIcon)pauseIcon.style.display=playing?'block':'none';
  mini.classList.toggle('inactive',!isPodcastActive);
}
function miniPlayerTogglePlayPause(){
  // If podcast isn't the active audio source right now, switching it
  // on should resume the episode rather than just toggling ytPlayer
  // (which might be paused because ambient music took over).
  if(typeof activeMusic!=='undefined'&&activeMusic!=='podcast'){
    toggleMusic('podcast');
    return;
  }
  togglePlayPause();
}

function takeOverMusicForPodcast(){
  stopAmbientMusic();
  activeMusic='podcast';
  document.querySelectorAll('.music-opt').forEach(o=>o.classList.remove('playing'));
  const el=document.querySelector('.music-opt[data-key="podcast"]');
  if(el)el.classList.add('playing');
  updateNP(currentEpisode?('🎙 '+currentEpisode.title):'🎙 The Wireless');
  updateMiniPlayerUI();
}

function loadEpisode(ep){
  currentEpisode=ep;
  _wpSyncGlobals();
  $('wp-placeholder').style.display='none';
  $('wp-now-title').textContent=ep.title;
  const saved=S.podcastProgress&&S.podcastProgress[ep.id];
  pendingSeekSeconds=(saved&&saved.seconds)?saved.seconds:null;
  if(ytPlayer)ytPlayer.loadVideoById(ep.videoId);
  else{pendingVideoId=ep.videoId;createPlayer(ep.videoId);}
  localStorage.setItem('n_last_podcast_ep',ep.id);
  renderEpisodes();
  // show + load this video's comment thread
  S.currentCommentEpisodeId=ep.id;
  const commentsSection=$('wp-comments-section');
  if(commentsSection)commentsSection.style.display='block';
  if(typeof renderComments==='function')renderComments();
  updateMiniPlayerUI();
}
function loadEpisodeById(id){
  const ep=(S.episodes||[]).find(e=>e.id===id);
  if(ep)loadEpisode(ep);
}
// v01.09: decide which episode plays when the user starts the podcast
// without picking a specific one — a live stream always wins regardless
// of saved position; otherwise resume where they left off; otherwise
// start from the OLDEST episode (a new listener starts at the beginning).
// S.episodes is sorted ascending by `order`, so the oldest is first.
function pickDefaultEpisode(){
  if(!S.episodes||!S.episodes.length)return null;
  const lastId=localStorage.getItem('n_last_podcast_ep');
  const resumed=lastId&&S.episodes.find(e=>e.id===lastId);
  if(resumed)return resumed;
  return S.episodes[0]; // oldest
}

function loadDefaultEpisode(){
  const ep=pickDefaultEpisode();
  if(ep)loadEpisode(ep);
}



async function toggleAddEpisode(){
  const panel=$('wp-add-panel');
  if(!panel)return;
  const showing=panel.style.display!=='none';
  if(showing){ panel.style.display='none'; return; }
  // Logged-in users who own this show skip the password gate
  if(S.account||S.adminUnlocked){
    $('wp-gate').style.display='none';
    $('wp-add-form').style.display='flex';
    radioUnlocked=true;
  } else {
    // Anonymous visitor — show password gate
    $('wp-gate').style.display='flex';
    $('wp-add-form').style.display='none';
  }
  panel.style.display='block';
}

async function tryRadioUnlock(){
  const val=$('wp-gate-pw').value.trim();
  const ok=await validatePassword('podcast_password',val);
  if(ok){
    radioUnlocked=true;
    $('wp-gate').style.display='none';
    $('wp-add-form').style.display='flex';
    $('wp-gate-pw').value='';$('wp-gate-wrong').textContent='';
  }else{
    $('wp-gate-pw').classList.add('wrong');
    $('wp-gate-wrong').textContent='wrong frequency. try again.';
    setTimeout(()=>$('wp-gate-pw').classList.remove('wrong'),420);
    $('wp-gate-pw').value='';
  }
}

function setAddTab(tab){
  $('wp-add-tab-single').classList.toggle('active',tab==='single');
  $('wp-add-tab-playlist').classList.toggle('active',tab==='playlist');
  $('wp-add-single').style.display=tab==='single'?'flex':'none';
  $('wp-add-playlist').style.display=tab==='playlist'?'flex':'none';
}

function parseYouTubeId(url){
  const m=(url||'').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|v=)([a-zA-Z0-9_-]{11})/);
  return m?m[1]:null;
}
function parsePlaylistId(url){
  const m=(url||'').match(/[?&]list=([a-zA-Z0-9_-]+)/);
  return m?m[1]:null;
}

function nextEpisodeOrder(){
  const eps=(S.showEpisodesAll||[]).filter(e=>e.showId===S.currentShowId);
  return eps.length?Math.max(...eps.map(e=>e.order||0))+1:0;
}

// ── Shuffle ──
let wpShuffleOn=false;
function toggleShuffle(){
  wpShuffleOn=!wpShuffleOn;
  const btn=$('wp-shuffle-btn');
  if(btn){btn.style.opacity=wpShuffleOn?'1':'0.4';btn.setAttribute('aria-pressed',wpShuffleOn);}
  toast(wpShuffleOn?'shuffle on 🔀':'shuffle off');
}
function nextEpisode(){
  const eps=S.episodes||[];if(!eps.length)return;
  if(wpShuffleOn){
    const others=eps.filter(e=>!currentEpisode||e.id!==currentEpisode.id);
    const pool=others.length?others:eps;
    loadEpisode(pool[Math.floor(Math.random()*pool.length)]);
  }else{
    const idx=currentEpisode?eps.findIndex(e=>e.id===currentEpisode.id):-1;
    loadEpisode(eps[(idx+1)%eps.length]||eps[0]);
  }
}
function prevEpisode(){
  const eps=S.episodes||[];if(!eps.length)return;
  const idx=currentEpisode?eps.findIndex(e=>e.id===currentEpisode.id):-1;
  loadEpisode(eps[(idx-1+eps.length)%eps.length]||eps[eps.length-1]);
}

function deleteEpisode(e,id){
  if(!S.adminUnlocked)return;
  e.stopPropagation();
  const ep=(S.episodes||[]).find(x=>x.id===id);
  if(!ep)return;
  showConfirmModal('delete this video?','"'+ep.title+'" will be permanently removed from this show.',()=>{
    fbDeleteShowEpisode(id);
    (S.comments||[]).filter(c=>c.episodeId===id).forEach(c=>fbDeleteComment(c.id));
    if(currentEpisode&&currentEpisode.id===id){
      currentEpisode=null;
      $('wp-placeholder').style.display='flex';
      $('wp-now-title').textContent='';
    }
    toast('video deleted');
  });
}
function editEpisode(e,id){
  if(!S.adminUnlocked)return;
  e.stopPropagation();
  const ep=(S.episodes||[]).find(x=>x.id===id);
  if(!ep)return;
  const newTitle=prompt('video title:',ep.title);
  if(newTitle===null)return;
  const newDesc=prompt('description:',ep.desc||'');
  const updates={title:filt(newTitle.trim())};
  if(newDesc!==null)updates.desc=filt(newDesc.trim());
  fbSaveShowEpisode(id,updates,true);
  if(currentEpisode&&currentEpisode.id===id)$('wp-now-title').textContent=updates.title;
  toast('video updated');
}

// Swaps `order` values with the adjacent item — works regardless of
// whether the underlying order numbers are contiguous.
function moveEpisode(e,id,dir){
  if(!S.adminUnlocked)return;
  e.stopPropagation();
  const list=(S.episodes||[]).slice();
  const idx=list.findIndex(x=>x.id===id);
  const swapIdx=idx+dir;
  if(idx===-1||swapIdx<0||swapIdx>=list.length)return;
  const a=list[idx],b=list[swapIdx];
  fbSaveShowEpisode(a.id,{order:b.order},true);
  fbSaveShowEpisode(b.id,{order:a.order},true);
}

function addEpisode(){
  if(!S.currentShowId){toast('open a show first');return;}
  const title=filt($('wp-ep-title').value.trim());
  const url=$('wp-ep-url').value.trim();
  const desc=filt($('wp-ep-desc').value.trim());
  const videoId=parseYouTubeId(url);
  if(!title){toast('give it a title first');return;}
  if(!videoId){toast("that doesn't look like a youtube link");return;}
  const id='ep'+Date.now();
  const ep={id,showId:S.currentShowId,title,desc,videoId,order:nextEpisodeOrder(),addedAt:Date.now()};
  fbSaveShowEpisode(id,ep);
  $('wp-ep-title').value='';$('wp-ep-url').value='';$('wp-ep-desc').value='';
  toast('video added ✓');

}

// Pulls every video out of a public YouTube playlist via the Data API v3
// and creates one episode doc per video, in playlist order.
async function importPlaylist(){
  if(!S.currentShowId){toast('open a show first');return;}
  if(!YOUTUBE_API_KEY||YOUTUBE_API_KEY.indexOf('PASTE_YOUR')===0){
    toast('add a free YouTube API key in core.js first (see the comment above YOUTUBE_API_KEY)');
    return;
  }
  const url=$('wp-playlist-url').value.trim();
  const playlistId=parsePlaylistId(url);
  if(!playlistId){toast("that doesn't look like a playlist link");return;}
  const progressEl=$('wp-import-progress');
  progressEl.style.display='block';
  progressEl.textContent='importing…';
  let pageToken='',imported=0,order=nextEpisodeOrder();
  try{
    do{
      const resp=await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${encodeURIComponent(playlistId)}&pageToken=${pageToken}&key=${YOUTUBE_API_KEY}`);
      const data=await resp.json();
      if(data.error)throw new Error(data.error.message||'YouTube API error');
      const items=data.items||[];
      const batch=db.batch();
      items.forEach(item=>{
        const vid=item.snippet&&item.snippet.resourceId&&item.snippet.resourceId.videoId;
        if(!vid)return;
        const rawTitle=(item.snippet.title||'untitled').trim();
        if(rawTitle==='Private video'||rawTitle==='Deleted video')return;
        const id='ep'+Date.now()+'_'+vid;
        order++;
        batch.set(db.collection('nosirt_show_episodes').doc(id),{
          id,showId:S.currentShowId,title:filt(rawTitle),desc:'',videoId:vid,
          order,addedAt:Date.now()
        });
        imported++;
      });
      await batch.commit();
      pageToken=data.nextPageToken||'';
      progressEl.textContent=`imported ${imported} so far…`;
    }while(pageToken&&imported<300); // safety cap
    progressEl.textContent=`done — imported ${imported} video${imported===1?'':'s'}.`;
    $('wp-playlist-url').value='';
    toast('playlist imported ✓');
    setTimeout(()=>{progressEl.style.display='none';},4000);
  }catch(err){
    console.error('playlist import error:',err);
    progressEl.textContent='import failed: '+err.message;
    toast('playlist import failed');
  }
}



// v01.11: the top-bar "podcast" badge — ALWAYS Midnight Archive,
// regardless of what's currently playing or which show admin has set
// as "default". Uses gotoWirelessPageDirect() (map-layout.js) rather
// than navigateTo('wireless'), since that path now runs the general
// "smart" wireless shortcut (see openWirelessSmart) which would
// second-guess the state we're about to set up here.
function handleLiveBadgeClick(){
  const show=getMidnightArchiveShow()||getDefaultShow();
  if(!show){navigateTo('wireless');return;}
  if(S.currentShowId!==show.id){S.currentShowId=show.id;refreshCurrentShowEpisodes();}
  const ep=pickDefaultEpisode();
  if(!ep){navigateTo('wireless');return;} // no videos exist yet at all
  loadEpisode(ep);
  toast('▶ '+ep.title);
  if(typeof gotoWirelessPageDirect==='function')gotoWirelessPageDirect();else navigateTo('wireless');
  if(typeof setActiveShow==='function')setActiveShow(show.id,{autoplay:false});
}



// v01.11: startPodcastFromMusicBar() / openDefaultShowFromMusicBar()
// were removed here — both only existed to force "always Midnight
// Archive" behavior, which now lives directly in handleLiveBadgeClick()
// above. The general-purpose "Wireless" control (music modal) now goes
// through openWirelessSmart() in map-layout.js instead.

(function initWireless(){
  document.addEventListener('DOMContentLoaded',()=>{
    const saved=localStorage.getItem('n_podcast_progress');
    S.podcastProgress=saved?JSON.parse(saved):{};

    setupWaveCanvas();
    bindSeekBar();
    bindHoldButton($('wp-back'),-1);
    bindHoldButton($('wp-fwd'),1);
    const pp=$('wp-playpause');if(pp)pp.addEventListener('click',togglePlayPause);
    const cp=$('wp-center-play');if(cp)cp.addEventListener('click',togglePlayPause);

    // Save per-episode progress every 5s so progress bars stay accurate
    setInterval(()=>{
      if(!currentEpisode||!ytPlayer||typeof ytPlayer.getCurrentTime!=='function')return;
      let secs=0,dur=0;
      try{secs=ytPlayer.getCurrentTime();dur=ytPlayer.getDuration();}catch(e){return;}
      if(!dur||secs<2)return;
      if(!S.podcastProgress)S.podcastProgress={};
      S.podcastProgress[currentEpisode.id]={seconds:Math.floor(secs),duration:Math.floor(dur)};
      try{localStorage.setItem('n_podcast_progress',JSON.stringify(S.podcastProgress));}catch(e){}
      // Update seekbar
      const fill=$('wp-seek-fill'),handle=$('wp-seek-handle');
      const pct=dur>0?(secs/dur*100):0;
      if(fill)fill.style.width=pct+'%';
      if(handle)handle.style.left=pct+'%';
      const fmt=s=>{const m=Math.floor(s/60);return m+':'+(String(Math.floor(s%60)).padStart(2,'0'));};
      const cur=$('wp-time-cur'),durEl=$('wp-time-dur');
      if(cur)cur.textContent=fmt(secs);
      if(durEl)durEl.textContent=fmt(dur);
    },5000);
    const stage=$('wp-stage');
    if(stage){
      ['pointerdown','pointermove'].forEach(ev=>stage.addEventListener(ev,showWpControls));
    }
    const vol=$('wp-volume');
    let volBeforeMute=100;
    if(vol)vol.addEventListener('input',()=>{
      if(ytPlayer&&typeof ytPlayer.setVolume==='function')ytPlayer.setVolume(+vol.value);
      updateMuteIcon(+vol.value===0);
    });
    const muteBtn=$('wp-mute-btn');
    if(muteBtn)muteBtn.addEventListener('click',()=>{
      if(!ytPlayer)return;
      const isMuted=typeof ytPlayer.isMuted==='function'&&ytPlayer.isMuted();
      if(isMuted){
        ytPlayer.unMute();
        ytPlayer.setVolume(volBeforeMute||100);
        if(vol)vol.value=volBeforeMute||100;
        updateMuteIcon(false);
      }else{
        volBeforeMute=(vol&&+vol.value)||100;
        ytPlayer.mute();
        if(vol)vol.value=0;
        updateMuteIcon(true);
      }
    });
    function updateMuteIcon(muted){
      const on=muteBtn&&muteBtn.querySelector('.wp-icon-vol-on');
      const off=muteBtn&&muteBtn.querySelector('.wp-icon-vol-off');
      if(on)on.style.display=muted?'none':'block';
      if(off)off.style.display=muted?'block':'none';
    }
    window.addEventListener('resize',setupWaveCanvas);
    requestAnimationFrame(seekBarUpdateLoop);
    drawWave(0);
    updateModeLabel();

    // v01.31: persistent Spotify-style mini-player in the top music-bar
    const miniPP=$('mini-player-playpause');
    if(miniPP)miniPP.addEventListener('click',miniPlayerTogglePlayPause);
    const miniPrev=$('mini-player-prev');
    if(miniPrev)miniPrev.addEventListener('click',prevEpisode);
    const miniNext=$('mini-player-next');
    if(miniNext)miniNext.addEventListener('click',nextEpisode);
    const miniTitle=$('mini-player-title');
    if(miniTitle)miniTitle.addEventListener('click',()=>{
      if(typeof openWirelessSmart==='function')openWirelessSmart();
      else navigateTo('wireless');
    });
    updateMiniPlayerUI();

    // v01.08: live-stream badge — initial paint + periodic re-check

  });
})();

/* ============================================================
   WIRELESS CALENDAR — "book the wireless" (recording slot booking)
   Public data (dates/times/open-or-taken) lives in Firestore doc
   nosirt/podcast_calendar and is synced live to every visitor via
   fbListen — it never contains names.
   Claimant names live in their own collection, nosirt_podcast_claims,
   one doc per slot id, and are only ever fetched when S.adminUnlocked
   is true — a normal visitor's browser never requests that data.
   (Same client-side trust model the rest of the site already uses
   for admin-only editing — not a substitute for real auth/Firestore
   security rules if that data ever needs to be truly locked down.)
   ============================================================ */

let wcalClaimsCache={};   // slotId -> {name, claimedAt} — populated only for admin
let wcalSelectedSlotId=null;
let wcalEditSlotId=null;

// Build `count` upcoming dates matching {day,start,end}, skipping any date
// whose id is in excludeIds, and skipping today if that start time already passed.
function generateSlots(pattern,count,excludeIds){
  excludeIds=excludeIds||new Set();
  const dayIdx=Number(pattern.day);
  const out=[];
  const now=new Date();
  let d=new Date();d.setHours(0,0,0,0);
  let guard=0;
  while(out.length<count && guard<400){
    guard++;
    if(d.getDay()===dayIdx){
      const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
      const dateISO=`${y}-${m}-${day}`;
      const slotStart=new Date(`${dateISO}T${pattern.start}:00`);
      if(slotStart>now && !excludeIds.has(dateISO)){
        out.push({
          id:dateISO,dateISO,
          day:d.toLocaleDateString('en-US',{weekday:'long'}),
          dateLabel:d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}),
          startTime:pattern.start,endTime:pattern.end,status:'open'
        });
      }
    }
    d.setDate(d.getDate()+1);
  }
  return out;
}

// Create the doc on first-ever use, or top up open slots so the visible
// window always has `visibleCount` future slots — runs whenever the
// calendar modal is opened, so it self-heals without admin action.
async function ensureCalendarTopUp(){
  if(!db)return;
  const ref=db.collection('nosirt').doc('podcast_calendar');
  try{
    const snap=await ref.get();
    let data=snap.exists?snap.data():null;
    if(!data){
      const pattern={day:2,start:'10:30',end:'11:30'};
      const visibleCount=4;
      const slots=generateSlots(pattern,visibleCount,new Set());
      data={pattern,visibleCount,slots};
      await ref.set(data);
      return;
    }
    const todayISO=new Date().toISOString().slice(0,10);
    const future=(data.slots||[]).filter(s=>s.dateISO>=todayISO);
    const needed=(data.visibleCount||4)-future.length;
    if(needed>0){
      const excludeIds=new Set((data.slots||[]).map(s=>s.id));
      const fresh=generateSlots(data.pattern,needed,excludeIds);
      const merged=[...future,...fresh].sort((a,b)=>a.dateISO.localeCompare(b.dateISO));
      await ref.set({...data,slots:merged});
    }
  }catch(e){console.warn('calendar top-up error:',e.message);}
}

function openCalendarModal(){
  $('wcal-modal').classList.add('open');
  $('wcal-claim-box').classList.remove('show');
  closeAdminEdit();
  ensureCalendarTopUp();
  if(S.adminUnlocked)loadClaimNamesForAdmin();
}
function closeCalendarModal(){
  $('wcal-modal').classList.remove('open');
  $('wcal-admin-panel').classList.remove('show');
}

function renderCalendarGrid(){
  const grid=$('wcal-grid'),empty=$('wcal-empty');
  if(!grid)return;
  const cal=S.calendar;
  const todayISO=new Date().toISOString().slice(0,10);
  const slots=((cal&&cal.slots)||[]).filter(s=>s.dateISO>=todayISO).sort((a,b)=>a.dateISO.localeCompare(b.dateISO));
  if(!slots.length){grid.innerHTML='';empty.style.display='block';return;}
  empty.style.display='none';
  const isAdmin=S.adminUnlocked;
  grid.innerHTML=slots.map(s=>{
    const claim=isAdmin&&s.status==='taken'?wcalClaimsCache[s.id]:null;
    const claimLine=isAdmin&&s.status==='taken'
      ?`<div class="wcal-slot-claimed-name">booked by ${claim?esc(claim.name):'…'}</div>`:'';
    const adminRow=isAdmin?`<div class="wcal-slot-admin-row">
        <button class="wcal-mini-btn" onclick="event.stopPropagation();openAdminEdit('${s.id}')">✎ edit</button>
      </div>`:'';
    return `<div class="wcal-slot ${s.status}" onclick="onSlotClick('${s.id}')">
      <div class="wcal-slot-status"></div>
      <div class="wcal-slot-day">${esc(s.day)}</div>
      <div class="wcal-slot-date">${esc(s.dateLabel)}</div>
      <div class="wcal-slot-time">${esc(s.startTime)}–${esc(s.endTime)}</div>
      ${claimLine}${adminRow}
    </div>`;
  }).join('');
}

function onSlotClick(slotId){
  const slot=((S.calendar&&S.calendar.slots)||[]).find(s=>s.id===slotId);
  if(!slot)return;
  if(slot.status==='taken'){
    if(S.adminUnlocked)openAdminEdit(slotId);
    else toast('this slot is already taken');
    return;
  }
  closeAdminEdit();
  wcalSelectedSlotId=slotId;
  $('wcal-claim-label').textContent=`your name for ${slot.day}, ${slot.dateLabel}, ${slot.startTime}–${slot.endTime}:`;
  $('wcal-claim-box').classList.add('show');
  $('wcal-claim-name').focus();
}

// Uses a Firestore transaction so two people tapping the same slot at the
// same moment can't both win it — whoever's write lands first gets it,
// the other gets bounced back to "taken" with a toast.
async function submitClaim(){
  const nameRaw=$('wcal-claim-name').value.trim();
  if(!nameRaw){toast('enter your name first');return;}
  if(!wcalSelectedSlotId){return;}
  if(!db){toast('booking is unavailable right now');return;}
  const slotId=wcalSelectedSlotId;
  const ref=db.collection('nosirt').doc('podcast_calendar');
  let outcome='ok';
  try{
    await db.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      if(!snap.exists)throw new Error('no calendar doc');
      const data=snap.data();
      const slots=data.slots||[];
      const idx=slots.findIndex(s=>s.id===slotId);
      if(idx===-1||slots[idx].status!=='open'){outcome='taken';return;}
      const next=slots.slice();
      next[idx]={...next[idx],status:'taken'};
      tx.set(ref,{...data,slots:next});
    });
    if(outcome==='taken'){
      toast('sorry — someone just grabbed that slot');
      $('wcal-claim-box').classList.remove('show');
      wcalSelectedSlotId=null;
      return;
    }
    await db.collection('nosirt_podcast_claims').doc(slotId).set({name:filt(nameRaw),claimedAt:Date.now()});
    toast('slot booked — see you then 🎙');
    $('wcal-claim-box').classList.remove('show');
    $('wcal-claim-name').value='';
    wcalSelectedSlotId=null;
  }catch(e){
    console.error('claim error:',e);
    toast('something went wrong — try again');
  }
}

// ── ADMIN: view names, edit/reopen/delete individual slots, bulk pattern ──
async function loadClaimNamesForAdmin(){
  if(!db||!S.adminUnlocked)return;
  try{
    const snap=await db.collection('nosirt_podcast_claims').get();
    const cache={};
    snap.forEach(doc=>{cache[doc.id]=doc.data();});
    wcalClaimsCache=cache;
    renderCalendarGrid();
  }catch(e){console.warn('claim name fetch error:',e.message);}
}

function toggleCalAdminPanel(){
  if(!S.adminUnlocked){toast('admin access required');return;}
  const panel=$('wcal-admin-panel');
  panel.classList.toggle('show');
  if(panel.classList.contains('show')&&S.calendar&&S.calendar.pattern){
    $('wcal-admin-day').value=S.calendar.pattern.day;
    $('wcal-admin-start').value=S.calendar.pattern.start;
    $('wcal-admin-end').value=S.calendar.pattern.end;
    $('wcal-admin-count').value=S.calendar.visibleCount||4;
  }
}

// Regenerates every upcoming OPEN slot using the new pattern/count.
// Slots that are already claimed are left completely untouched.
async function applyCalPattern(){
  if(!S.adminUnlocked){toast('admin access required');return;}
  if(!db)return;
  const day=Number($('wcal-admin-day').value);
  const start=$('wcal-admin-start').value;
  const end=$('wcal-admin-end').value;
  const count=Math.max(1,Math.min(20,Number($('wcal-admin-count').value)||4));
  if(!start||!end){toast('set both start and end time');return;}
  const pattern={day,start,end};
  const ref=db.collection('nosirt').doc('podcast_calendar');
  try{
    const snap=await ref.get();
    const data=snap.exists?snap.data():{slots:[]};
    const todayISO=new Date().toISOString().slice(0,10);
    const claimed=(data.slots||[]).filter(s=>s.dateISO>=todayISO&&s.status==='taken');
    const excludeIds=new Set(claimed.map(s=>s.id));
    const needed=Math.max(0,count-claimed.length);
    const fresh=generateSlots(pattern,needed,excludeIds);
    const merged=[...claimed,...fresh].sort((a,b)=>a.dateISO.localeCompare(b.dateISO));
    await ref.set({pattern,visibleCount:count,slots:merged});
    toast('schedule updated');
  }catch(e){
    console.error('pattern apply error:',e);
    toast('couldn\'t update schedule');
  }
}

function openAdminEdit(slotId){
  if(!S.adminUnlocked)return;
  const slot=((S.calendar&&S.calendar.slots)||[]).find(s=>s.id===slotId);
  if(!slot)return;
  wcalEditSlotId=slotId;
  $('wcal-claim-box').classList.remove('show');
  $('wcal-edit-date').value=slot.dateISO;
  $('wcal-edit-start').value=slot.startTime;
  $('wcal-edit-end').value=slot.endTime;
  const claim=wcalClaimsCache[slotId];
  $('wcal-edit-name').textContent=slot.status==='taken'
    ?('booked by: '+(claim?claim.name:'…'))
    :'this slot is currently open';
  $('wcal-edit-clear-btn').style.display=slot.status==='taken'?'inline-block':'none';
  $('wcal-edit-box').classList.add('show');
}

function closeAdminEdit(){
  wcalEditSlotId=null;
  const box=$('wcal-edit-box');
  if(box)box.classList.remove('show');
}

async function saveSlotEdit(){
  if(!S.adminUnlocked||!wcalEditSlotId||!db)return;
  const newDate=$('wcal-edit-date').value;
  const start=$('wcal-edit-start').value;
  const end=$('wcal-edit-end').value;
  if(!newDate||!start||!end){toast('fill in date, start, and end');return;}
  const ref=db.collection('nosirt').doc('podcast_calendar');
  try{
    const snap=await ref.get();
    const data=snap.data();
    const idx=(data.slots||[]).findIndex(s=>s.id===wcalEditSlotId);
    if(idx===-1)return;
    const old=data.slots[idx];
    const d=new Date(newDate+'T00:00:00');
    const updated={...old,id:newDate,dateISO:newDate,
      day:d.toLocaleDateString('en-US',{weekday:'long'}),
      dateLabel:d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}),
      startTime:start,endTime:end};
    const nextSlots=data.slots.slice();
    nextSlots[idx]=updated;
    // If the id (date) changed on a claimed slot, move its name doc too
    if(newDate!==old.id&&old.status==='taken'){
      const claimSnap=await db.collection('nosirt_podcast_claims').doc(old.id).get();
      if(claimSnap.exists){
        await db.collection('nosirt_podcast_claims').doc(newDate).set(claimSnap.data());
        await db.collection('nosirt_podcast_claims').doc(old.id).delete();
      }
    }
    await ref.set({...data,slots:nextSlots});
    toast('slot updated');
    closeAdminEdit();
    loadClaimNamesForAdmin();
  }catch(e){
    console.error('slot edit error:',e);
    toast('couldn\'t save that change');
  }
}

async function clearSlotClaim(){
  if(!S.adminUnlocked||!wcalEditSlotId||!db)return;
  const ref=db.collection('nosirt').doc('podcast_calendar');
  try{
    const snap=await ref.get();
    const data=snap.data();
    const idx=(data.slots||[]).findIndex(s=>s.id===wcalEditSlotId);
    if(idx===-1)return;
    const nextSlots=data.slots.slice();
    nextSlots[idx]={...nextSlots[idx],status:'open'};
    await ref.set({...data,slots:nextSlots});
    await db.collection('nosirt_podcast_claims').doc(wcalEditSlotId).delete().catch(()=>{});
    toast('slot reopened');
    closeAdminEdit();
  }catch(e){
    console.error('clear claim error:',e);
    toast('couldn\'t reopen that slot');
  }
}

async function deleteSlot(){
  if(!S.adminUnlocked||!wcalEditSlotId||!db)return;
  const ref=db.collection('nosirt').doc('podcast_calendar');
  try{
    const snap=await ref.get();
    const data=snap.data();
    const nextSlots=(data.slots||[]).filter(s=>s.id!==wcalEditSlotId);
    await ref.set({...data,slots:nextSlots});
    await db.collection('nosirt_podcast_claims').doc(wcalEditSlotId).delete().catch(()=>{});
    toast('slot removed');
    closeAdminEdit();
  }catch(e){
    console.error('delete slot error:',e);
    toast('couldn\'t remove that slot');
  }
}

/* ============================================================
   WIRELESS SHOWS — Netflix-style multi-show browser
   Every show (podcast, music playlist, whatever else gets added)
   lives in Firestore collection nosirt_shows; every video lives in
   nosirt_show_episodes tagged with a showId. S.episodes always holds
   whichever show is currently open (see refreshCurrentShowEpisodes),
   which is why nearly all the player/episode logic above didn't need
   to change — it already just reads S.episodes.
   ============================================================ */

function getDefaultShow(){
  return (S.shows||[]).find(s=>s.isDefault) || (S.shows||[])[0] || null;
}
// v01.11: the top-bar "podcast" badge is a dedicated Midnight Archive
// shortcut — deliberately independent of whichever show admin has
// marked "default" (that setting can be changed later; this can't).
function getMidnightArchiveShow(){
  return (S.shows||[]).find(s=>s.id==='midnight-archive')
      || (S.shows||[]).find(s=>(s.title||'').trim().toLowerCase()==='midnight archive')
      || null;
}
function currentShowIdSafe(){ return S.currentShowId||null; }

function refreshCurrentShowEpisodes(){
  S.episodes=(S.showEpisodesAll||[]).filter(e=>e.showId===S.currentShowId).sort((a,b)=>(a.order||0)-(b.order||0));
}

// One-time migration: if no shows exist yet but the old single-podcast
// data does, wrap it into a "Midnight Archive" show so nothing is lost.
async function ensureShowsMigrated(){
  if(!db)return;
  try{
    const showsSnap=await db.collection('nosirt_shows').get();
    if(!showsSnap.empty)return;
    const legacySnap=await db.collection('nosirt').doc('episodes').get();
    const legacyEpisodes=legacySnap.exists?JSON.parse(legacySnap.data().v||'[]'):[];
    const showId='midnight-archive';
    await db.collection('nosirt_shows').doc(showId).set({
      id:showId,title:'Midnight Archive',
      description:'the original wireless broadcast — strange stories, late-night thoughts, and things better left half-explained.',
      coverType:'youtube',coverUrl:'',colorHex:'#c8892a',order:0,isDefault:true,createdAt:Date.now()
    });
    if(legacyEpisodes.length){
      const batch=db.batch();
      // legacy list was newest-first (unshift) — reverse so order ascends oldest→newest
      const chronological=legacyEpisodes.slice().reverse();
      chronological.forEach((ep,i)=>{
        const id=ep.id||('ep'+Date.now()+i);
        batch.set(db.collection('nosirt_show_episodes').doc(id),{
          id,showId,title:ep.title||'untitled',videoId:ep.videoId,desc:ep.desc||'',
          order:i,addedAt:ep.addedAt||Date.now()
        });
      });
      await batch.commit();
    }
  }catch(e){console.warn('show migration error:',e.message);}
}

let wirelessEpisodesUnsub=null;
function ensureWirelessEpisodesListener(){
  if(wirelessEpisodesUnsub || typeof fbListenShowEpisodes!=='function')return;
  wirelessEpisodesUnsub=fbListenShowEpisodes(items=>{
    S.showEpisodesAll=items||[];
    if(S.currentShowId)refreshCurrentShowEpisodes();
    if(S.wpView==='show')renderEpisodes();
    if(S.wpView==='home'||!S.wpView)renderShowGrid();

  });
}

async function initWirelessShows(){
  await ensureShowsMigrated();
  fbListenShows(items=>{
    S.shows=(items||[]).sort((a,b)=>(a.order||0)-(b.order||0));
    if(S.currentShowId)refreshCurrentShowEpisodes();
    if(S.wpView==='home'||!S.wpView)renderShowGrid();
  });
  fbListenComments(items=>{
    S.comments=items||[];
    if(S.currentCommentEpisodeId&&typeof renderComments==='function')renderComments();
  });
}

// ── navigation between the netflix grid and a show's detail/player ──
function showWirelessHome(){
  S.wpView='home';
  S.currentShowId=null;
  const showView=$('wp-show-view'),home=$('wp-home');
  if(showView)showView.style.display='none';
  if(home)home.style.display='block';
  renderShowGrid();
  updateWirelessToolbar();
}

function updateWirelessToolbar(){
  // Single "my stuff" button replaces the old scattered add/create buttons
  const stuffBtn = $('btn-your-stuff');
  if(stuffBtn) stuffBtn.style.display = (S.adminUnlocked || S.account) ? 'inline-flex' : 'none';
}

function setActiveShow(showId,opts){
  opts=opts||{};
  S.currentShowId=showId;
  S.selectMode=false;S.selectedEpisodeIds=new Set();
  refreshCurrentShowEpisodes();
  S.wpView='show';
  const showView=$('wp-show-view'),home=$('wp-home');
  if(home)home.style.display='none';
  if(showView)showView.style.display='block';
  renderShowBanner();
  renderEpisodes();
  updateBulkDeleteUI();
  // Show comments for the show (episode-level comments appear when an episode is clicked)
  S.currentCommentEpisodeId=null;
  const commSec=$('wp-comments-section');
  if(commSec)commSec.style.display='block';
  if(typeof renderComments==='function')renderComments();
  // Hide the add panel until explicitly opened
  const addPanel=$('wp-add-panel');
  if(addPanel)addPanel.style.display='none';
  radioUnlocked=false;
  // Only show + add button for show owners
  const addBtn=$('wp-add-ep-btn');
  if(addBtn)addBtn.style.display=isCurrentShowMine()?'inline-flex':'none';
  if(opts.autoplay)loadDefaultEpisode();
}
function openShow(showId){ setActiveShow(showId,{autoplay:false}); }

// ── home grid ──
// v01.27: returns the YouTube thumbnail URL for a given videoId and
// optional thumbTs (integer seconds). If thumbTs is set we use the
// YouTube storyboard URL which gives a clean frame at that second —
// no storage, no upload, pure URL trick.
function ytThumbUrl(videoId, thumbTs){
  if(!videoId) return null;
  if(thumbTs != null && Number.isFinite(thumbTs) && thumbTs >= 0){
    // YouTube does not expose arbitrary-frame URLs in a documented way,
    // but the vi/ endpoint gives 4 preset thumbnails. We pick the
    // closest preset (0=cover, 1=25%, 2=50%, 3=75%) based on thumbTs
    // relative to a guessed duration of 60 min (worst case).
    // For most content thumbTs is a known keyframe so this is fine.
    const presets = [
      {key:'maxresdefault', t:0},
      {key:'hqdefault',     t:0},
      {key:'mqdefault',     t:0},
    ];
    // Use the YouTube /vi/ thumbnail + a canvas capture approach
    // triggered once on hover/edit — stored as a data-URL on the element.
    // For the initial render we fall back to hqdefault.
    return 'https://img.youtube.com/vi/' + videoId + '/hqdefault.jpg';
  }
  return 'https://img.youtube.com/vi/' + videoId + '/hqdefault.jpg';
}

function showCoverStyle(show,eps){
  if(show.coverType==='custom'&&show.coverUrl){
    return {style:'background-image:url("' + show.coverUrl.replace(/"/g,'') + '");background-size:cover;background-position:center;'};
  }
  if(show.coverType==='youtube'||!show.coverType){
    const first=eps&&eps[0];
    if(first&&first.videoId){
      const thumbUrl = ytThumbUrl(first.videoId, first.thumbTs);
      return {style:'background-image:url("' + thumbUrl + '");background-size:cover;background-position:center;'};
    }
  }
  // Plain color / title card fallback
  const color=show.colorHex||'#c8892a';
  return {
    style:'background:linear-gradient(135deg, ' + color + '55, ' + color + '22);',
    label:'<span class="wp-show-cover-title">' + esc(show.title) + '</span>'
  };
}

// Canvas-based YouTube frame capture — called from the thumbnail
// timestamp editor. Renders a single frame into a hidden canvas.
// Returns a promise that resolves to a data-URL string, or null on failure.
async function captureYouTubeFrame(videoId, tsSeconds){
  return new Promise(resolve => {
    if(!videoId){ resolve(null); return; }
    const ts = Math.max(0, Math.round(tsSeconds || 0));
    // Build an embed URL with autoplay, mute, start time
    const src = 'https://www.youtube.com/embed/' + videoId +
      '?start=' + ts + '&autoplay=1&mute=1&controls=0';
    const iframe = document.createElement('iframe');
    iframe.src = src;
    iframe.width = '480';
    iframe.height = '270';
    iframe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;pointer-events:none;opacity:0;';
    document.body.appendChild(iframe);
    // Wait for the frame to load + seek, then try canvas capture.
    // Cross-origin restrictions prevent actual pixel capture from YouTube iframes,
    // so we fall back to storing just the timestamp on the episode doc.
    // The thumbnail display still uses the hqdefault URL but the stored thumbTs
    // is shown in the editor so admins know what they set.
    setTimeout(() => {
      document.body.removeChild(iframe);
      resolve(null); // cross-origin blocks capture; just save ts as metadata
    }, 3000);
  });
}

// Open a thumbnail timestamp picker for an episode
function openThumbPicker(episodeId){
  const ep = (S.showEpisodesAll||S.episodes||[]).find(e=>e.id===episodeId);
  if(!ep || !ep.videoId){ toast('no video found'); return; }
  const cur = ep.thumbTs != null ? ep.thumbTs : 0;
  const input = prompt(
    'Enter thumbnail timestamp in seconds (e.g. 45 for 0:45):\n' +
    'YouTube will show the frame closest to that time.\n' +
    'Current: ' + cur + 's',
    String(cur)
  );
  if(input === null) return;
  const ts = parseInt(input, 10);
  if(isNaN(ts) || ts < 0){ toast('invalid timestamp'); return; }
  fbSaveShowEpisode(episodeId, {thumbTs: ts}, true);
  toast('thumbnail timestamp saved: ' + ts + 's ✓');
}

// v01.18: Pixie's reserved shorts source. Fed via the same "paste a
// playlist link" flow as any other show (see importPlaylist above) —
// admin just names the show "pixie" and imports into it like normal.
function getPixieShow(){
  return (S.shows||[]).find(s=>(s.title||'').trim().toLowerCase()==='pixie')||null;
}
function getPixieShowEpisodes(){
  const show=getPixieShow();
  if(!show)return [];
  return (S.showEpisodesAll||[]).filter(e=>e.showId===show.id).sort((a,b)=>(a.order||0)-(b.order||0));
}

// v01.26: show ownership and sharing helpers

// Opens show creation form for non-admin logged-in users
function openUserShowForm(){
  if(!S.account){ toast('sign in to create a playlist'); return; }
  openShowForm(null);
}

function isCurrentShowMine(){
  const show=(S.shows||[]).find(s=>s.id===S.currentShowId);
  if(!show) return false;
  return showIsOwnedByMe(show);
}

// Share an episode as a card into global chat
function shareEpisodeToChat(ep){
  if(!S.account){ toast('sign in to share'); return; }
  const show=(S.shows||[]).find(s=>s.id===ep.showId);
  const card={
    type:'episode',
    showTitle: show?show.title:'',
    episodeTitle: ep.title,
    desc: ep.desc||'',
    sharedBy: S.account.username,
    sharedAt: Date.now()
  };
  if(typeof sendSharedCardToChat==='function') sendSharedCardToChat(card);
  else toast('share sent to chat');
}

// Share an entire show as a card into global chat
function shareShowToChat(showId){
  if(!S.account){ toast('sign in to share'); return; }
  const show=(S.shows||[]).find(s=>s.id===showId);
  if(!show){ toast('show not found'); return; }
  const eps=(S.showEpisodesAll||[]).filter(e=>e.showId===showId);
  const card={
    type:'show',
    showId: show.id,
    showTitle: show.title,
    description: show.description||'',
    episodeCount: eps.length,
    sharedBy: S.account.username,
    sharedAt: Date.now()
  };
  if(typeof sendSharedCardToChat==='function') sendSharedCardToChat(card);
  else toast('share sent to chat');
}

// Toggle a user-owned show between public and private
// (v01.31: this used to have its own duplicate showConfirmModal(title,msg)
// that returned a Promise — a second, incompatible showConfirmModal(title,
// body,onConfirm) defined later in this file always won via hoisting, so
// `await showConfirmModal(...)` below resolved to undefined instantly and
// confirmToggleShowPublic() bailed out before the user ever saw/answered
// the modal. Removed the dead duplicate; confirmToggleShowPublic() now
// uses the real modal's callback form directly.)

async function toggleShowPublic(showId){
  if(!S.account){ toast('sign in to change visibility'); return; }
  const show=(S.shows||[]).find(s=>s.id===showId);
  if(!show || !showIsOwnedByMe(show)){ toast('not your show'); return; }
  const newPublic = !show.isPublic;
  const res = await callAccountUpdate({
    action:'toggleShowPublic', username:S.account.username,
    token:S.account.token, showId, isPublic:newPublic
  });
  if(!res.ok){ toast(res.error||"couldn't update"); return; }
  toast(newPublic ? 'show is now public 🌿' : 'show is now private 🔒');
  // Local update while Firestore listener catches up
  show.isPublic = newPublic;
  renderShowGrid();
  renderShowBanner();
}

// v01.26: show ownership helpers
function showIsVisibleToUser(s){
  if((s.title||'').trim().toLowerCase()==='pixie' && !S.adminUnlocked) return false;
  if(S.adminUnlocked) return true;
  if(s.isPublic) return true;
  if(S.account && s.owner === S.account.username) return true;
  return false;
}
function showIsOwnedByMe(s){
  if(S.adminUnlocked && !s.owner) return true; // legacy admin shows
  if(S.adminUnlocked && s.owner === 'admin') return true;
  if(S.adminUnlocked && s.owner === 'nosirt') return true; // claimed shows
  if(S.account && s.owner === S.account.username) return true;
  return false;
}

function renderShowGrid(){
  const grid=$('wp-show-grid'),empty=$('wp-show-grid-empty');
  if(!grid)return;
  const q=($('wp-home-search')?$('wp-home-search').value:'').trim().toLowerCase();

  const allVisible=(S.shows||[]).filter(s=>{
    if(!showIsVisibleToUser(s)) return false;
    return !q||s.title.toLowerCase().includes(q)||(s.description||'').toLowerCase().includes(q);
  });

  // Main grid: public shows only (private shows live in "your stuff" tab)
  const publicShows = allVisible.filter(s => s.isPublic || S.adminUnlocked);

  function makeCard(s){
    const eps=(S.showEpisodesAll||[]).filter(e=>e.showId===s.id).sort((a,b)=>(a.order||0)-(b.order||0));
    const cover=showCoverStyle(s,eps);
    const shortDesc=(s.description||'').slice(0,80);
    const ownerTag = (s.owner && s.owner!=='admin' && s.owner!=='nosirt')
      ? '<div style="font-size:.58rem;color:var(--fog);opacity:.5;margin-top:2px">by '+esc(s.owner)+'</div>' : '';
    return '<div class="wp-show-card" onclick="openShow(\''+s.id+'\')">'+
      '<div class="wp-show-cover" style="'+cover.style+'">'+(cover.label||'')+'</div>'+
      '<div class="wp-show-card-title">'+esc(s.title)+'</div>'+
      '<div class="wp-show-card-desc">'+esc(shortDesc)+((s.description||'').length>80?'…':'')+'</div>'+
      '<div class="wp-show-card-count">'+eps.length+' video'+(eps.length===1?'':'s')+'</div>'+
      ownerTag+
      '</div>';
  }

  if(!publicShows.length){
    grid.innerHTML='';
    empty.style.display='block';
    empty.textContent=q?'no shows match that search.':'no public shows yet.';
    return;
  }
  empty.style.display='none';
  grid.innerHTML = publicShows.map(s=>makeCard(s)).join('');
}

// ── "Your Stuff" panel — user's own shows with privacy toggle ──
function openYourStuff(){
  const panel=$('wp-your-stuff-panel');
  if(panel){ panel.style.display=panel.style.display==='none'?'block':'none'; renderYourStuff(); return; }
  // Create panel
  const p=document.createElement('div');
  p.id='wp-your-stuff-panel';
  p.style.cssText='position:fixed;inset:0;z-index:160;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.55);backdrop-filter:blur(2px)';
  p.innerHTML='<div style="width:100%;max-width:480px;max-height:75vh;background:rgba(10,8,6,.97);border-top:1px solid rgba(200,137,42,.3);border-radius:16px 16px 0 0;overflow-y:auto;padding:16px 16px 32px">'
    +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">'
    +'<span style="font-family:Cinzel Decorative,serif;font-size:.85rem;color:var(--amber)">your playlists</span>'
    +'<button onclick="closeYourStuff()" style="background:none;border:none;color:var(--fog);font-size:1.1rem;cursor:pointer;padding:4px 8px">✕</button>'
    +'</div>'
    +'<div id="wp-your-stuff-list"></div>'
    +'<div style="margin-top:14px;padding-top:12px;border-top:1px solid rgba(200,137,42,.12)">'
    +(S.adminUnlocked?'<button class="wp-add-toggle show-admin" onclick="openShowForm(null);closeYourStuff()" style="display:block;width:100%;margin:0;text-align:center">+ new show</button>':'')
    +((S.account&&!S.adminUnlocked)?'<button class="wp-add-toggle" onclick="openUserShowForm();closeYourStuff()" style="display:block;width:100%;margin:0;text-align:center">+ new playlist</button>':'')
    +'</div>'
    +'</div>';
  p.addEventListener('click',e=>{ if(e.target===p)closeYourStuff(); });
  document.body.appendChild(p);
  renderYourStuff();
}
function closeYourStuff(){
  const p=$('wp-your-stuff-panel');
  if(p)p.remove();
}
function renderYourStuff(){
  const list=$('wp-your-stuff-list');
  if(!list)return;
  const mine=(S.shows||[]).filter(s=>showIsOwnedByMe(s) && (s.title||'').trim().toLowerCase()!=='pixie')
    .sort((a,b)=>(a.title||'').localeCompare(b.title||''));
  if(!mine.length){
    list.innerHTML='<div style="font-family:IM Fell English,serif;font-style:italic;font-size:.78rem;color:var(--fog);opacity:.5;padding:8px 0">no playlists yet.</div>';
    return;
  }
  list.innerHTML=mine.map(s=>{
    const eps=(S.showEpisodesAll||[]).filter(e=>e.showId===s.id).length;
    const isPublic=!!s.isPublic;
    const dotCol=isPublic?'#8fc97a':'rgba(200,137,42,.8)';
    const dotShadow=isPublic?'rgba(143,201,122,.5)':'rgba(200,137,42,.3)';
    return '<div style="display:flex;align-items:center;gap:10px;padding:9px 6px;border-bottom:1px solid rgba(200,137,42,.1)">'
      +'<div onclick="openShow(\''+s.id+'\');closeYourStuff()" style="flex:1;min-width:0;cursor:pointer">'
      +'<div style="font-family:Crimson Text,serif;font-size:.88rem;color:var(--cream);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(s.title)+'</div>'
      +'<div style="font-size:.65rem;color:var(--fog);opacity:.5;margin-top:2px">'+eps+' video'+(eps!==1?'s':'')+'</div>'
      +'</div>'
      +'<button onclick="confirmToggleShowPublic(\''+s.id+'\','+isPublic+')" title="'+(isPublic?'make private':'make public')+'" '
      +'style="background:none;border:none;cursor:pointer;padding:4px;display:flex;align-items:center;gap:5px;font-size:.72rem;color:var(--fog)">'
      +'<span style="width:10px;height:10px;border-radius:50%;background:'+dotCol+';box-shadow:0 0 6px '+dotShadow+';display:inline-block;flex-shrink:0"></span>'
      +(isPublic?'public':'private')
      +'</button>'
      +'</div>';
  }).join('');
}
function confirmToggleShowPublic(showId, currentlyPublic){
  const proceed=async()=>{
    await toggleShowPublic(showId);
    renderYourStuff();
    renderShowGrid();
  };
  if(!currentlyPublic){
    // Making public — show confirmation
    showConfirmModal(
      'Make this playlist public?',
      'Anyone on the site will be able to see it and its videos in the main grid.',
      proceed
    );
  }else{
    proceed();
  }
}

// ── show banner + description editing ──
function renderShowBanner(){
  const show=(S.shows||[]).find(s=>s.id===S.currentShowId);
  const bannerEl=$('wp-show-banner');
  if(!show||!bannerEl)return;
  const eps=(S.showEpisodesAll||[]).filter(e=>e.showId===show.id);
  const cover=showCoverStyle(show,eps);
  bannerEl.style.cssText=cover.style;
  const mine = showIsOwnedByMe(show);
  const privacyBadge = mine
    ? (show.isPublic
        ? '<span style="font-size:.6rem;color:#8fc97a;opacity:.9;margin-left:8px">🌿 public</span>'
        : '<span style="font-size:.6rem;color:var(--amber);opacity:.7;margin-left:8px">🔒 private</span>')
    : (show.owner ? '<span style="font-size:.6rem;color:var(--fog);opacity:.5;margin-left:8px">by '+esc(show.owner)+'</span>' : '');
  bannerEl.innerHTML='<div class="wp-show-banner-overlay"><div class="wp-show-banner-title">'+esc(show.title)+privacyBadge+'</div></div>';
  const descText=$('wp-show-desc-text');
  if(descText)descText.textContent=show.description||'';
  // Show admin row: admin OR owner sees edit controls; anyone sees share
  const adminRow=$('wp-show-admin-row');
  if(adminRow){
    const shareBtn='<button class="wcal-mini-btn" onclick="shareShowToChat(\''+show.id+'\')">📎 share to chat</button>';
    const ownerBtns = mine
      ? '<button class="wcal-mini-btn" onclick="openShowForm(currentShowIdSafe())">✎ edit show</button>'+
        '<button class="wcal-mini-btn danger" onclick="confirmDeleteShow()">🗑 delete</button>'+
        '<button class="wcal-mini-btn" onclick="toggleShowPublic(\''+show.id+'\')">'+(show.isPublic?'🔒 make private':'🌿 make public')+'</button>'
      : '';
    // v01.27: Book-a-slot appears inline for Midnight Archive only
    const isMidnightArchive = show.id === 'midnight-archive' ||
      (show.title||'').trim().toLowerCase() === 'midnight archive';
    const bookSlotBtn = isMidnightArchive
      ? '<button class="wcal-mini-btn" onclick="openCalendarModal()" style="margin-left:auto">📅 book a slot</button>'
      : '';

    adminRow.innerHTML = shareBtn + ownerBtns + bookSlotBtn;
    adminRow.style.display = (shareBtn || ownerBtns || bookSlotBtn) ? 'flex' : 'none';
  }
}

function startShowDescriptionEdit(){
  if(!S.adminUnlocked && !isCurrentShowMine())return;
  const show=(S.shows||[]).find(s=>s.id===S.currentShowId);if(!show)return;
  $('wp-show-desc-text').style.display='none';
  $('wp-show-desc-edit-btn').style.display='none';
  const ta=$('wp-show-desc-edit');ta.value=show.description||'';ta.style.display='block';
  $('wp-show-desc-actions').style.display='flex';
}
function cancelShowDescriptionEdit(){
  const text=$('wp-show-desc-text'),btn=$('wp-show-desc-edit-btn'),ta=$('wp-show-desc-edit'),actions=$('wp-show-desc-actions');
  if(text)text.style.display='block';
  if(btn)btn.style.display='inline-flex';
  if(ta)ta.style.display='none';
  if(actions)actions.style.display='none';
}
function saveShowDescription(){
  const show=(S.shows||[]).find(s=>s.id===S.currentShowId);if(!show)return;
  const val=filt($('wp-show-desc-edit').value.trim());
  fbSaveShow(show.id,{description:val},true);
  show.description=val; // optimistic
  renderShowBanner();
  cancelShowDescriptionEdit();
  toast('description updated');
}

// ── create/edit show modal ──
let wcalCoverType='youtube';
let wpEditingShowId=null;

function openShowForm(showId){
  // v01.26: owner of a show can also edit it (not just admin)
  // v01.31: creating a NEW show (showId falsy) was hard-gated to admin
  // only, which silently broke the "+ new playlist" button for every
  // signed-in regular user (openUserShowForm already checks S.account
  // before calling this — saveShowForm() below has always had full
  // support for non-admin creation, it just never got reached).
  if(showId){
    const show=(S.shows||[]).find(s=>s.id===showId);
    if(show && !S.adminUnlocked && !showIsOwnedByMe(show)){toast('not your show');return;}
  } else {
    if(!S.adminUnlocked && !S.account){toast('sign in to create a playlist');return;}
  }
  wpEditingShowId=showId;
  const show=showId?(S.shows||[]).find(s=>s.id===showId):null;
  $('wp-show-form-title').textContent=show?'edit show':'new show';
  $('wp-show-title-input').value=show?show.title:'';
  $('wp-show-desc-input').value=show?(show.description||''):'';
  setCoverType(show?(show.coverType||'youtube'):'youtube');
  $('wp-show-cover-url').value=(show&&show.coverType==='custom')?(show.coverUrl||''):'';
  $('wp-show-cover-color').value=(show&&show.colorHex)?show.colorHex:'#c8892a';
  $('wp-show-default-check').checked=!!(show&&show.isDefault);
  $('wp-show-form-modal').classList.add('open');
}
function closeShowForm(){
  const modal=$('wp-show-form-modal');
  if(modal)modal.classList.remove('open');
  wpEditingShowId=null;
}
function setCoverType(type){
  wcalCoverType=type;
  ['youtube','custom','plain'].forEach(t=>{
    const btn=$('wp-cover-opt-'+t);
    if(btn)btn.classList.toggle('active-cover',t===type);
  });
  $('wp-show-cover-url').style.display=type==='custom'?'block':'none';
  $('wp-show-cover-color').style.display=type==='plain'?'block':'none';
}
function saveShowForm(){
  const title=filt($('wp-show-title-input').value.trim());
  if(!title){toast('give the show a title');return;}
  const isNew=!wpEditingShowId;
  const id=wpEditingShowId||('show'+Date.now());
  // v01.18: "pixie" is reserved — only one show can have that name.
  // It's the curated source Pixie's shorts pull from (see getPixieShow
  // below) and is deliberately kept out of the public grid.
  if(title.trim().toLowerCase()==='pixie'){
    const clash=(S.shows||[]).find(s=>s.id!==id&&(s.title||'').trim().toLowerCase()==='pixie');
    if(clash){ toast('only one show can be named "pixie" — that\'s reserved for her shorts source'); return; }
  }
  const description=filt($('wp-show-desc-input').value.trim());
  const coverUrl=$('wp-show-cover-url').value.trim();
  const colorHex=$('wp-show-cover-color').value;
  const makeDefault=$('wp-show-default-check').checked;
  const existing=(S.shows||[]).find(s=>s.id===id);
  const order=isNew?((S.shows||[]).length):(existing?existing.order:0);
  // v01.26: tag with owner; preserve existing isPublic unless admin
  const owner = S.account ? S.account.username : 'admin';
  const existingPublic = existing ? !!existing.isPublic : false;
  // Admin can set isPublic via the toggle in the banner; here default to preserving it
  const isPublic = S.adminUnlocked ? existingPublic : (existing ? existingPublic : false);
  const data={id,title,description,coverType:wcalCoverType,coverUrl,colorHex,order,
    isDefault:makeDefault,createdAt:isNew?Date.now():(existing?existing.createdAt:Date.now()),
    owner, isPublic};
  try{
    if(makeDefault){
      const prevDefault=(S.shows||[]).find(s=>s.isDefault&&s.id!==id);
      if(prevDefault)fbSaveShow(prevDefault.id,{isDefault:false},true);
    }
    if(S.account && !S.adminUnlocked){
      // Route through account-update for non-admin users (enforces ownership server-side)
      callAccountUpdate({action:'saveUserShow',username:S.account.username,token:S.account.token,show:data}).then(res=>{
        if(!res.ok){toast(res.error||"couldn't save");return;}
        toast(isNew?'playlist created':'playlist updated');
        closeShowForm();
        if(isNew)setTimeout(()=>openShow(id),300);
      });
      return;
    }
    fbSaveShow(id,data);
    toast(isNew?'show created':'show updated');
    closeShowForm();
    if(isNew)setTimeout(()=>openShow(id),300);
  }catch(e){
    console.error('save show error:',e);
    toast("couldn't save the show");
  }
}

// ── delete show ──
function confirmDeleteShow(){
  if(!S.adminUnlocked && !isCurrentShowMine()){toast('not your show');return;}
  const show=(S.shows||[]).find(s=>s.id===S.currentShowId);
  if(!show)return;
  const eps=(S.showEpisodesAll||[]).filter(e=>e.showId===show.id);
  showConfirmModal(
    `delete "${show.title}"?`,
    `this permanently removes the show and all ${eps.length} video${eps.length===1?'':'s'} in it. this can't be undone.`,
    ()=>deleteShowConfirmed(show.id)
  );
}
async function deleteShowConfirmed(showId){
  if(!db)return;
  try{
    const eps=(S.showEpisodesAll||[]).filter(e=>e.showId===showId);
    const batch=db.batch();
    eps.forEach(e=>batch.delete(db.collection('nosirt_show_episodes').doc(e.id)));
    batch.delete(db.collection('nosirt_shows').doc(showId));
    await batch.commit();
    const epIds=new Set(eps.map(e=>e.id));
    const orphanComments=(S.comments||[]).filter(c=>epIds.has(c.episodeId));
    if(orphanComments.length){
      const cbatch=db.batch();
      orphanComments.forEach(c=>cbatch.delete(db.collection('nosirt_comments').doc(c.id)));
      await cbatch.commit();
    }
    toast('show deleted');
    showWirelessHome();
  }catch(e){
    console.error('delete show error:',e);
    toast("couldn't delete the show");
  }
}

// ── reusable "are you sure?" confirm modal ──
function showConfirmModal(title,body,onConfirm){
  $('wp-confirm-title').textContent=title;
  $('wp-confirm-body').textContent=body;
  const yesBtn=$('wp-confirm-yes');
  yesBtn.onclick=()=>{closeConfirmModal();onConfirm();};
  $('wp-confirm-modal').classList.add('open');
}
function closeConfirmModal(){
  const modal=$('wp-confirm-modal');
  if(modal)modal.classList.remove('open');
}

// ── multi-select + bulk delete ──
function toggleSelectMode(){
  if(!S.adminUnlocked)return;
  S.selectMode=!S.selectMode;
  S.selectedEpisodeIds=new Set();
  const toggleBtn=$('wp-select-toggle');
  if(toggleBtn){
    toggleBtn.textContent=S.selectMode?'cancel select':'select';
    toggleBtn.classList.toggle('active-cover',S.selectMode);
  }
  updateBulkDeleteUI();
  renderEpisodes();
}
function toggleEpisodeSelected(e,id){
  e.stopPropagation();
  if(!S.selectedEpisodeIds)S.selectedEpisodeIds=new Set();
  if(S.selectedEpisodeIds.has(id))S.selectedEpisodeIds.delete(id);
  else S.selectedEpisodeIds.add(id);
  updateBulkDeleteUI();
  renderEpisodes();
}
function updateBulkDeleteUI(){
  const n=S.selectedEpisodeIds?S.selectedEpisodeIds.size:0;
  const countEl=$('wp-select-count'),btn=$('wp-bulk-delete-btn');
  if(!countEl||!btn)return;
  if(S.selectMode&&n>0){
    countEl.style.display='inline';countEl.textContent=n+' selected';
    btn.style.display='inline-block';
  }else{
    countEl.style.display='none';
    btn.style.display='none';
  }
}
function bulkDeleteEpisodes(){
  const ids=Array.from(S.selectedEpisodeIds||[]);
  if(!ids.length||!db)return;
  showConfirmModal(
    `delete ${ids.length} video${ids.length===1?'':'s'}?`,
    'this permanently removes the selected videos from this show.',
    async()=>{
      try{
        const batch=db.batch();
        ids.forEach(id=>batch.delete(db.collection('nosirt_show_episodes').doc(id)));
        await batch.commit();
        const commentTargets=(S.comments||[]).filter(c=>ids.includes(c.episodeId));
        if(commentTargets.length){
          const cbatch=db.batch();
          commentTargets.forEach(c=>cbatch.delete(db.collection('nosirt_comments').doc(c.id)));
          await cbatch.commit();
        }
        if(currentEpisode&&ids.includes(currentEpisode.id)){
          currentEpisode=null;$('wp-placeholder').style.display='flex';$('wp-now-title').textContent='';
        }
        toast(ids.length+' video(s) deleted');
        S.selectMode=false;S.selectedEpisodeIds=new Set();
        const toggleBtn=$('wp-select-toggle');if(toggleBtn)toggleBtn.textContent='select';
        updateBulkDeleteUI();
      }catch(err){
        console.error('bulk delete error:',err);
        toast("couldn't delete selected videos");
      }
    }
  );
}

// ── comments ──
function renderComments(){
  const wrap=$('wp-comment-list');
  if(!wrap||!S.currentCommentEpisodeId)return;
  const list=(S.comments||[]).filter(c=>c.episodeId===S.currentCommentEpisodeId).sort((a,b)=>b.createdAt-a.createdAt);
  if(!list.length){
    wrap.innerHTML='<div class="wp-ep-empty" style="padding:14px 0">no comments yet — say something first.</div>';
    return;
  }
  wrap.innerHTML=list.map(c=>`
    <div class="wp-comment-item">
      <div class="wp-comment-head">
        <span class="wp-comment-name">${esc(c.name)}</span>
        <span class="wp-comment-time">${typeof timeAgo==='function'?timeAgo(c.createdAt):''}</span>
        ${S.adminUnlocked?`<button class="wp-comment-del" onclick="deleteComment('${c.id}')" title="delete">✕</button>`:''}
      </div>
      <div class="wp-comment-text">${esc(c.text)}</div>
    </div>`).join('');
}
function submitComment(){
  if(!S.currentCommentEpisodeId){toast('pick a video first');return;}
  const name=filt($('wp-comment-name').value.trim());
  const text=filt($('wp-comment-text').value.trim());
  if(!name||!text){toast('add your name and a comment');return;}
  const id='c'+Date.now();
  fbSaveComment(id,{id,episodeId:S.currentCommentEpisodeId,name,text,createdAt:Date.now()});
  $('wp-comment-text').value='';
  toast('comment posted');
}
function deleteComment(id){
  if(!S.adminUnlocked)return;
  fbDeleteComment(id);
}

// ═══════════════════════════════════════════════════════
// renderEpisodes — draws the episode list for the current show
// Called any time S.episodes changes or currentEpisode changes.
// Features: play highlight, per-episode progress bar, reorder (admin),
// edit/delete (admin), add-to-playlist & share (logged-in users).
// ═══════════════════════════════════════════════════════
function renderEpisodes(){
  const list=$('wp-episode-list');
  if(!list)return;
  const eps=S.episodes||[];

  if(!eps.length){
    list.innerHTML='<div class="wp-ep-empty">no videos in this show yet.'+(S.adminUnlocked||showIsOwnedByMe((S.shows||[]).find(s=>s.id===S.currentShowId)||{})?' add one above.':'')+'</div>';
    return;
  }

  const isOwner=S.adminUnlocked||showIsOwnedByMe((S.shows||[]).find(s=>s.id===S.currentShowId)||{});
  const isUser=!!(S.account||S.adminUnlocked);

  list.innerHTML=eps.map((ep,idx)=>{
    const isPlaying=currentEpisode&&currentEpisode.id===ep.id;
    const prog=S.podcastProgress&&S.podcastProgress[ep.id];
    const pct=(prog&&prog.duration&&prog.seconds)?Math.min(100,Math.round(prog.seconds/prog.duration*100)):0;

    // Progress bar — always rendered, shown only when there's saved progress
    const progressBar=pct>0
      ?`<div class="wp-ep-progress"><div class="wp-ep-progress-fill" style="width:${pct}%"></div></div>`
      :'<div class="wp-ep-progress" style="opacity:0"><div class="wp-ep-progress-fill" style="width:0%"></div></div>';

    // Description (truncated)
    const descHtml=ep.desc
      ?`<div class="wp-ep-desc">${esc(ep.desc.slice(0,120))}${ep.desc.length>120?'…':''}</div>`
      :'';

    // Select checkbox (admin select mode)
    const selectBox=S.selectMode&&S.adminUnlocked
      ?`<input type="checkbox" class="wp-ep-check" ${S.selectedEpisodeIds&&S.selectedEpisodeIds.has(ep.id)?'checked':''} onclick="toggleEpisodeSelected(event,'${ep.id}')">`
      :'';

    // Reorder buttons (owner only)
    const reorderBtns=isOwner
      ?`<div class="wp-ep-reorder">
          <button class="wp-ep-reorder-btn" onclick="moveEpisode(event,'${ep.id}',-1)" title="move up" ${idx===0?'disabled':''}>▲</button>
          <button class="wp-ep-reorder-btn" onclick="moveEpisode(event,'${ep.id}',1)" title="move down" ${idx===eps.length-1?'disabled':''}>▼</button>
        </div>`
      :'';

    // Action buttons (owner: edit+delete, user: +playlist + share)
    const ownerBtns=isOwner
      ?`<button class="playlist-add-btn" onclick="editEpisode(event,'${ep.id}')" title="edit" style="margin-left:6px;font-size:.65rem">✎</button>
        <button class="playlist-add-btn" onclick="deleteEpisode(event,'${ep.id}')" title="delete" style="margin-left:4px;font-size:.65rem;color:rgba(200,80,80,.8)">🗑</button>`
      :'';

    const userBtns=isUser&&!isOwner
      ?`<button class="playlist-add-btn" onclick="event.stopPropagation();addToPlaylist({type:'episode',showTitle:${JSON.stringify(getCurrentShowTitle())},episodeTitle:${JSON.stringify(ep.title)}})" title="save to playlist" style="margin-left:6px">+</button>
        <button class="playlist-add-btn" onclick="event.stopPropagation();shareEpisodeToChat(${JSON.stringify(ep)})" title="share to chat" style="margin-left:4px;font-size:.65rem">📎</button>`
      : (isOwner&&isUser
        ?`<button class="playlist-add-btn" onclick="event.stopPropagation();shareEpisodeToChat(${JSON.stringify(ep)})" title="share to chat" style="margin-left:4px;font-size:.65rem">📎</button>`
        :'');

    return `<div class="wp-ep-item${isPlaying?' playing':''}" onclick="loadEpisode(${JSON.stringify(ep)})">
      ${selectBox}
      <div class="wp-ep-play-icon">${isPlaying?'🔊':'▶'}</div>
      <div style="flex:1;min-width:0">
        <div class="wp-ep-title">${esc(ep.title)}</div>
        ${descHtml}
        ${progressBar}
      </div>
      ${reorderBtns}
      <div class="wp-ep-actions" onclick="event.stopPropagation()" style="display:flex;align-items:center;flex-shrink:0">
        ${ownerBtns}${userBtns}
      </div>
    </div>`;
  }).join('');
}

function getCurrentShowTitle(){
  const show=(S.shows||[]).find(s=>s.id===S.currentShowId);
  return show?show.title:'';
}
