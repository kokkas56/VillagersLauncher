package ru.kokk.skinkokk.anim;

import java.util.function.BiConsumer;

import net.minecraft.world.entity.Entity;

/**
 * Мягкий API анимаций для других модов (Kokk Story, Villagers, Kokk) — только статические методы и простые типы,
 * удобно звать через reflection: {@code Class.forName("ru.kokk.skinkokk.anim.KokkAnimApi")}. Всё — на сервере.
 */
public final class KokkAnimApi {
    private KokkAnimApi() {}

    /** Версия API (растёт с новыми методами). */
    public static int version() {
        return 1;
    }

    public static boolean available() {
        return true;
    }

    /** Есть ли анимация с таким id (встроенная, из config/skinkokk/anims или живая). */
    public static boolean has(String id) {
        return AnimLibrary.server(id) != null;
    }

    public static String[] ids() {
        return AnimLibrary.serverIds().toArray(new String[0]);
    }

    /** Длина в тиках (0 — нет такой). */
    public static int length(String id) {
        AnimDef d = AnimLibrary.server(id);
        return d == null ? 0 : d.length;
    }

    /** По кругу ли / остаётся ли в конце. */
    public static boolean loops(String id) {
        AnimDef d = AnimLibrary.server(id);
        return d != null && (d.loop || d.stay);
    }

    public static boolean play(Entity e, String id) {
        return AnimServer.play(e, id, false, 1);
    }

    public static boolean play(Entity e, String id, boolean loop, float speed) {
        return AnimServer.play(e, id, loop, speed);
    }

    /** Замереть на тике t (Студия: бегунок). */
    public static boolean hold(Entity e, String id, float t) {
        return AnimServer.hold(e, id, t);
    }

    public static void stop(Entity e) {
        AnimServer.stop(e);
    }

    public static boolean playing(Entity e) {
        return AnimServer.playingId(e) != null;
    }

    public static String playingId(Entity e) {
        return AnimServer.playingId(e);
    }

    /** Добавить или заменить анимацию (JSON формата Студии), разослать всем. null — хорошо, иначе ошибка по-русски. */
    public static String register(String json) {
        return AnimServer.register(json);
    }

    public static boolean unregister(String id) {
        return AnimServer.unregister(id);
    }

    /** Перечитать config/skinkokk/anims. Возвращает число проблем. */
    public static int reload() {
        return AnimServer.reload(null).size();
    }

    /** События анимации на сервере: ("signal:<имя>" | "face:<лицо>"). */
    public static void setEventHook(BiConsumer<Entity, String> hook) {
        AnimServer.eventHook = hook;
    }
}
