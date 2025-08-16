// Core Stronghold TD prototype
// Minimal, readable implementation for a hex-grid base defense with waves and resources

const HEX_SIZE = 32; // pixel radius
const GRID_RADIUS = 8; // hex radius from center (creates ~217 tiles)
const DEMO_WAVE_INTERVAL_SECONDS = 45; // use 45s for demo; adjust to 300 for 5 minutes
const MAX_WAVES = 6; // final wave completes mission

// Resources
const STARTING_RESOURCES = { gold: 200, food: 100, wood: 150, stone: 75 };

// Costs
const COSTS = {
	TownHall: { gold: 0, food: 0, wood: 0, stone: 0 }, // pre-placed
	Farm: { gold: 25, food: 0, wood: 30, stone: 0 },
	LumberMill: { gold: 30, food: 0, wood: 20, stone: 0 },
	Quarry: { gold: 30, food: 0, wood: 10, stone: 0 },
	GoldMine: { gold: 0, food: 0, wood: 30, stone: 20 },
	Wall: { gold: 5, food: 0, wood: 10, stone: 5 },
	Tower: { gold: 50, food: 0, wood: 40, stone: 20 },
	Barracks: { gold: 60, food: 0, wood: 50, stone: 25 },
};

// Production per 5-second tick
const PRODUCTION = {
	Farm: { food: 5 },
	LumberMill: { wood: 6 },
	Quarry: { stone: 4 },
	GoldMine: { gold: 5 },
};

// Soldiers and towers
const SOLDIER = {
	foodCost: 5,
	trainSeconds: 4,
	maxPerBarracks: 5
};

const TOWER = {
	range: 3, // in hexes
	damage: 8,
	fireCooldownSeconds: 0.8
};

// Enemy stats scale per wave
function getWaveSpec(waveNumber) {
	const baseCount = 6 + waveNumber * 3;
	const baseHp = 40 + waveNumber * 15;
	const baseSpeed = 60 + waveNumber * 5;
	return { count: baseCount, hp: baseHp, speed: baseSpeed };
}

// Axial hex helpers (pointy top)
function axialToPixel(q, r) {
	const x = HEX_SIZE * (Math.sqrt(3) * q + Math.sqrt(3)/2 * r);
	const y = HEX_SIZE * (3/2 * r);
	return { x, y };
}

function hexDistance(a, b) {
	return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
}

function neighbors(q, r) {
	return [
		{ q: q + 1, r },
		{ q: q + 1, r: r - 1 },
		{ q, r: r - 1 },
		{ q: q - 1, r },
		{ q: q - 1, r: r + 1 },
		{ q, r: r + 1 },
	];
}

function axialKey(q, r) {
	return `${q},${r}`;
}

export class GameScene extends Phaser.Scene {
	constructor() {
		super('GameScene');
		this.grid = new Map(); // key -> { q, r, x, y, building: string|null }
		this.resources = { ...STARTING_RESOURCES };
		this.waveNumber = 0;
		this.nextWaveAt = 0;
		this.enemies = [];
		this.projectiles = [];
		this.playerUnits = [];
		this.ui = {};
		this.selectedBuilding = 'Wall';
		this.hqCell = null;
		this.pathCache = null; // cache path for simple pathing
	}

	create() {
		this.cameras.main.setBackgroundColor('#0b0e13');
		this.createHexGrid();
		this.createHQ();
		this.createUI();
		this.enableInput();

		this.nextWaveAt = this.time.now + DEMO_WAVE_INTERVAL_SECONDS * 1000;

		// Resource production tick
		this.time.addEvent({ delay: 5000, loop: true, callback: () => this.produceResources() });

		// Tower fire tick
		this.time.addEvent({ delay: 150, loop: true, callback: () => this.towersTryFire() });
	}

	update(_, dtMs) {
		this.updateEnemies(dtMs / 1000);
		this.updateProjectiles(dtMs / 1000);
		this.updateUI();
		this.maybeStartNextWave();
	}

	createHexGrid() {
		// center screen origin
		const centerX = this.scale.width / 2;
		const centerY = this.scale.height / 2;

		for (let q = -GRID_RADIUS; q <= GRID_RADIUS; q++) {
			const r1 = Math.max(-GRID_RADIUS, -q - GRID_RADIUS);
			const r2 = Math.min(GRID_RADIUS, -q + GRID_RADIUS);
			for (let r = r1; r <= r2; r++) {
				const { x, y } = axialToPixel(q, r);
				const worldX = centerX + x;
				const worldY = centerY + y;
				const cell = { q, r, x: worldX, y: worldY, building: null };
				this.grid.set(axialKey(q, r), cell);

				const poly = this.add.polygon(worldX, worldY, this.hexPoints(HEX_SIZE - 1), 0x1a2433, 1)
					.setStrokeStyle(1, 0x223048, 1)
					.setInteractive({ useHandCursor: true });
				poly.on('pointerover', () => this.onCellHover(cell, poly));
				poly.on('pointerout', () => this.onCellOut());
				poly.on('pointerdown', (p) => this.onCellClick(cell, poly, p));
				cell.poly = poly;
			}
		}
	}

