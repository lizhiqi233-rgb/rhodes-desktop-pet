import { Graphics } from 'pixi.js';


function tube(graphics: Graphics, x1: number, y1: number, x2: number, y2: number, width: number, color: number): void {
  const halfWidth = width / 2;
  const length = Math.hypot(x2 - x1, y2 - y1);
  const nx = -(y2 - y1) / length * halfWidth;
  const ny = (x2 - x1) / length * halfWidth;
  graphics.beginFill(color).drawPolygon([
    x1 + nx, y1 + ny, x2 + nx, y2 + ny,
    x2 - nx, y2 - ny, x1 - nx, y1 - ny,
  ]).endFill();
}

export function drawChair(back: Graphics, x: number, y: number, width: number, height: number, seat: number): void {
  const px = (fraction: number): number => x + width * fraction;
  const py = (fraction: number): number => y + height * fraction;
  const frame = Math.min(width * 0.045, height * 0.026);

  // All chair parts stay behind the sitter, including the legs and cushion lip.
  tube(back, px(0.16), py(seat + 0.06), px(0.12), py(0.97), frame, 0x344855);
  tube(back, px(0.84), py(seat + 0.06), px(0.88), py(0.97), frame, 0x344855);
  tube(back, px(0.20), py(0.02), px(0.20), py(seat + 0.06), frame, 0x63818d);
  tube(back, px(0.80), py(0.02), px(0.80), py(seat + 0.06), frame, 0x63818d);
  back.beginFill(0x243844)
    .drawRoundedRect(px(0.13), py(0.025), width * 0.74, height * 0.43, width * 0.08).endFill();
  back.beginFill(0x628b9a)
    .drawRoundedRect(px(0.17), py(0.05), width * 0.66, height * 0.38, width * 0.065).endFill();
  back.lineStyle(frame * 0.35, 0x94b8bf, 0.85)
    .drawRoundedRect(px(0.21), py(0.075), width * 0.58, height * 0.32, width * 0.045);
  back.lineStyle(0);
  back.beginFill(0xc3ae70).drawRoundedRect(px(0.26), py(0.11), width * 0.48, height * 0.018, frame * 0.3).endFill();

  back.beginFill(0x273943)
    .drawRoundedRect(px(0.055), py(seat), width * 0.89, height * 0.11, width * 0.04).endFill();
  back.beginFill(0xb79a65)
    .drawRoundedRect(px(0.075), py(seat), width * 0.85, height * 0.065, width * 0.035).endFill();
  back.beginFill(0xd4c19a)
    .drawRoundedRect(px(0.115), py(seat + 0.008), width * 0.77, height * 0.012, frame * 0.3).endFill();
  back.beginFill(0x1e3039)
    .drawRoundedRect(px(0.075), py(0.955), width * 0.09, height * 0.028, frame * 0.4)
    .drawRoundedRect(px(0.835), py(0.955), width * 0.09, height * 0.028, frame * 0.4).endFill();
}

export function drawMat(back: Graphics, front: Graphics, x: number, y: number, width: number, height: number, facing: number): void {
  const px = (fraction: number): number => x + width * fraction;
  const py = (fraction: number): number => y + height * fraction;
  const shortSide = Math.min(width, height);
  const headAtLeft = facing >= 0;
  const pillowX = headAtLeft ? 0.105 : 0.675;
  const footRimX = headAtLeft ? 0.865 : 0.095;

  // Dense charcoal-olive trim and a softly padded center, with transparent space around the mat.
  back.beginFill(0x323a39).drawRoundedRect(px(0.025), py(0.075), width * 0.95, height * 0.85, shortSide * 0.12).endFill();
  back.beginFill(0x59635b).drawRoundedRect(px(0.055), py(0.105), width * 0.89, height * 0.79, shortSide * 0.10).endFill();
  back.lineStyle(shortSide * 0.014, 0x9a9a82, 0.9)
    .drawRoundedRect(px(0.075), py(0.125), width * 0.85, height * 0.75, shortSide * 0.08);

  // Distinct padded head end and opposite reinforced rim; pillow follows the sleeping head when flipped.
  back.beginFill(0x454e4a).drawRoundedRect(px(footRimX), py(0.15), width * 0.04, height * 0.70, shortSide * 0.035).endFill();
  back.beginFill(0x788174).drawRoundedRect(px(pillowX), py(0.19), width * 0.22, height * 0.62, shortSide * 0.095).endFill();
  back.lineStyle(shortSide * 0.012, 0xb1ad91, 0.8)
    .drawRoundedRect(px(pillowX + 0.018), py(0.215), width * 0.184, height * 0.57, shortSide * 0.075);
  back.lineStyle(shortSide * 0.012, 0x424b47, 0.72)
    .moveTo(px(pillowX + 0.045), py(0.50)).lineTo(px(pillowX + 0.195), py(0.50));

  // Low-contrast quilting makes the pad read as padded, not as a solid floor panel.
  back.lineStyle(shortSide * 0.012, 0x747e72, 0.62);
  for (const seam of headAtLeft ? [0.39, 0.54, 0.69] : [0.31, 0.46, 0.61]) {
    back.moveTo(px(seam), py(0.22)).lineTo(px(seam), py(0.78));
  }

  // Only the thin near-edge lip sits in front of the lying character.
  front.lineStyle(shortSide * 0.025, 0x303938, 0.96)
    .moveTo(px(0.12), py(0.885)).lineTo(px(0.88), py(0.885));
  front.lineStyle(shortSide * 0.009, 0x8c9180, 0.65)
    .moveTo(px(0.18), py(0.865)).lineTo(px(0.82), py(0.865));
}
