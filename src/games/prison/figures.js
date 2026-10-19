// Фигуры «Побега»: стражники всех тюрем, звери-нюхачи, летающие наблюдатели, голем, заключённый.
import { U, FLOOR } from './config.js';
import { alphaTable, pickA } from './art.js';
import { drawText } from '../pixfont.js';

const LANT = alphaTable(255, 200, 90, 0.18);
const WISPG = alphaTable(140, 230, 255, 0.22);
const GHOSTG = alphaTable(200, 210, 255, 0.5);
const RUNEG = alphaTable(190, 120, 255, 0.35);

// облик стражника: ноги, тело, отделка, кожа, голова, оружие, фонарь
export const LOOKS = {
  town: { leg: '#2a2228', body: '#7a2a2e', trim: '#9aa4b2', belt: '#5a1e22', skin: '#d8b08a', head: 'helm', h1: '#8a94a2', h2: '#b8c2ce', wpn: 'spear', lamp: 1 },
  knight: { leg: '#3a3e48', body: '#6a7080', trim: '#2a4a8a', belt: '#22355e', skin: '#d8b08a', head: 'great', h1: '#9aa4b2', h2: '#c8d0dc', wpn: 'halberd', lamp: 0 },
  houndman: { leg: '#3a2a1e', body: '#7a5634', trim: '#5a3e24', belt: '#3a2614', skin: '#c89a74', head: 'hood', h1: '#5a3e24', h2: '#6e4e30', wpn: 'club', lamp: 1 },
  swamp: { leg: '#2a2a1a', body: '#4a5a2a', trim: '#6a5a3a', belt: '#3a2e1a', skin: '#c8a07a', head: 'hood', h1: '#2e3a1e', h2: '#3e4a28', wpn: 'crossbow', lamp: 1 },
  desert: { leg: '#6a5030', body: '#e8dcc0', trim: '#c84a2a', belt: '#a83a20', skin: '#a8724a', head: 'turban', h1: '#e07030', h2: '#f0a050', wpn: 'whip', lamp: 0 },
  desert2: { leg: '#5a4028', body: '#c8b88a', trim: '#3a6aa0', belt: '#2a4a7a', skin: '#9a6a44', head: 'turban', h1: '#3a6aa0', h2: '#5a8ac0', wpn: 'spear', lamp: 0 },
  north: { leg: '#3a3a44', body: '#e4e8ee', trim: '#9aa8b8', belt: '#5a4a3a', skin: '#e8c0a0', head: 'fur', h1: '#7a5a3a', h2: '#9a7a5a', wpn: 'axe', lamp: 1 },
  north2: { leg: '#2a3040', body: '#4a6a90', trim: '#e8ecf0', belt: '#2a3a5a', skin: '#e8c0a0', head: 'fur', h1: '#e8ecf0', h2: '#ffffff', wpn: 'spear', lamp: 0 },
  pirate: { leg: '#3a3a5a', body: '#e8e8e8', trim: '#2a3a6a', belt: '#3a2a1a', skin: '#c8905a', head: 'bandana', h1: '#c02020', h2: '#e04040', wpn: 'cutlass', lamp: 1, stripe: 1 },
  cabin: { leg: '#5a4a3a', body: '#8aa0c0', trim: '#5a6a8a', belt: '#4a3a2a', skin: '#e8b88a', head: 'cap', h1: '#3a4a7a', h2: '#5a6a9a', wpn: 'mop', lamp: 0, small: 1 },
  dwarf: { leg: '#3a2e24', body: '#6a5038', trim: '#8a6a44', belt: '#3a2a1a', skin: '#e0a880', head: 'mine', h1: '#8a7a5a', h2: '#ffe080', wpn: 'pick', lamp: 0, short: 1, beard: '#c06a2a' },
  dwarf2: { leg: '#2a2a30', body: '#4a4a5a', trim: '#6a6a7a', belt: '#2a2a2a', skin: '#e0a880', head: 'mine', h1: '#6a6a74', h2: '#ffe080', wpn: 'hammer', lamp: 0, short: 1, beard: '#e0e0e0' },
  shade: { leg: '#0e0a14', body: '#1e1828', trim: '#3a2e50', belt: '#2a2038', skin: '#0a0810', head: 'cowl', h1: '#16121e', h2: '#2a2238', wpn: 'staff', lamp: 0, eyes: '#80c0ff' },
  royal: { leg: '#5a4a2a', body: '#c8a040', trim: '#a02020', belt: '#7a1818', skin: '#d8b08a', head: 'plume', h1: '#d8b850', h2: '#ff4040', wpn: 'halberd', lamp: 0 }
};

const drawZ = (ctx, x, y) => { ctx.fillRect(x, y, 3, 1); ctx.fillRect(x + 1, y + 1, 1, 1); ctx.fillRect(x, y + 2, 3, 1); };

