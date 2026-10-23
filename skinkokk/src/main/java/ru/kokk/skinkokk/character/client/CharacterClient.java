package ru.kokk.skinkokk.character.client;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import javax.annotation.Nullable;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientPacketListener;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.network.chat.Component;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.client.event.ClientPlayerNetworkEvent;
import net.neoforged.neoforge.client.event.ClientTickEvent;
import net.neoforged.neoforge.network.PacketDistributor;
import ru.kokk.skinkokk.SkinKokk;
import ru.kokk.skinkokk.character.CharacterConfig;
import ru.kokk.skinkokk.character.CharacterData;
import ru.kokk.skinkokk.character.CharacterNet;
import ru.kokk.skinkokk.config.SkinKokkConfig;

/**
 * Клиент: персонажи всех игроков (пришли с сервера) и свой — из файла {@code skinkokk/character.json}, который пишет
 * лаунчер (вкладка «Персонаж»). Свой видно сразу, даже на сервере без мода; на сервер он уходит, если там есть SkinKokk.
 */
@EventBusSubscriber(modid = SkinKokk.MOD_ID, value = Dist.CLIENT)
public final class CharacterClient {
    public record Entry(CharacterData data, String json) {}

    private static final Map<UUID, Entry> CHARS = new ConcurrentHashMap<>();
    private static long stamp = -1;
    private static int ticks;
    private static boolean notify;
    private static Entry local;
    private static long localStamp = -2, localChecked;

    private CharacterClient() {}

    // ---- доступ -------------------------------------------------------------------------------------------------------

    @Nullable
    public static Entry get(UUID id) {
        return id == null ? null : CHARS.get(id);
    }

    public static boolean isSelf(UUID id) {
        Minecraft mc = Minecraft.getInstance();
        return mc.player != null && mc.player.getUUID().equals(id);
    }

    /** Персонаж для отрисовки этого игрока с учётом настроек зрителя (null — ничего не рисовать). */
    @Nullable
    public static Entry forRender(AbstractClientPlayer p) {
        Entry e = CHARS.get(p.getUUID());
        if (e == null || !e.data.on) return null;
        if (isSelf(p.getUUID()) && !CharacterConfig.SHOW_OWN.get()) return null;
        return e;
    }

    /** Руки персонажа для миксина скина: TRUE — тонкие, FALSE — обычные, null — как в скине. */
    @Nullable
    public static Boolean slimArms(UUID id) {
        try {
            if (!CharacterConfig.ARMS_OVERRIDE.get()) return null;
        } catch (RuntimeException e) {
            return null; // настройки ещё не загружены
        }
        Entry e = CHARS.get(id);
        if (e == null || !e.data.on) return null;
        if (!isSelf(id) && !CharacterConfig.SHOW_OTHERS_BODY.get()) return null;
        return switch (e.data.arms) {
            case "slim" -> Boolean.TRUE;
            case "wide" -> Boolean.FALSE;
            default -> null;
        };
    }

    public static void onSync(UUID id, String json) {
        if (json == null || json.isEmpty()) {
            if (!isSelf(id)) CHARS.remove(id);
            return;
        }
        if (isSelf(id)) return; // свой берём из файла — он всегда свежее
        CharacterData d = CharacterData.parse(json);
        if (d == null) CHARS.remove(id);
        else CHARS.put(id, new Entry(d, json));
    }

    // ---- свой файл от лаунчера ----------------------------------------------------------------------------------------

    public static Path file() {
        String folder;
        try {
            folder = SkinKokkConfig.FOLDER.get();
        } catch (RuntimeException e) {
            folder = "skinkokk";
        }
        return Minecraft.getInstance().gameDirectory.toPath().resolve(folder).resolve("character.json");
    }

    private static long fileStamp() {
        try {
            Path f = file();
            return Files.exists(f) ? Files.getLastModifiedTime(f).toMillis() * 31 + Files.size(f) : 0;
        } catch (Exception e) {
            return 0;
        }
    }

    /** Свой персонаж из файла (работает и в главном меню — для лобби KokkHUD). */
    @Nullable
    public static Entry local() {
        long now = System.currentTimeMillis();
        if (now - localChecked < 1500) return local;
        localChecked = now;
        long s = fileStamp();
        if (s == localStamp) return local;
        localStamp = s;
        local = null;
        try {
            Path f = file();
            if (Files.exists(f)) {
                CharacterData d = CharacterData.parse(Files.readString(f, StandardCharsets.UTF_8));
                if (d != null && d.on) local = new Entry(d, d.toJson());
            }
        } catch (Exception e) {
            SkinKokk.LOGGER.debug("Can't read character file: {}", e.toString());
        }
        return local;
    }

    @SubscribeEvent
    public static void onLogin(ClientPlayerNetworkEvent.LoggingIn event) {
        stamp = -1;
        ticks = 0;
    }

    @SubscribeEvent
    public static void onLogout(ClientPlayerNetworkEvent.LoggingOut event) {
        CHARS.clear();
        stamp = -1;
        CharPhysics.clear();
    }

    @SubscribeEvent
    public static void onTick(ClientTickEvent.Post event) {
        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null || mc.getConnection() == null) return;
        int poll;
        try {
            poll = SkinKokkConfig.POLL_TICKS.get();
        } catch (RuntimeException e) {
            poll = 40;
        }
        if (++ticks >= poll || stamp == -1) {
            ticks = 0;
            long s = fileStamp();
            if (s != stamp) {
                boolean first = stamp == -1;
                stamp = s;
                notify = !first;
                push();
            }
        }
        // физика всех, кто рядом
        try {
            CharRender.tickPhysics(mc);
        } catch (RuntimeException e) {
            SkinKokk.LOGGER.debug("Character physics: {}", e.toString());
        }
        if (mc.level != null && mc.level.getGameTime() % 200 == 0) CharPhysics.cleanup();
    }

    /** Читает свой файл и применяет: у себя сразу, на сервер — если там есть мод. */
    public static void push() {
        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) return;
        UUID me = mc.player.getUUID();
        localChecked = 0;
        Entry e = local();
        if (e == null) {
            CHARS.remove(me);
            send("");
            return;
        }
        CHARS.put(me, e);
        send(CharacterConfig.SEND_OWN.get() ? e.json : "");
        if (notify && CharacterConfig.NOTIFY.get()) mc.player.displayClientMessage(Component.translatable("skinkokk.msg.character"), true);
        notify = false;
    }

    private static void send(String json) {
        ClientPacketListener conn = Minecraft.getInstance().getConnection();
        if (conn == null) return;
        try {
            if (conn.hasChannel(CharacterNet.Upload.TYPE)) PacketDistributor.sendToServer(new CharacterNet.Upload(json));
        } catch (Exception ex) {
            SkinKokk.LOGGER.debug("Server without SkinKokk characters: {}", ex.toString());
        }
    }
}
