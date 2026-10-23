package ru.kokk.skinkokk.character.client;

import java.lang.invoke.MethodHandle;
import java.lang.invoke.MethodHandles;
import java.lang.invoke.MethodType;
import net.minecraft.world.entity.Entity;
import ru.kokk.skinkokk.character.CharacterConfig;

/**
 * Рюкзак StorageKokk на спине (если мод есть): тогда плащ, накидка капюшона, длинные волосы сзади и (по желанию) хвост
 * не рисуются — иначе они торчат сквозь рюкзак. Что прятать — настройки «Персонаж» (backpackHides…).
 */
final class Backpack {
    private Backpack() {}

    private static MethodHandle state;
    private static boolean looked;

    static boolean worn(Entity e) {
        if (!looked) {
            looked = true;
            try {
                Class<?> c = Class.forName("com.kokk.storagekokk.client.ClientWorn");
                state = MethodHandles.publicLookup().findStatic(c, "state", MethodType.methodType(int.class, int.class));
            } catch (Throwable t) {
                state = null;
            }
        }
        if (state == null) return false;
        try {
            return (int) state.invokeExact(e.getId()) != 0;
        } catch (Throwable t) {
            return false;
        }
    }

    /** Прятать ли эту кость, когда надет рюкзак. */
    static boolean hides(CharModel.BoneInfo bi) {
        String n = bi.name;
        try {
            if (n.equals("cape") || n.startsWith("x_cloak") || n.startsWith("x_hood_drape")) return CharacterConfig.BACKPACK_HIDES_CLOAK.get();
            if (n.startsWith("hair_b_")) return CharacterConfig.BACKPACK_HIDES_HAIR.get();
            if (n.startsWith("tail_")) return CharacterConfig.BACKPACK_HIDES_TAIL.get();
        } catch (RuntimeException notLoaded) {
            return !n.startsWith("tail_");
        }
        return false;
    }
}
