// Встраивание окна игры в окно Студии (только Windows, без нативных npm-модулей):
// долгоживущий PowerShell с C#-кодом через P/Invoke (SetParent, SetWindowLongPtr, MoveWindow…), команды — строками в stdin.
// Если PowerShell нет или он не отвечает — available() = false, и Студия раскладывает окна рядом или показывает заглушку.
// Протокол строк: «<id> <команда> <аргументы…>» → «<id> ok <ответ>» | «<id> err <текст>»; при старте помощник пишет «ready».
const { spawn } = require('child_process');

const CS = String.raw`
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class KokkEmbed {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll", SetLastError=true)] static extern IntPtr SetParent(IntPtr c, IntPtr p);
  [DllImport("user32.dll")] static extern IntPtr GetParent(IntPtr h);
  [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW")] static extern IntPtr GetWL(IntPtr h, int i);
  [DllImport("user32.dll", EntryPoint="SetWindowLongPtrW", SetLastError=true)] static extern IntPtr SetWL(IntPtr h, int i, IntPtr v);
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int w, int hh, uint f);
  [DllImport("user32.dll")] static extern bool MoveWindow(IntPtr h, int x, int y, int w, int hh, bool r);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] static extern IntPtr SetFocus(IntPtr h);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern bool AttachThreadInput(uint a, uint b, bool f);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  const int GWL_STYLE = -16;
  const long WS_CHILD = 0x40000000L, WS_POPUP = 0x80000000L, WS_CAPTION = 0x00C00000L, WS_THICKFRAME = 0x00040000L,
             WS_SYSMENU = 0x00080000L, WS_MINIMIZEBOX = 0x00020000L, WS_MAXIMIZEBOX = 0x00010000L, WS_VISIBLE = 0x10000000L;
  const uint SWP_NOZORDER = 0x4, SWP_NOACTIVATE = 0x10, SWP_FRAMECHANGED = 0x20, SWP_SHOWWINDOW = 0x40, SWP_NOMOVE = 0x2, SWP_NOSIZE = 0x1;
  static Dictionary<long, long> origStyle = new Dictionary<long, long>();
  static Dictionary<long, RECT> origRect = new Dictionary<long, RECT>();
  public static void Init() { try { SetProcessDPIAware(); } catch {} }
  static IntPtr H(string s) { return new IntPtr(long.Parse(s)); }
  static int I(string s) { return (int)Math.Round(double.Parse(s, System.Globalization.CultureInfo.InvariantCulture)); }
  public static string Find(uint pid) {
    IntPtr best = IntPtr.Zero; long area = -1; bool bestGlfw = false;
    EnumWindows((h, l) => {
      uint p; GetWindowThreadProcessId(h, out p);
      if (p != pid || !IsWindowVisible(h)) return true;
      var sb = new StringBuilder(64); GetClassName(h, sb, 64);
      bool glfw = sb.ToString().StartsWith("GLFW");
      RECT r; GetWindowRect(h, out r);
      long a = (long)(r.R - r.L) * (r.B - r.T);
      if ((glfw && !bestGlfw) || (glfw == bestGlfw && a > area)) { best = h; area = a; bestGlfw = glfw; }
      return true;
    }, IntPtr.Zero);
    if (best == IntPtr.Zero) throw new Exception("окно игры не найдено");
    return best.ToInt64().ToString();
  }
  public static string Run(string[] a) {
    string c = a.Length > 1 ? a[1] : "";
    switch (c) {
      case "ping": return "pong";
      case "find": return Find(uint.Parse(a[2]));
      case "alive": return IsWindow(H(a[2])) ? "1" : "0";
      case "embed": {
        IntPtr ch = H(a[2]), par = H(a[3]);
        if (!IsWindow(ch)) throw new Exception("окна игры уже нет");
        long k = ch.ToInt64();
        long st = GetWL(ch, GWL_STYLE).ToInt64();
        if (!origStyle.ContainsKey(k)) { origStyle[k] = st; RECT r; GetWindowRect(ch, out r); origRect[k] = r; }
        long ns = (st & ~(WS_POPUP | WS_CAPTION | WS_THICKFRAME | WS_SYSMENU | WS_MINIMIZEBOX | WS_MAXIMIZEBOX)) | WS_CHILD | WS_VISIBLE;
        SetWL(ch, GWL_STYLE, new IntPtr(ns));
        if (SetParent(ch, par) == IntPtr.Zero && GetParent(ch) != par) {
          int e = Marshal.GetLastWin32Error();
          SetWL(ch, GWL_STYLE, new IntPtr(st));
          throw new Exception("SetParent не сработал (код " + e + ")");
        }
        SetWindowPos(ch, IntPtr.Zero, I(a[4]), I(a[5]), Math.Max(1, I(a[6])), Math.Max(1, I(a[7])), SWP_FRAMECHANGED | SWP_SHOWWINDOW);
        return "1";
      }
      case "move": {
        IntPtr ch = H(a[2]);
        SetWindowPos(ch, IntPtr.Zero, I(a[3]), I(a[4]), Math.Max(1, I(a[5])), Math.Max(1, I(a[6])), SWP_NOACTIVATE);
        return "1";
      }
      case "show": ShowWindow(H(a[2]), a[3] == "1" ? 8 : 0); return "1"; // SW_SHOWNA / SW_HIDE
      case "focus": {
        IntPtr ch = H(a[2]);
        uint pid; uint t = GetWindowThreadProcessId(ch, out pid);
        uint me = GetWindowThreadProcessId(GetParent(ch), out pid);
        AttachThreadInput(me, t, true); SetFocus(ch); AttachThreadInput(me, t, false);
        return "1";
      }
      case "undock": {
        IntPtr ch = H(a[2]);
        long k = ch.ToInt64();
        if (!IsWindow(ch)) return "0";
        SetParent(ch, IntPtr.Zero);
        if (origStyle.ContainsKey(k)) SetWL(ch, GWL_STYLE, new IntPtr(origStyle[k]));
        if (a.Length >= 7) SetWindowPos(ch, IntPtr.Zero, I(a[3]), I(a[4]), I(a[5]), I(a[6]), SWP_FRAMECHANGED | SWP_SHOWWINDOW | SWP_NOZORDER);
        else if (origRect.ContainsKey(k)) { RECT r = origRect[k]; SetWindowPos(ch, IntPtr.Zero, r.L, r.T, r.R - r.L, r.B - r.T, SWP_FRAMECHANGED | SWP_SHOWWINDOW | SWP_NOZORDER); }
        else SetWindowPos(ch, IntPtr.Zero, 0, 0, 0, 0, SWP_FRAMECHANGED | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_SHOWWINDOW);
        origStyle.Remove(k); origRect.Remove(k);
        SetForegroundWindow(ch);
        return "1";
      }
      case "place": { MoveWindow(H(a[2]), I(a[3]), I(a[4]), I(a[5]), I(a[6]), true); return "1"; }
      default: throw new Exception("неизвестная команда " + c);
    }
  }
}`;

