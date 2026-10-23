package ru.kokk.skinkokk.anim;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.WeakHashMap;
import java.util.function.BiConsumer;

import com.google.gson.JsonParser;
import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.arguments.BoolArgumentType;
import com.mojang.brigadier.arguments.FloatArgumentType;
import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.builder.LiteralArgumentBuilder;
import com.mojang.brigadier.context.CommandContext;
import com.mojang.brigadier.exceptions.CommandSyntaxException;

import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.commands.SharedSuggestionProvider;
import net.minecraft.commands.arguments.EntityArgument;
import net.minecraft.network.chat.Component;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.phys.Vec3;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.fml.loading.FMLPaths;
import net.neoforged.neoforge.event.RegisterCommandsEvent;
import net.neoforged.neoforge.event.entity.player.PlayerEvent;
import net.neoforged.neoforge.event.server.ServerStartedEvent;
import net.neoforged.neoforge.event.server.ServerStoppedEvent;
import net.neoforged.neoforge.event.tick.ServerTickEvent;
import net.neoforged.neoforge.network.PacketDistributor;
import ru.kokk.skinkokk.SkinKokk;

/**
 * Сервер решает, кто что играет, и рассказывает об этом клиентам рядом (и тем, кто подойдёт позже).
 * Команды: /skinkokk anim play|stop|hold|list|reload (и то же под /vkokk anim), эмоции игроков: колесо и /emote.
 */
@EventBusSubscriber(modid = SkinKokk.MOD_ID)
public final class AnimServer {
    private AnimServer() {}

    static final class Playing {
        final String id;
        final long start;
        final boolean loop;
        final float speed;
        float hold;
        final boolean emote;
        final Vec3 at;
        float lastT = -1;

        Playing(String id, long start, boolean loop, float speed, float hold, boolean emote, Vec3 at) {
            this.id = id;
            this.start = start;
            this.loop = loop;
            this.speed = speed;
            this.hold = hold;
            this.emote = emote;
            this.at = at;
        }
    }

    private static final Map<Entity, Playing> PLAYING = new WeakHashMap<>();
    private static final Map<UUID, Long> EMOTE_AT = new HashMap<>();
    private static MinecraftServer server;
    private static long ticks;
    /** Kokk Story / Villagers, Kokk: события анимации на сервере ("signal:<имя>", "face:<лицо>"). */
    static volatile BiConsumer<Entity, String> eventHook;

    // ---------- жизнь сервера ----------
    @SubscribeEvent
    public static void started(ServerStartedEvent e) {
        server = e.getServer();
        AnimLibrary.ensureBuiltins();
        reload(null);
    }

    @SubscribeEvent
    public static void stopped(ServerStoppedEvent e) {
        PLAYING.clear();
        AnimLibrary.clearServer();
        server = null;
    }

    static Path folder() {
        String f;
        try {
            f = AnimConfig.FOLDER.get();
        } catch (RuntimeException ex) {
            f = "config/skinkokk/anims";
        }
        return FMLPaths.GAMEDIR.get().resolve(f).normalize();
    }

    /** Перечитать папку и разослать клиентам. Возвращает проблемы. */
    public static List<String> reload(CommandSourceStack src) {
        List<String> probs = AnimLibrary.loadDir(folder());
        for (String p : probs) SkinKokk.LOGGER.warn("[SkinKokk] animation: {}", p);
        if (server != null) for (ServerPlayer p : server.getPlayerList().getPlayers()) sendAll(p);
        return probs;
    }

    static void sendAll(ServerPlayer p) {
        boolean first = true;
        Collection<AnimDef> defs = AnimLibrary.serverShared();
        if (defs.isEmpty()) {
            send(p, new AnimNet.Def("-", "", true));
            return;
        }
        for (AnimDef d : defs) {
            send(p, new AnimNet.Def(d.id, d.json.length() < AnimNet.MAX_JSON ? d.json : "", first));
            first = false;
        }
    }

    private static void send(ServerPlayer p, net.minecraft.network.protocol.common.custom.CustomPacketPayload payload) {
        try {
            if (p.connection.hasChannel(payload.type())) PacketDistributor.sendToPlayer(p, payload);
        } catch (RuntimeException ex) {
            SkinKokk.LOGGER.debug("[SkinKokk] anim packet not sent: {}", ex.toString());
        }
    }

    private static void broadcast(Entity e, net.minecraft.network.protocol.common.custom.CustomPacketPayload payload) {
        if (!(e.level() instanceof net.minecraft.server.level.ServerLevel sl)) return;
        for (ServerPlayer p : sl.getChunkSource().chunkMap.getPlayers(e.chunkPosition(), false)) send(p, payload);
        if (e instanceof ServerPlayer sp && !sl.getChunkSource().chunkMap.getPlayers(e.chunkPosition(), false).contains(sp)) send(sp, payload);
    }

    @SubscribeEvent
    public static void login(PlayerEvent.PlayerLoggedInEvent e) {
        if (e.getEntity() instanceof ServerPlayer p) sendAll(p);
    }

