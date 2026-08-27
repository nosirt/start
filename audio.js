/* ============================================================
   AUDIO.JS — music and built-in ambient playback

   Requires: core.js
   Exposes: tryPlay(), toggleMusic(), selectMusic(), music modal helpers

   v01.28 changes:
   - Fade-in now ramps to user's saved volume (not 1.0) so the ramp
     actually lands at the right level.
   - Web Audio GainNode route for the <audio> element so volume control
     works on iOS Safari (which ignores audioEl.volume on streams).
   - applyMusicVolumeLive() now prefers the GainNode over .volume.
   ============================================================ */

// ── Web Audio routing for iOS volume control ──
// iOS ignores <audio>.volume changes for live streams. We route the
// audio element through a GainNode so slider adjustments actually work.
let _audioCtxForGain = null;
let _audioGainNode = null;
let _audioSourceNode = null;

function _ensureAudioGainRoute(audioEl) {
  if (_audioGainNode) return; // already set up
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    // AudioContext must be created in a user gesture on iOS
    _audioCtxForGain = new AC();
    _audioSourceNode = _audioCtxForGain.createMediaElementSource(audioEl);
    _audioGainNode = _audioCtxForGain.createGain();
    _audioSourceNode.connect(_audioGainNode);
    _audioGainNode.connect(_audioCtxForGain.destination);
    // Set gain to match current user preference
    _audioGainNode.gain.value = Math.max(0, Math.min(1.6, musicVolumeMultiplier()));
  } catch(e) {
    // If it fails (e.g. no AudioContext support), fall back gracefully
    _audioCtxForGain = null; _audioGainNode = null; _audioSourceNode = null;
  }
}

// ── First-visit fade-in ──
// Ramps from silence to the user's saved volume over 5 seconds.
let _audioFadeInDone = false;
function _doFirstVisitFadeIn(audioEl) {
  if (_audioFadeInDone) return;
  _audioFadeInDone = true;
  const TARGET = Math.max(0, Math.min(1, musicVolumeMultiplier()));
  if (_audioGainNode) {
    // GainNode path (iOS + modern): ramp gain from 0 to TARGET
    _audioGainNode.gain.cancelScheduledValues(_audioCtxForGain.currentTime);
    _audioGainNode.gain.setValueAtTime(0.0001, _audioCtxForGain.currentTime);
    _audioGainNode.gain.linearRampToValueAtTime(
      Math.max(0.0001, TARGET),
      _audioCtxForGain.currentTime + 5.0
    );
  } else {
    // Fallback: ramp audioEl.volume directly
    audioEl.volume = 0;
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      if (elapsed >= 5000) { audioEl.volume = TARGET; return; }
      audioEl.volume = TARGET * (elapsed / 5000);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}

function tryPlay(src, name) {
  stopSynthMusic();
  const a = $('audio-player');
  if (a.src !== src) { a.src = src; a.load(); }
  a.onerror = () => {
    if (activeMusic === 'podcast' || a.src !== src || !a.getAttribute('src')) return;
    updateNP('stream failed · try built-in ancient'); toast('that stream would not open here');
  };
  a.play().then(() => {
    _ensureAudioGainRoute(a);
    if (!_audioFadeInDone) {
      // First ever play — ramp up from silence
      _doFirstVisitFadeIn(a);
    } else {
      // Switching tracks — cancel any pending ramp and set gain immediately
      // so the new track is audible instantly (first-press fix)
      if (_audioGainNode && _audioCtxForGain) {
        _audioGainNode.gain.cancelScheduledValues(_audioCtxForGain.currentTime);
        _audioGainNode.gain.setValueAtTime(
          Math.max(0.0001, Math.min(1.6, musicVolumeMultiplier())),
          _audioCtxForGain.currentTime
        );
      } else {
        a.volume = Math.max(0, Math.min(1, musicVolumeMultiplier()));
      }
    }
    toast('now playing: ' + name);
    updateNP(name);
  }).catch(() => {
    updateNP('tap anywhere to start sound');
    const retryPlay = () => {
      a.play().then(() => {
        _ensureAudioGainRoute(a);
        _doFirstVisitFadeIn(a);
        toast('sound started'); updateNP(name);
      }).catch(() => {});
      document.removeEventListener('click', retryPlay);
      document.removeEventListener('touchstart', retryPlay);
      document.removeEventListener('keydown', retryPlay);
    };
    document.addEventListener('click', retryPlay, { once: true });
    document.addEventListener('touchstart', retryPlay, { once: true });
    document.addEventListener('keydown', retryPlay, { once: true });
  });
  updateNP(name);
}

function updateNP(name) { $('now-playing-text').textContent = name; }

// ── Ancient synth ──
function startAncientSynth() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) { toast('audio not supported here'); return; }
  stopSynthMusic();
  const ac = new AC();
  const master = ac.createGain();
  const synthTarget = Math.max(0.04, musicVolumeMultiplier() * 0.18);
  // First-visit: ramp up; returning: quick settle
  master.gain.value = 0.0001;
  const rampEnd = _audioFadeInDone ? ac.currentTime + 1.8 : ac.currentTime + 5.0;
  master.gain.exponentialRampToValueAtTime(synthTarget, rampEnd);
  _audioFadeInDone = true;
  master.connect(ac.destination);
  const delay = ac.createDelay(2.5); delay.delayTime.value = 0.42;
  const fb = ac.createGain(); fb.gain.value = 0.26;
  delay.connect(fb); fb.connect(delay); delay.connect(master);
  const filter = ac.createBiquadFilter(); filter.type = 'lowpass';
  filter.frequency.value = 1900; filter.Q.value = 0.6;
  filter.connect(delay); filter.connect(master);
  const scale = [220, 261.63, 293.66, 329.63, 392, 440, 523.25];
  const nodes = [];
  function pluck(freq, when, dur, vol) {
    const o = ac.createOscillator(), g = ac.createGain(), tone = ac.createBiquadFilter();
    o.type = 'triangle'; o.frequency.setValueAtTime(freq, when);
    tone.type = 'bandpass'; tone.frequency.value = freq * 2.1; tone.Q.value = 3.2;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(vol, when + 0.025);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(tone); tone.connect(g); g.connect(filter);
    o.start(when); o.stop(when + dur + 0.08);
    nodes.push(o, g, tone);
  }
  function drone(freq) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine'; o.frequency.value = freq; g.gain.value = 0.026;
    o.connect(g); g.connect(master); o.start(); nodes.push(o, g);
  }
  drone(110); drone(165);
  let step = 0;
  const timer = setInterval(() => {
    const now = ac.currentTime + 0.04;
    const root = scale[(step % 14 < 7 ? 0 : 3)];
    pluck(root, now, 0.9, 0.055);
    pluck(scale[(step * 2 + 1) % scale.length] * 0.5, now + 0.18, 1.2, 0.035);
    if (step % 2 === 0) pluck(scale[(step + 4) % scale.length], now + 0.42, 0.7, 0.038);
    step++;
  }, 720);
  synthMusic = { ac, master, nodes, timer };
  updateNP('🏰 Ancient ambience · built in');
  toast('ancient ambience started');
}

