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
