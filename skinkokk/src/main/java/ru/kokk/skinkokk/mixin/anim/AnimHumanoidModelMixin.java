package ru.kokk.skinkokk.mixin.anim;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

import net.minecraft.client.model.HumanoidModel;
import net.minecraft.world.entity.LivingEntity;
import ru.kokk.skinkokk.anim.AnimApply;

/** Анимации SkinKokk на людях: в начале setupAnim — вернуть прошлое, в конце — поза анимации поверх ванильной. */
@Mixin(HumanoidModel.class)
public abstract class AnimHumanoidModelMixin {
    @Inject(method = "setupAnim(Lnet/minecraft/world/entity/LivingEntity;FFFFF)V", at = @At("HEAD"))
    private void skinkokk$animHead(LivingEntity entity, float limbSwing, float limbSwingAmount, float ageInTicks, float netHeadYaw, float headPitch, CallbackInfo ci) {
        AnimApply.head(this);
    }

    @Inject(method = "setupAnim(Lnet/minecraft/world/entity/LivingEntity;FFFFF)V", at = @At("TAIL"))
    private void skinkokk$animTail(LivingEntity entity, float limbSwing, float limbSwingAmount, float ageInTicks, float netHeadYaw, float headPitch, CallbackInfo ci) {
        AnimApply.humanoid((HumanoidModel<?>) (Object) this, entity);
    }
}