function stopSynthMusic() {
  if (!synthMusic) return;
  clearInterval(synthMusic.timer);
  const { ac, master, nodes } = synthMusic;
  try { master.gain.cancelScheduledValues(ac.currentTime); master.gain.setTargetAtTime(0.0001, ac.currentTime, 0.12); } catch(e) {}
  setTimeout(() => { nodes.forEach(n => { try { n.stop && n.stop(); } catch(e) {} }); try { ac.close(); } catch(e) {} }, 420);
  synthMusic = null;
}

function stopAmbientMusic() {
  const a = $('audio-player');
  a.onerror = null;
  a.pause(); a.removeAttribute('src'); a.load();
  stopSynthMusic();
}

function toggleMusic(key) {
  if (key === 'podcast') {
    if (activeMusic === 'podcast') {
      if (ytPlayer) ytPlayer.pauseVideo();
      activeMusic = null;
      updateNP('nothing playing · tap to start');
      document.querySelectorAll('.music-opt').forEach(o => o.classList.remove('playing'));
      if (typeof updateMiniPlayerUI === 'function') updateMiniPlayerUI();
      closeMusicModal(); return;
    }
    stopAmbientMusic();
    activeMusic = 'podcast';
    document.querySelectorAll('.music-opt').forEach(o => o.classList.remove('playing'));
    const el = document.querySelector('.music-opt[data-key="podcast"]');
    if (el) el.classList.add('playing');
    // v01.31: this used to do nothing but change a label if no episode
    // had ever been loaded this session — tapping "The Wireless" looked
    // like it worked (icon highlighted) but nothing actually played.
    if (typeof currentEpisode !== 'undefined' && currentEpisode && ytPlayer) {
      // already loaded this session (maybe paused/ambient took over) — resume it
      ytPlayer.playVideo(); updateNP('🎙 ' + currentEpisode.title);
      closeMusicModal();
    } else if (typeof pickDefaultEpisode === 'function' && pickDefaultEpisode()) {
      // nothing loaded yet this session, but there's a last-played/oldest
      // episode to resume — load & start it right here, in the background,
      // no page redirect (matches the original "background playback" intent)
      updateNP('🎙 The Wireless');
      closeMusicModal();
      loadDefaultEpisode();
    } else {
      // truly nothing to play (no shows/episodes at all yet) — send them
      // to the wireless page to pick something
      closeMusicModal();
      if (typeof navigateTo === 'function') navigateTo('wireless');
    }
    if (typeof updateMiniPlayerUI === 'function') updateMiniPlayerUI();
    return;
  }
  if (ytPlayer) ytPlayer.pauseVideo();
  const a = $('audio-player');
  if (activeMusic === key) {
    stopAmbientMusic();
    activeMusic = null;
    updateNP('nothing playing · tap to start');
    document.querySelectorAll('.music-opt').forEach(o => o.classList.remove('playing'));
  } else {
    activeMusic = key;
    const t = MUSIC[key];
    if (t && t.builtIn) { stopAmbientMusic(); startAncientSynth(); }
    else if (t) tryPlay(t.src, t.name);
    document.querySelectorAll('.music-opt').forEach(o => o.classList.remove('playing'));
    const el = document.querySelector(`.music-opt[data-key="${key}"]`);
    if (el) el.classList.add('playing');
  }
  // podcast is paused (not stopped) so switching back later resumes in place —
  // keep the mini-player visible but dim it to show it's not the active source
  if (typeof updateMiniPlayerUI === 'function') updateMiniPlayerUI();
  closeMusicModal();
}

function selectMusic(mode, el) { toggleMusic(mode); }
function openMusicModal() {
  $('music-modal').classList.add('open');
  // Mark currently playing track
  document.querySelectorAll('.music-opt').forEach(o=>{
    o.classList.toggle('playing', o.getAttribute('data-key')===activeMusic);
  });
}
function closeMusicModal() { $('music-modal').classList.remove('open'); }
