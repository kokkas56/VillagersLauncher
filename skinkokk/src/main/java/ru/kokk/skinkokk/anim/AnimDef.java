package ru.kokk.skinkokk.anim;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

/**
 * Одна анимация (формат «Анимаций» Студии Кокка, см. kokk_rig.md): кости → дорожки rot/pos/scale с ключами
 * {t, v:[x,y,z], ease, bz}. Углы — градусы, оси как у ModelPart. Общий класс (сервер и клиент), без клиентских типов.
 */
public final class AnimDef {
    public static final Pattern SAFE_ID = Pattern.compile("[a-z0-9_.-]{1,64}");
    public static final int ROT = 0, POS = 1, SCALE = 2;
    static final String[] CH = {"rot", "pos", "scale"};

    public final String id, name, nameEn, cat, target, icon, json;
    public final int length, blendIn, blendOut;
    public final float speed;
    public final boolean loop, stay, lockLegs, emote, replaceDefault;
    public final Map<String, Track> tracks;
    public final Map<String, Boolean> replace;
    public final Map<String, float[]> springs;
    public final List<Event> events;
    /** true — из мода (assets/skinkokk/anims). */
    public final boolean builtin;
    /** Свои кости анимации (группа, предмет, кубик) — «родитель раньше детей», без кругов и неизвестных родителей. */
    public final List<Bone> bones;
    /** Кость тела → id группы, которая её двигает (туловище в группе несёт голову и руки, если они не в своей группе). */
    public final Map<String, String> groupOf;
    /** Есть предметы или кубики — их рисует слой {@code AnimBones}. */
    public final boolean drawBones;

    public static final int MAX_BONES = 16;
    static final Pattern BONE_ID = Pattern.compile("x_[a-z0-9_]{1,40}");
    static final Pattern ITEM_ID = Pattern.compile("[a-z0-9_.-]+:[a-z0-9_./-]+");
    /** Кости тела, к которым можно крепить свои кости. */
    static final Set<String> PARENTABLE = Set.of("root", "body", "head", "hat", "right_arm", "left_arm", "right_leg", "left_leg", "arms", "nose");
    /** Кости тела, которые можно положить в группу. */
    static final Set<String> GROUPABLE = Set.of("body", "head", "right_arm", "left_arm", "right_leg", "left_leg", "arms");
    static final String[] BODY_CARRIED = {"head", "arms", "right_arm", "left_arm"};

    /**
     * Своя кость (формат «bones» Студии): группа-пустышка (двигает кости тела из children вокруг своей опоры), предмет
     * (item, display hand|fixed) или кубик (from, size, color). pivot — пиксели в пространстве родителя, rot — градусы.
     */
    public static final class Bone {
        public static final int GROUP = 0, ITEM = 1, CUBE = 2;
        public final String id, name, parent, item, display;
        public final int kind, color;
        public final float[] pivot, rot, from, size;
        public final List<String> children;
        /** Кость тела (или root), к которой цепь своих костей крепится в итоге. */
        public String anchor = "root";
        /** Вся цепь до root — группы: такая группа может двигать кости тела. */
        public boolean rootChain;
        /** Свои кости сверху вниз: от первой под anchor до этой (включительно). */
        public Bone[] chain = new Bone[0];

        Bone(String id, String name, int kind, String parent, float[] pivot, float[] rot, List<String> children, String item, String display, float[] from,
             float[] size, int color) {
            this.id = id;
            this.name = name;
            this.kind = kind;
            this.parent = parent;
            this.pivot = pivot;
            this.rot = rot;
            this.children = children;
            this.item = item;
            this.display = display;
            this.from = from;
            this.size = size;
            this.color = color;
        }
    }

    /** Дорожка кости: три канала (null — канала нет). */
    public static final class Track {
        public final Chan[] ch = new Chan[3];

        public boolean has(int c) {
            return ch[c] != null;
        }
    }

    /** Ключи одного канала. */
    public static final class Chan {
        final float[] t;
        final float[][] v;
        final byte[] ease;
        final float[][] bz;

        Chan(float[] t, float[][] v, byte[] ease, float[][] bz) {
            this.t = t;
            this.v = v;
            this.ease = ease;
            this.bz = bz;
        }

