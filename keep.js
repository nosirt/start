/* ============================================================
   KEEP.JS — "nosirt's keep" feature
   Load this AFTER core.js.
   Contains: the castle gate/password, and the library/reader —
   now backed by S.library (synced via Firestore, one document
   per story) instead of a hardcoded LIBRARY object. Stories are
   added by anyone who's past the castle gate; admin mode (see
   the floaty profile) can edit/delete any of them afterward.
   ============================================================ */

// ═══ CASTLE ═══
// v01.25: the keep now belongs to whichever user is logged in.
// - Logged-in account → their own keep, no gate, title = "[username]'s keep"
// - Admin → "nosirt's keep" (admin default), no gate
// - Anonymous visitor → sees the password gate as before

function getKeepTitle(){
  if(S.account && S.account.username) return S.account.username + "'s keep";
  return "nosirt's keep";
}

function updateKeepTitles(){
  const title = getKeepTitle();
  // Door + interior panel titles
  const doorTitle = $('castle-door-title');
  if(doorTitle) doorTitle.textContent = title;
  const interiorTitle = $('castle-interior-title');
  if(interiorTitle) interiorTitle.textContent = title;
  const sub = $('castle-interior-subtitle');
  if(sub){
    sub.textContent = S.account ? 'your personal library' : 'the library within';
  }
  // v01.27: update BOTH map labels — the HTML pin overlay label
  // AND the canvas mMapLabel (which reads getKeepTitle() at draw time already)
  const pinLabel = document.querySelector('#fpin-castle .pin-label');
  if(pinLabel) pinLabel.textContent = title;
  // Also update the "near nosirt's keep" readout string dynamically
  // by patching the PIN_LOCS nearest-label lookup
  if(typeof PIN_NEAREST_LABELS !== 'undefined'){
    PIN_NEAREST_LABELS.castle = 'near ' + title;
  }
}

// Whether the current visitor can enter without a password
function keepHasAccess(){
  return !!(S.adminUnlocked || S.account);
}

function openCastle(){
  updateKeepTitles();
  startKeepStoriesListener();
  if(keepHasAccess()){
    // Skip the gate entirely — go straight to the interior
    $('castle-door').classList.remove('open');
    $('castle-interior').classList.add('open');
    setTimeout(()=>{
      initKeepTabs();
      renderBookList();
    }, 50);
    return;
  }
  $('castle-door').classList.add('open');
}
function closeCastle(){
  $('castle-door').classList.remove('open');$('castle-input').value='';$('castle-wrong').textContent='';
  if(location.pathname!=='/')history.pushState({},'','/');
}
async function tryCastle(){
  // Admin/account bypass is already handled in openCastle; this path
  // is only reached by anonymous visitors typing the password.
  const val=$('castle-input').value.trim();
  const ok=await validatePassword('keep_password',val);
  if(ok){
    $('castle-door').classList.remove('open');$('castle-input').value='';$('castle-wrong').textContent='';
    $('castle-interior').classList.add('open');
    setTimeout(()=>{ initKeepTabs(); renderBookList(); },50);
  }else{
    $('castle-input').classList.add('wrong');$('castle-wrong').textContent='the gate remains sealed.';
    setTimeout(()=>$('castle-input').classList.remove('wrong'),420);$('castle-input').value='';
  }
}
function closeInterior(){
  stopKeepStoriesListener();
  $('castle-interior').classList.remove('open');
  if(location.pathname!=='/')history.pushState({},'','/');
  // Reset to library view when closing
  setTimeout(()=>{
    $('reader-view').style.display='none';
    $('library-view').style.display='flex';
  },300);
}

// ═══════════════════════════════════════
// CASTLE LIBRARY — now backed by S.library (synced via Firestore,
// one document per story since full novels are too big for a shared blob).
// Stories are added by anyone who's past the castle gate; admin mode
// (see the floaty profile) can edit/delete/reorder any of them after.
// ═══════════════════════════════════════

