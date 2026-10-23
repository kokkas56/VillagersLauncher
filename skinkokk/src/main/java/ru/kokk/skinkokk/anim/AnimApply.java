package ru.kokk.skinkokk.anim;

import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.WeakHashMap;

import net.minecraft.client.Minecraft;
import net.minecraft.client.model.HumanoidModel;
import net.minecraft.client.model.VillagerModel;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.model.geom.PartPose;
import net.minecraft.client.model.geom.builders.CubeListBuilder;
import net.minecraft.client.model.geom.builders.LayerDefinition;
import net.minecraft.client.model.geom.builders.MeshDefinition;
import net.minecraft.client.model.geom.builders.PartDefinition;
import net.minecraft.world.entity.Entity;
import ru.kokk.skinkokk.SkinKokk;

/**
 * Поза анимации на модели — как solvePose() в Студии:
 * 1) у каждой кости «добавить» (к обычной позе) или «заменить» с весом; ноги стоят, если lockLegs;
 * 2) наклон и сдвиг туловища — вокруг пояса (0,12,0), он несёт голову, шапку и руки;
 * 3) свои кости-группы — двигают кости тела вокруг своей опоры ({@link #groups}); предметы и кубики рисует {@link AnimBones};
 * 4) всё тело (root) — в {@link AnimRender} через PoseStack.
 * Всё, что поменяли, запоминается и возвращается в начале следующего setupAnim этой модели (миксины).
 */
public final class AnimApply {
    private AnimApply() {}

    /** Рисуется рука от первого лица — не трогать (PlayerRenderer.renderHand). */
    public static boolean firstPerson;
    private static final float WX = 0, WY = 12, WZ = 0;

    private record Saved(ModelPart p, float x, float y, float z, float xr, float yr, float zr, float xs, float ys, float zs, boolean vis) {
        static Saved of(ModelPart p) {
            return new Saved(p, p.x, p.y, p.z, p.xRot, p.yRot, p.zRot, p.xScale, p.yScale, p.zScale, p.visible);
        }

        void restore() {
            p.x = x; p.y = y; p.z = z;
            p.xRot = xr; p.yRot = yr; p.zRot = zr;
            p.xScale = xs; p.yScale = ys; p.zScale = zs;
            p.visible = vis;
        }
    }

    private static final Map<Object, List<Saved>> SAVED = new WeakHashMap<>();

    /** Начало setupAnim: вернуть то, что анимация поменяла в прошлый раз. */
    public static void head(Object model) {
        List<Saved> l = SAVED.remove(model);
        if (l == null) return;
        for (int i = l.size() - 1; i >= 0; i--) l.get(i).restore();
    }

    private static List<Saved> saving(Object model, ModelPart... parts) {
        List<Saved> l = new ArrayList<>(parts.length + 2);
        for (ModelPart p : parts) if (p != null) l.add(Saved.of(p));
        SAVED.put(model, l);
        return l;
    }

    static float partial() {
        try {
            return Minecraft.getInstance().getTimer().getGameTimeDeltaPartialTick(true);
        } catch (RuntimeException e) {
            return 0;
        }
    }

    // ---------- люди (игроки, жители долины, зомби, все HumanoidModel) ----------
    public static void humanoid(HumanoidModel<?> m, Entity e) {
        if (firstPerson && AnimConfig.get(AnimConfig.FIRST_PERSON, true)) return;
        AnimClient.Pose po = AnimClient.pose(e, partial());
        if (po == null) return;
        humanoidPose(m, po);
    }

