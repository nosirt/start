/* ============================================================
   ENVIRONMENT.JS — v01.14 location + live weather plumbing
   Load this AFTER core.js.
   Step 2 of the "living map" project (see VERSION_HISTORY): gets the
   visitor's approximate location (consent-based browser geolocation
   first, silent IP-based fallback second), fetches current weather for
   it from Open-Meteo (free, no API key needed), and keeps
   S.environment updated + refreshed periodically.

   Nothing in this file draws anything on the map yet — that's a later
   step. This step is just the data plumbing + the environmental-sound
   mute toggle (the sounds themselves come later too; the toggle exists
   now so it's already in place and working when they arrive).

   Privacy note: location is used live and never sent anywhere except
   the weather lookup itself. It's cached in localStorage (this
   browser only) purely so the map has something sensible to show
   immediately on repeat visits instead of a blank default while a
   fresh fetch is in flight — nothing is stored in Firebase or anywhere
   shared/visible to anyone else.
   ============================================================ */

const ENV_CACHE_KEY='n_env_cache';
const ENV_REFRESH_MS=20*60*1000; // 20 minutes — weather doesn't need refreshing more often than this

// v01.15: volume is now a real 0–160% multiplier (0 = silent/muted,
// 100% = the new, louder default, up to 160% for "loud enough to sit
// in the background over other stuff"), replacing the old plain on/off
// mute. Persisted per-browser. Base per-weather-kind levels are defined
// in startWeatherSound() below and were raised from their original
// values as part of this change.
function envVolumeMultiplier(){
  const v=localStorage.getItem('n_env_volume');
  return v===null ? 1 : Math.max(0,Math.min(1.6,parseFloat(v)));
}
function envMuted(){ return envVolumeMultiplier()<=0.001; }
function setEnvVolumeMultiplier(v){
  v=Math.max(0,Math.min(1.6,parseFloat(v)||0));
  localStorage.setItem('n_env_volume', String(v));
  updateEnvSoundIcon();
  applyEnvVolumeLive();
  if(typeof syncWeatherSound==='function')syncWeatherSound();
}
function updateEnvSoundIcon(){
  const btn=document.getElementById('env-sound-btn');
  if(btn)btn.textContent=envMuted()?'🔇':'🔊';
  const slider=document.getElementById('env-volume-slider');
  if(slider)slider.value=Math.round(envVolumeMultiplier()*100);
  const mSlider=document.getElementById('music-volume-slider');
  if(mSlider)mSlider.value=Math.round(musicVolumeMultiplier()*100);
  const pct=document.getElementById('env-vol-pct');
  if(pct)pct.textContent=Math.round(envVolumeMultiplier()*100)+'%';
  const mpct=document.getElementById('music-vol-pct');
  if(mpct)mpct.textContent=Math.round(musicVolumeMultiplier()*100)+'%';
}

// v01.27: independent music/podcast volume multiplier
// Controls the audio-player element volume (streams, YouTube audio, podcasts)
// independently of the weather/ambient sound slider.
function musicVolumeMultiplier(){
  const v=localStorage.getItem('n_music_volume');
  return v===null ? 1 : Math.max(0,Math.min(1.6,parseFloat(v)));
}
function setMusicVolumeMultiplier(v){
  v=Math.max(0,Math.min(1.6,parseFloat(v)||0));
  localStorage.setItem('n_music_volume', String(v));
  applyMusicVolumeLive();
  updateEnvSoundIcon();
}
function applyMusicVolumeLive(){
  const v = Math.max(0, Math.min(1.6, musicVolumeMultiplier()));
  // Prefer the GainNode route (works on iOS); fall back to .volume
  if(typeof _audioGainNode !== 'undefined' && _audioGainNode){
    try{
      if(typeof _audioCtxForGain !== 'undefined' && _audioCtxForGain){
        _audioGainNode.gain.setTargetAtTime(Math.max(0.0001, v), _audioCtxForGain.currentTime, 0.05);
      } else {
        _audioGainNode.gain.value = v;
      }
    }catch(e){}
  } else {
    const a = document.getElementById('audio-player');
    if(a) a.volume = Math.max(0, Math.min(1, v));
  }
  // Ancient synth also respects the music volume slider
  if(typeof synthMusic !== 'undefined' && synthMusic && synthMusic.master){
    try{
      const synthTarget = Math.max(0.04, v * 0.18);
      synthMusic.master.gain.setTargetAtTime(synthTarget, synthMusic.ac.currentTime, 0.1);
    }catch(e){}
  }
}
function toggleEnvVolumePopover(){
  const pop=document.getElementById('env-volume-popover');
  if(!pop)return;
  pop.classList.toggle('open');
  if(pop.classList.contains('open'))updateEnvSoundIcon();
}
// Live-adjusts the currently-playing sound's volume without restarting
// it, so dragging the slider is smooth instead of stopping and
// relaunching the audio on every tick.
function applyEnvVolumeLive(){
  if(!weatherAudio)return;
  try{
    weatherAudio.master.gain.setTargetAtTime(
      Math.max(0.0001, weatherAudio.baseTarget*envVolumeMultiplier()),
      weatherAudio.ac.currentTime, .2
    );
  }catch(e){}
}

