package ru.kokk.skinkokk.client;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.mojang.blaze3d.platform.NativeImage;
import com.mojang.blaze3d.systems.RenderSystem;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;
import net.minecraft.Util;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.inventory.InventoryScreen;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import ru.kokk.skinkokk.SkinKokk;

/** Гардероб: выбор сохранённого в лаунчере скина прямо в игре. */
public final class WardrobeScreen extends Screen {
    private record Item(String id, String name, Path skin, Path cape, boolean slim, ResourceLocation tex) {}

    private static final int CELL = 58;
    private final List<Item> items = new ArrayList<>();
    private int page = 0;
    private int perPage = 1;
    private int gridX;
    private int gridY;
    private int cols = 1;

    public WardrobeScreen() {
        super(Component.translatable("skinkokk.wardrobe.title"));
    }

    private Path wardrobe() {
        return LocalSkin.folder().resolve("wardrobe");
    }

    private void load() {
        release();
        Path dir = wardrobe();
        if (!Files.isDirectory(dir)) return;
        try (Stream<Path> s = Files.list(dir)) {
            List<Path> pngs = s.filter(p -> {
                String n = p.getFileName().toString();
                return n.endsWith(".png") && !n.endsWith(".cape.png");
            }).sorted().toList();
            int i = 0;
            for (Path p : pngs) {
                String file = p.getFileName().toString();
                String id = file.substring(0, file.length() - 4);
                String name = id;
                boolean slim = false;
                Path meta = dir.resolve(id + ".json");
                if (Files.exists(meta)) {
                    try {
                        JsonObject o = JsonParser.parseString(Files.readString(meta, StandardCharsets.UTF_8)).getAsJsonObject();
                        if (o.has("name")) name = o.get("name").getAsString();
                        slim = o.has("model") && "slim".equals(o.get("model").getAsString());
                    } catch (Exception ignored) {
                    }
                }
                ResourceLocation tex = ResourceLocation.fromNamespaceAndPath(SkinKokk.MOD_ID, "wardrobe/" + (i++));
                try {
                    minecraft.getTextureManager().register(tex, new DynamicTexture(NativeImage.read(Files.readAllBytes(p))));
                } catch (Exception e) {
                    continue;
                }
                Path cape = dir.resolve(id + ".cape.png");
                items.add(new Item(id, name, p, Files.exists(cape) ? cape : null, slim, tex));
            }
        } catch (Exception e) {
            SkinKokk.LOGGER.warn("Wardrobe read failed: {}", e.toString());
        }
    }

    private void release() {
        if (minecraft == null) return;
        for (Item it : items) minecraft.getTextureManager().release(it.tex());
        items.clear();
    }

    @Override
    protected void init() {
        if (items.isEmpty()) load();
        int left = this.width / 2 - 20;
        int areaW = this.width - left - 20;
        cols = Math.max(1, areaW / CELL);
        int rows = Math.max(1, (this.height - 110) / (CELL + 12));
        perPage = cols * rows;
        gridX = left;
        gridY = 44;
        page = Math.min(page, Math.max(0, (items.size() - 1) / Math.max(1, perPage)));

        int by = this.height - 30;
        addRenderableWidget(Button.builder(Component.literal("<"), b -> { page = Math.max(0, page - 1); rebuildWidgets(); })
                .bounds(gridX, by, 20, 20).build()).active = page > 0;
        addRenderableWidget(Button.builder(Component.literal(">"), b -> { page++; rebuildWidgets(); })
                .bounds(gridX + 24, by, 20, 20).build()).active = (page + 1) * perPage < items.size();
        addRenderableWidget(Button.builder(Component.translatable("skinkokk.wardrobe.remove"), b -> clear())
                .bounds(gridX + 52, by, 100, 20).build());
        addRenderableWidget(Button.builder(Component.translatable("skinkokk.wardrobe.folder"), b -> Util.getPlatform().openFile(wardrobe().toFile()))
                .bounds(gridX + 156, by, 100, 20).build());
        addRenderableWidget(Button.builder(Component.translatable("gui.done"), b -> onClose())
                .bounds(this.width - 90, by, 70, 20).build());
    }