        /** Значение в момент time → out[0..2]. */
        public void sample(float time, float[] out) {
            int n = t.length;
            if (time <= t[0]) { copy(v[0], out); return; }
            if (time >= t[n - 1]) { copy(v[n - 1], out); return; }
            int i = 0;
            while (i < n - 2 && t[i + 1] <= time) i++;
            float span = t[i + 1] - t[i];
            if (span <= 0) { copy(v[i + 1], out); return; }
            float e = Ease.apply(ease[i], (time - t[i]) / span, bz[i]);
            for (int c = 0; c < 3; c++) out[c] = v[i][c] + (v[i + 1][c] - v[i][c]) * e;
        }

        private static void copy(float[] a, float[] out) {
            out[0] = a[0];
            out[1] = a[1];
            out[2] = a[2];
        }
    }

    /** Событие: sound / particle / face / signal (что-то одно). */
    public static final class Event {
        public final int t;
        public final String kind, value, bone;
        public final float vol, pitch, spread;
        public final int count;

        Event(int t, String kind, String value, String bone, float vol, float pitch, int count, float spread) {
            this.t = t;
            this.kind = kind;
            this.value = value;
            this.bone = bone;
            this.vol = vol;
            this.pitch = pitch;
            this.count = count;
            this.spread = spread;
        }
    }

    private AnimDef(JsonObject o, String idHint, boolean builtin, String json) {
        String id0 = str(o, "id", idHint == null ? "" : idHint);
        if (!SAFE_ID.matcher(id0).matches()) throw new IllegalArgumentException("плохой id анимации «" + id0 + "» (нужны a-z 0-9 _ . -)");
        this.id = id0;
        this.name = str(o, "name", id0);
        this.nameEn = str(o, "name_en", "");
        this.cat = str(o, "cat", "misc");
        this.target = str(o, "target", "any_humanoid");
        this.icon = str(o, "icon", "");
        this.length = Math.max(1, Math.min(20 * 60 * 30, (int) num(o, "length", 40)));
        this.blendIn = Math.max(0, Math.min(400, (int) num(o, "blendIn", 4)));
        this.blendOut = Math.max(0, Math.min(400, (int) num(o, "blendOut", 6)));
        this.speed = (float) Math.max(0.05, Math.min(10, num(o, "speed", 1)));
        this.loop = bool(o, "loop", false);
        this.stay = bool(o, "stay", false);
        this.lockLegs = bool(o, "lockLegs", false);
        this.emote = bool(o, "emote", true);
        this.replaceDefault = "replace".equals(str(o, "mode", "add"));
        this.builtin = builtin;
        this.json = json;
        Map<String, Boolean> rep = new HashMap<>();
        if (o.has("modes") && o.get("modes").isJsonObject()) {
            for (Map.Entry<String, JsonElement> e : o.getAsJsonObject("modes").entrySet()) {
                if (e.getValue().isJsonPrimitive()) rep.put(e.getKey(), "replace".equals(e.getValue().getAsString()));
            }
        }
        this.replace = Collections.unmodifiableMap(rep);
        Map<String, Track> tr = new HashMap<>();
        if (o.has("tracks") && o.get("tracks").isJsonObject()) {
            for (Map.Entry<String, JsonElement> e : o.getAsJsonObject("tracks").entrySet()) {
                if (!e.getValue().isJsonObject()) continue;
                Track t = new Track();
                for (int c = 0; c < 3; c++) t.ch[c] = chan(e.getValue().getAsJsonObject().get(CH[c]), c);
                if (t.ch[0] != null || t.ch[1] != null || t.ch[2] != null) tr.put(e.getKey(), t);
            }
        }
        this.tracks = Collections.unmodifiableMap(tr);
        Map<String, float[]> sp = new HashMap<>();
        if (o.has("springs") && o.get("springs").isJsonObject()) {
            String[] keys = Spring.KEYS;
            for (Map.Entry<String, JsonElement> e : o.getAsJsonObject("springs").entrySet()) {
                if (!e.getValue().isJsonObject()) continue;
                float[] p = new float[keys.length];
                for (int i = 0; i < keys.length; i++) p[i] = (float) num(e.getValue().getAsJsonObject(), keys[i], Float.NaN);
                sp.put(e.getKey(), p);
            }
        }
        this.springs = Collections.unmodifiableMap(sp);
        List<Event> ev = new ArrayList<>();
        if (o.has("events") && o.get("events").isJsonArray()) {
            for (JsonElement el : o.getAsJsonArray("events")) {
                if (!el.isJsonObject()) continue;
                JsonObject e = el.getAsJsonObject();
                int t = (int) num(e, "t", 0);
                for (String k : new String[] {"sound", "particle", "face", "signal"}) {
                    if (!e.has(k) || !e.get(k).isJsonPrimitive()) continue;
                    ev.add(new Event(t, k, e.get(k).getAsString(), str(e, "bone", ""), (float) num(e, "vol", 1), (float) num(e, "pitch", 1),
                            (int) Math.max(1, Math.min(64, num(e, "count", 3))), (float) Math.max(0, Math.min(4, num(e, "spread", 0.3)))));
                    break;
                }
            }
        }
        ev.sort((a, b) -> Integer.compare(a.t, b.t));
        this.events = Collections.unmodifiableList(ev);
        this.bones = parseBones(o);
        Map<String, String> gof = new HashMap<>();
        boolean draw = false;
        for (Bone b : bones) {
            if (b.kind != Bone.GROUP) draw = true;
            else if (b.rootChain) for (String c : b.children) gof.putIfAbsent(c, b.id);
        }
        String bodyGroup = gof.get("body");
        if (bodyGroup != null) for (String c : BODY_CARRIED) gof.putIfAbsent(c, bodyGroup);
        this.groupOf = Collections.unmodifiableMap(gof);
        this.drawBones = draw;
    }

