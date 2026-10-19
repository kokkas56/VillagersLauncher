// Все мини-игры. Каждая — ещё и живой фон лаунчера (режимы idle → play → over → idle).
import defense from './defense.js';
import runner from './runner.js';
import prison from './prison.js';
import fishing from './fishing.js';
import fair from './fair.js';
import mine from './mine.js';

export const GAMES = [defense, runner, prison, fishing, fair, mine];
