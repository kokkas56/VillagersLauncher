package ru.kokk.skinkokk.character;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Iterator;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.level.storage.LevelResource;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.event.entity.player.PlayerEvent;
import net.neoforged.neoforge.event.server.ServerStartedEvent;
import net.neoforged.neoforge.event.server.ServerStoppedEvent;
import net.neoforged.neoforge.event.tick.ServerTickEvent;
import net.neoforged.neoforge.network.PacketDistributor;
import ru.kokk.skinkokk.SkinKokk;

/**
 * Сервер: хранит персонажей игроков и раздаёт всем (как скины в SkinStore). Слишком частые смены не теряются —
 * последняя применяется, как только пройдёт пауза.
 */
@EventBusSubscriber(modid = SkinKokk.MOD_ID)
public final class CharacterStore {
    private static final Map<UUID, String> CHARS = new ConcurrentHashMap<>();
    private static final Map<UUID, Long> LAST = new ConcurrentHashMap<>();
    private static final Map<UUID, String> PENDING = new ConcurrentHashMap<>();
    private static Path dir;

    private CharacterStore() {}

    /** Персонаж игрока на сервере (JSON) или null. */
    public static String get(UUID id) {
        return CHARS.get(id);
    }

    public static void upload(ServerPlayer player, String json) {
        UUID id = player.getUUID();
        long now = System.currentTimeMillis();
        if (now - LAST.getOrDefault(id, 0L) < CharacterConfig.COOLDOWN_SECONDS.get() * 1000L) {
            PENDING.put(id, json == null ? "" : json);
            return;
        }
        apply(player.server, id, json);
    }

    private static void apply(MinecraftServer server, UUID id, String json) {
        LAST.put(id, System.currentTimeMillis());
        PENDING.remove(id);
        CharacterData d = CharacterConfig.ALLOW.get() ? CharacterData.parse(json) : null;
        if (d == null || !d.on) {
            if (CHARS.remove(id) != null) {
                delete(id);
                broadcast(server, new CharacterNet.Sync(id, ""));
            }
            return;
        }
        String clean = d.restricted(CharacterConfig.ALLOW_CHEST.get(), CharacterConfig.ALLOW_BODY.get(), CharacterConfig.ALLOW_PARTS.get()).toJson();
        if (clean.equals(CHARS.get(id))) return;
        CHARS.put(id, clean);
        save(id, clean);
        broadcast(server, new CharacterNet.Sync(id, clean));
    }

    @SubscribeEvent
    public static void onTick(ServerTickEvent.Post event) {
        if (PENDING.isEmpty()) return;
        long now = System.currentTimeMillis();
        long cd = CharacterConfig.COOLDOWN_SECONDS.get() * 1000L;
        for (Iterator<Map.Entry<UUID, String>> it = PENDING.entrySet().iterator(); it.hasNext(); ) {
            Map.Entry<UUID, String> e = it.next();
            if (now - LAST.getOrDefault(e.getKey(), 0L) < cd) continue;
            it.remove();
            if (event.getServer().getPlayerList().getPlayer(e.getKey()) != null) apply(event.getServer(), e.getKey(), e.getValue());
        }
    }

    @SubscribeEvent
    public static void onLogin(PlayerEvent.PlayerLoggedInEvent event) {
        if (!(event.getEntity() instanceof ServerPlayer player)) return;
        for (Map.Entry<UUID, String> en : CHARS.entrySet()) send(player, new CharacterNet.Sync(en.getKey(), en.getValue()));
    }

    @SubscribeEvent
    public static void onStarted(ServerStartedEvent event) {
        CHARS.clear();
        LAST.clear();
        PENDING.clear();
        dir = event.getServer().getWorldPath(LevelResource.ROOT).resolve("skinkokk").resolve("characters");
        if (!CharacterConfig.PERSIST.get() || !Files.isDirectory(dir)) return;
        try (var stream = Files.list(dir)) {
            stream.filter(f -> f.getFileName().toString().endsWith(".json")).forEach(f -> {
                try {
                    String name = f.getFileName().toString();
                    UUID id = UUID.fromString(name.substring(0, name.length() - 5));
                    CharacterData d = CharacterData.parse(Files.readString(f, StandardCharsets.UTF_8));
                    if (d != null && d.on) CHARS.put(id, d.toJson());
                } catch (Exception ex) {
                    SkinKokk.LOGGER.warn("Bad stored character {}: {}", f, ex.toString());
                }
            });
        } catch (IOException ex) {
            SkinKokk.LOGGER.warn("Can't read characters: {}", ex.toString());
        }
    }

    @SubscribeEvent
    public static void onStopped(ServerStoppedEvent event) {
        CHARS.clear();
        LAST.clear();
        PENDING.clear();
        dir = null;
    }

    private static void broadcast(MinecraftServer server, CharacterNet.Sync payload) {
        for (ServerPlayer sp : server.getPlayerList().getPlayers()) send(sp, payload);
    }

    private static void send(ServerPlayer sp, CharacterNet.Sync payload) {
        try {
            if (sp.connection != null && sp.connection.hasChannel(CharacterNet.Sync.TYPE)) PacketDistributor.sendToPlayer(sp, payload);
        } catch (Exception ex) {
            SkinKokk.LOGGER.debug("Can't send character to {}: {}", sp.getGameProfile().getName(), ex.toString());
        }
    }

    private static void save(UUID id, String json) {
        if (dir == null || !CharacterConfig.PERSIST.get()) return;
        try {
            Files.createDirectories(dir);
            Files.writeString(dir.resolve(id + ".json"), json, StandardCharsets.UTF_8);
        } catch (IOException ex) {
            SkinKokk.LOGGER.warn("Can't save character: {}", ex.toString());
        }
    }

    private static void delete(UUID id) {
        if (dir == null) return;
        try {
            Files.deleteIfExists(dir.resolve(id + ".json"));
        } catch (IOException ignored) {
        }
    }
}
