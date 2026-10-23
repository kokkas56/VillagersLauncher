package ru.kokk.skinkokk.mixin.anim;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

import com.mojang.blaze3d.vertex.PoseStack;

import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.entity.player.PlayerRenderer;
import ru.kokk.skinkokk.anim.AnimApply;

/** Рука от первого лица рисуется без анимаций (иначе машущая рука «уехала» бы с экрана). */
@Mixin(PlayerRenderer.class)
public abstract class AnimPlayerHandMixin {
    @Inject(method = "renderHand", at = @At("HEAD"), require = 0)
    private void skinkokk$handStart(PoseStack ps, MultiBufferSource buf, int light, AbstractClientPlayer player, ModelPart arm, ModelPart sleeve, CallbackInfo ci) {
        AnimApply.firstPerson = true;
    }

    @Inject(method = "renderHand", at = @At("RETURN"), require = 0)
    private void skinkokk$handEnd(PoseStack ps, MultiBufferSource buf, int light, AbstractClientPlayer player, ModelPart arm, ModelPart sleeve, CallbackInfo ci) {
        AnimApply.firstPerson = false;
    }
}
