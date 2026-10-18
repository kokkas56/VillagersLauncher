package ru.kokk.netkokk.mixin;

import java.util.LinkedHashSet;
import java.util.Set;
import net.minecraft.ChatFormatting;
import net.minecraft.client.Minecraft;
import net.minecraft.client.server.IntegratedServer;
import net.minecraft.network.chat.ClickEvent;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.HoverEvent;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.world.level.GameType;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;
import ru.kokk.netkokk.NetKokkConfig;
import ru.kokk.netkokk.Nets;

@Mixin(IntegratedServer.class)
public abstract class IntegratedServerMixin {
    @Inject(method = "publishServer", at = @At("RETURN"))
    private void netkokk$afterPublish(GameType gameMode, boolean cheats, int port, CallbackInfoReturnable<Boolean> cir) {
        if (!Boolean.TRUE.equals(cir.getReturnValue())) return;
        IntegratedServer self = (IntegratedServer) (Object) this;
        if (NetKokkConfig.OFFLINE_LAN.get()) self.setUsesAuthentication(false);
        if (!NetKokkConfig.SHOW_ADDRESSES.get()) return;
        Set<String> seen = new LinkedHashSet<>();
        MutableComponent msg = Component.translatable("netkokk.chat.addresses").withStyle(ChatFormatting.GOLD);
        for (Nets.Adapter a : Nets.adapters()) {
            String addr = a.address().getHostAddress() + ":" + port;
            if (!seen.add(addr)) continue;
            msg.append(Component.literal("\n  " + a.label() + ": ").withStyle(ChatFormatting.GRAY));
            msg.append(Component.literal(addr).withStyle(s -> s.withColor(ChatFormatting.GREEN).withUnderlined(true)
                    .withClickEvent(new ClickEvent(ClickEvent.Action.COPY_TO_CLIPBOARD, addr))
                    .withHoverEvent(new HoverEvent(HoverEvent.Action.SHOW_TEXT, Component.translatable("netkokk.chat.copy")))));
        }
        Minecraft mc = Minecraft.getInstance();
        mc.execute(() -> {
            if (mc.player != null) mc.player.displayClientMessage(msg, false);
        });
    }
}
