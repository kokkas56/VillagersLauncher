package ru.kokk.skinkokk.anim;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;
import java.util.concurrent.ConcurrentHashMap;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import ru.kokk.skinkokk.SkinKokk;

/**
 * Библиотека анимаций. Встроенные — в моде (assets/skinkokk/anims/*.json, список — index.json). Поверх них:
 * на сервере — config/skinkokk/anims/*.json («Собрать» Студии) и живые из Студии; на клиенте — то же, что прислал сервер.
 * Карты сервера и клиента раздельные (в одиночной игре они в одной JVM).
 */
public final class AnimLibrary {
    private AnimLibrary() {}

    private static final Map<String, AnimDef> BUILTIN = new ConcurrentHashMap<>();
    /** Сервер: из папки config. */
    private static final Map<String, AnimDef> SERVER_FILES = new ConcurrentHashMap<>();
    /** Сервер: живые (Студия, другие моды через KokkAnimApi.register). */
    private static final Map<String, AnimDef> SERVER_LIVE = new ConcurrentHashMap<>();
    /** Клиент: присланные сервером. */
    private static final Map<String, AnimDef> CLIENT = new ConcurrentHashMap<>();
    /** Клиент вне мира (лобби, меню): свои файлы — config/skinkokk/anims и проект Студии у автора. */
    private static final Map<String, AnimDef> LOCAL = new ConcurrentHashMap<>();
    /** Клиент сейчас вне мира — тогда {@link #LOCAL} поверх встроенных (ставит AnimClient). */
    static volatile boolean useLocal;
    private static volatile boolean builtinsLoaded;

    public static void ensureBuiltins() {
        if (builtinsLoaded) return;
        synchronized (AnimLibrary.class) {
            if (builtinsLoaded) return;
            int n = 0;
            try (InputStream in = AnimLibrary.class.getResourceAsStream("/assets/skinkokk/anims/index.json")) {
                if (in != null) {
                    JsonObject idx = JsonParser.parseReader(new InputStreamReader(in, StandardCharsets.UTF_8)).getAsJsonObject();
                    for (JsonElement e : idx.getAsJsonArray("anims")) {
                        String id = e.getAsString();
                        try (InputStream a = AnimLibrary.class.getResourceAsStream("/assets/skinkokk/anims/" + id + ".json")) {
                            if (a == null) continue;
                            AnimDef d = AnimDef.parse(JsonParser.parseReader(new InputStreamReader(a, StandardCharsets.UTF_8)).getAsJsonObject(), id, true);
                            BUILTIN.put(d.id, d);
                            n++;
                        } catch (RuntimeException | IOException ex) {
                            SkinKokk.LOGGER.warn("[SkinKokk] built-in animation {} skipped: {}", id, ex.toString());
                        }
                    }
                }
            } catch (RuntimeException | IOException ex) {
                SkinKokk.LOGGER.warn("[SkinKokk] built-in animations not loaded: {}", ex.toString());
            }
            builtinsLoaded = true;
            SkinKokk.LOGGER.info("[SkinKokk] built-in animations: {}", n);
        }
    }

    // ---------- сервер ----------
    public static AnimDef server(String id) {
        ensureBuiltins();
        if (id == null) return null;
        AnimDef d = SERVER_LIVE.get(id);
        if (d == null) d = SERVER_FILES.get(id);
        return d != null ? d : BUILTIN.get(id);
    }

    /** Все, что сервер раздаёт клиентам (не встроенные — те у клиентов свои). */
    public static Collection<AnimDef> serverShared() {
        Map<String, AnimDef> m = new java.util.HashMap<>(SERVER_FILES);
        m.putAll(SERVER_LIVE);
        return m.values();
    }

    public static Collection<String> serverIds() {
        ensureBuiltins();
        TreeSet<String> s = new TreeSet<>(BUILTIN.keySet());
        s.addAll(SERVER_FILES.keySet());
        s.addAll(SERVER_LIVE.keySet());
        return s;
    }

    /** Прочитать папку config/skinkokk/anims. Возвращает список проблем (по-русски). */
    public static List<String> loadDir(Path dir) {
        return loadDirs(java.util.Collections.singletonList(dir));
    }

    /** Несколько папок: в следующей — поверх предыдущей (config, потом проект Студии). */
    public static List<String> loadDirs(List<Path> dirs) {
        Map<String, AnimDef> m = new java.util.HashMap<>();
        List<String> problems = new ArrayList<>();
        for (Path d : dirs) readDir(d, m, problems);
        SERVER_FILES.clear();
        SERVER_FILES.putAll(m);
        return problems;
    }