// Browser geolocation first (real permission prompt, most accurate).
// Silent IP-based fallback if denied/unavailable/times out. Resolves
// {lat,lon} or null if both fail — callers handle null by just leaving
// whatever default/cached state already exists.
function getVisitorLocation(){
  return new Promise(resolve=>{
    if(navigator.geolocation){
      let settled=false;
      const done=(v)=>{ if(settled)return; settled=true; resolve(v); };
      const timer=setTimeout(()=>fallbackIpLocation(done), 6000);
      navigator.geolocation.getCurrentPosition(
        pos=>{ clearTimeout(timer); done({lat:pos.coords.latitude,lon:pos.coords.longitude}); },
        ()=>{ clearTimeout(timer); fallbackIpLocation(done); },
        {timeout:6000, maximumAge:600000}
      );
    }else{
      fallbackIpLocation(resolve);
    }
  });
}
async function fallbackIpLocation(resolve){
  try{
    const res=await fetch('https://ipapi.co/json/');
    const data=await res.json();
    if(data && typeof data.latitude==='number' && typeof data.longitude==='number'){
      resolve({lat:data.latitude, lon:data.longitude});
    }else resolve(null);
  }catch(e){ resolve(null); }
}

// Open-Meteo — free, no API key, CORS-enabled, works directly from the
// browser. https://open-meteo.com
async function fetchWeather(lat,lon){
  try{
    const url='https://api.open-meteo.com/v1/forecast?latitude='+lat+'&longitude='+lon+
      '&current=temperature_2m,precipitation,rain,showers,snowfall,weather_code,cloud_cover,wind_speed_10m,is_day'+
      '&daily=sunrise,sunset&timezone=auto';
    const res=await fetch(url);
    if(!res.ok)return null;
    return await res.json();
  }catch(e){ console.warn('weather fetch failed:',e.message); return null; }
}

// Pulls location + weather together into S.environment. Uses the
// localStorage cache immediately (if any) so there's something sensible
// to show right away, then refreshes it live in the background.
async function refreshEnvironment(){
  try{
    const cached=JSON.parse(localStorage.getItem(ENV_CACHE_KEY)||'null');
    if(cached){ Object.assign(S.environment, cached, {ready:true}); if(typeof syncWeatherSound==='function')syncWeatherSound(); }
  }catch(e){}

  const loc=await getVisitorLocation();
  if(!loc) return; // no location available — leave cache/defaults as-is (Northern Hemisphere default)

  const hemisphere = loc.lat<0 ? 'S' : 'N';
  const weather=await fetchWeather(loc.lat,loc.lon);
  if(!weather || !weather.current) return;

  const c=weather.current;
  Object.assign(S.environment,{
    ready:true, lat:loc.lat, lon:loc.lon, hemisphere,
    weatherCode:c.weather_code, cloudCover:c.cloud_cover, precipitation:c.precipitation||0,
    snowfall:c.snowfall||0, windSpeed:c.wind_speed_10m, isDay:!!c.is_day, tempC:c.temperature_2m,
    sunrise:(weather.daily&&weather.daily.sunrise)?weather.daily.sunrise[0]:null,
    sunset:(weather.daily&&weather.daily.sunset)?weather.daily.sunset[0]:null,
    fetchedAt:Date.now()
  });
  try{ localStorage.setItem(ENV_CACHE_KEY, JSON.stringify(S.environment)); }catch(e){}
  if(typeof syncWeatherSound==='function')syncWeatherSound();
}

