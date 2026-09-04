// netlify/functions/account-update.js
//
// v01.24 — authenticated writes to a user's own account doc: avatar
// emoji and playlist. Deliberately separate from account-auth.js
// (signup/login) so the two concerns stay simple: one function proves
// who you are, this one only ever changes YOUR OWN data and always
// re-checks your token first — a client that skips account-auth and
// just POSTs here with a guessed token gets rejected the same as
// anyone else.
//
// Called by accounts.js via:
//   POST /.netlify/functions/account-update
//   Body: { username, token, action: 'setAvatar'|'setPlaylist', ...fields }
//   Returns: { ok: true, ... } or { ok: false, error }

const admin = require('firebase-admin');

function initAdmin() {
  if (admin.apps.length) return admin.app();
  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
    })
  });
}

function normalizeUsername(raw) {
  return (raw || '').trim().toLowerCase().replace(/[^a-z0-9_\-]/g, '').slice(0, 20);
}

// Very small, deliberate emoji validator: exactly one grapheme, no bare
// letters/digits/punctuation smuggled in as a "profile pic." Uses the
// Extended_Pictographic Unicode property so any real emoji passes,
// including multi-codepoint ones (skin tones, ZWJ sequences like family
// emoji) — those are still ONE user-perceived character even though
// they're several JS string characters under the hood.
function isSingleEmoji(str) {
  if (!str) return false;
  const segments = [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(str)];
  if (segments.length !== 1) return false;
  return /\p{Extended_Pictographic}/u.test(segments[0].segment);
}

