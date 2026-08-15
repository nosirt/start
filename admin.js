/* ============================================================
   ADMIN.JS — admin mode, settings, users, and moderation tools

   Requires: core.js, version-history.js, map-layout.js, accounts.js
   Also needs: feature modules whose admin controls it refreshes
   Exposes: updateAdminUI(), admin settings panel helpers, moderation helpers
   ============================================================ */

// ═══ ADMIN MODE ═══
// (unlock/lock now handled by handleAdminLoginProfile/handleAdminLogoutProfile
// in the profile panel — see below. This just toggles admin-only UI site-wide.)
function updateAdminUI(){
  // Show/hide admin controls on episodes, posts, notes, etc.
  document.querySelectorAll('.wp-ep-admin, .admin-controls, .rec-admin, .post-admin, .note-admin, .scream-admin, .lib-admin, .wcal-admin-toggle, .show-admin').forEach(el=>{
    if(S.adminUnlocked)el.classList.add('show');
    else el.classList.remove('show');
  });
}
// (now handled by canvas map engine — see initMapCanvas/drawMap)



function openAdminSettingsPanel(){
  if(!S.adminUnlocked)return;
  const panel=$('admin-settings-panel');
  if(!panel)return;
  panel.classList.add('open');
  if(typeof renderFeatureToggleList==='function')renderFeatureToggleList();
  if(typeof renderChatAdminSettings==='function')renderChatAdminSettings();
  if(typeof renderEnvPreviewControls==='function')renderEnvPreviewControls();
  if(typeof renderPixieAdminSettings==='function')renderPixieAdminSettings();
  switchAdminTab('features'); // always start on features tab
}
function closeAdminSettingsPanel(){
  const panel=$('admin-settings-panel');
  if(panel)panel.classList.remove('open');
}
function switchAdminTab(tab){
  ['features','display','chat','environment','pixie','users','moderation'].forEach(t=>{
    const body=$('admin-tab-'+t),btn=$('admin-tabbtn-'+t);
    if(body)body.style.display=(t===tab)?'flex':'none';
    if(btn)btn.classList.toggle('active',t===tab);
  });
  // Load data on demand when a tab is opened
  if(tab==='users') adminLoadUserList();
  if(tab==='display') renderViewModeTab();
}

function toggleAdminSection(){
  const body = $('admin-section-body');
  const btn  = $('admin-toggle-btn');
  if(!body) return;
  const open = body.style.display === 'none';
  body.style.display = open ? 'block' : 'none';
  if(btn) btn.textContent = open ? 'admin ▴' : 'admin ▾';
}

