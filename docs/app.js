// Новости и версии с GitHub. Всё выводится через textContent — никакого HTML из сети.
(function () {
  'use strict';
  const PACK = 'kokkas56/MineVillagers-pack';
  const LAUNCHER = 'kokkas56/VillagersLauncher';

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const fmtDate = (d) => new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

  async function gh(path) {
    const key = 'gh:' + path;
    try {
      const c = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (c && Date.now() - c.t < 5 * 60e3) return c.d;
    } catch (_) {}
    const res = await fetch('https://api.github.com/repos/' + path, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const d = await res.json();
    try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), d })); } catch (_) {}
    return d;
  }

  function renderNews(list) {
    const box = document.getElementById('news-list');
    box.textContent = '';
    const items = list.filter((r) => !r.draft && /^pack-\d+$/.test(r.tag_name)).slice(0, 8);
    if (!items.length) {
      box.appendChild(el('p', 'empty', 'Новостей пока нет — они появятся с первым обновлением сборки.'));
      return;
    }
    items.forEach((r, i) => {
      const art = el('article', 'news-item' + (i === 0 ? ' latest' : ''));
      const head = el('div', 'news-head');
      const num = r.tag_name.replace('pack-', '#');
      head.appendChild(el('span', 'news-ver', num));
      head.appendChild(el('h3', null, (r.name || '').replace(/^#\d+\s*/, '') || 'Обновление'));
      head.appendChild(el('time', null, fmtDate(r.published_at || r.created_at)));
      art.appendChild(head);
      const body = (r.body || '').split('\n—\n')[0].trim();
      if (body) art.appendChild(el('p', null, body));
      const stats = /Добавлено: (\d+), изменено: (\d+), удалено: (\d+)/.exec(r.body || '');
      if (stats) {
        const s = el('div', 'news-stats');
        if (+stats[1]) s.appendChild(el('span', 'tag add', '+' + stats[1] + ' файлов'));
        if (+stats[2]) s.appendChild(el('span', 'tag chg', '~' + stats[2] + ' изменено'));
        if (+stats[3]) s.appendChild(el('span', 'tag del', '−' + stats[3] + ' убрано'));
        if (s.childNodes.length) art.appendChild(s);
      }
      box.appendChild(art);
    });
    const latest = items[0];
    const pv = document.getElementById('pack-version');
    if (pv) pv.textContent = 'сборка ' + latest.tag_name.replace('pack-', '#');
  }

  async function load() {
    try {
      renderNews(await gh(PACK + '/releases?per_page=20'));
    } catch (e) {
      const box = document.getElementById('news-list');
      box.textContent = '';
      box.appendChild(el('p', 'empty', 'Не удалось загрузить новости. Они есть в лаунчере во вкладке «Новости».'));
    }
    try {
      const r = await gh(LAUNCHER + '/releases/latest');
      const v = document.getElementById('launcher-version');
      if (v && r.tag_name) {
        const asset = (r.assets || []).find((a) => /\.exe$/i.test(a.name));
        v.textContent = 'Версия ' + r.tag_name.replace(/^v/, '') + ' · Windows 10/11' + (asset ? ' · ' + Math.round(asset.size / 1048576) + ' МБ' : '');
      }
    } catch (_) {}
  }

  // плавная подсветка пунктов меню
  function spy() {
    const links = [...document.querySelectorAll('.top nav a')];
    const secs = links.map((a) => document.querySelector(a.getAttribute('href'))).filter(Boolean);
    const onScroll = () => {
      let cur = null;
      for (const s of secs) if (s.getBoundingClientRect().top < 140) cur = s.id;
      links.forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#' + cur));
      document.querySelector('.top').classList.toggle('scrolled', window.scrollY > 20);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  window.addEventListener('DOMContentLoaded', () => { load(); spy(); });
})();
