package ru.kokk.skinkokk.anim;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

import org.joml.Quaternionf;

import com.mojang.blaze3d.platform.NativeImage;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.math.Axis;

import net.minecraft.client.Minecraft;
import net.minecraft.client.model.EntityModel;
import net.minecraft.client.model.HumanoidModel;
import net.minecraft.client.model.VillagerModel;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.model.geom.PartPose;
import net.minecraft.client.model.geom.builders.CubeListBuilder;
import net.minecraft.client.model.geom.builders.LayerDefinition;
import net.minecraft.client.model.geom.builders.MeshDefinition;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.LivingEntityRenderer;
import net.minecraft.client.renderer.entity.RenderLayerParent;
import net.minecraft.client.renderer.entity.layers.RenderLayer;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.client.resources.PlayerSkin;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.item.ItemDisplayContext;
import net.minecraft.world.item.ItemStack;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.client.event.EntityRenderersEvent;
import ru.kokk.skinkokk.SkinKokk;

/**
 * Свои кости анимаций, которые видно: предметы (меч, факел, цветок…) и цветные кубики. Слой рендера у всех существ с
 * моделью человека или жителя: кость крепится к своей части модели (translateAndRotate), дальше — цепь своих костей
 * (опора, поворот, ключи, размер) и вес анимации (появляется и исчезает со входом/выходом). Только клиент.
 */
@EventBusSubscriber(modid = SkinKokk.MOD_ID, value = Dist.CLIENT, bus = EventBusSubscriber.Bus.MOD)
public final class AnimBones {
    private AnimBones() {}

