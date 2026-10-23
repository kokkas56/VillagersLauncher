package ru.kokk.skinkokk.anim;

import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerPlayer;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.network.event.RegisterPayloadHandlersEvent;
import net.neoforged.neoforge.network.registration.PayloadRegistrar;
import ru.kokk.skinkokk.SkinKokk;

/** Пакеты анимаций: кто что играет (сервер → клиенты), сами анимации (сервер → клиенты), эмоция игрока (клиент → сервер). */
@EventBusSubscriber(modid = SkinKokk.MOD_ID, bus = EventBusSubscriber.Bus.MOD)
public final class AnimNet {
    private AnimNet() {}

    static final int MAX_JSON = 200_000;

    /** Сервер → клиенты: существо играет анимацию (offset — сколько тиков уже прошло, hold ≥ 0 — замереть на этом тике, stop). */
    public record Play(int entity, String id, boolean loop, float speed, float offset, float hold, boolean stop) implements CustomPacketPayload {
        public static final Type<Play> TYPE = new Type<>(ResourceLocation.fromNamespaceAndPath(SkinKokk.MOD_ID, "anim_play"));
        public static final StreamCodec<RegistryFriendlyByteBuf, Play> STREAM_CODEC = StreamCodec.of((buf, p) -> {
            buf.writeVarInt(p.entity);
            buf.writeUtf(p.id, 64);
            buf.writeBoolean(p.loop);
            buf.writeFloat(p.speed);
            buf.writeFloat(p.offset);
            buf.writeFloat(p.hold);
            buf.writeBoolean(p.stop);
        }, buf -> new Play(buf.readVarInt(), buf.readUtf(64), buf.readBoolean(), buf.readFloat(), buf.readFloat(), buf.readFloat(), buf.readBoolean()));

        @Override
        public Type<? extends CustomPacketPayload> type() {
            return TYPE;
        }
    }

    /** Сервер → клиенты: анимация (json пустой — убрать; reset — сначала забыть все присланные раньше). */
    public record Def(String id, String json, boolean reset) implements CustomPacketPayload {
        public static final Type<Def> TYPE = new Type<>(ResourceLocation.fromNamespaceAndPath(SkinKokk.MOD_ID, "anim_def"));
        public static final StreamCodec<RegistryFriendlyByteBuf, Def> STREAM_CODEC = StreamCodec.of((buf, p) -> {
            buf.writeUtf(p.id, 64);
            buf.writeUtf(p.json, MAX_JSON);
            buf.writeBoolean(p.reset);
        }, buf -> new Def(buf.readUtf(64), buf.readUtf(MAX_JSON), buf.readBoolean()));

        @Override
        public Type<? extends CustomPacketPayload> type() {
            return TYPE;
        }
    }

    /** Клиент → сервер: эмоция из колеса (пусто — остановить). */
    public record Emote(String id) implements CustomPacketPayload {
        public static final Type<Emote> TYPE = new Type<>(ResourceLocation.fromNamespaceAndPath(SkinKokk.MOD_ID, "anim_emote"));
        public static final StreamCodec<FriendlyByteBuf, Emote> STREAM_CODEC = StreamCodec.of((buf, p) -> buf.writeUtf(p.id, 64), buf -> new Emote(buf.readUtf(64)));

        @Override
        public Type<? extends CustomPacketPayload> type() {
            return TYPE;
        }
    }

    @SubscribeEvent
    public static void register(RegisterPayloadHandlersEvent event) {
        PayloadRegistrar r = event.registrar("1").optional();
        r.playToClient(Play.TYPE, Play.STREAM_CODEC, (p, ctx) -> ctx.enqueueWork(() -> ClientHandler.play(p)));
        r.playToClient(Def.TYPE, Def.STREAM_CODEC, (p, ctx) -> ctx.enqueueWork(() -> ClientHandler.def(p)));
        r.playToServer(Emote.TYPE, Emote.STREAM_CODEC, (p, ctx) -> {
            if (ctx.player() instanceof ServerPlayer sp) ctx.enqueueWork(() -> AnimServer.emote(sp, p.id()));
        });
    }

    /** Отдельный класс: сервер не грузит клиентский код. */
    static final class ClientHandler {
        static void play(Play p) {
            AnimClient.onPlay(p);
        }

        static void def(Def p) {
            AnimClient.onDef(p);
        }
    }
}
