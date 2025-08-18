// Isometric RPG Sample (SFW). Plain Canvas 2D.

/** @typedef {{x:number,y:number}} Vec2 */

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
const TILE_W = 64; // base tile width before iso transform
const TILE_H = 32; // base tile height before iso transform
const MAP_W = 20;
const MAP_H = 20;

const keys = new Set();

/** Resize canvas to fill window */
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = Math.floor(w * DPR);
  canvas.height = Math.floor(h * DPR);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}

window.addEventListener('resize', resize);
resize();

// Generate a PNG sprite dynamically using an offscreen canvas
function createPlayerPng() {
  const s = 48;
  const off = document.createElement('canvas');
  off.width = s; off.height = s;
  const octx = off.getContext('2d');
  // Simple circular character with face
  octx.fillStyle = '#ffc857';
  octx.beginPath();
  octx.arc(s/2, s/2, s*0.42, 0, Math.PI*2);
  octx.fill();

  // Eyes
  octx.fillStyle = '#1f2937';
  octx.beginPath();
  octx.arc(s*0.38, s*0.44, s*0.05, 0, Math.PI*2);
  octx.arc(s*0.62, s*0.44, s*0.05, 0, Math.PI*2);
  octx.fill();

  // Smile
  octx.strokeStyle = '#1f2937';
  octx.lineWidth = 2.5;
  octx.beginPath();
  octx.arc(s/2, s*0.56, s*0.16, 0.15*Math.PI, 0.85*Math.PI);
  octx.stroke();

  const url = off.toDataURL('image/png');
  const img = new Image();
  img.src = url;
  return img;
}

const playerImg = createPlayerPng();

// Map generation: 0=grass, 1=stone, 2=water
const map = new Array(MAP_H).fill(0).map((_, y) =>
  new Array(MAP_W).fill(0).map((__, x) => {
    const n = (Math.sin(x*0.8) + Math.cos(y*0.7) + Math.sin((x+y)*0.35));
    if (n > 1.2) return 1; // stone
    if (n < -1.0) return 2; // water
    return 0; // grass
  })
);

// Player state in tile space (x,y) continuous
const player = {
  x: MAP_W/2,
  y: MAP_H/2,
  speed: 3.5, // tiles per second
};

canvas.addEventListener('keydown', (e) => {
  keys.add(e.key.toLowerCase());
  if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)) e.preventDefault();
});
canvas.addEventListener('keyup', (e) => {
  keys.delete(e.key.toLowerCase());
});
canvas.focus();

function worldToScreen(wx, wy, camera) {
  // isometric projection: screenX = (x - y) * TILE_W/2, screenY = (x + y) * TILE_H/2
  const sx = (wx - wy) * (TILE_W/2) - camera.x + canvas.width/(DPR*2);
  const sy = (wx + wy) * (TILE_H/2) - camera.y + canvas.height/(DPR*2);
  return {x: sx, y: sy};
}

function drawIsoTile(tx, ty, color, camera) {
  const c = worldToScreen(tx, ty, camera);
  ctx.beginPath();
  ctx.moveTo(c.x, c.y - TILE_H/2);
  ctx.lineTo(c.x + TILE_W/2, c.y);
  ctx.lineTo(c.x, c.y + TILE_H/2);
  ctx.lineTo(c.x - TILE_W/2, c.y);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.stroke();
}

function drawMap(camera) {
  // Determine visible tile bounds with generous padding
  const pad = 3;
  const cols = MAP_W;
  const rows = MAP_H;
  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      const type = map[ty][tx];
      let color = '#3a5f3f'; // grass
      if (type === 1) color = '#7a7d85';
      if (type === 2) color = '#2b5e86';
      drawIsoTile(tx, ty, color, camera);
    }
  }
}

function drawPlayer(camera, t) {
  const c = worldToScreen(player.x, player.y, camera);
  // subtle bob animation
  const bob = Math.sin(t * 6.283 * 0.8) * 3;
  const w = 38; const h = 38;
  ctx.drawImage(playerImg, c.x - w/2, c.y - h + bob - 4, w, h);
}

function collide(nx, ny) {
  const gx = Math.round(nx);
  const gy = Math.round(ny);
  if (gx < 0 || gy < 0 || gx >= MAP_W || gy >= MAP_H) return true;
  const t = map[gy][gx];
  return t === 2; // water blocks
}

const camera = { x: 0, y: 0 };

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;

  // Update
  const move = {x: 0, y: 0};
  if (keys.has('arrowup') || keys.has('w')) move.y -= 1;
  if (keys.has('arrowdown') || keys.has('s')) move.y += 1;
  if (keys.has('arrowleft') || keys.has('a')) move.x -= 1;
  if (keys.has('arrowright') || keys.has('d')) move.x += 1;
  const sprint = keys.has('shift');

  // Convert input from screen-space to iso tile-space directions
  let dx = 0, dy = 0;
  if (move.x !== 0 || move.y !== 0) {
    const len = Math.hypot(move.x, move.y) || 1;
    const nx = move.x / len;
    const ny = move.y / len;
    // screen to isometric mapping: horizontal impacts both axes
    dx = (nx - ny) * 0.7071;
    dy = (nx + ny) * 0.7071;
    const spd = player.speed * (sprint ? 1.7 : 1.0);
    const nxp = player.x + dx * spd * dt;
    const nyp = player.y + dy * spd * dt;
    // simple separate axis collision
    if (!collide(nxp, player.y)) player.x = nxp;
    if (!collide(player.x, nyp)) player.y = nyp;
  }

  // Camera follows player
  const target = worldToScreen(player.x, player.y, {x:0,y:0});
  const cx = target.x - canvas.width/(DPR*2);
  const cy = target.y - canvas.height/(DPR*2) + 24;
  camera.x += (cx - camera.x) * Math.min(1, dt * 6);
  camera.y += (cy - camera.y) * Math.min(1, dt * 6);

  // Render
  ctx.clearRect(0, 0, canvas.width/DPR, canvas.height/DPR);
  // Ground shadow
  ctx.fillStyle = '#0a0c10';
  ctx.fillRect(0, 0, canvas.width/DPR, canvas.height/DPR);

  drawMap(camera);
  drawPlayer(camera, now/1000);

  // Simple tooltip at mouse tile
  if (hoverTile) {
    const c = worldToScreen(hoverTile.x, hoverTile.y, camera);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.beginPath();
    ctx.moveTo(c.x, c.y - TILE_H/2);
    ctx.lineTo(c.x + TILE_W/2, c.y);
    ctx.lineTo(c.x, c.y + TILE_H/2);
    ctx.lineTo(c.x - TILE_W/2, c.y);
    ctx.closePath();
    ctx.fill();
  }

  requestAnimationFrame(loop);
}

let hoverTile = null;
canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left - canvas.width/(DPR*2);
  const my = e.clientY - rect.top - canvas.height/(DPR*2);
  const sx = mx + camera.x;
  const sy = my + camera.y;
  // Inverse isometric transform
  const wx = (sy / (TILE_H/2) + sx / (TILE_W/2)) / 2;
  const wy = (sy / (TILE_H/2) - sx / (TILE_W/2)) / 2;
  const tx = Math.round(wx);
  const ty = Math.round(wy);
  if (tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H) {
    hoverTile = {x: tx, y: ty};
  } else hoverTile = null;
});

requestAnimationFrame(loop);

