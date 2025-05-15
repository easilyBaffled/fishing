import './style.css'; // CSS for the demo

/*****************************************
 * 1 — Secure-context guard
 *****************************************/
if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
  document.getElementById('overlay').hidden = false;
  // Stop everything else
  throw new Error('Insecure context');
}

/*****************************************
 * 2 — Canvas setup & DPR cap
 *****************************************/
const canvas = document.getElementById('game');
const ctx    = canvas.getContext('2d');
// Cap DPR to avoid huge bitmaps on older phones
const DPR = Math.min(2, window.devicePixelRatio || 1);

function fitCanvas(){
  canvas.width  = window.innerWidth  * DPR;
  canvas.height = window.innerHeight * DPR;
}
window.addEventListener('resize', fitCanvas, { passive:true });
fitCanvas();

/*****************************************
 * 3 — Game state & messaging
 *****************************************/
let state    = 'idle';   // idle → waitFish → fishOn
let rodLen   = 0;        // cast strength (0–1)
let score    = 0;
let biteTID  = null;
let motionEnabled = false;
const msgEl = document.getElementById('msg');
function setMsg(t){ msgEl.textContent = t; }

/*****************************************
 * 4 — Capability detection & fallbacks
 *****************************************/
// AudioContext for beep fallback if vibrate unsupported
const audioCtx = window.AudioContext ? new AudioContext() : null;
function beep(duration=100){
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain); gain.connect(audioCtx.destination);
  osc.frequency.value = 440;
  osc.start();
  gain.gain.setValueAtTime(1, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration/1000);
  osc.stop(audioCtx.currentTime + duration/1000);
}

/*****************************************
 * 5 — Tap-fallback controls (if no motion)
 *****************************************/
function initTapFallback(){
  setMsg('✋ Tap to cast');
  canvas.addEventListener('touchstart', function onTap(){
    if(state === 'idle')    cast(1);
    else if(state === 'fishOn') reel();
    // remain listening for next round
  }, false);
}

/*****************************************
 * 6 — Motion permission & handler init
 *****************************************/
const permitBtn = document.getElementById('permitBtn');
function requestMotionIfNeeded(){
  // No API – fallback to tap
  if (typeof DeviceMotionEvent === 'undefined') {
    initTapFallback();
    return;
  }
  // iOS 13+ path
  if (typeof DeviceMotionEvent.requestPermission === 'function') {
    permitBtn.hidden = false;
    permitBtn.onclick = async ()=>{
      try {
        const res = await DeviceMotionEvent.requestPermission();
        if (res === 'granted') {
          permitBtn.remove();
          initMotion();
        } else {
          // Permission denied – offer tap fallback and retry
          permitBtn.textContent = 'Enable Motion Controls';
          setMsg('🚫 Motion denied – tap to play');
          initTapFallback();
        }
      } catch(err){
        console.error(err);
        setMsg('⚠️ Motion error – tap to play');
        initTapFallback();
      }
    };
  } else {
    // Chrome/Android path
    initMotion();
  }
}

/*****************************************
 * 7 — Orientation-agnostic axis helper
 *****************************************/
function getPrimaryAccel(e){
  // e.accelerationIncludingGravity.{x,y,z}
  const ag = e.accelerationIncludingGravity;
  // Determine rotation angle (0,90,180,270)
  const angle = screen.orientation?.angle ?? window.orientation ?? 0;
  switch(angle){
    case  90: return  ag.x;  // landscape-left
    case -90: return -ag.x;  // landscape-right
    case 180: return -ag.z;  // upside-down portrait
    case   0:
    default:  return  ag.z;  // normal portrait
  }
}

/*****************************************
 * 8 — Gesture detection & thresholds
 *****************************************/
const THRESHOLDS = {
  flick: -15,   // negative primary axis = forward
  pull :  12
};
const COOLDOWN = 700; // ms
let lastCast = 0, lastPull = 0;

