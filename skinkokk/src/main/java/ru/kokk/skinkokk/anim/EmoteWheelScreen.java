package ru.kokk.skinkokk.anim;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import net.neoforged.neoforge.network.PacketDistributor;

/**
 * Колесо эмоций: держи клавишу (G), наведи на эмоцию и отпусти — или щёлкни. Колесо мыши — страницы, ПКМ — остановить.
 * Первая страница — «любимые» из настроек, дальше все эмоции по группам. Другие игроки видят эмоцию (если не выключили).
 */
public final class EmoteWheelScreen extends Screen {
    private final boolean byKey;
    private final List<List<AnimDef>> pages = new ArrayList<>();
    private int page;
    private int hovered = -1;

    public EmoteWheelScreen(boolean byKey) {
        super(Component.translatable("skinkokk.anim.wheel"));
        this.byKey = byKey;
    }

    private static boolean ru() {
        try {
            return Minecraft.getInstance().getLanguageManager().getSelected().startsWith("ru");
        } catch (RuntimeException e) {
            return true;
        }
    }

    @Override
    protected void init() {
        pages.clear();
        int per = AnimConfig.get(AnimConfig.WHEEL_PER_PAGE, 8);
        List<AnimDef> all = new ArrayList<>();
        for (AnimDef d : AnimLibrary.clientAll()) if (d.emote) all.add(d);
        List<AnimDef> fav = new ArrayList<>();
        try {
            for (String id : AnimConfig.FAVORITES.get()) for (AnimDef d : all) if (d.id.equals(id)) fav.add(d);
        } catch (RuntimeException ignored) {
        }
        if (!fav.isEmpty()) pages.add(fav.subList(0, Math.min(per, fav.size())));
        List<String> cats = List.of("greet", "talk", "emotion", "work", "combat", "rest", "dance", "misc");
        all.sort(Comparator.comparingInt((AnimDef d) -> cats.indexOf(d.cat) < 0 ? 99 : cats.indexOf(d.cat)).thenComparing(d -> d.displayName(true)));
        for (int i = 0; i < all.size(); i += per) pages.add(all.subList(i, Math.min(all.size(), i + per)));
        if (pages.isEmpty()) pages.add(List.of());
        page = Math.min(page, pages.size() - 1);
    }

    private List<AnimDef> items() {
        return pages.get(page);
    }

    private int cx() { return width / 2; }
    private int cy() { return height / 2; }
    private int radius() { return (int) (Math.min(width, height) * 0.32); }

    private int pick(double mx, double my) {
        List<AnimDef> it = items();
        if (it.isEmpty()) return -1;
        double dx = mx - cx(), dy = my - cy();
        if (Math.hypot(dx, dy) < radius() * 0.38) return -1;
        double a = Math.atan2(dy, dx) + Math.PI / 2;
        if (a < 0) a += Math.PI * 2;
        double seg = Math.PI * 2 / it.size();
        return (int) Math.floor((a + seg / 2) / seg) % it.size();
    }

    @Override
    public void render(GuiGraphics g, int mx, int my, float partial) {
        g.fill(0, 0, width, height, 0x88000000);
        hovered = pick(mx, my);
        List<AnimDef> it = items();
        int r = radius();
        boolean ru = ru();
        for (int k = 0; k < it.size(); k++) {
            double a = -Math.PI / 2 + k * Math.PI * 2 / it.size();
            int x = cx() + (int) (Math.cos(a) * r), y = cy() + (int) (Math.sin(a) * r);
            String name = it.get(k).displayName(ru);
            int w = Math.max(70, font.width(name) + 14), h = 22;
            boolean on = k == hovered;
            g.fill(x - w / 2 - 1, y - h / 2 - 1, x + w / 2 + 1, y + h / 2 + 1, on ? 0xFFE6C23C : 0xFF141414);
            g.fill(x - w / 2, y - h / 2, x + w / 2, y + h / 2, on ? 0xFF4452B8 : 0xE0303036);
            g.drawCenteredString(font, name, x, y - 4, on ? 0xFFFFFF : 0xE0E0E0);
            // линия к центру
            if (on) {
                int sx = cx() + (int) (Math.cos(a) * r * 0.42), sy = cy() + (int) (Math.sin(a) * r * 0.42);
                g.fill(Math.min(sx, sx) - 1, Math.min(sy, sy) - 1, sx + 2, sy + 2, 0xFFE6C23C);
            }
        }
        int cw = 120;
        g.fill(cx() - cw / 2, cy() - 26, cx() + cw / 2, cy() + 26, 0xE0202024);
        g.drawCenteredString(font, Component.translatable("skinkokk.anim.wheel"), cx(), cy() - 20, 0xFFE6C23C);
        g.drawCenteredString(font, (page + 1) + " / " + pages.size(), cx(), cy() - 8, 0xFFB0B0B0);
        g.drawCenteredString(font, Component.translatable(byKey ? "skinkokk.anim.wheel_hint_key" : "skinkokk.anim.wheel_hint"), cx(), cy() + 4, 0xFF909090);
        g.drawCenteredString(font, Component.translatable("skinkokk.anim.wheel_hint2"), cx(), cy() + 15, 0xFF909090);
        if (it.isEmpty()) g.drawCenteredString(font, Component.translatable("skinkokk.anim.wheel_empty"), cx(), cy() + r, 0xFFB0B0B0);
        super.render(g, mx, my, partial);
    }

    @Override
    public void renderBackground(GuiGraphics g, int mx, int my, float partial) {
        // фон рисуем сами — мир остаётся виден
    }

    private void choose(int k) {
        List<AnimDef> it = items();
        if (k < 0 || k >= it.size()) return;
        send(it.get(k).id);
        onClose();
    }

    private static void send(String id) {
        Minecraft mc = Minecraft.getInstance();
        if (mc.getConnection() == null) return;
        if (!mc.getConnection().hasChannel(AnimNet.Emote.TYPE)) {
            if (mc.player != null) mc.player.displayClientMessage(Component.translatable("skinkokk.anim.no_server"), true);
            return;
        }
        PacketDistributor.sendToServer(new AnimNet.Emote(id));
    }

    @Override
    public boolean mouseClicked(double mx, double my, int button) {
        if (button == 1) {
            send("");
            onClose();
            return true;
        }
        if (button == 0) {
            int k = pick(mx, my);
            if (k >= 0) choose(k);
            else onClose();
            return true;
        }
        return super.mouseClicked(mx, my, button);
    }

    @Override
    public boolean mouseScrolled(double mx, double my, double sx, double sy) {
        if (pages.size() > 1) page = Math.floorMod(page + (sy < 0 ? 1 : -1), pages.size());
        return true;
    }

    @Override
    public boolean keyReleased(int key, int scan, int mods) {
        if (byKey && AnimKeys.EMOTE.matches(key, scan)) {
            if (hovered >= 0) choose(hovered);
            else onClose();
            return true;
        }
        return super.keyReleased(key, scan, mods);
    }

    @Override
    public boolean isPauseScreen() {
        return false;
    }
}
