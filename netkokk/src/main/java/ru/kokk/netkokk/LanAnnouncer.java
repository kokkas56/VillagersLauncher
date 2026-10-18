package ru.kokk.netkokk;

import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.MulticastSocket;
import java.nio.charset.StandardCharsets;

/** Шлёт объявление открытого мира через все адаптеры: мультикаст + широковещание + прямые адреса. */
public final class LanAnnouncer extends Thread {
    private static LanAnnouncer instance;
    private volatile String payload;

    private LanAnnouncer() {
        super("NetKokk LAN announcer");
        setDaemon(true);
    }

    public static synchronized void set(String text) {
        if (text != null && instance == null) {
            instance = new LanAnnouncer();
            instance.start();
        }
        if (instance != null) instance.payload = text;
    }

    @Override
    public void run() {
        InetAddress group;
        try {
            group = InetAddress.getByName("224.0.2.60");
        } catch (Exception e) {
            return;
        }
        while (true) {
            try {
                String text = payload;
                if (text != null && NetKokkConfig.ANNOUNCE.get()) {
                    byte[] data = text.getBytes(StandardCharsets.UTF_8);
                    for (Nets.Adapter a : Nets.adapters()) {
                        try (MulticastSocket ms = new MulticastSocket(null)) {
                            ms.bind(new InetSocketAddress(a.address(), 0));
                            ms.setNetworkInterface(a.iface());
                            ms.setTimeToLive(4);
                            ms.send(new DatagramPacket(data, data.length, group, 4445));
                        } catch (Exception ignored) {
                        }
                        if (a.broadcast() != null) {
                            try (DatagramSocket ds = new DatagramSocket(new InetSocketAddress(a.address(), 0))) {
                                ds.setBroadcast(true);
                                ds.send(new DatagramPacket(data, data.length, a.broadcast(), 4445));
                            } catch (Exception ignored) {
                            }
                        }
                    }
                    for (String t : NetKokkConfig.EXTRA_TARGETS.get()) {
                        if (t == null || t.isBlank()) continue;
                        try (DatagramSocket ds = new DatagramSocket()) {
                            ds.send(new DatagramPacket(data, data.length, InetAddress.getByName(t.trim()), 4445));
                        } catch (Exception ignored) {
                        }
                    }
                }
                Thread.sleep(NetKokkConfig.INTERVAL_MS.get());
            } catch (InterruptedException e) {
                return;
            } catch (Exception e) {
                NetKokk.LOGGER.debug("announce: {}", e.toString());
                try {
                    Thread.sleep(3000);
                } catch (InterruptedException ie) {
                    return;
                }
            }
        }
    }
}
