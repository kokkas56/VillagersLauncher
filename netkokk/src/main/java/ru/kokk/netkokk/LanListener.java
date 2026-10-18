package ru.kokk.netkokk;

import java.net.DatagramPacket;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.MulticastSocket;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ConcurrentLinkedQueue;

/** Слушает объявления миров на всех адаптерах сразу. */
public final class LanListener extends Thread {
    public record Found(String text, InetAddress from) {}

    public static final ConcurrentLinkedQueue<Found> QUEUE = new ConcurrentLinkedQueue<>();
    private static LanListener instance;

    private LanListener() {
        super("NetKokk LAN listener");
        setDaemon(true);
    }

    public static synchronized void ensureStarted() {
        if (instance == null) {
            instance = new LanListener();
            instance.start();
        }
    }

    @Override
    public void run() {
        InetAddress group;
        try {
            group = InetAddress.getByName("224.0.2.60");
        } catch (Exception e) {
            return;
        }
        MulticastSocket socket = null;
        Set<String> joined = new HashSet<>();
        long lastJoin = 0;
        byte[] buf = new byte[1024];
        while (true) {
            try {
                if (socket == null) {
                    socket = new MulticastSocket(null);
                    socket.setReuseAddress(true);
                    socket.bind(new InetSocketAddress(4445));
                    socket.setSoTimeout(2000);
                    joined.clear();
                    lastJoin = 0;
                }
                if (System.currentTimeMillis() - lastJoin > 20000) {
                    lastJoin = System.currentTimeMillis();
                    for (Nets.Adapter a : Nets.adapters()) {
                        String key = a.iface().getName();
                        if (joined.contains(key)) continue;
                        try {
                            if (!a.iface().supportsMulticast()) continue;
                            socket.joinGroup(new InetSocketAddress(group, 4445), a.iface());
                            joined.add(key);
                        } catch (Exception ignored) {
                        }
                    }
                }
                if (!NetKokkConfig.LISTEN.get()) {
                    Thread.sleep(2000);
                    continue;
                }
                DatagramPacket p = new DatagramPacket(buf, buf.length);
                try {
                    socket.receive(p);
                } catch (SocketTimeoutException t) {
                    continue;
                }
                String text = new String(p.getData(), p.getOffset(), p.getLength(), StandardCharsets.UTF_8);
                if (text.contains("[AD]")) {
                    QUEUE.add(new Found(text, p.getAddress()));
                    while (QUEUE.size() > 200) QUEUE.poll();
                }
            } catch (InterruptedException e) {
                return;
            } catch (Exception e) {
                NetKokk.LOGGER.debug("listen: {}", e.toString());
                if (socket != null) socket.close();
                socket = null;
                try {
                    Thread.sleep(5000);
                } catch (InterruptedException ie) {
                    return;
                }
            }
        }
    }
}