	hexPoints(size) {
		const points = [];
		for (let i = 0; i < 6; i++) {
			const angle = Math.PI / 180 * (60 * i - 30);
			points.push(size * Math.cos(angle), size * Math.sin(angle));
		}
		return points;
	}

	createHQ() {
		// Place HQ at axial (0,0)
		const cell = this.grid.get(axialKey(0, 0));
		cell.building = { type: 'TownHall', hp: 1000, maxHp: 1000 };
		const icon = this.add.circle(cell.x, cell.y, HEX_SIZE * 0.7, 0x2e7d32).setStrokeStyle(2, 0x9ccc65);
		const label = this.add.text(cell.x, cell.y, 'HQ', { fontSize: 14, color: '#e6fffa' }).setOrigin(0.5);
		cell.icon = icon; cell.label = label;
		this.hqCell = cell;
	}

	createUI() {
		this.ui.resourcesText = this.add.text(12, 10, '', { fontSize: 14, color: '#cbd5e1' }).setDepth(10).setScrollFactor(0);
		this.ui.waveText = this.add.text(12, 30, '', { fontSize: 14, color: '#9fe4a4' }).setDepth(10).setScrollFactor(0);

		// Building toolbar
		const toolbar = this.add.container(12, 56).setDepth(10);
		const buttons = [
			{ key: 'Wall', color: 0x475569, hint: 'Wall: cheap blocker' },
			{ key: 'Tower', color: 0x7c3aed, hint: 'Tower: shoots enemies' },
			{ key: 'Barracks', color: 0x0ea5e9, hint: 'Barracks: trains soldiers' },
			{ key: 'Farm', color: 0x22c55e, hint: 'Farm: +Food' },
			{ key: 'LumberMill', color: 0x9ca3af, hint: 'Lumber: +Wood' },
			{ key: 'Quarry', color: 0x94a3b8, hint: 'Quarry: +Stone' },
			{ key: 'GoldMine', color: 0xf59e0b, hint: 'Mine: +Gold' },
		];
		let ox = 0;
		const tooltip = document.getElementById('tooltip');
		for (const b of buttons) {
			const rect = this.add.rectangle(0, 0, 90, 26, b.color, 1).setStrokeStyle(1, 0x1f2937).setOrigin(0, 0.5)
				.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.selectedBuilding = b.key)
				.on('pointerover', (p) => {
					tooltip.textContent = `${b.key} | Cost g:${COSTS[b.key].gold} f:${COSTS[b.key].food||0} w:${COSTS[b.key].wood||0} s:${COSTS[b.key].stone||0}`;
					tooltip.style.opacity = '1';
					tooltip.style.left = `${p.event.clientX + 10}px`;
					tooltip.style.top = `${p.event.clientY + 10}px`;
				})
				.on('pointerout', () => tooltip.style.opacity = '0');
			const t = this.add.text(8, 0, b.key, { fontSize: 12, color: '#e2e8f0' }).setOrigin(0, 0.5);
			const btn = this.add.container(ox, 0, [rect, t]).setSize(90, 26);
			toolbar.add(btn);
			ox += 96;
		}
		this.ui.toolbar = toolbar;