    // ---------- слой у всех людей и жителей ----------
    @SubscribeEvent
    @SuppressWarnings({"unchecked", "rawtypes"})
    public static void addLayers(EntityRenderersEvent.AddLayers e) {
        int n = 0;
        for (EntityType<?> t : e.getEntityTypes()) {
            try {
                if (add(e.getRenderer((EntityType) t))) n++;
            } catch (RuntimeException ex) {
                // чужой рендер — пропустить
            }
        }
        for (PlayerSkin.Model s : e.getSkins()) {
            try {
                if (add(e.getSkin(s))) n++;
            } catch (RuntimeException ex) {
                // пропустить
            }
        }
        SkinKokk.LOGGER.debug("[SkinKokk] animation item layer added to {} renderers", n);
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    private static boolean add(EntityRenderer<?> r) {
        if (!(r instanceof LivingEntityRenderer lr)) return false;
        EntityModel<?> m = lr.getModel();
        if (!(m instanceof HumanoidModel<?>) && !(m instanceof VillagerModel<?>)) return false;
        lr.addLayer(new Layer(lr));
        return true;
    }

    @SuppressWarnings({"rawtypes", "unchecked"})
    static final class Layer extends RenderLayer<LivingEntity, EntityModel<LivingEntity>> {
        Layer(RenderLayerParent parent) {
            super(parent);
        }

        @Override
        public void render(PoseStack ps, MultiBufferSource buf, int light, LivingEntity ent, float limbSwing, float limbSwingAmount, float partialTick,
                           float ageInTicks, float netHeadYaw, float headPitch) {
            if (!AnimConfig.get(AnimConfig.BONES_SHOW, true) || ent.isInvisible()) return;
            AnimClient.Pose po = AnimClient.pose(ent, partialTick);
            if (po == null || !po.def.drawBones || po.w < 0.02f) return;
            Minecraft mc = Minecraft.getInstance();
            Entity cam = mc.getCameraEntity();
            double dist = AnimConfig.get(AnimConfig.BONES_DISTANCE, 48);
            if (cam != null && cam != ent && cam.distanceToSqr(ent) > dist * dist) return;
            int overlay = LivingEntityRenderer.getOverlayCoords(ent, 0);
            Object model = getParentModel();
            for (AnimDef.Bone b : po.def.bones) {
                if (b.kind == AnimDef.Bone.GROUP) continue;
                try {
                    draw(mc, po, b, model, ps, buf, light, overlay, ent);
                } catch (RuntimeException ex) {
                    warnOnce(b.id, ex);
                }
            }
        }
    }

    static void draw(Minecraft mc, AnimClient.Pose po, AnimDef.Bone b, Object model, PoseStack ps, MultiBufferSource buf, int light, int overlay,
                     LivingEntity ent) {
        ItemStack stack = b.kind == AnimDef.Bone.ITEM ? stack(b.item) : ItemStack.EMPTY;
        if (b.kind == AnimDef.Bone.ITEM && stack.isEmpty()) return;
        ps.pushPose();
        try {
            if (!"root".equals(b.anchor)) {
                ModelPart[] ch = AnimApply.partChain(model, b.anchor, po.def);
                if (ch == null) return;
                for (ModelPart p : ch) p.translateAndRotate(ps);
            }
            // своя цепь: как ModelPart.translateAndRotate — опора, поворот Rz·Ry·Rx, размер
            for (AnimDef.Bone c : b.chain) {
                float[][] l = AnimApply.local(po, c);
                ps.translate(l[0][0] / 16f, l[0][1] / 16f, l[0][2] / 16f);
                ps.mulPose(new Quaternionf().rotationZYX(l[1][2], l[1][1], l[1][0]));
                ps.scale(l[3][0], l[3][1], l[3][2]);
            }
            float w = po.w; // вход/выход анимации — предмет вырастает и тает
            ps.scale(w, w, w);
            if (b.kind == AnimDef.Bone.ITEM) {
                boolean left = "left_arm".equals(b.anchor);
                ItemDisplayContext ctx;
                if ("fixed".equals(b.display)) {
                    ps.mulPose(Axis.ZP.rotationDegrees(180f)); // модель — Y вниз: картинка предмета встаёт как надо
                    ctx = ItemDisplayContext.FIXED;
                    left = false;
                } else {
                    ps.mulPose(Axis.XP.rotationDegrees(-90f)); // как ItemInHandLayer: рукоять у опоры, предмет вперёд
                    ps.mulPose(Axis.YP.rotationDegrees(180f));
                    ctx = left ? ItemDisplayContext.THIRD_PERSON_LEFT_HAND : ItemDisplayContext.THIRD_PERSON_RIGHT_HAND;
                }
                mc.getItemRenderer().renderStatic(ent, stack, ctx, left, ps, buf, ent.level(), light, OverlayTexture.NO_OVERLAY, ent.getId() + b.id.hashCode());
            } else {
                cube(b).render(ps, buf.getBuffer(RenderType.entityCutoutNoCull(white())), light, overlay, 0xFF000000 | b.color);
            }
        } finally {
            ps.popPose();
        }
    }

    // ---------- предметы, кубики, белая текстура ----------
    private static final Map<String, ItemStack> STACKS = new HashMap<>();

    static ItemStack stack(String id) {
        ItemStack s = STACKS.get(id);
        if (s == null) {
            ResourceLocation rl = ResourceLocation.tryParse(id);
            s = rl == null ? ItemStack.EMPTY : new ItemStack(BuiltInRegistries.ITEM.get(rl));
            if (STACKS.size() > 256) STACKS.clear();
            STACKS.put(id, s);
        }
        return s;
    }

    private static final Map<String, ModelPart> CUBES = new HashMap<>();

    static ModelPart cube(AnimDef.Bone b) {
        String key = b.from[0] + "," + b.from[1] + "," + b.from[2] + "/" + b.size[0] + "," + b.size[1] + "," + b.size[2];
        ModelPart p = CUBES.get(key);
        if (p == null) {
            MeshDefinition mesh = new MeshDefinition();
            mesh.getRoot().addOrReplaceChild("c", CubeListBuilder.create().texOffs(0, 0).addBox(b.from[0], b.from[1], b.from[2], b.size[0], b.size[1], b.size[2]),
                    PartPose.ZERO);
            p = LayerDefinition.create(mesh, 16, 16).bakeRoot().getChild("c");
            if (CUBES.size() > 256) CUBES.clear();
            CUBES.put(key, p);
        }
        return p;
    }

    private static ResourceLocation white;

    /** Белая текстура 16×16 (своя, в памяти) — кубик красится цветом вершин, свет и тень как у модели. */
    static ResourceLocation white() {
        if (white == null) {
            NativeImage img = new NativeImage(16, 16, false);
            img.fillRect(0, 0, 16, 16, 0xFFFFFFFF);
            ResourceLocation rl = ResourceLocation.fromNamespaceAndPath(SkinKokk.MOD_ID, "anim_white");
            Minecraft.getInstance().getTextureManager().register(rl, new DynamicTexture(img));
            white = rl;
        }
        return white;
    }

    private static final Set<String> WARNED = new HashSet<>();

    private static void warnOnce(String what, Throwable e) {
        if (WARNED.add(what + e.getClass().getName())) SkinKokk.LOGGER.warn("[SkinKokk] animation bone {} not drawn: {}", what, e.toString());
    }
}