async function handleAdminLoginProfile() {
  const username = $('admin-username-profile').value.trim();
  const password = $('admin-password-profile').value.trim();
  const errorDiv = $('admin-login-error-profile');
  if(errorDiv) errorDiv.textContent = '';

  if (username !== 'admin' && username !== 'nosirt') {
    if(errorDiv) errorDiv.textContent = 'use "admin" or "nosirt" as the username.';
    return;
  }

  // v01.27: admin login now goes through account-auth admin-login action
  // which verifies the password server-side and returns the nosirt account token.
  // This signs into the nosirt user account so admin has full user capabilities.
  let res;
  try {
    const r = await fetch('/.netlify/functions/account-auth', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ action: 'admin-login', adminPassword: password })
    });
    res = await r.json();
  } catch(e) {
    if(errorDiv) errorDiv.textContent = 'could not reach server.';
    return;
  }

  if (!res.ok) {
    if(errorDiv) errorDiv.textContent = res.error || 'wrong password.';
    return;
  }

  // If another user is currently logged in, log them out cleanly first
  if(S.account && S.account.username !== 'nosirt'){
    if(typeof handleAccountLogout === 'function') handleAccountLogout(true); // silent=true
  }

  // Sign into nosirt account
  S.account = {
    username: res.username,
    displayName: res.displayName || 'nosirt',
    token: res.token,
    avatarEmoji: res.avatarEmoji || '🏰',
    playlist: res.playlist || [],
    savedItems: res.savedItems || [],
    isAdminAccount: true
  };
  localStorage.setItem('n_account_token', res.token);
  localStorage.setItem('n_account_username', res.username);

  S.adminUnlocked = true;

  // Admin is hidden by default
  presenceHidden = true;
  localStorage.setItem('n_presence_hidden', '1');

  // Wipe Pixie chat history — don't carry over from previous user
  if(typeof clearPixieHistory === 'function') clearPixieHistory();
  localStorage.removeItem('n_pixie_chat_history');
  localStorage.removeItem('n_pixie_last_visit');

  // Start presence as nosirt (hidden)
  if(db) fbSavePresence(S.userId, {
    id: S.userId, num: getChatNum(),
    displayName: 'nosirt', avatarEmoji: '🏰',
    accountUsername: 'nosirt', ts: Date.now(), hidden: true
  });

  $('admin-username-profile').value = '';
  $('admin-password-profile').value = '';
  $('admin-login-form-profile').style.display = 'none';
  $('admin-unlocked-view-profile').style.display = 'block';
  // Keep section expanded so admin sees their controls
  const body = $('admin-section-body');
  if(body) body.style.display = 'block';
  const btn = $('admin-toggle-btn');
  if(btn) btn.textContent = 'admin ▴';
  // Refresh all admin-aware UI
  if(typeof $==='function' && $('profile-bio-edit-btn')) $('profile-bio-edit-btn').style.display = 'block';
  if(typeof loadChangelogIfAdmin==='function') loadChangelogIfAdmin();
  if(typeof renderFeatureToggleList==='function') renderFeatureToggleList();
  if(typeof renderChatAdminSettings==='function') renderChatAdminSettings();
  if(typeof renderEnvPreviewControls==='function') renderEnvPreviewControls();
  toast('admin unlocked — signed in as nosirt');
  if(typeof updateAdminUI==='function') updateAdminUI();
  if(typeof renderEpisodes==='function') renderEpisodes();
  if(typeof renderShowGrid==='function') renderShowGrid();
  if(typeof updateWirelessToolbar==='function') updateWirelessToolbar();
  if(typeof renderComments==='function') renderComments();
  if(typeof loadClaimNamesForAdmin==='function') loadClaimNamesForAdmin();
  if(typeof updateKeepTitles==='function') updateKeepTitles();
  if(typeof initKeepTabs==='function') initKeepTabs();
  if(typeof renderOnlineList==='function') renderOnlineList();
  if(typeof renderOnlineCount==='function') renderOnlineCount();
  if(typeof renderAccountPanel==='function') renderAccountPanel();
}

function handleAdminLogoutProfile() {
  S.adminUnlocked = false;
  // v01.27: also log out the nosirt account
  if(S.account && S.account.username === 'nosirt'){
    if(typeof handleAccountLogout === 'function') handleAccountLogout(true);
  }
  $('admin-username-profile').value = '';
  $('admin-password-profile').value = '';
  $('admin-unlocked-view-profile').style.display = 'none';
  $('admin-login-form-profile').style.display = 'flex';
  // Collapse the admin section again after logout
  const body = $('admin-section-body');
  if(body) body.style.display = 'none';
  const btn = $('admin-toggle-btn');
  if(btn) btn.textContent = 'admin ▾';
  $('profile-bio-edit-btn').style.display = 'none';
  $('profile-changelog').style.display = 'none';
  cancelBioEdit();
  toast('admin locked');
  updateAdminUI();
  if(typeof renderEpisodes==='function')renderEpisodes();
  wcalClaimsCache={}; // wipe cached booking names from memory on logout
  if(typeof renderCalendarGrid==='function')renderCalendarGrid();
  if(typeof closeAdminEdit==='function')closeAdminEdit();
  if($('wcal-admin-panel'))$('wcal-admin-panel').classList.remove('show');
  if(typeof closeAdminSettingsPanel==='function')closeAdminSettingsPanel();
  if(typeof renderShowGrid==='function')renderShowGrid();
  if(typeof updateWirelessToolbar==='function')updateWirelessToolbar();
  if(typeof updateKeepTitles==='function')updateKeepTitles();
  if(typeof initKeepTabs==='function')initKeepTabs();
  if(typeof renderComments==='function')renderComments();
  if(typeof cancelShowDescriptionEdit==='function')cancelShowDescriptionEdit();
  if(typeof closeShowForm==='function')closeShowForm();
  if(S.selectMode&&typeof toggleSelectMode==='function')toggleSelectMode();
}


