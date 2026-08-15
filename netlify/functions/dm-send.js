// netlify/functions/dm-send.js
//
// v01.24 — sends a DM. Server-verified (same token check as
// account-update.js) specifically so a message's "from" field can't be
// spoofed by writing straight to Firestore from devtools — unlike most
// of this site's collections, a DM claims to be privately from a
// specific person, so that claim needs to actually be checked.
//
// Called by dm.js via:
//   POST /.netlify/functions/dm-send
//   Body: { username, token, to, text, sharedCard }
//   Returns: { ok: true, message } or { ok: false, error }

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

const DM_MAX_LEN = 1000;

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };
  }
  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'Account system is not configured yet.' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (e) { return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Bad request' }) }; }

  const { token, text, sharedCard } = body;
  const from = normalizeUsername(body.username);
  const to = normalizeUsername(body.to);

  if (!from || !token) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'Missing credentials.' }) };
  }
  if (!to) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'Missing recipient.' }) };
  }
  if (from === to) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: "Can't DM yourself." }) };
  }
  const cleanText = (text || '').trim().slice(0, DM_MAX_LEN);
  if (!cleanText && !sharedCard) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'Empty message.' }) };
  }

  initAdmin();
  const db = admin.firestore();

  try {
    const senderDoc = await db.collection('nosirt_users').doc(from).get();
    if (!senderDoc.exists || senderDoc.data().token !== token) {
      return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'Not authorized.' }) };
    }
    const recipientDoc = await db.collection('nosirt_users').doc(to).get();
    if (!recipientDoc.exists) {
      return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'No account with that username.' }) };
    }

    const threadId = [from, to].sort().join('__');
    const now = Date.now();
    const id = 'dm' + now + Math.random().toString(36).slice(2, 8);
    const message = {
      id, threadId, participants: [from, to], from, to,
      fromDisplayName: senderDoc.data().displayName,
      fromAvatarEmoji: senderDoc.data().avatarEmoji || '🙂',
      text: cleanText,
      sharedCard: sharedCard || null,
      ts: now
    };

    await db.collection('nosirt_dms').doc(id).set(message);
    return { statusCode: 200, body: JSON.stringify({ ok: true, message }) };
  } catch (err) {
    console.error('dm-send error:', err.message);
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'Something went wrong. Try again.' }) };
  }
};