		// Train button
		this.ui.trainBtn = this.add.text(12, this.scale.height - 24, 'Train Soldier (-5 food)', { fontSize: 14, color: '#f0fdf4', backgroundColor: '#14532d' })
			.setPadding(6, 4, 6, 4).setDepth(10).setScrollFactor(0)
			.setInteractive({ useHandCursor: true })
			.on('pointerdown', () => this.trainSoldier());
	}

	enableInput() {
		this.input.on('pointermove', (p) => {
			const tooltip = document.getElementById('tooltip');
			if (tooltip.style.opacity === '1') {
				tooltip.style.left = `${p.event.clientX + 10}px`;
				tooltip.style.top = `${p.event.clientY + 10}px`;
			}
		});
	}

	//-------------------------------------------------------
	// Building placement and economy
	//-------------------------------------------------------
	onCellHover(cell, poly) {
		poly.setFillStyle(0x263242);
	}

	onCellOut() {
		// reset handled via update visuals
	}

	onCellClick(cell, poly, pointer) {
		if (pointer.rightButtonDown()) {
			return; // reserved for future actions
		}
		if (cell.building) return;
		if (hexDistance(cell, this.hqCell) < 2 && this.selectedBuilding !== 'Wall') {
			return; // keep inner ring clear except walls
		}
		const cost = COSTS[this.selectedBuilding];
		if (!this.canAfford(cost)) return;
		this.pay(cost);
		this.placeBuilding(cell, this.selectedBuilding);
		this.pathCache = null; // grid changed -> rebuild path
	}

	placeBuilding(cell, type) {
		let icon;
		switch (type) {
			case 'Wall': icon = this.add.rectangle(cell.x, cell.y, HEX_SIZE * 1.3, HEX_SIZE * 0.5, 0x64748b).setStrokeStyle(2, 0x94a3b8); break;
			case 'Tower': icon = this.add.polygon(cell.x, cell.y, this.hexPoints(HEX_SIZE * 0.6), 0x7c3aed).setStrokeStyle(2, 0xa78bfa); break;
			case 'Barracks': icon = this.add.rectangle(cell.x, cell.y, HEX_SIZE * 1.1, HEX_SIZE * 0.9, 0x0ea5e9).setStrokeStyle(2, 0x7dd3fc); break;
			case 'Farm': icon = this.add.rectangle(cell.x, cell.y, HEX_SIZE * 1.1, HEX_SIZE * 0.9, 0x16a34a).setStrokeStyle(2, 0x86efac); break;
			case 'LumberMill': icon = this.add.rectangle(cell.x, cell.y, HEX_SIZE * 1.1, HEX_SIZE * 0.9, 0x475569).setStrokeStyle(2, 0xcbd5e1); break;
			case 'Quarry': icon = this.add.rectangle(cell.x, cell.y, HEX_SIZE * 1.1, HEX_SIZE * 0.9, 0x334155).setStrokeStyle(2, 0x94a3b8); break;
			case 'GoldMine': icon = this.add.rectangle(cell.x, cell.y, HEX_SIZE * 1.1, HEX_SIZE * 0.9, 0xf59e0b).setStrokeStyle(2, 0xfbbf24); break;
			default: return;
		}
		cell.building = { type, hp: type === 'Wall' ? 150 : 250, maxHp: type === 'Wall' ? 150 : 250, cooldown: 0, trained: 0 };
		cell.icon = icon;
	}

	produceResources() {
		for (const cell of this.grid.values()) {
			if (!cell.building) continue;
			const prod = PRODUCTION[cell.building.type];
			if (!prod) continue;
			for (const k of Object.keys(prod)) {
				this.resources[k] = (this.resources[k] || 0) + prod[k];
			}
		}
	}

	canAfford(cost) {
		return this.resources.gold >= (cost.gold || 0)
			&& this.resources.food >= (cost.food || 0)
			&& this.resources.wood >= (cost.wood || 0)
			&& this.resources.stone >= (cost.stone || 0);
	}

	pay(cost) {
		this.resources.gold -= (cost.gold || 0);
		this.resources.food -= (cost.food || 0);
		this.resources.wood -= (cost.wood || 0);
		this.resources.stone -= (cost.stone || 0);
	}

	trainSoldier() {
		if (this.resources.food < SOLDIER.foodCost) return;
		const barracksCells = [...this.grid.values()].filter(c => c.building?.type === 'Barracks');
		if (barracksCells.length === 0) return;
		const spot = barracksCells.find(c => (c.building.trained || 0) < SOLDIER.maxPerBarracks);
		if (!spot) return;
		this.resources.food -= SOLDIER.foodCost;
		spot.building.trained = (spot.building.trained || 0) + 1;
		const unit = this.add.circle(spot.x, spot.y, HEX_SIZE * 0.28, 0x22d3ee).setStrokeStyle(2, 0x67e8f9);
		const obj = this.physics.add.existing(unit);
		obj.body.setCircle(HEX_SIZE * 0.28);
		this.playerUnits.push({ sprite: unit, hp: 60, speed: 80 });
	}

	//-------------------------------------------------------
	// Waves and enemies
	//-------------------------------------------------------
	maybeStartNextWave() {
		if (this.waveNumber >= MAX_WAVES) return;
		if (this.time.now < this.nextWaveAt) return;
		this.waveNumber += 1;
		const spec = getWaveSpec(this.waveNumber);
		this.spawnWave(spec);
		if (this.waveNumber < MAX_WAVES) {
			this.nextWaveAt = this.time.now + DEMO_WAVE_INTERVAL_SECONDS * 1000;
		}
	}

	spawnWave(spec) {
		// spawn around outer ring
		const spawns = [...this.grid.values()].filter(c => Math.abs(c.q) === GRID_RADIUS || Math.abs(c.r) === GRID_RADIUS || Math.abs(c.q + c.r) === GRID_RADIUS);
		for (let i = 0; i < spec.count; i++) {
			const cell = spawns[Math.floor(Math.random() * spawns.length)];
			const enemy = this.add.circle(cell.x, cell.y, HEX_SIZE * 0.35, 0xef4444).setStrokeStyle(2, 0xfca5a5);
			const obj = this.physics.add.existing(enemy);
			obj.body.setCircle(HEX_SIZE * 0.35);
			this.enemies.push({ sprite: enemy, hp: spec.hp, speed: spec.speed, targetCell: this.hqCell });
		}
	}

	// Simple pathing: greedy move along cached shortest path built via BFS on hex grid avoiding buildings (walls/towers/barracks count as blocked)
	buildPath() {
		// BFS from HQ outwards to compute parents
		const blocked = new Set(
			[...this.grid.values()]
				.filter(c => c.building && c.building.type !== 'Farm' && c.building.type !== 'LumberMill' && c.building.type !== 'Quarry' && c.building.type !== 'GoldMine' && c.building.type !== 'TownHall')
				.map(c => axialKey(c.q, c.r))
		);
		// Allow enemies to break walls: we still consider them blocked for routing; enemies will attack when blocked
		const startKey = axialKey(this.hqCell.q, this.hqCell.r);
		const queue = [this.hqCell];
		const visited = new Set([startKey]);
		const parent = new Map();
		while (queue.length > 0) {
			const cur = queue.shift();
			for (const nb of neighbors(cur.q, cur.r)) {
				const k = axialKey(nb.q, nb.r);
				const ncell = this.grid.get(k);
				if (!ncell || visited.has(k)) continue;
				if (blocked.has(k)) continue;
				visited.add(k);
				parent.set(k, cur);
				queue.push(ncell);
			}
		}
		this.pathCache = { parent };
	}

	updateEnemies(dt) {
		if (!this.pathCache) this.buildPath();
		const parent = this.pathCache.parent;

		for (let i = this.enemies.length - 1; i >= 0; i--) {
			const e = this.enemies[i];
			if (e.hp <= 0) {
				e.sprite.destroy();
				this.enemies.splice(i, 1);
				this.resources.gold += 2; // small bounty
				continue;
			}

			// Determine current cell by nearest axial
			const curCell = this.findNearestCell(e.sprite.x, e.sprite.y);
			if (!curCell) continue;

			// If next step towards HQ is blocked (wall/tower/barracks), attack it
			let nextCell = this.getNextStepTowardHQ(curCell, parent);
			if (nextCell && nextCell.building && nextCell.building.type !== 'TownHall' && nextCell.building.type !== 'Farm' && nextCell.building.type !== 'LumberMill' && nextCell.building.type !== 'Quarry' && nextCell.building.type !== 'GoldMine') {
				this.attackBuilding(e, nextCell, dt);
				continue;
			}

			// Otherwise move toward next cell or straight to HQ
			const target = nextCell ? { x: nextCell.x, y: nextCell.y } : { x: this.hqCell.x, y: this.hqCell.y };
			this.moveTowards(e, target, dt);

			// If close to HQ, damage it
			if (Phaser.Math.Distance.Between(e.sprite.x, e.sprite.y, this.hqCell.x, this.hqCell.y) < HEX_SIZE * 0.7) {
				this.hqCell.building.hp -= 20 * dt;
				if (this.hqCell.building.hp <= 0) return this.loseGame();
			}
		}

		// Win condition: after final wave cleared
		if (this.waveNumber >= MAX_WAVES && this.enemies.length === 0) {
			this.winGame();
		}
	}

	getNextStepTowardHQ(curCell, parent) {
		if (!parent) return null;
		// Reconstruct one step by following parent map from cur toward HQ
		// Find neighbor whose parent chain reaches HQ
		let best = null;
		for (const nb of neighbors(curCell.q, curCell.r)) {
			const k = axialKey(nb.q, nb.r);
			if (!parent.has(k)) continue; // unreachable through free cells
			const ncell = this.grid.get(k);
			if (!ncell) continue;
			if (!best || hexDistance(ncell, this.hqCell) < hexDistance(best, this.hqCell)) best = ncell;
		}
		return best;
	}

	attackBuilding(enemy, cell, dt) {
		// move close enough then deal damage
		this.moveTowards(enemy, { x: cell.x, y: cell.y }, dt);
		if (Phaser.Math.Distance.Between(enemy.sprite.x, enemy.sprite.y, cell.x, cell.y) < HEX_SIZE * 0.6) {
			cell.building.hp -= 15 * dt;
			if (cell.building.hp <= 0) {
				cell.icon?.destroy();
				cell.label?.destroy();
				cell.building = null;
				this.pathCache = null; // open path
			}
		}
	}

	moveTowards(e, target, dt) {
		const dx = target.x - e.sprite.x;
		const dy = target.y - e.sprite.y;
		const len = Math.hypot(dx, dy) || 1;
		const vx = (dx / len) * e.speed;
		const vy = (dy / len) * e.speed;
		e.sprite.x += vx * dt;
		e.sprite.y += vy * dt;
	}

	findNearestCell(x, y) {
		let best = null;
		let bestDist = Infinity;
		for (const cell of this.grid.values()) {
			const d = Phaser.Math.Distance.Between(x, y, cell.x, cell.y);
			if (d < bestDist) { best = cell; bestDist = d; }
		}
		return best;
	}

	//-------------------------------------------------------
	// Towers and combat
	//-------------------------------------------------------
	towersTryFire() {
		const towers = [...this.grid.values()].filter(c => c.building?.type === 'Tower');
		for (const t of towers) {
			const b = t.building;
			b.cooldown = Math.max(0, (b.cooldown || 0) - 0.15);
			if (b.cooldown > 0) continue;
			// find enemy in range (by hex distance)
			let target = null;
			let bestDist = 999;
			for (const e of this.enemies) {
				const ec = this.findNearestCell(e.sprite.x, e.sprite.y);
				const d = hexDistance(t, ec);
				if (d <= TOWER.range && d < bestDist) { target = e; bestDist = d; }
			}
			if (target) {
				this.fireProjectile(t, target);
				b.cooldown = TOWER.fireCooldownSeconds;
			}
		}
	}

	fireProjectile(fromCell, enemy) {
		const b = this.add.circle(fromCell.x, fromCell.y, 4, 0xfbbf24);
		this.projectiles.push({ sprite: b, target: enemy, speed: 300, damage: TOWER.damage });
	}

	updateProjectiles(dt) {
		for (let i = this.projectiles.length - 1; i >= 0; i--) {
			const p = this.projectiles[i];
			if (!p.target || !p.target.sprite.active) { p.sprite.destroy(); this.projectiles.splice(i,1); continue; }
			const tx = p.target.sprite.x;
			const ty = p.target.sprite.y;
			const dx = tx - p.sprite.x;
			const dy = ty - p.sprite.y;
			const len = Math.hypot(dx, dy) || 1;
			const vx = (dx / len) * p.speed;
			const vy = (dy / len) * p.speed;
			p.sprite.x += vx * dt;
			p.sprite.y += vy * dt;
			if (Phaser.Math.Distance.Between(p.sprite.x, p.sprite.y, tx, ty) < 6) {
				p.target.hp -= p.damage;
				p.sprite.destroy();
				this.projectiles.splice(i, 1);
			}
		}
	}

	//-------------------------------------------------------
	// Win/Lose and UI
	//-------------------------------------------------------
	updateUI() {
		const timeToWave = Math.max(0, Math.ceil((this.nextWaveAt - this.time.now) / 1000));
		this.ui.resourcesText.setText(`Gold ${this.resources.gold}  Food ${this.resources.food}  Wood ${this.resources.wood}  Stone ${this.resources.stone}`);
		const waveText = this.waveNumber >= MAX_WAVES ? 'Final wave cleared?' : `Wave ${this.waveNumber + 1}/${MAX_WAVES} in ${timeToWave}s`;
		this.ui.waveText.setText(waveText);
	}

	winGame() {
		if (this._ended) return; this._ended = true;
		this.add.text(this.scale.width/2, 24, 'Victory! Stronghold defended.', { fontSize: 18, color: '#bbf7d0' }).setOrigin(0.5,0).setDepth(20);
	}

	loseGame() {
		if (this._ended) return; this._ended = true;
		this.add.text(this.scale.width/2, 24, 'Defeat! HQ destroyed.', { fontSize: 18, color: '#fecaca' }).setOrigin(0.5,0).setDepth(20);
		for (const e of this.enemies) e.sprite.setTint(0x666666);
	}
}