// ═══════════════════════════════════════════════════════════════
// v01.26 ADMIN: USER LIST + VIEW-AS-USER + MODERATION TOOLS
// ═══════════════════════════════════════════════════════════════

// ── Admin user list ──────────────────────────────────────────

let adminUserCache = []; // cached for the session once loaded

async function adminLoadUserList(){
  if(!S.adminUnlocked) return;
  const el = $('admin-user-list');
  if(!el) return;
  el.innerHTML = '<div class="admin-placeholder">loading...</div>';

  try {
    // Read accounts + live presence in parallel
    const [userSnap, presenceSnap] = await Promise.all([
      db.collection('nosirt_users').get(),
      db.collection('nosirt_presence').get()
    ]);

    // Build presence map: accountUsername → {hidden, ts}
    const presenceMap = {};
    const now = Date.now();
    const ONLINE_CUTOFF = 45 * 1000;
    presenceSnap.forEach(doc => {
      const p = doc.data();
      if(p.accountUsername && p.ts > now - ONLINE_CUTOFF){
        presenceMap[p.accountUsername] = { hidden: !!p.hidden, ts: p.ts };
      }
    });

    adminUserCache = [];
    userSnap.forEach(doc => {
      const d = doc.data();
      const presence = presenceMap[doc.id] || null;
      adminUserCache.push({
        username: doc.id,
        displayName: d.displayName || doc.id,
        avatarEmoji: d.avatarEmoji || '🙂',
        createdAt: d.createdAt || 0,
        playlistCount: (d.playlist||[]).length,
        savedCount: (d.savedItems||[]).length,
        isOnline: !!presence,
        isHidden: presence ? presence.hidden : false
      });
    });
    adminUserCache.sort((a,b) => {
      // Online first, then by join date
      if(a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
      return b.createdAt - a.createdAt;
    });

    if(!adminUserCache.length){
      el.innerHTML = '<div class="admin-placeholder">no accounts yet.</div>';
      return;
    }

    el.innerHTML = '<div style="font-size:.62rem;color:var(--fog);opacity:.4;padding:4px 0 8px;font-style:italic">' +
      adminUserCache.length + ' account' + (adminUserCache.length!==1?'s':'') + ' total</div>' +
      adminUserCache.map(u => {
        const date = u.createdAt
          ? new Date(u.createdAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})
          : '';
        // Presence dot: green = online visible, red = online hidden, grey = offline
        const dot = u.isOnline
          ? (u.isHidden ? '🔴' : '🟢')
          : '<span style="opacity:.3">⚫</span>';
        const hiddenNote = u.isHidden
          ? ' <span style="font-size:.58rem;color:#e07070;opacity:.8">(hidden)</span>'
          : '';
        return '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;' +
          'background:rgba(200,137,42,.06);border:1px solid rgba(200,137,42,.12);margin-bottom:6px">' +
          '<div style="font-size:1.1rem">' + esc(u.avatarEmoji) + '</div>' +
          '<div style="flex:1;min-width:0">' +
            '<div style="font-size:.8rem;color:var(--cream);font-family:var(--font-title)">' +
              dot + ' ' + esc(u.displayName) + hiddenNote + '</div>' +
            '<div style="font-size:.63rem;color:var(--fog);opacity:.6">@' + esc(u.username) +
              (date ? ' · joined ' + date : '') + '</div>' +
            '<div style="font-size:.6rem;color:var(--fog);opacity:.4;margin-top:2px">' +
              u.playlistCount + ' playlist · ' + u.savedCount + ' saved</div>' +
          '</div>' +
          '<div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end">' +
            '<button data-action="admin-inspect" data-username="'+esc(u.username)+'" ' +
              'style="background:rgba(200,137,42,.1);border:1px solid rgba(200,137,42,.2);border-radius:6px;' +
              'color:var(--amber);font-size:.62rem;padding:3px 8px;cursor:pointer">inspect</button>' +
            (u.username !== 'nosirt' ?
              '<button data-action="admin-delete-user" data-username="'+esc(u.username)+'" ' +
              'style="background:rgba(200,60,60,.1);border:1px solid rgba(200,60,60,.2);border-radius:6px;' +
              'color:#e07070;font-size:.62rem;padding:3px 8px;cursor:pointer">delete</button>'
              : '') +
          '</div>' +
          '</div>';
      }).join('');

  } catch(e) {
    console.error('adminLoadUserList:', e);
    el.innerHTML = '<div class="admin-placeholder">error loading users: ' + esc(e.message) + '</div>';
  }
}

