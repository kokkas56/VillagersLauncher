package ru.kokk.skinkokk.character.client;

import com.mojang.blaze3d.platform.NativeImage;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import javax.annotation.Nullable;
import net.minecraft.client.Minecraft;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.model.geom.PartPose;
import net.minecraft.client.model.geom.builders.CubeDeformation;
import net.minecraft.client.model.geom.builders.CubeListBuilder;
import net.minecraft.client.model.geom.builders.LayerDefinition;
import net.minecraft.client.model.geom.builders.MeshDefinition;
import net.minecraft.client.model.geom.builders.PartDefinition;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.Mth;
import ru.kokk.skinkokk.SkinKokk;
import ru.kokk.skinkokk.character.CharacterData;

/**
 * Готовая модель частей одного персонажа: кости из каталога, «запечённые» в ModelPart, и сгенерированная текстура
 * (атлас 128×N). Три дерева с одинаковыми костями: атлас (уши, хвост, волосы, одежда), скин игрока (грудь, эльфийские
 * уши — берут цвет прямо со скина) и броня (грудь под нагрудником, текстура 64×32). Кэш по JSON персонажа.
 */
public final class CharModel {
    public static final List<String> GROUPS = List.of("head", "body", "right_arm", "left_arm", "right_leg", "left_leg");
    private static final int ATLAS_W = 128, ATLAS_MAX_H = 256;

    /** Что известно о кости для позы и физики. */
    public static final class BoneInfo {
        public final String name, group, kind, hideWith, parent;
        @Nullable public final Catalog.Spring spring;
        public final float strength;
        /** Куда «смотрит» кость (единичный вектор в пространстве модели) — для физики. */
        public final float dx, dy, dz;
        public final boolean chest;
        ModelPart atlas, skin, armor;

        BoneInfo(String name, String group, String kind, String hideWith, String parent, Catalog.Spring spring, float strength, float[] dir, boolean chest) {
            this.name = name;
            this.group = group;
            this.kind = kind;
            this.hideWith = hideWith;
            this.parent = parent;
            this.spring = spring;
            this.strength = strength;
            this.dx = dir[0];
            this.dy = dir[1];
            this.dz = dir[2];
            this.chest = chest;
        }
    }

    public final CharacterData data;
    /** Кости в порядке «родитель раньше детей». */
    public final List<BoneInfo> bones = new ArrayList<>();
    public final Map<String, BoneInfo> byName = new HashMap<>();
    final ModelPart atlasRoot, skinRoot, armorRoot;
    @Nullable ResourceLocation atlasTex;
    final boolean hasAtlas, hasSkin, hasChest;
    /** Куртка-слой поверх груди (видна, если у игрока включён слой «куртка»). */
    final List<ModelPart> jacketParts = new ArrayList<>();
    /** Передняя сторона второго слоя головы (лицо), когда сам слой спрятан под причёской. */
    @Nullable ModelPart hatFacePart;
    private final List<java.util.Set<String>> used = List.of(new java.util.HashSet<>(), new java.util.HashSet<>(), new java.util.HashSet<>());

    private record Node(String name, String parent, String group, PartPose pose, CubeListBuilder atlas, CubeListBuilder skin, CubeListBuilder armor) {}

