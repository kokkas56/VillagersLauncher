// Развёртка скина Minecraft 64x64: части тела, грани, маски и зеркалирование.

export const SIZE = 64;

function box(u, v, w, h, d) {
  return {
    top: [u + d, v, w, d],
    bottom: [u + d + w, v, w, d],
    right: [u, v + d, d, h],
    front: [u + d, v + d, w, h],
    left: [u + d + w, v + d, d, h],
    back: [u + d + w + d, v + d, w, h]
  };
}

export const PART_NAMES = {
  head: 'Голова', body: 'Тело', rightArm: 'Правая рука', leftArm: 'Левая рука', rightLeg: 'Правая нога', leftLeg: 'Левая нога'
};
export const PARTS = ['head', 'body', 'rightArm', 'leftArm', 'rightLeg', 'leftLeg'];
export const MIRROR_PART = { head: 'head', body: 'body', rightArm: 'leftArm', leftArm: 'rightArm', rightLeg: 'leftLeg', leftLeg: 'rightLeg' };

export function getBoxes(slim) {
  const aw = slim ? 3 : 4;
  return {
    head: { base: box(0, 0, 8, 8, 8), overlay: box(32, 0, 8, 8, 8) },
    body: { base: box(16, 16, 8, 12, 4), overlay: box(16, 32, 8, 12, 4) },
    rightArm: { base: box(40, 16, aw, 12, 4), overlay: box(40, 32, aw, 12, 4) },
    leftArm: { base: box(32, 48, aw, 12, 4), overlay: box(48, 48, aw, 12, 4) },
    rightLeg: { base: box(0, 16, 4, 12, 4), overlay: box(0, 32, 4, 12, 4) },
    leftLeg: { base: box(16, 48, 4, 12, 4), overlay: box(0, 48, 4, 12, 4) }
  };
}

const cache = {};
// Карта: индекс пикселя -> {part, layer, face, lx, ly, fw, fh}
export function pixelMap(slim) {
  const key = slim ? 'slim' : 'classic';
  if (cache[key]) return cache[key];
  const map = new Array(SIZE * SIZE).fill(null);
  const boxes = getBoxes(slim);
  for (const part of PARTS) {
    for (const layer of ['base', 'overlay']) {
      for (const [face, [fx, fy, fw, fh]] of Object.entries(boxes[part][layer])) {
        for (let ly = 0; ly < fh; ly++) for (let lx = 0; lx < fw; lx++) {
          map[(fy + ly) * SIZE + fx + lx] = { part, layer, face, lx, ly, fw, fh };
        }
      }
    }
  }
  cache[key] = map;
  return map;
}

const FACE_MIRROR = { right: 'left', left: 'right', front: 'front', back: 'back', top: 'top', bottom: 'bottom' };

export function mirrorPixel(x, y, slim) {
  const m = pixelMap(slim)[y * SIZE + x];
  if (!m) return null;
  const boxes = getBoxes(slim);
  const tp = MIRROR_PART[m.part];
  const tf = FACE_MIRROR[m.face];
  const [fx, fy, fw] = boxes[tp][m.layer][tf];
  const lx = fw - 1 - m.lx;
  if (lx < 0) return null;
  return [fx + lx, fy + m.ly];
}

// Видимость пикселя при скрытых частях/слоях
export function isPixelVisible(x, y, slim, hidden) {
  const m = pixelMap(slim)[y * SIZE + x];
  if (!m) return false;
  if (hidden[m.part]) return false;
  if (hidden[m.layer]) return false;
  return true;
}

// Пиксели одной грани (для заливки «по грани»)
export function sameFace(x, y, slim) {
  const m = pixelMap(slim)[y * SIZE + x];
  if (!m) return null;
  return (x2, y2) => {
    const n = pixelMap(slim)[y2 * SIZE + x2];
    return n && n.part === m.part && n.layer === m.layer && n.face === m.face;
  };
}

// Развёртка плаща 64x32: плащ 10x16x1 в (0,0), элитры в (22,0)
export const CAPE_W = 64;
export const CAPE_H = 32;
export const CAPE_BOXES = { cape: box(0, 0, 10, 16, 1), elytra: box(22, 0, 10, 20, 2) };
export function capeMask() {
  const m = new Array(CAPE_W * CAPE_H).fill(null);
  for (const [part, faces] of Object.entries(CAPE_BOXES)) {
    for (const [face, [fx, fy, fw, fh]] of Object.entries(faces)) {
      for (let ly = 0; ly < fh; ly++) for (let lx = 0; lx < fw; lx++) {
        if (fx + lx < CAPE_W && fy + ly < CAPE_H) m[(fy + ly) * CAPE_W + fx + lx] = { part, face, lx, ly };
      }
    }
  }
  return m;
}
