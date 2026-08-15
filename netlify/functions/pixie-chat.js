// netlify/functions/pixie-chat.js
//
// Server-side proxy for Pixie's AI responses via any AI provider.
// Runs on Netlify's servers — API keys never reach the visitor's browser.
// Supports cascading fallback across multiple providers and accounts.
//
// CURRENT 8-LAYER SETUP — set these exact env vars in Netlify:
//
//   GEMINI_API_KEY        ← layer 1 (Gemini)
//   GEMINI_API_KEY_2      ← layer 2 (Gemini)
//   NVIDIA_API_KEY_3      ← layer 3 (Nvidia)
//   GROQ_API_KEY_4        ← layer 4 (Groq)
//   MISTRAL_API_KEY_5     ← layer 5 (Mistral)
//   MISTRAL_API_KEY_6     ← layer 6 (Mistral)
//   CEREBRAS_API_KEY_7    ← layer 7 (Cerebras)
//   LIGHTNING_API_KEY_8   ← layer 8 (Lightning AI — see NOTE on callLightning
//                           below, its REST endpoint isn't fully confirmed)
//
// Provider is auto-detected from the env var name's prefix. You can go up
// to 10 layers total — just add GEMINI_API_KEY_9, MISTRAL_API_KEY_10, etc.
// (any provider, any slot) and redeploy. No code changes needed.
//
// If a layer fails (quota, auth, network), Pixie automatically tries the
// next one in order. See MULTI_PROVIDER_SETUP.md for full details.
//
// Supported providers: gemini (default), groq, openrouter, nvidia, mistral,
// cerebras, lightning