    /** Поза анимации на модели человека (и для лобби KokkHUD, без существа). Откат — {@link #head(Object)}. */
    public static void humanoidPose(HumanoidModel<?> m, AnimClient.Pose po) {
        saving(m, m.head, m.hat, m.body, m.rightArm, m.leftArm, m.rightLeg, m.leftLeg);
        float[] restBody = {m.body.xRot, m.body.yRot, m.body.zRot};
        float[] posBody = {m.body.x, m.body.y, m.body.z};
        apply(po, "body", m.body);
        apply(po, "head", m.head);
        apply(po, "right_arm", m.rightArm);
        apply(po, "left_arm", m.leftArm);
        legs(po, m.rightLeg, m.leftLeg);
        carry(po, m.body, restBody, posBody, m.head, m.rightArm, m.leftArm);
        if (!po.def.groupOf.isEmpty()) groups(po, parts("body", m.body, "head", m.head, "right_arm", m.rightArm, "left_arm", m.leftArm, "right_leg", m.rightLeg, "left_leg", m.leftLeg));
        m.hat.copyFrom(m.head);
        apply(po, "hat", m.hat);
    }

    // ---------- жители ----------
    private static final Map<VillagerModel<?>, ModelPart[]> FREE = new WeakHashMap<>();
    private static boolean freeBroken;

    public static void villager(VillagerModel<?> m, Entity e) {
        AnimClient.Pose po = AnimClient.pose(e, partial());
        if (po == null) return;
        ModelPart root = m.root();
        ModelPart head = child(root, "head"), body = child(root, "body"), arms = child(root, "arms"), rl = child(root, "right_leg"), ll = child(root, "left_leg");
        if (head == null || body == null) return;
        ModelPart nose = child(head, "nose");
        ModelPart[] free = po.def.freeArms() ? freeArms(m) : null;
        List<Saved> sv = saving(m, head, body, arms, rl, ll, nose);
        if (free != null) for (ModelPart p : free) if (p != null) sv.add(Saved.of(p));
        float[] restBody = {body.xRot, body.yRot, body.zRot};
        float[] posBody = {body.x, body.y, body.z};
        apply(po, "body", body);
        apply(po, "head", head);
        if (nose != null) apply(po, "nose", nose);
        if (arms != null) apply(po, "arms", arms);
        ModelPart fr = null, fl = null;
        if (free != null && free[0] != null && free[1] != null) {
            fr = free[0];
            fl = free[1];
            for (ModelPart p : free) if (p != null) p.visible = false;
            fr.resetPose();
            fl.resetPose();
            fr.yScale = fl.yScale = 1.45f;
            fr.visible = fl.visible = true;
            if (arms != null) arms.visible = false;
            apply(po, "right_arm", fr);
            apply(po, "left_arm", fl);
        }
        legs(po, rl, ll);
        carry(po, body, restBody, posBody, head, arms, fr, fl);
        if (!po.def.groupOf.isEmpty()) groups(po, parts("body", body, "head", head, "arms", arms, "right_arm", fr, "left_arm", fl, "right_leg", rl, "left_leg", ll));
    }

    /** Цепь частей модели до кости (по порядку для translateAndRotate) — куда крепить предмет/кубик; null — такой нет. */
    static ModelPart[] partChain(Object model, String bone, AnimDef d) {
        if (model instanceof HumanoidModel<?> m) {
            ModelPart p = switch (bone) {
                case "head" -> m.head;
                case "hat" -> m.hat;
                case "body" -> m.body;
                case "right_arm" -> m.rightArm;
                case "left_arm" -> m.leftArm;
                case "right_leg" -> m.rightLeg;
                case "left_leg" -> m.leftLeg;
                default -> null;
            };
            return p == null ? null : new ModelPart[] {p};
        }
        if (model instanceof VillagerModel<?> m) {
            ModelPart root = m.root(), head = child(root, "head");
            switch (bone) {
                case "head":
                    return head == null ? null : new ModelPart[] {head};
                case "hat":
                case "nose": {
                    ModelPart c = head == null ? null : child(head, bone);
                    return c == null ? null : new ModelPart[] {head, c};
                }
                case "right_arm":
                case "left_arm": {
                    ModelPart a = null;
                    if (d.freeArms()) {
                        ModelPart vr = child(root, "vk_right_arm"), vl = child(root, "vk_left_arm");
                        ModelPart[] mine = FREE.get(m);
                        ModelPart[] free = vr != null && vl != null ? new ModelPart[] {vr, vl} : mine;
                        if (free != null) a = free[bone.equals("right_arm") ? 0 : 1];
                    }
                    if (a == null || !a.visible) a = child(root, "arms"); // руки скрещены — предмет держат они
                    return a == null ? null : new ModelPart[] {a};
                }
                case "body":
                case "arms":
                case "right_leg":
                case "left_leg": {
                    ModelPart c = child(root, bone);
                    return c == null ? null : new ModelPart[] {c};
                }
                default:
                    return null;
            }
        }
        return null;
    }

