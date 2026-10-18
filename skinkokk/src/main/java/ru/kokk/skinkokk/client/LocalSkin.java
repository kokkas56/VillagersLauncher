package ru.kokk.skinkokk.client;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;
import net.minecraft.client.multiplayer.ClientPacketListener;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.client.event.ClientPlayerNetworkEvent;
import net.neoforged.neoforge.client.event.ClientTickEvent;
import net.neoforged.neoforge.network.PacketDistributor;
import ru.kokk.skinkokk.SkinKokk;
import ru.kokk.skinkokk.config.SkinKokkConfig;
import ru.kokk.skinkokk.network.SkinUploadPayload;

/** Следит за папке skinkokk (туда пишет лаунчер) и отправляет скин на сервер. */
@EventBusSubscriber(modid = SkinKokk.MOD_ID, value = Dist.CLIENT)
public final class LocalSkin {
    private static long lastStamp = -1;
    private static int ticks = 0;
    private static boolean pendingNotify = false;

    private LocalSkin() {}

    public static Path folder() {
        return Minecraft.getInstance().gameDirectory.toPath().resolve(SkinKokkConfig.FOLDER.get());
    }

    private static long stamp() {
        Path dir = folder();
        long s = 0;
        for (String f : new String[] {"skin.json", "skin.png", "cape.png"}) {
            try {
                Path p = dir.resolve(f);
                if (Files.exists(p)) s = s * 31 + Files.getLastModifiedTime(p).toMillis() + Files.size(p);
            } catch (Exception ignored) {
            }
        }
        return s;
    }

    @SubscribeEvent
    public static void onLogin(ClientPlayerNetworkEvent.LoggingIn event) {
        lastStamp = -1;
        ticks = 0;
    }

    @SubscribeEvent
    public static void onLogout(ClientPlayerNetworkEvent.LoggingOut event) {
        ClientSkins.clearAll();
        lastStamp = -1;
    }

    @SubscribeEvent
    public static void onTick(ClientTickEvent.Post event) {
        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null || mc.getConnection() == null) return;
        if (++ticks < SkinKokkConfig.POLL_TICKS.get() && lastStamp != -1) return;
        ticks = 0;
        long s = stamp();
        if (s == lastStamp) return;
        boolean first = lastStamp == -1;
        lastStamp = s;
        pendingNotify = !first;
        push();
    }

    /** Читает файлы скина и применяет: локально сразу, на сервер — если там есть мод. */
    public static void push() {
        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) return;
        Path dir = folder();
        boolean slim = false;
        boolean cleared = false;
        try {
            Path meta = dir.resolve("skin.json");
            if (Files.exists(meta)) {
                JsonObject o = JsonParser.parseString(Files.readString(meta, StandardCharsets.UTF_8)).getAsJsonObject();
                slim = o.has("model") && "slim".equals(o.get("model").getAsString());
                cleared = o.has("cleared") && o.get("cleared").getAsBoolean();
            }
            Path skinFile = dir.resolve("skin.png");
            if (cleared || !Files.exists(skinFile) || !SkinKokkConfig.ENABLED.get()) {
                ClientSkins.remove(mc.player.getUUID());
                send(new SkinUploadPayload(false, new byte[0], new byte[0], true));
                return;
            }
            byte[] skin = Files.readAllBytes(skinFile);
            Path capeFile = dir.resolve("cape.png");
            byte[] cape = Files.exists(capeFile) ? Files.readAllBytes(capeFile) : new byte[0];
            if (skin.length + cape.length > SkinKokk.MAX_UPLOAD_BYTES) {
                cape = new byte[0];
                if (skin.length > SkinKokk.MAX_UPLOAD_BYTES) {
                    mc.player.displayClientMessage(Component.translatable("skinkokk.msg.too_big"), false);
                    return;
                }
            }
            ClientSkins.set(mc.player.getUUID(), skin, cape, slim);
            send(new SkinUploadPayload(slim, skin, cape, false));
            if (pendingNotify && SkinKokkConfig.NOTIFY.get()) {
                mc.player.displayClientMessage(Component.translatable("skinkokk.msg.changed"), true);
            }
        } catch (Exception e) {
            SkinKokk.LOGGER.warn("Can't read local skin: {}", e.toString());
        }
    }

    private static void send(SkinUploadPayload payload) {
        ClientPacketListener conn = Minecraft.getInstance().getConnection();
        if (conn == null) return;
        try {
            if (conn.hasChannel(SkinUploadPayload.TYPE)) PacketDistributor.sendToServer(payload);
        } catch (Exception e) {
            SkinKokk.LOGGER.debug("Server without SkinKokk: {}", e.toString());
        }
    }
}
