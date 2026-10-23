// «Персонаж» (мод SkinKokk): уши, хвост, причёска, одежда, телосложение, грудь.
// Хранится в настройках лаунчера по нику аккаунта (characters[ник] = { char, presets }), текущий пишется в
// <папка игры>/skinkokk/character.json — мод читает его в игре и раздаёт всем игрокам сервера.
// Проверка содержимого — в моде (CharacterData) и на странице (characterRig.js); здесь — только размер и форма.
const fs = require('fs');
const path = require('path');

const MAX_JSON = 16384;

module.exports = function setupCharacters({ handle, store, nickKey, onChanged }) {
  const all = () => store.get().characters || {};
  const mine = () => all()[nickKey()] || {};
  const save = (rec) => store.set({ characters: { ...all(), [nickKey()]: rec } });

  function check(c) {
    if (!c || typeof c !== 'object' || Array.isArray(c)) throw new Error('Это не персонаж');
    const json = JSON.stringify(c);
    if (json.length > MAX_JSON) throw new Error('Персонаж слишком большой');
    return JSON.parse(json);
  }

  function writeFile(gameDir) {
    const dir = path.join(gameDir || store.get().gameDir, 'skinkokk');
    const f = path.join(dir, 'character.json');
    const c = mine().char;
    if (c) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(f, JSON.stringify(c));
    } else fs.rmSync(f, { force: true });
  }

  handle('character:get', () => ({ char: mine().char || null, presets: mine().presets || [] }));
  handle('character:set', (c) => {
    const char = check(c);
    save({ ...mine(), char, t: Date.now() });
    try { writeFile(); } catch (e) { console.error('character file', e); }
    onChanged();
    return true;
  });
  handle('character:presetSave', ({ name, char } = {}) => {
    const c = check(char);
    const presets = (mine().presets || []).slice(0, 40);
    const n = String(name || 'Персонаж').slice(0, 32);
    const id = 'p' + Date.now().toString(36);
    const next = [...presets.filter((p) => p.name !== n), { id, name: n, char: c }];
    save({ ...mine(), presets: next });
    return next;
  });
  handle('character:presetRemove', (id) => {
    const next = (mine().presets || []).filter((p) => p.id !== id);
    save({ ...mine(), presets: next });
    return next;
  });

  return {
    current: () => mine().char || null,
    writeFile
  };
};
