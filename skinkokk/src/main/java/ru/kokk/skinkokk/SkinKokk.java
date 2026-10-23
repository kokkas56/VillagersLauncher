package ru.kokk.skinkokk;

import com.mojang.logging.LogUtils;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.ModContainer;
import net.neoforged.fml.common.Mod;
import net.neoforged.fml.config.ModConfig;
import org.slf4j.Logger;
import ru.kokk.skinkokk.config.SkinKokkConfig;

@Mod(SkinKokk.MOD_ID)
public final class SkinKokk {
    public static final String MOD_ID = "skinkokk";
    public static final Logger LOGGER = LogUtils.getLogger();
    /** Ограничение размера одного пакета от клиента (ваниль режет ~32 КБ). */
    public static final int MAX_UPLOAD_BYTES = 30000;

    public SkinKokk(IEventBus modBus, ModContainer container) {
        container.registerConfig(ModConfig.Type.CLIENT, SkinKokkConfig.CLIENT_SPEC);
        container.registerConfig(ModConfig.Type.SERVER, SkinKokkConfig.SERVER_SPEC);
        // персонажи (уши, хвосты, причёски, одежда, телосложение) — свои файлы настроек
        container.registerConfig(ModConfig.Type.CLIENT, ru.kokk.skinkokk.character.CharacterConfig.CLIENT_SPEC, "skinkokk-character-client.toml");
        container.registerConfig(ModConfig.Type.SERVER, ru.kokk.skinkokk.character.CharacterConfig.SERVER_SPEC, "skinkokk-character-server.toml");
        // анимации (жесты, эмоции, позы из сцен Студии) — свои файлы настроек
        ru.kokk.skinkokk.anim.AnimConfig.init(container);
        LOGGER.info("SkinKokk initialized");
    }
}