    private CharModel(CharacterData d) {
        this.data = d;
        Catalog cat = Catalog.get();
        // ---- раскладка атласа и сами кубы
        NativeImage img = new NativeImage(ATLAS_W, ATLAS_MAX_H, true);
        int[] shelf = {0, 0, 0}; // x, y, высота полки
        int usedH = 0;
        boolean anyAtlas = false, anySkin = false;
        Map<String, Node> nodes = new LinkedHashMap<>();
        Map<String, BoneInfo> pending = new LinkedHashMap<>();
        boolean hair = d.hasKind("hair");
        int[] shells = new int[GROUPS.size()];
        for (int pi = 0; pi < d.parts.size(); pi++) {
            CharacterData.Part part = d.parts.get(pi);
            Catalog.PartDef def = cat.part(part.kind(), part.id());
            if (def == null) continue;
            // головной убор поверх причёски: вся часть чуть больше вокруг центра головы, чтобы не резалась о волосы
            boolean overHair = hair && "clothes".equals(part.kind()) && !Layering.NO_SCALE.contains(part.id());
            for (Catalog.Bone b : def.bones()) {
                if (nodes.containsKey(b.name())) continue;
                String group = GROUPS.contains(b.parent()) ? b.parent() : nodes.containsKey(b.parent()) ? nodes.get(b.parent()).group : null;
                if (group == null) continue;
                boolean scale = overHair && "head".equals(group);
                float[] pivot = scale ? Layering.scalePivot(b.pivot(), GROUPS.contains(b.parent())) : b.pivot();
                CubeListBuilder atlas = CubeListBuilder.create(), skin = CubeListBuilder.create();
                for (Catalog.Cube c0 : b.cubes()) {
                    // кубы-«оболочки» (с раздуванием) разводятся по слоям, чтобы не мерцали друг о друга и о второй слой скина
                    Catalog.Cube c = Layering.cube(c0, scale, shells, GROUPS.indexOf(group));
                    CubeDeformation g = new CubeDeformation(c.grow()[0], c.grow()[1], c.grow()[2]);
                    if (c.skin()) {
                        int[] uv = c.uv() != null ? c.uv() : new int[] {0, 8};
                        skin.texOffs(uv[0], uv[1]).mirror(c.mirror()).addBox(c.from()[0], c.from()[1], c.from()[2], c.size()[0], c.size()[1], c.size()[2], g);
                        anySkin = true;
                        continue;
                    }
                    int w = Math.round(c.size()[0]), h = Math.round(c.size()[1]), dd = Math.round(c.size()[2]);
                    int rw = Math.max(1, 2 * dd + 2 * w), rh = Math.max(1, dd + h);
                    if (rw > ATLAS_W) continue;
                    if (shelf[0] + rw > ATLAS_W) {
                        shelf[0] = 0;
                        shelf[1] += shelf[2];
                        shelf[2] = 0;
                    }
                    if (shelf[1] + rh > ATLAS_MAX_H) continue; // не влезло — этот куб не рисуем
                    int u = shelf[0], v = shelf[1];
                    shelf[0] += rw;
                    shelf[2] = Math.max(shelf[2], rh);
                    usedH = Math.max(usedH, v + rh);
                    paintCube(img, u, v, w, h, dd, c0, part.colors(), def.style());
                    atlas.texOffs(u, v).addBox(c.from()[0], c.from()[1], c.from()[2], c.size()[0], c.size()[1], c.size()[2], g);
                    anyAtlas = true;
                }
                PartPose pose = PartPose.offsetAndRotation(pivot[0], pivot[1], pivot[2], b.rot()[0] * Mth.DEG_TO_RAD,
                        b.rot()[1] * Mth.DEG_TO_RAD, b.rot()[2] * Mth.DEG_TO_RAD);
                nodes.put(b.name(), new Node(b.name(), b.parent(), group, pose, atlas, skin, CubeListBuilder.create()));
                float strength = d.phys * part.phys();
                pending.put(b.name(), new BoneInfo(b.name(), group, part.kind(), def.hideWith(), b.parent(), b.spring(), strength, direction(b), false));
            }
        }
        // ---- грудь (цвет и рисунок — со скина: те же пиксели, что под ней). Форма — Layering.chest (так же в лаунчере).
        boolean chest = d.female && d.chestSize > 0.01F;
        if (chest) {
            for (int side = 0; side < 2; side++) {
                Layering.Chest c = Layering.chest(d, side);
                String name = side == 0 ? "chest_r" : "chest_l";
                int u = side == 0 ? 19 : 23;
                CubeListBuilder sk = CubeListBuilder.create().texOffs(u, 20).addBox(-2F, 0F, c.zc() - 0.5F, 4F, 4F, 1F, new CubeDeformation(c.gx(), c.gy(), c.gz()));
                CubeListBuilder ar = CubeListBuilder.create().texOffs(u, 20).addBox(-2F, 0F, c.zc() - 0.5F, 4F, 4F, 1F,
                        new CubeDeformation(c.gx() + 0.5F, c.gy() + 1.0F, c.gz() + 0.6F));
                PartPose pose = PartPose.offsetAndRotation(c.px(), c.py(), c.pz(), c.rx() * Mth.DEG_TO_RAD, c.ry() * Mth.DEG_TO_RAD, 0F);
                nodes.put(name, new Node(name, "body", "body", pose, CubeListBuilder.create(), sk, ar));
                // куртка (второй слой скина): дочерняя кость, чтобы её можно было спрятать
                CubeListBuilder jk = CubeListBuilder.create().texOffs(u, 36).addBox(-2F, 0F, c.zc() - 0.5F, 4F, 4F, 1F,
                        new CubeDeformation(c.gx() + 0.25F, c.gy() + 0.25F, c.gz() + 0.25F));
                nodes.put(name + "_jacket", new Node(name + "_jacket", name, "body", PartPose.ZERO, CubeListBuilder.create(), jk, CubeListBuilder.create()));
                Catalog.Spring sp = cat.chest;
                pending.put(name, new BoneInfo(name, "body", "chest", "chest", "body", sp, d.chestPhys, new float[] {0F, 0.8F, -0.6F}, true));
            }
            anySkin = true;
        }
        // ---- второй слой головы скина под причёской: «кроме лица» — рисуем только его переднюю сторону (сам слой прячет миксин)
        boolean hatFace = hair && "face".equals(d.hatLayer);
        if (hatFace) {
            CubeListBuilder hf = CubeListBuilder.create().texOffs(32, 0).addBox(-4F, -4F, -4F, 8F, 8F, 8F, java.util.EnumSet.of(net.minecraft.core.Direction.NORTH));
            nodes.put("hat_face", new Node("hat_face", "head", "head", PartPose.offset(0F, -4F, 0F), CubeListBuilder.create(), hf, CubeListBuilder.create()));
            anySkin = true;
        }
        hasAtlas = anyAtlas;
        hasSkin = anySkin;
        hasChest = chest;
        int texH = 16;
        while (texH < usedH) texH *= 2;
        for (Node n : nodes.values()) {
            if (!n.atlas.getCubes().isEmpty()) used.get(0).add(n.group);
            if (!n.skin.getCubes().isEmpty()) used.get(1).add(n.group);
            if (!n.armor.getCubes().isEmpty()) used.get(2).add(n.group);
        }
        // ---- три дерева
        atlasRoot = bake(nodes, 0, ATLAS_W, texH);
        skinRoot = bake(nodes, 1, 64, 64);
        armorRoot = bake(nodes, 2, 64, 32);
        for (BoneInfo bi : pending.values()) {
            bi.atlas = find(atlasRoot, nodes, bi.name);
            bi.skin = find(skinRoot, nodes, bi.name);
            bi.armor = find(armorRoot, nodes, bi.name);
            bones.add(bi);
            byName.put(bi.name, bi);
        }
        if (hatFace) {
            hatFacePart = find(skinRoot, nodes, "hat_face");
            hatFacePart.xScale = hatFacePart.yScale = hatFacePart.zScale = 9F / 8F; // как слой «шапка» (+0.5 пикс.)
        }
        if (chest) {
            jacketParts.add(find(skinRoot, nodes, "chest_r_jacket"));
            jacketParts.add(find(skinRoot, nodes, "chest_l_jacket"));
        }
        if (anyAtlas) {
            NativeImage fin = new NativeImage(ATLAS_W, texH, true);
            fin.copyFrom(img);
            img.close();
            atlasTex = ResourceLocation.fromNamespaceAndPath(SkinKokk.MOD_ID, "character/atlas_" + Integer.toHexString(d.toJson().hashCode()) + "_" + (++counter));
            Minecraft.getInstance().getTextureManager().register(atlasTex, new DynamicTexture(fin));
        } else {
            img.close();
        }
    }

