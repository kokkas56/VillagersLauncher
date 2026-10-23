package ru.kokk.skinkokk.anim;

import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.Set;

import org.joml.Quaternionf;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;

import net.minecraft.util.Mth;
import net.minecraft.world.entity.LivingEntity;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.EventPriority;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.client.event.RenderLivingEvent;
import ru.kokk.skinkokk.SkinKokk;

/**
 * «Всё тело» (кость root): сдвиг, поворот вокруг ступней и размер всей модели — через PoseStack вокруг отрисовки
 * существа. Оси — как у модели (пиксели, Y вниз, лицо в −Z), поэтому в мире X и Y меняют знак.
 */
@EventBusSubscriber(modid = SkinKokk.MOD_ID, value = Dist.CLIENT)
public final class AnimRender {
    private AnimRender() {}

    private static final Set<LivingEntity> PUSHED = Collections.newSetFromMap(new IdentityHashMap<>());

    @SubscribeEvent(priority = EventPriority.LOWEST)
    public static void pre(RenderLivingEvent.Pre<?, ?> e) {
        LivingEntity ent = e.getEntity();
        if (!AnimConfig.get(AnimConfig.ROOT_MOVES, true)) return;
        AnimClient.Pose po = AnimClient.pose(ent, e.getPartialTick());
        if (po == null) return;
        float[][] r = po.get("root");
        if (r == null) return;
        float w = po.w;
        PoseStack ps = e.getPoseStack();
        float bodyYaw = Mth.rotLerp(e.getPartialTick(), ent.yBodyRotO, ent.yBodyRot);
        ps.pushPose();
        PUSHED.add(ent);
        ps.mulPose(Axis.YP.rotationDegrees(180f - bodyYaw));
        if (r[1] != null) ps.translate(-r[1][0] * w / 16f, -r[1][1] * w / 16f, r[1][2] * w / 16f);
        if (r[0] != null) {
            float rx = (float) Math.toRadians(r[0][0] * w), ry = (float) Math.toRadians(r[0][1] * w), rz = (float) Math.toRadians(r[0][2] * w);
            ps.mulPose(new Quaternionf().rotationZYX(rz, -ry, -rx)); // ось модели → мир: X и Y с обратным знаком
        }
        if (r[2] != null) ps.scale(1 + (r[2][0] - 1) * w, 1 + (r[2][1] - 1) * w, 1 + (r[2][2] - 1) * w);
        ps.mulPose(Axis.YP.rotationDegrees(-(180f - bodyYaw)));
    }

    @SubscribeEvent(priority = EventPriority.HIGHEST)
    public static void post(RenderLivingEvent.Post<?, ?> e) {
        if (PUSHED.remove(e.getEntity())) e.getPoseStack().popPose();
    }
}
