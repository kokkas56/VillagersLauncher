package ru.kokk.skinkokk.character;

import net.neoforged.neoforge.common.ModConfigSpec;

/**
 * Настройки персонажей. Клиент — что ТЫ видишь у себя (у каждого игрока свои: можно выключить грудь/физику у других),
 * сервер — что вообще разрешено на сервере. Файлы: config/skinkokk-character-client.toml и
 * &lt;мир&gt;/serverconfig/skinkokk-character-server.toml.
 */
public final class CharacterConfig {
    private CharacterConfig() {}

    public enum ChestArmor { ARMOR, HIDE, SHOW }

    // ---------- клиент ----------
    private static final ModConfigSpec.Builder CLIENT = new ModConfigSpec.Builder();
    public static final ModConfigSpec.BooleanValue SEND_OWN;
    public static final ModConfigSpec.BooleanValue SHOW_OWN;
    public static final ModConfigSpec.BooleanValue SHOW_OTHERS;
    public static final ModConfigSpec.BooleanValue SHOW_OTHERS_CHEST;
    public static final ModConfigSpec.BooleanValue SHOW_OTHERS_BODY;
    public static final ModConfigSpec.BooleanValue OWN_PHYSICS;
    public static final ModConfigSpec.BooleanValue OTHERS_PHYSICS;
    public static final ModConfigSpec.DoubleValue PHYSICS_STRENGTH;
    public static final ModConfigSpec.BooleanValue ARMS_OVERRIDE;
    public static final ModConfigSpec.BooleanValue HIDE_UNDER_HELMET;
    public static final ModConfigSpec.EnumValue<ChestArmor> CHEST_ARMOR;
    public static final ModConfigSpec.BooleanValue BACKPACK_HIDES_CLOAK;
    public static final ModConfigSpec.BooleanValue BACKPACK_HIDES_HAIR;
    public static final ModConfigSpec.BooleanValue BACKPACK_HIDES_TAIL;
    public static final ModConfigSpec.IntValue RENDER_DISTANCE;
    public static final ModConfigSpec.IntValue PHYSICS_DISTANCE;
    public static final ModConfigSpec.BooleanValue NOTIFY;

