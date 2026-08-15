/* ============================================================
   AUDIO.JS — music and built-in ambient playback

   Requires: core.js
   Exposes: tryPlay(), toggleMusic(), selectMusic(), music modal helpers
   ============================================================ */

// v01.25: on the very first autoplay of a session, start silent and
// ramp up to normal volume over 5 seconds so visitors aren't blasted.
// After that first ramp the flag is set and subsequent track switches
// play at normal volume immediately.
let _audioFadeInDone = false;
function _doFirstVisitFadeIn(audioEl){
  if(_audioFadeInDone) return;
  _audioFadeInDone = true;
  audioEl.volume = 0;
  const start = Date.now();
  const RAMP_MS = 5000;
  const TARGET = 1.0; // tryPlay always sets to 1.0; envVolume is handled by weatherAudio separately
  const tick = () => {
    const elapsed = Date.now() - start;
    if(elapsed >= RAMP_MS){ audioEl.volume = TARGET; return; }
    audioEl.volume = TARGET * (elapsed / RAMP_MS);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function tryPlay(src,name){
  stopSynthMusic();
  const a=$('audio-player');
  if(a.src!==src){a.src=src;a.load();}
  a.onerror=()=>{
    if(activeMusic==='podcast'||a.src!==src||!a.getAttribute('src'))return;
    updateNP('stream failed · try built-in ancient');toast('that stream would not open here');
  };
  a.play().then(()=>{
    _doFirstVisitFadeIn(a);
    if(typeof applyMusicVolumeLive==='function') applyMusicVolumeLive();
    toast('sound started');
  }).catch(()=>{
    updateNP('tap anywhere to start sound');
    const retryPlay=()=>{
      a.play().then(()=>{ _doFirstVisitFadeIn(a); toast('sound started'); updateNP(name); }).catch(()=>{});
      document.removeEventListener('click',retryPlay);
      document.removeEventListener('touchstart',retryPlay);
      document.removeEventListener('keydown',retryPlay);
    };
    document.addEventListener('click',retryPlay,{once:true});
    document.addEventListener('touchstart',retryPlay,{once:true});
    document.addEventListener('keydown',retryPlay,{once:true});
  });
  updateNP(name);
}
function updateNP(name){$('now-playing-text').textContent=name;}

function startAncientSynth(){
  const AC=window.AudioContext||window.webkitAudioContext;
  if(!AC){toast('audio not supported here');return;}
  stopSynthMusic();
  const ac=new AC();
  const master=ac.createGain();master.gain.value=.0001;master.connect(ac.destination);
  // v01.25: first-visit ramp — start near-silent for 5s, then settle at .18
  const synthTarget = .18;
  const synthRampEnd = _audioFadeInDone ? ac.currentTime+1.8 : ac.currentTime+5.0;
  master.gain.exponentialRampToValueAtTime(synthTarget, synthRampEnd);
  _audioFadeInDone = true; // mark done so any subsequent track plays normally
  const delay=ac.createDelay(2.5);delay.delayTime.value=.42;
  const fb=ac.createGain();fb.gain.value=.26;
  delay.connect(fb);fb.connect(delay);delay.connect(master);
  const filter=ac.createBiquadFilter();filter.type='lowpass';filter.frequency.value=1900;filter.Q.value=.6;filter.connect(delay);filter.connect(master);
  const scale=[220,261.63,293.66,329.63,392,440,523.25];
  const nodes=[];
  function pluck(freq,when,dur,vol){
    const o=ac.createOscillator(),g=ac.createGain(),tone=ac.createBiquadFilter();
    o.type='triangle';o.frequency.setValueAtTime(freq,when);
    tone.type='bandpass';tone.frequency.value=freq*2.1;tone.Q.value=3.2;
    g.gain.setValueAtTime(.0001,when);
    g.gain.exponentialRampToValueAtTime(vol,when+.025);
    g.gain.exponentialRampToValueAtTime(.0001,when+dur);
    o.connect(tone);tone.connect(g);g.connect(filter);o.start(when);o.stop(when+dur+.08);
    nodes.push(o,g,tone);
  }
  function drone(freq){
    const o=ac.createOscillator(),g=ac.createGain();
    o.type='sine';o.frequency.value=freq;g.gain.value=.026;
    o.connect(g);g.connect(master);o.start();nodes.push(o,g);
  }
  drone(110);drone(165);
  let step=0;
  const timer=setInterval(()=>{
    const now=ac.currentTime+.04;
    const root=scale[(step%14<7?0:3)];
    pluck(root,now,.9,.055);
    pluck(scale[(step*2+1)%scale.length]*.5,now+.18,1.2,.035);
    if(step%2===0)pluck(scale[(step+4)%scale.length],now+.42,.7,.038);
    step++;
  },720);
  synthMusic={ac,master,nodes,timer};
  updateNP('🏰 Ancient ambience · built in');
  toast('ancient ambience started');
}

function stopSynthMusic(){
  if(!synthMusic)return;
  clearInterval(synthMusic.timer);
  const {ac,master,nodes}=synthMusic;
  try{master.gain.cancelScheduledValues(ac.currentTime);master.gain.setTargetAtTime(.0001,ac.currentTime,.12);}catch(e){}
  setTimeout(()=>{nodes.forEach(n=>{try{n.stop&&n.stop();}catch(e){}});try{ac.close();}catch(e){}},420);
  synthMusic=null;
}

function stopAmbientMusic(){
  const a=$('audio-player');
  a.onerror=null; // clear first — a pending error from the old track must never fire after this point
  a.pause();a.removeAttribute('src');a.load();
  stopSynthMusic();
}

function toggleMusic(key){
  if(key==='podcast'){
    if(activeMusic==='podcast'){
      // tapping "The Wireless" again while it's already the active sound → stop it
      if(ytPlayer)ytPlayer.pauseVideo();
      activeMusic=null;
      updateNP('nothing playing · tap to start');
      document.querySelectorAll('.music-opt').forEach(o=>o.classList.remove('playing'));
      closeMusicModal();
      return;
    }
    // v01.11/01.12: "The Wireless" modal option is the general sound
    // picker (distinct from the dedicated "podcast" badge, which is
    // always Midnight Archive — see handleLiveBadgeClick in wireless.js).
    // Same start/stop toggle as Ancient/Lofi/Dark: resumes whatever was
    // last loaded if anything was, plays nothing (silently) if not yet
    // — no page navigation, same as the other sound options.
    stopAmbientMusic(); // wireless takes over from whatever ambient sound was playing
    activeMusic='podcast';
    document.querySelectorAll('.music-opt').forEach(o=>o.classList.remove('playing'));
    const el=document.querySelector(`.music-opt[data-key="podcast"]`);
    if(el)el.classList.add('playing');
    if(typeof currentEpisode!=='undefined' && currentEpisode && ytPlayer){
      ytPlayer.playVideo();
      updateNP('🎙 '+currentEpisode.title);
    }else{
      updateNP('🎙 The Wireless');
    }
    // v01.12: no navigation here on purpose — selecting "The Wireless"
    // from the sounds menu should behave exactly like Ancient/Lofi/Dark:
    // it just starts/resumes playback wherever you already are. Jumping
    // to the grid or the currently-playing show is the bottom-nav
    // wireless button's job specifically (and the map pin) — see
    // openWirelessSmart() — not this modal option's.
    closeMusicModal();
    return;
  }
  // switching to an ambient track — make sure the podcast isn't also playing
  if(ytPlayer)ytPlayer.pauseVideo();
  const a=$('audio-player');
  if(activeMusic===key){
    // clicking same track → stop
    a.pause();a.removeAttribute('src');a.load();
    stopSynthMusic();
    activeMusic=null;
    updateNP('nothing playing · tap to start');
    document.querySelectorAll('.music-opt').forEach(o=>o.classList.remove('playing'));
  } else {
    activeMusic=key;
    const t=MUSIC[key];
    if(t&&t.builtIn){a.pause();a.removeAttribute('src');a.load();startAncientSynth();}
    else if(t)tryPlay(t.src,t.name);
    document.querySelectorAll('.music-opt').forEach(o=>o.classList.remove('playing'));
    const el=document.querySelector(`.music-opt[data-key="${key}"]`);
    if(el)el.classList.add('playing');
  }
  closeMusicModal();
}
function selectMusic(mode,el){toggleMusic(mode);}
function openMusicModal(){$('music-modal').classList.add('open');}
function closeMusicModal(){$('music-modal').classList.remove('open');}
