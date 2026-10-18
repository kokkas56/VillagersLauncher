package ru.kokk.skinkokk.network;

import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.resources.ResourceLocation;
import ru.kokk.skinkokk.SkinKokk;

/** Клиент -> сервер: мой скин (пустой массив = нет). */
public record SkinUploadPayload(boolean slim, byte[] skin, byte[] cape, boolean clear) implements CustomPacketPayload {
    public static final Type<SkinUploadPayload> TYPE = new Type<>(ResourceLocation.fromNamespaceAndPath(SkinKokk.MOD_ID, "upload"));

    public static final StreamCodec<RegistryFriendlyByteBuf, SkinUploadPayload> STREAM_CODEC = StreamCodec.composite(
            ByteBufCodecs.BOOL, SkinUploadPayload::slim,
            ByteBufCodecs.BYTE_ARRAY, SkinUploadPayload::skin,
            ByteBufCodecs.BYTE_ARRAY, SkinUploadPayload::cape,
            ByteBufCodecs.BOOL, SkinUploadPayload::clear,
            SkinUploadPayload::new);

    @Override
    public Type<? extends CustomPacketPayload> type() {
        return TYPE;
    }
}
