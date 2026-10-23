package ru.kokk.skinkokk.character;

import java.util.UUID;
import net.minecraft.core.UUIDUtil;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerPlayer;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.network.event.RegisterPayloadHandlersEvent;
import net.neoforged.neoforge.network.registration.PayloadRegistrar;
import ru.kokk.skinkokk.SkinKokk;

/** Сеть персонажей: клиент → сервер (мой персонаж), сервер → все (персонаж игрока). Пустая строка = снять. */
@EventBusSubscriber(modid = SkinKokk.MOD_ID, bus = EventBusSubscriber.Bus.MOD)
public final class CharacterNet {
    private CharacterNet() {}

    public record Upload(String json) implements CustomPacketPayload {
        public static final Type<Upload> TYPE = new Type<>(ResourceLocation.fromNamespaceAndPath(SkinKokk.MOD_ID, "character_upload"));
        public static final StreamCodec<RegistryFriendlyByteBuf, Upload> STREAM_CODEC = StreamCodec.composite(
                ByteBufCodecs.stringUtf8(CharacterData.MAX_JSON), Upload::json, Upload::new);

        @Override
        public Type<? extends CustomPacketPayload> type() {
            return TYPE;
        }
    }

    public record Sync(UUID player, String json) implements CustomPacketPayload {
        public static final Type<Sync> TYPE = new Type<>(ResourceLocation.fromNamespaceAndPath(SkinKokk.MOD_ID, "character_sync"));
        public static final StreamCodec<RegistryFriendlyByteBuf, Sync> STREAM_CODEC = StreamCodec.composite(
                UUIDUtil.STREAM_CODEC, Sync::player, ByteBufCodecs.stringUtf8(CharacterData.MAX_JSON), Sync::json, Sync::new);

        @Override
        public Type<? extends CustomPacketPayload> type() {
            return TYPE;
        }
    }

    @SubscribeEvent
    public static void register(RegisterPayloadHandlersEvent event) {
        PayloadRegistrar registrar = event.registrar("1").optional();
        registrar.playToServer(Upload.TYPE, Upload.STREAM_CODEC, (payload, context) -> {
            if (context.player() instanceof ServerPlayer player) context.enqueueWork(() -> CharacterStore.upload(player, payload.json()));
        });
        registrar.playToClient(Sync.TYPE, Sync.STREAM_CODEC, (payload, context) -> context.enqueueWork(() -> ClientHandler.onSync(payload)));
    }

    /** Отдельный класс, чтобы сервер не загружал клиентский код. */
    static final class ClientHandler {
        static void onSync(Sync payload) {
            ru.kokk.skinkokk.character.client.CharacterClient.onSync(payload.player(), payload.json());
        }
    }
}
