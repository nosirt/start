// netlify/functions/check-password.js
//
// Server-side password check. Runs on Netlify's servers, NOT in the
// visitor's browser — so the real passwords (kept in Netlify env vars)
// are never sent down to the client. Only true/false ever comes back.
//
// Env vars this expects (set in Netlify dashboard, see README-PASSWORDS.md):
//   ADMIN_PASSWORD
//   PODCAST_PASSWORD
//   KEEP_PASSWORD

const PASSWORD_MAP = {
  admin_password: process.env.ADMIN_PASSWORD,
  podcast_password: process.env.PODCAST_PASSWORD,
  keep_password: process.env.KEEP_PASSWORD,
};

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Bad request' }) };
  }

  const { passwordType, inputValue } = body;

  if (!passwordType || typeof inputValue !== 'string') {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing fields' }) };
  }

  const realPassword = PASSWORD_MAP[passwordType];

  // Unknown passwordType, or env var not set on Netlify yet
  if (typeof realPassword !== 'string' || realPassword.length === 0) {
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: false, error: 'not_configured' }),
    };
  }

  const ok = inputValue.trim() === realPassword;

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok }),
  };
};