    static {
        CLIENT.comment("Персонажи из VillagersLauncher (уши, хвосты, причёски, одежда, телосложение). Это то, что видишь ТЫ.",
                "Characters from VillagersLauncher: what YOU see.").push("character");
        SEND_OWN = CLIENT.comment("Отправлять своего персонажа (файл skinkokk/character.json от лаунчера) другим игрокам.",
                "Send your own character to other players.").translation("config.skinkokk.character.sendOwn").define("sendOwn", true);
        SHOW_OWN = CLIENT.comment("Показывать своего персонажа (у себя).", "Show your own character.")
                .translation("config.skinkokk.character.showOwn").define("showOwn", true);
        SHOW_OTHERS = CLIENT.comment("Показывать части персонажей других игроков (уши, хвосты, причёски, одежду).", "Show other players' character parts.")
                .translation("config.skinkokk.character.showOthers").define("showOthers", true);
        SHOW_OTHERS_CHEST = CLIENT.comment("Показывать грудь у женских персонажей других игроков. Выключи — и у других её не будет видно только у тебя.",
                "Show breasts of other players' female characters (only on your screen).").translation("config.skinkokk.character.showOthersChest")
                .define("showOthersChest", true);
        SHOW_OTHERS_BODY = CLIENT.comment("Показывать телосложение других (крепкий, стройный, рост, женская фигура). Хитбокс от этого никогда не меняется.",
                "Show other players' body proportions (hitbox never changes).").translation("config.skinkokk.character.showOthersBody")
                .define("showOthersBody", true);
        OWN_PHYSICS = CLIENT.comment("Физика (покачивание хвоста, волос, груди, плаща) у своего персонажа.", "Spring physics on your own character.")
                .translation("config.skinkokk.character.ownPhysics").define("ownPhysics", true);
        OTHERS_PHYSICS = CLIENT.comment("Физика у персонажей других игроков (выключи — части будут неподвижными).", "Spring physics on other characters.")
                .translation("config.skinkokk.character.othersPhysics").define("othersPhysics", true);
        PHYSICS_STRENGTH = CLIENT.comment("Сила физики на твоём экране: 0 — всё неподвижно, 1 — как задумано, 2 — вдвое сильнее.",
                "Physics strength multiplier on your screen.").translation("config.skinkokk.character.physicsStrength")
                .defineInRange("physicsStrength", 1.0, 0.0, 2.0);
        ARMS_OVERRIDE = CLIENT.comment("Учитывать выбор рук персонажа («тонкие 3 px» / «обычные 4 px») — и в руках от первого лица.",
                "Use the character's arm choice (slim/wide), first person too.").translation("config.skinkokk.character.armsOverride")
                .define("armsOverride", true);
        HIDE_UNDER_HELMET = CLIENT.comment("Прятать уши, причёску, капюшон и украшения головы, когда надет шлем (или что-то на голове).",
                "Hide ears/hair/hood under a helmet.").translation("config.skinkokk.character.hideUnderHelmet").define("hideUnderHelmet", true);
        CHEST_ARMOR = CLIENT.comment("Грудь под нагрудником: ARMOR — повторяет броню, HIDE — прятать, SHOW — как без брони.",
                "Breasts with a chestplate: ARMOR (armour-textured), HIDE, SHOW.").translation("config.skinkokk.character.chestArmor")
                .defineEnum("chestArmor", ChestArmor.ARMOR);
        BACKPACK_HIDES_CLOAK = CLIENT.comment("С рюкзаком (StorageKokk) прятать плащ и накидку капюшона — иначе они торчат сквозь рюкзак.",
                "Hide the cloak and hood drape while a backpack is worn.").translation("config.skinkokk.character.backpackHidesCloak")
                .define("backpackHidesCloak", true);
        BACKPACK_HIDES_HAIR = CLIENT.comment("С рюкзаком прятать длинные волосы сзади (пряди на спине).", "Hide long back hair while a backpack is worn.")
                .translation("config.skinkokk.character.backpackHidesHair").define("backpackHidesHair", true);
        BACKPACK_HIDES_TAIL = CLIENT.comment("С рюкзаком прятать хвост (обычно он торчит снизу и не мешает).", "Hide the tail while a backpack is worn.")
                .translation("config.skinkokk.character.backpackHidesTail").define("backpackHidesTail", false);
        RENDER_DISTANCE = CLIENT.comment("Дальше скольких блоков части персонажей не рисуются (экономия FPS).", "Max distance to draw character parts.")
                .translation("config.skinkokk.character.renderDistance").defineInRange("renderDistance", 64, 8, 256);
        PHYSICS_DISTANCE = CLIENT.comment("Дальше скольких блоков физика не считается (части просто неподвижны).", "Max distance for physics.")
                .translation("config.skinkokk.character.physicsDistance").defineInRange("physicsDistance", 32, 4, 128);
        NOTIFY = CLIENT.comment("Писать в углу экрана, когда персонаж обновился из лаунчера.", "Notify when your character changes.")
                .translation("config.skinkokk.character.notify").define("notify", true);
        CLIENT.pop();
    }
    public static final ModConfigSpec CLIENT_SPEC = CLIENT.build();

    // ---------- сервер ----------
    private static final ModConfigSpec.Builder SERVER = new ModConfigSpec.Builder();
    public static final ModConfigSpec.BooleanValue ALLOW;
    public static final ModConfigSpec.BooleanValue ALLOW_PARTS;
    public static final ModConfigSpec.BooleanValue ALLOW_CHEST;
    public static final ModConfigSpec.BooleanValue ALLOW_BODY;
    public static final ModConfigSpec.BooleanValue PERSIST;
    public static final ModConfigSpec.IntValue COOLDOWN_SECONDS;

    static {
        SERVER.comment("Персонажи игроков на сервере / characters on the server").push("character");
        ALLOW = SERVER.comment("Разрешить персонажей вообще.", "Allow characters at all.")
                .translation("config.skinkokk.character.allow").define("allow", true);
        ALLOW_PARTS = SERVER.comment("Разрешить уши, хвосты, причёски и одежду.", "Allow ears, tails, hair, clothes.")
                .translation("config.skinkokk.character.allowParts").define("allowParts", true);
        ALLOW_CHEST = SERVER.comment("Разрешить грудь у женских персонажей.", "Allow breasts on female characters.")
                .translation("config.skinkokk.character.allowChest").define("allowChest", true);
        ALLOW_BODY = SERVER.comment("Разрешить телосложение и рост (только вид; хитбокс не меняется).", "Allow body proportions (visual only).")
                .translation("config.skinkokk.character.allowBody").define("allowBody", true);
        PERSIST = SERVER.comment("Помнить персонажей в папке мира (skinkokk/characters).", "Store characters in the world folder.")
                .translation("config.skinkokk.character.persist").define("persist", true);
        COOLDOWN_SECONDS = SERVER.comment("Минимум секунд между сменами персонажа одним игроком.", "Minimum seconds between character changes.")
                .translation("config.skinkokk.character.cooldown").defineInRange("cooldownSeconds", 1, 0, 600);
        SERVER.pop();
    }
    public static final ModConfigSpec SERVER_SPEC = SERVER.build();
}
