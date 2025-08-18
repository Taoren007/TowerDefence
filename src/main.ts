import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { WorldScene } from './scenes/WorldScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  backgroundColor: '#0c0f14',
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: '100%',
    height: '100%'
  },
  physics: {
    default: 'arcade',
    arcade: { debug: false }
  },
  render: { pixelArt: true, antialias: false },
  scene: [BootScene, WorldScene]
};

// eslint-disable-next-line no-new
new Phaser.Game(config);

