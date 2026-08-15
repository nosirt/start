/* ============================================================
   GARDEN.JS — "the garden" feature
   Load this AFTER core.js.
   Contains: the three mood-worlds reached from the garden page
   — Wonderland, the Dreamfields (surrealist), and the Void
   (expressionist) — plus their sounds and tiny interactions.
   ============================================================ */

// ═══ CLOCK ═══
function startClock(){
  setInterval(()=>{
    const n=new Date(),h=n.getHours()%12,m=n.getMinutes();
    const ang=(deg,r)=>{const a=(deg-90)*Math.PI/180;return{x:30+r*Math.cos(a),y:30+r*Math.sin(a)};};
    const hp=ang(h*30+m*.5,16),mp=ang(m*6,20);
    const hl=$('clock-hour'),ml=$('clock-min');
    if(hl){hl.setAttribute('x2',hp.x);hl.setAttribute('y2',hp.y);}
    if(ml){ml.setAttribute('x2',mp.x);ml.setAttribute('y2',mp.y);}
  },1000);
}

// ═══ WONDERLAND ═══
const sparkles=[];
function buildWL(){
  const syms=['♠','♥','♦','♣','⚜','✦','◈','✿','☽','⚡'],
    cols=['#d4a5a5','#a5b4d4','#d4cca5','#b4a5d4','#a5d4c4'];
  syms.forEach((s,i)=>{
    const el=document.createElement('div');el.className='wl-element';el.textContent=s;
    el.style.cssText=`left:${4+(i*9.2)}%;animation-duration:${10+Math.random()*14}s;
      animation-delay:${Math.random()*8}s;color:${cols[~~(Math.random()*5)]};font-size:${.9+Math.random()*.8}rem;`;
    el.addEventListener('click',()=>scatterEl(el));
    el.addEventListener('touchstart',()=>scatterEl(el),{passive:true});
    $('wl-floaters').appendChild(el);
  });
  const cv=$('sparkle-canvas');cv.width=window.innerWidth;cv.height=window.innerHeight;
  animSparkles();
}
function scatterEl(el){
  el.style.transform=`translateX(${(Math.random()-.5)*80}px) rotate(${Math.random()*360}deg) scale(1.4)`;
  const r=el.getBoundingClientRect();drawSparksAt(r.left+r.width/2,r.top+r.height/2);
  setTimeout(()=>{el.style.transform='';},700);
}
let wlDrawing=false;
function bindWLDrag(){
  const w=$('world-wonderland');
  w.addEventListener('touchstart',e=>{wlDrawing=true;drawSparksAt(e.touches[0].clientX,e.touches[0].clientY);},{passive:true});
  w.addEventListener('touchmove',e=>{if(wlDrawing)Array.from(e.touches).forEach(t=>drawSparksAt(t.clientX,t.clientY));},{passive:true});
  w.addEventListener('touchend',()=>{wlDrawing=false;},{passive:true});
  w.addEventListener('mousedown',()=>wlDrawing=true);
  w.addEventListener('mousemove',e=>{if(wlDrawing)drawSparksAt(e.clientX,e.clientY);});
  w.addEventListener('mouseup',()=>wlDrawing=false);
}
function drawSparksAt(x,y){
  const cols=['#d4a5a5','#a5b4d4','#f0e0b0','#b4a5d4','#a5d4c4','#f0c070'];
  for(let i=0;i<4;i++)sparkles.push({x:x+(Math.random()-.5)*20,y:y+(Math.random()-.5)*20,
    r:2+Math.random()*4,life:1,col:cols[~~(Math.random()*cols.length)],
    vx:(Math.random()-.5)*2.5,vy:(Math.random()-.9)*3.5});
}
function animSparkles(){
  const cv=$('sparkle-canvas');if(!cv){requestAnimationFrame(animSparkles);return;}
  const ctx=cv.getContext('2d');ctx.clearRect(0,0,cv.width,cv.height);
  for(let i=sparkles.length-1;i>=0;i--){
    const s=sparkles[i];s.x+=s.vx;s.y+=s.vy;s.life-=.035;s.r*=.96;
    if(s.life<=0){sparkles.splice(i,1);continue;}
    ctx.save();ctx.globalAlpha=s.life;ctx.fillStyle=s.col;
    ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle=s.col;ctx.lineWidth=.5;
    ctx.beginPath();ctx.moveTo(s.x-s.r*2.2,s.y);ctx.lineTo(s.x+s.r*2.2,s.y);ctx.stroke();
    ctx.beginPath();ctx.moveTo(s.x,s.y-s.r*2.2);ctx.lineTo(s.x,s.y+s.r*2.2);ctx.stroke();
    ctx.restore();
  }
  requestAnimationFrame(animSparkles);
}
function petCat(el){el.textContent='😻';toast('purrr~');setTimeout(()=>{el.textContent='😺';},2200);}
function pokeRabbit(el){el.style.animationDuration='5s';toast('it runs faster');setTimeout(()=>{el.style.animationDuration='18s';},3500);}