    /** Свои кости: безопасные пределы, не больше {@link #MAX_BONES}, мусор пропускается. */
    private static List<Bone> parseBones(JsonObject o) {
        if (!o.has("bones") || !o.get("bones").isJsonArray()) return List.of();
        Map<String, Bone> byId = new LinkedHashMap<>();
        for (JsonElement el : o.getAsJsonArray("bones")) {
            if (byId.size() >= MAX_BONES) break;
            if (!el.isJsonObject()) continue;
            JsonObject b = el.getAsJsonObject();
            String id = str(b, "id", "");
            if (!BONE_ID.matcher(id).matches() || byId.containsKey(id) || PARENTABLE.contains(id)) continue;
            int kind = switch (str(b, "kind", "group")) {
                case "group" -> Bone.GROUP;
                case "item" -> Bone.ITEM;
                case "cube" -> Bone.CUBE;
                default -> -1;
            };
            if (kind < 0) continue;
            String item = str(b, "item", "").trim();
            if (kind == Bone.ITEM && !ITEM_ID.matcher(item).matches()) continue;
            List<String> ch = new ArrayList<>();
            if (kind == Bone.GROUP && b.has("children") && b.get("children").isJsonArray()) {
                for (JsonElement c : b.getAsJsonArray("children")) {
                    if (c.isJsonPrimitive() && GROUPABLE.contains(c.getAsString()) && !ch.contains(c.getAsString())) ch.add(c.getAsString());
                }
            }
            int color = 0xC08040;
            String cs = str(b, "color", "");
            if (cs.matches("#[0-9a-fA-F]{6}")) color = Integer.parseInt(cs.substring(1), 16);
            byId.put(id, new Bone(id, str(b, "name", id), kind, str(b, "parent", "root"), vec(b, "pivot", 0, -64, 64), vec(b, "rot", 0, -360, 360),
                    Collections.unmodifiableList(ch), item, "fixed".equals(str(b, "display", "hand")) ? "fixed" : "hand", vec(b, "from", -2, -32, 32),
                    vec(b, "size", 4, 0.1f, 32), color));
        }
        List<Bone> ok = new ArrayList<>();
        for (Bone b : byId.values()) {
            ArrayDeque<Bone> chain = new ArrayDeque<>();
            Set<String> seen = new HashSet<>();
            Bone cur = b;
            boolean good = true, groups = true;
            while (true) {
                if (!seen.add(cur.id)) {
                    good = false; // круг
                    break;
                }
                chain.addFirst(cur);
                if (cur.kind != Bone.GROUP) groups = false;
                Bone p = byId.get(cur.parent);
                if (p == null) break;
                cur = p;
            }
            if (!good || !PARENTABLE.contains(cur.parent)) continue;
            b.anchor = cur.parent;
            b.rootChain = groups && "root".equals(cur.parent);
            b.chain = chain.toArray(new Bone[0]);
            ok.add(b);
        }
        ok.sort(Comparator.comparingInt(x -> x.chain.length));
        return Collections.unmodifiableList(ok);
    }