const MAX_PLAYLIST_ITEMS = 200;

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };
  }

  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'Account system is not configured yet.' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Bad request' }) };
  }

  const { action, token } = body;
  const username = normalizeUsername(body.username);

  if (!username || !token) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'Missing credentials.' }) };
  }

  initAdmin();
  const db = admin.firestore();
  const userRef = db.collection('nosirt_users').doc(username);

  try {
    const doc = await userRef.get();
    if (!doc.exists || doc.data().token !== token) {
      return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'Not authorized.' }) };
    }

    if (action === 'setAvatar') {
      const emoji = body.avatarEmoji;
      if (!isSingleEmoji(emoji)) {
        return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'Pick exactly one emoji.' }) };
      }
      await userRef.update({ avatarEmoji: emoji });
      return { statusCode: 200, body: JSON.stringify({ ok: true, avatarEmoji: emoji }) };
    }

    if (action === 'setDisplayName') {
      const displayName = (body.displayName || '').trim().slice(0, 20);
      if (displayName.length < 1) {
        return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'Name cannot be empty.' }) };
      }
      await userRef.update({ displayName });
      return { statusCode: 200, body: JSON.stringify({ ok: true, displayName }) };
    }

    if (action === 'setPlaylist') {
      const playlist = Array.isArray(body.playlist) ? body.playlist.slice(0, MAX_PLAYLIST_ITEMS) : [];
      await userRef.update({ playlist });
      return { statusCode: 200, body: JSON.stringify({ ok: true, playlist }) };
    }

    if (action === 'setSavedItems') {
      // v01.24 sharing slice: bookmarked recs/forum posts someone shared
      // with you — separate from playlist because these aren't directly
      // playable, just reference material worth keeping.
      const savedItems = Array.isArray(body.savedItems) ? body.savedItems.slice(0, MAX_PLAYLIST_ITEMS) : [];
      await userRef.update({ savedItems });
      return { statusCode: 200, body: JSON.stringify({ ok: true, savedItems }) };
    }

    // v01.26: user-owned show management
    // Shows are stored in nosirt_shows with owner=username and
    // isPublic flag. Only the owner can edit/delete their own shows.
    if (action === 'saveUserShow') {
      const show = body.show;
      if (!show || !show.id || !show.title) {
        return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'Invalid show data.' }) };
      }
      const showRef = db.collection('nosirt_shows').doc(show.id);
      const existing = await showRef.get();
      // Only allow if new or owner matches
      if (existing.exists && existing.data().owner !== username) {
        return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'Not your show.' }) };
      }
      const data = {
        ...show,
        owner: username,
        isPublic: !!show.isPublic,
        updatedAt: Date.now()
      };
      await showRef.set(data, { merge: false });
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    if (action === 'deleteUserShow') {
      const { showId } = body;
      if (!showId) return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'Missing showId.' }) };
      const showRef = db.collection('nosirt_shows').doc(showId);
      const existing = await showRef.get();
      if (!existing.exists || existing.data().owner !== username) {
        return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'Not your show.' }) };
      }
      await showRef.delete();
      // Also delete all episodes for this show
      const eps = await db.collection('nosirt_episodes').where('showId', '==', showId).get();
      const batch = db.batch();
      eps.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    if (action === 'toggleShowPublic') {
      const { showId, isPublic } = body;
      if (!showId) return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'Missing showId.' }) };
      const showRef = db.collection('nosirt_shows').doc(showId);
      const existing = await showRef.get();
      if (!existing.exists || existing.data().owner !== username) {
        return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'Not your show.' }) };
      }
      await showRef.update({ isPublic: !!isPublic });
      return { statusCode: 200, body: JSON.stringify({ ok: true, isPublic: !!isPublic }) };
    }

    // v01.35: Sandbox — user-created code/programs. Same ownership
    // pattern as shows: owner=username, isPublic flag, only the owner
    // (checked server-side, not just trusted from the client) can
    // write to their own creation. shortId is allocated client-side
    // (reuses the same allocateShortId()/registry pattern wireless.js
    // already uses) before this is ever called — this just persists
    // whatever fields were sent, the same way saveUserShow does.
    const MAX_SANDBOX_CODE_BYTES = 350000; // ~350KB of code+files text — generous for hand/AI-written HTML/JS/CSS, well under Firestore's 1MB doc cap once metadata is added
    if (action === 'saveSandboxCreation') {
      const creation = body.creation;
      if (!creation || !creation.id || !creation.title) {
        return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'Invalid creation data.' }) };
      }
      const codeSize = Buffer.byteLength(JSON.stringify(creation.code || '') + JSON.stringify(creation.files || []), 'utf8');
      if (codeSize > MAX_SANDBOX_CODE_BYTES) {
        return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'That creation is too large to save (350KB text limit). Large images/audio should be uploaded as assets, not pasted as text.' }) };
      }
      const ref = db.collection('nosirt_sandbox_creations').doc(creation.id);
      const existing = await ref.get();
      if (existing.exists && existing.data().owner !== username) {
        return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'Not your creation.' }) };
      }
      const data = {
        ...creation,
        owner: username,
        isPublic: existing.exists ? !!existing.data().isPublic : false, // publishing is a separate explicit action
        version: existing.exists ? (existing.data().version || 1) : 1,
        createdAt: existing.exists ? existing.data().createdAt : Date.now(),
        updatedAt: Date.now()
      };
      await ref.set(data, { merge: false });
      return { statusCode: 200, body: JSON.stringify({ ok: true, creation: data }) };
    }

    if (action === 'publishSandboxCreation') {
      const { creationId } = body;
      if (!creationId) return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'Missing creationId.' }) };
      const ref = db.collection('nosirt_sandbox_creations').doc(creationId);
      const existing = await ref.get();
      if (!existing.exists || existing.data().owner !== username) {
        return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'Not your creation.' }) };
      }
      const cur = existing.data();
      const version = (cur.version || 1) + (cur.isPublic ? 1 : 0); // first publish stays v1; re-publishing an update bumps it
      await ref.update({ isPublic: true, version, updatedAt: Date.now() });
      return { statusCode: 200, body: JSON.stringify({ ok: true, version }) };
    }

    if (action === 'unpublishSandboxCreation') {
      const { creationId } = body;
      const ref = db.collection('nosirt_sandbox_creations').doc(creationId);
      const existing = await ref.get();
      if (!existing.exists || existing.data().owner !== username) {
        return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'Not your creation.' }) };
      }
      await ref.update({ isPublic: false, updatedAt: Date.now() });
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    if (action === 'deleteSandboxCreation') {
      const { creationId } = body;
      if (!creationId) return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'Missing creationId.' }) };
      const ref = db.collection('nosirt_sandbox_creations').doc(creationId);
      const existing = await ref.get();
      if (!existing.exists || existing.data().owner !== username) {
        return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'Not your creation.' }) };
      }
      await ref.delete();
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    if (action === 'setSandboxWorld') {
      // Mirrors setPlaylist exactly — a simple array field on the
      // account's own doc. World entries are references (creationId +
      // addedAt), never a copy of the code, so an update to the
      // original creation is automatically what everyone with it
      // "installed" sees next time they open it.
      const MAX_WORLD_ITEMS = 300;
      const world = Array.isArray(body.world) ? body.world.slice(0, MAX_WORLD_ITEMS) : [];
      await userRef.update({ sandboxWorld: world });
      return { statusCode: 200, body: JSON.stringify({ ok: true, world }) };
    }

    if (action === 'saveUserEpisode') {
      const ep = body.episode;
      if (!ep || !ep.id || !ep.showId) {
        return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'Invalid episode data.' }) };
      }
      // Verify user owns the show
      const showRef = db.collection('nosirt_shows').doc(ep.showId);
      const show = await showRef.get();
      if (!show.exists || show.data().owner !== username) {
        return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'Not your show.' }) };
      }
      await db.collection('nosirt_episodes').doc(ep.id).set({ ...ep, owner: username }, { merge: false });
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    if (action === 'deleteUserEpisode') {
      const { episodeId, showId } = body;
      const showRef = db.collection('nosirt_shows').doc(showId);
      const show = await showRef.get();
      if (!show.exists || show.data().owner !== username) {
        return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'Not your show.' }) };
      }
      await db.collection('nosirt_episodes').doc(episodeId).delete();
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    // v01.27: admin-only — delete a user account entirely
    if (action === 'adminDeleteUser') {
      // Only the nosirt account (admin) can do this
      if (username !== 'nosirt') {
        return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'Not authorized.' }) };
      }
      const target = body.targetUsername;
      if (!target || target === 'nosirt') {
        return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'Invalid target.' }) };
      }
      // Verify the nosirt token
      const nosirtRef = db.collection('nosirt_users').doc('nosirt');
      const nosirtDoc = await nosirtRef.get();
      if (!nosirtDoc.exists || nosirtDoc.data().token !== token) {
        return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'Bad token.' }) };
      }
      // Delete the user doc
      await db.collection('nosirt_users').doc(target).delete();
      // Delete their presence doc if it exists
      const presenceSnap = await db.collection('nosirt_presence')
        .where('accountUsername', '==', target).get();
      const batch = db.batch();
      presenceSnap.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'Unknown action' }) };
  } catch (err) {
    console.error('account-update error:', err.message);
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'Something went wrong. Try again.' }) };
  }
};
