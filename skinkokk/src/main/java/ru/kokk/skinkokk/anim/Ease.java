package ru.kokk.skinkokk.anim;

/** Плавность ключей — как ease() в animCore.js Студии. */
public final class Ease {
    private Ease() {}

    public static final byte SMOOTH = 0, LINEAR = 1, STEP = 2, IN = 3, OUT = 4, BACK = 5, BOUNCE = 6, BEZIER = 7;

    public static byte code(String s) {
        return switch (s == null ? "" : s) {
            case "linear" -> LINEAR;
            case "step" -> STEP;
            case "in" -> IN;
            case "out" -> OUT;
            case "back" -> BACK;
            case "bounce" -> BOUNCE;
            case "bezier" -> BEZIER;
            default -> SMOOTH;
        };
    }

    public static float apply(byte code, float u, float[] bz) {
        u = Math.max(0, Math.min(1, u));
        switch (code) {
            case LINEAR:
                return u;
            case STEP:
                return u >= 1 ? 1 : 0;
            case IN:
                return u * u * u;
            case OUT: {
                float v = 1 - u;
                return 1 - v * v * v;
            }
            case BACK: {
                float c1 = 1.70158f, c3 = c1 + 1, v = u - 1;
                return 1 + c3 * v * v * v + c1 * v * v;
            }
            case BOUNCE: {
                float n1 = 7.5625f, d1 = 2.75f, x = u;
                if (x < 1 / d1) return n1 * x * x;
                if (x < 2 / d1) { x -= 1.5f / d1; return n1 * x * x + 0.75f; }
                if (x < 2.5f / d1) { x -= 2.25f / d1; return n1 * x * x + 0.9375f; }
                x -= 2.625f / d1;
                return n1 * x * x + 0.984375f;
            }
            case BEZIER: {
                float[] b = bz != null && bz.length == 4 ? bz : new float[] {0.42f, 0, 0.58f, 1};
                return bezier(Math.max(0, Math.min(1, b[0])), b[1], Math.max(0, Math.min(1, b[2])), b[3], u);
            }
            default:
                return u * u * (3 - 2 * u);
        }
    }

    static float bezier(float x1, float y1, float x2, float y2, float x) {
        float cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
        float cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
        float t = x;
        for (int i = 0; i < 8; i++) {
            float e = ((ax * t + bx) * t + cx) * t - x;
            if (Math.abs(e) < 1e-5f) break;
            float d = (3 * ax * t + 2 * bx) * t + cx;
            if (Math.abs(d) < 1e-6f) break;
            t -= e / d;
        }
        if (t < 0 || t > 1) {
            float lo = 0, hi = 1;
            t = x;
            for (int i = 0; i < 30; i++) {
                float v = ((ax * t + bx) * t + cx) * t;
                if (Math.abs(v - x) < 1e-5f) break;
                if (v < x) lo = t; else hi = t;
                t = (lo + hi) / 2;
            }
        }
        return ((ay * t + by) * t + cy) * t;
    }

    /** Вес «входа/выхода» (плавно 0→1). */
    public static float blend(float u) {
        u = Math.max(0, Math.min(1, u));
        return u * u * (3 - 2 * u);
    }
}
