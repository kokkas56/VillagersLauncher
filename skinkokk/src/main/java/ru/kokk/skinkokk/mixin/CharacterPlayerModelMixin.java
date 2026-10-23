package ru.kokk.skinkokk.mixin;

import net.minecraft.client.model.PlayerModel;
import net.minecraft.world.entity.LivingEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import ru.kokk.skinkokk.character.CharacterData;
import ru.kokk.skinkokk.character.client.CharRender;
import ru.kokk.skinkokk.character.client.Proportions;

/**
 * Персонажи (трек A): телосложение игрока. В конце setupAnim — множители костей и сдвиг плеч, в начале следующего
 * вызова — откат, чтобы ничего не копилось. Хитбокс не меняется.
 */
@Mixin(PlayerModel.class)
public abstract class CharacterPlayerModelMixin {
    @Unique
    private float[] skinkokk$bodyUndo;

    @Inject(method = "setupAnim(Lnet/minecraft/world/entity/LivingEntity;FFFFF)V", at = @At("HEAD"))
    private void skinkokk$bodyHead(LivingEntity entity, float limbSwing, float limbSwingAmount, float ageInTicks, float netHeadYaw, float headPitch,
                                   CallbackInfo ci) {
        if (skinkokk$bodyUndo != null) {
            Proportions.undo((PlayerModel<?>) (Object) this, skinkokk$bodyUndo);
            skinkokk$bodyUndo = null;
        }
    }

    @Inject(method = "setupAnim(Lnet/minecraft/world/entity/LivingEntity;FFFFF)V", at = @At("TAIL"))
    private void skinkokk$bodyTail(LivingEntity entity, float limbSwing, float limbSwingAmount, float ageInTicks, float netHeadYaw, float headPitch,
                                   CallbackInfo ci) {
        try {
            CharacterData d = CharRender.bodyFor(entity);
            if (d != null) skinkokk$bodyUndo = Proportions.apply((PlayerModel<?>) (Object) this, d, null);
            // второй слой головы под причёской (лицо дорисует CharModel, если выбрано «кроме лица»)
            if (CharRender.hideHatLayer(entity)) ((PlayerModel<?>) (Object) this).hat.visible = false;
        } catch (RuntimeException ignored) {
            // настройки ещё не загружены и т. п. — без телосложения
        }
    }
}
