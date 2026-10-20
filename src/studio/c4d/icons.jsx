// Иконки окна Студии в духе Cinema 4D (контурные, 24×24). Цветные — для видов объектов, как в менеджере объектов C4D.
import React from 'react';

const P = {
  undo: <><path d="M9 7 4 12l5 5" /><path d="M4 12h10a6 6 0 0 1 0 12" transform="translate(0 -6)" /></>,
  redo: <><path d="m15 7 5 5-5 5" /><path d="M20 12H10a6 6 0 0 0 0 12" transform="translate(0 -6)" /></>,
  home: <><path d="M4 11 12 4l8 7" /><path d="M6 10v9h12v-9" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  min: <path d="M6 12h12" />,
  max: <rect x="6" y="6" width="12" height="12" />,
  restore: <><rect x="5" y="9" width="10" height="10" /><path d="M9 9V5h10v10h-4" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  select: <><path d="M6 4v13l4-3 3 6 2-1-3-6h5z" /><circle cx="17" cy="6" r="2.5" strokeDasharray="2 1.5" /></>,
  move: <><path d="M12 3v18M3 12h18" /><path d="m9 6 3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" /></>,
  rotate: <><path d="M19 12a7 7 0 1 1-2.05-4.95" /><path d="M19 4v4h-4" /></>,
  scale: <><rect x="4" y="10" width="10" height="10" /><path d="M11 13 20 4M14 4h6v6" /></>,
  camera: <><rect x="3" y="7" width="12" height="10" rx="1.5" /><path d="m15 11 6-3v8l-6-3" /></>,
  path: <><path d="M4 18C8 18 6 6 12 6s4 12 8 12" /><circle cx="4" cy="18" r="1.6" /><circle cx="12" cy="6" r="1.6" /><circle cx="20" cy="18" r="1.6" /></>,
  actor: <><circle cx="12" cy="7" r="3" /><path d="M6 21v-4a6 6 0 0 1 12 0v4" /></>,
  light: <><path d="M9 17h6M10 20h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z" /></>,
  sound: <><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" /></>,
  marker: <><path d="M12 21s-6-6.2-6-11a6 6 0 0 1 12 0c0 4.8-6 11-6 11z" /><circle cx="12" cy="10" r="2" /></>,
  group: <><circle cx="12" cy="12" r="7" /><path d="M12 5v14M5 12h14" strokeDasharray="2 2" /></>,
  cloner: <><rect x="3" y="12" width="7" height="7" /><rect x="14" y="12" width="7" height="7" /><rect x="8.5" y="4" width="7" height="7" /></>,
  effector: <><path d="M5 19 15 9" /><path d="M15 4v3M19 9h-3M18 5.5l-2 2M11.5 4.5l1.2 2.2M19.5 12.5l-2.2-1.2" /><circle cx="15" cy="9" r="1" /></>,
  block: <><path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z" /><path d="M4 7.5 12 12l8-4.5M12 12v9" /></>,
  template: <><path d="M4 11 12 4l8 7v9H4z" /><path d="M10 20v-5h4v5" /></>,
  structure: <><path d="M3 20h18" /><path d="M5 20v-8l4-3 4 3v8" /><path d="M13 20v-6h6v6" /><path d="M15 14v-3h2v3" /><path d="M8 20v-3h2v3" /></>,
  cube3: <><path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z" /><path d="M4 7.5 12 12l8-4.5M12 12v9" /><path d="M8 5.3l8 4.5M16 5.3 8 9.8" strokeDasharray="1.5 1.5" /></>,
  brush: <><path d="M14 4 20 10l-8 8-6-6z" /><path d="M6 12 3 21l9-3" /></>,
  world: <><circle cx="12" cy="12" r="8" /><path d="M4 12h16M12 4c3 3 3 13 0 16M12 4c-3 3-3 13 0 16" /></>,
  object: <><path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z" /><path d="M12 12v9M12 12l8-4.5" strokeDasharray="2 1.5" /></>,
  snap: <><path d="M6 4v8a6 6 0 0 0 12 0V4" /><path d="M6 8h4M14 8h4" /></>,
  gamecam: <><rect x="3" y="7" width="12" height="10" rx="1.5" /><path d="m15 11 6-3v8l-6-3" /><circle cx="9" cy="12" r="2" /></>,
  look: <><path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  shaders: <><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" /></>,
  hud: <><rect x="3" y="5" width="18" height="14" rx="1" /><path d="M6 16h4M14 16h4M3 19 21 5" /></>,
  play: <path d="M7 5v14l11-7z" />,
  stop: <rect x="6" y="6" width="12" height="12" />,
  pause: <path d="M8 5v14M16 5v14" />,
  first: <><path d="M6 5v14" /><path d="M18 5v14L8 12z" /></>,
  last: <><path d="M18 5v14" /><path d="M6 5v14l10-7z" /></>,
  prevkey: <><path d="M11 5v14L3 12z" /><path d="m15 12 3-3 3 3-3 3z" /></>,
  nextkey: <><path d="M13 5v14l8-7z" /><path d="m3 12 3-3 3 3-3 3z" /></>,
  prevframe: <><path d="M16 5v14L7 12z" /><path d="M5 5v14" /></>,
  nextframe: <><path d="M8 5v14l9-7z" /><path d="M19 5v14" /></>,
  record: <circle cx="12" cy="12" r="6" />,
  autokey: <><circle cx="12" cy="12" r="8" /><path d="M9 16l3-8 3 8M10 13.5h4" /></>,
  key: <path d="m12 4 8 8-8 8-8-8z" />,
  curves: <><path d="M3 20h18M3 20V4" /><path d="M5 17c4 0 4-10 8-10s4 6 8 6" /></>,
  loop: <><path d="M17 3l3 3-3 3" /><path d="M20 6H8a5 5 0 0 0-5 5" /><path d="M7 21l-3-3 3-3" /><path d="M4 18h12a5 5 0 0 0 5-5" /></>,
  check: <path d="m5 12 4 4 10-10" />,
  build: <><path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z" /><path d="m9 12 2 2 4-4" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" /><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" /></>,
  embed: <><rect x="3" y="4" width="18" height="16" rx="1" /><rect x="7" y="9" width="10" height="7" /><path d="M3 7h18" /></>,
  side: <><rect x="3" y="4" width="18" height="16" rx="1" /><path d="M12 4v16" /></>,
  undock: <><rect x="3" y="8" width="13" height="12" rx="1" /><path d="M13 3h8v8M21 3l-9 9" /></>,
  popout: <><path d="M14 4h6v6M20 4l-8 8" /><path d="M18 14v6H4V6h6" /></>,
  eye: <><path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z" /><circle cx="12" cy="12" r="2.5" /></>,
  folder: <path d="M3 6h7l2 2h9v11H3z" />,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" /></>,
  film: <><rect x="3" y="5" width="18" height="14" /><path d="M7 5v14M17 5v14M3 9h4M3 15h4M17 9h4M17 15h4" /></>,
  trash: <><path d="M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" /><path d="M16 8V4H4v12h4" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6" /><path d="m15 15 5 5" /></>,
  filter: <path d="M4 5h16l-6 8v6l-4-2v-4z" />,
  frame: <><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" /><circle cx="12" cy="12" r="2.5" /></>,
  bake: <><path d="M4 18h16M6 18V9l6-5 6 5v9" /><path d="M10 18v-5h4v5" /></>,
  unbake: <><path d="M9 7 4 12l5 5" /><path d="M4 12h11a5 5 0 0 1 0 10h-3" transform="translate(0 -5)" /></>,
  ghost: <><path d="M6 20V10a6 6 0 0 1 12 0v10l-2-2-2 2-2-2-2 2-2-2z" /><circle cx="10" cy="10" r="1" /><circle cx="14" cy="10" r="1" /></>,
  stage: <><rect x="3" y="6" width="7" height="12" /><rect x="11" y="6" width="10" height="12" /><path d="M6 10h1M15 10h2" /></>,
  scheme: <><rect x="3" y="4" width="7" height="5" /><rect x="14" y="15" width="7" height="5" /><path d="M10 6.5h3a2 2 0 0 1 2 2V15" /></>,
  dialog: <><path d="M4 5h16v10H9l-5 4z" /></>,
  quest: <><path d="M6 3h12v18l-6-4-6 4z" /></>,
  vars: <><path d="M7 4c-2 0-2 2-2 4s-2 4-2 4 2 2 2 4 0 4 2 4M17 4c2 0 2 2 2 4s2 4 2 4-2 2-2 4 0 4-2 4" /><path d="M9 9l6 6M15 9l-6 6" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></>,
  warn: <><path d="M12 3 2 20h20z" /><path d="M12 10v5M12 17.5v.5" /></>,
  rocket: <><path d="M12 3c4 3 5 8 3 13H9C7 11 8 6 12 3z" /><path d="M9 16l-3 4M15 16l3 4" /><circle cx="12" cy="10" r="1.5" /></>,
  mouse: <><rect x="7" y="3" width="10" height="18" rx="5" /><path d="M12 7v4" /></>,
  lock: <><rect x="5" y="11" width="14" height="9" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  grid: <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />,
  layers: <><path d="m12 4 9 5-9 5-9-5z" /><path d="m3 14 9 5 9-5" /></>,
  top: <><rect x="4" y="4" width="16" height="16" /><path d="M12 8v8M8 12h8" /></>,
  // фаза 5: сущности мира (как точечные сущности Hammer), небо, проекты, выходы
  ent_start: <><circle cx="9" cy="5" r="2.2" /><path d="M9 7.5v6M6 10h6M9 13.5l-3 6M9 13.5l3 6" /><path d="M15 12h6M18.5 9.5 21 12l-2.5 2.5" /></>,
  ent_zone: <><path d="M4 8 12 4l8 4v8l-8 4-8-4z" strokeDasharray="2.4 1.8" /><path d="M4 8l8 4 8-4M12 12v8" strokeDasharray="2.4 1.8" /></>,
  ent_actor: <><circle cx="12" cy="6" r="3" /><path d="M6 21v-5a6 6 0 0 1 12 0v5" /><path d="M16 4h5v3h-2l-1 1.5V7h-2z" /></>,
  ent_button: <><rect x="4" y="9" width="16" height="9" rx="1" /><rect x="8" y="6" width="8" height="5" rx="1" /></>,
  ent_lever: <><rect x="5" y="15" width="14" height="5" rx="1" /><path d="M12 15 16 5" /><circle cx="16.5" cy="4.5" r="1.6" /></>,
  ent_plate: <><path d="M3 17h18" /><rect x="6" y="13" width="12" height="4" /><path d="M12 4v6M9.5 7.5 12 10l2.5-2.5" /></>,
  ent_scene: <><rect x="3" y="7" width="13" height="11" rx="1" /><path d="M6 7v11M13 7v11" /><path d="M19.5 3.5a2.5 2.5 0 0 1 0 5l-1.5 3-1.5-3a2.5 2.5 0 0 1 3-5z" /></>,
  ent_timer: <><circle cx="12" cy="13" r="7.5" /><path d="M12 9v4.5l3 2M10 3h4" /></>,
  ent_relay: <><path d="M3 12h5M16 12h5" /><circle cx="8" cy="12" r="1.6" /><circle cx="16" cy="12" r="1.6" /><path d="M9.5 11 15 7" /></>,
  ent_counter: <><rect x="3" y="6" width="18" height="12" rx="1.5" /><path d="M7 10v4M7 10l-1 1M11 10h2.5v2H11v2h2.5M17 10h2v4h-2M17 12h2" /></>,
  ent_teleport: <><ellipse cx="12" cy="12" rx="6" ry="9" /><ellipse cx="12" cy="12" rx="3" ry="5" strokeDasharray="2 1.6" /></>,
  ent_particles: <><path d="M12 4v4M12 16v4M4 12h4M16 12h4" /><path d="m6.5 6.5 2 2M15.5 15.5l2 2M6.5 17.5l2-2M15.5 8.5l2-2" /><circle cx="12" cy="12" r="1.2" /></>,
  ent_message: <><rect x="3" y="5" width="18" height="11" rx="1.5" /><path d="M7 9h10M7 12h6M8 16l-2 4 5-4" /></>,
  sky: <><circle cx="9" cy="9" r="3.5" /><path d="M9 2.5v1.5M9 14v1.5M2.5 9H4M14 9h1.5M4.4 4.4l1 1M12.6 12.6l1 1M4.4 13.6l1-1M12.6 5.4l1-1" /><path d="M10 20h9a3 3 0 0 0-1-5.8A4 4 0 0 0 11 15a2.6 2.6 0 0 0-1 5z" /></>,
  project: <><path d="M3 7h7l2 2h9v10H3z" /><path d="M7 14l3 2 4-4 3 3" /></>,
  io: <><path d="M3 8h8M8 5l3 3-3 3" /><path d="M21 16h-8M16 13l-3 3 3 3" /></>,
  tutor: <><path d="M12 4 2 9l10 5 10-5z" /><path d="M6 11v5c3 2.5 9 2.5 12 0v-5" /><path d="M21 9v6" /></>,
  links: <><circle cx="6" cy="7" r="2.5" /><circle cx="18" cy="17" r="2.5" /><path d="M8.5 7h3a3 3 0 0 1 3 3v4a3 3 0 0 0 3 3" /></>,
  reconnect: <><path d="M4 12a8 8 0 0 1 14-5.3L20 9" /><path d="M20 4v5h-5" /><path d="M20 12a8 8 0 0 1-14 5.3L4 15" /><path d="M4 20v-5h5" /></>
};

