import React, { useEffect, useRef } from 'react';
import { SkinViewer, WalkingAnimation, IdleAnimation } from 'skinview3d';

// 3D-превью скина. skin/cape — dataURL или canvas.
export default function SkinPreview({ skin, cape, slim, width = 260, height = 360, walk = true, rotate = true, zoom = 0.85, nameTag, onViewer, className, controls = true }) {
  const canvasRef = useRef(null);
  const viewerRef = useRef(null);

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
    return () => { viewer.dispose(); viewerRef.current = null; };
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

  return <canvas ref={canvasRef} className={className} style={{ width, height }} />;
}
