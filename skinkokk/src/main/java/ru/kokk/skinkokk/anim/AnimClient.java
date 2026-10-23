package ru.kokk.skinkokk.anim;

import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;

import com.google.gson.JsonParser;

import net.minecraft.client.Minecraft;
import net.minecraft.core.particles.ParticleType;
import net.minecraft.core.particles.SimpleParticleType;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.client.event.ClientPlayerNetworkEvent;
import net.neoforged.neoforge.client.event.ClientTickEvent;
import ru.kokk.skinkokk.SkinKokk;

/**
 * Клиент: что сейчас играет у каждого существа (по пакетам сервера), поза в момент кадра, звуки и частицы из событий.
 * Время — свой счётчик тиков клиента (идёт и в замороженном мире редактора Студии, стоит на паузе).
 */
@EventBusSubscriber(modid = SkinKokk.MOD_ID, value = Dist.CLIENT)
public final class AnimClient {
    private AnimClient() {}

    static final class Inst {
        String id;
        double start;
        boolean loop;
        float speed = 1;
        float hold = -1;
        double stopAt = -1;
        float lastT = -1;
    }

    /** Поза кадра: значения костей (градусы, пиксели, множители) и вес. */
    public static final class Pose {
        public AnimDef def;
        public float t, w;
        /** кость → {rot[3] | null, pos[3] | null, scale[3] | null} */
        public final Map<String, float[][]> bones = new HashMap<>();

        public float[][] get(String bone) {
            return bones.get(bone);
        }
    }

    private static final Map<Integer, Inst> INST = new HashMap<>();
    private static long ticks;

    static double now(float partial) {
        return ticks + partial;
    }

    // ---------- пакеты ----------
    static void onPlay(AnimNet.Play p) {
        Inst cur = INST.get(p.entity());
        if (p.stop()) {
            if (cur != null && cur.stopAt < 0) cur.stopAt = now(0);
            return;
        }
        if (cur != null && cur.id.equals(p.id()) && cur.stopAt < 0 && (p.hold() >= 0 || cur.hold >= 0)) {
            cur.hold = p.hold(); // бегунок Студии: та же анимация, другой момент — без нового входа
            if (p.hold() < 0) cur.start = now(0);
            return;
        }
        Inst i = new Inst();
        i.id = p.id();
        i.loop = p.loop();
        i.speed = p.speed() > 0 ? p.speed() : 1;
        i.hold = p.hold();
        i.start = now(0) - p.offset() / i.speed;
        INST.put(p.entity(), i);
    }

    static void onDef(AnimNet.Def p) {
        if (p.reset()) AnimLibrary.clientClear();
        if (p.id().equals("-")) return;
        if (p.json().isEmpty()) {
            AnimLibrary.clientRemove(p.id());
            return;
        }
        try {
            AnimLibrary.clientPut(AnimDef.parse(JsonParser.parseString(p.json()).getAsJsonObject(), p.id(), false));
        } catch (RuntimeException ex) {
            SkinKokk.LOGGER.warn("[SkinKokk] animation {} from server not read: {}", p.id(), ex.toString());
        }
    }

    @SubscribeEvent
    public static void loggingOut(ClientPlayerNetworkEvent.LoggingOut e) {
        INST.clear();
        AnimLibrary.clientClear();
    }

    // ---------- время и вес ----------
    /** out[0] = t, out[1] = w; false — анимация кончилась. */
    static boolean state(Inst i, AnimDef d, double now, float[] out) {
        double el = (now - i.start) * i.speed * d.speed;
        float w;
        float t;
        if (i.hold >= 0) {
            t = Math.min(i.hold, d.length);
            w = 1;
        } else if (i.loop) {
            t = (float) (el % d.length);
            w = d.blendIn > 0 && el < d.blendIn ? Ease.blend((float) (el / d.blendIn)) : 1;
        } else {
            if (el >= d.length && !d.stay) return false;
            t = (float) Math.min(el, d.length);
            w = d.blendIn > 0 && el < d.blendIn ? Ease.blend((float) (el / d.blendIn)) : 1;
            if (!d.stay && d.blendOut > 0) w = Math.min(w, Ease.blend((float) ((d.length - el) / d.blendOut)));
        }
        if (i.stopAt >= 0) {
            float f = 1 - (float) ((now - i.stopAt) / Math.max(1, d.blendOut));
            if (f <= 0) return false;
            w *= Ease.blend(f);
        }
        out[0] = t;
        out[1] = Math.max(0, Math.min(1, w));
        return true;
    }

    static boolean hidden(Entity e, AnimDef d) {
        if (!AnimConfig.get(AnimConfig.ENABLED, true)) return true;
        Minecraft mc = Minecraft.getInstance();
        return d.emote && e instanceof Player && e != mc.player && !AnimConfig.get(AnimConfig.SHOW_OTHERS_EMOTES, true);
    }

    /** Поза существа в этот кадр (null — ничего не играет). */
    public static Pose pose(Entity e, float partial) {
        if (e == null || INST.isEmpty()) return null;
        Inst i = INST.get(e.getId());
        if (i == null) return null;
        AnimDef d = AnimLibrary.client(i.id);
        if (d == null || hidden(e, d)) return null;
        float[] tw = new float[2];
        if (!state(i, d, now(partial), tw)) return null;
        Pose p = new Pose();
        p.def = d;
        p.t = tw[0];
        p.w = tw[1];
        for (Map.Entry<String, AnimDef.Track> en : d.tracks.entrySet()) {
            float[][] v = new float[3][];
            for (int c = 0; c < 3; c++) {
                AnimDef.Chan ch = en.getValue().ch[c];
                if (ch == null) continue;
                v[c] = new float[3];
                ch.sample(p.t, v[c]);
            }
            p.bones.put(en.getKey(), v);
        }
        return p;
    }

