package ru.kokk.skinkokk.character.client;

import com.mojang.blaze3d.vertex.PoseStack;
import java.lang.invoke.MethodHandle;
import java.lang.invoke.MethodHandles;
import java.lang.invoke.MethodType;
import java.util.HashSet;
import java.util.Set;
import javax.annotation.Nullable;
import net.minecraft.client.Minecraft;
import net.minecraft.client.model.PlayerModel;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.entity.LivingEntityRenderer;
import net.minecraft.client.renderer.entity.player.PlayerRenderer;
import net.minecraft.client.renderer.entity.RenderLayerParent;
import net.minecraft.client.renderer.entity.layers.RenderLayer;
import net.minecraft.client.resources.PlayerSkin;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.entity.player.PlayerModelPart;
import net.minecraft.world.item.ArmorItem;
import net.minecraft.world.item.ArmorMaterial;
import net.minecraft.world.item.ElytraItem;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.component.DyedItemColor;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.EventPriority;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.client.event.EntityRenderersEvent;
import net.neoforged.neoforge.client.event.RenderPlayerEvent;
import ru.kokk.skinkokk.SkinKokk;
import ru.kokk.skinkokk.character.CharacterConfig;

/**
 * Рисует части персонажа поверх модели игрока: уши/волосы — от головы, хвост/одежда/грудь — от тела и т. д. Каждая
 * часть берёт позу своей «ванильной» кости (так её несут и анимации), добавляет пружину и, если играет анимация,
 * её ключи для своей кости ({@code AnimClient.extra}, по рефлексии — трек «Анимации» не обязателен).
 */
public final class CharRender {
    private CharRender() {}

    /** Что показывать на этот раз. */
    public record Opts(boolean parts, boolean chest, boolean jacket, boolean hideHead, boolean elytra, boolean chestplate, ItemStack chestArmor) {}

    public static ModelPart vanilla(PlayerModel<?> m, String g) {
        return switch (g) {
            case "head" -> m.head;
            case "right_arm" -> m.rightArm;
            case "left_arm" -> m.leftArm;
            case "right_leg" -> m.rightLeg;
            case "left_leg" -> m.leftLeg;
            default -> m.body;
        };
    }

    public static void render(PlayerModel<?> m, PoseStack ps, MultiBufferSource buf, CharModel cm, ResourceLocation skin, int light, int overlay, int color,
                              @Nullable CharPhysics.Body phys, float pt, Opts o, @Nullable LivingEntity animEntity) {
        // ---- поза костей
        for (CharModel.BoneInfo bi : cm.bones) {
            ModelPart a = bi.atlas;
            a.resetPose();
            if (phys != null) {
                CharSpring.State st = phys.get(bi.name);
                if (st != null) {
                    float x = st.x(pt), s = st.s(pt);
                    a.xRot += x * Mth.DEG_TO_RAD;
                    if (Math.abs(bi.dy) >= Math.abs(bi.dz)) a.zRot += s * Mth.DEG_TO_RAD;
                    else a.yRot += s * Mth.DEG_TO_RAD;
                    if (bi.chest) a.y += Math.abs(x) * 0.02F;
                }
            }
            if (animEntity != null) {
                float[] e = animExtra(animEntity, bi.name, pt);
                if (e != null && e.length >= 9) {
                    a.xRot += e[0];
                    a.yRot += e[1];
                    a.zRot += e[2];
                    a.x += e[3];
                    a.y += e[4];
                    a.z += e[5];
                    a.xScale *= e[6];
                    a.yScale *= e[7];
                    a.zScale *= e[8];
                }
            }
            boolean vis;
            if (bi.chest) vis = o.chest;
            else {
                vis = o.parts;
                if ("head".equals(bi.hideWith) && o.hideHead) vis = false;
                if ("elytra".equals(bi.hideWith) && o.elytra) vis = false;
                if ("chest".equals(bi.hideWith) && o.chestplate) vis = false;
            }
            a.visible = vis;
            bi.skin.copyFrom(a);
            bi.skin.visible = vis;
            bi.armor.copyFrom(a);
            bi.armor.visible = vis;
        }
        for (ModelPart j : cm.jacketParts) j.visible = o.jacket;
        boolean translucent = (color >>> 24) < 250;
        // ---- атлас (уши, хвост, волосы, одежда)
        if (cm.hasAtlas && cm.atlasTex != null && o.parts) {
            RenderType rt = translucent ? RenderType.entityTranslucent(cm.atlasTex) : RenderType.entityCutoutNoCull(cm.atlasTex);
            groups(m, ps, cm, 0, buf.getBuffer(rt), light, overlay, color);
        }
        // ---- по текстуре скина (грудь, эльфийские уши)
        if (cm.hasSkin && skin != null) {
            RenderType rt = translucent ? RenderType.entityTranslucent(skin) : RenderType.entityCutoutNoCull(skin);
            groups(m, ps, cm, 1, buf.getBuffer(rt), light, overlay, color);
        }
        // ---- грудь под нагрудником: повторяет броню
        if (cm.hasChest && o.chest && o.chestplate && o.chestArmor.getItem() instanceof ArmorItem ai) {
            try {
                ArmorMaterial mat = ai.getMaterial().value();
                for (ArmorMaterial.Layer layer : mat.layers()) {
                    int c = layer.dyeable() ? DyedItemColor.getOrDefault(o.chestArmor, -6265536) | 0xFF000000 : -1;
                    groupOne(m, ps, cm, 2, "body", buf.getBuffer(RenderType.armorCutoutNoCull(layer.texture(false))), light, overlay, mul(c, color));
                }
                if (o.chestArmor.hasFoil()) groupOne(m, ps, cm, 2, "body", buf.getBuffer(RenderType.armorEntityGlint()), light, overlay, color);
            } catch (RuntimeException e) {
                warnOnce("armour chest", e);
            }
        }
    }

