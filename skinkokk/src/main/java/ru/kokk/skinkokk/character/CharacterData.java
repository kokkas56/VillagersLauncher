package ru.kokk.skinkokk.character;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;
import javax.annotation.Nullable;

/**
 * Персонаж игрока («Персонаж» в VillagersLauncher): пол, телосложение, руки, грудь, уши/хвост/причёска/одежда с
 * цветами. Маленький JSON (≤ 16 КБ), общий для клиента и сервера: тут только разбор и проверка, без клиентского кода.
 *
 * <pre>
 * { "v":1, "on":true, "gender":"female", "body":"normal", "height":1, "arms":"auto",
 *   "chest":{"size":0.5,"phys":0.6}, "phys":1,
 *   "parts":[ {"k":"ears","id":"cat","c":{"b":"#3b3434","p":"none","pc":"#f2e3d5"},"phys":0.6}, … ] }
 * </pre>
 */
public final class CharacterData {
    public static final int MAX_JSON = 16384;
    public static final int MAX_PARTS = 12;
    public static final List<String> KINDS = List.of("ears", "tail", "hair", "clothes");
    public static final List<String> BODIES = List.of("normal", "strong", "slim", "short", "tall");
    public static final List<String> PATTERNS = List.of("none", "stripes", "vstripes", "checker", "dots", "spots", "zigzag", "tip", "belly");
    private static final Pattern ID = Pattern.compile("[a-z0-9_]{1,24}");
    private static final Pattern HEX = Pattern.compile("#?[0-9a-fA-F]{6}");

    /** Цветовой шаблон части: основной цвет, узор, цвет узора (RGB без альфы). */
    public record Colors(int base, String pattern, int pc) {
        public static final Colors DEFAULT = new Colors(0x7a5a3a, "none", 0xf0e6d8);
    }

    /** Одна часть: вид (ears/tail/hair/clothes), её id в каталоге, цвета, сила физики 0..1. */
    public record Part(String kind, String id, Colors colors, float phys) {}

    public final boolean on;
    public final boolean female;
    public final String body;
    /** Рост поверх телосложения, 0.9…1.08. */
    public final float height;
    /** auto | slim | wide. */
    public final String arms;
    public final float chestSize;
    public final float chestPhys;
    /** Общая сила физики персонажа 0..1. */
    public final float phys;
    public final List<Part> parts;

    private CharacterData(boolean on, boolean female, String body, float height, String arms, float chestSize, float chestPhys, float phys, List<Part> parts) {
        this.on = on;
        this.female = female;
        this.body = body;
        this.height = height;
        this.arms = arms;
        this.chestSize = chestSize;
        this.chestPhys = chestPhys;
        this.phys = phys;
        this.parts = Collections.unmodifiableList(parts);
    }

    /** Разбирает и проверяет; null — если это не персонаж или он слишком большой. Значения зажимаются в безопасные. */
    @Nullable
    public static CharacterData parse(@Nullable String json) {
        if (json == null || json.isBlank() || json.length() > MAX_JSON) return null;
        try {
            JsonElement el = JsonParser.parseString(json);
            if (!el.isJsonObject()) return null;
            return of(el.getAsJsonObject());
        } catch (RuntimeException e) {
            return null;
        }
    }

