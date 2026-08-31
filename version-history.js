/* ============================================================
   VERSION-HISTORY.JS — admin changelog data

   Requires: core.js (for CURRENT_VERSION consumers elsewhere)
   Exposes: VERSION_HISTORY
   ============================================================ */

const VERSION_HISTORY = [
  {
    version: '01.34',
    date: '8/2026',
    changes: [
      'NEW: permanent short-id deep-link system for the wireless — every show and every episode now gets a random, never-reused 5-digit id the moment it\'s created, tracked forever in two dedicated Firestore registries (nosirt_show_ids, nosirt_episode_ids) so a code can never be handed out twice even after the show/episode it pointed to is deleted or renamed',
      'NEW URLs: /wireless/{showId} and /wireless/{showId}/{episodeId} for public playlists; /{username}/wireless/{showId} and /{username}/wireless/{showId}/{episodeId} for private ones — only resolve for the logged-in owner (or admin), everyone else gets bounced to the wireless home without confirming the playlist even exists. The same show becomes reachable at the plain /wireless/{id} form automatically the moment it\'s made public — same id, just a second valid path to it',
      'NEW: /chat, /chat/global, /chat/pixie, and /chat/{username} (opens a DM with that user, from whoever is currently signed in)',
      'Browsing the wireless normally now keeps the address bar in sync automatically (via replaceState, so skipping through episodes doesn\'t flood the back button with one entry per track) — no separate "get link" step, whatever you\'re looking at IS the shareable link',
      'Existing shows/episodes from before this update get their ids backfilled automatically the next time an admin session loads the site — regular visitors don\'t trigger this, so it won\'t hammer Firestore from every tab',
      'NOTE: this relies on direct client Firestore writes to the two new id-registry collections, same pattern the rest of the show/episode system already uses — Firestore security rules need to permit writes to nosirt_show_ids / nosirt_episode_ids for this to work in production',
      'Version bumped to 01.34'
    ]
  },
  {
    version: '01.33',
    date: '8/2026',
    changes: [
      'AESTHETIC PASS (phase 1 of 2 — chat + wireless player this round, URL system next): reworked chat/DM/Pixie toward an iOS Messages feel — real speech bubbles with asymmetric corner radius (soft "tail" toward the sender, the same convention iOS itself uses now) instead of flat blockquote-style boxes with a colored border, frosted glass panel chrome instead of near-opaque black, a pill-shaped segmented tab control instead of underline tabs, bigger touch targets throughout (44px minimum)',
      'FIX: sending a chat message closed the keyboard on mobile, which meant the chat area kept resizing every time you sent something — root cause was tapping the send button naturally blurs whatever input was focused; added a mousedown guard on all three send buttons (global chat, DM, Pixie) so the keyboard now stays open through sends',
      'NEW: swipe-down-to-dismiss on the chat panel — the little grabber handle at the top existed visually before but did nothing when dragged; it now actually closes the panel with a real drag gesture, scoped to just the handle so it never fights with scrolling the message list',
      'FIX: episode rows in the wireless player only got their rounded "card" look on :hover — which never fires on touch devices, so every row looked like a flat, divided list on mobile except whichever one was currently playing. Every row is a proper rounded card now regardless of hover/touch',
      'Refined wireless player controls to match — bigger seek handle, glass-backed mini-player, bigger admin control tap targets',
      'Version bumped to 01.33'
    ]
  },
  {
    version: '01.32',
    date: '8/2026',
    changes: [
      'CRITICAL FIX: episodes on the wireless page were unclickable 100% of the time — renderEpisodes() built the click handler as onclick="loadEpisode(${JSON.stringify(ep)})", and JSON always opens with {" which prematurely closes the onclick="..." attribute (both use double quotes). The exact same bug existed on the "add to playlist" and "share to chat" buttons. All three now use ID-based lookups (loadEpisodeById, shareEpisodeToChatById, addEpisodeToPlaylistById) — this matches the pattern the working month-old version used and explains most of the "nothing happens when I click things" reports.',
      'FIX: the "podcast" quick-play button (sounds modal) and the wireless page could load completely different things — pickDefaultEpisode() only checked S.episodes, which is scoped to whichever show is currently open. If no show had been opened yet, it always returned nothing. Now resolves a default show first (and searches saved progress across ALL shows) so it always finds something sensible.',
      'FIX: added one canonical startOrResumePodcast() — the sounds-modal "Wireless" option and the mini-player both call this now instead of each keeping their own copy of the resume/pick/navigate logic, so they can\'t diverge again.',
      'FIX: ambient tracks (lofi/dark/ancient stream URLs) could go silent after the first track switch — the Web Audio GainNode routing never resumed a suspended AudioContext (common after tab backgrounding), so later plays looked successful but produced no sound. Now resumes on every track switch and on tab visibility change.',
      'FIX: the ±10s skip buttons could skip forever instead of once — pointerdown AND touchstart both fire for a single tap on touch devices, so the hold-repeat interval got created twice and the first one was orphaned (never cleared) once the second overwrote the same variable. Removed the redundant touch listeners; Pointer Events alone already cover touch/mouse/pen. Same duplicate-binding pattern removed from the seek bar for consistency.',
      'FIX: starting the podcast often needed two taps — playVideo() from onReady fires after the video iframe\'s own network round-trip, which can land outside the browser\'s "this is a direct user gesture" window on the very first play of a session, so it would silently sit paused. Added a watchdog that detects this and retries automatically on the next tap anywhere, so one tap on "podcast" is now enough (and, combined with the pickDefaultEpisode fix above, plays the first/oldest episode immediately when there\'s no saved progress).',
      'FIX: handleLiveBadgeClick() (the dedicated Midnight Archive shortcut) could get silently redirected to a different show — it explicitly sets the current show to Midnight Archive, but then called the general pickDefaultEpisode(), which follows a saved "resume" position into whatever show that was, undoing the line right above it. Split into pickEpisodeWithinCurrentShow() (never leaves the show that\'s already set — used by the Midnight Archive badge) vs pickDefaultEpisode() (free to resolve/switch shows — used by the generic "start the podcast" entry points).',
      'FIX: the now-playing title could visually overflow onto the row below it ("double-stacked" look) — it\'s a flex child with no min-width set, so nowrap+ellipsis truncation never actually engaged (a classic flexbox gotcha: flex items default to min-width:auto, which lets nowrap content overflow instead of truncating). Added min-width:0.',
      'FIX: the now-playing title could visually overflow onto the row below it ("double-stacked" look) — it\'s a flex child with no min-width set, so nowrap+ellipsis truncation never actually engaged (a classic flexbox gotcha: flex items default to min-width:auto, which lets nowrap content overflow instead of truncating). Added min-width:0.',
      'FIX: the floating Pixie icon on the map could not be tapped to open chat — same double-binding root cause as the player fixes above: pointerup fires before touchend for the same tap, so the document-level pointerup handler cleared pixieDragging first, and by the time touchend ran its own guard clause it always bailed out before reaching openPixieDmThread(). Removed the redundant touch listeners; the tap-to-open check now lives in pointerup where it actually runs.',
      'FIX: Pixie AI fallback chain was silently burning through several dead layers on every message — GEMINI_MODEL (gemini-flash-latest) and GROQ_MODEL (llama-3.3-70b-versatile, deprecated by Groq Aug 16 2026) were both pointing at broken/deprecated model IDs, and Cerebras\'s free-tier catalog had been pruned down to just two models, orphaning CEREBRAS_MODEL (llama-3.3-70b) too. Updated all three to current, verified-working IDs (gemini-2.5-flash, openai/gpt-oss-120b, gpt-oss-120b). This is why replies had gone from instant to several seconds — every message was timing out through 2-3 dead layers first. NVIDIA/MISTRAL/LIGHTNING left unchanged (no evidence found that those specific IDs are currently broken) — worth spot-checking those against each provider\'s console periodically, since these free-tier catalogs churn without notice.',
      'NEW: admin-only custom directive system — while admin is unlocked, any message wrapped in (...) sets a standing instruction sent with every future Pixie call, taking priority over the base persona until replaced by another (...) message. Nothing about the wording is hardcoded; the model interprets whatever text is inside the parens directly, so "(get out of character)" and "(be in character)" both just work as plain instructions rather than being special-cased commands. The existing (open)/(close) dev-mode toggle is unchanged and still takes priority as a dedicated command.',
      'Version bumped to 01.32'
    ]
  },
  {
    version: '01.31',
    date: '8/2026',
    changes: [
      'FIX: Wireless video player was permanently stuck invisible — #wp-stage never left "wave" mode because toggleWaveVideo(), toggleTheater() and toggleFullscreen() were wired to buttons but did not exist anywhere in the codebase. All three implemented.',
      'FIX: the entire player control layer was missing — togglePlayPause, bindSeekBar (click+drag to seek), bindHoldButton (hold-to-fast-skip on ±10s), the wave visualizer (setupWaveCanvas/drawWave/startWave/stopWave), seekBarUpdateLoop, showWpControls and updateModeLabel were all called on load but never defined. Implemented all of them.',
      'FIX: added onError handling to the YouTube player — a private/deleted/embed-restricted video now auto-skips to the next episode with a toast instead of silently getting stuck',
      'FIX: window.ytPlayer / window.currentEpisode are now explicitly synced — top-level `let` bindings never attached to window, so background-audio.js\'s iOS keepalive resume checks (visibilitychange + SW periodic wake) were silently no-ops',
      'FIX: signed-in non-admin users could not actually create a new show/playlist — openShowForm() hard-required admin unlock for the "new show" case even though openUserShowForm() and saveShowForm() both already had full non-admin support built in',
      'FIX: removed a duplicate showConfirmModal() definition — the dead one (Promise-based) was silently shadowed by a second, incompatible one, which made confirmToggleShowPublic() ("make playlist public") resolve and bail before the user could ever confirm',
      'FIX: selecting "The Wireless" from the sounds/music modal did nothing but relabel the now-playing text if no episode had loaded yet this session — it now resumes the last-played episode in the background, or opens the wireless page to pick one if nothing exists yet',
      'NEW: Spotify-style persistent mini-player in the top music bar — prev/play-pause/next + title, reachable from any page once an episode has been loaded, dims (not hides) when podcast is not the active audio source',
      'Version bumped to 01.31'
    ]
  },
  {
    version: '01.30',
    date: '8/2025',
    changes: [
      'Wireless: toggleAddEpisode() added — + add button now opens/closes add panel correctly',
      'Wireless: logged-in users bypass the podcast password gate on their own shows',
      'Wireless: + add button hidden for non-owners, shown dynamically when viewing own show',
      'Wireless: shuffle button added — 🔀 icon in player, picks random episode on auto-advance',
      'Wireless: nextEpisode wraps around (last → first), prevEpisode wraps around (first → last)',
      'Wireless: per-episode progress saved every 5s during playback (localStorage)',
      'Wireless: comments section now opens automatically when entering a show',
      'Wireless: loadEpisode opens comments for that specific episode',
      'Wireless: show owners (not just admin) can edit show description',
      'Wireless: show description edit button visible to owners, not just admin',
      'Music: openMusicModal now highlights the currently playing track',
      'Background audio: background-audio.js added with 3-layer iOS keepalive (AudioContext ping, silent WAV loop, SW periodic sync)',
      'Background audio: sw.js updated with periodicsync handler',
      'Version bumped to 01.30'
    ]
  },
  {
    version: '01.29',
    date: '8/2025',
    changes: [
      'Wireless: renderEpisodes() written — episodes now display with play highlight, per-episode progress bar, reorder (▲▼) buttons, edit/delete for owners, +playlist and share for users',
      'Wireless: add episode form wired — YouTube URL parsing, single video + playlist import, all functional',
      'Music: first-press track switch fixed — GainNode gain is now set immediately on track change instead of being stuck in the previous fade-in ramp',
      'Music streams: switched to SomaFM (Groove Salad for lofi, Drone Zone for dark ambient) — Zeno.fm streams were returning 403',
      'Pixie: thinking animation added — three bouncing amber dots appear while AI is fetching a response',
      'Pixie dev mode (open)/(close): fixed variable scoping bug — pixieDevMode assignment now correctly updates the let binding, not a stale window property',
      'PWA: nosirt can now be installed as a home-screen app on iOS and Android',
      'PWA: manifest.webmanifest and sw.js added to root, apple-touch-icon and meta tags in <head>',
      'PWA: install button added to profile panel — shows platform-specific instructions (iOS Share sheet, Android Chrome menu, or one-tap prompt if browser supports beforeinstallprompt)',
      'Version bumped to 01.29'
    ]
  },
  {
    version: '01.28',
    date: '8/2025',
    changes: [
      'Admin login fix — admin-login action now runs before username validation in account-auth.js',
      'Pixie AI: removed thinkingConfig (Gemini cold start dropped from 6-8s to under 1s)',
      'Pixie AI: all fallback providers (Groq, Mistral, Cerebras etc.) now receive full system prompt',
      'Pixie AI: per-provider timeouts (Gemini 3s, others 2s) prevent 504 gateway timeouts',
      'Pixie AI: richer lore system — Aelindra backstory, In-Between cartographer history, mushroom incident',
      'Pixie AI: (open)/(close) admin dev mode toggle in DM thread',
      'Pixie AI: separate localStorage/sessionStorage histories for normal vs admin mode',
      'Pixie AI: name capture now routes through AI (isNamingCheck) for smart validation',
      'Pixie drag: touch fallback handlers with stopPropagation to fix Hammer.js interference on iOS',
      'Pixie drag: pointercancel handler prevents stuck drag state on iOS',
      'Pixie visibility: S.view check replaces broken DOM check for map detection',
      'Pixie visibility: wander restarts after returning to map from another page',
      'Music: Web Audio GainNode route for iOS volume control (audioEl.volume ignored by iOS)',
      'Music: fade-in ramps to user saved volume instead of 1.0',
      'Music: music-modal backdrop tap now closes modal',
      'Wireless: all live detection code removed (probeLiveStatus, markEpisodeLive, sweepLiveStatus etc.)',
      'Wireless: showCoverStyle URL typos fixed (both youtube and custom paths)',
      'Wireless: showIsOwnedByMe now includes nosirt owner check',
      'Admin: claimAllShowsAsNosirt() batch migration function added',
      'Admin: shows ownership tab added to admin panel',
      'Version bumped to 01.28'
    ]
  },
  {
    version: '01.27',
    date: new Date().toLocaleDateString(),
    changes: [
      'Admin account unified with nosirt username — admin login now auto-signs into the reserved nosirt user account, hidden by default, with full user capabilities (DMs, sharing, playlists) under the nosirt display name',
      'Pixie expanded: can now change your profile emoji from chat, add YouTube videos to your playlist via link, recommend public stories with tappable cards, and give contextual site tips dynamically based on what you have/have not done',
      'Pixie mood system — her personality shifts based on real-world time of day, current map weather, and remembered conversation tone. She can ignore, refuse, or ask for apology from rude users',
      'Dual audio sliders — environment sounds and music/podcast volume are now independently controllable in the sound popover',
      'Floating Pixie icon restricted to map only — access her from the chat DM list anywhere else',
      'Emoji profile picker — clicking the emoji in your profile opens a curated picker panel instead of relying on the device keyboard',
      'Hidden users now subtracted from the online count for everyone (except admin), so hiding feels real',
      'Both map labels for the Keep update dynamically when a user logs in',
      'Book-a-slot UI moved inline into the Midnight Archive show page',
      'Story/episode thumbnails: YouTube frame capture at timestamp (no storage), stories get styled CSS title cards',
      'Version history updated to include v01.25 and v01.26 entries'
    ]
  },
  {
    version: '01.26',
    date: new Date().toLocaleDateString(),
    changes: [
      'Keep now per-user: browse tab (public Wattpad-style) + my works tab (private folder). Stories private by default, share-to-keep makes them public',
      'Wireless playlist ownership: all shows tagged with owner, private by default until published. Admin shows default to nosirt owner',
      'Share buttons on episodes, shows, and stories — sends a card into global chat or DM',
      'Admin panel: users tab (list all accounts, inspect any user read-only) and moderation tab (delete chat messages, tower posts, recs)',
      'Pixie moved fully into DM system — no separate panel, appears in online list and DM inbox permanently',
      'Pixie given access to user private data (stories, playlists, shows) so she can reference and play them by name',
      'Presence hidden mode: click your own green dot in the online list to go red/invisible. Admin sees everyone',
      'CSS font variables added to :root',
      'Share picker and playlist panel auto-open bug fixed (duplicate display:flex)'
    ]
  },
  {
    version: '01.25',
    date: new Date().toLocaleDateString(),
    changes: [
      'Admin login collapsed under a disclosure button so regular users only see one sign-in flow',
      'Map keep pin label now dynamic — updates to [username] keep when logged in',
      'All users in the online list are now clickable for DM (not just Pixie)',
      'First-visit audio fade-in: sound starts at zero and ramps up over 5 seconds so visitors are not blasted on arrival',
      'Saved panel and share picker no longer auto-open on page load (duplicate display:flex bug fixed)',
      'Keep password gate bypassed for logged-in accounts; Wireless podcast gate bypassed for logged-in accounts',
      'Pixie quick-tab button removed; Pixie DM thread added to personal tab with persistent history'
    ]
  },
  {
    version: '01.24',
    date: new Date().toLocaleDateString(),
    changes: [
      'NEW: real accounts — sign up with just a username, no password. This browser\'s saved key IS the account from then on; logging in on a different device/browser without that saved key isn\'t possible (no password to recover with — that trade-off is intentional, see account-auth.js header for the reasoning)',
      'NEW: pick exactly one emoji as your profile "face" — shows up live next to your name to other people on the site as soon as you change it',
      'Server-side account verification lives in new Netlify functions (account-auth.js for signup/login, account-update.js for changing your avatar/name/playlist, dm-send.js for sending a DM) — unlike almost everything else on this site, the nosirt_users and nosirt_dms collections are NOT writable directly from the browser, specifically so a stolen/guessed token can\'t rewrite someone\'s account or send a message pretending to be them',
      'NEW: DMs are live — tap anyone\'s name in global chat (if they\'re signed into an account) for a "chat" popup, opens straight into a real thread inside the existing "personal" tab, with an inbox list and an unread badge on the tab itself. Reading is a live Firestore listener filtered to only YOUR OWN threads (participants array-contains query), not the whole collection',
      'NEW: a personal playlist, saved per account — a "+" button next to any ambient track and any podcast episode saves it, opens from your profile as its own panel with reorder/remove and prev/exit/next transport controls. Playback reuses Pixie\'s own play-a-track/play-an-episode logic under the hood, so it behaves identically whether you start something or she does',
      'NEW: sharing — a 📎 button in chat (global or DM) lets you share something from your playlist, the recs board, or an n/ forum post. The recipient gets a small card with a "save" button: a shared playlist item drops straight into their own playlist (ready to play), a shared rec or post bookmarks into a new "saved" tab on their playlist panel',
      'v01.24 complete — all four pieces (accounts, DMs, playlist, sharing) are live'
    ]
  },
  {
    version: '01.23',
    date: new Date().toLocaleDateString(),
    changes: [
      'FIX: Pixie went completely silent because Gemini 1.5 (the model the code was calling) was fully shut down by Google — switched to "gemini-flash-latest", a rolling alias Google repoints forward automatically so this can\'t silently die the same way again',
      'FIX: replies were coming back as 1-2 words even with a raised token limit — turned out newer Gemini models spend part of that budget on invisible "thinking" tokens before ever writing a visible reply; explicitly set thinking to minimal so the budget actually goes to what she says',
      'Rewrote her brevity rules: short is now the DEFAULT (one punchy sentence, greetings get a few words back) rather than something she drifts away from once she has room — she\'s allowed to loosen up only as the same conversation goes a few turns deep',
      'NEW: she can now start ANY ambient track (not just lofi) and play a SPECIFIC episode of a SPECIFIC show by name — the live site context sent to her now includes every track key and every show\'s actual episode titles, and she\'s instructed to only ever use exact titles from that list',
      'NEW: her site actions (play music, play an episode, stop, navigate) now fire immediately the moment she decides to do them, instead of waiting on a button tap to confirm it first',
      'NEW: massively expanded fallback chain — from 2 Gemini keys to up to 10 keys across MULTIPLE providers (Gemini, Groq, Nvidia, Mistral, Cerebras, Lightning AI, OpenRouter). Provider is auto-detected from the env var name\'s prefix (e.g. MISTRAL_API_KEY_6) — add a new key from any of these and it\'s picked up automatically on next deploy, no code changes',
      'Idle nudge timing (her "still there?" pop-ins while her panel is open) changed from 20s/60s test values to a real 10 minutes / 1 hour',
      'NEW: a small persistent "🧚 Pixie" tab near the bottom of the screen opens her panel directly — no more needing to wait for her wandering icon to come back into view'
    ]
  },
  {
    version: '01.21',
    date: new Date().toLocaleDateString(),
    changes: [
      'Pixie dialogue: 601 → 876 lines, plus 44 real multi-turn conversation trees (e.g. "I had a bad day" → she asks angry-or-tired → follow-up branches on your actual answer) walked by a new generic tree engine — fully data-driven, so more trees can be added later without touching code',
      'NEW: a fragment-combiner for generic conversational reactions — instead of picking one fixed line, she assembles a reply from independent opener + follow-up pieces, which produces far more effectively-unique replies than the raw line count alone',
      'FIX: weather questions were falling through to old canned lines for a lot of real phrasings ("how\'s the weather", "what\'s it like outside") because the detection was too narrow — broadened significantly so real weather data actually comes back',
      'FIX: once she asked for a name, literally anything typed next got treated as the answer — including questions like "what\'s your name" back at her. A reply now has to actually look like a name (no question marks, short and plain, or an explicit "my name is"/"call me" phrase) before it\'s accepted',
      'NEW: her conversation history now persists in this browser (up to the last 200 messages) — reopening her panel resumes where you left off instead of wiping it every time. Greetings/name-asks only fire on a genuinely first-ever open',
      'NEW: name changes are capped at one — your first claim is free, one deliberate change after that is allowed, and a third attempt gets turned down (she\'ll say to clear your browser data if you really want to reset). Getting auto-renumbered because someone else claimed your name doesn\'t count against this'
    ]
  },
  {
    version: '01.20',
    date: new Date().toLocaleDateString(),
    changes: [
      'Pixie dialogue: 400 → 601 lines — conversation habits (interrupting herself, changing her mind mid-sentence), emotional check-ins (bored/tired/hungry/failed/scared/lonely/confused/etc), goodnight/good morning, and a large fallback-recovery set that reacts to HOW a message was said (gibberish, one word, all-caps swearing, spam/repeats, emoji-only, very long messages, "whatever"/"what?"/"why?") instead of a flat "I don\'t understand"',
      'NEW: she can now DO things instead of only talking about them — "play some lofi" actually starts it playing; "play the podcast"/"play midnight archive" actually loads and plays that episode in the background (with a button to jump to the wireless page if you want to watch); asking about a new episode gives a tappable link there',
      'NEW: real weather Q&A — asking "what\'s the weather" or "how windy is it" now pulls your actual current temperature/conditions from the location system already built, instead of a canned "yeah weather\'s real" line. If location isn\'t available yet, she says so and nudges you to allow it',
      'NEW: light response-combining — "hi, what\'s up, nice weather" now gets one combined reply (greeting + real weather) instead of only reacting to the first thing detected',
      'Her messages can now include a small clickable action button (e.g. "🎙 take me there") alongside her text, reusable for future site-linking beyond just Midnight Archive'
    ]
  },
  {
    version: '01.19',
    date: new Date().toLocaleDateString(),
    changes: [
      'Pixie dialogue: 144 → 400 lines, folding in a much richer character guide as her authoritative voice going forward — running gags (a suspicious goose, secretive squirrel meetings, a sighing Tower, an unexplained mushroom incident, an unexplained pond), favorite/hated things, and rare soft/existential moments',
      'NEW mechanics to actually use all this: idle detection ("...you still there?" after 20s of silence, "did you fall asleep?" after 60s while her panel is open), a "haven\'t seen you in days" greeting variant, seasonal/weather-aware asides that read the site\'s real current weather and time of day, and a lightweight affection tier (low/medium/high, based on how much you\'ve talked to her) that unlocks warmer responses over time',
      'Tapping her name in the panel header is now a small poke gag — a running joke on its own',
      'Added regex triggers for how-are-you / what-are-you-doing / who-are-you / how-old-are-you / do-you-like-humans / do-you-like-me / tell-me-a-joke / plain-hello, on top of the existing rude/nice/flirting/curious-about-the-curse detection'
    ]
  },
  {
    version: '01.18',
    date: new Date().toLocaleDateString(),
    changes: [
      'NEW: Pixie\'s shorts source — a show named exactly "pixie" (enforced unique, case-insensitive) is now reserved as her curated shorts feed. Fed the exact same way as any other show — paste a playlist link — no new import mechanism needed',
      'That specific show is automatically hidden from the public wireless grid, visible only when admin is unlocked, so it can still be managed through the normal show-edit UI without regular visitors ever seeing it in the browse list',
      'Admin panel\'s "pixie" tab now shows whether her shorts source exists yet, with a one-tap shortcut to create or manage it — no more digging through Wireless to find it'
    ]
  },
  {
    version: '01.17',
    date: new Date().toLocaleDateString(),
    changes: [
      'NEW: Pixie can now ask for (or notice, if you just volunteer it) your name — give her one and it becomes your real display identity site-wide (global chat, tower posts/comments, who\'s-online) going forward, replacing "user(#####)"',
      'Past messages/posts keep whatever label they were sent under — same "changes apply going forward only" rule as everywhere else on this site, nothing gets rewritten retroactively',
      'Duplicate names are handled the fun way: the first person to claim a name gets it plain, the second gets auto-numbered (e.g. "Alex 2") — and the first person gets bumped to "Alex 1" live, with Pixie proactively mentioning it next time you open her, rather than silently renaming you',
      'This needed Pixie to gain a small bit of real memory (S.pixieAwaiting) — she\'s otherwise fully stateless, but now tracks "waiting on a name reply" across one turn of conversation',
      'Backend: a new live-synced name registry (nosirt_names) using the same transaction pattern from the earlier data-race fixes, so two people claiming the same name at once can\'t corrupt each other\'s state'
    ]
  },
  {
    version: '01.16',
    date: new Date().toLocaleDateString(),
    changes: [
      'Admin panel reorganized into a proper tabbed settings panel (features / chat / world / pixie) instead of one long stacked column — the small profile sidebar now just has an "open admin settings" button once unlocked. A pixie tab is already in place for the settings coming in later batches',
      'Pixie\'s dialogue moved out of the code entirely into pixie-lines.json — a separate data file specifically so the line count can keep growing (toward ~1000, in batches) without ever touching pixie.js again',
      'Added a mood system underneath her responses — annoyed/sarcastic/bored/caught-off-guard/rare-sincere-crack — instead of one flat tone, plus special-intent detection (rude/nice/flirting/asking if she\'s real/asking about the curse/goodbye) on top of the existing topic tips',
      'First batch of dialogue: ~125 lines across greetings, 10 topic categories, 7 special-intent categories, and fallbacks. More batches to follow — this is intentionally not the full set yet'
    ]
  },
  {
    version: '01.15',
    date: new Date().toLocaleDateString(),
    changes: [
      'FIX: the environment-sound (rain/wind/thunder) button was accidentally living inside the map zoom controls, which have been intentionally hidden since v01.05/06 — it\'s now its own standalone button, always visible',
      'Environment sound is no longer just on/off — tap the button for a volume slider (0-160%), raised well above the old fixed levels so it can sit in the background over music if you want it up',
      'NEW: Pixie — a small companion who wanders the screen on her own (and occasionally flies off and comes back), can be dragged like the profile icon, and opens a chat panel when tapped',
      'Pixie\'s responses are hardcoded for now (personality + tips about the site) — built so only one function (getPixieResponse) needs to change when she\'s wired up to a real AI later. Note for that future step: as a static site with no server, that\'ll need a Netlify Function to proxy the request, the same way the admin password check already does — an API key can\'t live safely in the client code the way the YouTube/GIPHY keys do'
    ]
  },
  {
    version: '01.14',
    date: new Date().toLocaleDateString(),
    changes: [
      'Admin panel: version history is now collapsed by default — version numbers shown in lime, tap one to expand just that version\'s changes, instead of dumping the whole log',
      '"Living map" project, part 1 — ocean life: a small pier now has a ship that sails out to sea and back once every 24 hours (driven by the clock, always mid-journey correctly whenever the map loads), plus whales and boats that cross the water occasionally, same rare-spawn pattern as the witches/dragons',
      '"Living map" project, part 2 — location + weather plumbing: the map now quietly gets an approximate location (asks permission via the browser first; falls back to IP-based location with no prompt if declined) and fetches live weather for it. Nothing visual yet — this is just the data now flowing in, ready for the next part',
      'Added an environment-sounds mute button next to the map zoom controls, ready for when rain/wind/thunder sound gets added',
      'Hemisphere-aware: if location is available, latitude decides Northern vs Southern for anything season-related later; falls back to Northern Hemisphere if location isn\'t available at all',
      '"Living map" project, part 3 — weather made visible: cloud cover, rain, snow, and wind now reflect real current weather at your location. Clouds thicken and darken for storms, thin out on clear days, and move faster when it\'s windy. Thunderstorms add occasional lightning flashes with a timed thunder rumble. Wind adds its own drifting streak effect independent of rain/snow',
      'Added synthesized ambient sound for rain/snow/wind/thunder (built from noise + filters, same technique as the Void\'s pop sound and Ancient ambience \u2014 no audio files) \u2014 respects the mute button added in part 2',
      '"Living map" project, part 4 — day/night: the sky now tints toward dawn/dusk orange and night blue based on real sunrise/sunset at your location (falls back to a generic 6am/8pm schedule if location isn\'t available), a sun or moon arcs across the map accordingly, and stars fade in at night',
      'NEW: admin panel has a "preview weather/time" tool — jump the map into any weather (clear/cloudy/rain/snow/thunder/fog), windy or not, and any time of day (dawn/day/dusk/night) to see what it looks like, without waiting for real conditions to match. This is local to your own browser only — it never changes what real visitors see. A "stop previewing" button returns to real weather/time. Festival/seasonal preview will land in this same panel once that part is built',
      '"Living map" project, part 5 — seasons + festivals: the map now tints toward spring green, summer tan, fall orange/grey, or winter white based on the real calendar and your hemisphere (flips automatically for Southern Hemisphere visitors using their real latitude; falls back to Northern if location isn\'t available). Fall adds drifting falling leaves',
      'Festival decorations now show up automatically by real date — Halloween all of October, winter holidays in December, New Year\'s, Valentine\'s Day, and Oktoberfest, each with their own scattered decorations and color wash. Fully config-driven (see FESTIVALS in environment.js) — easy to add, remove, or adjust the date ranges for any of these later',
      'The admin preview tool from part 4 now also covers season and festival — preview any of the four seasons or any festival (or "none") independent of the real date, same "this browser only, never affects real visitors" behavior as the weather/time preview'
    ]
  },
  {
    version: '01.13',
    date: new Date().toLocaleDateString(),
    changes: [
      'BACKEND: posts, recs, and screams each moved from one shared Firestore document per collection to one document per item — fixes a real data race where two people voting/commenting/posting around the same time could silently overwrite each other',
      'Voting and commenting on a post now use a proper read-modify-write transaction against that post\'s own document, so two people acting on the same post at once merge correctly instead of one erasing the other',
      'Existing posts/recs/screams migrate automatically on first load — nothing existing is lost. Old data is left in place afterward as an untouched backup, not deleted',
      'FIX: the town-square "screaming void" used to re-save its entire message list on every render, including renders triggered by its own incoming Firebase updates — a render→write→update→render loop. Rendering only reads now; expired screams are deleted individually instead of rewriting the whole list',
      'FIX: re-entering Wonderland repeatedly no longer stacks up duplicate card-suit icons (spawnCardSoldiers wasn\'t clearing its container first, unlike the fireflies)',
      'FIX: re-entering the Void (space/expressionist world) no longer leaves old animation loops, shooting-star timers, and click listeners running in the background — was causing rising CPU/battery use and a tap on a planet triggering the pop sound multiple times at once',
      'No visible or behavioral change to any of the above from the site — this batch is backend/reliability work only'
    ]
  },
  {
    version: '01.12',
    date: new Date().toLocaleDateString(),
    changes: [
      'FIX: "The Wireless" option in the ♪ sounds menu no longer forces navigation to the wireless page when selected — it now behaves exactly like Ancient/Lofi/Dark: tap to start/resume in place, tap again to stop, no matter what page you\'re on',
      'The "jump to the grid or whatever\'s currently playing" smart shortcut is now exclusively the bottom-nav wireless button\'s (and the map pin\'s) behavior, not the sounds-menu option\'s'
    ]
  },
  {
    version: '01.11',
    date: new Date().toLocaleDateString(),
    changes: [
      'The top-bar "podcast" badge is now a dedicated Midnight Archive shortcut — always that show, regardless of what\'s playing or which show is set as admin\'s "default"',
      'The music modal\'s "The Wireless" option is now the general-purpose shortcut instead: resumes whatever was last loaded, or opens the main wireless page if nothing was',
      'That same smart shortcut now also applies to the bottom-nav wireless button, the map\'s wireless pin, and any direct/bookmarked /wireless link: if you\'re already viewing a show\'s player it steps back to the grid; if something\'s playing elsewhere it deep-links straight to it; if nothing\'s playing it opens the grid',
      'FIX: admin panel was silently showing the literal text "v${CURRENT_VERSION}" instead of the actual version number — that placeholder was sitting in raw HTML and never being evaluated. Now set properly via JS each time the panel opens'
    ]
  },
  {
    version: '01.10',
    date: new Date().toLocaleDateString(),
    changes: [
      'YouTube Data API key added — playlist import in Wireless now works',
      'FIX: the URL now updates no matter how you arrive at a page — bottom-nav buttons, exiting a mood world, and the music-bar podcast shortcut all used to leave the old URL showing; they now go through the same router the map pins already used',
      'Lofi Hip Hop now starts automatically as soon as the site is entered, instead of leaving all music off until you pick something',
      'If a browser blocks that autoplay, it now retries automatically on your first tap/click/keypress anywhere on the page, rather than requiring you to specifically reopen the music menu'
    ]
  },
  {
    version: '01.09',
    date: new Date().toLocaleDateString(),
    changes: [
      'NEW: "who\'s online" in the chat panel — a live count of everyone currently on the site, tap it to see the list of user(#####) names',
      'Presence is site-wide (tracked as soon as you enter the site, not just while chat is open) and updates automatically as people arrive/leave',
      '"Online" means a heartbeat was seen in the last 45 seconds — there\'s no true instant-disconnect signal on a static/Firestore-only site, so someone closing a tab drops off within about a minute rather than immediately'
    ]
  },
  {
    version: '01.08',
    date: new Date().toLocaleDateString(),
    changes: [
      'NEW: the carved-in-stone icon is now a chat panel with 3 tabs — Global Chat, Personal Chat (under construction), and Carved in Stone (your old private notes, unchanged)',
      'Global Chat is a real-time, site-wide chat — everyone shows up as "user(#####): message", auto-updates for everyone as messages come in',
      'Messages older than 24 hours are hidden and cleaned up automatically the next time anyone opens the chat',
      'Admin panel: new "global chat" section — turn GIF search (GIPHY) or image upload on/off (off by default). Only one mode active at a time',
      'Admin can delete any individual chat message',
      'Chat text is HTML-escaped before display — necessary since this is fully public/anonymous, unlike other write-open parts of the site'
    ]
  },
  {
    version: '01.07',
    date: new Date().toLocaleDateString(),
    changes: [
      'NEW: admin panel now has a "features" toggle list — garden, square, tower, wireless, the keep, and the welcome banner can each be switched off',
      'Turning a world off removes its bottom-nav icon and marks its map pin with a 🚧 sign; tapping the pin shows a "temporary review" note instead of entering',
      'Turning off the welcome banner makes the map the site\'s landing view — the intro is skipped entirely on load',
      'Toggle state is synced live via Firebase (features doc), so it applies for every visitor immediately, including on first page load'
    ]
  },
  {
    version: '01.06',
    date: new Date().toLocaleDateString(),
    changes: [
      'SECURITY: passwords no longer readable from the browser at all — moved off Firestore (which had to allow public reads for the old check to work) to a Netlify Function backed by env vars',
      'validatePassword() now calls /.netlify/functions/check-password, which returns only true/false, never the real password',
      'Added netlify/functions/check-password.js — see README-PASSWORDS.md for the Netlify setup steps',
      'Old Firestore "passwords" collection is no longer used by the app — safe to lock down or delete once the new function is live'
    ]
  },
  {
    version: '01.05',
    date: new Date().toLocaleDateString(),
    changes: [
      'Profile icon draggable — houses admin login, bio (editable), version history',
      'Firebase password validation — all passwords now server-side',
      'Podcast player refactored — wave (collapsed) vs video modes',
      'Episode auto-play on click (no manual play button needed)',
      'Styled progress bar with seek indicator (click to jump)',
      'Prev/next episode buttons for easy navigation',
      'Skip forward (+10s) and backward (-10s) controls',
      'Full-screen, theater mode buttons in video mode',
      'Responsive design for mobile and desktop',
      'Map UI removed — zoom/pan still works, no button hints',
      'Admin can edit bio in profile panel (saves to Firebase)',
      'Version history only visible when admin unlocked'
    ]
  },

  {
    version: '01.05',
    date: new Date().toLocaleDateString(),
    changes: [
      'About modal — click profile icon to see bio, instagram, and version history',
      'Version history expandable list in About modal (all versions with bullets)',
      'Draggable admin login panel — separate from About, can be positioned anywhere',
      'Admin panel persists position to localStorage across reloads',
      'Polished modal styling with animations and hover effects',
      'Responsive design for mobile and desktop',
      'All loose ends tied up — everything fully functional'
    ]
  },
  {
    version: '01.03',
    date: new Date().toLocaleDateString(),
    changes: [
      'Episode auto-advance fully implemented — plays next episode when current finishes',
      'Toast notification when auto-advancing to next episode',
      'Resume last-played episode on reload (localStorage) instead of always starting at newest',
      'Handle end-of-series gracefully — stops playback with message when no more episodes',
      'Save current episode ID automatically when loaded',
      'Prevent accidental re-triggering of auto-advance'
    ]
  },
  {
    version: '01.02',
    date: new Date().toLocaleDateString(),
    changes: [
      'Podcast background playback — click wireless from music bar plays in background (no page redirect) after first episode',
      'First time selecting podcast still opens wireless page to pick an episode',
      'Switching to ambient music auto-pauses podcast and remembers timestamp',
      'Podcast resumes from where it was paused when toggled back'
    ]
  },
  {
    version: '01.01',
    date: '6/29/2024',
    changes: [
      'Draggable admin login panel (username/password)',
      'Spotify-style podcast player with progress tracking',
      'Map UI (zoom, recenter) fade in/out on tap (3 sec auto-hide)',
      'Episode progress persistence (localStorage per episode)',
      'Auto-advance framework (incomplete)',
      'Recenter button fully centers map to viewport edges',
      'Removed hint text ("zoom or pinch", "distance from tower")'
    ]
  },
  {
    version: '01.00',
    date: '6/29/2024',
    changes: [
      'Initial Nosirt launch',
      'Map-based location system (Ancient Tower, Garden, Square)',
      'Keep library (docx/PDF upload, auto-chapter detection)',
      'Wireless podcast player with episode list',
      'Lofi/Dark Ambient/Ancient ambience music streaming',
      'Posts, recommendations, notes, screams social features'
    ]
  }
];