    private static void groups(PlayerModel<?> m, PoseStack ps, CharModel cm, int which, com.mojang.blaze3d.vertex.VertexConsumer vc, int light, int overlay,
                               int color) {
        for (String g : CharModel.GROUPS) groupOne(m, ps, cm, which, g, vc, light, overlay, color);
    }

    private static void groupOne(PlayerModel<?> m, PoseStack ps, CharModel cm, int which, String g, com.mojang.blaze3d.vertex.VertexConsumer vc, int light,
                                 int overlay, int color) {
        if (!cm.uses(which, g)) return;
        ModelPart grp = cm.group(which, g);
        ps.pushPose();
        try {
            vanilla(m, g).translateAndRotate(ps);
            grp.render(ps, vc, light, overlay, color);
        } finally {
            ps.popPose();
        }
    }

    static int mul(int a, int b) {
        int al = (a >>> 24) * (b >>> 24) / 255, r = (a >> 16 & 255) * (b >> 16 & 255) / 255, g = (a >> 8 & 255) * (b >> 8 & 255) / 255,
                bl = (a & 255) * (b & 255) / 255;
        return al << 24 | r << 16 | g << 8 | bl;
    }

    private static final Set<String> WARNED = new HashSet<>();

    static void warnOnce(String what, Throwable e) {
        if (WARNED.add(what + e.getClass().getName())) SkinKokk.LOGGER.warn("SkinKokk: could not draw {}: {}", what, e.toString());
    }

    // ---- анимации трека «Анимации» (если есть) ------------------------------------------------------------------------

    private static MethodHandle extra;
    private static boolean looked;

    @Nullable
    static float[] animExtra(LivingEntity e, String bone, float pt) {
        if (!looked) {
            looked = true;
            try {
                Class<?> c = Class.forName("ru.kokk.skinkokk.anim.AnimClient");
                extra = MethodHandles.publicLookup().findStatic(c, "extra", MethodType.methodType(float[].class, LivingEntity.class, String.class, float.class));
            } catch (Throwable t) {
                extra = null;
            }
        }
        if (extra == null) return null;
        try {
            return (float[]) extra.invokeExact(e, bone, pt);
        } catch (Throwable t) {
            return null;
        }
    }

    // ---- в мире -------------------------------------------------------------------------------------------------------

    static Opts optsFor(AbstractClientPlayer p, CharModel cm, boolean self) {
        ItemStack chest = p.getItemBySlot(EquipmentSlot.CHEST);
        boolean plate = chest.getItem() instanceof ArmorItem ai && ai.getType() == ArmorItem.Type.CHESTPLATE;
        boolean elytra = chest.getItem() instanceof ElytraItem;
        boolean parts = self || CharacterConfig.SHOW_OTHERS.get();
        boolean showChest = cm.hasChest && (self || CharacterConfig.SHOW_OTHERS_CHEST.get());
        if (plate && CharacterConfig.CHEST_ARMOR.get() == CharacterConfig.ChestArmor.HIDE) showChest = false;
        boolean armourChest = plate && CharacterConfig.CHEST_ARMOR.get() == CharacterConfig.ChestArmor.ARMOR;
        boolean hideHead = CharacterConfig.HIDE_UNDER_HELMET.get() && !p.getItemBySlot(EquipmentSlot.HEAD).isEmpty();
        return new Opts(parts, showChest, p.isModelPartShown(PlayerModelPart.JACKET), hideHead, elytra, plate,
                armourChest ? chest : ItemStack.EMPTY);
    }

