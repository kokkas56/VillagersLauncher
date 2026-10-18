package ru.kokk.earlywindow;

import net.neoforged.fml.earlydisplay.ColourScheme;
import net.neoforged.fml.earlydisplay.DisplayWindow;
import net.neoforged.fml.earlydisplay.ElementShader;
import net.neoforged.fml.earlydisplay.QuadHelper;
import net.neoforged.fml.earlydisplay.RenderElement;
import net.neoforged.fml.earlydisplay.SimpleBufferBuilder;
import org.lwjgl.BufferUtils;
import org.lwjgl.opengl.GL32C;
import org.lwjgl.stb.STBImage;
import org.lwjgl.system.MemoryStack;

import java.io.InputStream;
import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.nio.ByteBuffer;
import java.nio.IntBuffer;
import java.util.List;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * MineVillagers early loading window: NeoForge's own early window (all its window/hand-over logic is inherited
 * untouched), switched to the dark scheme, without the fox, and with the MineVillagers logo in the middle.
 *
 * <p>Selected by {@code earlyWindowProvider = "villagersearly"} in config/fml.toml (VillagersLauncher writes it).
 * Everything we add is done defensively: if any internal lookup fails, the stock window simply stays as it is.</p>
 */
public class VillagersEarlyWindow extends DisplayWindow {
    public static final String NAME = "villagersearly";
    private static final int TEXTURE_UNIT = 12;

    private volatile boolean customised;

    @Override
    public String name() {
        return NAME;
    }

    @Override
    public Runnable initialize(String[] arguments) {
        Runnable r = super.initialize(arguments);
        try {
            Field f = DisplayWindow.class.getDeclaredField("renderScheduler");
            f.setAccessible(true);
            ScheduledExecutorService exec = (ScheduledExecutorService) f.get(this);
            if (exec != null) scheduleCustomise(exec, 0);
        } catch (Throwable t) {
            log("could not reach the render thread: " + t);
        }
        return r;
    }

    /**
     * The stock implementation calls {@code getClass().getModule().addReads(...)}: with a subclass that is OUR module,
     * and Module.addReads may only be called from inside the module itself, so FML's code would throw
     * IllegalCallerException. Do the same work from here instead.
     */
    @Override
    public void updateModuleReads(ModuleLayer layer) {
        Module neoforge = layer.findModule("neoforge").orElseThrow();
        VillagersEarlyWindow.class.getModule().addReads(neoforge);
        try {
            Class<?> overlay = Class.forName(neoforge, "net.neoforged.neoforge.client.loading.NeoForgeLoadingOverlay");
            java.lang.reflect.Method factory = null;
            for (java.lang.reflect.Method m : overlay.getMethods()) {
                if (java.lang.reflect.Modifier.isStatic(m.getModifiers()) && m.getName().equals("newInstance")) factory = m;
            }
            Field f = DisplayWindow.class.getDeclaredField("loadingOverlay");
            f.setAccessible(true);
            f.set(this, factory);
        } catch (Throwable t) {
            throw new IllegalStateException("VillagersEarlyWindow: could not link the NeoForge loading overlay", t);
        }
    }

    /** NeoForge adds the Mojang Studios logo near the end of loading; MineVillagers shows its own instead. */
    @Override
    public void addMojangTexture(int textureId) {
    }

    /** Runs on the early window's own (single) render thread, so it never races the painter. */
    private void scheduleCustomise(ScheduledExecutorService exec, int attempt) {
        exec.schedule(() -> {
            if (customised) return;
            try {
                Field ef = DisplayWindow.class.getDeclaredField("elements");
                ef.setAccessible(true);
                @SuppressWarnings("unchecked")
                List<Object> elements = (List<Object>) ef.get(this);
                if (elements == null) {
                    if (attempt < 500) scheduleCustomise(exec, attempt + 1);
                    return;
                }
                customise(elements);
                customised = true;
            } catch (Throwable t) {
                customised = true;
                log("customisation skipped: " + t);
            }
        }, attempt == 0 ? 1 : 10, TimeUnit.MILLISECONDS);
    }

