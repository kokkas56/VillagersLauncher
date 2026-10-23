package ru.kokk.skinkokk.character.client;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import javax.annotation.Nullable;
import ru.kokk.skinkokk.SkinKokk;

/**
 * Каталог частей персонажа: assets/skinkokk/character/parts.json (тот же файл читает лаунчер). Кости — в формате
 * общей «оснастки» (kokk_rig.md §2.2): имя, родитель, опорная точка в пространстве родителя, поворот в градусах,
 * кубы как {@code addBox(from, size)}, необязательная пружина.
 */
public final class Catalog {
    public record Spring(float stiffness, float damping, float gravity, float limit, float inherit, float wind) {}

    /** Куб: slot — откуда цвет (base/pc/inner/light/dark/white/black/gold), skin — текстура скина (uv в пикселях скина). */
    public record Cube(float[] from, float[] size, String slot, boolean tip, float[] grow, boolean skin, int[] uv, boolean mirror) {}

    public record Bone(String name, String parent, float[] pivot, float[] rot, List<Cube> cubes, @Nullable Spring spring) {}

    public record PartDef(String kind, String id, String style, @Nullable String hideWith, List<Bone> bones) {}

    /** Телосложение: множители костей [x, y, z] (null — без изменений) и общий рост. */
    public record Body(float root, @Nullable float[] head, @Nullable float[] body, @Nullable float[] arms, @Nullable float[] legs) {}

    public final Map<String, Map<String, PartDef>> parts = new HashMap<>();
    public final Map<String, Body> bodies = new HashMap<>();
    public Body female = new Body(1F, null, null, null, null);
    public Spring chest = new Spring(0.55F, 0.3F, 0.2F, 14F, 1F, 0F);

    private static Catalog instance;

    public static Catalog get() {
        if (instance == null) instance = load();
        return instance;
    }

    @Nullable
    public PartDef part(String kind, String id) {
        Map<String, PartDef> m = parts.get(kind);
        return m == null ? null : m.get(id);
    }

    public Body body(String id) {
        Body b = bodies.get(id);
        return b != null ? b : new Body(1F, null, null, null, null);
    }

    private static Catalog load() {
        Catalog c = new Catalog();
        try (InputStream in = Catalog.class.getResourceAsStream("/assets/skinkokk/character/parts.json")) {
            if (in == null) {
                SkinKokk.LOGGER.warn("SkinKokk: character parts catalog is missing");
                return c;
            }
            JsonObject o = JsonParser.parseReader(new InputStreamReader(in, StandardCharsets.UTF_8)).getAsJsonObject();
            JsonObject ps = o.getAsJsonObject("parts");
            for (Map.Entry<String, JsonElement> k : ps.entrySet()) {
                Map<String, PartDef> m = new HashMap<>();
                for (Map.Entry<String, JsonElement> e : k.getValue().getAsJsonObject().entrySet()) {
                    JsonObject p = e.getValue().getAsJsonObject();
                    List<Bone> bones = new ArrayList<>();
                    for (JsonElement b : p.getAsJsonArray("bones")) bones.add(bone(b.getAsJsonObject()));
                    m.put(e.getKey(), new PartDef(k.getKey(), e.getKey(), p.has("style") ? p.get("style").getAsString() : "smooth",
                            p.has("hideWith") ? p.get("hideWith").getAsString() : null, bones));
                }
                c.parts.put(k.getKey(), m);
            }
            for (Map.Entry<String, JsonElement> e : o.getAsJsonObject("bodies").entrySet()) c.bodies.put(e.getKey(), body(e.getValue().getAsJsonObject()));
            if (o.has("female")) c.female = body(o.getAsJsonObject("female"));
            if (o.has("chest") && o.getAsJsonObject("chest").has("spring")) c.chest = spring(o.getAsJsonObject("chest").getAsJsonObject("spring"));
        } catch (Exception e) {
            SkinKokk.LOGGER.warn("SkinKokk: bad character parts catalog: {}", e.toString());
        }
        return c;
    }

    private static Body body(JsonObject o) {
        return new Body(o.has("root") ? o.get("root").getAsFloat() : 1F, vec(o, "head"), vec(o, "body"), vec(o, "arms"), vec(o, "legs"));
    }

    private static Bone bone(JsonObject o) {
        List<Cube> cubes = new ArrayList<>();
        for (JsonElement e : o.getAsJsonArray("cubes")) {
            JsonObject c = e.getAsJsonObject();
            float g = c.has("grow") && c.get("grow").isJsonPrimitive() ? c.get("grow").getAsFloat() : 0F;
            float[] grow = c.has("grow") && c.get("grow").isJsonArray() ? vec(c, "grow") : new float[] {g, g, g};
            int[] uv = null;
            if (c.has("uv")) {
                JsonArray a = c.getAsJsonArray("uv");
                uv = new int[] {a.get(0).getAsInt(), a.get(1).getAsInt()};
            }
            cubes.add(new Cube(vec(c, "from"), vec(c, "size"), c.has("slot") ? c.get("slot").getAsString() : "base", c.has("tip") && c.get("tip").getAsBoolean(),
                    grow, c.has("tex") && "skin".equals(c.get("tex").getAsString()), uv, c.has("mirror") && c.get("mirror").getAsBoolean()));
        }
        return new Bone(o.get("name").getAsString(), o.get("parent").getAsString(), vec(o, "pivot"), o.has("rot") ? vec(o, "rot") : new float[3], cubes,
                o.has("spring") ? spring(o.getAsJsonObject("spring")) : null);
    }

    private static Spring spring(JsonObject s) {
        return new Spring(f(s, "stiffness", 0.35F), f(s, "damping", 0.3F), f(s, "gravity", 0.3F), f(s, "limit", 35F), f(s, "inherit", 1F), f(s, "wind", 0F));
    }

    private static float f(JsonObject o, String k, float d) {
        return o.has(k) ? o.get(k).getAsFloat() : d;
    }

    @Nullable
    private static float[] vec(JsonObject o, String k) {
        if (!o.has(k) || !o.get(k).isJsonArray()) return null;
        JsonArray a = o.getAsJsonArray(k);
        return new float[] {a.get(0).getAsFloat(), a.get(1).getAsFloat(), a.get(2).getAsFloat()};
    }
}
