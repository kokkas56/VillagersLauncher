import React, { useEffect, useRef } from 'react';
import { SkinViewer, WalkingAnimation, IdleAnimation } from 'skinview3d';
import * as THREE from 'three';
import { attachCharacter } from '../lib/characterRig.js';

// 3D-превью скина. skin/cape — dataURL или canvas.
// character — персонаж SkinKokk («Персонаж»): уши, хвост, причёска, одежда, телосложение, грудь — поверх скина;
// onCharacter(handle) — доступ к частям ({ kick() — встряхнуть, setWalking(b) }).
export default function SkinPreview({ skin, cape, slim, width = 260, height = 360, walk = true, rotate = true, zoom = 0.85, nameTag, onViewer, className, controls = true, character, physics = true, onCharacter }) {
  const canvasRef = useRef(null);
  const viewerRef = useRef(null);
  const charRef = useRef(null);
  const charKey = character ? JSON.stringify(character) : '';

  useEffect(() => {
    const viewer = new SkinViewer({ canvas: canvasRef.current, width, height });
    viewer.zoom = zoom;
    viewer.fov = 50;
    viewer.autoRotate = rotate;
    viewer.autoRotateSpeed = 0.6;
    viewer.animation = walk ? new WalkingAnimation() : new IdleAnimation();
    if (viewer.animation) viewer.animation.speed = 0.6;
    viewer.controls.enableZoom = controls;
    viewer.controls.enableRotate = controls;
    viewer.controls.enablePan = false;
    viewerRef.current = viewer;
    if (onViewer) onViewer(viewer);
    return () => { if (charRef.current) { charRef.current.dispose(); charRef.current = null; } viewer.dispose(); viewerRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (viewerRef.current) viewerRef.current.setSize(width, height); }, [width, height]);
  useEffect(() => { if (viewerRef.current) viewerRef.current.autoRotate = rotate; }, [rotate]);
  useEffect(() => {
    const v = viewerRef.current;
    if (!v) return;
    v.animation = walk ? new WalkingAnimation() : new IdleAnimation();
    if (v.animation) v.animation.speed = 0.6;
  }, [walk]);
  useEffect(() => {
    const v = viewerRef.current;
    if (!v) return;
    if (skin) Promise.resolve(v.loadSkin(skin, { model: slim ? 'slim' : 'default' })).catch(() => {});
    else v.resetSkin();
  }, [skin, slim]);
  useEffect(() => {
    const v = viewerRef.current;
    if (!v) return;
    if (cape) Promise.resolve(v.loadCape(cape)).catch(() => {});
    else v.resetCape();
  }, [cape]);
  useEffect(() => {
    const v = viewerRef.current;
    if (v) v.nameTag = nameTag || null;
  }, [nameTag]);
  // части персонажа: пересобираются при любой правке персонажа или смене скина
  useEffect(() => {
    const v = viewerRef.current;
    if (charRef.current) { charRef.current.dispose(); charRef.current = null; }
    if (!v || !character || character.on === false) { if (onCharacter) onCharacter(null); return; }
    try {
      charRef.current = attachCharacter(THREE, v, character, { skin, physics, walking: walk });
      if (onCharacter) onCharacter(charRef.current);
    } catch (e) { console.warn('character preview', e); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charKey, skin, slim, physics]);
  useEffect(() => { if (charRef.current) charRef.current.setWalking(walk); }, [walk]);

  return <canvas ref={canvasRef} className={className} style={{ width, height }} />;
}
