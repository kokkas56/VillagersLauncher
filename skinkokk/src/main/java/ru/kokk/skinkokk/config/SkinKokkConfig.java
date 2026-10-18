package ru.kokk.skinkokk.config;

import net.neoforged.neoforge.common.ModConfigSpec;

public final class SkinKokkConfig {
    private SkinKokkConfig() {}

    // ---------- клиент ----------
    private static final ModConfigSpec.Builder CLIENT = new ModConfigSpec.Builder();
    public static final ModConfigSpec.BooleanValue ENABLED;
    public static final ModConfigSpec.BooleanValue SHOW_OTHERS;
    public static final ModConfigSpec.BooleanValue SHOW_CAPES;
    public static final ModConfigSpec.IntValue POLL_TICKS;
    public static final ModConfigSpec.BooleanValue NOTIFY;
    public static final ModConfigSpec.ConfigValue<String> FOLDER;

    static {
        CLIENT.comment("Скины из VillagersLauncher / skins from VillagersLauncher").push("client");
        ENABLED = CLIENT.comment("Отправлять свой скин из лаунчера другим игрокам.", "Send your launcher skin to other players.")
                .translation("config.skinkokk.enabled").define("enabled", true);
        SHOW_OTHERS = CLIENT.comment("Показывать скины из лаунчера у других игроков.", "Show launcher skins of other players.")
                .translation("config.skinkokk.showOthers").define("showOthers", true);
        SHOW_CAPES = CLIENT.comment("Показывать плащи из лаунчера.", "Show launcher capes.")
                .translation("config.skinkokk.showCapes").define("showCapes", true);
        POLL_TICKS = CLIENT.comment("Как часто проверять, не сменил ли ты скин в лаунчере (в тиках, 20 = 1 сек).", "How often to check for a new skin from the launcher (ticks).")
                .translation("config.skinkokk.pollTicks").defineInRange("pollTicks", 40, 10, 1200);
        NOTIFY = CLIENT.comment("Писать в чат, когда скин сменился.", "Chat message when your skin changes.")
                .translation("config.skinkokk.notify").define("notify", true);
        FOLDER = CLIENT.comment("Папка со скином относительно папки игры.", "Skin folder relative to the game directory.")
                .translation("config.skinkokk.folder").define("folder", "skinkokk");
        CLIENT.pop();
    }
    public static final ModConfigSpec CLIENT_SPEC = CLIENT.build();

    // ---------- сервер ----------
    private static final ModConfigSpec.Builder SERVER = new ModConfigSpec.Builder();
    public static final ModConfigSpec.BooleanValue ALLOW_SKINS;
    public static final ModConfigSpec.BooleanValue ALLOW_CAPES;
    public static final ModConfigSpec.BooleanValue PERSIST;
    public static final ModConfigSpec.IntValue COOLDOWN_SECONDS;

    static {
        SERVER.comment("Синхронизация скинов на сервере / server skin sync").push("server");
        ALLOW_SKINS = SERVER.comment("Разрешить свои скины.", "Allow custom skins.")
                .translation("config.skinkokk.allowSkins").define("allowSkins", true);
        ALLOW_CAPES = SERVER.comment("Разрешить свои плащи.", "Allow custom capes.")
                .translation("config.skinkokk.allowCapes").define("allowCapes", true);
        PERSIST = SERVER.comment("Сохранять скины игроков в папке мира, чтобы их видели, даже если хозяин скина офлайн-перезашёл.", "Store skins in the world folder.")
                .translation("config.skinkokk.persist").define("persist", true);
        COOLDOWN_SECONDS = SERVER.comment("Минимум секунд между сменами скина одним игроком.", "Minimum seconds between skin changes per player.")
                .translation("config.skinkokk.cooldown").defineInRange("cooldownSeconds", 2, 0, 600);
        SERVER.pop();
    }
    public static final ModConfigSpec SERVER_SPEC = SERVER.build();
}
