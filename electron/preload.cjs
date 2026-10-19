const { contextBridge, ipcRenderer } = require('electron');

const ALLOWED_EVENTS = ['tunnel-state', 'server-state', 'server-log', 'busy-state', 'progress', 'game-state', 'game-log', 'update-state', 'win-state', 'scan-progress', 'toast', 'scores'];
const ALLOWED_PREFIX = /^(sys|settings|accounts|skin|wardrobe|editor|ely|pack|java|mods|worlds|shots|servers|shell|dialog|game|app|net|server|early|games):/;

contextBridge.exposeInMainWorld('vl', {
  async call(channel, ...args) {
    if (!ALLOWED_PREFIX.test(channel)) throw new Error('blocked channel ' + channel);
    const r = await ipcRenderer.invoke(channel, ...args);
    if (!r) return null;
    if (!r.ok) {
      const e = new Error(r.error);
      e.relogin = r.relogin;
      e.needTotp = r.needTotp;
      throw e;
    }
    return r.data;
  },
  on(event, cb) {
    if (!ALLOWED_EVENTS.includes(event)) return () => {};
    const fn = (_e, data) => cb(data);
    ipcRenderer.on(event, fn);
    return () => ipcRenderer.removeListener(event, fn);
  },
  win: {
    minimize: () => ipcRenderer.send('win:minimize'),
    maximize: () => ipcRenderer.send('win:maximize'),
    close: () => ipcRenderer.send('win:close')
  }
});
