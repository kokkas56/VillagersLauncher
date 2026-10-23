package ru.kokk.skinkokk.character.client;

import ru.kokk.skinkokk.character.CharacterData;

/**
 * Рисование текстуры частей: цвет пикселя по цветовому шаблону (основной цвет + узор + цвет узора) и «материалу»
 * (мех, волосы, ткань, кожа, чешуя…). Та же математика — в лаунчере (src/lib/characterRig.js), поэтому превью
 * совпадает с игрой.
 */
public final class CharPaint {
    private CharPaint() {}

    public static final int FACE_TOP = 0, FACE_BOTTOM = 1, FACE_RIGHT = 2, FACE_FRONT = 3, FACE_LEFT = 4, FACE_BACK = 5;

    public static int hash(int x, int y) {
        int h = x * 374761393 + y * 668265263;
        h = (h ^ (h >>> 13)) * 1274126177;
        h ^= h >>> 16;
        return h & 0x7fffffff;
    }

    /** Доля цвета узора в пикселе (0..1). */
    public static float pattern(String p, int x, int y) {
        return switch (p) {
            case "stripes" -> (y >> 1) & 1;
            case "vstripes" -> (x >> 1) & 1;
            case "checker" -> ((x >> 1) + (y >> 1)) & 1;
            case "dots" -> (x % 4 == 1 && y % 4 == 1) ? 1 : 0;
            case "spots" -> hash(x >> 1, y >> 1) % 5 == 0 ? 1 : 0;
            case "zigzag" -> ((y + Math.abs((x % 6) - 3)) % 6) < 2 ? 1 : 0;
            default -> 0;
        };
    }

    /** Множитель яркости «материала». */
    public static float style(String s, int x, int y) {
        return switch (s) {
            case "fur" -> 1F + ((hash(x, y) % 9) - 4) * 0.018F;
            case "hair" -> 1F + ((hash(x, 7) % 7) - 3) * 0.03F + ((hash(x, y) % 3) - 1) * 0.015F;
            case "cloth" -> 1F + (((x + y) & 1) == 0 ? 0.025F : -0.025F);
            case "leather" -> 1F + ((hash(x, y) % 5) - 2) * 0.012F;
            case "scale" -> 1F + (((x + (y >> 1) * 2) % 4 == 0) ? -0.08F : ((y & 1) == 0 ? 0.03F : 0F));
            case "leaf" -> 1F + ((hash(x, y) % 7) - 3) * 0.04F;
            case "smooth" -> 1F + ((hash(x, y) % 3) - 1) * 0.01F;
            default -> 1F;
        };
    }

    public static int mix(int a, int b, float t) {
        int r = Math.round(((a >> 16) & 255) + (((b >> 16) & 255) - ((a >> 16) & 255)) * t);
        int g = Math.round(((a >> 8) & 255) + (((b >> 8) & 255) - ((a >> 8) & 255)) * t);
        int bl = Math.round((a & 255) + ((b & 255) - (a & 255)) * t);
        return (r << 16) | (g << 8) | bl;
    }

    public static int shade(int c, float k) {
        int r = Math.max(0, Math.min(255, Math.round(((c >> 16) & 255) * k)));
        int g = Math.max(0, Math.min(255, Math.round(((c >> 8) & 255) * k)));
        int b = Math.max(0, Math.min(255, Math.round((c & 255) * k)));
        return (r << 16) | (g << 8) | b;
    }

    /** Сплошной цвет «слота» куба. */
    public static int slot(String slot, CharacterData.Colors c) {
        return switch (slot) {
            case "pc" -> c.pc();
            case "inner" -> mix(c.base(), 0xf0a8b0, 0.55F);
            case "light" -> mix(c.base(), 0xffffff, 0.45F);
            case "dark" -> shade(c.base(), 0.6F);
            case "white" -> 0xf4f1ec;
            case "black" -> 0x1c1a1c;
            case "gold" -> 0xe9bc61;
            default -> c.base();
        };
    }

    /**
     * Цвет пикселя грани куба. px/py — «мировые» координаты узора (чтобы полосы стыковались между кубами),
     * fx/fy/fw/fh — пиксель внутри грани и её размер (для каймы).
     */
    public static int pixel(CharacterData.Colors c, String style, String slot, boolean tip, int face, int px, int py, int fx, int fy, int fw, int fh) {
        int col;
        String p = c.pattern();
        if (!"base".equals(slot)) col = slot(slot, c);
        else if ("tip".equals(p) && tip) col = c.pc();
        else if ("belly".equals(p) && face == FACE_BOTTOM) col = c.pc();
        else col = mix(c.base(), c.pc(), pattern(p, px, py));
        float k = style(style, px, py);
        if (!"skin".equals(style) && fw >= 3 && fh >= 3 && (fx == 0 || fy == 0 || fx == fw - 1 || fy == fh - 1)) k *= 0.93F;
        return shade(col, k);
    }
}