function startEnvironmentRefreshLoop(){
  refreshEnvironment();
  setInterval(refreshEnvironment, ENV_REFRESH_MS);
  updateEnvSoundIcon(); // sync the sound button/slider to the saved preference on load
}

// ═══ v01.14 step 3: WEATHER AMBIENT SOUND ═══
// Synthesized (noise + filters), same technique already used elsewhere
// on this site (Ancient ambience, the Void's pop sound) — no audio
// files, so no licensing question at all. Respects the mute button.
let weatherAudio=null; // {ac, master, nodes:[...]} while playing
let currentWeatherSoundKey=null;

function tryResumeAudioContext(ac){
  if(ac.state!=='suspended')return;
  const resume=()=>{ ac.resume().catch(()=>{}); document.removeEventListener('click',resume); document.removeEventListener('touchstart',resume); };
  document.addEventListener('click',resume,{once:true});
  document.addEventListener('touchstart',resume,{once:true});
}
function makeNoiseLoopNode(ac){
  const bufLen=ac.sampleRate*2;
  const buf=ac.createBuffer(1,bufLen,ac.sampleRate);
  const data=buf.getChannelData(0);
  for(let i=0;i<bufLen;i++)data[i]=Math.random()*2-1;
  const src=ac.createBufferSource();src.buffer=buf;src.loop=true;
  return src;
}
function stopWeatherSound(){
  if(!weatherAudio)return;
  const w=weatherAudio;
  try{ w.master.gain.cancelScheduledValues(w.ac.currentTime); w.master.gain.setTargetAtTime(.0001,w.ac.currentTime,.4); }catch(e){}
  setTimeout(()=>{ w.nodes.forEach(n=>{try{n.stop&&n.stop();}catch(e){}}); try{w.ac.close();}catch(e){} },900);
  weatherAudio=null;
  currentWeatherSoundKey=null;
}
function startWeatherSound(kind,windy){
  const AC=window.AudioContext||window.webkitAudioContext;
  if(!AC)return;
  stopWeatherSound();
  try{
    const ac=new AC();
    tryResumeAudioContext(ac);
    const master=ac.createGain();master.gain.value=.0001;master.connect(ac.destination);
    // v01.15: raised from the original (max .16) so it's actually
    // loud enough to sit in the background over music if wanted — the
    // volume slider (0-160%) multiplies on top of these.
    const baseTarget=(kind==='thunder')?.30:(kind==='rain')?.26:(kind==='snow')?.11:(windy?.20:.13);
    const targetVol=Math.max(0.0001, baseTarget*envVolumeMultiplier());
    master.gain.exponentialRampToValueAtTime(targetVol,ac.currentTime+2);
    const nodes=[];
    const noise=makeNoiseLoopNode(ac);
    const filt=ac.createBiquadFilter();
    if(kind==='rain'||kind==='thunder'){filt.type='bandpass';filt.frequency.value=2400;filt.Q.value=.7;}
    else if(kind==='snow'){filt.type='lowpass';filt.frequency.value=500;filt.Q.value=.4;}
    else{filt.type='lowpass';filt.frequency.value=900;filt.Q.value=.5;}
    noise.connect(filt);filt.connect(master);noise.start();
    nodes.push(noise,filt);
    if(windy){
      const windNoise=makeNoiseLoopNode(ac);
      const windFilt=ac.createBiquadFilter();windFilt.type='bandpass';windFilt.frequency.value=700;windFilt.Q.value=1.1;
      const windGain=ac.createGain();windGain.gain.value=.5;
      windNoise.connect(windFilt);windFilt.connect(windGain);windGain.connect(master);
      windNoise.start();
      const lfo=ac.createOscillator();lfo.frequency.value=.07;
      const lfoGain=ac.createGain();lfoGain.gain.value=250;
      lfo.connect(lfoGain);lfoGain.connect(windFilt.frequency);lfo.start();
      nodes.push(windNoise,windFilt,windGain,lfo,lfoGain);
    }
    weatherAudio={ac,master,nodes,baseTarget};
  }catch(e){}
}
// One-shot rumble, layered on top of whatever ambient loop is already
// playing (or standalone if sound happens to be off but this is called
// directly — it isn't, currently, but kept safe either way).
function playThunderRumble(){
  if(envMuted())return;
  // v01.27: notify Pixie a thunder strike just happened
  if(typeof onPixieThunderStrike==='function') onPixieThunderStrike();
  try{
    const AC=window.AudioContext||window.webkitAudioContext;
    const ac=weatherAudio?weatherAudio.ac:new AC();
    const dur=1.4+Math.random()*1.2;
    const buf=ac.createBuffer(1,Math.floor(ac.sampleRate*dur),ac.sampleRate);
    const data=buf.getChannelData(0);
    for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(1-i/data.length);
    const src=ac.createBufferSource();src.buffer=buf;
    const filt=ac.createBiquadFilter();filt.type='lowpass';filt.frequency.value=180;filt.Q.value=.7;
    const g=ac.createGain();g.gain.setValueAtTime(0,ac.currentTime);
    const peak=Math.max(0.0001,.4*envVolumeMultiplier());
    g.gain.linearRampToValueAtTime(peak,ac.currentTime+.15);
    g.gain.linearRampToValueAtTime(0,ac.currentTime+dur);
    src.connect(filt);filt.connect(g);g.connect(ac.destination);
    src.start();src.stop(ac.currentTime+dur);
  }catch(e){}
}
// Called after weather data changes, and whenever the mute button is
// toggled — (re)starts only if the target sound actually changed, so
// this is safe to call often without restarting audio needlessly.
function syncWeatherSound(){
  if(envMuted()){ stopWeatherSound(); return; }
  const wv=computeWeatherVisualState();
  const key=wv.kind+(wv.windy?'-windy':'');
  if(key===currentWeatherSoundKey)return;
  currentWeatherSoundKey=key;
  if(wv.kind==='clear'&&!wv.windy){ stopWeatherSound(); return; }
  startWeatherSound(wv.kind,wv.windy);
}