// Delete a user account — requires confirmation
async function adminDeleteUser(username){
  if(!S.adminUnlocked) return;
  if(username === 'nosirt'){ toast('cannot delete the admin account'); return; }
  if(!confirm('Delete account "' + username + '"? This removes their account permanently.\n\nTheir stories and shows will remain in the database but become unowned. This cannot be undone.')) return;
  if(!confirm('Are you absolutely sure? Type "yes" in the next prompt.\n\nDeleting: ' + username)) return;
  const ans = prompt('Type DELETE to confirm removal of @' + username);
  if((ans||'').trim().toUpperCase() !== 'DELETE'){ toast('cancelled'); return; }
  try {
    // Delete the user doc — must go through a Netlify function since
    // nosirt_users is write-locked on the client. We reuse account-update
    // with a new admin-only action.
    const res = await fetch('/.netlify/functions/account-update', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        action: 'adminDeleteUser',
        username: S.account.username,
        token: S.account.token,
        targetUsername: username
      })
    });
    const data = await res.json();
    if(!data.ok){ toast(data.error || 'error deleting user'); return; }
    toast('@' + username + ' deleted ✓');
    // Remove from cache and re-render
    adminUserCache = adminUserCache.filter(u => u.username !== username);
    adminLoadUserList();
  } catch(e) {
    toast('error: ' + e.message);
  }
}

// ── View-as-user (read-only inspect mode) ────────────────────

let adminViewingUser = null; // the user being inspected, or null

async function adminOpenUserView(username){
  if(!S.adminUnlocked){ return; }
  const el = $('admin-user-list');
  if(!el) return;
  el.innerHTML = '<div class="admin-placeholder">loading ' + esc(username) + '...</div>';

  try {
    const doc = await db.collection('nosirt_users').doc(username).get();
    if(!doc.exists){ el.innerHTML = '<div class="admin-placeholder">user not found.</div>'; return; }
    const d = doc.data();

    // Get their stories
    const storySnap = await db.collection('nosirt_stories').where('owner','==',username).get();
    const stories = [];
    storySnap.forEach(s => stories.push(s.data()));

    // Get their shows
    const showSnap = await db.collection('nosirt_shows').where('owner','==',username).get();
    const shows = [];
    showSnap.forEach(s => shows.push(s.data()));

    const playlist = d.playlist || [];
    const saved = d.savedItems || [];

    adminViewingUser = username;

    // Render inspect view
    const storiesHtml = stories.length
      ? stories.map(s =>
          '<div style="padding:6px 0;border-bottom:1px solid rgba(200,137,42,.08);font-size:.75rem">' +
            esc(s.title||'untitled') +
            ' <span style="opacity:.45;font-size:.65rem">' + (s.isPublic?'🌿 public':'🔒 private') + '</span>' +
          '</div>'
        ).join('')
      : '<div style="opacity:.4;font-size:.72rem;font-style:italic">no stories</div>';

    const showsHtml = shows.length
      ? shows.map(s =>
          '<div style="padding:6px 0;border-bottom:1px solid rgba(200,137,42,.08);font-size:.75rem">' +
            esc(s.title||'untitled') +
            ' <span style="opacity:.45;font-size:.65rem">' + (s.isPublic?'🌿 public':'🔒 private') + ' · ' + (s.episodeCount||0) + ' ep</span>' +
          '</div>'
        ).join('')
      : '<div style="opacity:.4;font-size:.72rem;font-style:italic">no shows</div>';

    const playlistHtml = playlist.length
      ? playlist.slice(0,10).map(p =>
          '<div style="font-size:.7rem;padding:3px 0;opacity:.7">' +
            esc((p.episodeTitle||p.title||'?') + (p.showTitle?' — '+p.showTitle:'')) +
          '</div>'
        ).join('') + (playlist.length>10?'<div style="opacity:.4;font-size:.65rem">+ '+(playlist.length-10)+' more</div>':'')
      : '<div style="opacity:.4;font-size:.72rem;font-style:italic">empty</div>';

    el.innerHTML =
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">' +
        '<button onclick="adminLoadUserList()" style="background:none;border:none;color:var(--amber);font-size:.85rem;cursor:pointer;padding:0">← back</button>' +
        '<div style="font-size:.85rem;color:var(--cream);font-family:var(--font-title)">' +
          esc(d.avatarEmoji||'🙂') + ' ' + esc(d.displayName||username) +
        '</div>' +
        '<div style="font-size:.65rem;color:var(--fog);opacity:.5">@' + esc(username) + '</div>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:12px;overflow-y:auto">' +
        _adminSection('📚 stories (' + stories.length + ')', storiesHtml) +
        _adminSection('📻 shows/playlists (' + shows.length + ')', showsHtml) +
        _adminSection('🎵 saved playlist (' + playlist.length + ' items)', playlistHtml) +
      '</div>';

  } catch(e) {
    console.error('adminOpenUserView:', e);
    el.innerHTML = '<div class="admin-placeholder">error: ' + esc(e.message) + '</div>';
  }
}