// g: { look, x, y, dir, moving, state, t, stir, len }; clk — часы; flags: tap (постукивает древком)
export function drawGuard(ctx, g, clk, tap) {
  if (g.look === 'golem') { drawGolem(ctx, g, clk); return; }
  const L = LOOKS[g.look] || LOOKS.town;
  const x = Math.round(g.x);
  const u = U;
  const y = Math.round(g.y);
  const doze = g.state === 'doze' || g.state === 'drunk';
  const bend = g.state === 'collect' && g.t > 0.4 && g.t < 1.4 ? 2 * u : 0;
  const sh = L.short ? 3 * u : L.small ? u : 0; // карлики и юнга ниже
  const yb = y + bend + sh;
  const step = g.moving ? Math.floor(clk * 6) & 1 : 0;
  const d = g.dir;
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x - 6, y - 1, 13, 2);
  // ноги
  ctx.fillStyle = L.leg;
  const lh = L.short ? 2 * u : 4 * u;
  if (g.state === 'drunk') { ctx.fillRect(x - 2 * u, y - u, 6 * u, u); }
  else {
    ctx.fillRect(x - u + (step ? u : 0), y - lh, u, lh);
    ctx.fillRect(x + u - (step ? u : 0), y - lh, u, lh);
  }
  const sit = g.state === 'drunk' ? 3 * u : 0;
  const yt = yb + sit - (L.short ? -2 * u : 0) * 0;
  // тело
  ctx.fillStyle = L.body; ctx.fillRect(x - 2 * u, yt - 11 * u, 5 * u, 8 * u - bend - (L.short ? 2 * u : 0));
  if (L.stripe) { ctx.fillStyle = L.trim; for (let i = 0; i < 3; i++) ctx.fillRect(x - 2 * u, yt - (10 - i * 2) * u, 5 * u, u); }
  else { ctx.fillStyle = L.trim; ctx.fillRect(x - 2 * u, yt - 11 * u, 5 * u, 2 * u); if (L.head === 'great' || L.head === 'plume') ctx.fillRect(x - u, yt - 9 * u, 3 * u, 5 * u); }
  ctx.fillStyle = L.belt; ctx.fillRect(x - 2 * u, yt - 6 * u, 5 * u, u);
  ctx.fillStyle = '#c8a040'; ctx.fillRect(x, yt - 6 * u, u, u);
  // голова
  const hy = yt + (doze ? u : 0);
  ctx.fillStyle = L.skin; ctx.fillRect(x - u, hy - 15 * u, 4 * u, 4 * u);
  if (L.beard) { ctx.fillStyle = L.beard; ctx.fillRect(x - u, hy - 12 * u, 4 * u, 3 * u); ctx.fillRect(d > 0 ? x : x - u, hy - 9 * u, 3 * u, u); }
  // глаза
  if (L.eyes) {
    ctx.fillStyle = L.eyes;
    if (!doze) { ctx.fillRect(d > 0 ? x + u : x - u, hy - 14 * u, u, u); ctx.fillRect(d > 0 ? x + 2 * u + 1 : x, hy - 14 * u, 1, u); }
  } else {
    ctx.fillStyle = '#2a1e1e';
    if (doze) ctx.fillRect(d > 0 ? x + u : x - u, hy - 13 * u, 2 * u, 1);
    else ctx.fillRect(d > 0 ? x + 2 * u : x - u, hy - 14 * u, u, u);
  }
  if (g.state === 'yawn' && g.t > 0.3 && g.t < 1.9) { ctx.fillStyle = '#5a1e22'; ctx.fillRect(d > 0 ? x + u : x, hy - 12 * u, u, u + 1); }
  // головной убор
  const hd = L.head;
  if (hd === 'helm') {
    ctx.fillStyle = L.h1; ctx.fillRect(x - 2 * u, hy - 16 * u, 6 * u, 2 * u);
    ctx.fillStyle = L.h2; ctx.fillRect(x - u, hy - 17 * u, 4 * u, u);
  } else if (hd === 'great' || hd === 'plume') {
    ctx.fillStyle = L.h1; ctx.fillRect(x - u, hy - 16 * u, 4 * u, 4 * u);
    ctx.fillStyle = '#1a1a22'; ctx.fillRect(d > 0 ? x + u : x - u, hy - 14 * u, 2 * u, 1);
    ctx.fillStyle = L.h2;
    if (hd === 'plume') { ctx.fillRect(x, hy - 18 * u, 2 * u, 2 * u); ctx.fillRect(d > 0 ? x - u : x + 2 * u, hy - 19 * u, 2 * u, u); }
    else ctx.fillRect(x - u, hy - 16 * u, 4 * u, 1);
  } else if (hd === 'hood' || hd === 'cowl') {
    ctx.fillStyle = L.h1; ctx.fillRect(x - 2 * u, hy - 16 * u, 6 * u, 2 * u); ctx.fillRect(d > 0 ? x - 2 * u : x + 3 * u, hy - 14 * u, u, 4 * u);
    ctx.fillStyle = L.h2; ctx.fillRect(x - u, hy - 17 * u, 4 * u, u);
  } else if (hd === 'turban') {
    ctx.fillStyle = L.h1; ctx.fillRect(x - 2 * u, hy - 17 * u, 6 * u, 3 * u);
    ctx.fillStyle = L.h2; ctx.fillRect(x - u, hy - 16 * u, 4 * u, 1); ctx.fillRect(x, hy - 18 * u, 2 * u, u);
  } else if (hd === 'fur') {
    ctx.fillStyle = L.h1; ctx.fillRect(x - 2 * u, hy - 17 * u, 6 * u, 3 * u);
    ctx.fillStyle = L.h2; ctx.fillRect(x - 2 * u, hy - 15 * u, 6 * u, u);
  } else if (hd === 'bandana') {
    ctx.fillStyle = L.h1; ctx.fillRect(x - u, hy - 16 * u, 4 * u, 2 * u); ctx.fillRect(d > 0 ? x - 2 * u : x + 3 * u, hy - 15 * u, u, 2 * u);
    ctx.fillStyle = L.h2; ctx.fillRect(x, hy - 16 * u, u, u);
  } else if (hd === 'cap') {
    ctx.fillStyle = L.h1; ctx.fillRect(x - u, hy - 16 * u, 4 * u, 2 * u); ctx.fillRect(d > 0 ? x + 3 * u : x - 2 * u, hy - 15 * u, u, 1);
  } else if (hd === 'mine') {
    ctx.fillStyle = L.h1; ctx.fillRect(x - 2 * u, hy - 16 * u, 6 * u, 2 * u); ctx.fillRect(x - u, hy - 17 * u, 4 * u, u);
    ctx.fillStyle = L.h2; ctx.fillRect(d > 0 ? x + 3 * u : x - 2 * u, hy - 16 * u, u, u);
  }
  // потягивается при зевке
  if (g.state === 'yawn' && g.t > 0.3 && g.t < 1.9) {
    ctx.fillStyle = L.body; ctx.fillRect(d > 0 ? x - 2 * u : x + 3 * u, yt - 15 * u, u, 4 * u);
    ctx.fillStyle = L.skin; ctx.fillRect(d > 0 ? x - 2 * u : x + 3 * u, yt - 16 * u, u, u);
  }
  // передняя рука (с фонарём)
  ctx.fillStyle = L.body; ctx.fillRect(d > 0 ? x + 3 * u : x - 2 * u, yt - 10 * u, u, 3 * u);
  if (g.state === 'drunk') {
    ctx.fillStyle = '#3a8a4a'; ctx.fillRect(d > 0 ? x + 3 * u : x - 3 * u, yt - 8 * u, 2 * u, 3 * u);
  } else if (L.lamp) {
    const lx = d > 0 ? x + 3 * u : x - 3 * u;
    ctx.fillStyle = '#3a3036'; ctx.fillRect(lx - u, yt - 8 * u, 3 * u, u);
    const lf = 0.8 + 0.2 * Math.sin(clk * 10);
    ctx.fillStyle = pickA(LANT, lf); ctx.fillRect(lx - 6 * u, yt - 13 * u, 13 * u, 11 * u);
    ctx.fillStyle = '#ffd060'; ctx.fillRect(lx - u + 1, yt - 7 * u, 2 * u, 2 * u);
    ctx.fillStyle = '#3a3036'; ctx.fillRect(lx - u, yt - 5 * u, 3 * u, u);
  } else { ctx.fillStyle = L.skin; ctx.fillRect(d > 0 ? x + 3 * u : x - 2 * u, yt - 7 * u, u, u); }
  // оружие за спиной/в руке
  const wx = d > 0 ? x - 3 * u : x + 4 * u;
  const ty = tap ? u : 0;
  const w = L.wpn;
  if (g.state === 'drunk') return;
  if (w === 'spear' || w === 'halberd' || w === 'staff' || w === 'mop') {
    const top = L.short ? 14 : 20;
    ctx.fillStyle = w === 'staff' ? '#2a2038' : '#6a4a2c'; ctx.fillRect(wx, y - top * u - ty, u, (top - 1) * u);
    if (w === 'spear') { ctx.fillStyle = '#c8d0dc'; ctx.fillRect(wx, y - (top + 2) * u - ty, u, 2 * u); }
    else if (w === 'halberd') { ctx.fillStyle = L.look === 'royal' ? '#f0d060' : '#c8d0dc'; ctx.fillRect(wx, y - (top + 2) * u - ty, u, 2 * u); ctx.fillRect(d > 0 ? wx - 2 * u : wx + u, y - (top - 1) * u - ty, 2 * u, 3 * u); }
    else if (w === 'staff') { const p = 0.6 + 0.4 * Math.sin(clk * 4); ctx.fillStyle = pickA(WISPG, p); ctx.fillRect(wx - 4 * u, y - (top + 5) * u - ty, 9 * u, 9 * u); ctx.fillStyle = '#80c0ff'; ctx.fillRect(wx - u, y - (top + 2) * u - ty, 3 * u, 3 * u); }
    else { ctx.fillStyle = '#d8d0b8'; ctx.fillRect(wx - u, y - 3 * u, 3 * u, 2 * u); }
  } else if (w === 'crossbow') {
    ctx.fillStyle = '#5a3e24'; ctx.fillRect(wx - u, yt - 10 * u, u, 6 * u);
    ctx.fillStyle = '#3a2a1a'; ctx.fillRect(wx - 2 * u, yt - 10 * u, 3 * u, u);
  } else if (w === 'whip') {
    ctx.fillStyle = '#5a3a1a'; ctx.fillRect(wx, yt - 7 * u, u, 3 * u);
    ctx.fillRect(wx + (d > 0 ? -u : u), yt - 4 * u, u, 2 * u); ctx.fillRect(wx, yt - 2 * u, u, u);
  } else if (w === 'axe' || w === 'pick' || w === 'hammer' || w === 'club' || w === 'cutlass') {
    ctx.fillStyle = w === 'cutlass' ? '#c8d0dc' : '#6a4a2c';
    ctx.fillRect(wx, yt - 12 * u, u, 6 * u);
    ctx.fillStyle = '#9aa4b2';
    if (w === 'axe') ctx.fillRect(d > 0 ? wx - 2 * u : wx + u, yt - 12 * u, 2 * u, 3 * u);
    else if (w === 'pick') ctx.fillRect(wx - 2 * u, yt - 12 * u, 5 * u, u);
    else if (w === 'hammer') ctx.fillRect(wx - u, yt - 13 * u, 3 * u, 2 * u);
    else if (w === 'club') { ctx.fillStyle = '#5a3a1e'; ctx.fillRect(wx - u, yt - 13 * u, 3 * u, 3 * u); }
    else { ctx.fillStyle = '#c8a040'; ctx.fillRect(wx - u, yt - 6 * u, 3 * u, u); }
  }
  if (doze) {
    ctx.fillStyle = '#d8d8f0';
    const zt = (clk * 0.7) % 1;
    drawZ(ctx, x + 6 + Math.round(zt * 4), y - 38 + sit - Math.round(zt * 10));
    drawZ(ctx, x + 10 + Math.round(((zt + 0.5) % 1) * 4), y - 38 + sit - Math.round(((zt + 0.5) % 1) * 10));
  }
}