    /**
     * Для деталей персонажа (трек «Персонаж», через reflection): поворот (рад), сдвиг (пикс.), размер кости bone
     * с учётом веса — {rx, ry, rz, px, py, pz, sx, sy, sz}; null — у кости нет ключей.
     */
    public static float[] extra(LivingEntity e, String bone, float partialTick) {
        Pose p = pose(e, partialTick);
        if (p == null) return null;
        float[][] v = p.get(bone);
        if (v == null) return null;
        float w = p.w;
        float[] o = new float[] {0, 0, 0, 0, 0, 0, 1, 1, 1};
        for (int c = 0; c < 3; c++) {
            if (v[0] != null) o[c] = (float) Math.toRadians(v[0][c]) * w;
            if (v[1] != null) o[3 + c] = v[1][c] * w;
            if (v[2] != null) o[6 + c] = 1 + (v[2][c] - 1) * w;
        }
        return o;
    }

    /** Параметры пружин кости на время анимации (NaN — не менять); null — анимация их не трогает. */
    public static float[] springOverride(Entity e, String bone) {
        Inst i = INST.get(e.getId());
        if (i == null) return null;
        AnimDef d = AnimLibrary.client(i.id);
        return d == null ? null : d.springs.get(bone);
    }

    /** Что играет у существа (id) — для других модов на клиенте. */
    public static String playing(Entity e) {
        Inst i = e == null ? null : INST.get(e.getId());
        return i == null ? null : i.id;
    }

    // ---------- тик: конец, события ----------
    @SubscribeEvent
    public static void tick(ClientTickEvent.Post e) {
        Minecraft mc = Minecraft.getInstance();
        if (mc.level == null) {
            if (!INST.isEmpty()) INST.clear();
            return;
        }
        if (!mc.isPaused()) ticks++;
        if (INST.isEmpty()) return;
        float[] tw = new float[2];
        boolean snd = AnimConfig.get(AnimConfig.EVENTS_SOUND, true), prt = AnimConfig.get(AnimConfig.EVENTS_PARTICLES, true);
        for (Iterator<Map.Entry<Integer, Inst>> it = INST.entrySet().iterator(); it.hasNext();) {
            Map.Entry<Integer, Inst> en = it.next();
            Inst i = en.getValue();
            Entity ent = mc.level.getEntity(en.getKey());
            AnimDef d = AnimLibrary.client(i.id);
            if (ent == null || d == null || !state(i, d, now(0), tw)) {
                it.remove();
                continue;
            }
            float t = tw[0];
            if (i.hold < 0 && i.stopAt < 0 && !d.events.isEmpty() && (snd || prt) && !hidden(ent, d)) {
                for (AnimDef.Event ev : d.events) {
                    boolean hit = i.lastT < 0 ? ev.t <= t && ev.t >= 0 && t - ev.t < 1.01f : i.lastT <= t ? ev.t > i.lastT && ev.t <= t : ev.t > i.lastT || ev.t <= t;
                    if (!hit) continue;
                    if (ev.kind.equals("sound") && snd) sound(mc, ent, ev);
                    else if (ev.kind.equals("particle") && prt) particle(mc, ent, ev);
                }
            }
            i.lastT = t;
        }
    }

    private static void sound(Minecraft mc, Entity e, AnimDef.Event ev) {
        ResourceLocation rl = ResourceLocation.tryParse(ev.value);
        if (rl == null) return;
        SoundEvent s = BuiltInRegistries.SOUND_EVENT.get(rl);
        if (s == null) s = SoundEvent.createVariableRangeEvent(rl);
        mc.level.playLocalSound(e.getX(), e.getY() + e.getBbHeight() * 0.6, e.getZ(), s, SoundSource.NEUTRAL, Mth.clamp(ev.vol, 0, 2), Mth.clamp(ev.pitch, 0.5f, 2f), false);
    }

    private static void particle(Minecraft mc, Entity e, AnimDef.Event ev) {
        ResourceLocation rl = ResourceLocation.tryParse(ev.value);
        if (rl == null) return;
        ParticleType<?> type = BuiltInRegistries.PARTICLE_TYPE.get(rl);
        if (!(type instanceof SimpleParticleType spt)) return;
        double h = e.getBbHeight();
        double x = e.getX(), y = e.getY(), z = e.getZ();
        float yaw = (float) Math.toRadians(e instanceof LivingEntity le ? le.yBodyRot : e.getYRot());
        switch (ev.bone) {
            case "head" -> y += h * 0.9;
            case "body" -> y += h * 0.6;
            case "right_arm", "left_arm" -> {
                double side = ev.bone.equals("right_arm") ? -0.35 : 0.35;
                x += Math.cos(yaw) * side;
                z += Math.sin(yaw) * side;
                y += h * 0.65;
            }
            default -> y += 0.1;
        }
        for (int k = 0; k < ev.count; k++) {
            double s = ev.spread;
            mc.level.addParticle(spt, x + (Math.random() - 0.5) * s, y + (Math.random() - 0.5) * s, z + (Math.random() - 0.5) * s, 0, 0.02, 0);
        }
    }
}