    private static int counter;

    /** Куда смотрит кость: от опорной точки к центру первого куба, с учётом своего поворота. */
    private static float[] direction(Catalog.Bone b) {
        if (b.cubes().isEmpty()) return new float[] {0, 1, 0};
        Catalog.Cube c = b.cubes().get(0);
        float x = c.from()[0] + c.size()[0] / 2, y = c.from()[1] + c.size()[1] / 2, z = c.from()[2] + c.size()[2] / 2;
        // самая длинная ось куба важнее смещения центра
        float sx = c.size()[0], sy = c.size()[1], sz = c.size()[2];
        if (sx >= sy && sx >= sz) x += Math.signum(x) * sx;
        else if (sy >= sz) y += Math.signum(y == 0 ? 1 : y) * sy;
        else z += Math.signum(z == 0 ? 1 : z) * sz;
        org.joml.Vector3f v = new org.joml.Vector3f(x, y, z);
        if (v.lengthSquared() < 1e-6F) v.set(0, 1, 0);
        new org.joml.Quaternionf().rotationZYX(b.rot()[2] * Mth.DEG_TO_RAD, b.rot()[1] * Mth.DEG_TO_RAD, b.rot()[0] * Mth.DEG_TO_RAD).transform(v);
        v.normalize();
        return new float[] {v.x, v.y, v.z};
    }