export const TYPE_COLOR = {
  camera: '#a6b4c8', actor: '#e8a05a', light: '#f2d76b', sound: '#7cc4f5', marker: '#e57373', path: '#9ed2ff',
  group: '#d0d0d0', cloner: '#7fd36b', effector: '#b38cf0', block: '#c6a46b', template: '#d4b483', structure: '#e7a96a', scene: '#c8c8c8', sky: '#ffc861'
};

export default function I({ name, size = 18, color, sw = 1.6, fill }) {
  const p = P[name] || P.info;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill || 'none'} stroke={color || 'currentColor'} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{p}</svg>
  );
}

// иконка вида объекта, в цвете
export function TypeIcon({ type, size = 15 }) {
  return <I name={type === 'scene' ? 'film' : type} size={size} color={TYPE_COLOR[type] || '#ccc'} sw={1.8} />;
}

// ромб ключа: state = none | anim | part | key
export function KeyDiamond({ state, size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12">
      <defs><linearGradient id="c4-half" x1="0" x2="1" y1="0" y2="0"><stop offset="50%" stopColor="#e6c23c" /><stop offset="50%" stopColor="transparent" /></linearGradient></defs>
      <path d="M6 1 11 6 6 11 1 6z" strokeWidth="1.4" className={state} />
    </svg>
  );
}
