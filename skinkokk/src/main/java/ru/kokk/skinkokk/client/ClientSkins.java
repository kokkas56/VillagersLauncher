package ru.kokk.skinkokk.client;

import com.mojang.blaze3d.platform.NativeImage;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import javax.annotation.Nullable;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.client.renderer.texture.TextureManager;
import net.minecraft.client.resources.PlayerSkin;
import net.minecraft.resources.ResourceLocation;
import ru.kokk.skinkokk.SkinKokk;
import ru.kokk.skinkokk.config.SkinKokkConfig;
import ru.kokk.skinkokk.network.SkinSyncPayload;

/** Текстуры скинов из лаунчера на клиенте. */
public final class ClientSkins {
    public record Entry(ResourceLocation skin, @Nullable ResourceLocation cape, boolean slim) {}

    private static final Map<UUID, Entry> SKINS = new ConcurrentHashMap<>();
    private static int counter = 0;

    private ClientSkins() {}

    @Nullable
    public static Entry get(UUID id) {
        if (id == null) return null;
        Minecraft mc = Minecraft.getInstance();
        boolean self = mc.player != null && id.equals(mc.player.getUUID());
        if (!self && !SkinKokkConfig.SHOW_OTHERS.get()) return null;
        return SKINS.get(id);
    }

    /** Подмена скина, которую использует миксин PlayerInfo. */
    public static PlayerSkin apply(UUID id, PlayerSkin original) {
        PlayerSkin r = applySkin(id, original);
        // персонаж из лаунчера может выбрать руки (тонкие 3 px / обычные 4 px) — и в руках от первого лица
        Boolean slim = ru.kokk.skinkokk.character.client.CharacterClient.slimArms(id);
        if (slim == null || (r.model() == PlayerSkin.Model.SLIM) == slim) return r;
        return new PlayerSkin(r.texture(), r.textureUrl(), r.capeTexture(), r.elytraTexture(), slim ? PlayerSkin.Model.SLIM : PlayerSkin.Model.WIDE, r.secure());
    }

    private static PlayerSkin applySkin(UUID id, PlayerSkin original) {
        Entry e = get(id);
        if (e == null) return original;
        ResourceLocation cape = SkinKokkConfig.SHOW_CAPES.get() && e.cape() != null ? e.cape() : original.capeTexture();
        ResourceLocation elytra = SkinKokkConfig.SHOW_CAPES.get() && e.cape() != null ? e.cape() : original.elytraTexture();
        return new PlayerSkin(e.skin(), null, cape, elytra, e.slim() ? PlayerSkin.Model.SLIM : PlayerSkin.Model.WIDE, false);
    }

    public static void onSync(SkinSyncPayload p) {
        if (p.clear()) remove(p.player());
        else set(p.player(), p.skin(), p.cape(), p.slim());
    }

    public static void set(UUID id, byte[] skin, byte[] cape, boolean slim) {
        Minecraft mc = Minecraft.getInstance();
        mc.execute(() -> {
            try {
                TextureManager tm = mc.getTextureManager();
                int n = ++counter;
                ResourceLocation skinRl = ResourceLocation.fromNamespaceAndPath(SkinKokk.MOD_ID, "skins/" + id + "_" + n);
                tm.register(skinRl, new DynamicTexture(NativeImage.read(skin)));
                ResourceLocation capeRl = null;
                if (cape != null && cape.length > 0) {
                    capeRl = ResourceLocation.fromNamespaceAndPath(SkinKokk.MOD_ID, "capes/" + id + "_" + n);
                    tm.register(capeRl, new DynamicTexture(NativeImage.read(cape)));
                }
                Entry old = SKINS.put(id, new Entry(skinRl, capeRl, slim));
                release(old);
            } catch (Exception e) {
                SkinKokk.LOGGER.warn("Bad skin for {}: {}", id, e.toString());
            }
        });
    }

    public static void remove(UUID id) {
        Minecraft.getInstance().execute(() -> release(SKINS.remove(id)));
    }

    public static void clearAll() {
        Minecraft.getInstance().execute(() -> {
            for (Entry e : SKINS.values()) release(e);
            SKINS.clear();
        });
    }

    private static void release(@Nullable Entry e) {
        if (e == null) return;
        TextureManager tm = Minecraft.getInstance().getTextureManager();
        tm.release(e.skin());
        if (e.cape() != null) tm.release(e.cape());
    }
}
