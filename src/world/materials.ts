import * as THREE from 'three';

export function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  draw(canvas.getContext('2d')!);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

export function floorMaterial() {
  const texture = canvasTexture(512, 512, ctx => {
    ctx.fillStyle = '#c4c2b6'; ctx.fillRect(0, 0, 512, 512);
    let seed = 481;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 14000; i++) {
      ctx.fillStyle = random() > 0.5 ? 'rgba(255,255,245,.17)' : 'rgba(63,64,53,.09)';
      ctx.fillRect(random() * 512, random() * 512, 1.5, 1.5);
    }
    ctx.strokeStyle = '#a19f94'; ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, 512, 512);
  });
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(50, 34);
  return new THREE.MeshStandardMaterial({ map: texture, roughness: 0.38, metalness: 0.08 });
}

export function signTexture(title: string, subtitle: string, badge: string, accent = '#d9b34d') {
  return canvasTexture(1024, 256, ctx => {
    ctx.fillStyle = '#192e2a'; ctx.fillRect(0, 0, 1024, 256);
    ctx.fillStyle = accent; ctx.fillRect(0, 244, 1024, 12);
    ctx.fillStyle = accent; ctx.fillRect(32, 42, 140, 140);
    ctx.fillStyle = '#152823'; ctx.font = 'bold 76px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(badge, 102, 141);
    ctx.textAlign = 'left'; ctx.fillStyle = '#f4f3e9'; ctx.font = '600 60px sans-serif'; ctx.fillText(title, 210, 108);
    ctx.fillStyle = '#b3c7be'; ctx.font = '29px sans-serif'; ctx.fillText(subtitle, 213, 163);
    ctx.fillStyle = '#f4f3e9'; ctx.font = '70px sans-serif'; ctx.fillText('↑', 910, 136);
  });
}