const PS = `$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
${CS}
'@
[KokkEmbed]::Init()
[Console]::Out.WriteLine('ready'); [Console]::Out.Flush()
while ($true) {
  $l = [Console]::In.ReadLine()
  if ($l -eq $null -or $l -eq 'exit') { break }
  $p = $l.Split(' ')
  try { $r = [KokkEmbed]::Run($p); [Console]::Out.WriteLine($p[0] + ' ok ' + $r) }
  catch { $m = $_.Exception.Message; if ($_.Exception.InnerException) { $m = $_.Exception.InnerException.Message }; [Console]::Out.WriteLine($p[0] + ' err ' + ($m -replace '\\s+', ' ')) }
  [Console]::Out.Flush()
}`;

function createHelper(log) {
  let proc = null;
  let ready = null; // Promise<boolean>
  let dead = false; // окончательно не работает (нет PowerShell)
  let deadWhy = '';
  let seq = 0;
  let buf = '';
  const waiting = new Map();

  function start() {
    if (process.platform !== 'win32') { dead = true; deadWhy = 'встраивание окна работает только в Windows'; return Promise.resolve(false); }
    if (ready) return ready;
    ready = new Promise((resolve) => {
      let done = false;
      const finish = (ok, why) => { if (done) return; done = true; if (!ok) { dead = !!why; deadWhy = why || deadWhy; } resolve(ok); };
      try {
        const enc = Buffer.from(PS, 'utf16le').toString('base64');
        proc = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', enc], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      } catch (e) { proc = null; finish(false, 'PowerShell не запускается: ' + e.message); return; }
      const timer = setTimeout(() => finish(false, 'PowerShell не ответил за 20 секунд'), 20000);
      proc.on('error', (e) => { clearTimeout(timer); proc = null; ready = null; finish(false, 'PowerShell недоступен: ' + e.message); });
      proc.on('exit', (code) => {
        clearTimeout(timer);
        proc = null; ready = null;
        for (const [, w] of waiting) { clearTimeout(w.timer); w.reject(new Error('помощник встраивания закрылся')); }
        waiting.clear();
        finish(false, 'PowerShell закрылся (код ' + code + ')');
      });
      proc.stdin.on('error', () => {}); // PowerShell закрылся — запись в трубу не должна ронять лаунчер
      proc.stderr.setEncoding('utf8');
      proc.stderr.on('data', (d) => log && log('embed: ' + String(d).trim().slice(0, 300)));
      proc.stdout.setEncoding('utf8');
      proc.stdout.on('data', (d) => {
        buf += d;
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (!line) continue;
          if (line === 'ready') { clearTimeout(timer); dead = false; finish(true); continue; }
          const m = /^(\d+) (ok|err) ?(.*)$/.exec(line);
          if (!m) continue;
          const w = waiting.get(m[1]);
          if (!w) continue;
          waiting.delete(m[1]);
          clearTimeout(w.timer);
          if (m[2] === 'ok') w.resolve(m[3]); else w.reject(new Error(m[3] || 'ошибка'));
        }
      });
    });
    return ready;
  }

  async function cmd(...args) {
    const ok = await start();
    if (!ok || !proc) throw new Error(deadWhy || 'помощник встраивания не запущен');
    const id = String(++seq);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { waiting.delete(id); reject(new Error('помощник встраивания не ответил')); }, 6000);
      waiting.set(id, { resolve, reject, timer });
      try { proc.stdin.write(id + ' ' + args.map((a) => String(a).replace(/\s+/g, '_')).join(' ') + '\n'); } catch (e) { clearTimeout(timer); waiting.delete(id); reject(e); }
    });
  }

  return {
    start,
    cmd,
    available: () => !dead && process.platform === 'win32',
    why: () => deadWhy,
    stop() { if (proc) { try { proc.stdin.write('exit\n'); } catch (_) {} const p = proc; setTimeout(() => { try { p.kill(); } catch (_) {} }, 800); } }
  };
}

module.exports = { createHelper, PS_SCRIPT: PS };
