/* ============================================================
   BACKGROUND-AUDIO.JS — iOS background playback keepalive
   Load AFTER audio.js, wireless.js, and core.js

   3 Layers:
   1. AudioContext keepalive (silent buffer ping every 10s in background)
   2. Silent audio track (keeps iOS audio session alive)
   3. Service Worker periodic wake

   Note: iOS limits web audio to ~30min in background regardless.
   The only complete solution requires a native wrapper (Capacitor/Xcode).
   These layers maximize the time before iOS kills the session.
   ============================================================ */

(function nosirtBackgroundAudio(){

// ─── Layer 1: AudioContext keepalive ───
let _bgInterval=null;

function startBgKeepalive(){
  if(_bgInterval)return;
  document.addEventListener('visibilitychange',_onVisibilityChange);
  _bgInterval=setInterval(_bgPing,10000);
}
function stopBgKeepalive(){
  document.removeEventListener('visibilitychange',_onVisibilityChange);
  if(_bgInterval){clearInterval(_bgInterval);_bgInterval=null;}
}
function _onVisibilityChange(){
  if(document.hidden) _bgPing();
  else {
    // Resuming from background — restart audio contexts
    [window._audioCtxForGain, window.synthMusic&&window.synthMusic.ac].forEach(ctx=>{
      if(ctx&&ctx.state==='suspended') ctx.resume().catch(()=>{});
    });
    if(window.ytPlayer&&typeof window.ytPlayer.getPlayerState==='function'){
      if(window.ytPlayer.getPlayerState()===2) window.ytPlayer.playVideo();
    }
  }
}
function _bgPing(){
  try{
    const ctx=window._audioCtxForGain||(window.synthMusic&&window.synthMusic.ac);
    if(!ctx)return;
    if(ctx.state==='suspended'){ctx.resume().catch(()=>{});return;}
    if(ctx.state==='running'){
      const buf=ctx.createBuffer(1,1,22050);
      const src=ctx.createBufferSource();src.buffer=buf;
      const g=ctx.createGain();g.gain.value=0.00001;
      src.connect(g);g.connect(ctx.destination);
      src.start();src.stop(ctx.currentTime+0.001);
    }
  }catch(e){}
}

// ─── Layer 2: Silent audio track ───
let _silentAudio=null;
let _silentStarted=false;

const SILENT_WAV='data:audio/wav;base64,UklGRlwAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVwAAABcAAAAXAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

function startSilentTrack(){
  if(_silentStarted)return;
  _silentAudio=new Audio();
  _silentAudio.loop=true;
  _silentAudio.volume=0.001;
  _silentAudio.src=SILENT_WAV;
  _silentAudio.play().catch(()=>{
    // Retry on next user gesture
    const retry=()=>{
      _silentAudio&&_silentAudio.play().catch(()=>{});
      document.removeEventListener('click',retry);
      document.removeEventListener('touchstart',retry);
    };
    document.addEventListener('click',retry,{once:true});
    document.addEventListener('touchstart',retry,{once:true});
  });
  _silentStarted=true;
}
function stopSilentTrack(){
  if(_silentAudio){_silentAudio.pause();_silentAudio.src='';_silentAudio=null;}
  _silentStarted=false;
}

// ─── Layer 3: SW message listener ───
if('serviceWorker'in navigator){
  navigator.serviceWorker.addEventListener('message',event=>{
    if(event.data&&event.data.type==='background-wake'){
      _bgPing();
      if(window.ytPlayer&&typeof window.ytPlayer.getPlayerState==='function'){
        if(window.ytPlayer.getPlayerState()===2) window.ytPlayer.playVideo();
      }
    }
  });
}

// ─── Register periodic background sync ───
async function registerBgSync(){
  if(!('serviceWorker'in navigator))return;
  try{
    const reg=await navigator.serviceWorker.ready;
    if('periodicSync'in reg){
      await reg.periodicSync.register('nosirt-keep-alive',{minInterval:15*60*1000});
    }
  }catch(e){}
}

// ─── Hook into audio functions (wait for them to be defined) ───
const _hookInterval=setInterval(()=>{
  if(typeof window.toggleMusic!=='function'||typeof window.startAncientSynth!=='function') return;
  clearInterval(_hookInterval);

  const _origToggle=window.toggleMusic;
  window.toggleMusic=function(key){
    const result=_origToggle.call(this,key);
    if(key&&key!=='stop'){startSilentTrack();startBgKeepalive();}
    return result;
  };

  const _origAncient=window.startAncientSynth;
  window.startAncientSynth=function(){
    const r=_origAncient.call(this);
    startSilentTrack();startBgKeepalive();
    return r;
  };

  const _origStop=window.stopAmbientMusic;
  if(_origStop) window.stopAmbientMusic=function(){
    const r=_origStop.call(this);
    stopSilentTrack();stopBgKeepalive();
    return r;
  };

  // Hook YouTube play (loadEpisode) too
  const _origLoad=window.loadEpisode;
  if(_origLoad) window.loadEpisode=function(ep){
    const r=_origLoad.call(this,ep);
    startSilentTrack();startBgKeepalive();
    return r;
  };

  registerBgSync();
},200);

})();