    private static Map<String, ModelPart> parts(Object... kv) {
        Map<String, ModelPart> m = new HashMap<>();
        for (int i = 0; i + 1 < kv.length; i += 2) if (kv[i + 1] instanceof ModelPart p) m.put((String) kv[i], p);
        return m;
    }

    /** Местная поза своей кости: {сдвиг+опора (пикс.), поворот (рад), поворот по умолчанию (рад), размер} — с весом и режимом. */
    static float[][] local(AnimClient.Pose po, AnimDef.Bone b) {
        float[][] v = po.get(b.id);
        float w = po.w;
        float[] pos = b.pivot.clone(), sc = {1, 1, 1};
        float[] rest = {(float) Math.toRadians(b.rot[0]), (float) Math.toRadians(b.rot[1]), (float) Math.toRadians(b.rot[2])};
        float[] rot = rest.clone();
        if (v != null) {
            boolean rep = po.def.replaces(b.id);
            for (int c = 0; c < 3; c++) {
                if (v[0] != null) {
                    float k = (float) Math.toRadians(v[0][c]);
                    rot[c] = rep ? rest[c] + (k - rest[c]) * w : rest[c] + k * w;
                }
                if (v[1] != null) pos[c] += v[1][c] * w;
                if (v[2] != null) sc[c] = 1 + (v[2][c] - 1) * w;
            }
        }
        return new float[][] {pos, rot, rest, sc};
    }

    /**
     * Свои кости-группы (цепь групп до «Всего тела»): каждая кость тела из группы поворачивается, сдвигается и
     * растягивается вокруг опоры группы — как туловище несёт голову и руки ({@link #carry}). Тот же расчёт — solvePose() Студии.
     */
    static void groups(AnimClient.Pose po, Map<String, ModelPart> parts) {
        AnimDef d = po.def;
        boolean any = false;
        for (AnimDef.Bone b : d.bones) if (b.kind == AnimDef.Bone.GROUP && po.get(b.id) != null) any = true;
        if (!any) return; // без ключей группы ничего не двигают
        // {P, R, M, S, P0, R0, R·R0ᵀ, M·R0ᵀ} — сейчас и в покое, в пространстве модели
        Map<String, float[][]> gw = new HashMap<>();
        for (AnimDef.Bone b : d.bones) {
            if (b.kind != AnimDef.Bone.GROUP || !b.rootChain) continue;
            float[][] L = local(po, b);
            float[] rl = M3.rot(L[1][0], L[1][1], L[1][2]), r0l = M3.rot(L[2][0], L[2][1], L[2][2]);
            float[] sd = {L[3][0], 0, 0, 0, L[3][1], 0, 0, 0, L[3][2]};
            float[] P, R, M, S, P0, R0;
            if ("root".equals(b.parent)) {
                P = L[0];
                R = rl;
                M = M3.mul(rl, sd);
                S = L[3];
                P0 = b.pivot.clone();
                R0 = r0l;
            } else {
                float[][] g = gw.get(b.parent);
                if (g == null) continue;
                float[] q = M3.app(g[2], L[0][0], L[0][1], L[0][2]), q0 = M3.app(g[5], b.pivot[0], b.pivot[1], b.pivot[2]);
                P = new float[] {g[0][0] + q[0], g[0][1] + q[1], g[0][2] + q[2]};
                R = M3.mul(g[1], rl);
                M = M3.mul(M3.mul(g[2], rl), sd);
                S = new float[] {g[3][0] * L[3][0], g[3][1] * L[3][1], g[3][2] * L[3][2]};
                P0 = new float[] {g[4][0] + q0[0], g[4][1] + q0[1], g[4][2] + q0[2]};
                R0 = M3.mul(g[5], r0l);
            }
            gw.put(b.id, new float[][] {P, R, M, S, P0, R0, M3.mul(R, M3.tr(R0)), M3.mul(M, M3.tr(R0))});
        }
        for (Map.Entry<String, ModelPart> en : parts.entrySet()) {
            String gid = d.groupOf.get(en.getKey());
            ModelPart p = en.getValue();
            float[][] g = gid == null ? null : gw.get(gid);
            if (g == null || p == null) continue;
            float[] q = M3.app(g[7], p.x - g[4][0], p.y - g[4][1], p.z - g[4][2]);
            p.x = g[0][0] + q[0];
            p.y = g[0][1] + q[1];
            p.z = g[0][2] + q[2];
            float[] e = M3.euler(M3.mul(g[6], M3.rot(p.xRot, p.yRot, p.zRot)));
            p.xRot = e[0];
            p.yRot = e[1];
            p.zRot = e[2];
            p.xScale *= g[3][0];
            p.yScale *= g[3][1];
            p.zScale *= g[3][2];
        }
    }