// ═══ SURREALIST ═══
function buildSur(){
  const c=$('sur-elephants');
  for(let i=0;i<3;i++){
    const el=document.createElement('div');el.className='sur-elephant';
    const sz=52+i*16;
    el.style.cssText=`bottom:${26+i*7}%;animation-duration:${17+i*7}s;animation-delay:${i*5.5}s;`;
    el.innerHTML=`<svg width="${sz}" height="${sz*.78}" viewBox="0 0 100 80">
      <ellipse cx="55" cy="30" rx="30" ry="20" fill="#6b4515" stroke="#8b5a20" stroke-width="1"/>
      <ellipse cx="22" cy="25" rx="16" ry="14" fill="#6b4515" stroke="#8b5a20" stroke-width="1"/>
      <path d="M10,28 Q0,35 4,50 Q8,58 14,52" fill="none" stroke="#6b4515" stroke-width="5.5" stroke-linecap="round"/>
      <circle cx="18" cy="21" r="2" fill="#2a1000"/>
      <line x1="35" y1="48" x2="33" y2="78" stroke="#5a3a10" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="48" y1="49" x2="46" y2="78" stroke="#5a3a10" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="62" y1="49" x2="60" y2="78" stroke="#5a3a10" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="75" y1="48" x2="73" y2="78" stroke="#5a3a10" stroke-width="2.5" stroke-linecap="round"/>
    </svg>`;
    el.addEventListener('click',e=>tootEl(el,e));
    el.addEventListener('touchstart',e=>tootEl(el,e),{passive:true});
    c.appendChild(el);
  }
}
function tootEl(el,e){
  if(e)e.stopPropagation();
  el.style.transform='scale(1.1) translateY(-4px)';
  setTimeout(()=>{el.style.transform='';},350);
  playTootSound();
  const msgs=['📯 POOT!','💨 toot!','🎺 HONK!','💨 *trumpet*','📯 bwaaamp!'];
  const m=document.createElement('div');m.className='elephant-toot';
  m.textContent=msgs[~~(Math.random()*msgs.length)];
  const rect=el.getBoundingClientRect();
  m.style.cssText=`left:${rect.left+10}px;top:${rect.top-8}px;`;
  document.body.appendChild(m);setTimeout(()=>m.remove(),2000);
}

// ═══ EXPRESSIONIST ═══
function buildExp(){
  initSpace();
}

// v01.13: previously nothing here was ever cleaned up between visits to
// the Void — every call to initSpace() started a brand new draw loop,
// shooting-star interval, and click/touch listener on top of whatever
// was still running from a previous visit (re-entering a few times
// meant multiple loops running at once, and a tap firing the pop sound
// multiple times). teardownSpace() is idempotent — safe to call even
// when there's nothing to tear down yet — so calling it first here
// means any number of visits only ever leaves one of each running.
let spaceRafId=null;
let spaceIntervalId=null;
let spaceCanvasEl=null;
let spaceClickHandler=null;
let spaceTouchHandler=null;
function teardownSpace(){
  if(spaceRafId){cancelAnimationFrame(spaceRafId);spaceRafId=null;}
  if(spaceIntervalId){clearInterval(spaceIntervalId);spaceIntervalId=null;}
  if(spaceCanvasEl){
    if(spaceClickHandler)spaceCanvasEl.removeEventListener('click',spaceClickHandler);
    if(spaceTouchHandler)spaceCanvasEl.removeEventListener('touchstart',spaceTouchHandler);
  }
  spaceClickHandler=null;spaceTouchHandler=null;spaceCanvasEl=null;
}

