package ru.kokk.skinkokk.anim;

import com.mojang.blaze3d.vertex.PoseStack;
import net.minecraft.client.model.HumanoidModel;
import org.joml.Quaternionf;

/**
 * Анимации на фигурах без существа — лобби KokkHUD (по reflection, только статические методы). Анимация берётся как
 * в игре: присланные сервером → вне мира свои файлы (config/skinkokk/anims, у автора — проект Студии, правки сразу) →
 * встроенные. Время — в тиках с начала позы; вес входа/выхода — из самой анимации, fade — ещё и от лобби.
 */
public final class LobbyAnims {
    private LobbyAnims() {}

    public static int version() {
        return 1;
    }

    public static boolean has(String id) {
        return AnimLibrary.client(id) != null;
    }

    /** Длина в тиках с учётом скорости; 0 — нет такой. */
    public static int length(String id) {
        AnimDef d = AnimLibrary.client(id);
        return d == null ? 0 : Math.max(1, Math.round(d.length / Math.max(0.05F, d.speed)));
    }

    public static boolean loops(String id) {
        AnimDef d = AnimLibrary.client(id);
        return d != null && (d.loop || d.stay);
    }

    private static float weight(AnimDef d, float el, float fade) {
        float w = d.blendIn > 0 && el < d.blendIn ? Ease.blend(el / d.blendIn) : 1;
        if (!d.loop && !d.stay && d.blendOut > 0) w = Math.min(w, Ease.blend((d.length - el) / d.blendOut));
        return Math.max(0, Math.min(1, w * fade));
    }

    /** Поставить позу на модель (после обычной позы). ticks — сколько прошло с начала. false — нет анимации. */
    public static boolean apply(HumanoidModel<?> m, String id, float ticks, float fade) {
        AnimDef d = AnimLibrary.client(id);
        if (d == null || !AnimConfig.get(AnimConfig.ENABLED, true)) return false;
        float el = ticks * d.speed;
        AnimClient.Pose po = AnimClient.poseAt(id, el, weight(d, el, fade));
        if (po == null) return false;
        AnimApply.humanoidPose(m, po);
        return true;
    }

    /** Вернуть модель как была до {@link #apply}. */
    public static void undo(HumanoidModel<?> m) {
        AnimApply.head(m);
    }

    /**
     * «Всё тело» (root): ps — в пространстве модели (блоки, Y вниз, ступни на y = 1.5). Двигает, поворачивает вокруг
     * ступней и масштабирует. Вызывать между pushPose/popPose.
     */
    public static void root(PoseStack ps, String id, float ticks, float fade) {
        AnimDef d = AnimLibrary.client(id);
        if (d == null || !AnimConfig.get(AnimConfig.ROOT_MOVES, true)) return;
        float el = ticks * d.speed;
        AnimClient.Pose po = AnimClient.poseAt(id, el, weight(d, el, fade));
        float[][] r = po == null ? null : po.get("root");
        if (r == null) return;
        float w = po.w;
        if (r[1] != null) ps.translate(r[1][0] * w / 16F, r[1][1] * w / 16F, r[1][2] * w / 16F);
        ps.translate(0F, 1.5F, 0F);
        if (r[0] != null) ps.mulPose(new Quaternionf().rotationZYX((float) Math.toRadians(r[0][2] * w), (float) Math.toRadians(r[0][1] * w), (float) Math.toRadians(r[0][0] * w)));
        if (r[2] != null) ps.scale(1 + (r[2][0] - 1) * w, 1 + (r[2][1] - 1) * w, 1 + (r[2][2] - 1) * w);
        ps.translate(0F, -1.5F, 0F);
    }
}
