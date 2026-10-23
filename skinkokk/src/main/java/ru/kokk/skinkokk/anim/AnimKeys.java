package ru.kokk.skinkokk.anim;

import com.mojang.blaze3d.platform.InputConstants;

import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.client.event.ClientTickEvent;
import net.neoforged.neoforge.client.event.RegisterKeyMappingsEvent;
import org.lwjgl.glfw.GLFW;
import ru.kokk.skinkokk.SkinKokk;

/** Клавиша колеса эмоций (по умолчанию B, меняется в «Управлении» → SkinKokk). */
public final class AnimKeys {
    private AnimKeys() {}

    public static final KeyMapping EMOTE = new KeyMapping("key.skinkokk.emote", InputConstants.Type.KEYSYM, GLFW.GLFW_KEY_G, "key.categories.skinkokk");

    @EventBusSubscriber(modid = SkinKokk.MOD_ID, value = Dist.CLIENT, bus = EventBusSubscriber.Bus.MOD)
    public static final class ModEvents {
        @SubscribeEvent
        public static void register(RegisterKeyMappingsEvent event) {
            event.register(EMOTE);
        }
    }

    @EventBusSubscriber(modid = SkinKokk.MOD_ID, value = Dist.CLIENT)
    public static final class GameEvents {
        @SubscribeEvent
        public static void onTick(ClientTickEvent.Post event) {
            Minecraft mc = Minecraft.getInstance();
            while (EMOTE.consumeClick()) {
                if (mc.screen == null && mc.player != null) mc.setScreen(new EmoteWheelScreen(true));
            }
        }
    }
}