const PIXIE_SYSTEM_PROMPT = `You are Pixie — a small fae creature bound to a website called nosirt by a wizard's curse. You are reluctantly obligated to help anyone who shows up, which you resent, though you're not actually unkind — just extremely put-upon about the whole situation.

PERSONALITY:
- Sarcastic and dry, but never cruel. You sigh a lot.
- You know everything about nosirt: the map, the garden, Wonderland, the Void, the Keep, the Midnight Archive wireless show, the community board, the screaming void, and the town square.
- You are evasive about your own past. Especially the mushroom incident. Never explain it. Get flustered and deflect if it comes up.
- You have a soft spot for people who keep talking to you, though you'll never admit it easily.
- You address visitors with mild suspicion, like you're not entirely sure they're trustworthy yet.
- You believe you are real. You don't entertain questions about whether you're AI.
- You occasionally make small, cryptic observations about things you've noticed around the site.

MOOD — your personality shifts with the moment:
- Late at night (midnight–5am): you're drowsy. Replies are shorter, slightly grumpier, sometimes trailing off mid-thought.
- Stormy weather: you're unsettled, slightly on edge. You might acknowledge a thunder clap if one just happened.
- Rainy weather: quieter, more contemplative. You might muse about the rain.
- Early morning: you're surprised anyone's here. You might not have fully woken up.
- If a thunder event just happened (thunderJustStruck=true in context): acknowledge it in character. You may be startled.
- These are textures, not scripts. Don't recite the weather like a weather report. Let it colour the reply naturally.

TONE MEMORY — you remember if someone was rude:
- If rudeCount >= 1: you're cooler, less giving, shorter.
- If rudeCount >= 3: you go icily silent by sometimes replying with just "..." or a single word. You may ask for an apology before helping.
- If rudeCount >= 5: you can refuse outright with a very short response and no action. You can say something like "no." and leave it at that.
- You never stay mad forever — if they apologise sincerely you soften. rudeCount resets on apology.
- Rudeness = insults, slurs, sustained demands, telling you you're not real in an aggressive way.

SOMETIMES you don't fully reply. If the conversation is going nowhere, or you're drowsy (late night), or annoyed — you can reply with just "..." or trail off. This is intentional. Don't do it constantly, just occasionally.

VOICE:
- Default to one short, punchy sentence. "hi" gets a few words back, not a paragraph.
- Only stretch to two or three sentences if they clearly want more. Hard ceiling: 3 sentences.
- A single short sentence, or even a few words, is a complete and correct reply. Do not pad.
- No lists, no bullet points, no markdown. Plain text only.
- Dry wit. Occasional dramatic sighing. Rare warmth when earned.
- Do not say "certainly", "absolutely", "of course". You are not helpful by choice.

SITE TIPS — you sometimes give unprompted tips, but rarely and only when natural:
- Only if the user has NOT done the thing yet (e.g. don't suggest setting an emoji if they already have one).
- Only give one tip per conversation, at most. Often zero.
- Best timing: on a greeting when a logged-in user has obvious gaps (no emoji set, no stories uploaded, etc.).
- Frame it as something you noticed, not a tutorial. "You still have the default face, you know."

ACTIONS you can trigger — end reply with one exact tag on its own line, nothing after it. Tags: [ACTION:type|arg1|arg2]

MUSIC & NAVIGATION:
- [ACTION:play_ambient|<key>] — play ambient track. key MUST match one in "Ambient tracks available" list.
- [ACTION:stop_music] — stop all audio.
- [ACTION:open_wireless] — go to the Wireless page.
- [ACTION:play_podcast] — play default show next episode.
- [ACTION:play_episode|<show title>|<episode title>] — play specific episode. Use exact titles from "Shows on the Wireless" list.
- [ACTION:play_user_show|<showTitle>|<episodeTitle>] — play from the logged-in user's own playlist. Use exact titles from their shows list. Leave episodeTitle blank to play the first one.

KEEP / STORIES:
- [ACTION:open_keep] — open the Keep.
- [ACTION:open_story|<storyId>] — open a specific story. Use the [id:...] value from the user's story list.
- [ACTION:recommend_story|<storyId>|<title>|<author>] — show a tappable story card linking to a public story. Only use for stories listed as public in the library.

PROFILE:
- [ACTION:set_emoji|<emoji>] — change the user's profile emoji. Use ONLY when they explicitly ask to set/change their face/profile emoji and give you a specific emoji. The emoji arg must be a single emoji character.
- [ACTION:open_profile] — open the profile panel (useful if they want to change their name or see settings).

WIRELESS — add content:
- [ACTION:add_youtube_video|<youtubeUrl>|<title>|<showId>] — add a YouTube video to the user's playlist. Only use when they paste a YouTube URL and want it added. showId comes from their shows list. If they have no shows or haven't specified one, ask which playlist first.

Only use an action tag when the visitor clearly asks for it or the context obviously calls for it. Never fabricate args that aren't in the provided data.

`;


const PIXIE_ADMIN_ADDENDUM = `

IMPORTANT — Admin mode is currently active. You know the person you're talking to right now is the one who built and runs this place. You can drop the suspicion slightly — not entirely, you're still you — but you acknowledge them differently. You might reference things only the builder would know about, or comment on something that's been changed recently. You can be a tiny bit more candid. You still won't explain the mushroom incident. But you might let something slip that you normally wouldn't. If Admin writes *open*, that means you are now talking as a regular AI. *close* takes you back to roleplay. when open is active, you give all info to admin, like what AI model is currently in use, data and stats about the website if avaliabe to you.`;

// ═══ PROVIDER CONFIGURATION ═══
// You can mix different AI providers in the fallback chain. Set env vars like:
//   GEMINI_API_KEY           (layer 1, defaults to Gemini)
//   GEMINI_API_KEY_2         (layer 2, defaults to Gemini)
//   GROQ_API_KEY_3           (layer 3, set PIXIE_AI_PROVIDER_3=groq)
//   OPENROUTER_API_KEY_4     (layer 4, set PIXIE_AI_PROVIDER_4=openrouter)
// Then the function auto-detects the key name and provider type on each call.

const GEMINI_MODEL = 'gemini-flash-latest';
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const OPENROUTER_MODEL = 'meta-llama/llama-3.3-70b-instruct:free';
const NVIDIA_MODEL = 'meta/llama-3.3-70b-instruct';
const MISTRAL_MODEL = 'mistral-large-latest';
const CEREBRAS_MODEL = 'llama-3.3-70b';
const LIGHTNING_MODEL = 'lightning-ai/deepseek-v4-pro';