    /** Свободные руки жителя: свои Villagers, Kokk (vk_*), если есть, иначе свои SkinKokk (тот же кусок скина). */
    @SuppressWarnings("unchecked")
    private static ModelPart[] freeArms(VillagerModel<?> m) {
        ModelPart root = m.root();
        ModelPart vr = child(root, "vk_right_arm"), vl = child(root, "vk_left_arm");
        ModelPart[] mine = FREE.get(m);
        if (vr != null && vl != null) return mine == null ? new ModelPart[] {vr, vl} : new ModelPart[] {vr, vl, mine[0], mine[1]};
        if (mine != null) return mine;
        if (freeBroken) return null;
        try {
            MeshDefinition mesh = new MeshDefinition();
            PartDefinition pd = mesh.getRoot();
            pd.addOrReplaceChild("skinkokk_right_arm", CubeListBuilder.create().texOffs(44, 22).addBox(-2.0F, -2.0F, -2.0F, 4.0F, 8.0F, 4.0F), PartPose.offset(-6.0F, 2.0F, 0.0F));
            pd.addOrReplaceChild("skinkokk_left_arm", CubeListBuilder.create().texOffs(44, 22).mirror().addBox(-2.0F, -2.0F, -2.0F, 4.0F, 8.0F, 4.0F), PartPose.offset(6.0F, 2.0F, 0.0F));
            ModelPart baked = LayerDefinition.create(mesh, 64, 64).bakeRoot();
            ModelPart r = baked.getChild("skinkokk_right_arm"), l = baked.getChild("skinkokk_left_arm");
            Field f = ModelPart.class.getDeclaredField("children");
            f.setAccessible(true);
            Map<String, ModelPart> children = (Map<String, ModelPart>) f.get(root);
            children.put("skinkokk_right_arm", r);
            children.put("skinkokk_left_arm", l);
            r.visible = false;
            l.visible = false;
            ModelPart[] arr = {r, l};
            FREE.put(m, arr);
            return arr;
        } catch (Throwable t) {
            freeBroken = true;
            SkinKokk.LOGGER.warn("[SkinKokk] villager free arms not added: {}", t.toString());
            return null;
        }
    }

    private static ModelPart child(ModelPart p, String name) {
        return p.hasChild(name) ? p.getChild(name) : null;
    }

    // ---------- кость ----------
    private static void apply(AnimClient.Pose po, String bone, ModelPart p) {
        float[][] v = po.get(bone);
        if (v == null || p == null) return;
        float w = po.w;
        if (v[0] != null) {
            float x = (float) Math.toRadians(v[0][0]), y = (float) Math.toRadians(v[0][1]), z = (float) Math.toRadians(v[0][2]);
            if (po.def.replaces(bone)) {
                p.xRot += (x - p.xRot) * w;
                p.yRot += (y - p.yRot) * w;
                p.zRot += (z - p.zRot) * w;
            } else {
                p.xRot += x * w;
                p.yRot += y * w;
                p.zRot += z * w;
            }
        }
        if (v[1] != null) {
            p.x += v[1][0] * w;
            p.y += v[1][1] * w;
            p.z += v[1][2] * w;
        }
        if (v[2] != null) {
            p.xScale *= 1 + (v[2][0] - 1) * w;
            p.yScale *= 1 + (v[2][1] - 1) * w;
            p.zScale *= 1 + (v[2][2] - 1) * w;
        }
    }

