package ru.kokk.skinkokk.mixin.anim;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

import net.minecraft.client.model.VillagerModel;
import net.minecraft.world.entity.Entity;
import ru.kokk.skinkokk.anim.AnimApply;

/** Анимации SkinKokk на жителях (и горожанах Villagers, Kokk): руки раскрещиваются, если анимация двигает руки. */
@Mixin(VillagerModel.class)
public abstract class AnimVillagerModelMixin {
    @Inject(method = "setupAnim(Lnet/minecraft/world/entity/Entity;FFFFF)V", at = @At("HEAD"))
    private void skinkokk$animHead(Entity entity, float limbSwing, float limbSwingAmount, float ageInTicks, float netHeadYaw, float headPitch, CallbackInfo ci) {
        AnimApply.head(this);
    }

    @Inject(method = "setupAnim(Lnet/minecraft/world/entity/Entity;FFFFF)V", at = @At("TAIL"))
    private void skinkokk$animTail(Entity entity, float limbSwing, float limbSwingAmount, float ageInTicks, float netHeadYaw, float headPitch, CallbackInfo ci) {
        AnimApply.villager((VillagerModel<?>) (Object) this, entity);
    }
}