function _adminSection(title, bodyHtml){
  return '<div style="background:rgba(200,137,42,.04);border:1px solid rgba(200,137,42,.1);border-radius:8px;padding:10px">' +
    '<div style="font-size:.7rem;color:var(--amber);font-family:var(--font-title);margin-bottom:8px">' + title + '</div>' +
    bodyHtml +
    '</div>';
}

// Delegated click handler for admin user list buttons
document.addEventListener('click', function(e){
  const btn = e.target.closest('[data-action^="admin-"]');
  if(!btn || !S.adminUnlocked) return;
  const action = btn.getAttribute('data-action');
  const username = btn.getAttribute('data-username');
  if(action === 'admin-inspect' && username) adminOpenUserView(username);
  if(action === 'admin-delete-user' && username) adminDeleteUser(username);
});

// ── Admin moderation: delete chat/posts/recs ─────────────────

async function adminLoadModQueue(type){
  if(!S.adminUnlocked) return;
  const el = $('admin-mod-queue');
  if(!el) return;
  el.innerHTML = '<div class="admin-placeholder">loading...</div>';

  try {
    let items = [];

    if(type === 'chat'){
      const snap = await db.collection('nosirt_chat_global')
        .orderBy('ts','desc').limit(50).get();
      snap.forEach(doc => {
        const d = doc.data();
        items.push({
          id: doc.id, type: 'chat',
          label: (d.displayName||d.accountUsername||'anon') + ': ' + (d.text||'[image/card]').slice(0,60),
          ts: d.ts||0
        });
      });
    } else if(type === 'posts'){
      const snap = await db.collection('nosirt_posts')
        .orderBy('createdAt','desc').limit(50).get();
      snap.forEach(doc => {
        const d = doc.data();
        items.push({
          id: doc.id, type: 'posts',
          label: (d.author||'anon') + ' in ' + (d.board||'?') + ': ' + (d.title||'').slice(0,50),
          ts: d.createdAt||0
        });
      });
    } else if(type === 'recs'){
      const snap = await db.collection('nosirt_recs')
        .orderBy('addedAt','desc').limit(50).get();
      snap.forEach(doc => {
        const d = doc.data();
        items.push({
          id: doc.id, type: 'recs',
          label: (d.addedBy||'anon') + ': ' + (d.title||'').slice(0,50),
          ts: d.addedAt||0
        });
      });
    }

    if(!items.length){
      el.innerHTML = '<div class="admin-placeholder">nothing here.</div>';
      return;
    }

    el.innerHTML = items.map(item => {
      const date = item.ts
        ? new Date(item.ts).toLocaleDateString('en-US',{month:'short',day:'numeric'})
        : '';
      return '<div style="display:flex;align-items:center;gap:8px;padding:8px;border-radius:8px;' +
        'background:rgba(200,137,42,.04);border:1px solid rgba(200,137,42,.1)">' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:.72rem;color:var(--fog);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' +
            esc(item.label) + '</div>' +
          (date ? '<div style="font-size:.6rem;color:var(--fog);opacity:.4">' + date + '</div>' : '') +
        '</div>' +
        '<button onclick="adminDeleteItem(\'' + esc(item.type) + '\',\'' + esc(item.id) + '\',this)" ' +
          'style="background:rgba(200,60,60,.15);border:1px solid rgba(200,60,60,.3);border-radius:6px;' +
          'color:#e07070;font-size:.65rem;padding:3px 8px;cursor:pointer;flex-shrink:0">delete</button>' +
        '</div>';
    }).join('');

  } catch(e) {
    console.error('adminLoadModQueue:', e);
    el.innerHTML = '<div class="admin-placeholder">error: ' + esc(e.message) + '</div>';
  }
}

