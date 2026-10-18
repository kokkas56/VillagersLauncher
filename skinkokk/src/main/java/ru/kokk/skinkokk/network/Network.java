package ru.kokk.skinkokk.network;

import net.minecraft.server.level.ServerPlayer;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.network.event.RegisterPayloadHandlersEvent;
import net.neoforged.neoforge.network.registration.PayloadRegistrar;
import ru.kokk.skinkokk.SkinKokk;
import ru.kokk.skinkokk.server.SkinStore;

@EventBusSubscriber(modid = SkinKokk.MOD_ID, bus = EventBusSubscriber.Bus.MOD)
public final class Network {
    private Network() {}

    @SubscribeEvent
    public static void register(RegisterPayloadHandlersEvent event) {
        // optional: можно заходить на сервера без мода
        PayloadRegistrar registrar = event.registrar("1").optional();
        registrar.playToServer(SkinUploadPayload.TYPE, SkinUploadPayload.STREAM_CODEC, (payload, context) -> {
            if (context.player() instanceof ServerPlayer player) {
                context.enqueueWork(() -> SkinStore.upload(player, payload));
            }
        });
        registrar.playToClient(SkinSyncPayload.TYPE, SkinSyncPayload.STREAM_CODEC, (payload, context) ->
                context.enqueueWork(() -> ClientHandler.onSync(payload)));
    }

    /** Отдельный класс, чтобы сервер не загружал клиентский код. */
    static final class ClientHandler {
        static void onSync(SkinSyncPayload payload) {
            ru.kokk.skinkokk.client.ClientSkins.onSync(payload);
        }
    }
}
