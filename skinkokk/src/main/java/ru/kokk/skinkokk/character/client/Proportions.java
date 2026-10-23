package ru.kokk.skinkokk.character.client;

import javax.annotation.Nullable;
import net.minecraft.client.model.PlayerModel;
import net.minecraft.client.model.geom.ModelPart;
import ru.kokk.skinkokk.character.CharacterData;

/**
 * Телосложение персонажа (крепкий, стройный, низкий, высокий, женская фигура): множители масштаба костей модели игрока
 * и сдвиг плеч, чтобы руки прилегали к более широкому/узкому телу. Только вид — хитбокс не меняется.
 *
 * <p>Применяется в конце {@code PlayerModel.setupAnim} (миксин), а в начале следующего вызова откатывается — так
 * изменения не копятся, а позы анимаций (трек «Анимации») остаются как есть.
 */
public final class Proportions {
    private Proportions() {}

    private static final int N = 6, STRIDE = 6, ARMS = N * STRIDE;

    private static ModelPart[] parts(PlayerModel<?> m) {
        return new ModelPart[] {m.head, m.body, m.rightArm, m.leftArm, m.rightLeg, m.leftLeg};
    }

    /** Общий рост (масштаб всей модели от ступней). */
    public static float root(CharacterData d) {
        Catalog.Body b = Catalog.get().body(d.body);
        return Math.max(0.85F, Math.min(1.12F, b.root() * d.height));
    }

    /** Множители [голова, тело, руки, ноги]; null — без изменений. */
    private static float[][] mults(CharacterData d) {
        Catalog cat = Catalog.get();
        Catalog.Body b = cat.body(d.body);
        Catalog.Body f = d.female ? cat.female : null;
        float[] head = mul(b.head(), null);
        float[] body = mul(b.body(), f == null ? null : f.body());
        float[] arms = mul(b.arms(), f == null ? null : f.arms());
        float[] legs = mul(b.legs(), f == null ? null : f.legs());
        if (head == null && body == null && arms == null && legs == null) return null;
        return new float[][] {head, body, arms, arms, legs, legs};
    }

    @Nullable
    private static float[] mul(@Nullable float[] a, @Nullable float[] b) {
        if (a == null && b == null) return null;
        float[] r = {1, 1, 1};
        for (int i = 0; i < 3; i++) r[i] = clamp((a == null ? 1 : a[i]) * (b == null ? 1 : b[i]));
        return r;
    }

    private static float clamp(float v) {
        return Math.max(0.8F, Math.min(1.25F, v));
    }

    /** Применить; возвращает запись для отката (или null, если менять нечего). */
    @Nullable
    public static float[] apply(PlayerModel<?> m, CharacterData d, @Nullable float[] reuse) {
        float[][] k = mults(d);
        if (k == null) return null;
        float[] u = reuse != null && reuse.length == ARMS + 3 ? reuse : new float[ARMS + 3];
        ModelPart[] ps = parts(m);
        for (int i = 0; i < N; i++) {
            int o = i * STRIDE;
            float[] v = k[i];
            if (v == null) {
                u[o] = 0;
                continue;
            }
            ModelPart p = ps[i];
            p.xScale *= v[0];
            p.yScale *= v[1];
            p.zScale *= v[2];
            u[o] = v[0];
            u[o + 1] = v[1];
            u[o + 2] = v[2];
            u[o + 3] = p.xScale;
            u[o + 4] = p.yScale;
            u[o + 5] = p.zScale;
        }
        float bx = k[1] == null ? 1 : k[1][0], ax = k[2] == null ? 1 : k[2][0];
        float dx = 4F * bx + ax - 5F;
        m.rightArm.x -= dx;
        m.leftArm.x += dx;
        u[ARMS] = dx;
        u[ARMS + 1] = m.rightArm.x;
        u[ARMS + 2] = m.leftArm.x;
        m.hat.copyFrom(m.head);
        m.jacket.copyFrom(m.body);
        m.rightSleeve.copyFrom(m.rightArm);
        m.leftSleeve.copyFrom(m.leftArm);
        m.rightPants.copyFrom(m.rightLeg);
        m.leftPants.copyFrom(m.leftLeg);
        return u;
    }

    /** Откатить то, что сделал {@link #apply} (только если с тех пор никто не менял эти значения). */
    public static void undo(PlayerModel<?> m, @Nullable float[] u) {
        if (u == null || u.length != ARMS + 3) return;
        ModelPart[] ps = parts(m);
        for (int i = 0; i < N; i++) {
            int o = i * STRIDE;
            if (u[o] == 0) continue;
            ModelPart p = ps[i];
            if (p.xScale == u[o + 3]) p.xScale /= u[o];
            if (p.yScale == u[o + 4]) p.yScale /= u[o + 1];
            if (p.zScale == u[o + 5]) p.zScale /= u[o + 2];
        }
        if (m.rightArm.x == u[ARMS + 1]) m.rightArm.x += u[ARMS];
        if (m.leftArm.x == u[ARMS + 2]) m.leftArm.x -= u[ARMS];
        m.hat.copyFrom(m.head);
        m.jacket.copyFrom(m.body);
        m.rightSleeve.copyFrom(m.rightArm);
        m.leftSleeve.copyFrom(m.leftArm);
        m.rightPants.copyFrom(m.rightLeg);
        m.leftPants.copyFrom(m.leftLeg);
    }
}
