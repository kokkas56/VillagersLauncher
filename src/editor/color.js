export function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max ? d / max : 0, max];
}

export function hsvToRgb(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

export function toHex([r, g, b]) {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

export function fromHex(h) {
  const m = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(h.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, m[2] ? parseInt(m[2], 16) : 255];
}

export const css = (c) => `rgba(${c[0]},${c[1]},${c[2]},${(c[3] ?? 255) / 255})`;

export const PALETTES = {
  'Кожа': ['#f6d3b3', '#efbf98', '#e2a97f', '#cf9168', '#b8784f', '#9a5f3d', '#7a462b', '#55301d'],
  'Волосы': ['#f2dea0', '#d8b05a', '#b47a37', '#7c4a24', '#4a2d18', '#2a1a10', '#141010', '#c0c0c8'],
  'Земля': ['#5d3f28', '#7a5232', '#a07040', '#c89a5a', '#6a8a3c', '#4a6e2c', '#8a8a7a', '#5a5a52'],
  'Ткани': ['#8c2a2a', '#c04a32', '#d89a32', '#3f6aa0', '#2f4a3c', '#5a3a7a', '#e8e0d0', '#2a2a30'],
  'Изумруд': ['#0f3d24', '#17633a', '#1f8a4c', '#2ecc71', '#6ee7a0', '#c9f7dc', '#d6a846', '#f3d27a']
};
