// «Жители» (фаза 6, трек B): проверка поведений, параметров и реплик ИИ жителей — русские сообщения.
// Один файл и для окна Студии, и для «Собрать» (scripts/sync-ai.cjs делает из него electron/studio-ai-validate.cjs),
// поэтому здесь нет import: каталог (действия, условия, слагаемые, события, цели, профессии, характеры) передаётся аргументом.

export const AI_ERR = 'error';
export const AI_WARN = 'warn';
export const AI_ID = /^[a-z0-9_.-]{1,64}$/;

const COND_GROUPS = ['not', 'any', 'all'];

function hasId(list, id) { return Array.isArray(list) && list.some((x) => x && String(x.id).toUpperCase() === String(id).toUpperCase()); }

function checkCond(c, cat, out, where, depth) {
  if (depth > 8) { out.push({ sev: AI_ERR, msg: where + ': условия вложены слишком глубоко' }); return; }
  if (!c || typeof c !== 'object' || Array.isArray(c)) { out.push({ sev: AI_ERR, msg: where + ': условие должно быть объектом' }); return; }
  if (c.not) { checkCond(c.not, cat, out, where + ' → «не»', depth + 1); return; }
  for (const g of ['any', 'all']) {
    if (c[g] != null) {
      if (!Array.isArray(c[g])) { out.push({ sev: AI_ERR, msg: where + ': «' + (g === 'any' ? 'любое из' : 'все') + '» — нужен список условий' }); return; }
      c[g].forEach((x, i) => checkCond(x, cat, out, where + ' → ' + (i + 1), depth + 1));
      return;
    }
  }
  const known = (cat.conds || []).map((x) => x.id);
  const k = Object.keys(c).find((x) => known.includes(x));
  if (!k) { out.push({ sev: AI_ERR, msg: where + ': неизвестное условие (бывают: ' + known.concat(COND_GROUPS).join(', ') + ')' }); return; }
  const v = c[k];
  if (k === 'trade') for (const t of [].concat(v)) if (!hasId(cat.trades, t)) out.push({ sev: AI_ERR, msg: where + ': нет профессии «' + t + '»' });
  if (k === 'temper') for (const t of [].concat(v)) if (!hasId(cat.tempers, t)) out.push({ sev: AI_ERR, msg: where + ': нет характера «' + t + '»' });
  if (k === 'goal') for (const t of [].concat(v)) if (!hasId(cat.goals, t)) out.push({ sev: AI_ERR, msg: where + ': нет цели «' + t + '»' });
  if (k === 'chance' && !(Number(v) >= 0 && Number(v) <= 1)) out.push({ sev: AI_ERR, msg: where + ': вероятность — число от 0 до 1' });
  if ((k === 'block' || k === 'item') && !String(v || '').trim()) out.push({ sev: AI_ERR, msg: where + ': не указан ' + (k === 'block' ? 'блок' : 'предмет') });
  if (k === 'block' && Number(c.radius) > 24) out.push({ sev: AI_WARN, msg: where + ': радиус поиска блока больше 24 — игра возьмёт 24' });
  if (['need', 'opinion', 'level', 'item'].includes(k) && c.op != null && !['<', '>', '<=', '>=', '==', '!='].includes(c.op)) out.push({ sev: AI_ERR, msg: where + ': сравнение бывает <, >, <=, >=, ==, !=' });
}

