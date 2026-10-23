package ru.kokk.skinkokk.anim;

import java.util.Map;
import java.util.WeakHashMap;

import net.minecraft.world.entity.Entity;

/**
 * Пружины — наши «веса»: модели Minecraft собраны из кубиков, вершинами их не согнуть, поэтому деталь (грудь, хвост, уши,
 * волосы) либо жёстко идёт за родителем, либо отстаёт и раскачивается пружиной. Та же формула, что springStep() в Студии.
 * Состояние — на сущность и кость; шаг — раз в клиентский тик, между тиками — по partialTick.
 */
public final class Spring {
    private Spring() {}

    /** Ключи параметров (порядок в float[]): упругость, затухание, тяжесть, предел (°), цепь, сила. */
    public static final String[] KEYS = {"stiffness", "damping", "gravity", "limit", "inherit", "strength"};
    public static final float[] DEFAULTS = {0.35f, 0.3f, 0.3f, 35f, 1f, 1f};

    /** Параметры пружины. */
    public record Params(float stiffness, float damping, float gravity, float limit, float inherit, float strength) {
        public static Params of(float stiffness, float damping, float gravity, float limitDeg, float inherit) {
            return new Params(stiffness, damping, gravity, limitDeg, inherit, 1f);
        }

        public static Params defaults() {
            return new Params(DEFAULTS[0], DEFAULTS[1], DEFAULTS[2], DEFAULTS[3], DEFAULTS[4], DEFAULTS[5]);
        }

        /** Поверх своих — значения из анимации (NaN — не трогать). */
        public Params with(float[] o) {
            if (o == null) return this;
            return new Params(pick(o, 0, stiffness), pick(o, 1, damping), pick(o, 2, gravity), pick(o, 3, limit), pick(o, 4, inherit), pick(o, 5, strength));
        }

        private static float pick(float[] o, int i, float d) {
            return i < o.length && !Float.isNaN(o[i]) ? o[i] : d;
        }
    }

    /** Состояние одной кости. */
    public static final class State {
        float x, z, vx, vz, px, pz;

        /** Один тик: drive — толчок по X и Z (рад/тик²) от движения родителя и наклона. */
        public void step(Params p, float driveX, float driveZ) {
            float st = Math.max(0, Math.min(1, p.stiffness()));
            float k = 0.05f + 0.6f * st, d = 0.05f + 0.5f * Math.max(0, Math.min(1, p.damping()));
            float lim = (float) Math.toRadians(Math.max(0, Math.min(180, p.limit())));
            float str = Math.max(0, Math.min(2, p.strength()));
            px = x;
            pz = z;
            float ax = -k * x - d * vx + driveX * (1 - st) * str;
            float az = -k * z - d * vz + driveZ * (1 - st) * str;
            vx += ax;
            vz += az;
            x = Math.max(-lim, Math.min(lim, x + vx));
            z = Math.max(-lim, Math.min(lim, z + vz));
            if (Math.abs(x) >= lim) vx *= -0.3f;
            if (Math.abs(z) >= lim) vz *= -0.3f;
        }

        /** Отклон по X (рад) между тиками. */
        public float x(float partial) {
            return px + (x - px) * partial;
        }

        public float z(float partial) {
            return pz + (z - pz) * partial;
        }
    }

    private static final Map<Entity, Map<String, State>> STATES = new WeakHashMap<>();

    /** Состояние пружины кости этой сущности (создаётся при первом обращении, уходит вместе с сущностью). */
    public static synchronized State state(Entity e, String bone) {
        return STATES.computeIfAbsent(e, k -> new java.util.HashMap<>()).computeIfAbsent(bone, k -> new State());
    }

    /** Толчок от сущности: ускорение (смена скорости) в осях тела и наклон тела — для пружин без своих расчётов. */
    public static float[] drive(Entity e, float gravity) {
        double dx = e.getX() - e.xo, dy = e.getY() - e.yo, dz = e.getZ() - e.zo;
        float yaw = (float) Math.toRadians(e instanceof net.minecraft.world.entity.LivingEntity le ? le.yBodyRot : e.getYRot());
        // в осях тела: вперёд (−Z модели) и вбок
        double fwd = -dx * Math.sin(yaw) + dz * Math.cos(yaw);
        double side = dx * Math.cos(yaw) + dz * Math.sin(yaw);
        return new float[] {(float) (fwd * 0.6 - dy * 0.4 * gravity), (float) (-side * 0.6)};
    }

    /** Анимация меняет пружину кости? Параметры поверх своих (или свои). */
    public static Params forAnim(AnimDef def, String bone, Params own) {
        if (def == null) return own;
        float[] o = def.springs.get(bone);
        return o == null ? own : own.with(o);
    }
}
