import { GameScene } from './scenes/GameScene.js';

const width = window.innerWidth;
const height = window.innerHeight;

const config = {
	type: Phaser.AUTO,
	parent: 'game-container',
	width,
	height,
	backgroundColor: '#0b0e13',
	physics: {
		default: 'arcade',
		arcade: {
			gravity: { y: 0 },
			debug: false
		}
	},
	scene: [GameScene]
};

new Phaser.Game(config);

window.addEventListener('resize', () => {
	const game = Phaser.GAMES[0];
	if (!game) return;
	game.scale.resize(window.innerWidth, window.innerHeight);
});