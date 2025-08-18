// High-level isometric RPG scaffold. Loads PNGs from resources/ via config.json

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvasToDisplaySize() {
	const { clientWidth, clientHeight } = canvas;
	if (canvas.width !== clientWidth || canvas.height !== clientHeight) {
		canvas.width = clientWidth;
		canvas.height = clientHeight;
	}
}

window.addEventListener('resize', resizeCanvasToDisplaySize);
resizeCanvasToDisplaySize();

const keys = new Set();
window.addEventListener('keydown', (e) => keys.add(e.key.toLowerCase()));
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

function loadImage(src) {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = reject;
		img.src = src;
	});
}

async function loadConfig() {
	const res = await fetch('./resources/config.json');
	if (!res.ok) throw new Error('Missing resources/config.json');
	return res.json();
}

function isoToScreen(ix, iy, iz, tileW, tileH) {
	const x = (ix - iy) * (tileW / 2);
	const y = (ix + iy) * (tileH / 2) - iz;
	return { x, y };
}

function screenToIso(sx, sy, tileW, tileH) {
	const ix = (sx / (tileW / 2) + sy / (tileH / 2)) / 2;
	const iy = (sy / (tileH / 2) - sx / (tileW / 2)) / 2;
	return { ix, iy };
}

class AssetStore {
	constructor() {
		this.images = new Map();
	}

	async load(name, path) {
		if (this.images.has(name)) return this.images.get(name);
		const img = await loadImage(path);
		this.images.set(name, img);
		return img;
	}

	get(name) { return this.images.get(name); }
}

class World {
	constructor(config, assets) {
		this.config = config;
		this.assets = assets;
		this.tileW = config.tile.pixelWidth;
		this.tileH = config.tile.pixelHeight;
		this.map = config.map;
		this.player = { ix: config.player.start[0], iy: config.player.start[1], iz: 0, speed: 4, sprite: config.player.sprite, frame: 0, animTime: 0 };
		this.camera = { x: 0, y: 0, lerp: 0.15 };
	}

	update(dt) {
		const run = keys.has('shift');
		const speed = this.player.speed * (run ? 1.7 : 1.0);
		let dx = 0, dy = 0;
		if (keys.has('arrowup') || keys.has('w')) dy -= 1;
		if (keys.has('arrowdown') || keys.has('s')) dy += 1;
		if (keys.has('arrowleft') || keys.has('a')) dx -= 1;
		if (keys.has('arrowright') || keys.has('d')) dx += 1;
		if (dx !== 0 || dy !== 0) {
			const len = Math.hypot(dx, dy) || 1;
			this.player.ix += (dx / len) * (speed * dt);
			this.player.iy += (dy / len) * (speed * dt);
			this.player.animTime += dt;
			if (this.player.animTime > 0.12) { this.player.frame = (this.player.frame + 1) % 4; this.player.animTime = 0; }
		}
		// clamp to map bounds
		this.player.ix = Math.max(0, Math.min(this.map.width - 1, this.player.ix));
		this.player.iy = Math.max(0, Math.min(this.map.height - 1, this.player.iy));
		const screen = this.worldToScreen(this.player.ix, this.player.iy, this.player.iz);
		const targetCamX = screen.x;
		const targetCamY = screen.y;
		this.camera.x += (targetCamX - this.camera.x) * this.camera.lerp;
		this.camera.y += (targetCamY - this.camera.y) * this.camera.lerp;
	}

	worldToScreen(ix, iy, iz) {
		const p = isoToScreen(ix, iy, iz, this.tileW, this.tileH);
		return { x: p.x, y: p.y };
	}

	draw() {
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		ctx.save();
		ctx.translate(canvas.width / 2 - this.camera.x, canvas.height / 2 - this.camera.y);

		// Draw ground tiles
		const groundName = this.config.tile.ground;
		const groundImg = this.assets.get(groundName);
		for (let j = 0; j < this.map.height; j++) {
			for (let i = 0; i < this.map.width; i++) {
				const { x, y } = isoToScreen(i, j, 0, this.tileW, this.tileH);
				ctx.drawImage(groundImg, x - this.tileW / 2, y - this.tileH / 2, this.tileW, this.tileH);
			}
		}

		// Draw props layer (simple one-per-cell index referencing config.props entries)
		if (Array.isArray(this.map.props)) {
			for (let j = 0; j < this.map.height; j++) {
				for (let i = 0; i < this.map.width; i++) {
					const propKey = this.map.props[j][i];
					if (!propKey) continue;
					const prop = this.config.props[propKey];
					if (!prop) continue;
					const img = this.assets.get(prop.sprite);
					const { x, y } = isoToScreen(i, j, prop.offsetZ || 0, this.tileW, this.tileH);
					ctx.drawImage(img, x - img.width / 2, y - img.height + (this.tileH / 2));
				}
			}
		}

		// Draw player (simple 4-frame row sprite)
		const playerImg = this.assets.get(this.player.sprite);
		const frames = 4;
		const frameW = Math.floor(playerImg.width / frames);
		const frameH = playerImg.height;
		const { x: px, y: py } = this.worldToScreen(this.player.ix, this.player.iy, this.player.iz);
		ctx.drawImage(
			playerImg,
			this.player.frame * frameW,
			0,
			frameW,
			frameH,
			px - frameW / 2,
			py - frameH + (this.tileH / 2),
			frameW,
			frameH
		);

		ctx.restore();
	}
}

async function boot() {
	try {
		const config = await loadConfig();
		const assets = new AssetStore();
		// Preload declared assets
		const promises = [];
		promises.push(assets.load(config.tile.ground, `./resources/${config.tile.ground}`));
		promises.push(assets.load(config.player.sprite, `./resources/${config.player.sprite}`));
		if (config.props) {
			for (const key of Object.keys(config.props)) {
				promises.push(assets.load(config.props[key].sprite, `./resources/${config.props[key].sprite}`));
			}
		}
		await Promise.all(promises);
		const world = new World(config, assets);

		let last = performance.now();
		function frame(now) {
			const dt = Math.min(0.05, (now - last) / 1000);
			last = now;
			world.update(dt);
			world.draw();
			requestAnimationFrame(frame);
		}
		requestAnimationFrame(frame);
	} catch (err) {
		console.error(err);
		ctx.fillStyle = '#f55';
		ctx.font = '16px monospace';
		ctx.fillText('Error: ' + err.message, 16, 24);
	}
}

boot();

