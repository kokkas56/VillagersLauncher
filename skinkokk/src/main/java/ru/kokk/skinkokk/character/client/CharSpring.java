package ru.kokk.skinkokk.character.client;

/**
 * Пружина одной кости («веса» из kokk_rig.md §3): отклонение по двум осям (наклон X и «вбок»), шаг раз в тик,
 * между тиками — плавно по partialTick. Та же математика, что у трека анимаций: k = 0.05 + 0.6·жёсткость,
 * d = 0.05 + 0.5·затухание, a = −k·off − d·vel + drive, ограничение ±limit.
 */
public final class CharSpring {
    private CharSpring() {}

    public static final class State {
        float x, s, vx, vs, px, ps;

        public void step(Catalog.Spring p, float driveX, float driveS) {
            px = x;
            ps = s;
            float k = 0.05F + 0.6F * p.stiffness(), d = 0.05F + 0.5F * p.damping();
            vx += -k * x - d * vx + driveX;
            vs += -k * s - d * vs + driveS;
            x += vx;
            s += vs;
            float lim = p.limit();
            if (x > lim) { x = lim; vx = Math.min(0, vx); }
            if (x < -lim) { x = -lim; vx = Math.max(0, vx); }
            if (s > lim) { s = lim; vs = Math.min(0, vs); }
            if (s < -lim) { s = -lim; vs = Math.max(0, vs); }
            if (Float.isNaN(x) || Float.isNaN(s)) reset();
        }

        public void reset() {
            x = s = vx = vs = px = ps = 0;
        }

        /** Отклонение в градусах (наклон). */
        public float x(float pt) {
            return px + (x - px) * pt;
        }

        /** Отклонение в градусах (вбок). */
        public float s(float pt) {
            return ps + (s - ps) * pt;
        }
    }
}