function initSpace(){
  teardownSpace();
  const cv=$('space-canvas');
  if(!cv)return;
  spaceCanvasEl=cv;
  const W=cv.offsetWidth||window.innerWidth;
  const H=cv.offsetHeight||window.innerHeight;
  cv.width=W;cv.height=H;
  const ctx=cv.getContext('2d');

  // Stars
  const stars=[];
  for(let i=0;i<280;i++)stars.push({
    x:Math.random()*W,y:Math.random()*H,
    r:Math.random()*1.8+.2,
    twinkle:Math.random()*Math.PI*2,
    speed:Math.random()*.02+.005
  });

  // Planets
  const SUN={x:W*.5,y:H*.45,r:32,color:'#fff8e0',glow:'rgba(255,240,180,.35)'};
  const planets=[
    {a:70,b:22,angle:0,speed:.008,r:5,color:'#c8a878',rings:false,name:''},
    {a:115,b:38,angle:1.2,speed:.005,r:8,color:'#e8c090',rings:false,name:''},
    {a:165,b:55,angle:2.4,speed:.003,r:10,color:'#4a8ab0',rings:false,name:''},
    {a:215,b:72,angle:.8,speed:.002,r:7,color:'#c87858',rings:false,name:''},
    {a:275,b:92,angle:3.5,speed:.0012,r:18,color:'#d8b890',rings:true,name:''},
    {a:330,b:108,angle:1.8,speed:.0008,r:14,color:'#90b8d8',rings:false,name:''},
  ];

  // Asteroids belt
  const asteroids=[];
  for(let i=0;i<60;i++){
    const ang=Math.random()*Math.PI*2;
    const rad=230+Math.random()*40;
    asteroids.push({ang,rad,speed:(Math.random()-.5)*.0005+.0015,size:Math.random()*2+.5});
  }

  // Shooting stars
  const shoots=[];
  function addShoot(){
    shoots.push({x:Math.random()*W,y:Math.random()*H*.3,
      vx:4+Math.random()*6,vy:2+Math.random()*3,life:1});
  }
  spaceIntervalId=setInterval(addShoot,3000+Math.random()*4000);

  // Nebula blobs (static, drawn once)
  const nebulas=[
    {x:W*.2,y:H*.25,rx:90,ry:60,color:'rgba(80,40,120,.12)'},
    {x:W*.8,y:H*.6,rx:70,ry:80,color:'rgba(40,80,120,.1)'},
    {x:W*.5,y:H*.75,rx:110,ry:50,color:'rgba(120,40,80,.1)'},
  ];

  function draw(ts){
    ctx.clearRect(0,0,W,H);

    // Background
    ctx.fillStyle='#02010a';
    ctx.fillRect(0,0,W,H);

    // Nebulas
    nebulas.forEach(n=>{
      const g=ctx.createRadialGradient(n.x,n.y,0,n.x,n.y,Math.max(n.rx,n.ry));
      g.addColorStop(0,n.color);g.addColorStop(1,'transparent');
      ctx.save();ctx.scale(n.rx/Math.max(n.rx,n.ry),n.ry/Math.max(n.rx,n.ry));
      ctx.fillStyle=g;ctx.beginPath();
      ctx.arc(n.x*(Math.max(n.rx,n.ry)/n.rx),n.y*(Math.max(n.rx,n.ry)/n.ry),Math.max(n.rx,n.ry),0,Math.PI*2);
      ctx.fill();ctx.restore();
    });

    // Stars twinkle
    stars.forEach(s=>{
      s.twinkle+=s.speed;
      const alpha=.4+Math.sin(s.twinkle)*.35;
      ctx.globalAlpha=alpha;
      ctx.fillStyle='#ffffff';
      ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fill();
    });
    ctx.globalAlpha=1;

    // Sun glow
    const sg=ctx.createRadialGradient(SUN.x,SUN.y,SUN.r*.3,SUN.x,SUN.y,SUN.r*3);
    sg.addColorStop(0,'rgba(255,240,180,.5)');sg.addColorStop(.4,'rgba(255,200,80,.15)');sg.addColorStop(1,'transparent');
    ctx.fillStyle=sg;ctx.beginPath();ctx.arc(SUN.x,SUN.y,SUN.r*3,0,Math.PI*2);ctx.fill();
    // Sun body
    const sb=ctx.createRadialGradient(SUN.x-SUN.r*.3,SUN.y-SUN.r*.3,0,SUN.x,SUN.y,SUN.r);
    sb.addColorStop(0,'#fffde0');sb.addColorStop(.6,'#ffd060');sb.addColorStop(1,'#ff8800');
    ctx.fillStyle=sb;ctx.beginPath();ctx.arc(SUN.x,SUN.y,SUN.r,0,Math.PI*2);ctx.fill();

    // Orbital paths (faint)
    ctx.strokeStyle='rgba(255,255,255,.04)';ctx.lineWidth=.8;
    planets.forEach(p=>{
      ctx.beginPath();ctx.ellipse(SUN.x,SUN.y,p.a,p.b,0,0,Math.PI*2);ctx.stroke();
    });

    // Asteroid belt path
    ctx.strokeStyle='rgba(200,180,140,.03)';ctx.lineWidth=12;
    ctx.beginPath();ctx.ellipse(SUN.x,SUN.y,250,83,0,0,Math.PI*2);ctx.stroke();

    // Asteroids
    asteroids.forEach(a=>{
      a.ang+=a.speed;
      const x=SUN.x+Math.cos(a.ang)*a.rad;
      const y=SUN.y+Math.sin(a.ang)*a.rad*.34;
      ctx.fillStyle='rgba(180,160,120,.6)';
      ctx.beginPath();ctx.arc(x,y,a.size,0,Math.PI*2);ctx.fill();
    });

    // Planets
    planets.forEach(p=>{
      p.angle+=p.speed;
      const px=SUN.x+Math.cos(p.angle)*p.a;
      const py=SUN.y+Math.sin(p.angle)*p.b;

      // Rings for Saturn-ish
      if(p.rings){
        ctx.save();ctx.translate(px,py);ctx.scale(1,.35);
        ctx.strokeStyle='rgba(220,180,120,.5)';ctx.lineWidth=4;
        ctx.beginPath();ctx.arc(0,0,p.r*1.8,0,Math.PI*2);ctx.stroke();
        ctx.strokeStyle='rgba(220,180,120,.25)';ctx.lineWidth=2;
        ctx.beginPath();ctx.arc(0,0,p.r*2.2,0,Math.PI*2);ctx.stroke();
        ctx.restore();
      }

      // Planet glow
      const pg=ctx.createRadialGradient(px,py,0,px,py,p.r*2);
      pg.addColorStop(0,p.color.replace(')',',0.15)').replace('rgb','rgba'));
      pg.addColorStop(1,'transparent');
      ctx.fillStyle=pg;ctx.beginPath();ctx.arc(px,py,p.r*2,0,Math.PI*2);ctx.fill();

      // Planet body
      const pb=ctx.createRadialGradient(px-p.r*.3,py-p.r*.3,0,px,py,p.r);
      pb.addColorStop(0,'#ffffff');pb.addColorStop(.3,p.color);pb.addColorStop(1,'#000000');
      ctx.fillStyle=pb;ctx.beginPath();ctx.arc(px,py,p.r,0,Math.PI*2);ctx.fill();

      // Store for touch
      p._px=px;p._py=py;
    });

    // Shooting stars
    for(let i=shoots.length-1;i>=0;i--){
      const s=shoots[i];
      ctx.globalAlpha=s.life;
      const g=ctx.createLinearGradient(s.x,s.y,s.x-s.vx*8,s.y-s.vy*8);
      g.addColorStop(0,'white');g.addColorStop(1,'transparent');
      ctx.strokeStyle=g;ctx.lineWidth=1.5;
      ctx.beginPath();ctx.moveTo(s.x,s.y);ctx.lineTo(s.x-s.vx*8,s.y-s.vy*8);ctx.stroke();
      ctx.globalAlpha=1;
      s.x+=s.vx;s.y+=s.vy;s.life-=.025;
      if(s.life<=0)shoots.splice(i,1);
    }

    spaceRafId=requestAnimationFrame(draw);
  }
  spaceRafId=requestAnimationFrame(draw);

  // Touch planets — handlers stored as named refs so teardownSpace()
  // can remove exactly these listeners later (anonymous inline
  // functions can't be removeEventListener'd).
  spaceClickHandler=e=>{
    const rect=cv.getBoundingClientRect();
    const mx=e.clientX-rect.left,my=e.clientY-rect.top;
    planets.forEach(p=>{
      if(p._px&&Math.hypot(mx-p._px,my-p._py)<p.r+12){
        playSpaceSound();
        showSpacePop(e.clientX,e.clientY);
      }
    });
  };
  spaceTouchHandler=e=>{
    const rect=cv.getBoundingClientRect();
    Array.from(e.touches).forEach(t=>{
      const mx=t.clientX-rect.left,my=t.clientY-rect.top;
      planets.forEach(p=>{
        if(p._px&&Math.hypot(mx-p._px,my-p._py)<p.r+18){
          playSpaceSound();
          showSpacePop(t.clientX,t.clientY);
        }
      });
    });
  };
  cv.addEventListener('click',spaceClickHandler);
  cv.addEventListener('touchstart',spaceTouchHandler,{passive:true});
}

