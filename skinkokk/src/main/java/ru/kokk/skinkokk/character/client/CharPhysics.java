package ru.kokk.skinkokk.character.client;

import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.LivingEntity;

/**
 * Физика частей персонажа: на каждого игрока (или фигуру в лобби) — пружины его костей. Раз в тик из движения
 * (ускорение вперёд/вбок/вверх в осях тела, поворот, наклон головы, шаг) получается «толчок» для каждой кости:
 * хвост и плащ отстают при разгоне, волосы висят вниз при наклоне головы, грудь подпрыгивает при шаге и прыжке.
 */
public final class CharPhysics {
    private CharPhysics() {}

    /** Движение за тик (оси тела: вперёд, влево, вверх; блоки/тик). */
    public record Motion(float af, float al, float ay, float forward, float yawRate, float headYawRate, float headPitch, float bodyTilt, float walkPos,
                         float walkSpeed) {}

    public static final class Body {
        final Map<String, CharSpring.State> states = new HashMap<>();
        float pf, pl, pvy;
        boolean first = true;
        long used = System.currentTimeMillis();
        int lastAge = Integer.MIN_VALUE;
        CharModel model;

        public CharSpring.State get(String bone) {
            return states.get(bone);
        }

        void step(CharModel m, Motion mo, float viewer) {
            if (m != model) {
                model = m;
                states.clear();
            }
            for (CharModel.BoneInfo bi : m.bones) {
                Catalog.Spring sp = bi.spring;
                if (sp == null) continue;
                CharSpring.State st = states.computeIfAbsent(bi.name, k -> new CharSpring.State());
                float strength = bi.strength * viewer;
                if (strength <= 0.001F) {
                    st.step(sp, 0, 0);
                    continue;
                }
                float k = 0.05F + 0.6F * sp.stiffness();
                float big = (1F - sp.stiffness()) * 120F * strength;
                boolean head = "head".equals(bi.group);
                // смещение кончика от инерции (в осях модели: x — влево, y — вниз, z — назад)
                float yr = head ? mo.headYawRate() : mo.yawRate();
                float dx = -mo.al() + yr * 0.004F;
                float dy = mo.ay();
                float dz = mo.af();
                if (mo.walkSpeed() > 0.01F) dy += Mth.sin(mo.walkPos() * 0.6662F * 2F) * mo.walkSpeed() * (bi.chest ? 0.06F : 0.025F);
                float tx = dy * -bi.dz + dz * bi.dy;
                boolean hang = Math.abs(bi.dy) >= Math.abs(bi.dz);
                float ts = hang ? dx * -bi.dy + dy * bi.dx : dx * bi.dz - dz * bi.dx;
                float driveX = tx * big, driveS = ts * big;
                // наклон родителя: висящее продолжает висеть
                float tilt = head ? mo.headPitch() : mo.bodyTilt();
                float g = Math.min(1F, strength);
                driveX += k * (-sp.gravity() * tilt * Math.abs(bi.dy)) * g;
                // «ветер»: на бегу плащ и концы шарфа поднимаются назад
                if (sp.wind() > 0) driveX += k * sp.wind() * Math.min(70F, Math.max(0F, mo.forward() * 150F)) * Math.signum(bi.dy) * g;
                CharSpring.State ps = states.get(bi.parent);
                if (ps != null) {
                    driveX += sp.inherit() * ps.x * k * 0.5F;
                    driveS += sp.inherit() * ps.s * k * 0.5F;
                }
                st.step(sp, Mth.clamp(driveX, -20F, 20F), Mth.clamp(driveS, -20F, 20F));
            }
        }
    }

    private static final Map<Object, Body> BODIES = new HashMap<>();

    public static Body of(Object key) {
        Body b = BODIES.computeIfAbsent(key, k -> new Body());
        b.used = System.currentTimeMillis();
        return b;
    }

    /** Один тик для игрока в мире. */
    public static void tick(AbstractClientPlayer p, CharModel m, float viewer) {
        Body b = of(p.getUUID());
        double vx = p.getX() - p.xo, vy = p.getY() - p.yo, vz = p.getZ() - p.zo;
        float yaw = p.yBodyRot * Mth.DEG_TO_RAD;
        float f = (float) (-vx * Mth.sin(yaw) + vz * Mth.cos(yaw));
        float l = (float) (vx * Mth.cos(yaw) + vz * Mth.sin(yaw));
        if (b.first || Math.abs(f) > 2 || Math.abs(l) > 2 || Math.abs(vy) > 2) { // первый тик или телепорт
            b.first = false;
            b.pf = f;
            b.pl = l;
            b.pvy = (float) vy;
        }
        float af = Mth.clamp(f - b.pf, -0.5F, 0.5F), al = Mth.clamp(l - b.pl, -0.5F, 0.5F), ay = Mth.clamp((float) vy - b.pvy, -0.5F, 0.5F);
        b.pf = f;
        b.pl = l;
        b.pvy = (float) vy;
        Motion mo = new Motion(af, al, ay, f, Mth.wrapDegrees(p.yBodyRot - p.yBodyRotO), Mth.wrapDegrees(p.yHeadRot - p.yHeadRotO), p.getXRot(),
                p.isCrouching() ? 28.6F : 0F, p.walkAnimation.position(), p.walkAnimation.speed());
        b.step(m, mo, viewer);
    }

    /** Фигура без сущности (лобби KokkHUD): шаги по её возрасту, лёгкое покачивание и шаг при ходьбе. */
    public static Body lobby(String key, CharModel m, float ageTicks, boolean walking, float viewer) {
        Body b = of("lobby:" + key);
        int age = Mth.floor(ageTicks);
        if (b.lastAge == Integer.MIN_VALUE || age < b.lastAge) b.lastAge = age - 1;
        int steps = Math.min(5, age - b.lastAge);
        for (int i = 0; i < steps; i++) {
            int a = b.lastAge + 1 + i;
            // лёгкое покачивание на месте: как будто фигура переминается
            float sway = Mth.cos(a * 0.07F) * 0.012F, bob = Mth.sin(a * 0.11F) * 0.006F;
            Motion mo = new Motion(sway * 0.5F, sway, bob, walking ? 0.13F : 0F, Mth.sin(a * 0.031F) * 0.6F, Mth.sin(a * 0.043F) * 0.8F, 0F, 0F,
                    a * 0.55F, walking ? 0.9F : 0.12F);
            b.step(m, mo, viewer);
        }
        b.lastAge = age;
        return b;
    }

    public static void cleanup() {
        long now = System.currentTimeMillis();
        for (Iterator<Body> it = BODIES.values().iterator(); it.hasNext(); ) if (now - it.next().used > 15000) it.remove();
    }

    public static void clear() {
        BODIES.clear();
    }

    static boolean near(LivingEntity e, int dist) {
        Minecraft mc = Minecraft.getInstance();
        return mc.gameRenderer.getMainCamera().getPosition().distanceToSqr(e.position()) <= (double) dist * dist;
    }
}