async function adminDeleteItem(type, id, btn){
  if(!S.adminUnlocked) return;
  if(!confirm('delete this item permanently?')) return;
  try {
    if(type === 'chat'){
      if(typeof fbDeleteChatMsg === 'function') fbDeleteChatMsg(id);
    } else if(type === 'posts'){
      if(typeof fbDeleteItem === 'function') fbDeleteItem('nosirt_posts', id);
    } else if(type === 'recs'){
      if(typeof fbDeleteItem === 'function') fbDeleteItem('nosirt_recs', id);
    }
    // Remove row from UI immediately
    const row = btn ? btn.closest('div[style*="border-radius:8px"]') : null;
    if(row) row.remove();
    toast('deleted ✓');
  } catch(e) {
    toast('error: ' + e.message);
  }
}


// ═══════════════════════════════════════════════════════════════
// VIEW MODE — admin-controlled layout override (auto / mobile / desktop)
// Stored in Firestore: site-config/display.viewMode
// Applied on boot for ALL visitors; admin can change live from the
// "display" tab in the admin settings panel.
// ═══════════════════════════════════════════════════════════════

const VM_MODES = ['auto','mobile','desktop'];
let _vmUnsub = null; // Firestore live listener cleanup

// Called once on DOMContentLoaded (from map-layout.js boot sequence or inline)
// and whenever the Firestore doc updates. Applies the correct CSS class.
function applyViewMode(mode) {
  const html = document.documentElement;
  html.classList.remove('view-mobile','view-desktop');
  if (mode === 'mobile') {
    html.classList.add('view-mobile');
  } else if (mode === 'desktop') {
    html.classList.add('view-desktop');
  }
  // 'auto' = no class, CSS media queries handle it naturally
  S._viewMode = mode || 'auto';
}

// Boot: read the Firestore setting once, then keep a live listener so
// changes the admin makes propagate to all open visitors in real-time.
function initViewMode() {
  if (!db) { applyViewMode('auto'); return; }
  // Live listener — fires immediately with the current value, then on every change
  if (_vmUnsub) { try { _vmUnsub(); } catch(e) {} }
  try {
    _vmUnsub = db.collection('site-config').doc('display')
      .onSnapshot(snap => {
        const mode = (snap && snap.exists && snap.data().viewMode) || 'auto';
        applyViewMode(mode);
        // If admin panel is open on the display tab, refresh its UI
        const tab = document.getElementById('admin-tab-display');
        if (tab && tab.style.display !== 'none') renderViewModeTab();
      });
  } catch(e) {
    applyViewMode('auto');
  }
}

// Admin: save a new view mode to Firestore
async function setViewMode(mode) {
  if (!S.adminUnlocked) return;
  if (!VM_MODES.includes(mode)) return;
  applyViewMode(mode); // optimistic local update
  renderViewModeTab();
  try {
    await db.collection('site-config').doc('display').set({ viewMode: mode }, { merge: true });
    toast('view mode → ' + mode + ' ✓');
  } catch(e) {
    toast('error saving view mode');
  }
}

// Render the radio-button UI in the display tab
function renderViewModeTab() {
  const current = S._viewMode || 'auto';
  VM_MODES.forEach(m => {
    const radio = document.getElementById('vm-radio-' + m);
    const opt   = document.getElementById('vm-opt-' + m);
    if (radio) radio.classList.toggle('vm-radio-active', m === current);
    if (opt)   opt.classList.toggle('vm-option-active',  m === current);
  });
  const label = document.getElementById('vm-current-label');
  if (label) {
    const desc = {
      auto:    'currently: auto — each visitor sees what fits their screen',
      mobile:  'currently: mobile — everyone sees the compact app view',
      desktop: 'currently: desktop — everyone sees the full expanded view'
    };
    label.textContent = desc[current] || '';
  }
}
