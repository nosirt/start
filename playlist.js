/* ============================================================
   PLAYLIST.JS — v01.24 personal playlist ("your own Spotify corner")
   Load AFTER pixie.js (reuses pixiePlayAmbient/pixieStopMusic/
   pixiePlayEpisodeByQuery so playback logic isn't duplicated) and
   AFTER accounts.js (uses S.account, callAccountUpdate).

   Data lives on the account doc itself (S.account.playlist), saved via
   the setPlaylist action in account-update.js — that function already
   existed from the first account slice, so no backend changes needed
   here, just the UI and the play/add/remove logic.

   Item shape:
     { type:'ambient', key, name }                                — a background track
     { type:'episode', showTitle, episodeTitle, addedAt }          — a specific episode
   Playing an item reuses pixie.js's own action-execution helpers
   (pixiePlayAmbient / pixiePlayEpisodeByQuery) rather than
   reimplementing playback — same functions Pixie herself uses when
   she starts something, so behavior stays identical either way.
   ============================================================ */

const PLAYLIST_MAX_ITEMS = 200;
let playlistPlayingIndex = null; // index into S.account.playlist currently playing, or null

// ═══ Add / remove / reorder ═══

function playlistItemKey(item){
  return item.type==='ambient' ? `ambient:${item.key}` : `episode:${item.showTitle}::${item.episodeTitle}`;
}

async function addToPlaylist(item){
  if(!S.account){ toast('sign in to save to a playlist'); return; }
  const list = S.account.playlist || [];
  const newKey = playlistItemKey(item);
  if(list.some(i=>playlistItemKey(i)===newKey)){
    toast('already in your playlist');
    return;
  }
  if(list.length >= PLAYLIST_MAX_ITEMS){
    toast('your playlist is full — remove something first');
    return;
  }
  const updated = [...list, { ...item, addedAt: Date.now() }];
  const res = await callAccountUpdate({ action:'setPlaylist', username:S.account.username, token:S.account.token, playlist:updated });
  if(!res.ok){ toast(res.error || "couldn't save"); return; }
  S.account.playlist = res.playlist;
  toast('added to your playlist');
  renderPlaylistPanel();
}

async function removeFromPlaylist(index){
  if(!S.account) return;
  const list = (S.account.playlist||[]).slice();
  if(index<0||index>=list.length) return;
  list.splice(index,1);
  const res = await callAccountUpdate({ action:'setPlaylist', username:S.account.username, token:S.account.token, playlist:list });
  if(!res.ok){ toast(res.error || "couldn't remove"); return; }
  S.account.playlist = res.playlist;
  if(playlistPlayingIndex===index) playlistPlayingIndex=null;
  else if(playlistPlayingIndex>index) playlistPlayingIndex--;
  renderPlaylistPanel();
}

async function movePlaylistItem(index, dir){
  if(!S.account) return;
  const list = (S.account.playlist||[]).slice();
  const target = index+dir;
  if(target<0||target>=list.length) return;
  [list[index],list[target]] = [list[target],list[index]];
  const res = await callAccountUpdate({ action:'setPlaylist', username:S.account.username, token:S.account.token, playlist:list });
  if(!res.ok){ toast(res.error || "couldn't reorder"); return; }
  S.account.playlist = res.playlist;
  if(playlistPlayingIndex===index) playlistPlayingIndex=target;
  else if(playlistPlayingIndex===target) playlistPlayingIndex=index;
  renderPlaylistPanel();
}

// ═══ Playback — delegates to pixie.js's own action helpers, so this
// behaves identically to Pixie starting the same track/episode herself ═══

function playPlaylistItem(index){
  const list = S.account && S.account.playlist || [];
  const item = list[index];
  if(!item) return;
  playlistPlayingIndex = index;
  if(item.type==='ambient'){
    if(typeof pixiePlayAmbient==='function') pixiePlayAmbient(item.key);
  } else if(item.type==='episode'){
    if(typeof pixiePlayEpisodeByQuery==='function') pixiePlayEpisodeByQuery(item.showTitle, item.episodeTitle);
  }
  renderPlaylistPanel();
}

function playlistNext(){
  const list = S.account && S.account.playlist || [];
  if(!list.length) return;
  const next = (playlistPlayingIndex===null) ? 0 : (playlistPlayingIndex+1) % list.length;
  playPlaylistItem(next);
}
function playlistPrev(){
  const list = S.account && S.account.playlist || [];
  if(!list.length) return;
  const prev = (playlistPlayingIndex===null) ? 0 : (playlistPlayingIndex-1+list.length) % list.length;
  playPlaylistItem(prev);
}
function playlistExit(){
  if(typeof pixieStopMusic==='function') pixieStopMusic();
  playlistPlayingIndex = null;
  renderPlaylistPanel();
}

// ═══ Panel UI ═══

function openPlaylistPanel(){
  if(!S.account){ toast('sign in to use your playlist'); return; }
  const panel = $('playlist-panel');
  if(!panel) return;
  panel.style.display = 'flex';
  renderPlaylistPanel();
}
function closePlaylistPanel(){
  const panel = $('playlist-panel');
  if(panel) panel.style.display = 'none';
}

function renderPlaylistPanel(){
  const listEl = $('playlist-items');
  if(!listEl) return;
  const list = (S.account && S.account.playlist) || [];

  if(!list.length){
    listEl.innerHTML = `<div class="chat-under-construction" style="padding:20px 10px">
      <div style="font-size:1.5rem;margin-bottom:8px">🎵</div>
      nothing saved yet. look for a "+" next to any track or episode.
    </div>`;
    updatePlaylistTransportUI(list);
    return;
  }

  listEl.innerHTML = list.map((item,i)=>{
    const playing = playlistPlayingIndex===i;
    const icon = item.type==='ambient' ? '📻' : '🎙';
    const label = item.type==='ambient' ? esc(item.name) : `${esc(item.showTitle)} — ${esc(item.episodeTitle)}`;
    return `<div class="playlist-item${playing?' playing':''}" style="display:flex;align-items:center;gap:8px;padding:8px;border-bottom:1px solid rgba(200,137,42,.1)">
      <div onclick="playPlaylistItem(${i})" style="flex:1;display:flex;align-items:center;gap:8px;cursor:pointer;min-width:0">
        <span>${playing?'🔊':icon}</span>
        <span style="font-size:.78rem;color:var(--cream);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${label}</span>
      </div>
      <button class="wp-ep-btn" onclick="movePlaylistItem(${i},-1)" title="move up" ${i===0?'disabled':''}>↑</button>
      <button class="wp-ep-btn" onclick="movePlaylistItem(${i},1)" title="move down" ${i===list.length-1?'disabled':''}>↓</button>
      <button class="wp-ep-btn delete" onclick="removeFromPlaylist(${i})" title="remove">✕</button>
    </div>`;
  }).join('');
  updatePlaylistTransportUI(list);
}

function updatePlaylistTransportUI(list){
  const transport = $('playlist-transport');
  if(!transport) return;
  transport.style.display = list.length ? 'flex' : 'none';
}