    private static ModelPart bake(Map<String, Node> nodes, int which, int tw, int th) {
        MeshDefinition mesh = new MeshDefinition();
        PartDefinition root = mesh.getRoot();
        Map<String, PartDefinition> defs = new HashMap<>();
        for (String g : GROUPS) defs.put(g, root.addOrReplaceChild("g_" + g, CubeListBuilder.create(), PartPose.ZERO));
        for (Node n : nodes.values()) {
            PartDefinition parent = defs.get(n.parent);
            if (parent == null) continue;
            CubeListBuilder cubes = which == 0 ? n.atlas : which == 1 ? n.skin : n.armor;
            defs.put(n.name, parent.addOrReplaceChild(n.name, cubes, n.pose));
        }
        return LayerDefinition.create(mesh, tw, th).bakeRoot();
    }

    private static ModelPart find(ModelPart root, Map<String, Node> nodes, String name) {
        List<String> path = new ArrayList<>();
        String cur = name;
        while (cur != null && nodes.containsKey(cur)) {
            path.add(0, cur);
            cur = nodes.get(cur).parent;
        }
        ModelPart p = root.getChild("g_" + (cur == null ? "body" : cur));
        for (String s : path) p = p.getChild(s);
        return p;
    }

    /** Есть ли в этой группе (кость-родитель) кубы для этого дерева: 0 — атлас, 1 — скин, 2 — броня. */
    public boolean uses(int which, String g) {
        return used.get(which).contains(g);
    }

    public ModelPart group(int which, String g) {
        return (which == 0 ? atlasRoot : which == 1 ? skinRoot : armorRoot).getChild("g_" + g);
    }

    // ---- рисование куба в атлас (развёртка как у Minecraft: texOffs u, v; ширина 2d+2w, высота d+h) -------------

    private static void paintCube(NativeImage img, int u, int v, int w, int h, int d, Catalog.Cube c, CharacterData.Colors col, String style) {
        int ox = (int) Math.floor(c.from()[0]) + 64, oy = (int) Math.floor(c.from()[1]) + 64, oz = (int) Math.floor(c.from()[2]) + 64;
        face(img, u + d, v, w, d, CharPaint.FACE_TOP, ox, oz, c, col, style);
        face(img, u + d + w, v, w, d, CharPaint.FACE_BOTTOM, ox, oz, c, col, style);
        face(img, u, v + d, d, h, CharPaint.FACE_RIGHT, oz, oy, c, col, style);
        face(img, u + d, v + d, w, h, CharPaint.FACE_FRONT, ox, oy, c, col, style);
        face(img, u + d + w, v + d, d, h, CharPaint.FACE_LEFT, oz, oy, c, col, style);
        face(img, u + 2 * d + w, v + d, w, h, CharPaint.FACE_BACK, ox, oy, c, col, style);
    }

    private static void face(NativeImage img, int x0, int y0, int fw, int fh, int face, int ox, int oy, Catalog.Cube c, CharacterData.Colors col, String style) {
        for (int y = 0; y < fh; y++) {
            for (int x = 0; x < fw; x++) {
                int ix = x0 + x, iy = y0 + y;
                if (ix < 0 || iy < 0 || ix >= img.getWidth() || iy >= img.getHeight()) continue;
                int rgb = CharPaint.pixel(col, style, c.slot(), c.tip(), face, ox + x, oy + y, x, y, fw, fh);
                // NativeImage хранит ABGR
                img.setPixelRGBA(ix, iy, 0xFF000000 | ((rgb & 0xFF) << 16) | (rgb & 0xFF00) | ((rgb >> 16) & 0xFF));
            }
        }
    }

    // ---- кэш ---------------------------------------------------------------------------------------------------------

    private static final Map<String, CharModel> CACHE = new LinkedHashMap<>(16, 0.75F, true);

    /** Модель для персонажа (по его JSON), из кэша или построенная. */
    public static CharModel of(CharacterData d, String key) {
        CharModel m = CACHE.get(key);
        if (m != null) return m;
        m = new CharModel(d);
        CACHE.put(key, m);
        while (CACHE.size() > 48) {
            var it = CACHE.entrySet().iterator();
            CharModel old = it.next().getValue();
            it.remove();
            old.release();
        }
        return m;
    }

    void release() {
        if (atlasTex != null) Minecraft.getInstance().getTextureManager().release(atlasTex);
        atlasTex = null;
    }

    public static void clearCache() {
        for (CharModel m : CACHE.values()) m.release();
        CACHE.clear();
    }
}
