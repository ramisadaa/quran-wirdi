/* No network: exercise both browser currency paths with controlled responses. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../js/currency.js'), 'utf8');
const initial = { base: 'USD', date: '2026-11-04', fetchedAt: '2026-11-04T08:15:00Z',
  provider: 'exchangerate.host', providerUrl: 'https://exchangerate.host/',
  quotes: { USD: 1, ILS: 3.2, EUR: 0.9, JOD: 0.709 } };
const free = { date: '2026-11-05', usd: { usd: 1, ils: 3.3, eur: 0.91, jod: 0.71 } };
const cacheKey = 'dailyDashboard.sharedExchange.v1';
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise(setImmediate); };

function setup({ cached, mode = 'good', siteDown = false, hold = false } = {}) {
  const requests = [], elements = new Map(), storage = new Map(), events = new Map();
  let held, site = structuredClone(initial), base = 'ILS';
  if (cached) storage.set(cacheKey, JSON.stringify(cached));
  function element(id) {
    if (!elements.has(id)) elements.set(id, { textContent: '', href: '', disabled: false,
      dataset: {}, attrs: {}, addEventListener(name, callback) { this[name] = callback; },
      setAttribute(key, value) { this.attrs[key] = value; },
      removeAttribute(key) { delete this.attrs[key]; if (key === 'href') this.href = ''; },
      closest() { return this.row ||= { hidden: false }; },
      click() { if (!this.disabled) this.clickHandler(); } });
    return elements.get(id);
  }
  const refresh = element('refreshCurrency');
  refresh.addEventListener = (name, callback) => { if (name === 'click') refresh.clickHandler = callback; };
  const app = {
    read(key, fallback = null) { return key === 'dailyDashboard.view.v1' ? { currencyBase: base } : storage.has(key) ? JSON.parse(storage.get(key)) : fallback; },
    write(key, value) { storage.set(key, JSON.stringify(value)); },
    dateLabel() { return 'وقت الجلب'; },
    on(name, fn) { events.set('dashboard:' + name, fn); },
    async getJSON(url) { return (await fetch(url)).json(); }
  };
  const document = { baseURI: 'https://example.org/project/index.html',
    currentScript: { src: 'https://example.org/project/js/currency.js' },
    getElementById: element, hidden: false, addEventListener(name, fn) { events.set(name, fn); } };
  const window = { Dashboard: app, addEventListener(name, fn) { events.set(name, fn); } };
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : ['2026-11-05T12:00:00Z'])); } static now() { return Date.parse('2026-11-05T12:00:00Z'); } }
  const response = (value) => ({ ok: true, json: async () => structuredClone(value) });
  async function fetch(url) {
    requests.push(String(url));
    const u = new URL(url);
    assert.notEqual(u.hostname, 'api.exchangerate.host', 'Visitor must never call the account API');
    if (u.hostname === 'example.org') {
      assert.equal(u.pathname, '/project/data/exchange-rates.json');
      if (siteDown) throw new Error('offline');
      return response({ latest: site });
    }
    assert(u.hostname === 'cdn.jsdelivr.net' || /^\d{4}-\d{2}-\d{2}\.currency-api\.pages\.dev$/.test(u.hostname));
    assert(!url.includes('@latest'));
    if (hold) await new Promise(resolve => { held = resolve; });
    const primary = u.hostname === 'cdn.jsdelivr.net';
    if (mode === 'unpublished') { const error = new Error('not published'); error.status = 404; throw error; }
    if (mode === 'bothDown' || mode === 'primaryDown' && primary) throw new Error('free unavailable');
    const payload = structuredClone(free);
    if (mode === 'badPrimary' && primary || mode === 'bothBad') payload.usd.jod = 0;
    if (mode === 'same') payload.date = initial.date;
    if (mode === 'deviation') payload.usd.ils = 4.5;
    if (mode === 'tiny') payload.usd.jod = .0001;
    if (mode === 'old') payload.date = '2026-11-03';
    if (mode === 'future') payload.date = '2050-01-01';
    if (mode === 'invalidDate') payload.date = '2026-11-31';
    if (mode === 'missing') delete payload.usd.ils;
    return response(payload);
  }
  vm.runInNewContext(source, { window, document, URL, Intl, Date: Clock, AbortController, fetch, setTimeout, clearTimeout });
  return { get: element, requests, storage, setMode(value) { mode = value; },
    setSite(value) { site = value; }, setBase(value) { base = value; events.get('dashboard:view')(); },
    event(name) { events.get(name)?.(); }, release() { hold = false; held(); } };
}

(async () => {
  const a = setup(); await flush();
  assert.equal(a.requests.length, 1, 'Opening fetches only the site JSON');
  assert.equal(a.get('currencySource').textContent, 'exchangerate.host');
  const centralCache = a.storage.get(cacheKey);
  a.get('refreshCurrency').click(); a.get('refreshCurrency').click(); await flush();
  assert.equal(a.requests.filter(url => url.includes('currency-api@')).length, 1);
  assert.equal(a.get('currencyBadge').textContent, 'مجاني');
  assert.equal(a.get('currencySource').textContent, 'Currency API');
  assert(a.get('currencyStatus').textContent.includes('تحديث مجاني أحدث'));
  assert.equal(a.get('rateUSD').textContent, '₪3.30');
  assert.equal(a.storage.get(cacheKey), centralCache, 'Personal result must not overwrite central cache');
  a.setBase('USD'); assert.equal(a.get('rateUSD').textContent, '$1.00'); assert(a.get('rateUSD').row.hidden);
  const before = a.requests.length; a.event('online'); a.event('visibilitychange'); await flush();
  assert(a.requests.slice(before).every(url => url.startsWith('https://example.org/')));
  assert.equal(a.get('currencyBadge').textContent, 'مجاني', 'Background site reads must not replace the chosen personal result');
  a.setMode('bothDown'); a.get('refreshCurrency').click(); await flush();
  assert.equal(a.get('currencySource').textContent, 'exchangerate.host');
  assert(a.get('currencyStatus').textContent.includes('الأسعار المشتركة'));
  assert.equal(a.storage.get(cacheKey), centralCache);
  assert(!a.get('refreshCurrency').disabled);

  for (const mode of ['primaryDown', 'badPrimary']) {
    const b = setup({ mode }); await flush(); b.get('refreshCurrency').click(); await flush();
    assert.equal(b.get('currencyBadge').textContent, 'مجاني');
    assert.equal(b.requests.filter(url => !url.startsWith('https://example.org/')).length, 2, 'Try free mirror only after primary failure');
  }
  for (const mode of ['bothBad', 'old', 'same', 'future', 'invalidDate', 'missing', 'deviation', 'tiny', 'unpublished']) {
    const b = setup({ mode }); await flush(); b.get('refreshCurrency').click(); await flush();
    assert.equal(b.get('currencySource').textContent, 'exchangerate.host', mode);
    assert.equal(b.get('rateUSD').textContent, '₪3.20', mode);
    if (mode === 'unpublished') assert(b.get('currencyStatus').textContent.includes('لم تنشر'));
    if (['same', 'old'].includes(mode)) assert(b.get('currencyStatus').textContent.includes('لا توجد بيانات أحدث'));
    if (['deviation', 'tiny'].includes(mode)) assert(b.get('currencyStatus').textContent.includes('غير معتادة'));
  }
  const offline = setup({ cached: initial, siteDown: true, mode: 'bothDown' }); await flush();
  offline.get('refreshCurrency').click(); await flush();
  assert.equal(offline.get('rateUSD').textContent, '₪3.20');
  assert(offline.get('currencyStatus').textContent.includes('محفوظة'));
  const empty = setup({ siteDown: true, mode: 'bothDown' }); await flush();
  empty.get('refreshCurrency').click(); await flush();
  assert(empty.get('currencyStatus').textContent.includes('لا توجد نسخة مشتركة'));
  const noSite = setup({ siteDown: true }); await flush(); noSite.get('refreshCurrency').click(); await flush();
  assert.equal(noSite.get('currencyBadge').textContent, 'مجاني');
  const held = setup({ hold: true }); await flush(); held.get('refreshCurrency').click(); await flush();
  assert(held.get('refreshCurrency').disabled);
  held.get('refreshCurrency').click(); assert.equal(held.requests.length, 2);
  held.release(); await flush(); assert(!held.get('refreshCurrency').disabled);
  const reload = setup({ cached: JSON.parse(centralCache) }); await flush();
  assert.equal(reload.get('currencyBadge').textContent, 'مشترك');
  assert.equal(reload.requests.length, 1);
  const newer = setup(); await flush(); newer.get('refreshCurrency').click(); await flush();
  newer.setSite({ ...initial, date: '2026-11-05' }); newer.event('online'); await flush();
  assert.equal(newer.get('currencyBadge').textContent, 'مشترك');
  console.log('PASS: central-only startup; personal free refresh and mirror; no account API; no duplicate clicks; dated endpoints; no-change for same date; reject >20% deviation; source/date display; cached/default fallback on network errors, malformed or older data; independent cache; base changes; reload; background races.');
})().catch(error => { console.error(error); process.exitCode = 1; });
