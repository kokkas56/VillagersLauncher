package ru.kokk.skinkokk.character.client;

import java.util.Set;
import ru.kokk.skinkokk.character.CharacterData;

/**
 * Чтобы части персонажа не «мерцали лесенкой» друг о друга (z-fighting): кубы-оболочки (с раздуванием) одной кости
 * получают каждый свою толщину слоя, головной убор поверх причёски чуть увеличивается вокруг центра головы, а
 * раздувание не попадает на слои ванили (куртка 0.25, «шапка» 0.5, поножи 0.5). Та же математика — в лаунчере
 * (src/lib/characterRig.js: layerCube, scalePivot, chestShape), чтобы превью совпадало с игрой.
 */
public final class Layering {
    private Layering() {}

    /** Шаг между соседними оболочками одной группы (голова, тело, руки, ноги), пикс. */
    public static final float STEP = 0.035F;
    /** Во сколько раз увеличить головной убор, когда есть причёска. */
    public static final float OVER_HAIR = 1.08F;
    /** Центр головы (пространство головы: шея — 0, макушка — −8). */
    public static final float[] HEAD_C = {0F, -4F, 0F};
    /** Что не увеличивать поверх причёски (сидит на лице, а не на волосах). */
    public static final Set<String> NO_SCALE = Set.of("glasses");
    /** Слои ванили, на которые нельзя попадать раздуванием: [от, до] — сдвигается к «до». */
    private static final float[][] AVOID = {{0.2F, 0.3F}, {0.42F, 0.57F}, {0.94F, 1.06F}};

    /** Опорная точка кости при увеличении: у корневых (от головы) — вокруг центра головы, у дочерних — просто × масштаб. */
    public static float[] scalePivot(float[] p, boolean rootBone) {
        float f = OVER_HAIR;
        if (!rootBone) return new float[] {p[0] * f, p[1] * f, p[2] * f};
        return new float[] {HEAD_C[0] + (p[0] - HEAD_C[0]) * f, HEAD_C[1] + (p[1] - HEAD_C[1]) * f, HEAD_C[2] + (p[2] - HEAD_C[2]) * f};
    }

    /**
     * Куб с поправками: при scale — центр × масштаб, полуразмер × масштаб (через раздувание, размер и развёртка не меняются);
     * у оболочек (раздувание > 0) — своя толщина слоя в группе.
     */
    public static Catalog.Cube cube(Catalog.Cube c, boolean scale, int[] shells, int group) {
        float[] from = c.from().clone(), size = c.size(), grow = c.grow().clone();
        boolean shell = Math.max(grow[0], Math.max(grow[1], grow[2])) > 0.001F;
        if (scale) {
            float f = OVER_HAIR;
            for (int i = 0; i < 3; i++) {
                float half = size[i] / 2F, center = from[i] + half;
                from[i] = center * f - half;
                grow[i] = (half + grow[i]) * f - half;
            }
        }
        if (shell && group >= 0) {
            float add = STEP * shells[group]++;
            float m = Math.max(grow[0], Math.max(grow[1], grow[2])) + add;
            for (float[] av : AVOID) if (m > av[0] && m < av[1]) add += av[1] - m;
            for (int i = 0; i < 3; i++) grow[i] += add;
        }
        if (!scale && !shell) return c;
        return new Catalog.Cube(from, size, c.slot(), c.tip(), grow, c.skin(), c.uv(), c.mirror());
    }

    /** Форма одной груди: опорная точка, поворот (°) и куб 4×4×1 с раздуванием (gx, gy, gz) и центром по глубине zc. */
    public record Chest(float px, float py, float pz, float rx, float ry, float zc, float gx, float gy, float gz) {}

    /** side 0 — правая (−X), 1 — левая. Наклон «+» опускает перед (верх идёт от ключиц вниз, низ прижат к телу). */
    public static Chest chest(CharacterData d, int side) {
        float s = d.chestSize;
        float w = 3F + s;                       // ширина 3…4 пикс.
        float dep = 0.8F + 2.6F * s;            // насколько выступает вперёд
        float gap = d.chestGap;                 // зазор между внутренними краями
        float px = Math.min(w / 2F + gap / 2F, 4.3F - w / 2F);
        px = Math.max(px, w / 2F - 1F);
        float tilt = -5F + 45F * d.chestTilt;   // градусы вниз
        float cleave = 20F * d.chestCleave;     // градусы в стороны
        float zc = (-dep + 0.5F) / 2F;          // спереди −dep, сзади +0.5 (чуть в теле)
        float gz = (dep + 0.5F - 1F) / 2F;
        float gx = (w - 4F) / 2F;
        float gy = 0.1F * s;
        return new Chest(side == 0 ? -px : px, d.chestHeight, -2F, tilt, side == 0 ? cleave : -cleave, zc, gx, gy, gz);
    }
}
