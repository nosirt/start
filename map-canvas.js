/* ============================================================
   MAP-CANVAS.JS — living-map canvas renderer and animations

   Requires: core.js, map-layout.js globals at runtime
   Exposes: initMapCanvas(), drawMapCanvas(), mapLoop()
   ============================================================ */

const MAP_W=5016,MAP_H=5016;
const MAP_IMAGE_SRC='assets/maps/nosirt-map.webp';
const MAP_IMAGE_PREVIEW_SRC='assets/maps/nosirt-map-preview.webp';

// ═══════════════════════════════════════
// CANVAS MAP DRAWING ENGINE
// ═══════════════════════════════════════
let mapCtx=null;
let mapImage=null;
let mapImageReady=false;
const mapState={clouds:[],birds:[],witches:[],dragons:[],figures:[],whales:[],boats:[],foam:[],
  rain:[],snow:[],windStreaks:[],lightning:{flash:0,nextStrikeAt:0},stars:[],
  leaves:[],festivalDecor:[],festivalDecorId:null,fireflies:[],
  waveOff:0,time:0,lastFrame:0};
// v01.14: coastal point the pier juts out from, and the point out at
// open sea the daily ship sails to and from.
const PIER_BASE={x:2340,y:600,angle:0.35};
const PIER_SEA_POINT={x:2600,y:520};

function initMapCanvas(){
  const cv=$('map-canvas');if(!cv)return;
  cv.width=MAP_W;cv.height=MAP_H;
  cv.style.width=MAP_W+'px';cv.style.height=MAP_H+'px';
  cv.style.transformOrigin='0 0';
  mapCtx=cv.getContext('2d');
  mapImage=new Image();
  mapImage.onload=()=>{mapImageReady=true;};
  mapImage.src=MAP_IMAGE_SRC;
  // Clouds
  for(let i=0;i<24;i++) mapState.clouds.push({
    x:Math.random()*MAP_W,y:80+Math.random()*1100,
    w:180+Math.random()*340,h:70+Math.random()*90,
    speed:0.12+Math.random()*0.22,opacity:0.16+Math.random()*0.24
  });
  for(let i=0;i<70;i++) mapState.foam.push({
    x:Math.random()*MAP_W,y:Math.random()*MAP_H,ph:Math.random()*Math.PI*2,
    len:26+Math.random()*58,spd:.08+Math.random()*.16
  });
  // Bird flocks
  for(let f=0;f<5;f++){
    const bx=Math.random()*MAP_W,by=260+Math.random()*1250;
    for(let b=0;b<4+Math.floor(Math.random()*5);b++) mapState.birds.push({
      x:bx+(Math.random()-.5)*100,y:by+(Math.random()-.5)*50,
      speed:0.5+Math.random()*0.6,wing:Math.random()*Math.PI*2,
      wingSpd:0.07+Math.random()*0.05
    });
  }
  // Walking figures
  const roads=[
    {x1:980,y1:1220,x2:1560,y2:1820},{x1:1560,y1:820,x2:1560,y2:1820},
    {x1:1560,y1:1820,x2:2280,y2:1060},{x1:1960,y1:620,x2:1560,y2:820}
  ];
  for(let i=0;i<10;i++) mapState.figures.push({
    road:roads[i%roads.length],t:Math.random(),
    speed:0.00007+Math.random()*0.00006,dir:Math.random()>.5?1:-1,
    step:Math.random()*Math.PI*2
  });
  for(let i=0;i<28;i++) mapState.fireflies.push({
    x:1420+Math.random()*820,y:2680+Math.random()*560,
    ph:Math.random()*Math.PI*2,r:1.4+Math.random()*1.8
  });
  mapState.dragons.push({
    x:420,y:730,baseY:730,spd:1.65,scale:1.15,
    ph:Math.random()*Math.PI*2,bank:1,fire:0
  });
  requestAnimationFrame(mapLoop);
}

function mapLoop(){
  const now=performance.now();
  const dt=mapState.lastFrame?Math.min(.05,(now-mapState.lastFrame)/1000):.016;
  mapState.lastFrame=now;
  mapState.time+=dt;mapState.waveOff+=dt*18;
  drawMapCanvas();requestAnimationFrame(mapLoop);
}

