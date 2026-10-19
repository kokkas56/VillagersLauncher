import React from 'react';
import { rewardById, badgeSvg } from '../games/rewards.js';

// Пиксельный значок-награда рядом с ником
export function Badge({ id, size = 14 }) {
  const r = id ? rewardById(id) : null;
  if (!r || r.kind !== 'badge') return null;
  return <img className="badge-pix" src={badgeSvg(r, size)} width={size} height={size} alt="" title={r.name} />;
}