    private void customise(List<Object> elements) throws Exception {
        Object logo = logoElement(); // build first: if this fails nothing has been changed yet
        // stock order is [fox, log messages, version, performance, progress (+ squirrel)]
        boolean stock = elements.size() == 5;
        Object progress = stock ? elements.get(4) : null;
        Object smallProgress = progress instanceof RenderElement pe ? scaledElement(pe) : null;
        // dark colour scheme (background clear + the context used by text and bars)
        Field cs = DisplayWindow.class.getDeclaredField("colourScheme");
        cs.setAccessible(true);
        cs.set(this, ColourScheme.BLACK);
        Field cf = DisplayWindow.class.getDeclaredField("context");
        cf.setAccessible(true);
        RenderElement.DisplayContext old = (RenderElement.DisplayContext) cf.get(this);
        if (old != null) {
            cf.set(this, new RenderElement.DisplayContext(old.width(), old.height(), old.scale(), old.elementShader(), ColourScheme.BLACK, old.performance()));
        }
        if (stock) {
            if (smallProgress != null) elements.set(4, smallProgress);
            elements.remove(0); // the fox
        }
        elements.add(0, logo);
    }

    // ------------------------------------------------------------------ the logo element
    private int logoTex = -1, logoW, logoH;
    private static Field globalAlpha;

    private interface Draw {
        void draw(SimpleBufferBuilder bb, RenderElement.DisplayContext ctx, int frame) throws Throwable;
    }

    /** The progress bars, drawn smaller and lower: same element, rendered into a shrunken, shifted viewport. */
    private Object scaledElement(RenderElement inner) throws Exception {
        final float s = 0.7f;
        return element((bb, ctx, frame) -> {
            int[] vp = new int[4];
            GL32C.glGetIntegerv(GL32C.GL_VIEWPORT, vp);
            int w = Math.round(vp[2] * s), h = Math.round(vp[3] * s);
            int x = vp[0] + (vp[2] - w) / 2;
            int y = vp[1] - Math.round(vp[3] * 0.03f);
            GL32C.glViewport(x, y, w, h);
            try {
                inner.render(ctx, frame);
            } finally {
                GL32C.glViewport(vp[0], vp[1], vp[2], vp[3]);
            }
        }, "progress");
    }

    private Object logoElement() throws Exception {
        return element((bb, ctx, frame) -> drawLogo(bb, ctx), "logo");
    }

    private Object element(Draw draw, String what) throws Exception {
        ClassLoader cl = RenderElement.class.getClassLoader();
        Class<?> initializer = Class.forName("net.neoforged.fml.earlydisplay.RenderElement$Initializer", false, cl);
        Class<?> renderer = Class.forName("net.neoforged.fml.earlydisplay.RenderElement$Renderer", false, cl);
        try {
            globalAlpha = RenderElement.class.getDeclaredField("globalAlpha");
            globalAlpha.setAccessible(true);
        } catch (Throwable ignored) {
            globalAlpha = null;
        }
        boolean[] broken = {false};
        Object rendererProxy = Proxy.newProxyInstance(renderer.getClassLoader(), new Class<?>[]{renderer}, handler(args -> {
            if (broken[0]) return null;
            try {
                draw.draw((SimpleBufferBuilder) args[0], (RenderElement.DisplayContext) args[1], args.length > 2 ? (Integer) args[2] : 0);
            } catch (Throwable t) {
                broken[0] = true;
                log(what + " draw failed: " + t);
            }
            return null;
        }));
        Object initProxy = Proxy.newProxyInstance(initializer.getClassLoader(), new Class<?>[]{initializer}, handler(args -> rendererProxy));
        Constructor<RenderElement> c = RenderElement.class.getConstructor(initializer);
        return c.newInstance(initProxy);
    }

    private interface Body {
        Object run(Object[] args) throws Throwable;
    }

    private static InvocationHandler handler(Body body) {
        return (proxy, method, args) -> {
            String n = method.getName();
            if (method.getDeclaringClass() == Object.class) {
                return switch (n) {
                    case "hashCode" -> System.identityHashCode(proxy);
                    case "equals" -> proxy == args[0];
                    default -> "VillagersEarlyWindow$" + n;
                };
            }
            return body.run(args == null ? new Object[0] : args);
        };
    }