// голем башни магов — большой и медленный
function drawGolem(ctx, g, clk) {
  const x = Math.round(g.x);
  const y = Math.round(g.y);
  const d = g.dir;
  const step = g.moving ? Math.floor(clk * 3) & 1 : 0;
  const doze = g.state === 'doze' || g.state === 'drunk';
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x - 12, y - 1, 25, 2);
  ctx.fillStyle = '#5a5866';
  ctx.fillRect(x - 8 + (step ? 2 : 0), y - 10, 6, 10); ctx.fillRect(x + 3 - (step ? 2 : 0), y - 10, 6, 10);
  ctx.fillStyle = '#6e6c7a'; ctx.fillRect(x - 11, y - 34, 23, 25);
  ctx.fillStyle = '#7e7c8a'; ctx.fillRect(x - 11, y - 34, 23, 3);
  ctx.fillStyle = '#4e6a3e'; ctx.fillRect(x - 9, y - 30, 4, 2); ctx.fillRect(x + 4, y - 18, 5, 2); ctx.fillRect(x - 2, y - 12, 3, 2);
  // руки-валуны
  ctx.fillStyle = '#5e5c6a';
  ctx.fillRect(d > 0 ? x + 12 : x - 17, y - 30, 5, 18); ctx.fillRect(d > 0 ? x - 16 : x + 11, y - 30, 5, 16);
  // голова
  ctx.fillStyle = '#7a7886'; ctx.fillRect(x - 6, y - 44, 13, 11);
  ctx.fillStyle = '#5a5866'; ctx.fillRect(x - 6, y - 35, 13, 2);
  // глаза-руны
  const p = doze ? 0.15 : 0.7 + 0.3 * Math.sin(clk * 3);
  ctx.fillStyle = pickA(RUNEG, p); ctx.fillRect(x - 10 + d * 3, y - 46, 21, 12);
  ctx.fillStyle = doze ? '#4a3a6a' : '#e0b0ff';
  ctx.fillRect(x - 3 + d * 2, y - 40, 2, 2); ctx.fillRect(x + 2 + d * 2, y - 40, 2, 2);
  // руна на груди
  ctx.fillStyle = doze ? '#4a3a6a' : '#c080ff'; ctx.fillRect(x - 1, y - 27, 3, 1); ctx.fillRect(x, y - 26, 1, 4); ctx.fillRect(x - 1, y - 23, 3, 1);
  if (doze) {
    ctx.fillStyle = '#d8d8f0';
    const zt = (clk * 0.5) % 1;
    drawZ(ctx, x + 10 + Math.round(zt * 4), y - 54 - Math.round(zt * 10));
  }
}