function playSpaceSound(){
  try{
    const ac=new(window.AudioContext||window.webkitAudioContext)();
    const o=ac.createOscillator();const g=ac.createGain();
    o.connect(g);g.connect(ac.destination);
    o.frequency.setValueAtTime(180+Math.random()*120,ac.currentTime);
    o.frequency.exponentialRampToValueAtTime(80,ac.currentTime+1.2);
    g.gain.setValueAtTime(.15,ac.currentTime);
    g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+1.2);
    o.start();o.stop(ac.currentTime+1.2);
  }catch(e){}
}

function showSpacePop(x,y){
  const msgs=['a distant world','ancient light','billions of years old','no one lives there','or do they?','silence','cold and spinning','this one has moons','named after a god'];
  const d=document.createElement('div');
  d.style.cssText=`position:fixed;left:${x}px;top:${y-30}px;transform:translate(-50%,-100%);
    font-family:'IM Fell English',serif;font-style:italic;font-size:.78rem;
    color:rgba(180,210,255,.85);pointer-events:none;z-index:99;
    text-shadow:0 0 8px rgba(100,150,255,.5);white-space:nowrap;
    animation:tootFloat 2.5s ease forwards;`;
  d.textContent=msgs[~~(Math.random()*msgs.length)];
  document.body.appendChild(d);setTimeout(()=>d.remove(),2500);
}

