package ru.kokk.skinkokk.client;

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

public final class ClientKeys {
    public static final KeyMapping WARDROBE = new KeyMapping("key.skinkokk.wardrobe", InputConstants.Type.KEYSYM, GLFW.GLFW_KEY_K, "key.categories.skinkokk");

    private ClientKeys() {}

    @EventBusSubscriber(modid = SkinKokk.MOD_ID, value = Dist.CLIENT, bus = EventBusSubscriber.Bus.MOD)
    public static final class ModEvents {
        @SubscribeEvent
        public static void register(RegisterKeyMappingsEvent event) {
            event.register(WARDROBE);
        }
    }

    @EventBusSubscriber(modid = SkinKokk.MOD_ID, value = Dist.CLIENT)
    public static final class GameEvents {
        @SubscribeEvent
        public static void onTick(ClientTickEvent.Post event) {
            Minecraft mc = Minecraft.getInstance();
            while (WARDROBE.consumeClick()) {
                if (mc.screen == null && mc.player != null) mc.setScreen(new WardrobeScreen());
            }
        }
    }
}
