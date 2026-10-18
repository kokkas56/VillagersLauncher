package ru.kokk.netkokk;

import com.mojang.logging.LogUtils;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.ModContainer;
import net.neoforged.fml.common.Mod;
import net.neoforged.fml.config.ModConfig;
import org.slf4j.Logger;

@Mod(NetKokk.MOD_ID)
public final class NetKokk {
    public static final String MOD_ID = "netkokk";
    public static final Logger LOGGER = LogUtils.getLogger();

    public NetKokk(IEventBus modBus, ModContainer container) {
        container.registerConfig(ModConfig.Type.CLIENT, NetKokkConfig.SPEC);
    }
}