    /** Клиент: перечитать свои файлы (вне мира). */
    public static List<String> loadLocal(List<Path> dirs) {
        Map<String, AnimDef> m = new java.util.HashMap<>();
        List<String> problems = new ArrayList<>();
        for (Path d : dirs) readDir(d, m, problems);
        LOCAL.clear();
        LOCAL.putAll(m);
        return problems;
    }

    /**
     * Папка анимаций открытого проекта Студии — только у автора (есть &lt;игра&gt;/studio/.dev): studio/current → studio/projects/&lt;id&gt;/anims.
     * null — нет.
     */
    public static Path studioProjectDir(Path gameDir) {
        try {
            Path root = gameDir.resolve("studio");
            if (!Files.exists(root.resolve(".dev"))) return null;
            Path cur = root.resolve("current");
            if (!Files.isRegularFile(cur)) return null;
            String id = Files.readString(cur, StandardCharsets.UTF_8).trim();
            if (!id.matches("[a-z0-9_-]{1,64}")) return null;
            Path d = root.resolve("projects").resolve(id).resolve("anims");
            return Files.isDirectory(d) ? d : null;
        } catch (IOException | RuntimeException e) {
            return null;
        }
    }

    /** «Подпись» папок: имена, размеры и время файлов — чтобы заметить правку. */
    public static long signature(List<Path> dirs) {
        long h = 1;
        for (Path d : dirs) {
            h = h * 31 + (d == null ? 0 : d.hashCode());
            if (d == null || !Files.isDirectory(d)) continue;
            try (DirectoryStream<Path> ds = Files.newDirectoryStream(d, "*.json")) {
                for (Path f : ds) {
                    try {
                        h += f.getFileName().toString().hashCode() * 7L + Files.size(f) * 13L + Files.getLastModifiedTime(f).toMillis() * 17L;
                    } catch (IOException ignored) {
                        // файл пропал — следующая подпись заметит
                    }
                }
            } catch (IOException ignored) {
                // папка недоступна — как пустая
            }
        }
        return h;
    }

    private static void readDir(Path dir, Map<String, AnimDef> into, List<String> problems) {
        if (dir == null || !Files.isDirectory(dir)) return;
        try (DirectoryStream<Path> ds = Files.newDirectoryStream(dir, "*.json")) {
            for (Path f : ds) {
                String name = f.getFileName().toString();
                if (name.startsWith(".")) continue;
                String id = name.substring(0, name.length() - 5);
                try {
                    String text = Files.readString(f, StandardCharsets.UTF_8);
                    if (text.startsWith("﻿")) text = text.substring(1);
                    AnimDef d = AnimDef.parse(JsonParser.parseString(text).getAsJsonObject(), id, false);
                    into.put(d.id, d);
                } catch (RuntimeException | IOException ex) {
                    problems.add(name + ": " + ex.getMessage());
                }
            }
        } catch (IOException ex) {
            problems.add(dir + ": " + ex.getMessage());
        }
    }

    public static AnimDef putLive(AnimDef d) {
        SERVER_LIVE.put(d.id, d);
        return d;
    }

    public static boolean removeLive(String id) {
        return SERVER_LIVE.remove(id) != null;
    }

    public static void clearServer() {
        SERVER_FILES.clear();
        SERVER_LIVE.clear();
    }

    // ---------- клиент ----------
    public static AnimDef client(String id) {
        ensureBuiltins();
        if (id == null) return null;
        AnimDef d = CLIENT.get(id);
        if (d == null && useLocal) d = LOCAL.get(id);
        return d != null ? d : BUILTIN.get(id);
    }

    public static void clientPut(AnimDef d) {
        CLIENT.put(d.id, d);
    }

    public static void clientRemove(String id) {
        CLIENT.remove(id);
    }

    public static void clientClear() {
        CLIENT.clear();
    }

    /** Все анимации на клиенте (для колеса эмоций). */
    public static List<AnimDef> clientAll() {
        ensureBuiltins();
        Map<String, AnimDef> m = new java.util.TreeMap<>(BUILTIN);
        if (useLocal) m.putAll(LOCAL);
        m.putAll(CLIENT);
        return new ArrayList<>(m.values());
    }

    public static boolean isBuiltin(String id) {
        ensureBuiltins();
        return BUILTIN.containsKey(id);
    }
}