let expBound=false;
function bindExpTap(){if(expBound)return;expBound=true;initSpace();}

// ── WONDERLAND EXTRAS ──────────────────────────────────────────────────────
function spawnFireflies(){
  const container=$('wl-fireflies');
  if(!container)return;
  container.innerHTML='';
  for(let i=0;i<18;i++){
    const f=document.createElement('div');
    f.className='wl-firefly';
    const fx=(Math.random()-0.5)*200,fy=(Math.random()-0.5)*200;
    f.style.cssText=`
      left:${10+Math.random()*80}%;
      top:${20+Math.random()*65}%;
      --fx:${fx}px;--fy:${fy}px;
      animation-duration:${4+Math.random()*6}s;
      animation-delay:${Math.random()*8}s;`;
    container.appendChild(f);
  }
}

function spawnCardSoldiers(){
  const container=$('wl-soldiers');
  if(!container)return;
  container.innerHTML=''; // v01.13: was missing — re-entering Wonderland stacked up duplicate suit icons
  const suits=['♠','♥','♦','♣'];
  for(let i=0;i<4;i++){
    const s=document.createElement('div');
    s.className='card-soldier';
    s.textContent=suits[i];
    s.style.cssText=`animation-duration:${14+i*3}s;animation-delay:${i*3.5}s;`;
    container.appendChild(s);
  }
}

function cheshireClick(el){
  el.style.opacity='1';
  playWLSound(440);
  toast("we're all mad here");
  setTimeout(()=>{el.style.opacity='0';},2000);
}

function playWLSound(freq){
  try{
    const ac=new(window.AudioContext||window.webkitAudioContext)();
    const o=ac.createOscillator();const g=ac.createGain();
    o.type='sine';o.connect(g);g.connect(ac.destination);
    o.frequency.setValueAtTime(freq,ac.currentTime);
    o.frequency.exponentialRampToValueAtTime(freq*1.5,ac.currentTime+.3);
    o.frequency.exponentialRampToValueAtTime(freq*.8,ac.currentTime+.8);
    g.gain.setValueAtTime(.08,ac.currentTime);
    g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+.9);
    o.start();o.stop(ac.currentTime+.9);
  }catch(e){}
}

// ── ELEPHANT TOOT SOUND ────────────────────────────────────────────────────
function playTootSound(){
  try{
    const ac=new(window.AudioContext||window.webkitAudioContext)();
    const o=ac.createOscillator();const g=ac.createGain();
    o.type='sawtooth';o.connect(g);g.connect(ac.destination);
    o.frequency.setValueAtTime(90,ac.currentTime);
    o.frequency.exponentialRampToValueAtTime(65,ac.currentTime+.5);
    o.frequency.exponentialRampToValueAtTime(80,ac.currentTime+.8);
    g.gain.setValueAtTime(.18,ac.currentTime);
    g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+.9);
    o.start();o.stop(ac.currentTime+.9);
  }catch(e){}
}
