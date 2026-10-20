// Минимальная запись/чтение NBT (Java Edition, big-endian, gzip) — только то, что нужно шаблонам построек
// (vanilla StructureTemplate: DataVersion, size, palette, blocks, entities). Без зависимостей.
const zlib = require('zlib');

const T = { END: 0, BYTE: 1, SHORT: 2, INT: 3, LONG: 4, FLOAT: 5, DOUBLE: 6, BYTES: 7, STRING: 8, LIST: 9, COMPOUND: 10, INTS: 11, LONGS: 12 };
// Майнкрафт 1.21.1
const DATA_VERSION = 3955;

class W {
  constructor() { this.buf = Buffer.alloc(1 << 16); this.n = 0; }
  need(k) { if (this.n + k <= this.buf.length) return; let L = this.buf.length * 2; while (L < this.n + k) L *= 2; const b = Buffer.alloc(L); this.buf.copy(b, 0, 0, this.n); this.buf = b; }
  u8(v) { this.need(1); this.buf.writeUInt8(v & 255, this.n); this.n += 1; }
  i16(v) { this.need(2); this.buf.writeInt16BE(v, this.n); this.n += 2; }
  i32(v) { this.need(4); this.buf.writeInt32BE(v | 0, this.n); this.n += 4; }
  i64(v) { this.need(8); this.buf.writeBigInt64BE(BigInt.asIntN(64, typeof v === 'bigint' ? v : BigInt(Math.trunc(Number(v) || 0))), this.n); this.n += 8; }
  f32(v) { this.need(4); this.buf.writeFloatBE(Number(v) || 0, this.n); this.n += 4; }
  f64(v) { this.need(8); this.buf.writeDoubleBE(Number(v) || 0, this.n); this.n += 8; }
  str(s) { const b = Buffer.from(String(s), 'utf8'); this.need(2 + b.length); this.buf.writeUInt16BE(b.length, this.n); this.n += 2; b.copy(this.buf, this.n); this.n += b.length; }
  out() { return this.buf.subarray(0, this.n); }
}

// значения: { _t: тип, v } или обычный JS: строка → STRING, целое → INT, объект → COMPOUND
function tagOf(v) {
  if (v && typeof v === 'object' && '_t' in v) return v._t;
  if (typeof v === 'string') return T.STRING;
  if (typeof v === 'number') return T.INT;
  if (Array.isArray(v)) return T.LIST;
  return T.COMPOUND;
}
function payload(w, t, v) {
  const val = v && typeof v === 'object' && '_t' in v ? v.v : v;
  switch (t) {
    case T.BYTE: w.u8(typeof val === 'boolean' ? (val ? 1 : 0) : val); break;
    case T.LONG: w.i64(val); break;
    case T.FLOAT: w.f32(val); break;
    case T.DOUBLE: w.f64(val); break;
    case T.BYTES: { const b = Buffer.from(val); w.i32(b.length); w.need(b.length); b.copy(w.buf, w.n); w.n += b.length; break; }
    case T.LONGS: w.i32(val.length); for (const x of val) w.i64(x); break;
    case T.SHORT: w.i16(val); break;
    case T.INT: w.i32(val); break;
    case T.STRING: w.str(val); break;
    case T.LIST: {
      const et = v && v._et !== undefined ? v._et : (val.length ? tagOf(val[0]) : T.END);
      w.u8(et); w.i32(val.length);
      for (const x of val) payload(w, et, x);
      break;
    }
    case T.COMPOUND:
      for (const k of Object.keys(val)) { if (val[k] === undefined) continue; const tt = tagOf(val[k]); w.u8(tt); w.str(k); payload(w, tt, val[k]); }
      w.u8(T.END);
      break;
    case T.INTS: w.i32(val.length); for (const x of val) w.i32(x); break;
    default: throw new Error('NBT: тип ' + t + ' не поддержан');
  }
}
function writeNbt(root) {
  const w = new W();
  w.u8(T.COMPOUND); w.str('');
  payload(w, T.COMPOUND, root);
  return zlib.gzipSync(w.out());
}