// звери-нюхачи: b = { kind, x, dir, st, t, sub }
export function drawBeast(ctx, b, clk) {
  const x = Math.round(b.x);
  const y = FLOOR;
  const d = b.dir;
  const step = b.st === 'walk' ? Math.floor(clk * 10) & 1 : 0;
  const k = b.kind;
  const sniff = b.st === 'sniff' || b.st === 'warn';
  if (k === 'dog' || k === 'wolf') {
    const c1 = k === 'dog' ? '#7a5634' : '#c8ccd4';
    const c2 = k === 'dog' ? '#5a3e24' : '#9aa0aa';
    const lie = b.st === 'chew' || b.st === 'sleep';
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x - 8, y - 1, 17, 2);
    if (lie) {
      ctx.fillStyle = c1; ctx.fillRect(x - 7, y - 5, 14, 5);
      ctx.fillStyle = c2; ctx.fillRect(x - 7, y - 5, 14, 1);
      ctx.fillRect(d > 0 ? x + 6 : x - 10, y - 6, 4, 4);
      if (b.st === 'chew') { ctx.fillStyle = '#ece4d0'; ctx.fillRect(d > 0 ? x + 9 : x - 13, y - 3, 5, 2); }
      return;
    }
    ctx.fillStyle = c2;
    ctx.fillRect(x - 6 + step, y - 4, 2, 4); ctx.fillRect(x + 4 - step, y - 4, 2, 4);
    ctx.fillStyle = c1; ctx.fillRect(x - 7, y - 9, 15, 5);
    ctx.fillRect(d > 0 ? x - 9 : x + 8, y - 10 + (Math.floor(clk * 8) & 1), 2, 2); // хвост
    const hx = d > 0 ? x + 6 : x - 11;
    const hy = sniff ? y - 8 : y - 12;
    ctx.fillRect(hx, hy, 6, 5);
    ctx.fillStyle = c2; ctx.fillRect(d > 0 ? hx + 1 : hx + 3, hy - 2, 2, 2); // ухо
    ctx.fillStyle = '#1a1418'; ctx.fillRect(d > 0 ? hx + 5 : hx, hy + 2, 1, 1); ctx.fillRect(d > 0 ? hx + 3 : hx + 2, hy + 1, 1, 1);
    if (b.st === 'warn' && (Math.floor(clk * 10) & 1)) { ctx.fillStyle = '#ffffff'; ctx.fillRect(d > 0 ? hx + 7 : hx - 3, hy + 3, 2, 1); }
  } else if (k === 'croc') {
    if (b.sub) {
      // под водой видны только глаза
      ctx.fillStyle = '#3a5a2a'; ctx.fillRect(x - 2, y + 1, 6, 2);
      ctx.fillStyle = '#e0e070'; ctx.fillRect(x - 1, y + 1, 1, 1); ctx.fillRect(x + 2, y + 1, 1, 1);
      return;
    }
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x - 12, y - 1, 25, 2);
    ctx.fillStyle = '#2e4a22';
    ctx.fillRect(x - 7 + step, y - 2, 3, 2); ctx.fillRect(x + 4 - step, y - 2, 3, 2);
    ctx.fillStyle = '#4a7034'; ctx.fillRect(x - 10, y - 6, 20, 4);
    ctx.fillStyle = '#5e8a42'; for (let i = -8; i < 9; i += 3) ctx.fillRect(x + i, y - 7, 2, 1);
    ctx.fillStyle = '#4a7034'; ctx.fillRect(d > 0 ? x - 16 : x + 10, y - 4, 6, 2); // хвост
    const jaw = b.st === 'warn' && (Math.floor(clk * 8) & 1) ? 1 : 0;
    const hx = d > 0 ? x + 10 : x - 18;
    ctx.fillRect(hx, y - 6 - jaw, 8, 2); ctx.fillRect(hx, y - 3 + jaw, 8, 1);
    ctx.fillStyle = '#e0e070'; ctx.fillRect(d > 0 ? hx + 1 : hx + 6, y - 7, 1, 1);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(hx + 2, y - 4, 1, 1); ctx.fillRect(hx + 5, y - 4, 1, 1);
    if (b.st === 'chew') { ctx.fillStyle = '#ece4d0'; ctx.fillRect(hx + 2, y - 5, 4, 1); }
  } else if (k === 'scorpion') {
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(x - 5, y - 1, 11, 1);
    ctx.fillStyle = '#5a2a14';
    for (let i = -3; i < 4; i += 2) ctx.fillRect(x + i, y - 1 - ((i + step) & 1), 1, 1);
    ctx.fillStyle = '#8a3a1e'; ctx.fillRect(x - 4, y - 4, 9, 3);
    const tx = d > 0 ? x - 6 : x + 5;
    const curl = b.st === 'warn' ? 2 : 0;
    ctx.fillRect(tx, y - 5, 2, 2); ctx.fillRect(d > 0 ? tx - 1 : tx + 1, y - 8 - curl, 2, 3);
    ctx.fillStyle = '#e07050'; ctx.fillRect(d > 0 ? tx + 1 : tx, y - 9 - curl, 2, 1);
    ctx.fillStyle = '#8a3a1e';
    const hx = d > 0 ? x + 5 : x - 7;
    ctx.fillRect(hx, y - 5, 3, 2); ctx.fillRect(d > 0 ? hx + 2 : hx - 1, y - 6, 2, 1);
    if (b.st === 'chew') { ctx.fillStyle = '#ece4d0'; ctx.fillRect(hx, y - 3, 3, 1); }
  } else if (k === 'rat') {
    const sn = sniff && ((clk * 6) | 0) & 1;
    ctx.fillStyle = '#5a5258'; ctx.fillRect(x - 3, y - 3, 7, 3);
    ctx.fillStyle = '#6a6268'; ctx.fillRect(x - 2, y - 4, 4, 1);
    const hx = d < 0 ? x - 5 : x + 4;
    ctx.fillRect(hx, y - 3 + (sn ? 1 : 0), 2, 2);
    ctx.fillStyle = '#c89aa0'; ctx.fillRect(d < 0 ? x + 4 : x - 7, y - 1, 3, 1);
    ctx.fillStyle = '#1a1418'; ctx.fillRect(hx + (d < 0 ? 0 : 1), y - 3, 1, 1);
    if (b.st === 'chew') { ctx.fillStyle = '#ece4d0'; ctx.fillRect(hx, y - 1, 3, 1); }
  }
}