    private static float[] vec(JsonObject o, String k, float def, float lo, float hi) {
        float[] v = {def, def, def};
        JsonElement e = o.get(k);
        if (e != null && e.isJsonArray()) {
            JsonArray a = e.getAsJsonArray();
            for (int i = 0; i < 3 && i < a.size(); i++) {
                try {
                    float f = a.get(i).getAsFloat();
                    if (Float.isFinite(f)) v[i] = f;
                } catch (RuntimeException x) {
                    // мусор — значение по умолчанию
                }
            }
        }
        for (int i = 0; i < 3; i++) v[i] = Math.max(lo, Math.min(hi, v[i]));
        return v;
    }

    public Bone bone(String id) {
        for (Bone b : bones) if (b.id.equals(id)) return b;
        return null;
    }

    /** Разобрать JSON анимации; бросает IllegalArgumentException с русским текстом. */
    public static AnimDef parse(JsonObject o, String idHint, boolean builtin) {
        return new AnimDef(o, idHint, builtin, o.toString());
    }

    public boolean replaces(String bone) {
        Boolean b = replace.get(bone);
        return b != null ? b : replaceDefault;
    }

    public Track track(String bone) {
        return tracks.get(bone);
    }

    /** Двигает ли анимация руки по отдельности (житель тогда раскрещивает руки). */
    public boolean freeArms() {
        return tracks.containsKey("right_arm") || tracks.containsKey("left_arm");
    }

    public String displayName(boolean russian) {
        return !russian && !nameEn.isEmpty() ? nameEn : name;
    }

    private static Chan chan(JsonElement e, int c) {
        if (e == null || !e.isJsonArray()) return null;
        JsonArray a = e.getAsJsonArray();
        List<float[]> vs = new ArrayList<>();
        List<Float> ts = new ArrayList<>();
        List<Byte> es = new ArrayList<>();
        List<float[]> bzs = new ArrayList<>();
        float def = c == SCALE ? 1 : 0;
        for (JsonElement ke : a) {
            if (!ke.isJsonObject()) continue;
            JsonObject k = ke.getAsJsonObject();
            float[] v = {def, def, def};
            if (k.has("v") && k.get("v").isJsonArray()) {
                JsonArray va = k.getAsJsonArray("v");
                for (int i = 0; i < 3 && i < va.size(); i++) {
                    try {
                        v[i] = va.get(i).getAsFloat();
                    } catch (RuntimeException ex) {
                        v[i] = def;
                    }
                    if (!Float.isFinite(v[i])) v[i] = def;
                }
            }
            if (c == SCALE) for (int i = 0; i < 3; i++) v[i] = Math.max(0.01f, Math.min(4f, v[i]));
            if (c == POS) for (int i = 0; i < 3; i++) v[i] = Math.max(-64f, Math.min(64f, v[i]));
            ts.add((float) num(k, "t", 0));
            vs.add(v);
            es.add(Ease.code(str(k, "ease", "smooth")));
            float[] bz = null;
            if (k.has("bz") && k.get("bz").isJsonArray() && k.getAsJsonArray("bz").size() == 4) {
                bz = new float[4];
                for (int i = 0; i < 4; i++) bz[i] = k.getAsJsonArray("bz").get(i).getAsFloat();
            }
            bzs.add(bz);
        }
        if (ts.isEmpty()) return null;
        // сортировка по времени
        Integer[] idx = new Integer[ts.size()];
        for (int i = 0; i < idx.length; i++) idx[i] = i;
        java.util.Arrays.sort(idx, (x, y) -> Float.compare(ts.get(x), ts.get(y)));
        float[] t = new float[idx.length];
        float[][] v = new float[idx.length][];
        byte[] ea = new byte[idx.length];
        float[][] bz = new float[idx.length][];
        for (int i = 0; i < idx.length; i++) {
            t[i] = ts.get(idx[i]);
            v[i] = vs.get(idx[i]);
            ea[i] = es.get(idx[i]);
            bz[i] = bzs.get(idx[i]);
        }
        return new Chan(t, v, ea, bz);
    }

    static String str(JsonObject o, String k, String d) {
        JsonElement e = o.get(k);
        return e != null && e.isJsonPrimitive() ? e.getAsString() : d;
    }

    static double num(JsonObject o, String k, double d) {
        JsonElement e = o.get(k);
        if (e == null || !e.isJsonPrimitive()) return d;
        try {
            double v = e.getAsDouble();
            return Double.isFinite(v) ? v : d;
        } catch (RuntimeException x) {
            return d;
        }
    }

    static boolean bool(JsonObject o, String k, boolean d) {
        JsonElement e = o.get(k);
        return e != null && e.isJsonPrimitive() ? e.getAsBoolean() : d;
    }
}