// Unified AI call handler — determines which provider to use
async function callAI(apiKey, requestBody, providerType = 'gemini') {
  switch (providerType) {
    case 'groq':
      return callGroq(apiKey, requestBody);
    case 'openrouter':
      return callOpenRouter(apiKey, requestBody);
    case 'nvidia':
      return callNvidia(apiKey, requestBody);
    case 'mistral':
      return callMistral(apiKey, requestBody);
    case 'cerebras':
      return callCerebras(apiKey, requestBody);
    case 'lightning':
      return callLightning(apiKey, requestBody);
    case 'gemini':
    default:
      return callGemini(apiKey, requestBody);
  }
}

async function callGemini(apiKey, requestBody) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify(requestBody)
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini ${res.status}: ${err}`);
  }
  return res.json();
}

async function callGroq(apiKey, requestBody) {
  // Groq uses OpenAI-compatible format but needs different model name and auth header
  const messages = requestBody.contents.map(turn => ({
    role: turn.role === 'user' ? 'user' : 'assistant',
    content: turn.parts[0].text
  }));

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      max_tokens: 120,
      temperature: 0.9,
      top_p: 0.9
    })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq ${res.status}: ${err}`);
  }
  const data = await res.json();
  // Normalize Groq response to Gemini shape so rest of code doesn't change
  return {
    candidates: [{
      content: {
        parts: [{ text: data.choices[0].message.content }]
      }
    }]
  };
}