// v01.14 step 3: turns Open-Meteo's raw weather_code (WMO standard)
// into one simple state the map's draw loop can react to, plus a
// separate "windy" flag (wind can happen alongside any of these, not
// just as its own state).
// v01.14 step 4: admin's "preview weather" override (S.envPreview, set
// from the admin panel, this browser only — never synced to Firebase,
// so it never affects what anyone else sees) takes priority when set.
function computeWeatherVisualState(){
  if(S.envPreview && S.envPreview.kind){
    const k=S.envPreview.kind;
    return {
      kind:k, windy:!!S.envPreview.windy,
      cloudCover:k==='clear'?10:k==='cloudy'?70:85,
      isDay:true, intensity:.7
    };
  }
  const e=S.environment;
  const code=e.weatherCode;
  let kind='clear';
  if([95,96,99].includes(code)) kind='thunder';
  else if([71,73,75,77,85,86].includes(code)) kind='snow';
  else if([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code)) kind='rain';
  else if([45,48].includes(code)) kind='fog';
  else if(e.cloudCover>55) kind='cloudy';
  else kind='clear';
  return {
    kind,
    windy: e.windSpeed>=28, // km/h — roughly a "really windy" threshold
    cloudCover: e.cloudCover||0,
    isDay: e.isDay!==false,
    intensity: Math.min(1, (e.precipitation||e.snowfall||0)/4) // rough 0-1 scale for how heavy
  };
}