function initMotion(){
  motionEnabled = true;
  window.addEventListener('devicemotion', e=>{
    const now = Date.now();
    const a = getPrimaryAccel(e);

    // CAST gesture
    if (state==='idle'
      && a < THRESHOLDS.flick
      && (now - lastCast) > COOLDOWN
    ){
      lastCast = now;
      cast(Math.min(Math.abs(a)/25, 1));
    }

    // REEL gesture
    if (state==='fishOn'
      && a > THRESHOLDS.pull
      && (now - lastPull) > COOLDOWN
    ){
      lastPull = now;
      reel();
    }
  }, { passive:true });
}

/*****************************************
 * 9 — Core game logic
 *****************************************/
function cast(power){
  rodLen = power;
  state  = 'waitFish';
  setMsg('🎣 Waiting…');
  // random bite in 1.5–5s
  biteTID = setTimeout(()=>{
    state='fishOn';
    if ('vibrate' in navigator) navigator.vibrate(200);
    else beep(200);
    setMsg('🐟 Pull back!');
  }, 1500 + Math.random()*3500);
}

function reel(){
  clearTimeout(biteTID);
  if ('vibrate' in navigator) navigator.vibrate([100,60,100]);
  else beep(200);
  const success = Math.random() < 0.3 + rodLen*0.7;
  if (success){
    score++;
    setMsg(`✅ Caught! Fish: ${score} – flick again`);
  } else {
    setMsg('❌ It got away – try again');
  }
  state='idle'; rodLen=0;
}

/*****************************************
 * 10 — Render loop (pauses when idle)
 *****************************************/
// Colors
const C = {
  sky   : '#29adff',
  wave1 : '#3b5dc9',
  wave2 : '#1d2b53',
  shore : '#d2b48c',
  line  : '#000'
};
let waveOffset = 0;
let animID = null;

function draw(){
  const w = canvas.width, h = canvas.height;

  // Sky
  ctx.fillStyle = C.sky;
  ctx.fillRect(0, 0, w, h);

  // Water stripes
  const stripeH = 6 * DPR;
  waveOffset = (waveOffset + 0.3) % (stripeH * 2);
  for(let y = -waveOffset; y < h; y += stripeH*2){
    ctx.fillStyle = C.wave1;
    ctx.fillRect(0, y, w, stripeH);
    ctx.fillStyle = C.wave2;
    ctx.fillRect(0, y + stripeH, w, stripeH);
  }

  // Shore
  const shoreH = 40 * DPR;
  ctx.fillStyle = C.shore;
  ctx.fillRect(0, h - shoreH, w, shoreH);

  // Line
  ctx.strokeStyle = C.line; ctx.lineWidth = 1*DPR;
  const x = w/2;
  const y0 = h - shoreH;
  const y1 = y0 - rodLen * (h - shoreH - 20*DPR);
  ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();

  // Bobber or fish
  if (state === 'waitFish')      drawBobber(x, y1);
  else if (state === 'fishOn')   drawFish(x, y1);

  // Schedule next frame only if we might need animation
  if (state !== 'idle'){
    animID = requestAnimationFrame(draw);
  } else {
    cancelAnimationFrame(animID);
    animID = null;
  }
}

// Helper: bobber
function drawBobber(cx, cy){
  ctx.save(); ctx.translate(cx, cy);
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(0,0,8*DPR,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = '#ff4545';
  ctx.beginPath(); ctx.arc(0,0,8*DPR,Math.PI,0); ctx.fill();
  ctx.restore();
}

// Helper: simple fish
function drawFish(cx, cy){
  ctx.save(); ctx.translate(cx, cy);
  ctx.fillStyle = '#00e436';
  ctx.fillRect(-12*DPR,-4*DPR,24*DPR,8*DPR);
  ctx.beginPath();
  ctx.moveTo(12*DPR,0);
  ctx.lineTo(18*DPR,6*DPR);
  ctx.lineTo(18*DPR,-6*DPR);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle='#000';
  ctx.beginPath(); ctx.arc(-6*DPR,-2*DPR,1.5*DPR,0,Math.PI*2); ctx.fill();
  ctx.restore();
}

/*****************************************
 * 11 — Start everything
 *****************************************/
requestMotionIfNeeded();
draw();