    @SubscribeEvent
    public static void startTracking(PlayerEvent.StartTracking e) {
        if (!(e.getEntity() instanceof ServerPlayer p)) return;
        Playing pl = PLAYING.get(e.getTarget());
        if (pl == null) return;
        send(p, new AnimNet.Play(e.getTarget().getId(), pl.id, pl.loop, pl.speed, (ticks - pl.start) * pl.speed, pl.hold, false));
    }

    // ---------- играть ----------
    public static boolean play(Entity e, String id, boolean loop, float speed) {
        return play(e, id, loop, speed, -1, false);
    }

    static boolean play(Entity e, String id, boolean loop, float speed, float hold, boolean emote) {
        AnimDef d = AnimLibrary.server(id);
        if (d == null || e == null || e.level().isClientSide) return false;
        boolean lp = loop || d.loop;
        float sp = speed > 0 ? speed : 1;
        Playing pl = new Playing(d.id, ticks, lp, sp, hold, emote, e.position());
        PLAYING.put(e, pl);
        broadcast(e, new AnimNet.Play(e.getId(), d.id, lp, sp, 0, hold, false));
        return true;
    }

    public static void stop(Entity e) {
        if (e == null) return;
        PLAYING.remove(e);
        broadcast(e, new AnimNet.Play(e.getId(), "", false, 1, 0, -1, true));
    }

    public static boolean hold(Entity e, String id, float t) {
        Playing pl = PLAYING.get(e);
        if (pl != null && pl.id.equals(id)) {
            pl.hold = t;
            broadcast(e, new AnimNet.Play(e.getId(), id, pl.loop, pl.speed, 0, t, false));
            return true;
        }
        return play(e, id, false, 1, t, false);
    }

    public static String playingId(Entity e) {
        Playing pl = PLAYING.get(e);
        return pl == null ? null : pl.id;
    }

    /** Живая анимация (Студия, другие моды): заменить/добавить и разослать всем. null — всё хорошо, иначе ошибка по-русски. */
    public static String register(String json) {
        AnimDef d;
        try {
            d = AnimDef.parse(JsonParser.parseString(json).getAsJsonObject(), null, false);
        } catch (RuntimeException ex) {
            return "анимация не читается: " + ex.getMessage();
        }
        AnimLibrary.putLive(d);
        if (server != null) for (ServerPlayer p : server.getPlayerList().getPlayers()) send(p, new AnimNet.Def(d.id, d.json, false));
        return null;
    }

    public static boolean unregister(String id) {
        boolean r = AnimLibrary.removeLive(id);
        if (r && server != null) {
            AnimDef still = AnimLibrary.server(id);
            for (ServerPlayer p : server.getPlayerList().getPlayers()) send(p, new AnimNet.Def(id, still != null && !still.builtin ? still.json : "", false));
        }
        return r;
    }

    // ---------- эмоции игроков ----------
    static void emote(ServerPlayer p, String id) {
        if (id == null || id.isEmpty()) {
            Playing pl = PLAYING.get(p);
            if (pl != null && pl.emote) stop(p);
            return;
        }
        if (!AnimConfig.get(AnimConfig.ALLOW_EMOTES, true)) {
            p.displayClientMessage(Component.translatable("skinkokk.anim.emotes_off"), true);
            return;
        }
        AnimDef d = AnimLibrary.server(id);
        if (d == null || !d.emote || locked(id)) {
            p.displayClientMessage(Component.translatable("skinkokk.anim.emote_locked", id), true);
            return;
        }
        long last = EMOTE_AT.getOrDefault(p.getUUID(), -1000L);
        if (ticks - last < AnimConfig.get(AnimConfig.EMOTE_COOLDOWN, 10)) return;
        EMOTE_AT.put(p.getUUID(), ticks);
        play(p, id, d.loop, 1, -1, true);
    }

    static boolean locked(String id) {
        try {
            return AnimConfig.LOCKED_EMOTES.get().contains(id);
        } catch (RuntimeException ex) {
            return false;
        }
    }

    // ---------- тик: конец, прерывание эмоции, серверные события ----------
    @SubscribeEvent
    public static void tick(ServerTickEvent.Post e) {
        ticks++;
        if (PLAYING.isEmpty()) return;
        boolean stopOnMove = AnimConfig.get(AnimConfig.STOP_EMOTE_ON_MOVE, true);
        List<Entity> stopNow = new ArrayList<>();
        for (Iterator<Map.Entry<Entity, Playing>> it = PLAYING.entrySet().iterator(); it.hasNext();) {
            Map.Entry<Entity, Playing> en = it.next();
            Entity ent = en.getKey();
            Playing pl = en.getValue();
            if (ent == null || ent.isRemoved()) { it.remove(); continue; }
            AnimDef d = AnimLibrary.server(pl.id);
            if (d == null) { it.remove(); continue; }
            if (pl.emote && stopOnMove && ent.position().distanceToSqr(pl.at) > 0.36) { stopNow.add(ent); continue; }
            if (pl.hold >= 0) continue;
            float el = (ticks - pl.start) * pl.speed * d.speed;
            float t = pl.loop ? el % d.length : el;
            if (eventHook != null && !d.events.isEmpty()) {
                for (AnimDef.Event ev : d.events) {
                    if (!ev.kind.equals("signal") && !ev.kind.equals("face")) continue;
                    boolean hit = pl.lastT < 0 ? ev.t <= t : pl.lastT <= t ? ev.t > pl.lastT && ev.t <= t : ev.t > pl.lastT || ev.t <= t;
                    if (hit) {
                        try {
                            eventHook.accept(ent, ev.kind + ":" + ev.value);
                        } catch (RuntimeException ex) {
                            SkinKokk.LOGGER.debug("[SkinKokk] anim event hook: {}", ex.toString());
                        }
                    }
                }
            }
            pl.lastT = t;
            if (!pl.loop && !d.stay && el >= d.length) it.remove();
        }
        for (Entity ent : stopNow) stop(ent);
    }