// летающие: s = { kind, x, y, dir, st, t }
export function drawSeer(ctx, s, clk, cloaked) {
  const x = Math.round(s.x);
  const y = Math.round(s.y);
  if (s.kind === 'wisp') {
    const p = 0.6 + 0.4 * Math.sin(clk * 5 + s.x * 0.05);
    ctx.fillStyle = pickA(WISPG, cloaked ? p * 0.3 : p); ctx.fillRect(x - 8, y - 8, 17, 17);
    ctx.fillStyle = pickA(WISPG, cloaked ? 0.2 : 1); ctx.fillRect(x - 4, y - 4, 9, 9);
    ctx.fillStyle = '#c8f4ff'; ctx.fillRect(x - 2, y - 2, 5, 5);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 1, y - 1, 2, 2);
    ctx.fillStyle = '#8ae0ff';
    for (let i = 1; i < 4; i++) ctx.fillRect(x - s.dir * (3 + i * 3), y + Math.round(Math.sin(clk * 6 - i) * 2), 1, 1);
  } else if (s.kind === 'ghost') {
    const a = cloaked ? 0.35 : 0.8 + 0.2 * Math.sin(clk * 2 + s.x * 0.03);
    ctx.fillStyle = pickA(GHOSTG, a);
    ctx.fillRect(x - 5, y - 10, 11, 4); ctx.fillRect(x - 6, y - 7, 13, 12);
    for (let i = 0; i < 4; i++) ctx.fillRect(x - 6 + i * 3 + (Math.floor(clk * 4 + i) & 1), y + 5, 2, 2);
    ctx.fillStyle = '#1a1430';
    ctx.fillRect(x - 3 + s.dir, y - 6, 2, 3); ctx.fillRect(x + 2 + s.dir, y - 6, 2, 3);
    ctx.fillRect(x + s.dir, y - 1, 2, 2);
  } else if (s.kind === 'parrot') {
    const fly = s.st === 'fly';
    const fl = fly ? Math.floor(clk * 12) & 1 : 0;
    ctx.fillStyle = '#d02a20'; ctx.fillRect(x - 2, y - 6, 5, 7);
    ctx.fillStyle = '#2a9a3a'; ctx.fillRect(fly ? x - 6 : x - 2, fly ? y - 4 - fl * 3 : y - 4, fly ? 4 : 2, fly ? 2 : 4);
    if (fly) ctx.fillRect(x + 3, y - 4 - fl * 3, 4, 2);
    ctx.fillStyle = '#2a5ad0'; ctx.fillRect(x - 1, y + 1, 3, 3);
    ctx.fillStyle = '#f0c030'; ctx.fillRect(s.dir > 0 ? x + 3 : x - 3, y - 5, 1, 2);
    ctx.fillStyle = s.st === 'sleep' ? '#d02a20' : '#ffffff'; ctx.fillRect(s.dir > 0 ? x + 1 : x - 1, y - 5, 1, 1);
    if (s.st === 'sleep') { ctx.fillStyle = '#d8d8f0'; drawZ(ctx, x + 4, y - 12 - Math.round(((clk * 0.7) % 1) * 6)); }
  } else if (s.kind === 'bat') {
    const fl = Math.floor(clk * 14) & 1;
    ctx.fillStyle = '#1a1418';
    ctx.fillRect(x - 1, y - 1, 3, 3);
    ctx.fillRect(x - 4, y - 1 - fl, 3, 1); ctx.fillRect(x + 2, y - 1 - fl, 3, 1);
    ctx.fillRect(x - 5, y - fl * 2, 1, 1); ctx.fillRect(x + 5, y - fl * 2, 1, 1);
  }
}