function isPlace(p) {
  if (p == null || p === '') return true;
  if (Array.isArray(p)) return p.length === 3 && p.every((x) => Number.isFinite(Number(x)));
  if (typeof p === 'string') return ['here', 'center', 'square', 'home', 'bed', 'storage', 'player'].includes(p) || /^\s*\{/.test(p);
  if (typeof p === 'object') return ['of', 'block', 'entity', 'building', 'random'].some((k) => p[k] != null);
  return false;
}

/** Проверка одного поведения. cat — каталог из игры (или запасной). Возвращает [{sev, msg, step?}]. */
export function aiValidateScript(s, cat) {
  const out = [];
  cat = cat || {};
  if (!s || typeof s !== 'object') return [{ sev: AI_ERR, msg: 'Поведение не объект' }];
  if (!AI_ID.test(String(s.id || ''))) out.push({ sev: AI_ERR, msg: 'Имя (id): только маленькие латинские буквы, цифры, _ . - (например mend_fence)' });
  if (!String(s.name || '').trim()) out.push({ sev: AI_WARN, msg: 'Нет названия — в Студии и в игре будет видно только id' });
  if (!String(s.name_en || '').trim()) out.push({ sev: AI_WARN, msg: 'Нет названия по-английски — английские игроки увидят русское' });
  const type = s.type || (s.on ? 'reaction' : 'goal');
  if (type !== 'goal' && type !== 'reaction') out.push({ sev: AI_ERR, msg: 'Вид бывает «дело» (goal) или «реакция» (reaction)' });
  const who = s.who || {};
  for (const t of [].concat(who.trades || [])) if (!hasId(cat.trades, t)) out.push({ sev: AI_ERR, msg: 'Кто: нет профессии «' + t + '»' });
  for (const t of [].concat(who.tempers || [])) if (!hasId(cat.tempers, t)) out.push({ sev: AI_ERR, msg: 'Кто: нет характера «' + t + '»' });
  if (who.age && !['adult', 'child', 'any'].includes(who.age)) out.push({ sev: AI_ERR, msg: 'Кто: возраст бывает adult (взрослые), child (дети), any (все)' });
  (Array.isArray(s.when) ? s.when : []).forEach((c, i) => checkCond(c, cat, out, 'Когда, условие ' + (i + 1), 0));
  if (s.when != null && !Array.isArray(s.when)) out.push({ sev: AI_ERR, msg: 'Когда: нужен список условий' });
  const sc = s.score || {};
  if (sc.base != null && !Number.isFinite(Number(sc.base))) out.push({ sev: AI_ERR, msg: 'Вес: основа — число' });
  const termIds = (cat.terms || []).map((x) => x.id);
  (Array.isArray(sc.terms) ? sc.terms : []).forEach((t, i) => {
    if (!t || !termIds.includes(t.k)) out.push({ sev: AI_ERR, msg: 'Вес, слагаемое ' + (i + 1) + ': неизвестное «' + (t && t.k) + '»' });
    else if (!Number.isFinite(Number(t.w))) out.push({ sev: AI_ERR, msg: 'Вес, слагаемое ' + (i + 1) + ': множитель — число' });
    else if ((t.k === 'items' || t.k === 'stored') && !String(t.item || '').trim()) out.push({ sev: AI_ERR, msg: 'Вес, слагаемое ' + (i + 1) + ': укажи предмет' });
  });
  if (type === 'goal' && Number(sc.base || 0) > 400) out.push({ sev: AI_WARN, msg: 'Вес больше 400: дело станет срочным и будет перебивать еду и сон' });
  const steps = Array.isArray(s.steps) ? s.steps : [];
  const acts = {};
  for (const a of cat.actions || []) acts[a.id] = a;
  if (type === 'goal' && !steps.length) out.push({ sev: AI_ERR, msg: 'У дела нет шагов' });
  if (type === 'reaction' && !steps.length && !s.goal) out.push({ sev: AI_ERR, msg: 'Реакции нечего делать: нет ни шагов, ни «затем дело»' });
  if (steps.length > 32) out.push({ sev: AI_WARN, msg: 'Шагов ' + steps.length + ' — по умолчанию выполняются первые 32 (параметр «Шагов в поведении не больше»)' });
  steps.forEach((st, i) => {
    const w = 'Шаг ' + (i + 1);
    if (!st || typeof st !== 'object') { out.push({ sev: AI_ERR, msg: w + ': не объект', step: i }); return; }
    const a = acts[st.do];
    if (!a) { out.push({ sev: AI_ERR, msg: w + ': неизвестное действие «' + st.do + '»', step: i }); return; }
    if (st.do === 'say') {
      if (!String(st.ru || st.text || '').trim()) out.push({ sev: AI_ERR, msg: w + ' «Сказать»: нет текста', step: i });
      if (!String(st.en || '').trim()) out.push({ sev: AI_WARN, msg: w + ' «Сказать»: нет текста по-английски — английские игроки увидят русский', step: i });
    }
    if (['get', 'craft', 'take', 'give'].includes(st.do) && !String(st.item || '').includes(':')) out.push({ sev: AI_ERR, msg: w + ' «' + a.ru + '»: укажи предмет (например minecraft:oak_fence)', step: i });
    if (st.do === 'place_block' && !String(st.block || '').includes(':')) out.push({ sev: AI_ERR, msg: w + ' «Поставить блок»: укажи блок', step: i });
    if (st.do === 'goal' && !hasId(cat.goals, st.kind)) out.push({ sev: AI_ERR, msg: w + ' «Своё дело»: нет цели «' + st.kind + '»', step: i });
    for (const k of ['to', 'at']) if (st[k] != null && !isPlace(st[k])) out.push({ sev: AI_ERR, msg: w + ': непонятное место «' + JSON.stringify(st[k]) + '»', step: i });
    if (st.do === 'anim' && cat.anims && st.name && !cat.anims.includes(st.name)) out.push({ sev: AI_WARN, msg: w + ': жест «' + st.name + '» неизвестен — будет взмах рукой', step: i });
  });
  if (type === 'reaction') {
    const evs = (cat.events || []).map((x) => x.id);
    if (!evs.includes(s.on)) out.push({ sev: AI_ERR, msg: 'Реакция: выбери событие (бывают: ' + evs.join(', ') + ')' });
    if (s.chance != null && !(Number(s.chance) >= 0 && Number(s.chance) <= 1)) out.push({ sev: AI_ERR, msg: 'Реакция: вероятность — от 0 до 1' });
  }
  if (s.cooldown != null && !(Number(s.cooldown) >= 0)) out.push({ sev: AI_ERR, msg: 'Перерыв — число тиков, не меньше 0' });
  return out;
}

/** Ссылки между поведениями: реакция → дело. */
export function aiValidateScripts(list, cat) {
  const out = [];
  const ids = new Set();
  for (const s of list || []) {
    for (const x of aiValidateScript(s, cat)) out.push({ ...x, doc: s && s.id });
    if (s && ids.has(s.id)) out.push({ sev: AI_ERR, doc: s.id, msg: 'id «' + s.id + '» уже занят другим поведением' });
    if (s) ids.add(s.id);
  }
  for (const s of list || []) if (s && s.goal && !ids.has(s.goal)) out.push({ sev: AI_ERR, doc: s.id, msg: 'Реакция ведёт к делу «' + s.goal + '», а его нет' });
  return out;
}

/** Параметры проекта {values, trades, tempers}. */
export function aiValidateParams(p, cat) {
  const out = [];
  if (!p) return out;
  const byId = {};
  for (const x of (cat && cat.params) || []) byId[x.id] = x;
  const check = (vals, where) => {
    for (const [id, v] of Object.entries(vals || {})) {
      const d = byId[id];
      if (!d) { out.push({ sev: AI_WARN, msg: where + ': неизвестный параметр «' + id + '» — игра его пропустит' }); continue; }
      const n = typeof v === 'boolean' ? (v ? 1 : 0) : Number(v);
      if (!Number.isFinite(n)) out.push({ sev: AI_ERR, msg: where + ': «' + d.name + '» — не число' });
      else if (n < d.min || n > d.max) out.push({ sev: AI_WARN, msg: where + ': «' + d.name + '» = ' + n + ' вне ' + d.min + '…' + d.max + ' — игра обрежет' });
    }
  };
  check(p.values, 'Для всех');
  for (const [t, v] of Object.entries(p.trades || {})) { if (cat && !hasId(cat.trades, t)) out.push({ sev: AI_ERR, msg: 'Нет профессии «' + t + '»' }); check(v, 'Профессия ' + t); }
  for (const [t, v] of Object.entries(p.tempers || {})) { if (cat && !hasId(cat.tempers, t)) out.push({ sev: AI_ERR, msg: 'Нет характера «' + t + '»' }); check(v, 'Характер ' + t); }
  return out;
}

/** Реплики {lines:[{key, mode, ru:[…], en:[…]}]}. */
export function aiValidateLines(d) {
  const out = [];
  const lines = d && Array.isArray(d.lines) ? d.lines : [];
  const seen = new Set();
  lines.forEach((l, i) => {
    const w = 'Реплика ' + (i + 1) + (l && l.key ? ' (' + l.key + ')' : '');
    if (!l || !/^[a-z0-9_.-]+$/.test(String(l.key || ''))) { out.push({ sev: AI_ERR, msg: w + ': ключ — латиница, цифры, _ . -' }); return; }
    if (seen.has(l.key)) out.push({ sev: AI_WARN, msg: w + ': ключ уже есть выше — строки сложатся' });
    seen.add(l.key);
    if (!['add', 'replace'].includes(l.mode || 'add')) out.push({ sev: AI_ERR, msg: w + ': режим бывает add (добавить) или replace (заменить)' });
    const ru = [].concat(l.ru || []).filter((x) => String(x).trim()), en = [].concat(l.en || []).filter((x) => String(x).trim());
    if (!ru.length && !en.length) out.push({ sev: AI_WARN, msg: w + ': нет ни одной строки — ничего не изменится' });
    else if (!en.length) out.push({ sev: AI_WARN, msg: w + ': нет строк по-английски — английские игроки увидят русские' });
    else if (!ru.length) out.push({ sev: AI_WARN, msg: w + ': нет строк по-русски — русские игроки увидят английские' });
    const args = (s) => (String(s).match(/%(\d+\$)?s/g) || []).length;
    for (const s of ru.concat(en)) if (/%[^s%\d]/.test(String(s).replace(/%\d+\$s/g, ''))) out.push({ sev: AI_WARN, msg: w + ': в строке «' + s + '» странный %-знак (подстановки: %s, %1$s; знак процента — %%)' });
    if (ru.length && en.length && args(ru[0]) !== args(en[0])) out.push({ sev: AI_WARN, msg: w + ': в русской и английской строке разное число подстановок %s' });
  });
  return out;
}

/** Убрать из поведения служебные поля редактора (_ui и пустые). */
export function aiCleanScript(s) {
  const o = {};
  for (const [k, v] of Object.entries(s || {})) if (!k.startsWith('_') && v !== undefined) o[k] = v;
  o.v = 1;
  return o;
}
