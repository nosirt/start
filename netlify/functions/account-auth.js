// netlify/functions/account-auth.js
//
// v01.24 — server-side account signup/login for the new no-password user
// system. Runs on Netlify's servers so the actual token-issuing and
// token-checking logic can't be read or forged just by opening devtools
// on the client (unlike writing straight to Firestore from the browser,
// which this site does for everything else — appropriate for a scream
// board, not appropriate for "is this really the same person").
//
// HOW IT WORKS (deliberately simple, no password, matches the site's
// "fun small site" spirit rather than a real auth system):
//   - Signing up with a brand-new username generates a random token,
//     stores {username, token} server-side (Firestore, via Admin SDK),
//     and returns the token to the browser. The browser saves it in
//     localStorage — that saved token IS the account from then on.
//   - Logging in with an existing username only succeeds if the token
//     this browser already has saved matches what's on file. If this
//     browser has never had that username's token (different device,
//     cleared storage, or someone else's browser), login is refused —
//     it does NOT silently hand over someone else's account.
//   - This is honesty-based, not fortress-based: someone who really
//     wants to fake a token via devtools technically still can. What
//     this DOES stop is casual name collisions and by-accident logins
//     into a stranger's account. That trade-off is intentional here.
//
// Env vars required (same Firebase project already used client-side —
// see FIREBASE_ADMIN_SETUP.md for how to generate a service account):
//   FIREBASE_PROJECT_ID
//   FIREBASE_CLIENT_EMAIL
//   FIREBASE_PRIVATE_KEY   (paste with \n literal newlines preserved —
//                           Netlify's env var editor handles this fine,
//                           just don't manually strip the \n sequences)
//
// Called by accounts.js via:
//   POST /.netlify/functions/account-auth
//   Body: { action: 'signup'|'login'|'verify', username, token }
//   Returns: { ok: true, token, username, displayName, avatarEmoji, playlist }
//         or { ok: false, error: string }

const admin = require('firebase-admin');

function initAdmin() {
  if (admin.apps.length) return admin.app();
  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Netlify env vars sometimes escape newlines as literal "\n" text —
      // this unescapes them back into real newlines if that's happened.
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
    })
  });
}

function randomToken() {
  // 32 bytes of randomness, hex-encoded — plenty for this use case
  const bytes = require('crypto').randomBytes(32);
  return bytes.toString('hex');
}

function normalizeUsername(raw) {
  return (raw || '').trim().toLowerCase().replace(/[^a-z0-9_\-]/g, '').slice(0, 20);
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };
  }

  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: false, error: 'Account system is not configured yet.' })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Bad request' }) };
  }

  const { action, username: rawUsername, token } = body;
  const username = normalizeUsername(rawUsername);

  if (!username || username.length < 2) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'Username must be at least 2 characters (letters, numbers, _ and - only).' }) };
  }

  initAdmin();
  const db = admin.firestore();
  const userRef = db.collection('nosirt_users').doc(username);

  try {
    // v01.27: 'nosirt' is the reserved admin account — cannot be claimed
    // via normal signup. The only way in is via admin password.
    if (action === 'signup') {
      if (username === 'nosirt') {
        return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'That username is not available.' }) };
      }
      const existing = await userRef.get();
      if (existing.exists) {
        return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'That username is already taken.' }) };
      }
      const newToken = randomToken();
      const userData = {
        username,
        displayName: rawUsername.trim().slice(0, 20), // preserves the casing they typed, just not for uniqueness
        token: newToken,
        avatarEmoji: '🙂',
        playlist: [],
        savedItems: [], // v01.24 sharing slice: bookmarked recs/posts shared by others (playlist shares go straight into playlist instead, since those are directly playable)
        createdAt: Date.now()
      };
      await userRef.set(userData);
      return {
        statusCode: 200,
        body: JSON.stringify({ ok: true, token: newToken, username, displayName: userData.displayName, avatarEmoji: userData.avatarEmoji, playlist: [], savedItems: [] })
      };
    }

    if (action === 'login' || action === 'verify') {
      const doc = await userRef.get();
      if (!doc.exists) {
        return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'No account with that username. Try signing up instead.' }) };
      }
      const data = doc.data();
      if (!token || token !== data.token) {
        return {
          statusCode: 200,
          body: JSON.stringify({ ok: false, error: "That username exists, but this browser doesn't have its key. If this is your account on a new device, sorry — there's no recovery yet, since there's no password. Pick a different username, or find the device you signed up on." })
        };
      }
      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true, token: data.token, username: data.username,
          displayName: data.displayName, avatarEmoji: data.avatarEmoji || '🙂',
          playlist: data.playlist || [], savedItems: data.savedItems || []
        })
      };
    }

    // v01.27: admin-login — verifies the admin password, then signs into
    // (or auto-creates) the nosirt account and returns its token.
    // This is the ONLY way to access the nosirt account.
    if (action === 'admin-login') {
      const { adminPassword } = body;
      const expectedPassword = process.env.ADMIN_PASSWORD;
      if (!expectedPassword || adminPassword !== expectedPassword) {
        return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'Wrong password.' }) };
      }
      // Get or create the nosirt user doc
      const nosirtRef = db.collection('nosirt_users').doc('nosirt');
      const nosirtDoc = await nosirtRef.get();
      let nosirtToken;
      if (!nosirtDoc.exists) {
        nosirtToken = randomToken();
        await nosirtRef.set({
          username: 'nosirt',
          displayName: 'nosirt',
          token: nosirtToken,
          avatarEmoji: '🏰',
          playlist: [],
          savedItems: [],
          createdAt: Date.now(),
          isAdminAccount: true
        });
      } else {
        nosirtToken = nosirtDoc.data().token;
      }
      const d = nosirtDoc.exists ? nosirtDoc.data() : { displayName: 'nosirt', avatarEmoji: '🏰', playlist: [], savedItems: [] };
      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true, token: nosirtToken, username: 'nosirt',
          displayName: d.displayName || 'nosirt',
          avatarEmoji: d.avatarEmoji || '🏰',
          playlist: d.playlist || [], savedItems: d.savedItems || [],
          isAdminAccount: true
        })
      };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'Unknown action' }) };
  } catch (err) {
    console.error('account-auth error:', err.message);
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'Something went wrong. Try again.' }) };
  }
};