// ---------- заключённый ----------
export const ROBE = '#c8c4b8';
export const STRIPE = '#5a5660';
export const SKIN = '#e8be96';
export const HAIR = '#3a2a1e';

// q: { x, pose, face, wink, dig, shovel(bool), swing, sheep, cape, hold }
export function drawPrisoner(ctx, q, clk) {
  const u = U;
  const y = FLOOR;
  const x = Math.round(q.x);
  const pose = q.pose;
  if (pose === 'gone') return;
  if (pose === 'crouch') {
    const dig = q.dig ? Math.floor(clk * 6) & 1 : 0;
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x - 6, y - 1, 13, 2);
    if (q.cape) { ctx.fillStyle = '#3a3a44'; ctx.fillRect(x + 2 * u, y - 7 * u, 3 * u, 6 * u); ctx.fillStyle = '#ffd34a'; ctx.fillRect(x + 5 * u - 1, y - 7 * u, 1, 6 * u); }
    ctx.fillStyle = ROBE; ctx.fillRect(x - 2 * u, y - 7 * u, 6 * u, 5 * u);
    ctx.fillStyle = STRIPE; ctx.fillRect(x - 2 * u, y - 6 * u, 6 * u, u); ctx.fillRect(x - 2 * u, y - 4 * u, 6 * u, u);
    ctx.fillStyle = '#2a2228'; ctx.fillRect(x - 2 * u, y - 2 * u, 2 * u, 2 * u); ctx.fillRect(x + 2 * u, y - 2 * u, 2 * u, 2 * u);
    ctx.fillStyle = SKIN; ctx.fillRect(x - 3 * u, y - 10 * u, 4 * u, 4 * u);
    ctx.fillStyle = HAIR; ctx.fillRect(x - 3 * u, y - 10 * u, 4 * u, u);
    ctx.fillStyle = '#2a1e1e'; ctx.fillRect(x - 3 * u, y - 8 * u, u, u);
    if (q.shovel) {
      ctx.fillStyle = '#7a4e2a'; ctx.fillRect(x - 4 * u, y - (8 - dig) * u, u, 6 * u);
      ctx.fillStyle = '#9aa4b2'; ctx.fillRect(x - 5 * u, y - (3 - dig) * u, 3 * u, 2 * u);
    } else { ctx.fillStyle = SKIN; ctx.fillRect(x - 4 * u, y - (4 - dig) * u, u, 2 * u); }
    return;
  }
  if (pose === 'faint') {
    // лежит без сил (жара)
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x - 12, y - 1, 26, 2);
    ctx.fillStyle = ROBE; ctx.fillRect(x - 6, y - 6, 14, 6);
    ctx.fillStyle = STRIPE; ctx.fillRect(x - 6, y - 4, 14, 1);
    ctx.fillStyle = '#2a2228'; ctx.fillRect(x + 8, y - 4, 6, 4);
    ctx.fillStyle = SKIN; ctx.fillRect(x - 13, y - 7, 7, 7);
    ctx.fillStyle = HAIR; ctx.fillRect(x - 14, y - 7, 2, 7);
    ctx.fillStyle = '#ffe080';
    const a = clk * 4;
    ctx.fillRect(x - 10 + Math.round(Math.cos(a) * 6), y - 14 + Math.round(Math.sin(a) * 2), 1, 1);
    ctx.fillRect(x - 10 + Math.round(Math.cos(a + 3) * 6), y - 14 + Math.round(Math.sin(a + 3) * 2), 1, 1);
    return;
  }
  const moving = pose === 'walk' || pose === 'carry' || pose === 'slide';
  const st = pose === 'walk' || pose === 'carry' ? ((clk * 8) | 0) & 1 : 0;
  const face = pose === 'forge' ? 1 : q.face;
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x - 6, y - 1, 13, 2);
  if (q.cape && pose !== 'front') { ctx.fillStyle = '#3a3a44'; ctx.fillRect(face > 0 ? x - 3 * u : x + 2 * u, y - 10 * u, 2 * u, 8 * u); ctx.fillStyle = '#ffd34a'; ctx.fillRect(face > 0 ? x - 3 * u : x + 4 * u - 1, y - 3 * u, 2 * u, 1); }
  ctx.fillStyle = '#2a2228';
  if (pose === 'slide') { ctx.fillRect(x - 2 * u, y - 3 * u, u, 3 * u); ctx.fillRect(x + 2 * u, y - 3 * u, u, 3 * u); }
  else { ctx.fillRect(x - u + (st ? u : 0), y - 3 * u, u, 3 * u); ctx.fillRect(x + u - (st ? u : 0), y - 3 * u, u, 3 * u); }
  ctx.fillStyle = ROBE; ctx.fillRect(x - 2 * u, y - 10 * u, 5 * u, 7 * u);
  ctx.fillStyle = STRIPE;
  for (let i = 0; i < 3; i++) ctx.fillRect(x - 2 * u, y - (9 - i * 2) * u, 5 * u, u);
  if (q.cape && pose === 'front') { ctx.fillStyle = '#3a3a44'; ctx.fillRect(x - 3 * u, y - 10 * u, u, 8 * u); ctx.fillRect(x + 3 * u, y - 10 * u, u, 8 * u); ctx.fillStyle = '#ffd34a'; ctx.fillRect(x - 2 * u, y - 10 * u, 5 * u, 1); }
  const sheep = q.sheep ? u : 0;
  ctx.fillStyle = SKIN; ctx.fillRect(x - u, y - 14 * u + sheep, 4 * u, 4 * u);
  ctx.fillStyle = HAIR;
  ctx.fillRect(x - u, y - 14 * u + sheep, 4 * u, u);
  if (pose === 'front' || pose === 'cheer') {
    ctx.fillStyle = '#2a1e1e';
    ctx.fillRect(x, y - 12 * u, u, u);
    if (q.wink) ctx.fillRect(x + 2 * u - 1, y - 12 * u + 1, u + 1, 1); else ctx.fillRect(x + 2 * u - 1, y - 12 * u, u, u);
    ctx.fillStyle = '#a8644a'; ctx.fillRect(x, y - 11 * u + 1, 3 * u - 1, 1);
  } else {
    ctx.fillRect(face > 0 ? x - u : x + 2 * u, y - 13 * u + sheep, u, u);
    ctx.fillStyle = '#2a1e1e'; ctx.fillRect(face > 0 ? x + 2 * u : x - u, y - 13 * u + sheep, u, u);
  }
  ctx.fillStyle = SKIN;
  if (pose === 'forge') {
    if (q.swing > 0) {
      ctx.fillRect(x + 3 * u, y - 9 * u, 3 * u, u);
      ctx.fillStyle = '#7a4e2a'; ctx.fillRect(x + 6 * u, y - 10 * u, u, 3 * u);
      ctx.fillStyle = '#7e8a9a'; ctx.fillRect(x + 6 * u - 2, y - 13 * u + 2, 3 * u, 3 * u - 2);
    } else {
      ctx.fillRect(x + 2 * u, y - 13 * u, u, 4 * u);
      ctx.fillStyle = '#7a4e2a'; ctx.fillRect(x + 2 * u, y - 17 * u, u, 4 * u);
      ctx.fillStyle = '#7e8a9a'; ctx.fillRect(x + u, y - 19 * u, 4 * u, 2 * u);
    }
  } else if (pose === 'handsup' || pose === 'cheer') {
    const w = pose === 'cheer' && (Math.floor(clk * 4) & 1) ? u : 0;
    ctx.fillRect(x - 3 * u, y - 16 * u - w, u, 5 * u); ctx.fillRect(x + 3 * u, y - 16 * u + w, u, 5 * u);
  } else if (pose === 'carry') {
    const hx = face > 0 ? x + 3 * u : x - 4 * u;
    ctx.fillRect(hx, y - 9 * u, 2 * u, u);
    ctx.fillStyle = '#9aa4b2'; ctx.fillRect(face > 0 ? hx + u : hx - u, y - 10 * u, 2 * u, u);
  } else if (pose === 'slide') {
    ctx.fillRect(x - 3 * u, y - 10 * u, u, 2 * u); ctx.fillRect(x + 3 * u, y - 10 * u, u, 2 * u);
  } else if (pose === 'hold') {
    const hx = face > 0 ? x + 3 * u : x - 3 * u;
    ctx.fillRect(hx, y - 9 * u, u, 2 * u);
  } else {
    const hx = face > 0 ? x + 3 * u : x - 2 * u;
    ctx.fillRect(hx, y - 9 * u, u, 3 * u);
    ctx.fillStyle = '#7a4e2a'; ctx.fillRect(hx, y - 6 * u, u, 2 * u);
    ctx.fillStyle = '#7e8a9a'; ctx.fillRect(hx - u, y - 4 * u, 3 * u, u);
  }
  if (moving && pose === 'slide') { ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 8 * q.face, y - 2, 2, 1); ctx.fillRect(x - 11 * q.face, y - 1, 1, 1); }
}

// метки над головой
export function drawMark(ctx, ch, x, y, color) {
  drawText(ctx, ch, x, y, color, 2);
}