    /** Слой рендера игрока. */
    public static final class Layer extends RenderLayer<AbstractClientPlayer, PlayerModel<AbstractClientPlayer>> {
        public Layer(RenderLayerParent<AbstractClientPlayer, PlayerModel<AbstractClientPlayer>> parent) {
            super(parent);
        }

        @Override
        public void render(PoseStack ps, MultiBufferSource buf, int light, AbstractClientPlayer p, float limbSwing, float limbSwingAmount, float partialTick,
                           float ageInTicks, float netHeadYaw, float headPitch) {
            if (p.isInvisible() || p.isSpectator()) return;
            CharacterClient.Entry e = CharacterClient.forRender(p);
            if (e == null) return;
            try {
                if (!CharPhysics.near(p, CharacterConfig.RENDER_DISTANCE.get())) return;
                boolean self = CharacterClient.isSelf(p.getUUID());
                CharModel cm = CharModel.of(e.data(), e.json());
                Opts o = optsFor(p, cm, self);
                boolean physOn = self ? CharacterConfig.OWN_PHYSICS.get() : CharacterConfig.OTHERS_PHYSICS.get();
                PlayerSkin sk = p.getSkin();
                CharRender.render(getParentModel(), ps, buf, cm, sk.texture(), light, LivingEntityRenderer.getOverlayCoords(p, 0F), -1,
                        physOn ? CharPhysics.of(p.getUUID()) : null, partialTick, o, p);
            } catch (RuntimeException ex) {
                warnOnce("a character", ex);
            }
        }
    }

    @EventBusSubscriber(modid = SkinKokk.MOD_ID, value = Dist.CLIENT, bus = EventBusSubscriber.Bus.MOD)
    public static final class ModEvents {
        @SubscribeEvent
        public static void addLayers(EntityRenderersEvent.AddLayers event) {
            for (PlayerSkin.Model model : event.getSkins()) {
                if (event.getSkin(model) instanceof PlayerRenderer pr) pr.addLayer(new Layer(pr));
            }
        }
    }

    // ---- общий рост: масштаб всей модели от ступней -------------------------------------------------------------------

    private static final Set<Integer> PUSHED = new HashSet<>();

    @EventBusSubscriber(modid = SkinKokk.MOD_ID, value = Dist.CLIENT)
    public static final class GameEvents {
        @SubscribeEvent(priority = EventPriority.LOWEST)
        public static void pre(RenderPlayerEvent.Pre event) {
            Player pl = event.getEntity();
            if (!(pl instanceof AbstractClientPlayer p)) return;
            CharacterClient.Entry e = CharacterClient.forRender(p);
            if (e == null) return;
            boolean self = CharacterClient.isSelf(p.getUUID());
            if (!self && !CharacterConfig.SHOW_OTHERS_BODY.get()) return;
            float r = Proportions.root(e.data());
            if (Math.abs(r - 1F) < 0.001F || !PUSHED.add(p.getId())) return;
            event.getPoseStack().pushPose();
            event.getPoseStack().scale(r, r, r);
        }

        @SubscribeEvent(priority = EventPriority.HIGHEST)
        public static void post(RenderPlayerEvent.Post event) {
            if (PUSHED.remove(event.getEntity().getId())) event.getPoseStack().popPose();
        }
    }

    // ---- физика: раз в тик для всех рядом -----------------------------------------------------------------------------

    static void tickPhysics(Minecraft mc) {
        if (mc.level == null) return;
        float viewer = CharacterConfig.PHYSICS_STRENGTH.get().floatValue();
        int dist = CharacterConfig.PHYSICS_DISTANCE.get();
        for (Player pl : mc.level.players()) {
            if (!(pl instanceof AbstractClientPlayer p)) continue;
            CharacterClient.Entry e = CharacterClient.forRender(p);
            if (e == null) continue;
            boolean self = CharacterClient.isSelf(p.getUUID());
            if (!(self ? CharacterConfig.OWN_PHYSICS.get() : CharacterConfig.OTHERS_PHYSICS.get())) continue;
            if (!CharPhysics.near(p, dist)) continue;
            CharPhysics.tick(p, CharModel.of(e.data(), e.json()), viewer);
        }
    }

    /** Для миксина PlayerModel: телосложение этой сущности (null — не менять). */
    @Nullable
    public static ru.kokk.skinkokk.character.CharacterData bodyFor(LivingEntity entity) {
        if (!(entity instanceof AbstractClientPlayer p)) return null;
        CharacterClient.Entry e = CharacterClient.forRender(p);
        if (e == null) return null;
        if (!CharacterClient.isSelf(p.getUUID()) && !CharacterConfig.SHOW_OTHERS_BODY.get()) return null;
        return e.data();
    }
}