    // ---------- команды ----------
    @SubscribeEvent
    public static void commands(RegisterCommandsEvent e) {
        CommandDispatcher<CommandSourceStack> d = e.getDispatcher();
        d.register(Commands.literal("skinkokk").then(animTree()));
        d.register(Commands.literal("vkokk").then(animTree()));
        d.register(Commands.literal("emote")
                .then(Commands.literal("stop").executes(c -> { ServerPlayer p = c.getSource().getPlayerOrException(); emote(p, ""); return 1; }))
                .then(Commands.argument("id", StringArgumentType.word()).suggests((c, b) -> SharedSuggestionProvider.suggest(emoteIds(), b))
                        .executes(c -> { emote(c.getSource().getPlayerOrException(), StringArgumentType.getString(c, "id")); return 1; })));
    }

    static List<String> emoteIds() {
        List<String> l = new ArrayList<>();
        for (String id : AnimLibrary.serverIds()) {
            AnimDef d = AnimLibrary.server(id);
            if (d != null && d.emote && !locked(id)) l.add(id);
        }
        return l;
    }

    private static int op() {
        return AnimConfig.get(AnimConfig.OP_LEVEL, 2);
    }

    private static LiteralArgumentBuilder<CommandSourceStack> animTree() {
        return Commands.literal("anim").requires(s -> s.hasPermission(op()))
                .then(Commands.literal("list").executes(AnimServer::list))
                .then(Commands.literal("reload").executes(c -> {
                    List<String> probs = reload(c.getSource());
                    c.getSource().sendSuccess(() -> Component.translatable("skinkokk.anim.reloaded", AnimLibrary.serverShared().size(), probs.size()), true);
                    for (String p : probs) c.getSource().sendFailure(Component.literal(p));
                    return 1;
                }))
                .then(Commands.literal("play").then(Commands.argument("id", StringArgumentType.word()).suggests((c, b) -> SharedSuggestionProvider.suggest(AnimLibrary.serverIds(), b))
                        .executes(c -> playCmd(c, null, false, 1))
                        .then(Commands.argument("targets", EntityArgument.entities())
                                .executes(c -> playCmd(c, EntityArgument.getEntities(c, "targets"), false, 1))
                                .then(Commands.argument("loop", BoolArgumentType.bool())
                                        .executes(c -> playCmd(c, EntityArgument.getEntities(c, "targets"), BoolArgumentType.getBool(c, "loop"), 1))
                                        .then(Commands.argument("speed", FloatArgumentType.floatArg(0.05f, 10f))
                                                .executes(c -> playCmd(c, EntityArgument.getEntities(c, "targets"), BoolArgumentType.getBool(c, "loop"), FloatArgumentType.getFloat(c, "speed"))))))))
                .then(Commands.literal("stop")
                        .executes(c -> { stop(c.getSource().getEntityOrException()); return 1; })
                        .then(Commands.argument("targets", EntityArgument.entities()).executes(c -> { for (Entity t : EntityArgument.getEntities(c, "targets")) stop(t); return 1; })));
    }

    private static int playCmd(CommandContext<CommandSourceStack> c, Collection<? extends Entity> targets, boolean loop, float speed) throws CommandSyntaxException {
        String id = StringArgumentType.getString(c, "id");
        if (AnimLibrary.server(id) == null) {
            c.getSource().sendFailure(Component.translatable("skinkokk.anim.unknown", id));
            return 0;
        }
        Collection<? extends Entity> list = targets != null ? targets : List.of(c.getSource().getEntityOrException());
        int n = 0;
        for (Entity t : list) if (play(t, id, loop, speed)) n++;
        int nn = n;
        c.getSource().sendSuccess(() -> Component.translatable("skinkokk.anim.played", id, nn), true);
        return n;
    }

    private static int list(CommandContext<CommandSourceStack> c) {
        StringBuilder sb = new StringBuilder();
        int n = 0;
        for (String id : AnimLibrary.serverIds()) {
            AnimDef d = AnimLibrary.server(id);
            if (d == null) continue;
            if (sb.length() > 0) sb.append(", ");
            sb.append(id);
            if (!d.builtin) sb.append('*');
            n++;
        }
        int nn = n;
        c.getSource().sendSuccess(() -> Component.translatable("skinkokk.anim.list", nn, sb.toString()), false);
        return n;
    }
}