    private static void legs(AnimClient.Pose po, ModelPart r, ModelPart l) {
        if (po.def.lockLegs) {
            float k = 1 - po.w;
            for (ModelPart p : new ModelPart[] {r, l}) {
                if (p == null) continue;
                p.xRot *= k;
                p.yRot *= k;
                p.zRot *= k;
            }
        }
        apply(po, "right_leg", r);
        apply(po, "left_leg", l);
    }

    /** Туловище наклоняется от пояса и несёт с собой «carried» (голову, руки). */
    private static void carry(AnimClient.Pose po, ModelPart body, float[] restBody, float[] posBody, ModelPart... carried) {
        if (po.get("body") == null) return;
        float[] Rf = M3.rot(body.xRot, body.yRot, body.zRot);
        float[] D = M3.mul(Rf, M3.tr(M3.rot(restBody[0], restBody[1], restBody[2])));
        float dx = body.x - posBody[0], dy = body.y - posBody[1], dz = body.z - posBody[2];
        float[] bp = M3.app(D, posBody[0] - WX, posBody[1] - WY, posBody[2] - WZ);
        body.x = WX + bp[0] + dx;
        body.y = WY + bp[1] + dy;
        body.z = WZ + bp[2] + dz;
        if (M3.identity(D) && dx == 0 && dy == 0 && dz == 0) return;
        for (ModelPart p : carried) {
            if (p == null) continue;
            float[] q = M3.app(D, p.x - WX, p.y - WY, p.z - WZ);
            p.x = WX + q[0] + dx;
            p.y = WY + q[1] + dy;
            p.z = WZ + q[2] + dz;
            float[] e = M3.euler(M3.mul(D, M3.rot(p.xRot, p.yRot, p.zRot)));
            p.xRot = e[0];
            p.yRot = e[1];
            p.zRot = e[2];
        }
    }

    /** Матрицы 3×3 построчно — как в animCore.js. */
    static final class M3 {
        private M3() {}

        static float[] rot(float x, float y, float z) {
            float cx = (float) Math.cos(x), sx = (float) Math.sin(x), cy = (float) Math.cos(y), sy = (float) Math.sin(y), cz = (float) Math.cos(z), sz = (float) Math.sin(z);
            return new float[] {
                cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx,
                sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx,
                -sy, cy * sx, cy * cx};
        }

        static float[] mul(float[] a, float[] b) {
            float[] o = new float[9];
            for (int r = 0; r < 3; r++) for (int c = 0; c < 3; c++) o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
            return o;
        }

        static float[] tr(float[] m) {
            return new float[] {m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]};
        }

        static float[] app(float[] m, float x, float y, float z) {
            return new float[] {m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z};
        }

        static float[] euler(float[] m) {
            float sy = -m[6];
            if (Math.abs(sy) < 0.99999f) return new float[] {(float) Math.atan2(m[7], m[8]), (float) Math.asin(Math.max(-1, Math.min(1, sy))), (float) Math.atan2(m[3], m[0])};
            return new float[] {(float) Math.atan2(-m[5], m[4]), sy > 0 ? (float) (Math.PI / 2) : (float) (-Math.PI / 2), 0};
        }

        static boolean identity(float[] m) {
            return Math.abs(m[0] - 1) < 1e-5 && Math.abs(m[4] - 1) < 1e-5 && Math.abs(m[8] - 1) < 1e-5 && Math.abs(m[1]) < 1e-5 && Math.abs(m[2]) < 1e-5 && Math.abs(m[5]) < 1e-5;
        }
    }
}
