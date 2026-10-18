package ru.kokk.skinkokk.network;

import java.util.UUID;
import net.minecraft.core.UUIDUtil;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.resources.ResourceLocation;
import ru.kokk.skinkokk.SkinKokk;

/** Сервер -> клиенты: скин игрока (clear = вернуть обычный). */
public record SkinSyncPayload(UUID player, boolean slim, byte[] skin, byte[] cape, boolean clear) implements CustomPacketPayload {
    public static final Type<SkinSyncPayload> TYPE = new Type<>(ResourceLocation.fromNamespaceAndPath(SkinKokk.MOD_ID, "sync"));

    public static final StreamCodec<RegistryFriendlyByteBuf, SkinSyncPayload> STREAM_CODEC = StreamCodec.composite(
            UUIDUtil.STREAM_CODEC, SkinSyncPayload::player,
            ByteBufCodecs.BOOL, SkinSyncPayload::slim,
            ByteBufCodecs.BYTE_ARRAY, SkinSyncPayload::skin,
            ByteBufCodecs.BYTE_ARRAY, SkinSyncPayload::cape,
            ByteBufCodecs.BOOL, SkinSyncPayload::clear,
            SkinSyncPayload::new);

    @Override
    public Type<? extends CustomPacketPayload> type() {
        return TYPE;
    }
}
