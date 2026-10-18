package ru.kokk.netkokk;

import java.util.List;
import net.neoforged.neoforge.common.ModConfigSpec;

public final class NetKokkConfig {
    private NetKokkConfig() {}

    private static final ModConfigSpec.Builder B = new ModConfigSpec.Builder();
    public static final ModConfigSpec.BooleanValue ANNOUNCE;
    public static final ModConfigSpec.BooleanValue LISTEN;
    public static final ModConfigSpec.IntValue INTERVAL_MS;
    public static final ModConfigSpec.BooleanValue OFFLINE_LAN;
    public static final ModConfigSpec.BooleanValue SHOW_ADDRESSES;
    public static final ModConfigSpec.ConfigValue<List<? extends String>> EXTRA_TARGETS;
    public static final ModConfigSpec.ConfigValue<List<? extends String>> IGNORE_ADAPTERS;

    static {
        B.comment("Игра по сети через любые сетевые карты / LAN over every adapter").push("lan");
        ANNOUNCE = B.comment("Объявлять открытый мир на всех сетевых картах (Radmin, ZeroTier, Hamachi, VPN).", "Announce your LAN world on every network adapter.")
                .translation("config.netkokk.announce").define("announceEverywhere", true);
        LISTEN = B.comment("Искать миры друзей на всех сетевых картах.", "Look for LAN worlds on every network adapter.")
                .translation("config.netkokk.listen").define("listenEverywhere", true);
        INTERVAL_MS = B.comment("Как часто объявлять мир (мс).", "Announce interval (ms).")
                .translation("config.netkokk.interval").defineInRange("announceIntervalMs", 1500, 500, 10000);
        OFFLINE_LAN = B.comment("Пускать в открытый мир всех: и Ely.by, и игроков с офлайн-ником.", "Let both Ely.by and offline players join your LAN world.")
                .translation("config.netkokk.offlineLan").define("letEveryoneJoin", true);
        SHOW_ADDRESSES = B.comment("После «Открыть для сети» писать в чат адреса для друзей.", "Print join addresses in chat after opening to LAN.")
                .translation("config.netkokk.showAddresses").define("showAddresses", true);
        EXTRA_TARGETS = B.comment("Дополнительные IP, куда слать объявление напрямую (для сетей без широковещания).", "Extra IPs to announce to directly.")
                .translation("config.netkokk.extraTargets").defineListAllowEmpty("extraTargets", List.of(), () -> "", o -> o instanceof String);
        IGNORE_ADAPTERS = B.comment("Сетевые карты, которые не трогать (часть имени).", "Adapters to skip (name substring).")
                .translation("config.netkokk.ignore").defineListAllowEmpty("ignoreAdapters", List.of("VirtualBox", "VMware", "Hyper-V", "WSL"), () -> "", o -> o instanceof String);
        B.pop();
    }

    public static final ModConfigSpec SPEC = B.build();
}