// v01.14 step 4: DAY/NIGHT — where the sun/moon sits along its arc
// (0 = rise point, .5 = peak/overhead, 1 = set point), how strong the
// dawn/dusk glow is, and how "night" it currently is overall (0-1, for
// star opacity + sky tint). Uses real sunrise/sunset for this location
// when available; falls back to a generic 6am/8pm schedule otherwise so
// it still does *something* sensible with no location at all.
function computeDayNightPhase(){
  if(S.envPreview && S.envPreview.dayNight && S.envPreview.dayNight!=='auto'){
    const m=S.envPreview.dayNight;
    if(m==='day')   return {isDaytime:true,  sunPos:.5,  twilight:0, nightAmount:0};
    if(m==='night') return {isDaytime:false, sunPos:.5,  twilight:0, nightAmount:1};
    if(m==='dawn')  return {isDaytime:true,  sunPos:.02, twilight:1, nightAmount:0};
    if(m==='dusk')  return {isDaytime:true,  sunPos:.98, twilight:1, nightAmount:0};
  }
  const e=S.environment;
  const now=new Date();
  let sunriseH=6, sunsetH=20;
  if(e.sunrise && e.sunset){
    try{
      const sr=new Date(e.sunrise), ss=new Date(e.sunset);
      if(!isNaN(sr))sunriseH=sr.getHours()+sr.getMinutes()/60;
      if(!isNaN(ss))sunsetH=ss.getHours()+ss.getMinutes()/60;
    }catch(err){}
  }
  const hour=now.getHours()+now.getMinutes()/60;
  const dayLen=Math.max(0.5,sunsetH-sunriseH);
  const isDaytime=hour>=sunriseH && hour<=sunsetH;
  let sunPos,twilight;
  if(isDaytime){
    sunPos=(hour-sunriseH)/dayLen;
    const distToEdge=Math.min(hour-sunriseH, sunsetH-hour);
    twilight=Math.max(0,1-distToEdge/1.2);
  }else{
    const nightLen=Math.max(0.5,24-dayLen);
    const nightHour = hour>=sunsetH ? hour-sunsetH : hour+(24-sunsetH);
    sunPos=nightHour/nightLen;
    const distToEdge=Math.min(nightHour, nightLen-nightHour);
    twilight=Math.max(0,1-distToEdge/1.2);
  }
  return {isDaytime, sunPos, twilight, nightAmount:isDaytime?0:1};
}

// v01.14 step 5: SEASON — hemisphere-aware. Northern-hemisphere
// meteorological seasons by month, flipped six months for the Southern
// Hemisphere (using real latitude from S.environment when we have it;
// falls back to Northern if location isn't available at all, per the
// earlier decision).
function computeSeason(){
  if(S.envPreview && S.envPreview.season && S.envPreview.season!=='auto') return S.envPreview.season;
  const m=new Date().getMonth()+1; // 1-12
  let season;
  if(m===12||m===1||m===2) season='winter';
  else if(m>=3&&m<=5) season='spring';
  else if(m>=6&&m<=8) season='summer';
  else season='fall';
  if((S.environment.hemisphere||'N')==='S'){
    season={winter:'summer',summer:'winter',spring:'fall',fall:'spring'}[season];
  }
  return season;
}

// v01.14 step 5: FESTIVALS — simple config-driven calendar. Easy to
// add/edit/remove entries here later; nothing else needs to change.
// Dates are calendar-based (not hemisphere-flipped, unlike season) since
// these are specific real-world observances, not a climate thing.
const FESTIVALS=[
  {id:'newyear',      name:"New Year",         emoji:['🎆','✨','🥂'],  tint:'rgba(255,215,120,1)', match:(m,d)=>(m===1&&d<=2)||(m===12&&d===31)},
  {id:'valentines',   name:"Valentine's Day",  emoji:['💕','🌹'],       tint:'rgba(230,90,120,1)',  match:(m,d)=>m===2&&d>=10&&d<=16},
  {id:'oktoberfest',  name:"Oktoberfest",      emoji:['🍺','🥨','🎪'],  tint:'rgba(210,150,50,1)',  match:(m,d)=>(m===9&&d>=19)||(m===10&&d<=6)},
  {id:'halloween',    name:"Halloween",        emoji:['🎃','👻','🦇'],  tint:'rgba(140,60,170,1)',  match:(m,d)=>m===10},
  {id:'winterholiday',name:"Winter Holidays",  emoji:['🎄','❄️','🎁'],  tint:'rgba(120,180,160,1)', match:(m,d)=>m===12&&d>=1&&d<=26},
];
function getActiveFestival(){
  if(S.envPreview && S.envPreview.festival){
    if(S.envPreview.festival==='none')return null;
    return FESTIVALS.find(f=>f.id===S.envPreview.festival)||null;
  }
  const now=new Date();
  return FESTIVALS.find(f=>f.match(now.getMonth()+1,now.getDate()))||null;
}