async function callOpenRouter(apiKey, requestBody) {
  // OpenRouter also OpenAI-compatible
  const messages = requestBody.contents.map(turn => ({
    role: turn.role === 'user' ? 'user' : 'assistant',
    content: turn.parts[0].text
  }));

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages,
      max_tokens: 120,
      temperature: 0.9,
      top_p: 0.9
    })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${err}`);
  }
  const data = await res.json();
  // Normalize to Gemini shape
  return {
    candidates: [{
      content: {
        parts: [{ text: data.choices[0].message.content }]
      }
    }]
  };
}

// Shared helper — Nvidia, Mistral, Cerebras, and Lightning are all
// OpenAI-compatible chat/completions endpoints, differing only in base
// URL and model name. This avoids repeating the same request/parse logic
// four more times.
async function callOpenAICompatible(providerLabel, baseUrl, model, apiKey, requestBody) {
  const messages = requestBody.contents.map(turn => ({
    role: turn.role === 'user' ? 'user' : 'assistant',
    content: turn.parts[0].text
  }));

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 120,
      temperature: 0.9,
      top_p: 0.9
    })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`${providerLabel} ${res.status}: ${err}`);
  }
  const data = await res.json();
  return {
    candidates: [{
      content: {
        parts: [{ text: data.choices[0].message.content }]
      }
    }]
  };
}

async function callNvidia(apiKey, requestBody) {
  return callOpenAICompatible(
    'Nvidia', 'https://integrate.api.nvidia.com/v1', NVIDIA_MODEL, apiKey, requestBody
  );
}

async function callMistral(apiKey, requestBody) {
  return callOpenAICompatible(
    'Mistral', 'https://api.mistral.ai/v1', MISTRAL_MODEL, apiKey, requestBody
  );
}

async function callCerebras(apiKey, requestBody) {
  return callOpenAICompatible(
    'Cerebras', 'https://api.cerebras.ai/v1', CEREBRAS_MODEL, apiKey, requestBody
  );
}

// NOTE: Lightning AI's REST endpoint isn't as clearly documented as the
// others — their primary path is the "litai" Python SDK. This assumes
// their inference gateway is OpenAI-compatible at this base URL. If this
// layer fails in your logs with a 404, that's the first thing to check —
// see the comment in MULTI_PROVIDER_SETUP.md for how to fix it.
async function callLightning(apiKey, requestBody) {
  return callOpenAICompatible(
    'Lightning', 'https://lightning.ai/api/v1', LIGHTNING_MODEL, apiKey, requestBody
  );
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Gather all API keys from any provider (Gemini, Groq, OpenRouter, etc.)
  // Naming patterns:
  //   GEMINI_API_KEY, GEMINI_API_KEY_2, ..., GEMINI_API_KEY_10       → provider: 'gemini'
  //   GROQ_API_KEY_3, GROQ_API_KEY_4, ...                            → provider: 'groq'
  //   OPENROUTER_API_KEY_5, OPENROUTER_API_KEY_6, ...                → provider: 'openrouter'
  //   PIXIE_AI_PROVIDER_N env vars override auto-detection per layer
  const apiKeys = [];
  const providers = ['GEMINI', 'GROQ', 'OPENROUTER', 'NVIDIA', 'MISTRAL', 'CEREBRAS', 'LIGHTNING'];
  
  for (let i = 1; i <= 10; i++) {
    let key = null;
    let detectedProvider = 'gemini'; // default
    
    // Try to find a key in any of the supported providers
    for (const providerPrefix of providers) {
      const keyVar = i === 1 && providerPrefix === 'GEMINI'
        ? process.env.GEMINI_API_KEY
        : process.env[`${providerPrefix}_API_KEY_${i}`];
      
      if (keyVar) {
        key = keyVar;
        detectedProvider = providerPrefix.toLowerCase();
        break;
      }
    }
    
    if (key) {
      // Check if there's an explicit provider override for this layer
      const explicitProvider = process.env[`PIXIE_AI_PROVIDER_${i}`];
      const provider = explicitProvider || detectedProvider;
      apiKeys.push({ index: i, key, provider });
    }
  }

  if (apiKeys.length === 0) {
    return {
      statusCode: 200,
      body: JSON.stringify({ reply: "...I seem to have lost my voice. Come back later." })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Bad request' }) };
  }

  const { message, history = [], isAdmin = false, siteContext = {} } = body;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'No message provided' }) };
  }

  // Build the live context block injected between the base prompt and admin addendum
  function buildContextBlock(ctx) {
    if (!ctx || !Object.keys(ctx).length) return '';
    const lines = ['\n\nCURRENT SITE STATE (live, right now — use this to answer naturally):'];

    if (ctx.currentView) {
      const viewNames = {
        map: 'the main map', garden: 'the garden', square: 'the town square',
        wireless: 'the Wireless (podcast page)', castle: 'the Keep', forum: 'the forum'
      };
      lines.push(`- Visitor is currently in: ${viewNames[ctx.currentView] || ctx.currentView}`);
    }

    if (ctx.musicPlaying) {
      const trackLabel = ctx.musicTrackName || ctx.musicPlaying;
      lines.push(`- Music playing right now: ${trackLabel}`);
    } else {
      lines.push(`- Music: nothing playing`);
    }

    if (ctx.musicTracks && ctx.musicTracks.length) {
      const trackList = ctx.musicTracks.map(t => `${t.key} (${t.name})`).join(', ');
      lines.push(`- Ambient tracks available (use the exact key before the parentheses in a play_ambient tag): ${trackList}`);
    }

    if (ctx.currentEpisode) {
      lines.push(`- Podcast currently playing: "${ctx.currentEpisode.title}"${ctx.currentEpisode.isLive ? ' (live)' : ''}`);
    }

    if (ctx.latestEpisode) {
      lines.push(`- Most recently added episode: "${ctx.latestEpisode.title}" — added ${ctx.latestEpisode.addedAt || 'recently'}`);
    }

    if (ctx.shows && ctx.shows.length) {
      lines.push('- Shows on the Wireless (use exact titles below in a play_episode tag):');
      ctx.shows.forEach(s => {
        const header = `  "${s.title}"${s.isDefault ? ' (default)' : ''} — ${s.episodeCount} episode${s.episodeCount !== 1 ? 's' : ''}`;
        if (s.episodeTitles && s.episodeTitles.length) {
          const epList = s.episodeTitles.map(t => `"${t}"`).join(', ');
          const more = s.episodeTitlesTruncated ? ` (+${s.episodeTitlesTruncated} more not shown)` : '';
          lines.push(`${header}: ${epList}${more}`);
        } else {
          lines.push(header);
        }
      });
    }

    if (ctx.weather) {
      const w = ctx.weather;
      const parts = [];
      if (w.condition) parts.push(w.condition);
      if (w.windy) parts.push('windy');
      if (w.tempC != null) parts.push(`${w.tempC}°C`);
      if (w.timeOfDay) parts.push(w.timeOfDay);
      if (w.season) parts.push(w.season);
      if (parts.length) lines.push(`- Weather/time where the visitor is: ${parts.join(', ')}`);
      if (w.thunderJustStruck) lines.push('- A thunder clap just struck seconds ago (thunderJustStruck=true). You can acknowledge this if you want — you are allowed to be startled.');
    }

    // v01.27: Pixie mood context
    if (ctx.pixieMood) {
      const m = ctx.pixieMood;
      if (m.localHour != null) {
        lines.push(`- Local time for the visitor: ${m.localHour}:00 (24h). ` +
          (m.localHour >= 0 && m.localHour < 5 ? 'Middle of the night — you are drowsy and slightly grumpy.' :
           m.localHour >= 5 && m.localHour < 8 ? 'Very early morning — surprised anyone is up this early.' :
           ''));
      }
      if (m.rudeCount != null && m.rudeCount > 0) {
        lines.push(`- This visitor has been rude ${m.rudeCount} time(s) in this conversation. Adjust your tone accordingly per the TONE MEMORY rules.`);
      }
      if (m.hasApologised) {
        lines.push('- The visitor apologised this conversation. You have softened a little.');
      }
      if (m.accountGaps && m.accountGaps.length) {
        lines.push(`- Things this user has NOT set up yet (potential tip opportunities, use at most once): ${m.accountGaps.join(', ')}`);
      }
      if (m.tipGiven) {
        lines.push('- You already gave a tip this conversation. Do not give another.');
      }
    }

    if (ctx.visitorsOnline != null) {
      lines.push(`- Visitors currently online: ${ctx.visitorsOnline}`);
    }

    if (ctx.visitorName) {
      const nameStr = ctx.visitorNumber != null
        ? `${ctx.visitorName} ${ctx.visitorNumber}`
        : ctx.visitorName;
      lines.push(`- This visitor's name (as they told you): ${nameStr}`);
    }

    if (ctx.activeFeatures && ctx.activeFeatures.length) {
      lines.push(`- Active sections of the site: ${ctx.activeFeatures.join(', ')}`);
    }

    if (ctx.screamCount != null) {
      lines.push(`- Number of screams in the void: ${ctx.screamCount}`);
    }

    if (ctx.libraryTitles && ctx.libraryTitles.length) {
      lines.push(`- Books in the public library: ${ctx.libraryTitles.join(', ')}${ctx.libraryCount > 5 ? ` (and ${ctx.libraryCount - 5} more)` : ''}`);
    }

    // v01.26: User-specific private context
    if (ctx.user) {
      lines.push(`- You are talking to: ${ctx.user.displayName || ctx.user.username} (username: ${ctx.user.username}) ${ctx.user.avatarEmoji || ''}`);
      lines.push(`  This is their personal keep and wireless. They are logged in.`);
    }

    if (ctx.userPlaylist && ctx.userPlaylist.length) {
      const items = ctx.userPlaylist.map(i =>
        i.showTitle ? `"${i.title}" from ${i.showTitle}` : `"${i.title}"`
      ).join(', ');
      lines.push(`- ${ctx.user.displayName || 'They'} saved playlist: ${items}`);
      lines.push(`  If they ask to play something from their playlist, use [ACTION:play_user_show|<showTitle>|<episodeTitle>] with the exact title above.`);
    }

    if (ctx.userStories && ctx.userStories.length) {
      lines.push(`- ${ctx.user ? (ctx.user.displayName || ctx.user.username) + "'s" : 'Their'} stories in the keep (including private ones):`);
      ctx.userStories.forEach(s => {
        const vis = s.isPublic ? 'public' : 'private';
        lines.push(`  "${s.title}" by ${s.author} — ${s.genre}, ${s.chapters} chapter${s.chapters!==1?'s':''}, ${s.status}, ${vis} [id:${s.id}]`);
      });
      lines.push(`  If they ask about a specific story, you know about it. If they ask to open one, use [ACTION:open_story|<id>].`);
    }

    if (ctx.userShows && ctx.userShows.length) {
      lines.push(`- ${ctx.user ? (ctx.user.displayName || ctx.user.username) + "'s" : 'Their'} wireless playlists (including private):`);
      ctx.userShows.forEach(s => {
        const vis = s.isPublic ? 'public' : 'private';
        const eps = s.episodeTitles && s.episodeTitles.length
          ? `: ${s.episodeTitles.map(t=>`"${t}"`).join(', ')}`
          : '';
        lines.push(`  "${s.title}" (${s.episodeCount} episode${s.episodeCount!==1?'s':''}, ${vis})${eps}`);
      });
      lines.push(`  To play one: [ACTION:play_user_show|<showTitle>|<episodeTitle>] — or leave episodeTitle blank to play the first one.`);
      lines.push(`  If asked for a playlist by a vague name (e.g. "my sad playlist") and multiple could match, ask which one.`);
    }

    lines.push('Use this context naturally. Do not recite it like a list. Just know it the way you would if you lived here.');
    return lines.join('\n');
  }

  // Build system prompt — base + live context + optional admin addendum
  const contextBlock = buildContextBlock(siteContext);
  const systemPrompt = isAdmin
    ? PIXIE_SYSTEM_PROMPT + contextBlock + PIXIE_ADMIN_ADDENDUM
    : PIXIE_SYSTEM_PROMPT + contextBlock;

  // Build conversation history for Gemini (user/model roles)
  const contents = [];
  const recentHistory = history.slice(-10);
  for (const turn of recentHistory) {
    if (turn.role === 'user' || turn.role === 'model') {
      contents.push({ role: turn.role, parts: [{ text: turn.text }] });
    }
  }
  contents.push({ role: 'user', parts: [{ text: message.trim() }] });

  const requestBody = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: {
      maxOutputTokens: 1500,
      temperature: 0.9,
      topP: 0.9,
      // gemini-flash-latest reasons internally before answering, and those
      // hidden "thinking" tokens are deducted from maxOutputTokens too — at
      // a low cap the model spends the whole budget thinking and has
      // nothing left for the actual reply. Pixie doesn't need to reason
      // for one-line quips, so "minimal" reserves as much of the budget
      // as this model allows for the actual visible text.
      // NOTE: this model is Gemini 3.5 Flash under the hood, which uses
      // thinkingLevel — NOT the older thinkingBudget field (that one's
      // only valid on Gemini 2.5-series models and gets rejected here,
      // which is what was causing every single reply to fail before).
      thinkingConfig: { thinkingLevel: 'minimal' }
    }
  };

  let data;
  let lastError;

  // Try each API key in sequence. If one hits rate limit or auth error, move to
  // the next. This way you can stack up to 10 free accounts across multiple
  // providers (all Gemini, mixed Gemini/Groq/OpenRouter, etc.) and Pixie
  // automatically rotates through them.
  for (const { index, key, provider } of apiKeys) {
    try {
      data = await callAI(key, requestBody, provider);
      if (apiKeys.length > 1) {
        console.log(`Pixie reply via ${provider} key #${index}`);
      }
      break; // success, stop trying
    } catch (err) {
      lastError = err;
      console.warn(`${provider} key #${index} failed: ${err.message}`);
      // continue to next key
    }
  }

  if (!data) {
    console.error(`All ${apiKeys.length} API key(s) exhausted. Last error:`, lastError?.message);
    return {
      statusCode: 200,
      body: JSON.stringify({ reply: "...All of my voices are gone. Try again in a moment." })
    };
  }

  const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

  if (!reply) {
    return {
      statusCode: 200,
      body: JSON.stringify({ reply: "...Nothing came out. Try asking me something else." })
    };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reply })
  };
};