    public static CharacterData of(JsonObject o) {
        boolean on = !o.has("on") || bool(o, "on");
        boolean female = "female".equals(str(o, "gender", "male"));
        String body = str(o, "body", "normal");
        if (!BODIES.contains(body)) body = "normal";
        float height = clamp(num(o, "height", 1F), 0.9F, 1.08F);
        String arms = str(o, "arms", "auto");
        if (!arms.equals("slim") && !arms.equals("wide")) arms = "auto";
        float size = 0, cphys = 0.6F;
        if (o.has("chest") && o.get("chest").isJsonObject()) {
            JsonObject c = o.getAsJsonObject("chest");
            size = clamp(num(c, "size", 0F), 0F, 1F);
            cphys = clamp(num(c, "phys", 0.6F), 0F, 1F);
        }
        if (!female) size = 0;
        float phys = clamp(num(o, "phys", 1F), 0F, 1F);
        List<Part> parts = new ArrayList<>();
        Set<String> single = new HashSet<>();
        Set<String> clothes = new HashSet<>();
        if (o.has("parts") && o.get("parts").isJsonArray()) {
            JsonArray arr = o.getAsJsonArray("parts");
            for (JsonElement e : arr) {
                if (parts.size() >= MAX_PARTS) break;
                if (!e.isJsonObject()) continue;
                JsonObject p = e.getAsJsonObject();
                String kind = str(p, "k", "");
                String id = str(p, "id", "");
                if (!KINDS.contains(kind) || !ID.matcher(id).matches() || id.equals("none")) continue;
                if (kind.equals("clothes") ? !clothes.add(id) : !single.add(kind)) continue;
                Colors c = Colors.DEFAULT;
                if (p.has("c") && p.get("c").isJsonObject()) {
                    JsonObject co = p.getAsJsonObject("c");
                    String pat = str(co, "p", "none");
                    c = new Colors(color(str(co, "b", ""), 0x7a5a3a), PATTERNS.contains(pat) ? pat : "none", color(str(co, "pc", ""), 0xf0e6d8));
                }
                parts.add(new Part(kind, id, c, clamp(num(p, "phys", 0.6F), 0F, 1F)));
            }
        }
        return new CharacterData(on, female, body, height, arms, size, cphys, phys, parts);
    }

    /** Та же запись после правил сервера (запрещённое — выключено). */
    public CharacterData restricted(boolean allowChest, boolean allowBody, boolean allowParts) {
        return new CharacterData(on, female, allowBody ? body : "normal", allowBody ? height : 1F, arms, allowChest ? chestSize : 0F, chestPhys, phys,
                allowParts ? parts : List.of());
    }

    public boolean has(String kind, String id) {
        for (Part p : parts) if (p.kind.equals(kind) && p.id.equals(id)) return true;
        return false;
    }

    public JsonObject toJsonObject() {
        JsonObject o = new JsonObject();
        o.addProperty("v", 1);
        o.addProperty("on", on);
        o.addProperty("gender", female ? "female" : "male");
        o.addProperty("body", body);
        o.addProperty("height", round(height));
        o.addProperty("arms", arms);
        JsonObject c = new JsonObject();
        c.addProperty("size", round(chestSize));
        c.addProperty("phys", round(chestPhys));
        o.add("chest", c);
        o.addProperty("phys", round(phys));
        JsonArray arr = new JsonArray();
        for (Part p : parts) {
            JsonObject j = new JsonObject();
            j.addProperty("k", p.kind);
            j.addProperty("id", p.id);
            JsonObject co = new JsonObject();
            co.addProperty("b", hex(p.colors.base()));
            co.addProperty("p", p.colors.pattern());
            co.addProperty("pc", hex(p.colors.pc()));
            j.add("c", co);
            j.addProperty("phys", round(p.phys));
            arr.add(j);
        }
        o.add("parts", arr);
        return o;
    }

    public String toJson() {
        return toJsonObject().toString();
    }

    // ---- helpers ------------------------------------------------------------------------------------------------------

    public static String hex(int rgb) {
        return String.format(Locale.ROOT, "#%06x", rgb & 0xFFFFFF);
    }

    static int color(String s, int def) {
        if (s == null || !HEX.matcher(s).matches()) return def;
        return Integer.parseInt(s.startsWith("#") ? s.substring(1) : s, 16);
    }

    private static float round(float v) {
        return Math.round(v * 1000F) / 1000F;
    }

    private static float clamp(float v, float lo, float hi) {
        return Float.isNaN(v) ? lo : Math.max(lo, Math.min(hi, v));
    }

    private static String str(JsonObject o, String k, String def) {
        try {
            return o.has(k) && o.get(k).isJsonPrimitive() ? o.get(k).getAsString() : def;
        } catch (RuntimeException e) {
            return def;
        }
    }

    private static boolean bool(JsonObject o, String k) {
        try {
            return o.has(k) && o.get(k).isJsonPrimitive() && o.get(k).getAsBoolean();
        } catch (RuntimeException e) {
            return false;
        }
    }

    private static float num(JsonObject o, String k, float def) {
        try {
            return o.has(k) && o.get(k).isJsonPrimitive() && o.get(k).getAsJsonPrimitive().isNumber() ? o.get(k).getAsFloat() : def;
        } catch (RuntimeException e) {
            return def;
        }
    }
}
