package ru.kokk.skinkokk.server;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import net.minecraft.network.chat.Component;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.level.storage.LevelResource;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.event.entity.player.PlayerEvent;
import net.neoforged.neoforge.event.server.ServerStartedEvent;
import net.neoforged.neoforge.event.server.ServerStoppedEvent;
import net.neoforged.neoforge.network.PacketDistributor;
import ru.kokk.skinkokk.SkinKokk;
import ru.kokk.skinkokk.config.SkinKokkConfig;
import ru.kokk.skinkokk.network.SkinSyncPayload;
import ru.kokk.skinkokk.network.SkinUploadPayload;

/** Хранит скины игроков на сервере и раздаёт их всем. */
@EventBusSubscriber(modid = SkinKokk.MOD_ID)
public final class SkinStore {
    private record Entry(boolean slim, byte[] skin, byte[] cape) {}

    private static final Map<UUID, Entry> SKINS = new ConcurrentHashMap<>();
    private static final Map<UUID, Long> LAST_CHANGE = new ConcurrentHashMap<>();
    private static Path dir;

    private SkinStore() {}

    /** Ширина и высота PNG из заголовка IHDR, без распаковки. */
    static int[] pngSize(byte[] b) {
        if (b == null || b.length < 24) return null;
        if ((b[0] & 0xff) != 0x89 || b[1] != 'P' || b[2] != 'N' || b[3] != 'G') return null;
        int w = ((b[16] & 0xff) << 24) | ((b[17] & 0xff) << 16) | ((b[18] & 0xff) << 8) | (b[19] & 0xff);
        int h = ((b[20] & 0xff) << 24) | ((b[21] & 0xff) << 16) | ((b[22] & 0xff) << 8) | (b[23] & 0xff);
        return new int[] {w, h};
    }

    static boolean validSkin(byte[] b) {
        int[] s = pngSize(b);
        return s != null && s[0] == s[1] && (s[0] == 64 || s[0] == 128);
    }

    static boolean validCape(byte[] b) {
        int[] s = pngSize(b);
        return s != null && s[0] == s[1] * 2 && s[0] >= 64 && s[0] <= 512;
    }

    public static void upload(ServerPlayer player, SkinUploadPayload p) {
        UUID id = player.getUUID();
        long now = System.currentTimeMillis();
        long last = LAST_CHANGE.getOrDefault(id, 0L);
        if (now - last < SkinKokkConfig.COOLDOWN_SECONDS.get() * 1000L && !p.clear()) {
            return;
        }
        LAST_CHANGE.put(id, now);
        if (p.clear() || !SkinKokkConfig.ALLOW_SKINS.get()) {
            if (SKINS.remove(id) != null) {
                delete(id);
                broadcast(player.server, new SkinSyncPayload(id, false, new byte[0], new byte[0], true));
            }
            return;
        }
        if (p.skin().length + p.cape().length > SkinKokk.MAX_UPLOAD_BYTES || !validSkin(p.skin())) {
            player.sendSystemMessage(Component.translatable("skinkokk.msg.rejected"));
            return;
        }
        byte[] cape = SkinKokkConfig.ALLOW_CAPES.get() && p.cape().length > 0 && validCape(p.cape()) ? p.cape() : new byte[0];
        Entry e = new Entry(p.slim(), p.skin(), cape);
        SKINS.put(id, e);
        save(id, e);
        broadcast(player.server, new SkinSyncPayload(id, e.slim(), e.skin(), e.cape(), false));
    }

    @SubscribeEvent
    public static void onLogin(PlayerEvent.PlayerLoggedInEvent event) {
        if (!(event.getEntity() instanceof ServerPlayer player)) return;
        for (Map.Entry<UUID, Entry> en : SKINS.entrySet()) {
            Entry e = en.getValue();
            send(player, new SkinSyncPayload(en.getKey(), e.slim(), e.skin(), e.cape(), false));
        }
    }

    @SubscribeEvent
    public static void onStarted(ServerStartedEvent event) {
        SKINS.clear();
        LAST_CHANGE.clear();
        MinecraftServer server = event.getServer();
        dir = server.getWorldPath(LevelResource.ROOT).resolve("skinkokk");
        if (!SkinKokkConfig.PERSIST.get() || !Files.isDirectory(dir)) return;
        try (var stream = Files.list(dir)) {
            stream.filter(f -> f.getFileName().toString().endsWith(".json")).forEach(f -> {
                try {
                    String name = f.getFileName().toString();
                    UUID id = UUID.fromString(name.substring(0, name.length() - 5));
                    JsonObject meta = JsonParser.parseString(Files.readString(f, StandardCharsets.UTF_8)).getAsJsonObject();
                    Path skin = dir.resolve(id + ".png");
                    Path cape = dir.resolve(id + ".cape.png");
                    if (!Files.exists(skin)) return;
                    SKINS.put(id, new Entry(meta.has("slim") && meta.get("slim").getAsBoolean(), Files.readAllBytes(skin),
                            Files.exists(cape) ? Files.readAllBytes(cape) : new byte[0]));
                } catch (Exception ex) {
                    SkinKokk.LOGGER.warn("Bad stored skin {}: {}", f, ex.toString());
                }
            });
        } catch (IOException ex) {
            SkinKokk.LOGGER.warn("Can't read skins: {}", ex.toString());
        }
    }

    @SubscribeEvent
    public static void onStopped(ServerStoppedEvent event) {
        SKINS.clear();
        LAST_CHANGE.clear();
        dir = null;
    }

    private static void broadcast(MinecraftServer server, SkinSyncPayload payload) {
        for (ServerPlayer sp : server.getPlayerList().getPlayers()) send(sp, payload);
    }

    private static void send(ServerPlayer sp, SkinSyncPayload payload) {
        try {
            if (sp.connection != null && sp.connection.hasChannel(SkinSyncPayload.TYPE)) PacketDistributor.sendToPlayer(sp, payload);
        } catch (Exception ex) {
            SkinKokk.LOGGER.debug("Can't send skin to {}: {}", sp.getGameProfile().getName(), ex.toString());
        }
    }

    private static void save(UUID id, Entry e) {
        if (dir == null || !SkinKokkConfig.PERSIST.get()) return;
        try {
            Files.createDirectories(dir);
            Files.write(dir.resolve(id + ".png"), e.skin());
            Path cape = dir.resolve(id + ".cape.png");
            if (e.cape().length > 0) Files.write(cape, e.cape()); else Files.deleteIfExists(cape);
            Files.writeString(dir.resolve(id + ".json"), "{\"slim\":" + e.slim() + "}", StandardCharsets.UTF_8);
        } catch (IOException ex) {
            SkinKokk.LOGGER.warn("Can't save skin: {}", ex.toString());
        }
    }

    private static void delete(UUID id) {
        if (dir == null) return;
        try {
            Files.deleteIfExists(dir.resolve(id + ".png"));
            Files.deleteIfExists(dir.resolve(id + ".cape.png"));
            Files.deleteIfExists(dir.resolve(id + ".json"));
        } catch (IOException ignored) {
        }
    }
}
