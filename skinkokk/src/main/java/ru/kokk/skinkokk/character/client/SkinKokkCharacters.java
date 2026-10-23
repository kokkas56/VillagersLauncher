package ru.kokk.skinkokk.character.client;

import com.mojang.blaze3d.vertex.PoseStack;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import javax.annotation.Nullable;
import net.minecraft.client.Minecraft;
import net.minecraft.client.model.PlayerModel;
import net.minecraft.client.multiplayer.PlayerInfo;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.item.ArmorItem;
import net.minecraft.world.item.ElytraItem;
import net.minecraft.world.item.ItemStack;
import ru.kokk.skinkokk.character.CharacterConfig;
import ru.kokk.skinkokk.character.CharacterData;

/**
 * Открытый API персонажей для других модов (только клиент). Простые статические методы — удобно звать по рефлексии;
 * так делает лобби KokkHUD: берёт JSON персонажа (из лаунчера или отсюда), ставит телосложение на свою модель игрока,
 * рисует её и потом просит дорисовать части.
 *
 * <pre>
 * String json = SkinKokkCharacters.local();                 // свой (файл от лаунчера), работает и в главном меню
 * boolean slim = SkinKokkCharacters.slim(json, skinSlim);   // какие руки
 * float r = SkinKokkCharacters.rootScale(json);             // рост: масштаб всей фигуры от ступней
 * float[] undo = SkinKokkCharacters.applyBody(model, json); // после позы, до рисования тела
 * ... нарисовать тело ...
 * SkinKokkCharacters.renderParts(model, ps, buf, json, skin, light, color, age, "key", walking, head, chest);
 * SkinKokkCharacters.undoBody(model, undo);
 * </pre>
 */
public final class SkinKokkCharacters {
    private SkinKokkCharacters() {}

    private static final Map<String, CharacterData> PARSED = new LinkedHashMap<>(16, 0.75F, true);

    @Nullable
    private static CharacterData parse(@Nullable String json) {
        if (json == null || json.isEmpty()) return null;
        CharacterData d = PARSED.get(json);
        if (d == null) {
            d = CharacterData.parse(json);
            if (d == null) return null;
            PARSED.put(json, d);
            while (PARSED.size() > 32) {
                var it = PARSED.entrySet().iterator();
                it.next();
                it.remove();
            }
        }
        return d.on ? d : null;
    }

    public static boolean available() {
        return true;
    }

    /** Персонаж игрока по UUID (пришёл с сервера; свой — из файла), JSON или null. */
    @Nullable
    public static String get(UUID id) {
        CharacterClient.Entry e = CharacterClient.get(id);
        return e == null ? null : e.json();
    }

    /** По нику: свой — из файла, другие — среди игроков текущего сервера. */
    @Nullable
    public static String get(String nick) {
        if (nick == null || nick.isBlank()) return null;
        Minecraft mc = Minecraft.getInstance();
        if (nick.equalsIgnoreCase(mc.getUser().getName())) return local();
        if (mc.getConnection() != null) {
            for (PlayerInfo pi : mc.getConnection().getOnlinePlayers()) {
                if (pi.getProfile().getName().equalsIgnoreCase(nick)) return get(pi.getProfile().getId());
            }
        }
        return null;
    }

    /** Свой персонаж из файла skinkokk/character.json (null — нет или выключен). */
    @Nullable
    public static String local() {
        CharacterClient.Entry e = CharacterClient.local();
        return e == null ? null : e.json();
    }

    /** Тонкие ли руки (с учётом выбора персонажа). */
    public static boolean slim(@Nullable String json, boolean skinSlim) {
        CharacterData d = parse(json);
        if (d == null) return skinSlim;
        return switch (d.arms) {
            case "slim" -> true;
            case "wide" -> false;
            default -> skinSlim;
        };
    }

    /** Общий рост (1 — как обычно). */
    public static float rootScale(@Nullable String json) {
        CharacterData d = parse(json);
        return d == null ? 1F : Proportions.root(d);
    }

    /** Поставить телосложение на модель (после позы). Вернёт запись для {@link #undoBody}. */
    @Nullable
    public static float[] applyBody(PlayerModel<?> model, @Nullable String json) {
        CharacterData d = parse(json);
        return d == null ? null : Proportions.apply(model, d, null);
    }

    public static void undoBody(PlayerModel<?> model, @Nullable float[] undo) {
        Proportions.undo(model, undo);
    }

    /** Спрятать ли второй слой головы скина (под причёской персонажа; лицо дорисует {@link #renderParts}). */
    public static boolean hideHatLayer(@Nullable String json, ItemStack head) {
        try {
            return CharRender.hideHatLayer(parse(json), true, head);
        } catch (RuntimeException e) {
            return false;
        }
    }

    /**
     * Дорисовать части персонажа на уже нарисованной модели (поза модели — та, что сейчас стоит). key — кто это
     * (для физики), age — его возраст в тиках с долей, walking — идёт ли (шаг для пружин). head/chest — что надето
     * (шлем прячет уши и волосы, нагрудник — грудь по настройке), можно ItemStack.EMPTY.
     */
    public static void renderParts(PlayerModel<?> model, PoseStack ps, MultiBufferSource buf, @Nullable String json, ResourceLocation skin, int light, int color,
                                   float ageTicks, String key, boolean walking, ItemStack head, ItemStack chest) {
        CharacterData d = parse(json);
        if (d == null) return;
        try {
            CharModel cm = CharModel.of(d, json);
            boolean plate = chest != null && chest.getItem() instanceof ArmorItem ai && ai.getType() == ArmorItem.Type.CHESTPLATE;
            boolean showChest = cm.hasChest && !(plate && CharacterConfig.CHEST_ARMOR.get() == CharacterConfig.ChestArmor.HIDE);
            boolean armourChest = plate && CharacterConfig.CHEST_ARMOR.get() == CharacterConfig.ChestArmor.ARMOR;
            boolean hideHead = head != null && !head.isEmpty() && CharacterConfig.HIDE_UNDER_HELMET.get();
            CharRender.Opts o = new CharRender.Opts(true, showChest, true, hideHead, chest != null && chest.getItem() instanceof ElytraItem, plate,
                    armourChest ? chest : ItemStack.EMPTY, true, false);
            CharPhysics.Body phys = CharPhysics.lobby(key == null ? "?" : key, cm, ageTicks, walking, CharacterConfig.PHYSICS_STRENGTH.get().floatValue());
            CharRender.render(model, ps, buf, cm, skin, light, OverlayTexture.NO_OVERLAY, color, phys, ageTicks - (float) Math.floor(ageTicks), o, null);
        } catch (RuntimeException e) {
            CharRender.warnOnce("lobby character", e);
        }
    }
}