// People can type any genre they like when uploading a story, but it always
// also gets mapped to one of these fixed canonical genres too, so search and
// the genre filter chips stay consistent even when wording varies.
const CANONICAL_GENRES=['Fantasy','Sci-Fi','Romance','Horror','Mystery','Drama','Comedy','Adventure','Historical Fiction','Poetry','Other'];
const GENRE_KEYWORDS={
  'Fantasy':['fantasy','dragon','magic','wizard','elf','elves','kingdom','sword','myth','fae','sorcer','enchant'],
  'Sci-Fi':['sci-fi','scifi','science fiction','space','alien','robot','cyber','future','dystopia','android','galaxy'],
  'Romance':['romance','romantic','love story','heart','wedding','bride','passion'],
  'Horror':['horror','scary','ghost','demon','haunt','monster','terror','slasher','creepy'],
  'Mystery':['mystery','thriller','detective','crime','murder','suspense','noir','clue'],
  'Drama':['drama','tragedy','family saga','emotional','heartbreak'],
  'Comedy':['comedy','funny','humor','humour','satire','parody','hilarious'],
  'Adventure':['adventure','quest','journey','explore','treasure','expedition'],
  'Historical Fiction':['historical','history','war','medieval','victorian','ancient','period piece','dynasty'],
  'Poetry':['poem','poetry','verse','sonnet','haiku','ode'],
};
function mapGenre(text){
  const t=(text||'').toLowerCase();
  for(const canon of CANONICAL_GENRES){
    const kws=GENRE_KEYWORDS[canon];
    if(kws&&kws.some(k=>t.includes(k)))return canon;
  }
  return 'Other';
}

let keepStoriesUnsub=null;
function startKeepStoriesListener(){
  if(keepStoriesUnsub || typeof fbListenStories!=='function')return;
  keepStoriesUnsub=fbListenStories(items=>{
    if(items.length){
      S.library=items;
      localStorage.setItem('n_library',JSON.stringify(S.library));
      if(typeof renderBookList==='function')renderBookList();
    }
  });
}
function stopKeepStoriesListener(){
  if(keepStoriesUnsub){try{keepStoriesUnsub();}catch(e){} keepStoriesUnsub=null;}
}