    private void drawLogo(SimpleBufferBuilder bb, RenderElement.DisplayContext ctx) throws Exception {
        if (logoTex == -2) return;
        if (logoTex == -1) loadLogo();
        if (logoTex < 0) return;
        int alpha = 255;
        if (globalAlpha != null) {
            try { alpha = Math.max(0, Math.min(255, globalAlpha.getInt(null))); } catch (Throwable ignored) {}
        }
        int sw = ctx.scaledWidth(), sh = ctx.scaledHeight();
        float w = Math.min(sw * 0.34f, logoW * Math.max(1, ctx.scale()) * 0.6f);
        float h = w * logoH / (float) logoW;
        float x0 = (sw - w) / 2f;
        float y0 = sh * 0.38f - h / 2f;

        ElementShader shader = ctx.elementShader();
        GL32C.glActiveTexture(GL32C.GL_TEXTURE0 + TEXTURE_UNIT);
        GL32C.glBindTexture(GL32C.GL_TEXTURE_2D, logoTex);
        GL32C.glActiveTexture(GL32C.GL_TEXTURE0);
        shader.updateTextureUniform(TEXTURE_UNIT);
        shader.updateRenderTypeUniform(ElementShader.RenderType.TEXTURE);
        bb.begin(SimpleBufferBuilder.Format.POS_TEX_COLOR, SimpleBufferBuilder.Mode.QUADS);
        QuadHelper.loadQuad(bb, x0, x0 + w, y0, y0 + h, 0f, 1f, 0f, 1f, (alpha << 24) | 0xFFFFFF);
        bb.draw();
    }

    private void loadLogo() {
        try (InputStream in = VillagersEarlyWindow.class.getResourceAsStream("/villagers_early_logo.png")) {
            if (in == null) {
                logoTex = -2;
                log("logo texture missing");
                return;
            }
            byte[] bytes = in.readAllBytes();
            ByteBuffer buf = BufferUtils.createByteBuffer(bytes.length);
            buf.put(bytes).flip();
            try (MemoryStack stack = MemoryStack.stackPush()) {
                IntBuffer w = stack.mallocInt(1), h = stack.mallocInt(1), comp = stack.mallocInt(1);
                ByteBuffer img = STBImage.stbi_load_from_memory(buf, w, h, comp, 4);
                if (img == null) {
                    logoTex = -2;
                    log("logo decode failed: " + STBImage.stbi_failure_reason());
                    return;
                }
                logoW = w.get(0);
                logoH = h.get(0);
                GL32C.glActiveTexture(GL32C.GL_TEXTURE0 + TEXTURE_UNIT);
                int tex = GL32C.glGenTextures();
                GL32C.glBindTexture(GL32C.GL_TEXTURE_2D, tex);
                GL32C.glTexParameteri(GL32C.GL_TEXTURE_2D, GL32C.GL_TEXTURE_MIN_FILTER, GL32C.GL_LINEAR);
                GL32C.glTexParameteri(GL32C.GL_TEXTURE_2D, GL32C.GL_TEXTURE_MAG_FILTER, GL32C.GL_LINEAR);
                GL32C.glTexParameteri(GL32C.GL_TEXTURE_2D, GL32C.GL_TEXTURE_WRAP_S, GL32C.GL_CLAMP_TO_EDGE);
                GL32C.glTexParameteri(GL32C.GL_TEXTURE_2D, GL32C.GL_TEXTURE_WRAP_T, GL32C.GL_CLAMP_TO_EDGE);
                GL32C.glPixelStorei(GL32C.GL_UNPACK_ALIGNMENT, 4);
                GL32C.glTexImage2D(GL32C.GL_TEXTURE_2D, 0, GL32C.GL_RGBA, logoW, logoH, 0, GL32C.GL_RGBA, GL32C.GL_UNSIGNED_BYTE, img);
                GL32C.glActiveTexture(GL32C.GL_TEXTURE0);
                STBImage.stbi_image_free(img);
                logoTex = tex;
            }
        } catch (Throwable t) {
            logoTex = -2;
            log("logo load failed: " + t);
        }
    }

    private static void log(String s) {
        System.out.println("[VillagersEarlyWindow] " + s);
    }
}
