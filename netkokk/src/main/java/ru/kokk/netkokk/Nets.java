package ru.kokk.netkokk;

import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;

/** Все рабочие IPv4-адаптеры, включая VPN (Radmin, ZeroTier, Hamachi…). */
public final class Nets {
    public record Adapter(NetworkInterface iface, String label, InetAddress address, InetAddress broadcast) {}

    private Nets() {}

    public static List<Adapter> adapters() {
        List<Adapter> out = new ArrayList<>();
        List<? extends String> ignore;
        try {
            ignore = NetKokkConfig.IGNORE_ADAPTERS.get();
        } catch (Exception e) {
            ignore = List.of();
        }
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                try {
                    if (!ni.isUp() || ni.isLoopback()) continue;
                } catch (Exception e) {
                    continue;
                }
                String name = (ni.getDisplayName() == null ? ni.getName() : ni.getDisplayName());
                boolean skip = false;
                for (String s : ignore) if (!s.isBlank() && name.toLowerCase(Locale.ROOT).contains(s.toLowerCase(Locale.ROOT))) skip = true;
                if (skip) continue;
                for (InterfaceAddress ia : ni.getInterfaceAddresses()) {
                    if (ia.getAddress() instanceof Inet4Address a && !a.isLoopbackAddress() && !a.isLinkLocalAddress()) {
                        out.add(new Adapter(ni, label(name), a, ia.getBroadcast()));
                    }
                }
            }
        } catch (Exception e) {
            NetKokk.LOGGER.debug("adapters: {}", e.toString());
        }
        return out;
    }

    public static String label(String name) {
        String n = name.toLowerCase(Locale.ROOT);
        if (n.contains("zerotier")) return "ZeroTier";
        if (n.contains("radmin")) return "Radmin VPN";
        if (n.contains("hamachi")) return "Hamachi";
        if (n.contains("tailscale")) return "Tailscale";
        if (n.contains("wireguard") || n.contains("wg")) return "WireGuard";
        if (n.contains("tap") || n.contains("tun") || n.contains("vpn")) return "VPN";
        if (n.contains("wi-fi") || n.contains("wireless") || n.contains("wlan")) return "Wi-Fi";
        return "LAN";
    }
}
