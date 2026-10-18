package ru.kokk.netkokk;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.multiplayer.JoinMultiplayerScreen;
import net.minecraft.client.server.IntegratedServer;
import net.minecraft.client.server.LanServerPinger;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.client.event.ClientTickEvent;
import ru.kokk.netkokk.mixin.JoinMultiplayerScreenAccessor;

@EventBusSubscriber(modid = NetKokk.MOD_ID, value = Dist.CLIENT)
public final class ClientEvents {
    private static int ticks;

    private ClientEvents() {}

    @SubscribeEvent
    public static void onTick(ClientTickEvent.Post event) {
        Minecraft mc = Minecraft.getInstance();
        if (++ticks % 20 == 0) {
            IntegratedServer server = mc.getSingleplayerServer();
            if (server != null && server.isPublished() && server.getPort() > 0) {
                LanAnnouncer.set(LanServerPinger.createPingString(server.getMotd(), Integer.toString(server.getPort())));
            } else {
                LanAnnouncer.set(null);
            }
        }
        if (mc.screen instanceof JoinMultiplayerScreen screen) {
            LanListener.ensureStarted();
            var list = ((JoinMultiplayerScreenAccessor) screen).netkokk$getLanServerList();
            LanListener.Found f;
            while ((f = LanListener.QUEUE.poll()) != null) {
                if (list != null) list.addServer(f.text(), f.from());
            }
        } else if (ticks % 200 == 0) {
            LanListener.QUEUE.clear();
        }
    }
}