    @Override
    public void render(GuiGraphics g, int mouseX, int mouseY, float partial) {
        super.render(g, mouseX, mouseY, partial);
        g.drawCenteredString(font, title, this.width / 2, 14, 0xF5D48A);
        // игрок слева
        if (minecraft.player != null) {
            int x1 = 20, y1 = 40, x2 = this.width / 2 - 40, y2 = this.height - 40;
            g.fill(x1, y1, x2, y2, 0x66000000);
            InventoryScreen.renderEntityInInventoryFollowsMouse(g, x1, y1, x2, y2, Math.min(80, (y2 - y1) / 3), 0.0625F, mouseX, mouseY, minecraft.player);
        }
        if (items.isEmpty()) {
            g.drawWordWrap(font, Component.translatable("skinkokk.wardrobe.empty"), gridX, gridY + 10, this.width - gridX - 20, 0xC8B89E);
            return;
        }
        int start = page * perPage;
        for (int i = start; i < Math.min(items.size(), start + perPage); i++) {
            Item it = items.get(i);
            int k = i - start;
            int x = gridX + (k % cols) * CELL;
            int y = gridY + (k / cols) * (CELL + 12);
            boolean hover = mouseX >= x && mouseX < x + CELL - 6 && mouseY >= y && mouseY < y + CELL - 6;
            g.fill(x, y, x + CELL - 6, y + CELL - 6, hover ? 0xAA2ECC71 : 0x88000000);
            int s = CELL - 14;
            // лицо + слой шапки
            g.blit(it.tex(), x + 4, y + 4, s, s, 8, 8, 8, 8, 64, 64);
            RenderSystem.enableBlend();
            g.blit(it.tex(), x + 4, y + 4, s, s, 40, 8, 8, 8, 64, 64);
            RenderSystem.disableBlend();
            String name = font.plainSubstrByWidth(it.name(), CELL - 4);
            g.drawString(font, name, x, y + CELL - 4, hover ? 0xFFFFFF : 0xC8B89E);
        }
    }

    @Override
    public boolean mouseClicked(double mx, double my, int button) {
        if (super.mouseClicked(mx, my, button)) return true;
        int start = page * perPage;
        for (int i = start; i < Math.min(items.size(), start + perPage); i++) {
            int k = i - start;
            int x = gridX + (k % cols) * CELL;
            int y = gridY + (k / cols) * (CELL + 12);
            if (mx >= x && mx < x + CELL - 6 && my >= y && my < y + CELL - 6) {
                wear(items.get(i));
                return true;
            }
        }
        return false;
    }

    private void wear(Item it) {
        try {
            Path dir = LocalSkin.folder();
            Files.copy(it.skin(), dir.resolve("skin.png"), StandardCopyOption.REPLACE_EXISTING);
            if (it.cape() != null) Files.copy(it.cape(), dir.resolve("cape.png"), StandardCopyOption.REPLACE_EXISTING);
            else Files.deleteIfExists(dir.resolve("cape.png"));
            JsonObject meta = new JsonObject();
            meta.addProperty("model", it.slim() ? "slim" : "default");
            meta.addProperty("name", it.name());
            meta.addProperty("updated", System.currentTimeMillis());
            Files.writeString(dir.resolve("skin.json"), meta.toString(), StandardCharsets.UTF_8);
            LocalSkin.push();
            if (minecraft.player != null) minecraft.player.displayClientMessage(Component.translatable("skinkokk.msg.wearing", it.name()), true);
        } catch (Exception e) {
            SkinKokk.LOGGER.warn("Can't wear skin: {}", e.toString());
        }
    }

    private void clear() {
        try {
            Path dir = LocalSkin.folder();
            Files.deleteIfExists(dir.resolve("skin.png"));
            Files.deleteIfExists(dir.resolve("cape.png"));
            Files.writeString(dir.resolve("skin.json"), "{\"model\":\"default\",\"cleared\":true,\"updated\":" + System.currentTimeMillis() + "}", StandardCharsets.UTF_8);
            LocalSkin.push();
        } catch (Exception e) {
            SkinKokk.LOGGER.warn("Can't clear skin: {}", e.toString());
        }
    }

    @Override
    public void removed() {
        release();
        super.removed();
    }

    @Override
    public boolean isPauseScreen() {
        return false;
    }
}
