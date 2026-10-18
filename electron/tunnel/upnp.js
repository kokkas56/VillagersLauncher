// Проброс порта на роутере (UPnP IGD): найти роутер, узнать внешний IP, открыть порт на время игры.
'use strict';
const dgram = require('dgram');
const http = require('http');
const os = require('os');

function localIps() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  return out;
}

function discover(timeout = 3000) {
  return new Promise((resolve) => {
    const s = dgram.createSocket('udp4');
    const found = new Set();
    const msg = Buffer.from(['M-SEARCH * HTTP/1.1', 'HOST: 239.255.255.250:1900', 'MAN: "ssdp:discover"', 'MX: 2',
      'ST: urn:schemas-upnp-org:device:InternetGatewayDevice:1', '', ''].join('\r\n'));
    s.on('message', (m, rinfo) => {
      const loc = /^location:\s*(\S+)/im.exec(m.toString());
      if (loc) found.add(JSON.stringify({ url: loc[1], from: rinfo.address }));
    });
    s.on('error', () => {});
    s.bind(0, () => {
      try { s.send(msg, 1900, '239.255.255.250'); setTimeout(() => { try { s.send(msg, 1900, '239.255.255.250'); } catch (_) {} }, 600); } catch (_) {}
    });
    setTimeout(() => { try { s.close(); } catch (_) {} resolve([...found].map((x) => JSON.parse(x))); }, timeout);
  });
}

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, { timeout: 4000 }, (res) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve(d)); }).on('error', reject).on('timeout', function () { this.destroy(new Error('timeout')); });
  });
}

function soap(controlUrl, service, action, args) {
  const body = `<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:${action} xmlns:u="${service}">` +
    Object.entries(args || {}).map(([k, v]) => `<${k}>${v}</${k}>`).join('') + `</u:${action}></s:Body></s:Envelope>`;
  return new Promise((resolve, reject) => {
    const u = new URL(controlUrl);
    const req = http.request({ hostname: u.hostname, port: u.port || 80, path: u.pathname + u.search, method: 'POST', timeout: 5000,
      headers: { 'Content-Type': 'text/xml; charset="utf-8"', SOAPAction: `"${service}#${action}"`, 'Content-Length': Buffer.byteLength(body) } }, (res) => {
      let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => (res.statusCode === 200 ? resolve(d) : reject(new Error(`${action}: ${res.statusCode} ${(/<errorDescription>([^<]*)/.exec(d) || [])[1] || ''}`))));
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.end(body);
  });
}

async function gateway() {
  for (const dev of await discover()) {
    try {
      const xml = await get(dev.url);
      const re = /<service>([\s\S]*?)<\/service>/g;
      let m;
      while ((m = re.exec(xml))) {
        const type = (/<serviceType>([^<]+)/.exec(m[1]) || [])[1] || '';
        const ctl = (/<controlURL>([^<]+)/.exec(m[1]) || [])[1];
        if (/WAN(IP|PPP)Connection/.test(type) && ctl) return { service: type, control: new URL(ctl, dev.url).toString(), router: dev.from };
      }
    } catch (_) {}
  }
  return null;
}

function isPrivate(ip) {
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|127\.|169\.254\.|0\.)/.test(ip);
}

// открыть внешний порт → наш порт на этом компьютере
async function map(internalPort) {
  const gw = await gateway();
  if (!gw) return { ok: false, why: 'роутер не отвечает по UPnP (выключен в настройках роутера или его нет)' };
  let ext = null;
  try { ext = (/<NewExternalIPAddress>([^<]*)/.exec(await soap(gw.control, gw.service, 'GetExternalIPAddress')) || [])[1]; } catch (_) {}
  const me = localIps().find((ip) => ip.split('.').slice(0, 3).join('.') === gw.router.split('.').slice(0, 3).join('.')) || localIps()[0];
  const port = 30000 + Math.floor(Math.random() * 25000);
  try {
    await soap(gw.control, gw.service, 'AddPortMapping', {
      NewRemoteHost: '', NewExternalPort: port, NewProtocol: 'TCP', NewInternalPort: internalPort, NewInternalClient: me,
      NewEnabled: 1, NewPortMappingDescription: 'VillagersLauncher', NewLeaseDuration: 7200
    });
  } catch (e) { return { ok: false, why: 'роутер не дал открыть порт: ' + e.message }; }
  if (!ext || isPrivate(ext)) {
    return { ok: false, gw, port, why: ext ? `у роутера «серый» адрес ${ext} (провайдер не даёт внешний IP) — прямой вход невозможен` : 'роутер не сказал внешний адрес' , cleanup: () => unmap(gw, port) };
  }
  return { ok: true, ip: ext, port, gw, cleanup: () => unmap(gw, port) };
}

function unmap(gw, port) {
  return soap(gw.control, gw.service, 'DeletePortMapping', { NewRemoteHost: '', NewExternalPort: port, NewProtocol: 'TCP' }).catch(() => {});
}

module.exports = { map, isPrivate, localIps };