function drawMapCanvas(){
  if(!mapCtx)return;
  const ctx=mapCtx,W=MAP_W,H=MAP_H,t=mapState.time;
  ctx.clearRect(0,0,W,H);
  if(mapImageReady){
    drawImageMapScene(ctx,W,H,t);
    return;
  }

  // OCEAN
  const og=ctx.createRadialGradient(W*.4,H*.35,0,W*.5,H*.5,W*.8);
  og.addColorStop(0,'#2c6d86');og.addColorStop(.45,'#174b65');og.addColorStop(1,'#082133');
  ctx.fillStyle=og;ctx.fillRect(0,0,W,H);
  drawOceanTexture(ctx,t);

  // MAIN LANDMASS
  ctx.save();
  const landShadow=ctx.createRadialGradient(1600,1400,480,1600,1400,1450);
  landShadow.addColorStop(0,'rgba(0,0,0,0)');
  landShadow.addColorStop(1,'rgba(0,0,0,.35)');
  ctx.fillStyle='rgba(0,0,0,.24)';
  ctx.beginPath();traceMainLand(ctx,22,34);ctx.fill();

  const lg=ctx.createRadialGradient(1420,1140,120,1540,1300,1280);
  lg.addColorStop(0,'#608243');lg.addColorStop(.38,'#3f642e');lg.addColorStop(.72,'#2d4a20');lg.addColorStop(1,'#1d3118');
  ctx.fillStyle=lg;
  ctx.beginPath();traceMainLand(ctx,0,0);ctx.fill();
  ctx.save();
  ctx.clip();
  drawTerrainTexture(ctx,t);
  ctx.globalCompositeOperation='multiply';
  ctx.fillStyle=landShadow;ctx.fillRect(0,0,W,H);
  ctx.globalCompositeOperation='source-over';
  drawContourLines(ctx);
  ctx.restore();

  ctx.save();
  ctx.lineJoin='round';
  ctx.lineWidth=26;ctx.strokeStyle='rgba(245,222,160,.23)';ctx.stroke();
  ctx.lineWidth=12;ctx.strokeStyle='rgba(94,64,36,.24)';ctx.stroke();
  ctx.lineWidth=3;ctx.strokeStyle='rgba(255,240,178,.35)';ctx.setLineDash([20,16]);ctx.stroke();
  ctx.restore();
  drawCoastFoam(ctx,t);
  // Highland tint
  const hg=ctx.createRadialGradient(1300,1100,0,1300,1100,700);
  hg.addColorStop(0,'rgba(100,132,72,.5)');hg.addColorStop(1,'transparent');
  ctx.fillStyle=hg;ctx.beginPath();ctx.ellipse(1300,1100,700,500,-.2,0,Math.PI*2);ctx.fill();
  ctx.restore();

  // FAR OCEAN GLINTS ABOVE LAND EDGE
  ctx.save();ctx.globalAlpha=.1;ctx.strokeStyle='#9ad6e8';ctx.lineWidth=1.2;
  for(let wy=110;wy<H;wy+=96){
    ctx.beginPath();
    for(let wx=0;wx<W;wx+=8){
      const y=wy+Math.sin((wx*.009)+mapState.waveOff*.032+wy*.002)*8;
      wx===0?ctx.moveTo(wx,y):ctx.lineTo(wx,y);
    }
    ctx.stroke();
  }
  ctx.restore();

  // DESERT
  ctx.save();
  const dg=ctx.createRadialGradient(2050,1480,0,2050,1480,420);
  dg.addColorStop(0,'rgba(190,148,58,.8)');dg.addColorStop(.6,'rgba(150,108,42,.5)');dg.addColorStop(1,'transparent');
  ctx.fillStyle=dg;ctx.beginPath();ctx.ellipse(2050,1480,420,320,.3,0,Math.PI*2);ctx.fill();
  ctx.globalAlpha=.22;ctx.strokeStyle='#c8a848';ctx.lineWidth=2;
  for(let di=0;di<5;di++){
    ctx.beginPath();ctx.moveTo(1750+di*40,1380+di*28);
    ctx.bezierCurveTo(1900,1365+di*22,2060,1375+di*18,2200+di*18,1400+di*28);ctx.stroke();
  }
  ctx.restore();

  // FORESTS
  mForest(ctx,680,680,260,190,t);
  mForest(ctx,700,1400,190,150,t);
  mForest(ctx,1060,1700,170,125,t);

  // MOUNTAINS
  mMountainRange(ctx,[
    {x:1180,y:620,h:200,w:90},{x:1280,y:590,h:230,w:100},
    {x:1380,y:570,h:260,w:112},{x:1480,y:590,h:240,w:100},
    {x:1580,y:620,h:210,w:90},{x:1680,y:650,h:180,w:80},
    {x:1780,y:640,h:165,w:74},
  ]);
  mMountainRange(ctx,[
    {x:2100,y:900,h:115,w:65},{x:2185,y:878,h:138,w:72},
    {x:2268,y:898,h:118,w:63},{x:2340,y:918,h:98,w:58},
  ]);

  // LAKES
  mLake(ctx,1200,1300,155,108,t);
  mLake(ctx,2100,1300,96,65,t);
  mLake(ctx,1620,1700,52,36,t);

  // RIVERS
  mRiver(ctx,[[1380,690],[1340,810],[1280,930],[1240,1050],[1222,1185],[1242,1268]],10,t);
  mRiver(ctx,[[1360,1310],[1490,1318],[1630,1328],[1790,1348],[1940,1368],[2058,1296]],7,t);
  mRiver(ctx,[[1232,1388],[1244,1490],[1286,1592],[1368,1672],[1492,1732],[1592,1770]],6,t);
  mRiver(ctx,[[1196,1328],[1062,1348],[924,1368],[804,1408],[684,1468],[588,1528]],5,t);

  // WATERFALL
  mWaterfall(ctx,1272,1158,t);

  // ROADS
  mRoad(ctx,[[980,1220],[1100,1400],[1300,1580],[1560,1820]]);
  mRoad(ctx,[[1560,820],[1560,1220],[1560,1500],[1560,1820]]);
  mRoad(ctx,[[1560,1820],[1760,1700],[1980,1560],[2140,1380],[2280,1160],[2280,1060]]);
  mRoad(ctx,[[1560,820],[1680,720],[1820,660],[1960,620]]);
  mRoad(ctx,[[840,1620],[1080,1660],[1320,1740],[1560,1820]]);

  // SETTLEMENTS
  mVillage(ctx,1560,1820,78,t);
  mSettlement(ctx,2280,1060,42,t);
  mCastle(ctx,1960,620,t);
  mTower(ctx,2280,1060,t);
  mGarden(ctx,980,1220,t);
  mRuins(ctx,740,980,t);
  mWireless(ctx,840,1620,t);
  mSandbox(ctx,1180,1900,t);
  mMapLabel(ctx,980,1320,'the garden');
  mMapLabel(ctx,1560,1934,'town square');
  mMapLabel(ctx,2280,1160,'the tower');
  mMapLabel(ctx,1960,742,(typeof getKeepTitle==='function'?getKeepTitle():"nosirt's keep"));
  mMapLabel(ctx,840,1712,'the wireless');
  mMapLabel(ctx,1180,1996,'sandbox');

  // ISLANDS
  mIsland(ctx,290,490,85,52);mIsland(ctx,2850,330,68,42);
  mIsland(ctx,2770,2690,76,48);mIsland(ctx,390,2750,58,36);mIsland(ctx,188,1820,42,26);

  // ANIMATED BIRDS
  mapState.birds.forEach(b=>{
    b.x+=b.speed;b.wing+=b.wingSpd;
    if(b.x>MAP_W+100)b.x=-100;
    b.y+=Math.sin(b.wing*.5)*.3;
    mBird(ctx,b.x,b.y,b.wing);
  });

  // WALKING FIGURES
  mapState.figures.forEach(fg=>{
    fg.t+=fg.speed*fg.dir;
    if(fg.t>1){fg.t=1;fg.dir=-1;}if(fg.t<0){fg.t=0;fg.dir=1;}
    fg.step+=.08;
    const fx=fg.road.x1+(fg.road.x2-fg.road.x1)*fg.t;
    const fy=fg.road.y1+(fg.road.y2-fg.road.y1)*fg.t;
    mFigure(ctx,fx,fy,fg.step,fg.dir);
  });

  // WITCHES
  if(mapState.witches.length<1&&Math.random()<.0004)
    mapState.witches.push({x:-60,y:200+Math.random()*320,spd:1.8+Math.random()});
  for(let i=mapState.witches.length-1;i>=0;i--){
    const w=mapState.witches[i];w.x+=w.spd;
    mWitch(ctx,w.x,w.y,t);
    if(w.x>MAP_W+80)mapState.witches.splice(i,1);
  }

  // DRAGONS
  if(mapState.dragons.length<2&&Math.random()<.0014)
    mapState.dragons.push({
      x:-180,y:330+Math.random()*620,baseY:330+Math.random()*620,
      spd:1.25+Math.random()*1.1,scale:.85+Math.random()*.55,
      ph:Math.random()*Math.PI*2,bank:Math.random()>.5?1:-1,fire:0
    });
  for(let i=mapState.dragons.length-1;i>=0;i--){
    const d=mapState.dragons[i];
    d.x+=d.spd;d.ph+=.045;d.y=d.baseY+Math.sin(d.ph)*70+Math.sin(d.ph*.43)*34;
    if(Math.random()<.006)d.fire=1;
    mDragon(ctx,d.x,d.y,t,d.scale,d.bank,d.fire);
    d.fire*=.88;
    if(d.x>MAP_W+180)mapState.dragons.splice(i,1);
  }

  // v01.14: PIER + DAILY SHIP
  // Ship position cycles smoothly once every 24h of the visitor's own
  // clock: docked at the pier around midnight, farthest out at sea
  // around midday, back by the next midnight. No stored state needed —
  // it's a pure function of the current time, so it's already "mid-
  // journey" correctly no matter when someone loads the page.
  mPier(ctx,PIER_BASE.x,PIER_BASE.y,PIER_BASE.angle);
  {
    const now=new Date();
    const hourFrac=(now.getHours()+now.getMinutes()/60)/24;
    const shipT=(1-Math.cos(hourFrac*Math.PI*2))/2; // 0 at pier, 1 = farthest out
    const dockX=PIER_BASE.x+Math.cos(PIER_BASE.angle)*70,dockY=PIER_BASE.y+Math.sin(PIER_BASE.angle)*70;
    const sx=dockX+(PIER_SEA_POINT.x-dockX)*shipT;
    const sy=dockY+(PIER_SEA_POINT.y-dockY)*shipT+Math.sin(shipT*Math.PI)*-18;
    mShip(ctx,sx,sy,1,t*1.4,true);
  }

  // WHALES (rare, like witches/dragons above)
  if(mapState.whales.length<1&&Math.random()<.00008)
    mapState.whales.push({x:2500+Math.random()*500,y:1900+Math.random()*900,spd:0.25+Math.random()*.2,dir:Math.random()>.5?1:-1});
  for(let i=mapState.whales.length-1;i>=0;i--){
    const w=mapState.whales[i];w.x+=w.spd*w.dir;
    mWhale(ctx,w.x,w.y,t);
    if(w.x>MAP_W+80||w.x<-80)mapState.whales.splice(i,1);
  }

  // BOATS (rare, a plain sailboat crossing open water)
  if(mapState.boats.length<1&&Math.random()<.00015)
    mapState.boats.push({x:-60,y:2000+Math.random()*700,spd:0.7+Math.random()*.5});
  for(let i=mapState.boats.length-1;i>=0;i--){
    const b=mapState.boats[i];b.x+=b.spd;
    mBoat(ctx,b.x,b.y,t,true);
    if(b.x>MAP_W+80)mapState.boats.splice(i,1);
  }

  // v01.14 step 3: WEATHER — computed once per frame from S.environment.
  // Everything below (cloud density/color, rain, snow, wind streaks,
  // lightning) reacts to this single object.
  const wv=(typeof computeWeatherVisualState==='function')?computeWeatherVisualState():{kind:'clear',windy:false,cloudCover:0,isDay:true,intensity:0};

  // CLOUDS — count/opacity/darkness now follow real cloud cover instead
  // of always being the same fixed decorative amount, and move faster
  // when it's windy.
  const cloudBoost = wv.kind==='thunder'?.4 : wv.kind==='rain'||wv.kind==='snow'?.22 : wv.kind==='cloudy'?.1 : wv.kind==='clear'?-.35 : 0;
  const cloudDark = wv.kind==='thunder'?.55 : wv.kind==='rain'?.22 : 0;
  mapState.clouds.forEach(cl=>{
    cl.x+=cl.speed*(wv.windy?2.4:1);if(cl.x-cl.w>MAP_W)cl.x=-cl.w;
    const op=Math.max(.04,Math.min(1,cl.opacity+cloudBoost));
    mCloud(ctx,cl.x,cl.y,cl.w,cl.h,op,cloudDark);
  });

  // RAIN — sparse, stylized streaks that respawn once they fall off the
  // bottom, spread across the whole map so it reads as raining wherever
  // you happen to be looking, without needing hundreds of particles.
  if(wv.kind==='rain'||wv.kind==='thunder'){
    const targetCount=wv.kind==='thunder'?110:80;
    while(mapState.rain.length<targetCount)
      mapState.rain.push({x:Math.random()*MAP_W,y:Math.random()*MAP_H,len:14+Math.random()*16,spd:16+Math.random()*10});
    if(mapState.rain.length>targetCount)mapState.rain.length=targetCount;
    ctx.save();ctx.strokeStyle='rgba(200,215,230,.38)';ctx.lineWidth=1.6;ctx.lineCap='round';
    mapState.rain.forEach(d=>{
      d.y+=d.spd;d.x-=wv.windy?2.2:0.6;
      if(d.y>MAP_H){d.y=-20;d.x=Math.random()*MAP_W;}
      if(d.x<-20)d.x=MAP_W+20;
      ctx.beginPath();ctx.moveTo(d.x,d.y);ctx.lineTo(d.x-(wv.windy?7:2),d.y+d.len);ctx.stroke();
    });
    ctx.restore();
  }else if(mapState.rain.length){mapState.rain.length=0;}

  // SNOW — soft drifting dots, gentler than rain
  if(wv.kind==='snow'){
    const targetCount=70;
    while(mapState.snow.length<targetCount)
      mapState.snow.push({x:Math.random()*MAP_W,y:Math.random()*MAP_H,r:2+Math.random()*3,spd:2+Math.random()*2,drift:Math.random()*Math.PI*2});
    if(mapState.snow.length>targetCount)mapState.snow.length=targetCount;
    ctx.save();ctx.fillStyle='rgba(255,255,255,.75)';
    mapState.snow.forEach(f=>{
      f.y+=f.spd;f.drift+=0.02;f.x+=Math.sin(f.drift)*1.1+(wv.windy?1.6:0);
      if(f.y>MAP_H){f.y=-10;f.x=Math.random()*MAP_W;}
      if(f.x>MAP_W+10)f.x=-10;if(f.x<-10)f.x=MAP_W+10;
      ctx.beginPath();ctx.arc(f.x,f.y,f.r,0,Math.PI*2);ctx.fill();
    });
    ctx.restore();
  }else if(mapState.snow.length){mapState.snow.length=0;}

  // WIND — drifting leaf/dust streaks on genuinely windy days,
  // independent of whatever precipitation (or lack of it) is happening
  if(wv.windy){
    const targetCount=36;
    while(mapState.windStreaks.length<targetCount)
      mapState.windStreaks.push({x:Math.random()*MAP_W,y:Math.random()*MAP_H,spd:9+Math.random()*7,len:10+Math.random()*8,drift:Math.random()*Math.PI*2});
    if(mapState.windStreaks.length>targetCount)mapState.windStreaks.length=targetCount;
    ctx.save();ctx.strokeStyle='rgba(200,180,120,.28)';ctx.lineWidth=1.4;ctx.lineCap='round';
    mapState.windStreaks.forEach(w=>{
      w.x+=w.spd;w.drift+=0.05;const dy=Math.sin(w.drift)*3;
      if(w.x>MAP_W+20){w.x=-20;w.y=Math.random()*MAP_H;}
      ctx.beginPath();ctx.moveTo(w.x,w.y+dy);ctx.lineTo(w.x-w.len,w.y+dy-2);ctx.stroke();
    });
    ctx.restore();
  }else if(mapState.windStreaks.length){mapState.windStreaks.length=0;}

  // LIGHTNING — an occasional screen flash + thunder rumble
  if(wv.kind==='thunder'){
    if(!mapState.lightning.nextStrikeAt)mapState.lightning.nextStrikeAt=performance.now()+3000+Math.random()*6000;
    if(performance.now()>=mapState.lightning.nextStrikeAt){
      mapState.lightning.flash=1;
      mapState.lightning.nextStrikeAt=performance.now()+4000+Math.random()*9000;
      if(typeof playThunderRumble==='function')setTimeout(()=>playThunderRumble(),150+Math.random()*350);
    }
    if(mapState.lightning.flash>0.01){
      ctx.save();ctx.fillStyle=`rgba(230,238,255,${mapState.lightning.flash*.55})`;ctx.fillRect(0,0,W,H);ctx.restore();
      mapState.lightning.flash*=0.82;
    }else mapState.lightning.flash=0;
  }else{
    mapState.lightning.flash=0;mapState.lightning.nextStrikeAt=0;
  }

  // v01.14 step 5: SEASON — a translucent full-canvas wash (same
  // technique as the day/night tint below, layered underneath it) plus
  // falling leaves in the fall. Hemisphere-aware — see computeSeason()
  // in environment.js.
  {
    const season=(typeof computeSeason==='function')?computeSeason():'spring';
    const SEASON_WASH={
      spring:{color:'rgba(150,225,120,1)',alpha:.08},
      summer:{color:'rgba(215,185,95,1)', alpha:.10},
      fall:  {color:'rgba(180,110,55,1)', alpha:.13},
      winter:{color:'rgba(232,240,250,1)',alpha:.20}
    };
    const sw=SEASON_WASH[season]||SEASON_WASH.spring;
    ctx.save();ctx.globalAlpha=sw.alpha;ctx.fillStyle=sw.color;ctx.fillRect(0,0,W,H);ctx.restore();

    if(season==='fall'){
      const targetCount=26;
      while(mapState.leaves.length<targetCount)
        mapState.leaves.push({x:Math.random()*MAP_W,y:Math.random()*MAP_H,
          emoji:Math.random()>.5?'🍂':'🍁',size:14+Math.random()*8,
          spd:1+Math.random()*1.3,drift:Math.random()*Math.PI*2});
      if(mapState.leaves.length>targetCount)mapState.leaves.length=targetCount;
      ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';ctx.globalAlpha=.75;
      mapState.leaves.forEach(lf=>{
        lf.y+=lf.spd;lf.drift+=0.035;lf.x+=Math.sin(lf.drift)*1.8+0.6; // gentle breeze, always a little windy in fall
        if(lf.y>MAP_H){lf.y=-14;lf.x=Math.random()*MAP_W;}
        if(lf.x>MAP_W+14)lf.x=-14;
        ctx.font=lf.size+'px serif';
        ctx.fillText(lf.emoji,lf.x,lf.y);
      });
      ctx.restore();
    }else if(mapState.leaves.length){ mapState.leaves.length=0; }
  }

  // v01.14 step 4: DAY/NIGHT — sky tint, sun/moon arc, stars
  {
    const dn=(typeof computeDayNightPhase==='function')?computeDayNightPhase():{isDaytime:true,sunPos:.5,twilight:0,nightAmount:0};

    // Sky tint wash — dawn/dusk orange, night deep blue. Drawn as a
    // translucent full-canvas overlay so it colors everything already
    // drawn (ocean, land, weather) without needing to touch every
    // individual gradient.
    if(dn.twilight>0.02){
      ctx.save();ctx.globalAlpha=dn.twilight*.28;
      ctx.fillStyle='rgba(255,140,60,1)';ctx.fillRect(0,0,W,H);
      ctx.restore();
    }
    if(dn.nightAmount>0.02){
      ctx.save();ctx.globalAlpha=dn.nightAmount*.42*(1-dn.twilight*.5);
      ctx.fillStyle='rgba(10,16,42,1)';ctx.fillRect(0,0,W,H);
      ctx.restore();
    }

    // Stars — fixed field, fade in with nightAmount, gentle twinkle
    if(dn.nightAmount>0.05){
      if(!mapState.stars.length){
        for(let i=0;i<130;i++)
          mapState.stars.push({x:Math.random()*W,y:Math.random()*H*.55,r:0.6+Math.random()*1.4,ph:Math.random()*Math.PI*2});
      }
      ctx.save();
      const baseA=dn.nightAmount*(1-dn.twilight*.6);
      mapState.stars.forEach(s=>{
        const tw=0.55+0.45*Math.sin(t*1.3+s.ph);
        ctx.globalAlpha=baseA*tw;
        ctx.fillStyle='rgba(255,255,245,1)';
        ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fill();
      });
      ctx.restore();
    }

    // Sun/moon — arcs across the upper portion of the map, peaking in
    // the middle, low at the rise/set edges (a stylized "storybook map"
    // sky band, same spirit as the compass rose in the corner — not a
    // literal side-view horizon).
    const arcX0=380,arcX1=2820,peakY=140,edgeY=560;
    const sp=dn.sunPos;
    const bodyX=arcX0+(arcX1-arcX0)*sp;
    const bodyY=edgeY-(edgeY-peakY)*Math.sin(sp*Math.PI);
    ctx.save();
    if(dn.isDaytime){
      const glow=ctx.createRadialGradient(bodyX,bodyY,0,bodyX,bodyY,70);
      glow.addColorStop(0,'rgba(255,224,140,.55)');glow.addColorStop(1,'rgba(255,224,140,0)');
      ctx.fillStyle=glow;ctx.beginPath();ctx.arc(bodyX,bodyY,70,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=dn.twilight>0.3?'rgba(255,176,110,.85)':'rgba(255,232,170,.85)';
      ctx.beginPath();ctx.arc(bodyX,bodyY,26,0,Math.PI*2);ctx.fill();
    }else{
      const glow=ctx.createRadialGradient(bodyX,bodyY,0,bodyX,bodyY,50);
      glow.addColorStop(0,'rgba(210,220,255,.32)');glow.addColorStop(1,'rgba(210,220,255,0)');
      ctx.fillStyle=glow;ctx.beginPath();ctx.arc(bodyX,bodyY,50,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='rgba(224,228,240,.82)';
      ctx.beginPath();ctx.arc(bodyX,bodyY,19,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='rgba(10,16,42,.5)';
      ctx.beginPath();ctx.arc(bodyX+7,bodyY-4,16,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  }

  // v01.14 step 5: FESTIVAL DECORATIONS — a light color wash plus
  // scattered themed emoji, drawn above the day/night tint so they stay
  // clearly readable at any time of day. Config-driven — see the
  // FESTIVALS list in environment.js to add/change occasions.
  {
    const fest=(typeof getActiveFestival==='function')?getActiveFestival():null;
    if(fest){
      if(mapState.festivalDecorId!==fest.id){
        mapState.festivalDecor=[];
        for(let i=0;i<22;i++){
          mapState.festivalDecor.push({
            x:420+Math.random()*2000,y:280+Math.random()*1550,
            emoji:fest.emoji[Math.floor(Math.random()*fest.emoji.length)],
            size:22+Math.random()*14,bob:Math.random()*Math.PI*2
          });
        }
        mapState.festivalDecorId=fest.id;
      }
      ctx.save();ctx.globalAlpha=.09;ctx.fillStyle=fest.tint;ctx.fillRect(0,0,W,H);ctx.restore();
      ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';ctx.globalAlpha=.9;
      mapState.festivalDecor.forEach(d=>{
        const bobY=Math.sin(t*0.6+d.bob)*4;
        ctx.font=d.size+'px serif';
        ctx.fillText(d.emoji,d.x,d.y+bobY);
      });
      ctx.restore();
    }else if(mapState.festivalDecor.length){
      mapState.festivalDecor=[];mapState.festivalDecorId=null;
    }
  }

  drawForegroundAtmosphere(ctx,t);

  // VIGNETTE
  const vig=ctx.createRadialGradient(W/2,H/2,W*.25,W/2,H/2,W*.72);
  vig.addColorStop(0,'transparent');vig.addColorStop(1,'rgba(8,5,14,.58)');
  ctx.fillStyle=vig;ctx.fillRect(0,0,W,H);

  // BORDER
  ctx.save();ctx.strokeStyle='rgba(200,160,80,.2)';ctx.lineWidth=4;
  ctx.strokeRect(14,14,W-28,H-28);
  ctx.strokeStyle='rgba(200,160,80,.1)';ctx.lineWidth=1.5;
  ctx.strokeRect(22,22,W-44,H-44);ctx.restore();

  // COMPASS
  mCompass(ctx,W-110,H-110);

  // TITLE
  ctx.save();ctx.globalAlpha=.22;ctx.fillStyle='rgba(200,160,80,1)';
  ctx.font='italic 20px serif';ctx.textAlign='center';
  ctx.fillText('the lands of nosirt',W/2,H-26);ctx.restore();
}

// MAP HELPER FUNCTIONS
function drawImageMapScene(ctx,W,H,t){
  ctx.drawImage(mapImage,0,0,W,H);
  drawImageMapDepth(ctx,W,H,t);
  drawImageMapWater(ctx,t);
  drawImageMapLife(ctx,t);
  drawImageMapWeather(ctx,W,H,t);
  drawForegroundAtmosphere(ctx,t);

  const vig=ctx.createRadialGradient(W/2,H/2,W*.22,W/2,H/2,W*.76);
  vig.addColorStop(0,'transparent');vig.addColorStop(1,'rgba(2,5,10,.42)');
  ctx.fillStyle=vig;ctx.fillRect(0,0,W,H);

  ctx.save();
  ctx.strokeStyle='rgba(255,228,150,.22)';ctx.lineWidth=6;
  ctx.strokeRect(20,20,W-40,H-40);
  ctx.strokeStyle='rgba(255,255,255,.08)';ctx.lineWidth=2;
  ctx.strokeRect(32,32,W-64,H-64);
  ctx.restore();
}

function drawImageMapDepth(ctx,W,H,t){
  ctx.save();
  const distance=ctx.createLinearGradient(0,0,0,H);
  distance.addColorStop(0,'rgba(210,235,255,.16)');
  distance.addColorStop(.32,'rgba(255,255,255,0)');
  distance.addColorStop(1,'rgba(10,35,26,.12)');
  ctx.fillStyle=distance;ctx.fillRect(0,0,W,H);

  ctx.globalAlpha=.16;
  ctx.fillStyle='rgba(255,255,255,.7)';
  for(let i=0;i<7;i++){
    const y=650+i*205+Math.sin(t*.18+i)*14;
    ctx.beginPath();
    ctx.ellipse(990+i*280,y,520+i*80,42+i*5,-.02,0,Math.PI*2);
    ctx.fill();
  }
  ctx.restore();
}

function drawImageMapWater(ctx,t){
  ctx.save();
  ctx.globalCompositeOperation='screen';
  const waterBands=[
    {x:3350,y:900,w:1500,h:520,a:.11},
    {x:4100,y:2750,w:980,h:620,a:.14},
    {x:3600,y:3520,w:1160,h:640,a:.15},
    {x:2300,y:2550,w:860,h:420,a:.08},
    {x:1850,y:1420,w:1060,h:360,a:.1},
  ];
  waterBands.forEach((b,bi)=>{
    ctx.save();
    ctx.beginPath();ctx.ellipse(b.x,b.y,b.w,b.h,-.18,0,Math.PI*2);ctx.clip();
    ctx.globalAlpha=b.a;
    ctx.strokeStyle='rgba(210,248,255,.9)';ctx.lineWidth=2.2;ctx.lineCap='round';
    for(let i=0;i<22;i++){
      const y=b.y-b.h*.7+i*(b.h*1.4/22)+Math.sin(t*1.2+i+bi)*7;
      ctx.beginPath();
      for(let x=b.x-b.w;x<b.x+b.w;x+=54){
        const yy=y+Math.sin(x*.012+t*2.4+i)*9;
        x<=b.x-b.w?ctx.moveTo(x,yy):ctx.quadraticCurveTo(x-22,yy-7,x,yy);
      }
      ctx.stroke();
    }
    ctx.restore();
  });
  ctx.restore();
}

function drawImageMapLife(ctx,t){
  mapState.birds.forEach(b=>{
    b.x+=b.speed;b.wing+=b.wingSpd;
    if(b.x>MAP_W+140)b.x=-140;
    b.y+=Math.sin(b.wing*.5)*.35;
    mBird(ctx,b.x,b.y,b.wing);
  });

  if(mapState.dragons.length<2&&Math.random()<.0018)
    mapState.dragons.push({
      x:-220,y:620+Math.random()*1350,baseY:620+Math.random()*1350,
      spd:1.4+Math.random()*1.3,scale:.95+Math.random()*.55,
      ph:Math.random()*Math.PI*2,bank:Math.random()>.5?1:-1,fire:0
    });
  for(let i=mapState.dragons.length-1;i>=0;i--){
    const d=mapState.dragons[i];
    d.x+=d.spd;d.ph+=.045;d.y=d.baseY+Math.sin(d.ph)*76+Math.sin(d.ph*.43)*34;
    if(Math.random()<.006)d.fire=1;
    mDragon(ctx,d.x,d.y,t,d.scale,d.bank,d.fire);
    d.fire*=.88;
    if(d.x>MAP_W+240)mapState.dragons.splice(i,1);
  }
}

function drawImageMapWeather(ctx,W,H,t){
  const wv=(typeof computeWeatherVisualState==='function')?computeWeatherVisualState():{kind:'clear',windy:false,cloudCover:0,isDay:true,intensity:0};
  const cloudBoost = wv.kind==='thunder'?.42 : wv.kind==='rain'||wv.kind==='snow'?.24 : wv.kind==='cloudy'?.12 : wv.kind==='clear'?-.18 : 0;
  const cloudDark = wv.kind==='thunder'?.5 : wv.kind==='rain'?.2 : 0;
  mapState.clouds.forEach(cl=>{
    cl.x+=cl.speed*(wv.windy?2.6:1);if(cl.x-cl.w>MAP_W)cl.x=-cl.w;
    const op=Math.max(.03,Math.min(.85,cl.opacity+cloudBoost));
    mCloud(ctx,cl.x,cl.y,cl.w,cl.h,op,cloudDark);
  });

  if(wv.kind==='rain'||wv.kind==='thunder'){
    const targetCount=wv.kind==='thunder'?170:120;
    while(mapState.rain.length<targetCount)
      mapState.rain.push({x:Math.random()*MAP_W,y:Math.random()*MAP_H,len:22+Math.random()*24,spd:22+Math.random()*16});
    if(mapState.rain.length>targetCount)mapState.rain.length=targetCount;
    ctx.save();ctx.strokeStyle='rgba(210,232,242,.42)';ctx.lineWidth=2.1;ctx.lineCap='round';
    mapState.rain.forEach(d=>{
      d.y+=d.spd;d.x-=wv.windy?4.2:1.4;
      if(d.y>MAP_H){d.y=-24;d.x=Math.random()*MAP_W;}
      if(d.x<-30)d.x=MAP_W+30;
      ctx.beginPath();ctx.moveTo(d.x,d.y);ctx.lineTo(d.x-(wv.windy?12:4),d.y+d.len);ctx.stroke();
    });
    ctx.restore();
  }else if(mapState.rain.length){mapState.rain.length=0;}

  if(wv.kind==='snow'){
    const targetCount=115;
    while(mapState.snow.length<targetCount)
      mapState.snow.push({x:Math.random()*MAP_W,y:Math.random()*MAP_H,r:2+Math.random()*4,spd:2+Math.random()*2.8,drift:Math.random()*Math.PI*2});
    if(mapState.snow.length>targetCount)mapState.snow.length=targetCount;
    ctx.save();ctx.fillStyle='rgba(255,255,255,.76)';
    mapState.snow.forEach(f=>{
      f.y+=f.spd;f.drift+=0.02;f.x+=Math.sin(f.drift)*1.4+(wv.windy?2.2:0);
      if(f.y>MAP_H){f.y=-10;f.x=Math.random()*MAP_W;}
      if(f.x>MAP_W+10)f.x=-10;if(f.x<-10)f.x=MAP_W+10;
      ctx.beginPath();ctx.arc(f.x,f.y,f.r,0,Math.PI*2);ctx.fill();
    });
    ctx.restore();
  }else if(mapState.snow.length){mapState.snow.length=0;}

  if(wv.windy){
    const targetCount=55;
    while(mapState.windStreaks.length<targetCount)
      mapState.windStreaks.push({x:Math.random()*MAP_W,y:Math.random()*MAP_H,spd:11+Math.random()*9,len:18+Math.random()*18,drift:Math.random()*Math.PI*2});
    if(mapState.windStreaks.length>targetCount)mapState.windStreaks.length=targetCount;
    ctx.save();ctx.strokeStyle='rgba(255,240,180,.28)';ctx.lineWidth=1.8;ctx.lineCap='round';
    mapState.windStreaks.forEach(w=>{
      w.x+=w.spd;w.drift+=0.05;const dy=Math.sin(w.drift)*3;
      if(w.x>MAP_W+30){w.x=-30;w.y=Math.random()*MAP_H;}
      ctx.beginPath();ctx.moveTo(w.x,w.y+dy);ctx.lineTo(w.x-w.len,w.y+dy-2);ctx.stroke();
    });
    ctx.restore();
  }else if(mapState.windStreaks.length){mapState.windStreaks.length=0;}

  if(wv.kind==='thunder'){
    if(!mapState.lightning.nextStrikeAt)mapState.lightning.nextStrikeAt=performance.now()+3000+Math.random()*6000;
    if(performance.now()>=mapState.lightning.nextStrikeAt){
      mapState.lightning.flash=1;
      mapState.lightning.nextStrikeAt=performance.now()+4000+Math.random()*9000;
      if(typeof playThunderRumble==='function')setTimeout(()=>playThunderRumble(),150+Math.random()*350);
    }
    if(mapState.lightning.flash>0.01){
      ctx.save();ctx.fillStyle=`rgba(230,238,255,${mapState.lightning.flash*.5})`;ctx.fillRect(0,0,W,H);ctx.restore();
      mapState.lightning.flash*=0.82;
    }else mapState.lightning.flash=0;
  }else{
    mapState.lightning.flash=0;mapState.lightning.nextStrikeAt=0;
  }

  const dn=(typeof computeDayNightPhase==='function')?computeDayNightPhase():{isDaytime:true,sunPos:.5,twilight:0,nightAmount:0};
  if(dn.twilight>0.02){
    ctx.save();ctx.globalAlpha=dn.twilight*.2;ctx.fillStyle='rgba(255,150,70,1)';ctx.fillRect(0,0,W,H);ctx.restore();
  }
  if(dn.nightAmount>0.02){
    ctx.save();ctx.globalAlpha=dn.nightAmount*.42*(1-dn.twilight*.5);ctx.fillStyle='rgba(8,14,38,1)';ctx.fillRect(0,0,W,H);ctx.restore();
  }
}

function rand2(a,b){
  const x=Math.sin(a*127.1+b*311.7)*43758.5453123;
  return x-Math.floor(x);
}

function traceMainLand(ctx,ox,oy){
  ox=ox||0;oy=oy||0;
  ctx.moveTo(520+ox,320+oy);
  ctx.bezierCurveTo(620+ox,200+oy,880+ox,160+oy,1100+ox,180+oy);
  ctx.bezierCurveTo(1380+ox,165+oy,1620+ox,195+oy,1840+ox,240+oy);
  ctx.bezierCurveTo(2100+ox,290+oy,2280+ox,380+oy,2340+ox,520+oy);
  ctx.bezierCurveTo(2400+ox,660+oy,2380+ox,840+oy,2320+ox,1000+oy);
  ctx.bezierCurveTo(2260+ox,1160+oy,2180+ox,1300+oy,2060+ox,1420+oy);
  ctx.bezierCurveTo(1940+ox,1540+oy,1800+ox,1640+oy,1640+ox,1720+oy);
  ctx.bezierCurveTo(1480+ox,1800+oy,1300+ox,1860+oy,1120+ox,1880+oy);
  ctx.bezierCurveTo(940+ox,1900+oy,760+ox,1880+oy,600+ox,1820+oy);
  ctx.bezierCurveTo(440+ox,1760+oy,310+ox,1660+oy,240+ox,1520+oy);
  ctx.bezierCurveTo(170+ox,1380+oy,170+ox,1200+oy,220+ox,1060+oy);
  ctx.bezierCurveTo(270+ox,920+oy,360+ox,780+oy,420+ox,640+oy);
  ctx.bezierCurveTo(480+ox,500+oy,450+ox,400+oy,520+ox,320+oy);
  ctx.closePath();
}

function drawOceanTexture(ctx,t){
  ctx.save();
  for(let i=0;i<mapState.foam.length;i++){
    const f=mapState.foam[i];
    f.ph+=f.spd;
    const a=.05+.06*Math.sin(f.ph+t*.7);
    ctx.strokeStyle=`rgba(170,222,232,${Math.max(.015,a)})`;
    ctx.lineWidth=1+rand2(i,11)*1.4;
    ctx.beginPath();
    const sway=Math.sin(f.ph)*18;
    ctx.moveTo(f.x-sway,f.y);
    ctx.bezierCurveTo(f.x+f.len*.25,f.y-8+sway*.08,f.x+f.len*.7,f.y+7-sway*.06,f.x+f.len,f.y+Math.sin(f.ph*1.3)*5);
    ctx.stroke();
  }
  const moonPath=ctx.createLinearGradient(0,0,MAP_W,MAP_H);
  moonPath.addColorStop(0,'rgba(255,255,255,0)');
  moonPath.addColorStop(.48,'rgba(255,255,255,.08)');
  moonPath.addColorStop(.52,'rgba(255,255,255,.14)');
  moonPath.addColorStop(1,'rgba(255,255,255,0)');
  ctx.globalAlpha=.35+.18*Math.sin(t*.35);
  ctx.fillStyle=moonPath;
  ctx.fillRect(0,0,MAP_W,MAP_H);
  ctx.restore();
}

function drawTerrainTexture(ctx,t){
  ctx.save();
  ctx.globalAlpha=.2;
  for(let i=0;i<1400;i++){
    const x=240+rand2(i,3)*2200,y=220+rand2(i,8)*1700;
    const dx=(x-1420)/1120,dy=(y-1160)/850;
    if(dx*dx+dy*dy<1.08){
      const hue=rand2(i,12)>.56?'rgba(125,150,70,.55)':'rgba(24,44,18,.5)';
      ctx.fillStyle=hue;
      ctx.beginPath();
      ctx.ellipse(x,y,1.6+rand2(i,20)*4.6,1+rand2(i,21)*3.8,rand2(i,14)*Math.PI,0,Math.PI*2);
      ctx.fill();
    }
  }
  ctx.globalAlpha=.13;
  ctx.strokeStyle='rgba(230,214,150,.7)';
  ctx.lineWidth=1.2;
  for(let i=0;i<34;i++){
    const y=420+i*42+Math.sin(i)*18;
    ctx.beginPath();
    for(let x=360;x<2320;x+=80){
      const yy=y+Math.sin(x*.01+i)*18;
      x===360?ctx.moveTo(x,yy):ctx.quadraticCurveTo(x-36,yy-16,x,yy);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawContourLines(ctx){
  ctx.save();
  ctx.globalAlpha=.12;
  ctx.strokeStyle='rgba(246,226,162,.8)';
  ctx.lineWidth=1.2;
  [[1280,1020,380,260,-.2],[1540,1320,480,330,.18],[760,1340,280,190,.34],[1990,1220,290,210,-.3]].forEach(r=>{
    for(let k=0;k<5;k++){
      ctx.beginPath();
      ctx.ellipse(r[0],r[1],r[2]-k*34,r[3]-k*24,r[4],0,Math.PI*2);
      ctx.stroke();
    }
  });
  ctx.restore();
}

function drawCoastFoam(ctx,t){
  ctx.save();
  ctx.beginPath();traceMainLand(ctx,0,0);
  ctx.lineJoin='round';
  ctx.setLineDash([34,28]);
  ctx.lineDashOffset=-t*42;
  ctx.strokeStyle='rgba(205,236,230,.22)';
  ctx.lineWidth=18;
  ctx.stroke();
  ctx.setLineDash([12,22]);
  ctx.lineDashOffset=t*28;
  ctx.strokeStyle='rgba(255,248,210,.24)';
  ctx.lineWidth=5;
  ctx.stroke();
  ctx.restore();
}

function drawCurvedPath(ctx,pts){
  if(pts.length<2)return;
  ctx.beginPath();
  ctx.moveTo(pts[0][0],pts[0][1]);
  for(let i=1;i<pts.length-1;i++){
    const mx=(pts[i][0]+pts[i+1][0])/2;
    const my=(pts[i][1]+pts[i+1][1])/2;
    ctx.quadraticCurveTo(pts[i][0],pts[i][1],mx,my);
  }
  const last=pts[pts.length-1];
  ctx.lineTo(last[0],last[1]);
}

function drawForegroundAtmosphere(ctx,t){
  const driftX=((S.mapX||0)*-.035)%MAP_W;
  const driftY=((S.mapY||0)*-.025)%MAP_H;
  ctx.save();
  ctx.globalAlpha=.13;
  const fog=ctx.createLinearGradient(0,MAP_H*.52,0,MAP_H);
  fog.addColorStop(0,'rgba(230,232,210,0)');
  fog.addColorStop(.55,'rgba(220,226,204,.45)');
  fog.addColorStop(1,'rgba(14,20,26,.8)');
  ctx.fillStyle=fog;
  for(let i=-1;i<3;i++){
    ctx.beginPath();
    const y=2050+i*280+driftY;
    ctx.ellipse(MAP_W*.5+driftX*.6,y,1500,145,.02,0,Math.PI*2);
    ctx.fill();
  }
  ctx.restore();

  ctx.save();
  ctx.globalAlpha=.75;
  mapState.fireflies.forEach(f=>{
    const a=.18+.38*Math.max(0,Math.sin(t*2.2+f.ph));
    const x=f.x+Math.sin(t*.7+f.ph)*18;
    const y=f.y+Math.cos(t*.9+f.ph)*12;
    const g=ctx.createRadialGradient(x,y,0,x,y,14);
    g.addColorStop(0,`rgba(255,230,120,${a})`);
    g.addColorStop(1,'rgba(255,230,120,0)');
    ctx.fillStyle=g;
    ctx.beginPath();ctx.arc(x,y,14,0,Math.PI*2);ctx.fill();
  });
  ctx.restore();
}

function mForest(ctx,cx,cy,rw,rh,t){
  ctx.save();
  ctx.globalAlpha=.4;ctx.fillStyle='#1a3010';
  ctx.beginPath();ctx.ellipse(cx,cy,rw,rh,0,0,Math.PI*2);ctx.fill();
  const count=Math.floor(rw*rh/1100);
  ctx.globalAlpha=.88;
  for(let i=0;i<count;i++){
    const a=(i/count)*Math.PI*2,r=rand2(i,Math.round(cx+cy))*Math.min(rw,rh)*.82;
    const tx=cx+Math.cos(a)*r*(rw/Math.max(rw,rh)),ty=cy+Math.sin(a)*r*(rh/Math.max(rw,rh));
    const tr=13+rand2(i,Math.round(rw))*17;
    ctx.fillStyle='#1a3810';ctx.beginPath();ctx.arc(tx+4,ty+5,tr,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#264818';ctx.beginPath();ctx.arc(tx,ty,tr,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='rgba(70,118,44,.55)';ctx.beginPath();ctx.arc(tx-2,ty-3,tr*.52,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#2a5020';ctx.beginPath();ctx.moveTo(tx,ty-tr-7);ctx.lineTo(tx-5,ty-tr+3);ctx.lineTo(tx+5,ty-tr+3);ctx.fill();
  }
  ctx.restore();
}

function mMountainRange(ctx,peaks){
  ctx.save();
  const minX=Math.min(...peaks.map(p=>p.x-p.w))-70;
  const maxX=Math.max(...peaks.map(p=>p.x+p.w))+70;
  const baseY=Math.max(...peaks.map(p=>p.y+p.h));
  const haze=ctx.createLinearGradient(0,baseY-360,0,baseY+80);
  haze.addColorStop(0,'rgba(210,210,196,.16)');
  haze.addColorStop(1,'rgba(42,36,26,.34)');
  ctx.fillStyle=haze;
  ctx.beginPath();
  ctx.moveTo(minX,baseY+55);
  peaks.forEach((p,i)=>{
    const topY=p.y-p.h*(.72+rand2(i,4)*.16);
    ctx.bezierCurveTo(p.x-p.w*.8,p.y+p.h*.15,p.x-p.w*.34,topY+40,p.x,topY);
    ctx.bezierCurveTo(p.x+p.w*.34,topY+36,p.x+p.w*.72,p.y+p.h*.06,p.x+p.w,baseY+20);
  });
  ctx.lineTo(maxX,baseY+62);ctx.closePath();ctx.fill();

  peaks.forEach((p,i)=>{
    const topY=p.y-p.h;
    const leftBase={x:p.x-p.w*(.9+rand2(i,1)*.18),y:p.y+p.h*(.82+rand2(i,2)*.12)};
    const rightBase={x:p.x+p.w*(.9+rand2(i,3)*.18),y:p.y+p.h*(.82+rand2(i,5)*.12)};
    const rock=ctx.createLinearGradient(p.x-p.w,topY,p.x+p.w,rightBase.y);
    rock.addColorStop(0,'rgba(202,192,160,.88)');
    rock.addColorStop(.48,'rgba(122,104,76,.9)');
    rock.addColorStop(1,'rgba(54,43,34,.92)');
    ctx.globalAlpha=.9;
    ctx.fillStyle=rock;
    ctx.beginPath();
    ctx.moveTo(leftBase.x,leftBase.y);
    ctx.bezierCurveTo(p.x-p.w*.64,p.y+p.h*.12,p.x-p.w*.2,topY+36,p.x,topY);
    ctx.bezierCurveTo(p.x+p.w*.22,topY+46,p.x+p.w*.7,p.y+p.h*.12,rightBase.x,rightBase.y);
    ctx.bezierCurveTo(p.x+p.w*.25,rightBase.y+24,p.x-p.w*.34,leftBase.y+22,leftBase.x,leftBase.y);
    ctx.fill();

    ctx.globalAlpha=.36;
    ctx.fillStyle='rgba(245,238,214,.78)';
    ctx.beginPath();
    ctx.moveTo(p.x,topY+2);
    ctx.bezierCurveTo(p.x-p.w*.18,topY+44,p.x-p.w*.3,topY+72,p.x-p.w*.08,topY+88);
    ctx.bezierCurveTo(p.x+p.w*.1,topY+64,p.x+p.w*.18,topY+36,p.x,topY+2);
    ctx.fill();

    ctx.globalAlpha=.28;
    ctx.strokeStyle='rgba(48,37,28,.8)';
    ctx.lineWidth=1.4;
    for(let r=0;r<4;r++){
      const side=r%2?-1:1;
      ctx.beginPath();
      ctx.moveTo(p.x+side*rand2(i,r)*8,topY+26+r*16);
      ctx.bezierCurveTo(p.x+side*p.w*.16,topY+78+r*18,p.x+side*p.w*.32,p.y+p.h*.1+r*15,p.x+side*p.w*.52,p.y+p.h*.45+r*12);
      ctx.stroke();
    }
  });
  ctx.globalAlpha=.2;
  ctx.fillStyle='rgba(62,74,42,.72)';
  ctx.beginPath();ctx.ellipse((minX+maxX)/2,baseY+18,(maxX-minX)/2,54,0,0,Math.PI*2);ctx.fill();
  ctx.restore();
}

function mLake(ctx,cx,cy,rx,ry,t){
  ctx.save();
  const lg=ctx.createRadialGradient(cx,cy,0,cx,cy,Math.max(rx,ry));
  lg.addColorStop(0,'#80c5df');lg.addColorStop(.45,'#3f91b8');lg.addColorStop(1,'#1e5874');
  ctx.fillStyle=lg;ctx.beginPath();ctx.ellipse(cx,cy,rx,ry,0,0,Math.PI*2);ctx.fill();
  ctx.globalAlpha=.16;ctx.strokeStyle='rgba(255,255,255,.75)';ctx.lineWidth=1.4;
  for(let i=0;i<4;i++){
    ctx.beginPath();
    ctx.ellipse(cx-rx*.04,cy+Math.sin(t*1.4+i)*ry*.08,rx*(.72-i*.11),ry*(.45-i*.07),-.16,0,Math.PI*2);
    ctx.stroke();
  }
  ctx.globalAlpha=.28+Math.sin(t*2)*.1;ctx.fillStyle='rgba(190,238,255,.45)';
  ctx.beginPath();ctx.ellipse(cx-rx*.2,cy-ry*.22,rx*.42,ry*.24,-.3,0,Math.PI*2);ctx.fill();
  ctx.globalAlpha=.55;ctx.strokeStyle='rgba(142,207,218,.9)';ctx.lineWidth=3;
  ctx.beginPath();ctx.ellipse(cx,cy,rx,ry,0,0,Math.PI*2);ctx.stroke();
  ctx.globalAlpha=.23;ctx.strokeStyle='rgba(255,238,180,.85)';ctx.lineWidth=5;
  ctx.beginPath();ctx.ellipse(cx,cy,rx+8,ry+6,0,0,Math.PI*2);ctx.stroke();
  ctx.restore();
}

function mRiver(ctx,pts,w,t){
  if(pts.length<2)return;ctx.save();
  ctx.lineCap='round';ctx.lineJoin='round';
  drawCurvedPath(ctx,pts);
  ctx.globalAlpha=.36;ctx.strokeStyle='rgba(38,42,26,.75)';ctx.lineWidth=w+9;ctx.stroke();
  drawCurvedPath(ctx,pts);
  ctx.globalAlpha=.82;ctx.strokeStyle='#14506f';ctx.lineWidth=w+3;ctx.stroke();
  drawCurvedPath(ctx,pts);
  ctx.strokeStyle='#49a5c9';ctx.lineWidth=w;ctx.stroke();
  drawCurvedPath(ctx,pts);
  ctx.globalAlpha=.35+Math.sin(t*2)*.08;ctx.strokeStyle='#b7efff';ctx.lineWidth=Math.max(1.2,w*.32);ctx.stroke();
  drawCurvedPath(ctx,pts);
  ctx.setLineDash([18,20]);ctx.lineDashOffset=-t*80;
  ctx.globalAlpha=.28;ctx.strokeStyle='rgba(255,255,255,.85)';ctx.lineWidth=Math.max(1,w*.18);ctx.stroke();
  ctx.restore();
}

function mWaterfall(ctx,x,y,t){
  ctx.save();
  ctx.fillStyle='rgba(60,54,44,.9)';
  ctx.beginPath();ctx.moveTo(x-22,y-38);ctx.lineTo(x+22,y-32);ctx.lineTo(x+14,y+8);ctx.lineTo(x-16,y+8);ctx.closePath();ctx.fill();
  for(let i=0;i<7;i++){
    const ph=t*5+i*.45,oy=((ph*26)%72),sx=x-11+i*3.8+Math.sin(ph)*1.4;
    ctx.globalAlpha=.42+Math.sin(ph)*.2;ctx.strokeStyle=i%2?'#d8f6ff':'#8ed8ef';
    ctx.lineWidth=2.4;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(sx,y-2);ctx.bezierCurveTo(sx+Math.sin(ph)*5,y+18,sx-4,y+34,sx+Math.cos(ph)*6,y+Math.min(oy,60));ctx.stroke();
  }
  const mist=ctx.createRadialGradient(x,y+58,0,x,y+58,30);
  mist.addColorStop(0,'rgba(205,238,245,.58)');mist.addColorStop(1,'transparent');
  ctx.fillStyle=mist;ctx.globalAlpha=.55+Math.sin(t*2)*.12;
  ctx.beginPath();ctx.ellipse(x,y+58,36,20,0,0,Math.PI*2);ctx.fill();
  ctx.restore();
}

function mRoad(ctx,pts){
  if(pts.length<2)return;ctx.save();
  ctx.lineCap='round';ctx.lineJoin='round';
  drawCurvedPath(ctx,pts);
  ctx.strokeStyle='rgba(52,38,20,.3)';ctx.lineWidth=8;ctx.stroke();
  drawCurvedPath(ctx,pts);
  ctx.setLineDash([16,10]);ctx.strokeStyle='rgba(214,176,92,.56)';ctx.lineWidth=3.4;ctx.stroke();
  ctx.setLineDash([]);ctx.restore();
}

function mSmoke(ctx,x,y,t,off){
  ctx.save();
  for(let i=0;i<3;i++){
    const ph=t*.8+off+i*.8,oy=((ph*18)%52),ox=Math.sin(ph*.7)*6;
    ctx.globalAlpha=Math.max(0,.4-oy/62);ctx.fillStyle='#c0c0b0';
    ctx.beginPath();ctx.arc(x+ox,y-oy,4+oy*.08,0,Math.PI*2);ctx.fill();
  }
  ctx.restore();
}

function mVillage(ctx,cx,cy,sz,t){
  ctx.save();
  ctx.fillStyle='rgba(120,100,60,.4)';
  ctx.beginPath();ctx.ellipse(cx,cy,sz,sz*.6,0,0,Math.PI*2);ctx.fill();
  const bs=[{x:-30,y:-10,w:22,h:26},{x:0,y:-15,w:26,h:30},{x:34,y:-8,w:20,h:24},{x:-18,y:8,w:18,h:20},{x:18,y:6,w:18,h:22},{x:50,y:4,w:16,h:18},{x:-50,y:4,w:18,h:20}];
  bs.forEach(b=>{
    ctx.fillStyle='#a09068';ctx.fillRect(cx+b.x,cy+b.y-b.h,b.w,b.h);
    ctx.fillStyle='#8a6040';ctx.beginPath();ctx.moveTo(cx+b.x-2,cy+b.y-b.h);ctx.lineTo(cx+b.x+b.w/2,cy+b.y-b.h-13);ctx.lineTo(cx+b.x+b.w+2,cy+b.y-b.h);ctx.fill();
    ctx.fillStyle='rgba(255,215,110,.62)';ctx.fillRect(cx+b.x+4,cy+b.y-b.h+6,5,6);
  });
  mSmoke(ctx,cx+3,cy-43,t,0);mSmoke(ctx,cx-30,cy-33,t,1.5);
  ctx.restore();
}

function mSettlement(ctx,cx,cy,sz,t){
  ctx.save();
  ctx.fillStyle='rgba(100,85,50,.35)';ctx.beginPath();ctx.ellipse(cx,cy,sz,sz*.6,0,0,Math.PI*2);ctx.fill();
  [[0,-8,18,22],[20,-5,16,18],[-22,-4,16,18]].forEach(b=>{
    ctx.fillStyle='#907858';ctx.fillRect(cx+b[0],cy+b[1]-b[3],b[2],b[3]);
    ctx.fillStyle='#7a5838';ctx.beginPath();ctx.moveTo(cx+b[0]-2,cy+b[1]-b[3]);ctx.lineTo(cx+b[0]+b[2]/2,cy+b[1]-b[3]-10);ctx.lineTo(cx+b[0]+b[2]+2,cy+b[1]-b[3]);ctx.fill();
  });
  mSmoke(ctx,cx,cy-33,t,.8);ctx.restore();
}

function mCastle(ctx,cx,cy,t){
  ctx.save();
  ctx.fillStyle='rgba(80,70,50,.6)';ctx.beginPath();ctx.moveTo(cx-70,cy+62);ctx.bezierCurveTo(cx-50,cy+22,cx+50,cy+22,cx+70,cy+62);ctx.closePath();ctx.fill();
  ctx.fillStyle='#8a7a60';ctx.fillRect(cx-56,cy-20,112,72);
  ctx.fillStyle='#9a8a70';ctx.fillRect(cx-36,cy-56,72,66);
  ctx.fillStyle='#a8987a';ctx.fillRect(cx-20,cy-92,40,60);
  ctx.fillStyle='#b0a080';ctx.fillRect(cx-22,cy-98,44,8);
  for(let bx=cx-20;bx<cx+20;bx+=10){ctx.fillRect(bx,cy-100,7,10);}
  ctx.fillStyle='#9a8a70';ctx.fillRect(cx-56,cy-42,22,56);ctx.fillRect(cx+34,cy-42,22,56);
  ctx.fillStyle='rgba(255,220,100,.88)';ctx.fillRect(cx-6,cy-80,8,11);ctx.fillRect(cx-6,cy-60,8,8);
  ctx.fillStyle='rgba(255,175,75,.5)';ctx.fillRect(cx-46,cy-26,6,8);ctx.fillRect(cx+40,cy-26,6,8);
  ctx.strokeStyle='#8a7050';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(cx,cy-92);ctx.lineTo(cx,cy-114);ctx.stroke();
  ctx.fillStyle='#c03030';ctx.beginPath();ctx.moveTo(cx,cy-114);ctx.lineTo(cx+19,cy-108);ctx.lineTo(cx,cy-101);ctx.fill();
  const gl=ctx.createRadialGradient(cx,cy-72,0,cx,cy-72,42);
  gl.addColorStop(0,'rgba(255,200,80,1)');gl.addColorStop(1,'transparent');
  ctx.globalAlpha=.14+Math.sin(t*3)*.05;ctx.fillStyle=gl;
  ctx.beginPath();ctx.arc(cx,cy-72,42,0,Math.PI*2);ctx.fill();
  ctx.restore();
}

function mTower(ctx,cx,cy,t){
  ctx.save();
  ctx.fillStyle='rgba(60,45,25,.5)';ctx.beginPath();ctx.ellipse(cx,cy+42,32,16,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#6a5a40';ctx.fillRect(cx-14,cy-62,28,98);
  ctx.fillStyle='#8a7258';ctx.fillRect(cx-16,cy-67,32,8);
  for(let bx=cx-14;bx<cx+14;bx+=9){ctx.fillRect(bx,cy-74,6,9);}
  const ga=.68+Math.sin(t*2)*.24;
  ctx.fillStyle=`rgba(160,80,220,${ga})`;ctx.fillRect(cx-4,cy-50,8,10);ctx.fillRect(cx-4,cy-30,8,10);
  const mg=ctx.createRadialGradient(cx,cy-42,0,cx,cy-42,36);
  mg.addColorStop(0,'rgba(160,80,220,1)');mg.addColorStop(1,'transparent');
  ctx.globalAlpha=.28+Math.sin(t*2)*.14;ctx.fillStyle=mg;
  ctx.beginPath();ctx.arc(cx,cy-42,36,0,Math.PI*2);ctx.fill();
  ctx.restore();
}

function mGarden(ctx,cx,cy,t){
  ctx.save();
  const cg=ctx.createRadialGradient(cx,cy,0,cx,cy,82);
  cg.addColorStop(0,'#4a8840');cg.addColorStop(.6,'#3a6830');cg.addColorStop(1,'transparent');
  ctx.fillStyle=cg;ctx.beginPath();ctx.ellipse(cx,cy,82,62,0,0,Math.PI*2);ctx.fill();
  [[-30,-15,'#e8c840'],[10,-22,'#f0a0a0'],[36,-8,'#e8c840'],[-15,12,'#f0a0a0'],[22,18,'#a0d880'],[-42,8,'#e8c840']].forEach(f=>{
    ctx.fillStyle=f[2];ctx.beginPath();ctx.arc(cx+f[0],cy+f[1]+Math.sin(t*1.5+f[0])*.8,5,0,Math.PI*2);ctx.fill();
  });
  ctx.fillStyle='#8a8070';[[-28,-18],[28,-14],[2,-26]].forEach(([sx,sy])=>{ctx.fillRect(cx+sx,cy+sy-14,5,14);});
  ctx.restore();
}

function mWireless(ctx,cx,cy,t){
  ctx.save();
  // ground shadow
  ctx.fillStyle='rgba(60,50,30,.4)';ctx.beginPath();ctx.ellipse(cx,cy+30,32,14,0,0,Math.PI*2);ctx.fill();
  // little station hut at the base
  ctx.fillStyle='#8a7858';ctx.fillRect(cx-20,cy-8,40,38);
  ctx.fillStyle='#6a5840';ctx.beginPath();ctx.moveTo(cx-24,cy-8);ctx.lineTo(cx,cy-26);ctx.lineTo(cx+24,cy-8);ctx.fill();
  ctx.fillStyle=`rgba(255,200,90,${.5+Math.sin(t*2)*.15})`;ctx.fillRect(cx-6,cy+10,10,10);
  // mast rising from the hut
  ctx.strokeStyle='#7a6848';ctx.lineWidth=3;
  ctx.beginPath();ctx.moveTo(cx,cy-8);ctx.lineTo(cx,cy-118);ctx.stroke();
  // guy wires
  ctx.lineWidth=1;ctx.strokeStyle='rgba(120,105,75,.5)';
  ctx.beginPath();ctx.moveTo(cx,cy-70);ctx.lineTo(cx-26,cy-4);ctx.stroke();
  ctx.beginPath();ctx.moveTo(cx,cy-70);ctx.lineTo(cx+26,cy-4);ctx.stroke();
  // antenna crossbar
  ctx.lineWidth=2.5;ctx.strokeStyle='#8a7858';
  ctx.beginPath();ctx.moveTo(cx-14,cy-110);ctx.lineTo(cx+14,cy-110);ctx.stroke();
  // pulsing tip light
  const tipY=cy-118;
  ctx.fillStyle=`rgba(255,210,110,${.6+Math.sin(t*3)*.3})`;
  ctx.beginPath();ctx.arc(cx,tipY,4,0,Math.PI*2);ctx.fill();
  // broadcast waves rippling outward
  for(let i=0;i<3;i++){
    const r=18+((t*46+i*26)%70);
    const a=Math.max(0,.5-r/70);
    ctx.strokeStyle=`rgba(200,225,255,${a})`;ctx.lineWidth=1.4;
    ctx.beginPath();ctx.arc(cx,tipY,r,Math.PI*1.1,Math.PI*1.9);ctx.stroke();
  }
  // warm glow
  const gl=ctx.createRadialGradient(cx,tipY,0,cx,tipY,46);
  gl.addColorStop(0,'rgba(255,210,110,.5)');gl.addColorStop(1,'transparent');
  ctx.globalAlpha=.5+Math.sin(t*3)*.2;ctx.fillStyle=gl;
  ctx.beginPath();ctx.arc(cx,tipY,46,0,Math.PI*2);ctx.fill();
  ctx.restore();
}

// v01.14: ocean life — a small pier with a ship that sails out and back
// once per day (driven purely by the local clock, no dependencies), plus
// whales and boats that cross the water occasionally, same spawn pattern
// as the witches/dragons above.
function mPier(ctx,x,y,angle){
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);
  ctx.strokeStyle='rgba(90,66,42,.7)';ctx.lineWidth=10;ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(70,0);ctx.stroke();
  ctx.strokeStyle='rgba(60,42,26,.65)';ctx.lineWidth=4;
  for(let i=0;i<=70;i+=14){
    ctx.beginPath();ctx.moveTo(i,-7);ctx.lineTo(i,7);ctx.stroke();
  }
  ctx.fillStyle='rgba(60,42,26,.6)';
  ctx.beginPath();ctx.arc(70,-6,4,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(70,6,4,0,Math.PI*2);ctx.fill();
  ctx.restore();
}
function mShip(ctx,x,y,scale,bob,facingRight){
  ctx.save();ctx.translate(x,y+Math.sin(bob)*2*scale);
  if(!facingRight)ctx.scale(-1,1);
  ctx.scale(scale,scale);
  ctx.globalAlpha=.72;
  // hull
  ctx.fillStyle='rgba(58,40,26,.88)';
  ctx.beginPath();ctx.moveTo(-16,4);ctx.lineTo(16,4);ctx.lineTo(11,12);ctx.lineTo(-11,12);ctx.closePath();ctx.fill();
  // mast + sail
  ctx.strokeStyle='rgba(50,36,24,.85)';ctx.lineWidth=1.5;
  ctx.beginPath();ctx.moveTo(0,4);ctx.lineTo(0,-22);ctx.stroke();
  ctx.fillStyle='rgba(224,210,182,.82)';
  ctx.beginPath();ctx.moveTo(1,-21);ctx.lineTo(1,-2);ctx.lineTo(15,-4);ctx.closePath();ctx.fill();
  ctx.restore();
}
function mWhale(ctx,x,y,t){
  ctx.save();ctx.translate(x,y);ctx.globalAlpha=.55;
  ctx.fillStyle='rgba(40,58,72,.85)';
  ctx.beginPath();ctx.ellipse(0,0,26,9,0,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.moveTo(-24,0);ctx.quadraticCurveTo(-34,-10,-40,-2);ctx.quadraticCurveTo(-34,2,-24,4);ctx.closePath();ctx.fill();
  // spout, on a slow cycle
  const spout=Math.max(0,Math.sin(t*1.4));
  if(spout>.55){
    ctx.strokeStyle=`rgba(210,224,232,${(spout-.55)*1.6})`;ctx.lineWidth=3;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(8,-8);ctx.lineTo(8,-8-spout*16);ctx.stroke();
  }
  ctx.restore();
}
function mBoat(ctx,x,y,t,facingRight){
  mShip(ctx,x,y,0.7,t*2,facingRight);
}

function mIsland(ctx,cx,cy,rx,ry){
  ctx.save();
  ctx.fillStyle='#c8b878';ctx.beginPath();ctx.ellipse(cx,cy,rx+6,ry+6,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#2a4a1a';ctx.beginPath();ctx.ellipse(cx,cy,rx,ry,0,0,Math.PI*2);ctx.fill();
  const tr=Math.min(rx,ry)*.45;
  ctx.fillStyle='#1e3812';ctx.beginPath();ctx.arc(cx,cy,tr,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#2e5020';ctx.beginPath();ctx.arc(cx-2,cy-3,tr*.85,0,Math.PI*2);ctx.fill();
  ctx.restore();
}

function mBird(ctx,x,y,wing){
  ctx.save();ctx.strokeStyle='rgba(55,45,28,.5)';ctx.lineWidth=1.5;ctx.lineCap='round';
  const wa=Math.sin(wing)*5;
  ctx.beginPath();ctx.moveTo(x-7,y+wa);ctx.quadraticCurveTo(x-3,y,x,y-2);ctx.quadraticCurveTo(x+3,y,x+7,y+wa);ctx.stroke();
  ctx.restore();
}

function mFigure(ctx,x,y,step,dir){
  ctx.save();ctx.globalAlpha=.52;ctx.strokeStyle='#8a7050';ctx.lineWidth=2.5;ctx.lineCap='round';
  ctx.translate(x,y);if(dir<0)ctx.scale(-1,1);
  ctx.beginPath();ctx.moveTo(0,-6);ctx.lineTo(0,4);ctx.stroke();
  ctx.fillStyle='#c8a878';ctx.beginPath();ctx.arc(0,-9,4,0,Math.PI*2);ctx.fill();
  const ls=Math.sin(step)*4;
  ctx.beginPath();ctx.moveTo(0,4);ctx.lineTo(-3+ls,14);ctx.stroke();
  ctx.beginPath();ctx.moveTo(0,4);ctx.lineTo(3-ls,14);ctx.stroke();
  ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(-5+ls*.5,6);ctx.stroke();
  ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(5-ls*.5,6);ctx.stroke();
  ctx.restore();
}

function mCloud(ctx,x,y,w,h,op,dark){
  dark=dark||0;
  ctx.save();ctx.globalAlpha=op;
  const g=Math.round(255-dark*175),b=Math.round(255-dark*145);
  ctx.fillStyle=`rgba(${g},${g},${b},.88)`;
  const cx=x+w/2,cy=y+h/2;
  ctx.beginPath();ctx.ellipse(cx,cy,w/2,h/2,0,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.ellipse(cx-w*.22,cy,w*.3,h*.52,0,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.ellipse(cx+w*.22,cy,w*.3,h*.52,0,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.ellipse(cx-w*.08,cy-h*.18,w*.33,h*.42,0,0,Math.PI*2);ctx.fill();
  ctx.restore();
}

function mSandbox(ctx,cx,cy,t){
  ctx.save();
  // ground shadow
  ctx.fillStyle='rgba(40,45,60,.4)';ctx.beginPath();ctx.ellipse(cx,cy+28,36,14,0,0,Math.PI*2);ctx.fill();
  // crate stack (a little workbench/workshop feel)
  ctx.fillStyle='#7a6248';ctx.fillRect(cx-30,cy-2,26,26);
  ctx.strokeStyle='#5a4834';ctx.lineWidth=1.5;ctx.strokeRect(cx-30,cy-2,26,26);
  ctx.fillStyle='#8a7256';ctx.fillRect(cx+2,cy-14,28,38);
  ctx.strokeStyle='#5a4834';ctx.strokeRect(cx+2,cy-14,28,38);
  // little awning/tent over the workbench
  ctx.fillStyle='#5a6a78';ctx.beginPath();
  ctx.moveTo(cx-34,cy-14);ctx.lineTo(cx+16,cy-40);ctx.lineTo(cx+38,cy-14);ctx.closePath();ctx.fill();
  ctx.strokeStyle='#3e4a54';ctx.lineWidth=1.5;ctx.stroke();
  // support poles
  ctx.strokeStyle='#6a5840';ctx.lineWidth=2.5;
  ctx.beginPath();ctx.moveTo(cx-34,cy-14);ctx.lineTo(cx-34,cy+22);ctx.stroke();
  ctx.beginPath();ctx.moveTo(cx+38,cy-14);ctx.lineTo(cx+38,cy+22);ctx.stroke();
  // a small spark/lightbulb hovering above — the "something is being built here" cue
  const bob=Math.sin(t*1.8)*3;
  const glow=ctx.createRadialGradient(cx+16,cy-52+bob,0,cx+16,cy-52+bob,26);
  glow.addColorStop(0,`rgba(120,210,240,${.55+Math.sin(t*3)*.2})`);glow.addColorStop(1,'transparent');
  ctx.fillStyle=glow;ctx.beginPath();ctx.arc(cx+16,cy-52+bob,26,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#bfe8f5';ctx.beginPath();ctx.arc(cx+16,cy-52+bob,5,0,Math.PI*2);ctx.fill();
  // tiny orbiting motes — "ideas taking shape"
  for(let i=0;i<3;i++){
    const ang=t*1.2+i*(Math.PI*2/3);
    const mx=cx+16+Math.cos(ang)*13,my=cy-52+bob+Math.sin(ang)*7;
    ctx.fillStyle=`rgba(140,220,245,${.5+Math.sin(t*2+i)*.3})`;
    ctx.beginPath();ctx.arc(mx,my,2,0,Math.PI*2);ctx.fill();
  }
  ctx.restore();
}

function mRuins(ctx,cx,cy,t){
  ctx.save();
  ctx.globalAlpha=.72;
  ctx.fillStyle='rgba(76,66,48,.78)';
  for(let i=0;i<5;i++){
    const h=28+rand2(i,cx)*38;
    ctx.fillRect(cx-42+i*18,cy-h,10,h);
    ctx.fillStyle=i%2?'rgba(116,104,78,.76)':'rgba(76,66,48,.78)';
  }
  ctx.strokeStyle='rgba(210,178,104,.28)';ctx.lineWidth=2;
  ctx.beginPath();ctx.arc(cx,cy-12,62,Math.PI*1.05,Math.PI*1.9);ctx.stroke();
  const gl=ctx.createRadialGradient(cx,cy-26,0,cx,cy-26,82);
  gl.addColorStop(0,`rgba(152,105,215,${.12+Math.sin(t*1.2)*.04})`);
  gl.addColorStop(1,'transparent');
  ctx.fillStyle=gl;ctx.beginPath();ctx.arc(cx,cy-26,82,0,Math.PI*2);ctx.fill();
  ctx.restore();
}

function mMapLabel(ctx,x,y,text){
  ctx.save();
  ctx.font='italic 22px "IM Fell English", Georgia, serif';
  ctx.textAlign='center';
  const w=ctx.measureText(text).width+28;
  ctx.fillStyle='rgba(16,12,9,.54)';
  ctx.strokeStyle='rgba(222,178,92,.18)';
  ctx.lineWidth=1.5;
  roundRect(ctx,x-w/2,y-23,w,32,10);
  ctx.fill();ctx.stroke();
  ctx.fillStyle='rgba(242,228,196,.86)';
  ctx.shadowColor='rgba(0,0,0,.9)';ctx.shadowBlur=6;
  ctx.fillText(text,x,y);
  ctx.restore();
}

function roundRect(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);
}

function mWitch(ctx,x,y,t){
  ctx.save();ctx.translate(x,y);ctx.globalAlpha=.68;
  ctx.strokeStyle='rgba(28,20,20,.85)';ctx.lineWidth=4;ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(-20,8);ctx.lineTo(24,-2);ctx.stroke();
  ctx.fillStyle='rgba(32,22,38,.9)';
  ctx.beginPath();ctx.moveTo(-2,-18);ctx.lineTo(10,4);ctx.lineTo(-14,2);ctx.closePath();ctx.fill();
  ctx.fillStyle='rgba(210,166,70,.5)';
  ctx.beginPath();ctx.arc(-4,-6,4+Math.sin(t*6)*.8,0,Math.PI*2);ctx.fill();
  ctx.restore();
}

function mDragon(ctx,x,y,t,scale,bank,fire){
  scale=scale||1;bank=bank||1;fire=fire||0;
  const flap=Math.sin(t*8+bank)*22;
  ctx.save();
  ctx.globalAlpha=.18;
  ctx.fillStyle='rgba(0,0,0,.9)';
  ctx.beginPath();ctx.ellipse(x-28,y+74*scale,74*scale,18*scale,0,0,Math.PI*2);ctx.fill();
  ctx.restore();

  ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);ctx.rotate(Math.sin(t*1.4+bank)*.06);
  ctx.globalAlpha=.86;
  const body=ctx.createLinearGradient(-40,-18,42,20);
  body.addColorStop(0,'rgba(55,32,26,.95)');
  body.addColorStop(.55,'rgba(126,54,38,.94)');
  body.addColorStop(1,'rgba(170,92,54,.92)');
  ctx.fillStyle=body;
  ctx.beginPath();
  ctx.moveTo(-48,2);
  ctx.bezierCurveTo(-26,-22,20,-22,48,-4);
  ctx.bezierCurveTo(24,20,-24,19,-48,2);
  ctx.fill();

  ctx.strokeStyle='rgba(62,36,28,.95)';ctx.lineWidth=8;ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(-42,4);ctx.bezierCurveTo(-72,-14,-92,0,-114,24);ctx.stroke();
  ctx.beginPath();ctx.moveTo(40,-6);ctx.bezierCurveTo(58,-22,76,-20,92,-10);ctx.stroke();
  ctx.fillStyle='rgba(132,62,44,.96)';
  ctx.beginPath();ctx.ellipse(98,-10,15,10,-.25,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='rgba(245,210,110,.9)';
  ctx.beginPath();ctx.arc(103,-13,2.2,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='rgba(218,182,108,.78)';
  for(let i=0;i<6;i++){
    ctx.beginPath();ctx.moveTo(-28+i*13,-17);ctx.lineTo(-23+i*13,-28-rand2(i,7)*8);ctx.lineTo(-17+i*13,-15);ctx.fill();
  }

  function wing(side){
    ctx.save();ctx.scale(side,1);
    const tipY=-78+flap*side*.55;
    const membrane=ctx.createLinearGradient(-4,-12,-70,tipY);
    membrane.addColorStop(0,'rgba(156,68,48,.62)');
    membrane.addColorStop(1,'rgba(64,34,34,.38)');
    ctx.fillStyle=membrane;
    ctx.strokeStyle='rgba(70,38,30,.8)';
    ctx.lineWidth=3;
    ctx.beginPath();
    ctx.moveTo(-4,-8);
    ctx.bezierCurveTo(-30,-44,-52,tipY,-82,-60+flap*.2);
    ctx.lineTo(-52,-20);
    ctx.quadraticCurveTo(-30,-6,-4,-8);
    ctx.fill();ctx.stroke();
    ctx.strokeStyle='rgba(46,28,24,.55)';ctx.lineWidth=2;
    [[-20,-38],[-38,-54],[-56,-60]].forEach(p=>{
      ctx.beginPath();ctx.moveTo(-4,-8);ctx.lineTo(p[0],p[1]+flap*.18);ctx.stroke();
    });
    ctx.restore();
  }
  wing(1);wing(-1);

  ctx.strokeStyle='rgba(64,38,28,.92)';ctx.lineWidth=4;ctx.lineCap='round';
  [[-18,14],[-2,16],[18,14],[34,10]].forEach((p,i)=>{
    ctx.beginPath();ctx.moveTo(p[0],p[1]);ctx.lineTo(p[0]-4+Math.sin(t*8+i)*3,p[1]+17);ctx.stroke();
  });

  if(fire>.03){
    const fg=ctx.createRadialGradient(124,-8,0,150,-8,54);
    fg.addColorStop(0,`rgba(255,245,150,${fire})`);
    fg.addColorStop(.35,`rgba(255,108,42,${fire*.75})`);
    fg.addColorStop(1,'rgba(255,50,10,0)');
    ctx.fillStyle=fg;
    ctx.beginPath();
    ctx.moveTo(110,-9);
    ctx.bezierCurveTo(136,-32,164,-22,184,-4);
    ctx.bezierCurveTo(156,6,132,10,110,-9);
    ctx.fill();
  }
  ctx.restore();
}

function mCompass(ctx,x,y){
  ctx.save();ctx.globalAlpha=.42;
  ctx.fillStyle='rgba(10,8,14,.5)';ctx.beginPath();ctx.arc(x,y,30,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='rgba(200,160,80,.45)';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(x,y,30,0,Math.PI*2);ctx.stroke();
  ctx.fillStyle='rgba(200,80,60,.9)';
  ctx.beginPath();ctx.moveTo(x,y-24);ctx.lineTo(x+4,y-7);ctx.lineTo(x,y-12);ctx.lineTo(x-4,y-7);ctx.fill();
  ctx.fillStyle='rgba(200,160,80,.58)';
  ctx.beginPath();ctx.moveTo(x,y+24);ctx.lineTo(x+4,y+7);ctx.lineTo(x,y+12);ctx.lineTo(x-4,y+7);ctx.fill();
  ctx.fillStyle='rgba(200,160,80,.9)';ctx.font='bold 11px serif';ctx.textAlign='center';ctx.fillText('N',x,y-34);
  ctx.globalAlpha=.45;ctx.font='9px serif';
  ctx.fillText('S',x,y+42);ctx.fillText('E',x+40,y+3);ctx.fillText('W',x-40,y+3);
  ctx.restore();
}
