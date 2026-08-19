/* ============================================================
   PROFILE.JS — floating profile panel and bio editing

   Requires: core.js, admin.js, accounts.js
   Exposes: openProfilePanel(), closeProfilePanel(), profile drag helpers
   ============================================================ */

// ═══ PROFILE PANEL — closes on outside tap ═══
document.addEventListener('click',e=>{
  const panel=$('profile-panel');
  if(panel&&panel.style.display!=='none'&&!e.target.closest('#profile-icon')&&!e.target.closest('#profile-panel'))
    closeProfilePanel();
});


// ═══════════════════════════════════════════════════════════
// v01.05 — Profile Icon Draggable, Admin/Bio/Versions Integrated
// ═══════════════════════════════════════════════════════════

function openProfilePanel() {
  const panel = $('profile-panel');
  if (panel) {
    panel.style.display = 'flex';
    // v01.11: was a dead "v${CURRENT_VERSION}" literal sitting in raw
    // HTML (never actually evaluated as JS) — now set here for real.
    const vEl = $('profile-version-display');
    if (vEl) vEl.textContent = CURRENT_VERSION;
    loadProfileData();
  }
}

function closeProfilePanel() {
  const panel = $('profile-panel');
  if (panel) panel.style.display = 'none';
}

// v01.16: full tabbed admin settings panel — launched from the small
// profile sidebar once unlocked. Re-renders every section's content on
// open, same as before, just now inside tabs instead of one long stack.

async function loadProfileData() {
  // Load bio from Firebase
  const bio = await fetchSiteBio();
  $('profile-bio-display').textContent = bio;

  // Show admin buttons if unlocked
  if (S.adminUnlocked) {
    $('profile-bio-edit-btn').style.display = 'block';
    loadChangelogIfAdmin();
    renderFeatureToggleList();
    if(typeof renderChatAdminSettings==='function')renderChatAdminSettings();
    if(typeof renderEnvPreviewControls==='function')renderEnvPreviewControls();
  }
}

function loadChangelogIfAdmin() {
  if (!S.adminUnlocked) return;
  const changelogDiv = $('profile-changelog');
  changelogDiv.innerHTML = '';

  VERSION_HISTORY.forEach((v, idx) => {
    const item = document.createElement('div');
    item.style.cssText = 'margin-bottom:6px;border-radius:4px;overflow:hidden';
    const changesHtml = v.changes.map(ch => `• ${esc(ch)}`).join('<br>');
    item.innerHTML = `
      <div class="changelog-version-row" onclick="const b=this.nextElementSibling;b.style.display=b.style.display==='block'?'none':'block';"
        style="cursor:pointer;padding:6px;color:#a8e05f;font-weight:bold;font-family:'Cinzel Decorative',serif;
        display:flex;align-items:center;justify-content:space-between;background:rgba(200,137,42,.08)">
        <span>v${esc(v.version)}</span><span style="opacity:.5;font-size:.65rem">tap to expand</span>
      </div>
      <div class="changelog-version-body" style="display:none;padding:8px 6px;background:rgba(200,137,42,.04)">${changesHtml}</div>
    `;
    changelogDiv.appendChild(item);
  });
  changelogDiv.style.display = 'block';
}

function startBioEdit() {
  $('profile-bio-display').style.display = 'none';
  $('profile-bio-edit-btn').style.display = 'none';
  $('profile-bio-edit').style.display = 'block';
  $('profile-bio-buttons').style.display = 'flex';
  $('profile-bio-edit').value = $('profile-bio-display').textContent;
}

function cancelBioEdit() {
  $('profile-bio-edit').style.display = 'none';
  $('profile-bio-buttons').style.display = 'none';
  $('profile-bio-display').style.display = 'block';
  $('profile-bio-edit-btn').style.display = 'block';
}

async function saveBioEdit() {
  const newBio = $('profile-bio-edit').value.trim();
  if (newBio.length < 5) {
    toast('bio must be at least 5 characters');
    return;
  }
  
  const success = await saveSiteBio(newBio);
  if (success) {
    $('profile-bio-display').textContent = newBio;
    cancelBioEdit();
  }
}

// Toggle the admin section disclosure (so regular users don't see admin fields)

function initProfileIconDraggable() {
  const icon = $('profile-icon');
  const panel = $('profile-panel');
  let isDragging = false;
  let moved = false;
  let startX = 0, startY = 0;

  // v01.06: keep the icon fully inside the app frame — never let it
  // drag off past the edges of the map square itself.
  function clamp(x, y) {
    const w = icon.offsetWidth || 40;
    const h = icon.offsetHeight || 56;
    const pad = 6; // small breathing room from the very edge
    const maxX = window.innerWidth - w - pad;
    const maxY = window.innerHeight - h - pad;
    return {
      x: Math.max(pad, Math.min(x, maxX)),
      y: Math.max(pad, Math.min(y, maxY))
    };
  }

  // Click to open panel (only if it wasn't a drag)
  icon.addEventListener('click', () => {
    if (!moved) openProfilePanel();
  });

  icon.addEventListener('pointerdown', (e) => {
    isDragging = true;
    moved = false;
    const rect = icon.getBoundingClientRect();
    startX = e.clientX - rect.left;
    startY = e.clientY - rect.top;
    icon.setPointerCapture && icon.setPointerCapture(e.pointerId);
  });

  document.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    moved = true;
    const rawX = e.clientX - startX;
    const rawY = e.clientY - startY;
    const { x, y } = clamp(rawX, rawY);
    icon.style.position = 'fixed';
    icon.style.left = x + 'px';
    icon.style.top = y + 'px';
    icon.style.right = 'auto';
    icon.style.bottom = 'auto';
  });

  document.addEventListener('pointerup', () => {
    if (isDragging) {
      isDragging = false;
      if (moved) {
        const pos = { left: icon.style.left, top: icon.style.top };
        localStorage.setItem('n_profile_icon_pos', JSON.stringify(pos));
      }
      // small delay so the click handler above can see the final `moved` state
      setTimeout(() => { moved = false; }, 50);
    }
  });

  // Re-clamp on resize/orientation change so it can never end up stuck
  // off-screen after the viewport changes size.
  window.addEventListener('resize', () => {
    const rect = icon.getBoundingClientRect();
    const { x, y } = clamp(rect.left, rect.top);
    if (icon.style.left) {
      icon.style.left = x + 'px';
      icon.style.top = y + 'px';
    }
  });

  // Restore position (clamped, in case the viewport is smaller now than
  // when the position was saved — e.g. switched from desktop to mobile)
  const saved = localStorage.getItem('n_profile_icon_pos');
  if (saved) {
    const pos = JSON.parse(saved);
    const savedX = parseFloat(pos.left) || 0;
    const savedY = parseFloat(pos.top) || 0;
    const { x, y } = clamp(savedX, savedY);
    icon.style.left = x + 'px';
    icon.style.top = y + 'px';
    icon.style.right = 'auto';
    icon.style.bottom = 'auto';
  }
}

// Init on load
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    initProfileIconDraggable();
  }, 100);
});
// v01.05: Remove map UI (buttons/hints) — keep zoom/pan
function hideMapUI() {
  const tools = $('map-tools');
  if (tools) tools.style.display = 'none';
}

function showMapUI() {
  // Intentionally disabled — map UI removed in v01.05
}

window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    hideMapUI();
  }, 100);
});

