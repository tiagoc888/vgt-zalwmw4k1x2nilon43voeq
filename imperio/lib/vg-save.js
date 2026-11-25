/* vg-save.js v1 — shared module for the Vinogrande daily games (25 Nov 2026).
   ONE file, no dependencies, ES5, safe to load twice. Exposes window.VGSave.
   Features: Lisbon clock (+ fake clock ?vgclock=), rotation day (same source as vg-learn.js),
   save game (vg_save_<game>_v1), cache-loss notice, day lock + locked screen, countdown pill + tomorrow aside,
   midnight flip, weekly special (vg-weekly.json), prize wallet ("Os meus prémios").
   Nothing here talks to Shopify. Wallet codes in tests are dummy codes marked TEST. */
(function (W, d) {
  'use strict';
  if (W.VGSave && W.VGSave.version >= 1) return;
  var VERSION = 1, SCHEMA = 1, DAY = 864e5;
  var qs = (W.location && W.location.search) || '';
  function q(n) { var m = new RegExp('[?&]' + n + '=([^&#]*)').exec(qs); return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : null; }
  function lg(k) { try { return W.localStorage.getItem(k); } catch (e) { return null; } }
  function ls(k, v) { try { W.localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function lr(k) { try { W.localStorage.removeItem(k); } catch (e) {} }
  function sg(k) { try { return W.sessionStorage.getItem(k); } catch (e) { return null; } }
  function ss(k, v) { try { W.sessionStorage.setItem(k, v); } catch (e) {} }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function jparse(s) { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } }

  /* ---------- clock: real time, or a fake clock that keeps ticking from the given instant ---------- */
  // ?vgclock=2026-11-25T23:59:00Z (any ISO instant; a value without zone is read as Lisbon wall time)
  var LOAD = Date.now(), FAKE0 = null;
  (function () { var v = q('vgclock'); if (!v) return; var t = /[zZ]|[+-]\d\d:?\d\d$/.test(v) ? Date.parse(v) : fromLisbonWall(v); if (isFinite(t)) FAKE0 = t; })();
  function now() { return FAKE0 == null ? Date.now() : FAKE0 + (Date.now() - LOAD); }
  function parts(t) { // Lisbon wall-clock parts of an instant (DST-safe via Intl)
    try {
      var f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(t)), o = {};
      for (var i = 0; i < f.length; i++) o[f[i].type] = f[i].value;
      return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second };
    } catch (e) { var D = new Date(t); return { y: D.getUTCFullYear(), m: D.getUTCMonth() + 1, d: D.getUTCDate(), h: D.getUTCHours(), mi: D.getUTCMinutes(), s: D.getUTCSeconds() }; }
  }
  function offsetAt(t) { var p = parts(t); return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(t / 1000) * 1000; }
  function lisbonToUTC(y, m, d0, h, mi) { var g = Date.UTC(y, m - 1, d0, h || 0, mi || 0); var t = g - offsetAt(g); return g - offsetAt(t); } // 2 passes = DST-safe
  function fromLisbonWall(v) { var m = /^(\d{4})-(\d\d)-(\d\d)(?:[T ](\d\d):(\d\d))?/.exec(v); return m ? lisbonToUTC(+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0)) : NaN; }
  function iso(t) { var p = parts(t == null ? now() : t); return p.y + '-' + ('0' + p.m).slice(-2) + '-' + ('0' + p.d).slice(-2); }
  function dayIndex(t) { var p = parts(t == null ? now() : t); return Math.floor(Date.UTC(p.y, p.m - 1, p.d) / DAY); }
  function nextMidnight(t) { var p = parts(t == null ? now() : t); return lisbonToUTC(p.y, p.m, p.d + 1, 0, 0); }
  function msLeft(t) { t = t == null ? now() : t; return Math.max(0, nextMidnight(t) - t); }

  /* ---------- rotation: same source as vg-learn.js ----------
     Source of truth = window.vgGameFor(isoDay) when vg-learn exposes it (1-line patch, see deploy/shared/DESIGN.md).
     Until then this mirrors vg-learn ea803a7d exactly: 24–25 Nov pinned to vindima, from 26 Nov cycle VGA_PUB starting at index 1. */
  /* T 25 Nov 03:36: the game set is exactly these 7 (Lote removed). READY = the ones that may be played now
     (the theme/page sets window.VG_READY; default = only Vindima, the one passing build). A rotation day whose game
     is not in the set or not READY shows the quiet 'no game today' screen; the tomorrow aside is hidden then. */
  var SET = ['vindima', 'golpe', 'estrada', 'imperio', 'aldeia', 'brinde', 'magnata'];
  var READY = (W.VG_READY && W.VG_READY.filter ? W.VG_READY : ['vindima']).filter(function (g) { return SET.indexOf(g) >= 0; });
  var PUB = (W.VGA_PUB && W.VGA_PUB.slice()) || ['vindima', 'lote']; // mirror of vg-learn ea803a7d (rotation source)
  var OVERRIDE = { '2026-11-24': 'vindima', '2026-11-25': 'vindima' };
  function rotationFor(t) { // raw id from the rotation source (may be a game outside the set, e.g. lote)
    var day = iso(t), g = null;
    if (typeof W.vgGameFor === 'function') { try { g = W.vgGameFor(day); } catch (e) { g = null; } }
    if (!g) {
      if (OVERRIDE[day]) g = OVERRIDE[day];
      else { var di = dayIndex(t), D26 = Math.floor(Date.UTC(2026, 10, 26) / DAY); g = di < D26 ? 'vindima' : PUB[(di - D26 + 1) % PUB.length]; }
    }
    return g;
  }
  function gameFor(t) { var g = rotationFor(t); return READY.indexOf(g) >= 0 ? g : null; } // null = no game that day
  var TITLES = {
    vindima: { pt: 'Vindima no Douro', en: 'Douro Harvest', es: 'Vendimia en el Duero' },
    golpe: { pt: 'O Golpe da Cave', en: 'The Cellar Heist', es: 'El Golpe de la Bodega' },
    estrada: { pt: 'Estrada do Douro', en: 'Douro Road', es: 'Carretera del Duero' },
    imperio: { pt: 'Império', en: 'Empire', es: 'Imperio' },
    aldeia: { pt: 'Natal na Aldeia', en: 'Christmas in the Village', es: 'Navidad en la Aldea' },
    brinde: { pt: 'Brinde à Meia-Noite', en: 'Midnight Toast', es: 'Brindis a Medianoche' },
    magnata: { pt: 'Magnata do Douro', en: 'Douro Tycoon', es: 'Magnate del Duero' }
  };
  function title(id, L) { var t = TITLES[id]; return t ? (t[L] || t.pt) : id; }

  /* ---------- language + strings ---------- */
  function lang() { var l = (W.__VGA_LANG || q('lang') || lg('vga_lang') || (d.documentElement.lang || 'pt')).slice(0, 2).toLowerCase(); return l === 'en' || l === 'es' ? l : 'pt'; }
  var S = {
    pt: { cont: 'Continuar', neu: 'Novo jogo', contSub: 'Missões {m} · {p} pontos', saved: 'Progresso guardado', notice: 'O progresso fica guardado só neste navegador. Se limpar a cache ou os dados, ou mudar de dispositivo ou de navegador, perde-o.', ok: 'Percebi', close: 'Fechar',
      left: 'Faltam {n} h', leftM: 'Faltam {n} min', tom: 'Amanhã: {t}', lockH: 'Hoje não é dia deste jogo', lock: 'Este jogo volta na próxima {dia}. Amanhã há outro jogo: {nome}.', lockSoon: 'Este jogo volta {quando}. Amanhã há outro jogo: {nome}.', today: 'Jogar o jogo de hoje: {nome}', tomorrowW: 'amanhã', lockTom: 'Este jogo volta amanhã.', lockNo: 'Este jogo ainda não tem dia marcado.', none: 'Hoje não há jogo. Volte amanhã.', noneH: 'Sem jogo hoje',
      days: ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'], fem: [0, 1, 1, 1, 1, 1, 0],
      wal: 'Os meus prémios', walEmpty: 'Ainda não tem prémios. Termine um jogo com boa pontuação para ganhar um código.', copy: 'Copiar', copied: 'Copiado!', dl: 'Faltam {n} dias', dl1: 'Último dia', exp: 'Expirado', tip: 'Dica: copie o código ou escreva-o num papel.', noStack: 'Os códigos dos jogos não acumulam com outros descontos: só funcionam em encomendas sem outro desconto (portes grátis permitidos).', test: 'TESTE' },
    en: { cont: 'Continue', neu: 'New game', contSub: 'Missions {m} · {p} points', saved: 'Progress saved', notice: 'Progress is saved only in this browser. Clearing the cache or site data, or switching device or browser, loses it.', ok: 'Got it', close: 'Close',
      left: '{n} h left', leftM: '{n} min left', tom: 'Tomorrow: {t}', lockH: 'Today is not this game’s day', lock: 'This game is back next {dia}. Tomorrow there’s another game: {nome}.', lockSoon: 'This game is back {quando}. Tomorrow there’s another game: {nome}.', today: 'Play today’s game: {nome}', tomorrowW: 'tomorrow', lockTom: 'This game is back tomorrow.', lockNo: 'This game has no day scheduled yet.', none: 'No game today. Come back tomorrow.', noneH: 'No game today',
      days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
      wal: 'My prizes', walEmpty: 'No prizes yet. Finish a game with a good score to earn a code.', copy: 'Copy', copied: 'Copied!', dl: '{n} days left', dl1: 'Last day', exp: 'Expired', tip: 'Tip: copy the code or write it down.', noStack: 'Game codes don’t combine with other discounts: they only work on orders with no other discount (free delivery allowed).', test: 'TEST' },
    es: { cont: 'Continuar', neu: 'Nueva partida', contSub: 'Misiones {m} · {p} puntos', saved: 'Progreso guardado', notice: 'El progreso se guarda solo en este navegador. Si borras la caché o los datos, o cambias de dispositivo o de navegador, lo pierdes.', ok: 'Entendido', close: 'Cerrar',
      left: 'Quedan {n} h', leftM: 'Quedan {n} min', tom: 'Mañana: {t}', lockH: 'Hoy no es el día de este juego', lock: 'Este juego vuelve el próximo {dia}. Mañana hay otro juego: {nome}.', lockSoon: 'Este juego vuelve {quando}. Mañana hay otro juego: {nome}.', today: 'Jugar al juego de hoy: {nome}', tomorrowW: 'mañana', lockTom: 'Este juego vuelve mañana.', lockNo: 'Este juego aún no tiene día.', none: 'Hoy no hay juego. Vuelve mañana.', noneH: 'Sin juego hoy',
      days: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
      wal: 'Mis premios', walEmpty: 'Aún no tienes premios. Termina un juego con buena puntuación para ganar un código.', copy: 'Copiar', copied: '¡Copiado!', dl: 'Quedan {n} días', dl1: 'Último día', exp: 'Caducado', tip: 'Consejo: copia el código o apúntalo.', noStack: 'Los códigos de los juegos no se combinan con otros descuentos: solo funcionan en pedidos sin otro descuento (envío gratis permitido).', test: 'PRUEBA' }
  };
  function t(k, o, L) { var s = (S[L || lang()] || S.pt)[k]; s = s == null ? S.pt[k] : s; if (o) for (var x in o) s = String(s).split('{' + x + '}').join(o[x]); return s; }

  /* ---------- preview bypass (?vgq=, ?vgpreview=1, Shopify preview links) ---------- */
  function preview() { return !!(q('vgq') || q('vgpreview') === '1' || q('preview_theme_id') || q('vgclockbypass') === '1' || W.__VG_PREVIEW); }

  /* ---------- save game ---------- */
  function key(game) { return 'vg_save_' + game + '_v1'; }
  function valid(o, game) { return o && typeof o === 'object' && o.schema === SCHEMA && o.game === game && Array.isArray(o.missions) && typeof o.points === 'number' && isFinite(o.points) && (o.cp == null || typeof o.cp === 'object') && (o.settings == null || typeof o.settings === 'object'); }
  function load(game) { var o = jparse(lg(key(game))); if (!o) return null; if (!valid(o, game)) { lr(key(game)); return null; } return o; } // schema guard: a bad/old save is dropped, never crashes the game
  function blank(game) { return { schema: SCHEMA, game: game, missions: [], cp: null, points: 0, settings: {}, tutorialDone: false, day: iso(), savedAt: now() }; }
  function save(game, patch) { var o = load(game) || blank(game); for (var k in patch) if (patch.hasOwnProperty(k)) o[k] = patch[k]; o.schema = SCHEMA; o.game = game; o.savedAt = now(); var ok = ls(key(game), JSON.stringify(o)); if (ok) toast(t('saved')); return o; }
  function clear(game) { var o = load(game); lr(key(game)); if (o && (o.settings || o.tutorialDone)) ls(key(game), JSON.stringify({ schema: SCHEMA, game: game, missions: [], cp: null, points: 0, settings: o.settings || {}, tutorialDone: !!o.tutorialDone, day: iso(), savedAt: now() })); }
  function hasProgress(o) { return !!(o && (o.missions.length || o.points > 0 || o.cp)); }

  /* ---------- UI helpers ---------- */
  function el(tag, cls, html, parent) { var e = d.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; if (parent) parent.appendChild(e); return e; }
  var toastT = 0;
  function toast(msg) { var host = d.querySelector('.vga-modal') || d.body; if (!host) return; var e = host.querySelector('.vgs-toast') || el('div', 'vgs-toast', '', host); e.textContent = '✓ ' + msg; e.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { e.classList.remove('on'); }, 1600); }

  // cache-loss notice: on start (dismissible, once per session) and as a static line for menus
  function noticeHTML(L) { return '<p class="vgs-note">' + esc(t('notice', null, L)) + '</p>'; }
  function notice(host, opts) {
    opts = opts || {}; if (!opts.force && sg('vgs_notice_x')) return null;
    var n = el('div', 'vgs-notice' + (opts.inline ? ' vgs-notice--inline' : ''), '<span class="vgs-notice__i" aria-hidden="true">i</span><p>' + esc(t('notice')) + '</p><button type="button" class="vgs-notice__x" aria-label="' + esc(t('close')) + '">' + esc(t('ok')) + '</button>', host);
    n.setAttribute('role', 'status');
    n.querySelector('button').addEventListener('click', function () { ss('vgs_notice_x', '1'); n.remove(); });
    return n;
  }

  // start: "Continuar" / "Novo jogo" when a save exists; resolves with the save to resume or null for a fresh game
  function startChoice(host, game, cb) {
    var o = load(game);
    if (!hasProgress(o)) { cb(null); return null; }
    var box = el('div', 'vgs-start', '<div class="vgs-card" role="dialog" aria-modal="true"><h3>' + esc(title(game, lang())) + '</h3>' +
      '<button type="button" class="vgs-btn vgs-btn--main" data-c>' + esc(t('cont')) + '<small>' + esc(t('contSub', { m: o.missions.length, p: o.points })) + '</small></button>' +
      '<button type="button" class="vgs-btn" data-n>' + esc(t('neu')) + '</button>' + noticeHTML() + '</div>', host);
    box.querySelector('[data-c]').addEventListener('click', function () { box.remove(); cb(o); });
    box.querySelector('[data-n]').addEventListener('click', function () { clear(game); box.remove(); cb(null); });
    return box;
  }

  /* ---------- day lock ---------- */
  function nextDayOf(game, from) { for (var i = 1; i <= 21; i++) { var tt = from + i * DAY; if (gameFor(tt) === game) return tt; } return null; }
  function allowed(game, t0) { return preview() || (!!game && gameFor(t0 == null ? now() : t0) === game); }
  function lockText(game, L) {
    L = L || lang(); var n0 = now(), back = nextDayOf(game, n0), tomorrow = gameFor(n0 + DAY), nm = tomorrow ? title(tomorrow, L) : null;
    var tail = function (s) { return nm ? s : s.replace(/ (Amanhã|Tomorrow|Mañana)[^.]*\./, ''); };
    if (tomorrow === game) return t('lockTom', null, L);
    if (back == null) return t('lockNo', null, L) + (nm ? ' ' + t('lock', { dia: '', nome: nm }, L).replace(/^.*?\. /, '') : '');
    var p = parts(back), wd = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay(), dia = S[L].days[wd];
    var s = tail(t('lock', { dia: dia, nome: nm || '' }, L));
    if (L === 'pt' && S.pt.fem[wd] === 0) s = s.replace('na próxima', 'no próximo');
    return s;
  }
  // gate(host, game, opts): returns true when the game may start; otherwise draws the locked screen (save kept)
  function gate(host, game, opts) {
    opts = opts || {}; if (allowed(game)) return true;
    var L = lang(), today = gameFor(), body;
    if (today) body = '<h3>' + esc(t('lockH', null, L)) + '</h3><p>' + esc(lockText(game, L)) + '</p><button type="button" class="vgs-btn vgs-btn--main" data-today="' + esc(today) + '">' + esc(t('today', { nome: title(today, L) }, L)) + '</button>';
    else body = '<h3>' + esc(t('noneH', null, L)) + '</h3><p>' + esc(t('none', null, L)) + '</p>'; // quiet: never points to a game outside the set
    var box = el('div', 'vgs-lock' + (today ? '' : ' vgs-lock--none'), '<div class="vgs-card" role="dialog" aria-modal="true"><div class="vgs-lock__k">' + esc(title(game, L)) + '</div>' + body +
      (opts.onExit ? '<button type="button" class="vgs-btn" data-x>' + esc(t('close', null, L)) + '</button>' : '') + noticeHTML(L) + '</div>', host);
    var b = box.querySelector('[data-today]'); if (b) b.addEventListener('click', function () { if (opts.openGame) opts.openGame(today); else if (W.vgPlay) W.vgPlay(today); });
    var x = box.querySelector('[data-x]'); if (x) x.addEventListener('click', function () { box.remove(); opts.onExit(); });
    return false;
  }
  // midnight flip: a game started before 00:00 keeps running; at the next menu/reload the lock applies
  var STARTED = null;
  function markStarted(game) { STARTED = { game: game, day: iso() }; }
  function dayChanged() { return !!(STARTED && STARTED.day !== iso()); }
  function atMenu(host, game, opts) { if (dayChanged() && !preview()) return gate(host, game, opts); return true; }

  /* ---------- countdown pill + tomorrow aside ---------- */
  function leftText(L) { var m = Math.ceil(msLeft() / 6e4); return m > 60 ? t('left', { n: Math.floor(m / 60) }, L) : t('leftM', { n: Math.max(1, m) }, L); }
  function timer(host, opts) {
    opts = opts || {}; var L = lang();
    var w = el('div', 'vgs-timer' + (opts.pos ? ' vgs-timer--' + opts.pos : ''), '<span class="vgs-timer__pill" aria-live="off"></span><span class="vgs-timer__tom"></span>', host);
    w.setAttribute('aria-label', 'timer');
    function upd() { w.firstChild.textContent = '⏳ ' + leftText(L); var tg = gameFor(nextMidnight() + 60e3); w.lastChild.textContent = tg ? t('tom', { t: title(tg, L) }, L) : ''; w.lastChild.style.display = tg ? '' : 'none'; }
    upd(); var iv = setInterval(upd, 60e3); // once a minute, never per frame
    var al = setTimeout(function al2() { upd(); al = setTimeout(al2, Math.max(1e3, msLeft() % 6e4 || 6e4)); }, msLeft() % 6e4 || 6e4); // also re-align at minute edges
    return { el: w, update: upd, destroy: function () { clearInterval(iv); clearTimeout(al); w.remove(); } };
  }

  /* ---------- weekly special ---------- */
  var weekly = null;
  function loadWeekly(url, cb) {
    if (W.VG_WEEKLY) { weekly = activeSpecial(W.VG_WEEKLY); cb && cb(weekly); return; }
    try {
      var x = new XMLHttpRequest(); x.open('GET', url || 'vg-weekly.json', true); x.timeout = 4000;
      x.onload = function () { weekly = x.status < 300 ? activeSpecial(jparse(x.responseText)) : null; cb && cb(weekly); };
      x.onerror = x.ontimeout = function () { weekly = null; cb && cb(null); }; x.send();
    } catch (e) { cb && cb(null); }
  }
  function activeSpecial(cfg) {
    if (!cfg) return null; var list = Array.isArray(cfg.specials) ? cfg.specials : [cfg], n0 = now();
    for (var i = 0; i < list.length; i++) { var s = list[i]; if (!s || !s.id) continue; var a = fromLisbonWall(s.startsAt || ''), b = fromLisbonWall(s.endsAt || ''); if (isFinite(a) && isFinite(b) && n0 >= a && n0 < b) return s; }
    return null;
  }
  function special(game) { if (!weekly) return null; var h = (weekly.games || {})[game] || {}; return { id: weekly.id, theme: weekly.theme || {}, title: weekly.title, blurb: weekly.blurb, mission: h.mission || null, decor: h.decor || null, banner: h.banner || null, bonus: h.bonus || null, products: h.products || weekly.products || [], rewardNote: weekly.rewardNote }; }
  function applyTheme(host) { if (!weekly || !weekly.theme || !host) return; var th = weekly.theme; host.classList.add('vgs-sp', 'vgs-sp--' + weekly.id); for (var k in (th.palette || {})) host.style.setProperty('--vgs-' + k, th.palette[k]); }

  /* ---------- prize wallet ---------- */
  var WK = 'vg_wallet_v1';
  function wallet() { var a = jparse(lg(WK)); return Array.isArray(a) ? a.filter(function (c) { return c && typeof c.code === 'string' && isFinite(c.expiresAt); }) : []; }
  function addPrize(p) { // p: {code, pct, game, event, test, days?}
    var a = wallet(); for (var i = 0; i < a.length; i++) if (a[i].code === p.code) return a[i];
    var e = { code: String(p.code), pct: Math.min(15, Math.max(0, +p.pct || 0)), game: p.game || '', event: p.event || '', test: !!p.test, earnedAt: now(), expiresAt: p.expiresAt || now() + (p.days || 30) * DAY };
    a.unshift(e); ls(WK, JSON.stringify(a.slice(0, 50))); return e;
  }
  function walletHTML(L) {
    L = L || lang(); var a = wallet(), n0 = now(), h = '<div class="vgs-wal"><h3>' + esc(t('wal', null, L)) + '</h3>';
    if (!a.length) h += '<p class="vgs-wal__empty">' + esc(t('walEmpty', null, L)) + '</p>';
    for (var i = 0; i < a.length; i++) {
      var c = a[i], left = Math.ceil((c.expiresAt - n0) / DAY), ex = c.expiresAt <= n0;
      h += '<div class="vgs-wal__c' + (ex ? ' is-exp' : '') + '"><div class="vgs-wal__m"><b>' + esc(c.pct) + '%</b> · ' + esc(title(c.game, L)) + (c.event ? ' · ' + esc(c.event) : '') + (c.test ? ' <em class="vgs-test">' + esc(t('test', null, L)) + '</em>' : '') +
        '<span>' + esc(ex ? t('exp', null, L) : left <= 1 ? t('dl1', null, L) : t('dl', { n: left }, L)) + '</span></div><code>' + esc(c.code) + '</code>' +
        (ex ? '' : '<button type="button" class="vgs-btn vgs-copy" data-code="' + esc(c.code) + '">' + esc(t('copy', null, L)) + '</button>') + '</div>';
    }
    return h + '<p class="vgs-note">' + esc(t('noStack', null, L)) + '</p><p class="vgs-note">' + esc(t('tip', null, L)) + '</p>' + noticeHTML(L) + '</div>';
  }
  function walletPanel(host) {
    var p = el('div', 'vgs-walp', '<div class="vgs-card" role="dialog" aria-modal="true">' + walletHTML() + '<button type="button" class="vgs-btn" data-x>' + esc(t('close')) + '</button></div>', host);
    p.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('.vgs-copy');
      if (b) { var c = b.getAttribute('data-code'); try { navigator.clipboard.writeText(c); } catch (er) {} b.textContent = t('copied'); return; }
      if (e.target.closest && e.target.closest('[data-x]')) p.remove();
    });
    return p;
  }

  W.VGSave = {
    version: VERSION, schema: SCHEMA,
    now: now, parts: parts, iso: iso, msLeft: msLeft, nextMidnight: nextMidnight, lisbonToUTC: lisbonToUTC,
    gameFor: gameFor, rotationFor: rotationFor, title: title, titles: TITLES, set: SET, ready: READY, published: PUB, lang: lang, t: t, preview: preview,
    load: load, save: save, clear: clear, key: key, startChoice: startChoice, notice: notice, noticeHTML: noticeHTML,
    allowed: allowed, gate: gate, lockText: lockText, markStarted: markStarted, dayChanged: dayChanged, atMenu: atMenu,
    timer: timer, leftText: leftText, loadWeekly: loadWeekly, special: special, applyTheme: applyTheme, activeSpecial: activeSpecial,
    wallet: wallet, addPrize: addPrize, walletHTML: walletHTML, walletPanel: walletPanel, toast: toast
  };
})(window, document);