// «minecraft:oak_log[axis=x]» → { Name, Properties? }
function stateOf(id) {
  const m = /^([^[]+)(?:\[(.*)\])?$/.exec(String(id || 'minecraft:air'));
  const o = { Name: m ? m[1] : 'minecraft:air' };
  if (m && m[2]) { const p = {}; for (const kv of m[2].split(',')) { const [k, v] = kv.split('='); if (k && v !== undefined) p[k.trim()] = v.trim(); } if (Object.keys(p).length) o.Properties = p; }
  return o;
}

// шаблон постройки: size [x,y,z], palette ['minecraft:stone', …], blocks — плоский массив [x,y,z,индекс палитры, …]
function structureNbt({ size, palette, blocks }) {
  const n = Math.floor((blocks ? blocks.length : 0) / 4);
  const list = new Array(n);
  for (let i = 0; i < n; i++) {
    const j = i * 4;
    list[i] = { pos: { _t: T.LIST, _et: T.INT, v: [blocks[j], blocks[j + 1], blocks[j + 2]] }, state: blocks[j + 3] };
  }
  return writeNbt({
    DataVersion: DATA_VERSION,
    size: { _t: T.LIST, _et: T.INT, v: size.map((x) => x | 0) },
    palette: { _t: T.LIST, _et: T.COMPOUND, v: palette.map(stateOf) },
    blocks: { _t: T.LIST, _et: T.COMPOUND, v: list },
    entities: { _t: T.LIST, _et: T.END, v: [] }
  });
}

// чтение (для проверки и для старых шаблонов без meta): возвращает обычный JS-объект
function readNbt(buf) {
  let b = buf;
  if (b[0] === 0x1f && b[1] === 0x8b) b = zlib.gunzipSync(b);
  let i = 0;
  const str = () => { const L = b.readUInt16BE(i); i += 2; const s = b.toString('utf8', i, i + L); i += L; return s; };
  const read = (t) => {
    switch (t) {
      case T.BYTE: return b.readInt8(i++);
      case T.SHORT: { const v = b.readInt16BE(i); i += 2; return v; }
      case T.INT: { const v = b.readInt32BE(i); i += 4; return v; }
      case T.LONG: { const v = b.readBigInt64BE(i); i += 8; return Number(v); }
      case T.FLOAT: { const v = b.readFloatBE(i); i += 4; return v; }
      case T.DOUBLE: { const v = b.readDoubleBE(i); i += 8; return v; }
      case T.BYTES: { const L = b.readInt32BE(i); i += 4; const v = b.subarray(i, i + L); i += L; return v; }
      case T.STRING: return str();
      case T.LIST: { const et = b.readUInt8(i++); const L = b.readInt32BE(i); i += 4; const a = []; for (let k = 0; k < L; k++) a.push(read(et)); return a; }
      case T.COMPOUND: { const o = {}; for (;;) { const tt = b.readUInt8(i++); if (tt === T.END) break; const k = str(); o[k] = read(tt); } return o; }
      case T.INTS: { const L = b.readInt32BE(i); i += 4; const a = []; for (let k = 0; k < L; k++) { a.push(b.readInt32BE(i)); i += 4; } return a; }
      case T.LONGS: { const L = b.readInt32BE(i); i += 4; const a = []; for (let k = 0; k < L; k++) { a.push(Number(b.readBigInt64BE(i))); i += 8; } return a; }
      default: throw new Error('NBT: неизвестный тип ' + t);
    }
  };
  const t = b.readUInt8(i++);
  if (t !== T.COMPOUND) throw new Error('NBT: корень не compound');
  str();
  return read(T.COMPOUND);
}

// чтение с сохранением типов: каждое значение — { _t, v } (списки ещё и _et), чтобы файл можно было поправить и записать обратно
// (например, имя мира в level.dat при копировании мира) без потери LONG/BYTE/FLOAT.
function readTyped(buf) {
  let b = buf;
  if (b[0] === 0x1f && b[1] === 0x8b) b = zlib.gunzipSync(b);
  let i = 0;
  const str = () => { const L = b.readUInt16BE(i); i += 2; const s = b.toString('utf8', i, i + L); i += L; return s; };
  const read = (t) => {
    switch (t) {
      case T.BYTE: return { _t: t, v: b.readInt8(i++) };
      case T.SHORT: { const v = b.readInt16BE(i); i += 2; return { _t: t, v }; }
      case T.INT: { const v = b.readInt32BE(i); i += 4; return { _t: t, v }; }
      case T.LONG: { const v = b.readBigInt64BE(i); i += 8; return { _t: t, v }; }
      case T.FLOAT: { const v = b.readFloatBE(i); i += 4; return { _t: t, v }; }
      case T.DOUBLE: { const v = b.readDoubleBE(i); i += 8; return { _t: t, v }; }
      case T.BYTES: { const L = b.readInt32BE(i); i += 4; const v = Buffer.from(b.subarray(i, i + L)); i += L; return { _t: t, v }; }
      case T.STRING: return { _t: t, v: str() };
      case T.LIST: { const et = b.readUInt8(i++); const L = b.readInt32BE(i); i += 4; const a = []; for (let k = 0; k < L; k++) a.push(read(et)); return { _t: t, _et: et, v: a }; }
      case T.COMPOUND: { const o = {}; for (;;) { const tt = b.readUInt8(i++); if (tt === T.END) break; const k = str(); o[k] = read(tt); } return { _t: t, v: o }; }
      case T.INTS: { const L = b.readInt32BE(i); i += 4; const a = []; for (let k = 0; k < L; k++) { a.push(b.readInt32BE(i)); i += 4; } return { _t: t, v: a }; }
      case T.LONGS: { const L = b.readInt32BE(i); i += 4; const a = []; for (let k = 0; k < L; k++) { a.push(b.readBigInt64BE(i)); i += 8; } return { _t: t, v: a }; }
      default: throw new Error('NBT: неизвестный тип ' + t);
    }
  };
  const t = b.readUInt8(i++);
  if (t !== T.COMPOUND) throw new Error('NBT: корень не compound');
  str();
  return read(T.COMPOUND);
}
// типизированный корень (результат readTyped) → gzip-файл
function writeTyped(root) {
  const w = new W();
  w.u8(T.COMPOUND); w.str('');
  payload(w, T.COMPOUND, root);
  return zlib.gzipSync(w.out());
}

module.exports = { writeNbt, readNbt, readTyped, writeTyped, structureNbt, stateOf, T, DATA_VERSION };