// ═══ v01.14 step 4/5: ADMIN "preview weather/time/season/festival" tool ═══
// This browser only — S.envPreview is never sent to Firebase, so
// previewing a storm, midnight, winter, or Halloween never changes what
// real visitors see.
function setEnvPreviewWeather(kind){
  if(!S.adminUnlocked)return;
  S.envPreview=S.envPreview||{};
  S.envPreview.kind=kind;
  renderEnvPreviewControls();
  toast('previewing: '+kind);
}
function toggleEnvPreviewWindy(){
  if(!S.adminUnlocked)return;
  S.envPreview=S.envPreview||{};
  S.envPreview.windy=!S.envPreview.windy;
  renderEnvPreviewControls();
}
function setEnvPreviewDayNight(mode){
  if(!S.adminUnlocked)return;
  S.envPreview=S.envPreview||{};
  S.envPreview.dayNight=mode;
  renderEnvPreviewControls();
  toast('previewing: '+mode);
}
function setEnvPreviewSeason(season){
  if(!S.adminUnlocked)return;
  S.envPreview=S.envPreview||{};
  S.envPreview.season=season;
  renderEnvPreviewControls();
  toast('previewing: '+season);
}
function setEnvPreviewFestival(id){
  if(!S.adminUnlocked)return;
  S.envPreview=S.envPreview||{};
  S.envPreview.festival=id;
  renderEnvPreviewControls();
  toast('previewing: '+(id==='none'?'no festival':id));
}
function clearEnvPreview(){
  S.envPreview=null;
  if(typeof syncWeatherSound==='function')syncWeatherSound();
  renderEnvPreviewControls();
  toast('back to real weather/season/date');
}
function renderEnvPreviewControls(){
  const el=document.getElementById('env-preview-controls');
  if(!el)return;
  const p=S.envPreview||{};
  const weatherKinds=['clear','cloudy','rain','snow','thunder','fog'];
  const dayModes=[['auto','auto'],['dawn','dawn'],['day','day'],['dusk','dusk'],['night','night']];
  const seasons=[['auto','auto'],['spring','spring'],['summer','summer'],['fall','fall'],['winter','winter']];
  const festivalOptions=[['auto','auto'],['none','none']].concat(FESTIVALS.map(f=>[f.id,f.name]));
  const btn=(active,onclick,label)=>`<button class="sq-submit" style="font-size:.65rem;padding:5px 9px;width:auto;${active?'background:rgba(200,137,42,.35)':''}" onclick="${onclick}">${label}</button>`;
  el.innerHTML=`
    <div style="font-size:.7rem;color:var(--fog);opacity:.6;margin-bottom:8px;font-family:'Cinzel Decorative',serif">preview weather / time / season / festival (this browser only)</div>
    <div style="font-size:.62rem;color:var(--fog);opacity:.5;margin-bottom:3px">weather</div>
    <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:6px">
      ${weatherKinds.map(k=>btn(p.kind===k,`setEnvPreviewWeather('${k}')`,k)).join('')}
    </div>
    <label style="display:flex;align-items:center;gap:6px;font-size:.72rem;color:var(--cream);font-family:'IM Fell English',serif;font-style:italic;cursor:pointer;margin-bottom:8px">
      <input type="checkbox" ${p.windy?'checked':''} onchange="toggleEnvPreviewWindy()"> windy
    </label>
    <div style="font-size:.62rem;color:var(--fog);opacity:.5;margin-bottom:3px">time of day</div>
    <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px">
      ${dayModes.map(([k,label])=>btn((p.dayNight||'auto')===k,`setEnvPreviewDayNight('${k}')`,label)).join('')}
    </div>
    <div style="font-size:.62rem;color:var(--fog);opacity:.5;margin-bottom:3px">season</div>
    <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px">
      ${seasons.map(([k,label])=>btn((p.season||'auto')===k,`setEnvPreviewSeason('${k}')`,label)).join('')}
    </div>
    <div style="font-size:.62rem;color:var(--fog);opacity:.5;margin-bottom:3px">festival</div>
    <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px">
      ${festivalOptions.map(([k,label])=>btn((p.festival||'auto')===k,`setEnvPreviewFestival('${k}')`,label)).join('')}
    </div>
    <button class="sq-submit" style="width:100%;font-size:.7rem" onclick="clearEnvPreview()">stop previewing — use real everything</button>
  `;
}
