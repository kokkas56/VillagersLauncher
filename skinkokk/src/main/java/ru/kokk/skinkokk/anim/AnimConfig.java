package ru.kokk.skinkokk.anim;

import java.util.List;

import net.neoforged.fml.ModContainer;
import net.neoforged.fml.config.ModConfig;
import net.neoforged.neoforge.common.ModConfigSpec;

/** Настройки анимаций: клиент (skinkokk-anim-client.toml) и сервер (serverconfig/skinkokk-anim-server.toml). */
public final class AnimConfig {
    private AnimConfig() {}

    // ---------- клиент ----------
    private static final ModConfigSpec.Builder C = new ModConfigSpec.Builder();
    public static final ModConfigSpec.BooleanValue ENABLED;
    public static final ModConfigSpec.BooleanValue SHOW_OTHERS_EMOTES;
    public static final ModConfigSpec.BooleanValue EVENTS_SOUND;
    public static final ModConfigSpec.BooleanValue EVENTS_PARTICLES;
    public static final ModConfigSpec.BooleanValue ROOT_MOVES;
    public static final ModConfigSpec.BooleanValue FIRST_PERSON;
    public static final ModConfigSpec.BooleanValue BONES_SHOW;
    public static final ModConfigSpec.IntValue BONES_DISTANCE;
    public static final ModConfigSpec.IntValue WHEEL_PER_PAGE;
    public static final ModConfigSpec.ConfigValue<List<? extends String>> FAVORITES;

    static {
        C.comment("Анимации SkinKokk / SkinKokk animations").push("anim");
        ENABLED = C.comment("Показывать анимации (жесты, эмоции, позы из сцен).", "Show animations (gestures, emotes, scene poses).")
                .translation("config.skinkokk.anim.enabled").define("enabled", true);
        SHOW_OTHERS_EMOTES = C.comment("Показывать эмоции других игроков.", "Show other players' emotes.")
                .translation("config.skinkokk.anim.showOthers").define("showOthersEmotes", true);
        EVENTS_SOUND = C.comment("Звуки из анимаций (хлопки, стук молотка…).", "Sounds from animations.")
                .translation("config.skinkokk.anim.sounds").define("sounds", true);
        EVENTS_PARTICLES = C.comment("Частицы из анимаций (слёзы, искры…).", "Particles from animations.")
                .translation("config.skinkokk.anim.particles").define("particles", true);
        ROOT_MOVES = C.comment("Анимации могут двигать всё тело (присесть, лечь, подпрыгнуть).", "Animations may move the whole body (sit, lie down, jump).")
                .translation("config.skinkokk.anim.root").define("wholeBody", true);
        FIRST_PERSON = C.comment("Не трогать руки от первого лица (рекомендуется).", "Keep first-person hands untouched (recommended).")
                .translation("config.skinkokk.anim.firstPerson").define("keepFirstPersonHands", true);
        BONES_SHOW = C.comment("Показывать предметы и кубики из анимаций (свои кости: меч в руке, факел, коробка…). Видны, только пока играет анимация.",
                        "Show items and cubes from animations (custom bones: a sword in hand, a torch, a box…).")
                .translation("config.skinkokk.anim.customBones").define("customBones", true);
        BONES_DISTANCE = C.comment("До какого расстояния (в блоках) рисовать предметы и кубики анимаций.", "Max distance (blocks) to draw animation items and cubes.")
                .translation("config.skinkokk.anim.customBonesDistance").defineInRange("customBonesDistance", 48, 4, 256);
        WHEEL_PER_PAGE = C.comment("Сколько эмоций на одной странице колеса.", "Emotes per wheel page.")
                .translation("config.skinkokk.anim.wheelPerPage").defineInRange("wheelPerPage", 8, 4, 12);
        FAVORITES = C.comment("Эмоции на первой странице колеса (id по порядку). Пусто — все по группам.", "Emotes on the first wheel page (ids). Empty — all by group.")
                .translation("config.skinkokk.anim.favorites").defineListAllowEmpty("favorites", List.of("wave", "nod", "bow", "cheer", "clap", "shrug", "dance", "sit"), () -> "", o -> o instanceof String);
        C.pop();
    }
    public static final ModConfigSpec CLIENT_SPEC = C.build();

    // ---------- сервер ----------
    private static final ModConfigSpec.Builder S = new ModConfigSpec.Builder();
    public static final ModConfigSpec.BooleanValue ALLOW_EMOTES;
    public static final ModConfigSpec.BooleanValue STOP_EMOTE_ON_MOVE;
    public static final ModConfigSpec.ConfigValue<List<? extends String>> LOCKED_EMOTES;
    public static final ModConfigSpec.ConfigValue<String> FOLDER;
    public static final ModConfigSpec.IntValue OP_LEVEL;
    public static final ModConfigSpec.IntValue EMOTE_COOLDOWN;

    static {
        S.comment("Анимации SkinKokk на сервере / server animations").push("anim");
        ALLOW_EMOTES = S.comment("Игроки могут включать эмоции (колесо, /emote).", "Players may use emotes.")
                .translation("config.skinkokk.anim.allowEmotes").define("allowEmotes", true);
        STOP_EMOTE_ON_MOVE = S.comment("Эмоция игрока прерывается, когда он пошёл.", "A player's emote stops when he walks.")
                .translation("config.skinkokk.anim.stopOnMove").define("stopEmoteOnMove", true);
        LOCKED_EMOTES = S.comment("Закрытые эмоции (id): их нельзя включить из колеса, только командой или сценой.", "Locked emotes (ids).")
                .translation("config.skinkokk.anim.locked").defineListAllowEmpty("lockedEmotes", List.of(), () -> "", o -> o instanceof String);
        FOLDER = S.comment("Папка анимаций сервера относительно папки игры («Собрать» Студии кладёт их сюда).", "Server animation folder.")
                .translation("config.skinkokk.anim.folder").define("folder", "config/skinkokk/anims");
        OP_LEVEL = S.comment("Уровень оператора для /skinkokk anim play на других.", "Op level for playing animations on others.")
                .translation("config.skinkokk.anim.opLevel").defineInRange("opLevel", 2, 0, 4);
        EMOTE_COOLDOWN = S.comment("Пауза между эмоциями одного игрока (тики).", "Cooldown between emotes (ticks).")
                .translation("config.skinkokk.anim.cooldown").defineInRange("emoteCooldown", 10, 0, 1200);
        S.pop();
    }
    public static final ModConfigSpec SERVER_SPEC = S.build();

    /** Из конструктора мода (SkinKokk): свои файлы настроек рядом с основными. */
    public static void init(ModContainer container) {
        container.registerConfig(ModConfig.Type.CLIENT, CLIENT_SPEC, "skinkokk-anim-client.toml");
        container.registerConfig(ModConfig.Type.SERVER, SERVER_SPEC, "skinkokk-anim-server.toml");
    }

    static boolean get(ModConfigSpec.BooleanValue v, boolean def) {
        try {
            return v.get();
        } catch (RuntimeException e) {
            return def;
        }
    }

    static int get(ModConfigSpec.IntValue v, int def) {
        try {
            return v.get();
        } catch (RuntimeException e) {
            return def;
        }
    }
}