if(typeof pdfjsLib!=='undefined'){
  pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

let currentShelf = 'novels';
let currentBook = null;
let currentChapterIdx = 0;
let keepView = 'browse'; // 'browse' = public library, 'mine' = my works folder

// v01.26: switch between the public library and the user's private works folder
function switchKeepView(view){
  keepView = view;
  // Tab highlight
  const browseTab = $('keep-tab-browse');
  const mineTab   = $('keep-tab-mine');
  if(browseTab){
    browseTab.style.background    = view==='browse' ? 'rgba(200,137,42,.12)' : 'none';
    browseTab.style.borderBottom  = view==='browse' ? '2px solid var(--amber)' : '2px solid transparent';
    browseTab.style.color         = view==='browse' ? 'var(--cream)' : 'var(--fog)';
  }
  if(mineTab){
    mineTab.style.background   = view==='mine' ? 'rgba(200,137,42,.12)' : 'none';
    mineTab.style.borderBottom = view==='mine' ? '2px solid var(--amber)' : '2px solid transparent';
    mineTab.style.color        = view==='mine' ? 'var(--cream)' : 'var(--fog)';
  }
  // Show/hide shelf row (only relevant in browse mode)
  const shelfRow = $('keep-shelf-row');
  if(shelfRow) shelfRow.style.display = view==='browse' ? 'flex' : 'none';
  // Search placeholder
  const search = $('lib-search');
  if(search) search.placeholder = view==='mine'
    ? 'search your works...'
    : 'search title, author, or genre...';
  // Add button always visible when user owns the keep
  updateKeepAddBtn();
  renderBookList();
}

function updateKeepAddBtn(){
  const btn = $('lib-add-btn');
  if(!btn) return;
  // Show "add" whenever user has access to the keep (account or admin)
  btn.style.display = keepHasAccess() ? 'inline-flex' : 'none';
}

// Called every time the interior opens — shows/hides tabs based on auth state
function initKeepTabs(){
  keepView = 'browse'; // always start on browse when opening
  const mineTab = $('keep-tab-mine');
  // "My works" tab only shown to logged-in users and admin
  if(mineTab) mineTab.style.display = keepHasAccess() ? 'block' : 'none';
  updateKeepAddBtn();
  switchKeepView('browse');
}

function switchShelf(shelf) {
  currentShelf = shelf;
  $('lib-search').value='';
  document.querySelectorAll('.shelf-tab').forEach(t => {
    const isActive = t.getAttribute('onclick') === `switchShelf('${shelf}')`;
    t.style.background = isActive ? 'rgba(200,137,42,.15)' : 'transparent';
    t.style.borderColor = isActive ? 'rgba(200,137,42,.35)' : 'rgba(200,137,42,.2)';
    t.style.color = isActive ? 'var(--cream)' : 'var(--fog)';
  });
  renderBookList();
}

// Clicking an author name or genre chip anywhere jumps into a cross-shelf
// search for that value — the closest thing to an "author/genre profile" page
// without a real accounts system.
function filterLibrary(value){
  $('lib-search').value=value;
  renderBookList();
}

const SHELF_ICON={novels:'📖',stories:'📜',poetry:'🪶',other:'✦'};

// v01.27: genre → accent color for CSS title cards
const GENRE_ACCENT = {
  fantasy:'#7b5ea7', romance:'#c4607a', mystery:'#4a7fa5',
  horror:'#8b2222', scifi:'#2e7d6e', thriller:'#8b6914',
  adventure:'#4a7a3d', historical:'#7a6040', poetry:'#7a5c8a',
  fiction:'#c8892a', nonfiction:'#5a7a5a', other:'#5a6878'
};

// Returns a CSS gradient + title card HTML for a story's cover
function storyThumbnailHtml(b, size){
  size = size || 'card'; // 'card' | 'small'
  const genre = (b.genreCanonical || b.genreRaw || 'other').toLowerCase();
  let accent = '#c8892a';
  for(const key of Object.keys(GENRE_ACCENT)){
    if(genre.includes(key)){ accent = GENRE_ACCENT[key]; break; }
  }
  const dim = size === 'small' ? 'width:60px;height:80px;' : 'width:100%;height:120px;';
  const titleSize = size === 'small' ? '.55rem' : '.75rem';
  const authorSize = size === 'small' ? '.48rem' : '.6rem';
  return '<div style="' + dim + 'border-radius:8px;overflow:hidden;position:relative;flex-shrink:0;' +
    'background:linear-gradient(160deg,' + accent + '44,' + accent + '11,rgba(10,8,6,.8));' +
    'border:1px solid ' + accent + '55;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8px;text-align:center">' +
    '<div style="font-size:.9rem;margin-bottom:4px">' + (SHELF_ICON[b.shelf]||'📖') + '</div>' +
    '<div style="font-family:var(--font-title);font-size:' + titleSize + ';color:var(--cream);line-height:1.3;word-break:break-word;opacity:.95">' +
      esc(b.title) + '</div>' +
    (size !== 'small' ?
      '<div style="font-family:var(--font-body);font-style:italic;font-size:' + authorSize + ';color:var(--fog);opacity:.6;margin-top:4px">' +
      esc(b.author) + '</div>' : '') +
    '</div>';
}

function isMyStory(b){
  if(S.adminUnlocked) return true;
  if(S.account && b.owner === S.account.username) return true;
  return false;
}

// Build a single story card HTML string — used by both view modes
function buildStoryCard(b, opts){
  opts = opts || {};
  const mine = isMyStory(b);
  const q = opts.q || '';

  // Privacy badge / author credit
  const privacyTag = mine
    ? (b.isPublic
        ? '<span style="font-size:.6rem;color:#8fc97a;opacity:.85">🌿 public</span>'
        : '<span style="font-size:.6rem;color:var(--amber);opacity:.65">🔒 private</span>')
    : '<span style="font-size:.6rem;color:var(--fog);opacity:.5">by ' + esc(b.owner||b.author) + '</span>';

  const shelfBadge = q
    ? '<div style="font-size:.65rem;color:var(--fog);opacity:.6">' + (SHELF_ICON[b.shelf]||'') + ' ' + esc(b.shelf) + '</div>'
    : '';

  const dateLine = b.uploadedAt
    ? '<span style="opacity:.45;font-size:.65rem;margin-left:6px">' + new Date(b.uploadedAt).toLocaleDateString('en-US',{month:'short',year:'numeric'}) + '</span>'
    : '';

  // Action buttons — always show share-to-chat; show privacy toggle + edit/delete only to owner
  // Use data-action attributes to avoid onclick string-quoting nightmares
  const sid = b.id;
  const shareBtn = (S.account||S.adminUnlocked)
    ? '<button class="admin-btn edit" data-action="share-chat" data-id="'+sid+'" style="font-size:.62rem;background:rgba(200,137,42,.06)">📎 share</button>'
    : '';
  const toggleBtn = mine && !b.isPublic
    ? '<button class="admin-btn edit" data-action="make-public" data-id="'+sid+'" style="font-size:.62rem">🌿 share to keep</button>'
    : (mine && b.isPublic
        ? '<button class="admin-btn edit" data-action="make-private" data-id="'+sid+'" style="font-size:.62rem">🔒 make private</button>'
        : '');
  // (duplicate toggleBtn removed)
  const ownerBtns = mine
    ? '<button class="admin-btn edit" data-action="edit" data-id="'+sid+'">✎ edit</button>' +
      '<button class="admin-btn delete" data-action="delete" data-id="'+sid+'">✕ delete</button>'
    : '';

  // Thumbnail — genre-colored CSS title card, no image storage needed
  const thumb = storyThumbnailHtml(b, 'small');

  return (
    '<div data-action="open-book" data-id="'+sid+'" style="background:rgba(20,14,8,.7);border:1px solid rgba(200,137,42,.18);border-radius:12px;padding:12px;cursor:pointer;transition:border-color .2s;display:flex;gap:10px;align-items:flex-start" ' +
    'onmouseover="this.style.borderColor=\'rgba(200,137,42,.4)\'" onmouseout="this.style.borderColor=\'rgba(200,137,42,.18)\'">' +
      thumb +
      '<div style="flex:1;min-width:0">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;margin-bottom:4px">' +
        '<div style="font-family:var(--font-title,serif);font-size:.82rem;color:var(--cream);line-height:1.3">' + esc(b.title) + '</div>' +
        '<div style="display:flex;align-items:center;gap:5px;flex-shrink:0">' + shelfBadge + privacyTag + '</div>' +
      '</div>' +
      '<div style="font-family:var(--font-body,serif);font-style:italic;font-size:.72rem;color:var(--amber);opacity:.8;margin-bottom:6px">' +
        'by <span data-action="filter-library" data-value="'+esc(b.author).replace(/'/g,"&#39;")+'" style="text-decoration:underline;cursor:pointer">' + esc(b.author) + '</span>' +
        ' · <span data-action="filter-library" data-value="'+esc(b.genreCanonical).replace(/'/g,"&#39;")+'" style="text-decoration:underline;cursor:pointer">' + esc(b.genreRaw||b.genreCanonical) + '</span>' +
        (b.status==='ongoing' ? ' · <span style="color:#8fc97a">ongoing</span>' : '') +
        dateLine +
      '</div>' +
      (b.desc ? '<div style="font-family:var(--font-body,serif);font-style:italic;font-size:.78rem;color:var(--fog);line-height:1.6;margin-bottom:8px">' + esc(b.desc) + '</div>' : '') +
      '<div style="margin-top:6px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">' +
        '<div style="font-size:.68rem;color:var(--fog);opacity:.5">' + b.chapters.length + ' chapter' + (b.chapters.length!==1?'s':'') + '</div>' +
        '<div style="display:flex;gap:5px;align-items:center;flex-wrap:wrap">' + shareBtn + toggleBtn + ownerBtns + '</div>' +
      '</div>' +
      '</div>' + // close flex content column
    '</div>'
  );
}

function renderBookList() {
  const list = $('book-list');
  if (!list) return;
  const q = ($('lib-search') ? $('lib-search').value : '').trim().toLowerCase();

  // ── MY WORKS view ─────────────────────────────────────────
  if(keepView === 'mine'){
    let myBooks = S.library.filter(b => isMyStory(b));
    if(q) myBooks = myBooks.filter(b =>
      b.title.toLowerCase().includes(q) ||
      (b.desc||'').toLowerCase().includes(q) ||
      (b.genreRaw||'').toLowerCase().includes(q)
    );

    if(!myBooks.length){
      list.innerHTML = '<div style="font-family:var(--font-body,serif);font-style:italic;font-size:.88rem;color:var(--fog);text-align:center;padding:40px 20px;opacity:.5;line-height:1.7">' +
        (q ? 'nothing matches that search.' : 'you have not added any stories yet. hit + add to upload your first.') +
        '</div>';
      return;
    }

    // Group by privacy status — private first (personal), then public
    const privateBooks = myBooks.filter(b => !b.isPublic);
    const publicBooks  = myBooks.filter(b =>  b.isPublic);

    let html = '';
    if(privateBooks.length){
      html += '<div style="font-size:.65rem;color:var(--fog);opacity:.5;font-family:var(--font-body,serif);font-style:italic;padding:8px 0 4px;border-bottom:1px solid rgba(200,137,42,.08);margin-bottom:10px">private — only you</div>';
      html += privateBooks.map(b => buildStoryCard(b, {q})).join('');
    }
    if(publicBooks.length){
      html += '<div style="font-size:.65rem;color:#8fc97a;opacity:.7;font-family:var(--font-body,serif);font-style:italic;padding:' + (privateBooks.length?'16px':'8px') + ' 0 4px;border-bottom:1px solid rgba(200,137,42,.08);margin-bottom:10px">shared to the keep</div>';
      html += publicBooks.map(b => buildStoryCard(b, {q})).join('');
    }
    list.innerHTML = html;
    return;
  }

  // ── BROWSE view (public Wattpad-style) ────────────────────
  let books = S.library.filter(b => b.isPublic || S.adminUnlocked);
  if(q){
    books = books.filter(b =>
      b.title.toLowerCase().includes(q) ||
      (b.author||'').toLowerCase().includes(q) ||
      (b.genreRaw||'').toLowerCase().includes(q) ||
      (b.genreCanonical||'').toLowerCase().includes(q)
    );
  } else {
    books = books.filter(b => b.shelf === currentShelf);
  }

  if(!books.length){
    list.innerHTML = '<div style="font-family:var(--font-body,serif);font-style:italic;font-size:.88rem;color:var(--fog);text-align:center;padding:40px 20px;opacity:.5;line-height:1.7">' +
      (q ? 'nothing matches that search.' : 'no stories on this shelf yet.') +
      '</div>';
    return;
  }
  list.innerHTML = books.map(b => buildStoryCard(b, {q})).join('');
}

// Delegated click handler for book-list card buttons (data-action pattern)
// This avoids the string-quoting nightmare of inline onclick with dynamic IDs.
document.addEventListener('click', function(e){
  const btn = e.target.closest('[data-action]');
  if(!btn) return;
  const action = btn.getAttribute('data-action');
  const id = btn.getAttribute('data-id');
  if(!action) return;
  e.stopPropagation();
  switch(action){
    case 'share-chat':     shareStoryToChat(id);  break;
    case 'make-public':    shareStoryPublic(id);  break;
    case 'make-private':   unshareStory(id);      break;
    case 'edit':           editStory(id);         break;
    case 'delete':         deleteStory(id);       break;
    // Reader view actions (reload the reader after state change)
    case 'reader-make-public':
      shareStoryPublic(id);
      setTimeout(()=>openBook(id), 200);
      break;
    case 'reader-make-private':
      unshareStory(id);
      setTimeout(()=>openBook(id), 200);
      break;
    case 'reader-share-chat':
      shareStoryToChat(id);
      break;
    case 'open-book':
      openBook(id);
      break;
    case 'filter-library':{
      const val = e.target.getAttribute('data-value');
      if(val) filterLibrary(val);
      break;
    }
  }
});

// Share a story as a card into global chat
function shareStoryToChat(id){
  if(!S.account && !S.adminUnlocked){ toast('sign in to share'); return; }
  const book = S.library.find(b=>b.id===id);
  if(!book){ toast('story not found'); return; }
  const card = {
    type: 'story',
    storyId: book.id,
    title: book.title,
    author: book.author,
    genre: book.genreRaw||book.genreCanonical,
    desc: book.desc||'',
    chapterCount: book.chapters.length,
    sharedBy: S.account ? S.account.username : 'nosirt',
    sharedAt: Date.now()
  };
  if(typeof sendSharedCardToChat==='function') sendSharedCardToChat(card);
  else toast('share sent ✓');
}

// Make a story public (share to keep) or private
function shareStoryPublic(id){
  const book = S.library.find(b=>b.id===id);
  if(!book || !isMyStory(book)) return;
  book.isPublic = true;
  fbSaveStory(book.id, book);
  renderBookList();
  toast('story shared to the keep 🌿');
}
function unshareStory(id){
  const book = S.library.find(b=>b.id===id);
  if(!book || !isMyStory(book)) return;
  book.isPublic = false;
  fbSaveStory(book.id, book);
  renderBookList();
  toast('story set to private 🔒');
}

function openBook(id) {
  const book = S.library.find(b => b.id === id);
  if (!book) return;
  currentBook = book;
  currentChapterIdx = 0;
  $('reader-title').textContent = book.title;
  // Reader meta: author + genre + date + owner actions
  const mine = isMyStory(book);
  const bid = book.id;
  const privacyToggle = mine
    ? (book.isPublic
        ? '<button data-action="reader-make-private" data-id="'+bid+'" style="background:none;border:1px solid rgba(200,137,42,.25);border-radius:10px;padding:2px 8px;color:var(--fog);font-size:.62rem;cursor:pointer;margin-left:8px">🔒 make private</button>'
        : '<button data-action="reader-make-public" data-id="'+bid+'" style="background:none;border:1px solid rgba(200,137,42,.25);border-radius:10px;padding:2px 8px;color:var(--fog);font-size:.62rem;cursor:pointer;margin-left:8px">🌿 share to keep</button>')
    : '';
  const readerShareBtn = (S.account||S.adminUnlocked)
    ? '<button data-action="reader-share-chat" data-id="'+bid+'" style="background:none;border:1px solid rgba(200,137,42,.25);border-radius:10px;padding:2px 8px;color:var(--fog);font-size:.62rem;cursor:pointer;margin-left:6px">📎 share to chat</button>'
    : '';
  // readerShareBtn is used instead (data-action pattern)
  $('reader-meta').innerHTML =
    'by ' + esc(book.author) + ' · ' + esc(book.genreRaw||book.genreCanonical) +
    (book.status==='ongoing' ? ' · <span style="color:#8fc97a">ongoing</span>' : '') +
    privacyToggle + readerShareBtn;
  $('reader-add-ch-btn').style.display = (mine && book.status==='ongoing') ? 'block' : 'none';
  $('lib-add-chapter-panel').style.display='none';
  buildChapterNav(book);
  renderChapter(0);
  $('library-view').style.display = 'none';
  $('reader-view').style.display = 'flex';
}

function buildChapterNav(book) {
  $('chapter-list').innerHTML = book.chapters.map((ch, i) => `
    <div onclick="goToChapter(${i});toggleChapterNav()" style="padding:6px 8px;border-radius:6px;cursor:pointer;font-family:var(--font-body,serif);font-style:italic;font-size:.78rem;color:var(--fog);transition:all .15s;border:1px solid transparent"
      onmouseover="this.style.color='var(--cream)';this.style.borderColor='rgba(200,137,42,.2)'"
      onmouseout="this.style.color='var(--fog)';this.style.borderColor='transparent'"
      id="ch-nav-${i}">${i === 0 ? '❧' : '·'} ${esc(ch.title)}
    </div>
  `).join('');
}

function renderChapter(idx) {
  if (!currentBook) return;
  const ch = currentBook.chapters[idx];
  if (!ch) return;
  currentChapterIdx = idx;

  // Format paragraphs
  // Split on any run of newlines, not just blank-line-separated double
  // newlines — PDF-extracted text and plainly-typed pasted text use single
  // line breaks between paragraphs, and would otherwise render as one
  // unbroken block of text.
  const paragraphs = ch.content.split(/\n+/).filter(p => p.trim());
  const html = paragraphs.map(p => {
    const trimmed = p.trim();
    if (trimmed.startsWith('"') || trimmed.startsWith('\u201c')) {
      return `<p style="margin-bottom:1.4em;color:rgba(240,230,210,.9);font-style:italic">${esc(trimmed)}</p>`;
    }
    return `<p style="margin-bottom:1.4em">${esc(trimmed)}</p>`;
  }).join('');

  $('reader-content').innerHTML = `
    <div style="font-family:var(--font-title,serif);font-size:1rem;color:var(--amber);margin-bottom:6px;line-height:1.4">${esc(ch.title)}</div>
    <div style="width:40px;height:1px;background:rgba(200,137,42,.3);margin-bottom:20px"></div>
    <div style="font-family:'Crimson Text',serif;font-size:1.05rem;color:rgba(230,220,200,.88);line-height:1.85">${html}</div>
    ${idx < currentBook.chapters.length - 1 ? `
    <div style="margin-top:32px;text-align:center">
      <button onclick="goToChapter(${idx+1})" style="background:rgba(200,137,42,.1);border:1px solid rgba(200,137,42,.3);border-radius:20px;padding:8px 24px;color:var(--cream);font-family:var(--font-body,serif);font-style:italic;font-size:.85rem;cursor:pointer">
        next: ${esc(currentBook.chapters[idx+1].title)} →
      </button>
    </div>` : `
    <div style="margin-top:32px;text-align:center;font-family:var(--font-body,serif);font-style:italic;font-size:.85rem;color:var(--fog);opacity:.6">— end ${currentBook.status==='ongoing'?"of what's posted so far":''} —</div>
    <div style="margin-top:12px;text-align:center">
      <button onclick="closeReader()" style="background:transparent;border:1px solid rgba(200,137,42,.2);border-radius:20px;padding:6px 18px;color:var(--fog);font-family:var(--font-body,serif);font-style:italic;font-size:.8rem;cursor:pointer">return to library</button>
    </div>`}
  `;
  $('reader-content').scrollTop = 0;
  updateReadProgress();
}

function goToChapter(idx) {
  renderChapter(idx);
}

function toggleChapterNav() {
  const nav = $('chapter-nav');
  nav.style.display = nav.style.display === 'none' ? 'block' : 'none';
}

function closeReader() {
  $('reader-view').style.display = 'none';
  $('library-view').style.display = 'flex';
  $('chapter-nav').style.display = 'none';
  $('lib-add-chapter-panel').style.display='none';
  currentBook = null;
}

function updateReadProgress() {
  const rc = $('reader-content');
  if (!rc) return;
  rc.addEventListener('scroll', () => {
    const pct = rc.scrollTop / (rc.scrollHeight - rc.clientHeight) * 100;
    const bar = $('read-progress');
    if (bar) bar.style.width = Math.min(100, pct) + '%';
  }, { passive: true });
}

// ═══ CHAPTER DETECTION ═══
// Heuristic only — looks for lines like "Chapter 1", "Chapter One: Title",
// "Part II", etc. Anything before the first detected heading becomes an
// implicit first chapter, so short single-piece stories still work fine.
function detectChapters(text){
  const lines=text.split(/\r?\n/);
  const headingRegex=/^(chapter|part|book|ch\.?)\s*[\divxlcIVXLC]*\b.{0,60}$/i;
  const chapters=[];
  let current=null;
  for(const raw of lines){
    const line=raw.trim();
    if(line && line.length<70 && headingRegex.test(line)){
      if(current)chapters.push(current);
      current={title:line,content:''};
    }else if(current){
      current.content+=(current.content?'\n':'')+raw;
    }else if(line){
      current={title:'Chapter 1',content:raw};
    }
  }
  if(current)chapters.push(current);
  chapters.forEach(c=>{c.content=c.content.replace(/\n{3,}/g,'\n\n').trim();});
  return chapters.filter(c=>c.content.length>0);
}

// Splits mammoth's converted HTML on heading tags (H1/H2/H3), which is a
// much more reliable signal than regex since it reflects the doc's real
// formatting (Word "Heading" styles map straight to these tags).
function chaptersFromDocxHtml(html){
  const div=document.createElement('div');
  div.innerHTML=html;
  const chapters=[];
  let current=null;
  Array.from(div.childNodes).forEach(node=>{
    if(node.nodeType===1 && /^H[1-3]$/.test(node.tagName)){
      if(current)chapters.push(current);
      current={title:(node.textContent||'').trim()||('Chapter '+(chapters.length+1)),content:''};
    }else{
      const text=node.textContent?node.textContent.trim():'';
      if(text){
        if(!current)current={title:'Chapter 1',content:''};
        current.content+=(current.content?'\n\n':'')+text;
      }
    }
  });
  if(current)chapters.push(current);
  return chapters.filter(c=>c.content.trim().length>0);
}

// Groups pdf.js text items into lines by y-position before handing off to
// the regex chapter-detector — plain space-joining loses line breaks
// entirely, which would make "Chapter 1" on its own line invisible.
async function extractPdfText(buf){
  const pdf=await pdfjsLib.getDocument({data:buf}).promise;
  let fullText='';
  for(let i=1;i<=pdf.numPages;i++){
    const page=await pdf.getPage(i);
    const content=await page.getTextContent();
    let lastY=null,lineText='';
    content.items.forEach(item=>{
      const y=item.transform[5];
      if(lastY!==null && Math.abs(y-lastY)>2){
        fullText+=lineText+'\n';
        lineText='';
      }
      lineText+=item.str;
      lastY=y;
    });
    fullText+=lineText+'\n\n';
  }
  return fullText;
}

async function chaptersFromFile(file){
  const ext=file.name.split('.').pop().toLowerCase();
  const buf=await file.arrayBuffer();
  if(ext==='docx'){
    if(typeof mammoth==='undefined')throw new Error('docx reader did not load');
    const result=await mammoth.convertToHtml({arrayBuffer:buf});
    return chaptersFromDocxHtml(result.value);
  }else if(ext==='pdf'){
    if(typeof pdfjsLib==='undefined')throw new Error('pdf reader did not load');
    const text=await extractPdfText(buf);
    return detectChapters(text);
  }
  throw new Error('please upload a .docx or .pdf file');
}

// ═══ UPLOAD: NEW STORY ═══
function toggleAddStory(){
  if(!keepHasAccess()){ toast('sign in to add stories'); return; }
  const panel=$('lib-add-panel');
  panel.style.display=panel.style.display==='none'?'block':'none';
  // When opening the add panel, switch to "my works" view so the
  // new story appears there immediately after publishing
  if(panel.style.display==='block' && keepView==='browse') switchKeepView('mine');
}

async function publishStory(){
  const title=filt($('lib-title').value.trim());
  if(!title){toast('give it a title first');return;}
  const author=filt($('lib-author').value.trim())||'anonymous';
  const genreRaw=filt($('lib-genre').value.trim())||'Other';
  const shelf=$('lib-shelf').value;
  const status=$('lib-status').value;
  const desc=filt($('lib-desc').value.trim());
  const file=$('lib-file').files[0];
  const pasted=$('lib-paste').value.trim();

  let chapters=[];
  try{
    if(file){
      toast('reading your file...');
      chapters=await chaptersFromFile(file);
    }else if(pasted){
      chapters=detectChapters(pasted);
    }else{
      toast('upload a file or paste some text first');
      return;
    }
  }catch(e){
    console.error(e);
    toast("couldn't read that file — try pasting the text instead");
    return;
  }
  if(!chapters.length){toast("couldn't find any readable text in that");return;}

  // v01.25: tag with owner (account username) and default to private
  const owner = (S.account && S.account.username) ? S.account.username : (S.adminUnlocked ? 'nosirt' : 'anonymous');
  const story={
    id:'story'+Date.now(),shelf,status,title,author,desc,
    genreRaw,genreCanonical:mapGenre(genreRaw),
    uploadedAt:Date.now(),chapters,
    owner,
    isPublic: false  // private by default — owner can share via "share to keep" button
  };
  S.library.unshift(story);
  localStorage.setItem('n_library',JSON.stringify(S.library));
  fbSaveStory(story.id,story);

  $('lib-title').value='';$('lib-author').value='';$('lib-genre').value='';
  $('lib-desc').value='';$('lib-paste').value='';$('lib-file').value='';
  const addPanel=$('lib-add-panel');
  if(addPanel) addPanel.style.display='none';
  // Always land on "my works" after publishing so the user sees their new story
  switchKeepView('mine');
  toast('published to the keep ✓ ('+chapters.length+' chapter'+(chapters.length!==1?'s':'')+')');
}

// ═══ ADD CHAPTER TO AN ONGOING STORY ═══
function toggleAddChapter(){
  if(!currentBook||currentBook.status!=='ongoing')return;
  const panel=$('lib-add-chapter-panel');
  panel.style.display=panel.style.display==='none'?'block':'none';
}

async function publishChapterToBook(){
  if(!currentBook)return;
  const manualTitle=filt($('ch-title').value.trim());
  const file=$('ch-file').files[0];
  const pasted=$('ch-paste').value.trim();

  let newChapters=[];
  try{
    if(file){
      toast('reading your file...');
      newChapters=await chaptersFromFile(file);
    }else if(pasted){
      newChapters=detectChapters(pasted);
    }else{
      toast('upload a file or paste some text first');
      return;
    }
  }catch(e){
    console.error(e);
    toast("couldn't read that file — try pasting the text instead");
    return;
  }
  if(!newChapters.length){toast("couldn't find any readable text in that");return;}
  if(manualTitle && newChapters.length===1)newChapters[0].title=manualTitle;

  currentBook.chapters=currentBook.chapters.concat(newChapters);
  const idx=S.library.findIndex(b=>b.id===currentBook.id);
  if(idx>-1)S.library[idx]=currentBook;
  localStorage.setItem('n_library',JSON.stringify(S.library));
  fbSaveStory(currentBook.id,currentBook);

  $('ch-title').value='';$('ch-paste').value='';$('ch-file').value='';
  $('lib-add-chapter-panel').style.display='none';
  buildChapterNav(currentBook);
  toast(newChapters.length+' chapter'+(newChapters.length!==1?'s':'')+' added ✓');
}

// ═══ ADMIN: EDIT / DELETE STORIES ═══
function deleteStory(id){
  const book = S.library.find(b=>b.id===id);
  if(!book || !isMyStory(book)) return;
  if(!confirm('delete this story permanently?'))return;
  S.library=S.library.filter(b=>b.id!==id);
  localStorage.setItem('n_library',JSON.stringify(S.library));
  fbDeleteStory(id);
  renderBookList();
  toast('story deleted');
}

function editStory(id){
  const _b = S.library.find(b=>b.id===id);
  if(!_b || !isMyStory(_b)) return;
  const book=S.library.find(b=>b.id===id);
  if(!book)return;
  const newTitle=prompt('title:',book.title);
  if(newTitle===null)return;
  book.title=filt(newTitle.trim())||book.title;
  const newAuthor=prompt('author:',book.author);
  if(newAuthor!==null)book.author=filt(newAuthor.trim())||book.author;
  const newGenre=prompt('genre:',book.genreRaw);
  if(newGenre!==null){book.genreRaw=filt(newGenre.trim())||book.genreRaw;book.genreCanonical=mapGenre(book.genreRaw);}
  const newStatus=prompt("status — type 'ongoing' or 'completed':",book.status);
  if(newStatus!==null && (newStatus.trim()==='ongoing'||newStatus.trim()==='completed'))book.status=newStatus.trim();
  const newDesc=prompt('description:',book.desc||'');
  if(newDesc!==null)book.desc=filt(newDesc.trim());

  localStorage.setItem('n_library',JSON.stringify(S.library));
  fbSaveStory(book.id,book);
  renderBookList();
  toast('story updated');
}

// Init library on castle open - renderBookList called by tryCastle
