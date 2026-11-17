/* Hábitos · hábitos con meta, pendientes, calendario (Google Calendar) y avisos dentro de la app. Los datos van a tu hoja «Fergard · Hábitos». */
(function () {
  "use strict";
  var CFG = window.FG_CFG || {}, VERSION = "0.7.0", DB_KEY = "habitos_db", H = window.HCore;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var LS = (function () { try { localStorage.setItem("_t", "1"); localStorage.removeItem("_t"); return localStorage; } catch (e) { var m = {}; return { getItem: function (k) { return m[k] || null; }, setItem: function (k, v) { m[k] = String(v); }, removeItem: function (k) { delete m[k]; } }; } })();
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function p2(n) { return (n < 10 ? "0" : "") + n; }

  /* ---------- datos locales y nube ---------- */
  function vacia() { return { v: 1, habitos: {}, registros: {}, tareas: {}, metas: {}, diario: {}, ajustes: { rec: true }, pend: {}, sync: { ult: 0 } }; }
  function cargar() { var d; try { d = JSON.parse(LS.getItem(DB_KEY)); } catch (e) { d = null; } if (!d || typeof d !== "object") d = vacia(); var b = vacia(); Object.keys(b).forEach(function (k) { if (d[k] === undefined) d[k] = b[k]; }); return d; }
  var db = cargar();
  var S = { tab: "hoy", pv: "fecha", pf: "todas", hv: "hab", cal: "sem", dia: H.hoy(), lista: "", ev: [], evR: {}, evErr: "", cargando: false, sync: "", hd: null, qa: null, snooze: {}, hord: false, enf: null };
  function save() { try { LS.setItem(DB_KEY, JSON.stringify(db)); } catch (e) {} }
  function touch(t, id, o) { if (o) o.upd = Date.now(); db.pend[t + ":" + id] = Date.now(); save(); schedSync(); }
  function mapa(t) { return t === "habito" ? db.habitos : t === "registro" ? db.registros : t === "tarea" ? db.tareas : t === "meta" ? db.metas : t === "diario" ? db.diario : null; }
  function quitar(t, id) { var m = mapa(t); delete m[id]; db.pend[t + ":" + id] = Date.now(); save(); schedSync(); }
  function cfg() { return window.FergardAcceso ? FergardAcceso.config() : { token: null, url: null }; }
  function post(url, body) { return fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) }).then(function (r) { return r.json(); }); }
  function docsPend() {
    return Object.keys(db.pend).map(function (k) {
      var i = k.indexOf(":"), t = k.slice(0, i), id = k.slice(i + 1), m = mapa(t), d = t === "ajustes" ? db.ajustes : m && m[id];
      return { t: t, id: id, upd: (d && d.upd) || db.pend[k], del: !d, d: d || {} };
    });
  }
  function aplicar(docs) {
    var n = 0;
    (docs || []).forEach(function (r) {
      if (r.t === "ajustes") { if ((db.ajustes.upd || 0) < r.upd && !db.pend["ajustes:" + r.id]) { db.ajustes = r.d; db.ajustes.upd = r.upd; n++; } return; }
      var m = mapa(r.t); if (!m) return;
      var l = m[r.id]; if (l && (l.upd || 0) >= r.upd) return; if (db.pend[r.t + ":" + r.id] && !l && !r.del) return;
      if (r.del) delete m[r.id]; else { r.d.upd = r.upd; m[r.id] = r.d; } n++;
    });
    return n;
  }
  var syncing = false, syncT = null;
  function schedSync() { clearTimeout(syncT); syncT = setTimeout(function () { sync(false); }, 1200); pintarNube(); }
  function sync(manual) {
    var c = cfg(); if (!c.token || !c.url) return Promise.resolve();
    if (syncing) return Promise.resolve(); syncing = true;
    var env = docsPend(), claves = Object.keys(db.pend), t0 = Date.now();
    return post(c.url, { op: "habitos_sync", app: "habitos", token: c.token, since: db.sync.ult || 0, docs: env }).then(function (r) {
      if (!r || !r.ok) { S.sync = r && r.error === "operacion_desconocida" ? "El script no tiene la versión con Hábitos (actualízalo)" : "Pendiente (" + ((r && r.error) || "error") + ")"; if (manual) toast(S.sync); return; }
      var entiende = r.tipos || ["habito", "registro", "tarea", "ajustes"], sinSubir = 0;
      claves.forEach(function (k) { if (entiende.indexOf(k.slice(0, k.indexOf(":"))) < 0) { sinSubir++; return; } if (db.pend[k] <= t0) delete db.pend[k]; });
      var n = aplicar(r.docs); db.sync.ult = r.ahora || t0; db.sync.ok = Date.now(); if (r.url) db.sync.url = r.url; save();
      S.sync = sinSubir ? "Actualiza el script de Fergard (v0.7.0) para guardar metas y diario" : "Al día"; if (manual) toast(S.sync); if (n) pintar();
    }).catch(function () { S.sync = "Sin conexión · se subirá después"; if (manual) toast("Sin conexión"); }).then(function () { syncing = false; pintarNube(); });
  }
  window.addEventListener("online", function () { sync(false); });
  document.addEventListener("visibilitychange", function () { if (!document.hidden) { sync(false); S.dia = S.dia || H.hoy(); syncGym(); syncIdiomas(); tickEnf(); revisar(); buscarActualizacion(); } });

  function toast(t) { var e = $("#toast"); e.textContent = t; e.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(function () { e.classList.remove("on"); }, 2600); }
  function ico(n) {
    var p = { hoy: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>', pend: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>', cal: '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>', hab: '<path d="M4 12a8 8 0 0 1 14-5.3L20 9"/><path d="M20 4v5h-5"/><path d="M20 12a8 8 0 0 1-14 5.3L4 15"/><path d="M4 20v-5h5"/>', prog: '<path d="M5 20V11M12 20V5M19 20v-7"/>',
      set: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>', chk: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', izq: '<path d="M15 5l-7 7 7 7"/>', der: '<path d="M9 5l7 7-7 7"/>' };
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' + (p[n] || "") + "</svg>";
  }
  function fLargo(f) { var d = H.pf(f); return cap(H.DIAS[H.dow(f) - 1]) + " " + d.getDate() + " de " + H.MESES[d.getMonth()]; }
  function fCorto(f) { var d = H.pf(f); return H.DIAS[H.dow(f) - 1].slice(0, 3) + " " + d.getDate() + " " + H.MESES[d.getMonth()].slice(0, 3); }
  function fRel(f) { var h = H.hoy(); return f === h ? "Hoy" : f === H.addD(h, 1) ? "Mañana" : f === H.addD(h, -1) ? "Ayer" : fCorto(f); }

  /* ---------- hábitos: valores ---------- */
  function listaHab() { return Object.keys(db.habitos).map(function (k) { return db.habitos[k]; }).sort(function (a, b) { return (a.orden || 0) - (b.orden || 0) || (a.upd || 0) - (b.upd || 0); }); }
  function paso(h) { var m = h.meta || 1; return m <= 20 ? 1 : m <= 60 ? 5 : m <= 200 ? 10 : m <= 1000 ? 50 : 500; }
  function setValor(h, f, v) {
    v = Math.max(0, Math.round(v)); var m = f.slice(0, 7), k = h.id + "|" + m, r = db.registros[k] || (db.registros[k] = { h: h.id, hn: h.n, meta: h.meta || 1, m: m, v: {} });
    r.hn = h.n; r.meta = h.meta || 1; if (v > 0) r.v[f.slice(8)] = v; else delete r.v[f.slice(8)]; touch("registro", k, r);
  }
  function textoRacha(h) { var r = H.racha(h, db, H.hoy()), sem = h.frec && h.frec.t === "sem"; return r >= 2 ? '<span class="racha">🔥 ' + r + (sem ? " semanas" : " días") + "</span>" : ""; }
  function subHab(h, sinRacha) {
    var f = H.hoy(), partes = [];
    if (sinRacha && H.cumplido(h, H.valor(db, h.id, f))) partes.push("Hecho");
    if (h.tipo === "gym") partes.push("💪 Se marca solo con tu app Gym"); if (h.tipo === "idioma") partes.push("🗣️ Se marca solo con tu app Idiomas");
    if (h.tipo === "cant") partes.push("Meta " + h.meta + " " + esc(h.un || ""));
    if (h.frec && h.frec.t === "sem") partes.push(H.hechosSemana(h, db, f) + "/" + h.frec.n + " esta semana"); else if (h.frec && h.frec.t === "dias") partes.push(esc(H.textoFrec(h)));
    var r = sinRacha ? "" : textoRacha(h); if (r) partes.push(r); if (h.hora) partes.push("Recordatorio a las " + esc(h.hora));
    return partes.join(" · ") || "Cada día";
  }
  function flama(h) { var r = H.racha(h, db, H.hoy()), sem = h.frec && h.frec.t === "sem"; return r >= 1 ? '<span class="fl">🔥 ' + r + (sem ? (r === 1 ? " semana" : " semanas") : (r === 1 ? " día" : " días")) + "</span>" : ""; }
  function filaHab(h, f) {
    var v = H.valor(db, h.id, f), ok = H.cumplido(h, v), id = esc(h.id), cant = h.tipo === "cant", pre = "", der;
    if (cant) der = '<div class="cant"><button data-a="hmenos" data-id="' + id + '" aria-label="Quitar ' + paso(h) + '">−</button><div class="v">' + v + "/" + h.meta + "<small>" + esc(h.un || "") + '</small></div><button class="mas" data-a="hmas" data-id="' + id + '" aria-label="Sumar ' + paso(h) + '">+</button></div>';
    else { pre = '<div class="cbw"><button class="cb' + (ok ? " on" : "") + '" data-a="hchk" data-id="' + id + '" aria-label="' + (ok ? "Desmarcar " : "Marcar ") + esc(h.n) + '" aria-pressed="' + ok + '">' + ico("chk") + "</button></div>"; der = flama(h) + '<span class="chev">›</span>'; }
    return '<div class="fila hb' + (ok ? " ok" : "") + '" role="button" tabindex="0" data-a="hdet" data-id="' + id + '">' + pre + '<div class="em">' + esc(h.e || "⭐") + '</div><div class="tx"><div class="tt">' + esc(h.n) + '</div><div class="st">' + subHab(h, !cant) + "</div></div>" + der + "</div>";
  }

  /* ---------- pendientes y agenda ---------- */
  function listaTar() { return Object.keys(db.tareas).map(function (k) { return db.tareas[k]; }); }
  function tareasDe(f) { return listaTar().filter(function (t) { return t.f === f; }); }
  function atrasadas() { var h = H.hoy(); return listaTar().filter(function (t) { return !t.ok && t.f && t.f < h; }).sort(function (a, b) { return a.f < b.f ? -1 : 1; }); }
  function evDia(f) {
    return S.ev.filter(function (e) { var a = e.i.slice(0, 10), b = e.f.slice(0, 10); if (!e.td && e.f.slice(11) === "00:00" && b > a) b = H.addD(b, -1); return a <= f && f <= b; });
  }
  /* 5 niveles de prioridad, del más importante (1) al que puede esperar (5). «p» (0-2) se conserva para compatibilidad con la hoja. */
  var PRIN = { 1: "Crítica · sí o sí", 2: "Muy importante", 3: "Importante", 4: "Normal", 5: "Puede esperar" };
  var PRIS = [[1, "1 · Crítica · sí o sí"], [2, "2 · Muy importante"], [3, "3 · Importante"], [4, "4 · Normal"], [5, "5 · Puede esperar"]];
  function nivel(t) { return t.pr || (t.p === 2 ? 1 : t.p === 1 ? 3 : 4); }
  function compatP(n) { return n <= 1 ? 2 : n <= 3 ? 1 : 0; }
  function pri(t) { var n = nivel(t); return n === 4 ? "" : '<span class="pill n' + n + '">' + PRIN[n] + "</span>"; }
  function priOLD(t) { return t.p === 2 ? '<span class="pill alta">Sí o sí</span>' : t.p === 1 ? '<span class="pill imp">Importante</span>' : ""; }
  function filaTar(t, conFecha) {
    var id = esc(t.id), subs = t.sub && t.sub.length ? '<span class="pill">' + t.sub.filter(function (s) { return s.ok; }).length + "/" + t.sub.length + " pasos</span>" : "";
    var atras = !t.ok && t.f && t.f < H.hoy() ? '<span class="pill alta">Atrasada</span>' : "";
    var st = atras + pri(t) + (t.rep ? '<span class="pill">🔁</span>' : "") + (t.l ? '<span class="pill">#' + esc(t.l) + "</span>" : "") + subs + (conFecha && t.f ? '<span class="pill">' + esc(fRel(t.f)) + "</span>" : "") + (t.nota ? esc(t.nota.slice(0, 40)) : "");
    return '<div class="fila t' + (t.ok ? " ok" : "") + (!t.ok && nivel(t) <= 2 ? " u u" + nivel(t) : "") + (!t.ok && nivel(t) !== 4 ? " p" + nivel(t) : "") + '" role="button" tabindex="0" data-a="tedit" data-id="' + id + '"><div class="hora">' + esc(t.h || "") + '</div><div class="tx"><div class="tt">' + esc(t.t) + "</div>" + (st ? '<div class="st">' + st + "</div>" : "") + '</div><div class="cbw"><button class="cb' + (t.ok ? " on" : "") + '" data-a="tchk" data-id="' + id + '" aria-label="' + (t.ok ? "Desmarcar " : "Completar ") + esc(t.t) + '" aria-pressed="' + !!t.ok + '">' + ico("chk") + "</button></div></div>";
  }
  function filaEv(e) {
    return '<div class="fila t"><div class="hora">' + (e.td ? "Todo<br>el día" : esc(e.i.slice(11))) + '</div><div class="tx"><div class="tt">' + esc(e.t) + '</div><div class="st"><span class="pill cal">Google Calendar</span>' + (e.l ? esc(e.l) : "") + "</div></div></div>";
  }
  function agenda(f) {   // eventos + pendientes de un día, por hora
    var it = [];
    evDia(f).forEach(function (e) { it.push({ k: e.td ? "00:00" : e.i.slice(11), h: filaEv(e) }); });
    tareasDe(f).forEach(function (t) { it.push({ k: t.h || "99:99", n: nivel(t), d: t.ok ? 1 : 0, h: filaTar(t) }); });
    it.sort(function (a, b) { return (a.d || 0) - (b.d || 0) || (a.k < b.k ? -1 : a.k > b.k ? 1 : 0) || ((a.n || 4) - (b.n || 4)); });
    return it.map(function (x) { return x.h; }).join("");
  }
  function bloque(titulo, html, vacio, extra) { return '<div class="sec"><span>' + titulo + "</span>" + (extra || "") + '</div><div class="lista">' + (html || '<div class="vacio">' + vacio + "</div>") + "</div>"; }

  /* ---------- Google Calendar (solo lectura y crear; no se guarda en el dispositivo) ---------- */
  function cargarEv(d0, d1, fuerza) {
    var c = cfg(); if (!c.token || !c.url) return Promise.resolve();
    var k = d0 + "|" + d1; if (!fuerza && S.evR[k]) return Promise.resolve(); S.evR[k] = 1;
    return post(c.url, { op: "agenda_leer", app: "habitos", token: c.token, desde: d0, hasta: d1 }).then(function (r) {
      if (!r || !r.ok) { delete S.evR[k]; S.evErr = (r && r.error) || "error"; return; }
      S.evErr = ""; S.ev = S.ev.filter(function (e) { var a = e.i.slice(0, 10); return !(a >= d0 && a <= d1); }).concat(r.eventos || []);
    }).catch(function () { delete S.evR[k]; S.evErr = "sin_conexion"; }).then(function () { pintar(); });
  }
  function avisoCal() {
    if (!cfg().token) return "";
    if (S.evErr === "operacion_desconocida") return '<div class="vacio">Para ver tu Google Calendar hay que actualizar el script de Fergard (v0.6.0).</div>';
    if (S.evErr && S.evErr !== "sin_conexion") return '<div class="vacio">No se pudo leer Google Calendar (' + esc(S.evErr) + "). Revisa el permiso del calendario en el script.</div>";
    return "";
  }
  function rangoVista() {
    if (S.cal === "mes") { var p = H.pf(S.dia), pr = H.fstr(new Date(p.getFullYear(), p.getMonth(), 1)), u = H.fstr(new Date(p.getFullYear(), p.getMonth() + 1, 0)); return [H.lunes(pr), H.addD(H.lunes(u), 6)]; }
    var l = H.lunes(S.dia); return [l, H.addD(l, 6)];
  }

  /* ---------- vistas ---------- */
  function cab(t, sub) { return '<div class="cab"><div><h1>' + t + "</h1><p>" + sub + '</p></div><button class="ib" data-a="conf" aria-label="Ajustes">' + ico("set") + "</button></div>"; }
  function vHoy0() {
    var f = H.hoy(), r = H.resumenDia(db, f), l = H.lunes(f), hs = listaHab().filter(function (h) { return H.programado(h, f); }), sem = "";
    for (var i = 0; i < 7; i++) { var d = H.addD(l, i), rd = H.resumenDia(db, d), pc = d > f || !rd.tot ? 0 : Math.round(100 * rd.ok / rd.tot); sem += '<div class="' + (d === f ? "hoy" : "") + '"><b><i style="height:' + pc + '%"></i></b>' + H.DIAS[i].charAt(0).toUpperCase() + "</div>"; }
    var pcH = r.tot ? Math.round(100 * r.ok / r.tot) : 0;
    var h = '<div class="hero"><div class="hr"><div><div class="t">Hábitos de hoy</div><div class="n">' + r.ok + "<small> de " + r.tot + ' hechos</small></div><div class="msg">' + esc(mensaje(r)) + "</div></div>" + ring(pcH, r.ok + "/" + r.tot, 80, false) + '</div><div class="sem" aria-hidden="true">' + sem + "</div></div>";
    var vac = '<div class="vacio"><b>Aún no tienes hábitos para hoy</b>Crea el primero: leer 10 páginas, beber agua, caminar…</div><button class="btn" data-a="hnew">Crear un hábito</button><button class="btn sec" data-a="hideas">💡 Ideas de hábitos de personas exitosas</button>';
    var at = atrasadas(), atH = at.map(function (t) { return filaTar(t, true); }).join("");
    return cab("Hoy", fLargo(f)) + h + '<div class="sec"><span>Mis hábitos</span></div>' + (hs.length ? '<div class="lista">' + hs.map(function (x) { return filaHab(x, f); }).join("") + '</div><button class="dash" data-a="hnew">+ Nuevo hábito</button>' : vac) +
      (atH ? bloque("Atrasadas", atH, "") : "") + avisoCal() + bloque("Agenda de hoy", agenda(f), "Nada pendiente para hoy. Toca + para añadir.") + bloque("Mañana · " + fCorto(H.addD(f, 1)), agenda(H.addD(f, 1)), "Nada planeado para mañana todavía.");
  }
  function vPend0() {
    var f = H.hoy(), m = H.addD(f, 1), todas = listaTar(), listas = {}; todas.forEach(function (t) { if (t.l) listas[t.l] = 1; });
    var fl = function (t) { return !S.lista || t.l === S.lista; }, ab = todas.filter(function (t) { return !t.ok && fl(t); });
    ab.sort(function (a, b) { return (a.f || "9") < (b.f || "9") ? -1 : (a.f || "9") > (b.f || "9") ? 1 : (a.h || "99") < (b.h || "99") ? -1 : (a.h || "99") > (b.h || "99") ? 1 : nivel(a) - nivel(b); });
    var sec = function (n, arr, c) { return arr.length ? bloque(n, arr.map(function (t) { return filaTar(t, c); }).join(""), "") : ""; };
    var hechas = todas.filter(function (t) { return t.ok && fl(t); }).sort(function (a, b) { return (b.upd || 0) - (a.upd || 0); });
    var filtros = '<div class="chips">' + [["todas", "Todas"], ["hoy", "Hoy"], ["imp", "Importantes"], ["comp", "Completadas"]].map(function (x) { return '<button class="' + (S.pf === x[0] ? "on" : "") + '" data-a="pf" data-v="' + x[0] + '">' + x[1] + "</button>"; }).join("") + "</div>";
    var chips = '<div class="chips"><button class="' + (!S.lista ? "on" : "") + '" data-a="lista" data-l="">Todas las listas</button>' + Object.keys(listas).sort().map(function (l) { return '<button class="' + (S.lista === l ? "on" : "") + '" data-a="lista" data-l="' + esc(l) + '">#' + esc(l) + "</button>"; }).join("") + "</div>";
    var cuerpo;
    if (S.pf === "comp") cuerpo = hechas.length ? bloque("Completadas", hechas.slice(0, 40).map(function (t) { return filaTar(t, true); }).join(""), "", '<button data-a="tbor">Borrar hechas</button>') : '<div class="vacio" style="margin-top:20px"><b>Nada completado aún</b>Lo que termines aparece aquí.</div>';
    else {
      var base = S.pf === "hoy" ? ab.filter(function (t) { return t.f && t.f <= f; }) : S.pf === "imp" ? ab.filter(function (t) { return nivel(t) <= 3; }) : ab;
      cuerpo = sec("Atrasadas", base.filter(function (t) { return t.f && t.f < f; }), true) + sec("Hoy", base.filter(function (t) { return t.f === f; })) + sec("Mañana", base.filter(function (t) { return t.f === m; })) + sec("Próximos", base.filter(function (t) { return t.f && t.f > m; }), true) + sec("Algún día", base.filter(function (t) { return !t.f; }));
      if (!cuerpo) cuerpo = '<div class="vacio" style="margin-top:20px"><b>Todo al día</b>No tienes pendientes' + (S.pf === "imp" ? " importantes" : S.pf === "hoy" ? " para hoy" : "") + (S.lista ? " en #" + esc(S.lista) : "") + ". Toca + para añadir uno escribiendo.</div>";
    }
    return cab("Pendientes", ab.length + " por hacer") + segPend() + statsSemana() + filtros + (Object.keys(listas).length ? chips : "") + cuerpo +
      (S.pf === "todas" && hechas.length ? bloque("Hechas", hechas.slice(0, 8).map(function (t) { return filaTar(t, true); }).join(""), "", '<button data-a="tbor">Borrar hechas</button>') : "");
  }
  function pts(f) { var n = evDia(f).length, t = tareasDe(f).filter(function (x) { return !x.ok; }).length, s = ""; for (var i = 0; i < Math.min(3, n + t); i++) s += "<i></i>"; return '<div class="pts">' + s + "</div>"; }
  function vCal() {
    var f = H.hoy(), p = H.pf(S.dia), r = rangoVista(), cuerpo, tit;
    if (S.cal === "mes") {
      tit = cap(H.MESES[p.getMonth()]) + " " + p.getFullYear(); var g = '<div class="mes">' + "LMMJVSD".split("").map(function (c) { return '<div class="h">' + c + "</div>"; }).join("");
      for (var d = r[0]; d <= r[1]; d = H.addD(d, 1)) { var dd = H.pf(d); g += '<button class="' + (dd.getMonth() !== p.getMonth() ? "fuera " : "") + (d === S.dia ? "on " : "") + (d === f ? "hoy" : "") + '" data-a="dia" data-f="' + d + '" aria-label="' + esc(fLargo(d)) + '">' + dd.getDate() + pts(d) + "</button>"; }
      cuerpo = g + "</div>";
    } else if (S.cal === "tab") {
      tit = fCorto(r[0]) + " – " + fCorto(r[1]); cuerpo = tablero(r[0]);
    } else {
      var l = r[0]; tit = fCorto(l) + " – " + fCorto(r[1]); cuerpo = '<div class="dias7">';
      for (var i = 0; i < 7; i++) { var x = H.addD(l, i); cuerpo += '<button class="' + (x === S.dia ? "on " : "") + (x === f ? "hoy" : "") + '" data-a="dia" data-f="' + x + '" aria-label="' + esc(fLargo(x)) + '">' + H.DIAS[i].slice(0, 3) + "<b>" + H.pf(x).getDate() + "</b>" + pts(x) + "</button>"; }
      cuerpo += "</div>";
    }
    return cab("Calendario", cfg().token ? "Conectado a Google Calendar" : "Sin vincular") + '<div class="seg"><button class="' + (S.cal === "sem" ? "on" : "") + '" data-a="cal" data-v="sem">Semana</button><button class="' + (S.cal === "tab" ? "on" : "") + '" data-a="cal" data-v="tab">Tablero</button><button class="' + (S.cal === "mes" ? "on" : "") + '" data-a="cal" data-v="mes">Mes</button></div>' +
      '<div class="nav"><button data-a="calprev" aria-label="Anterior">' + ico("izq") + "</button><b>" + esc(tit) + '</b><button data-a="calnext" aria-label="Siguiente">' + ico("der") + "</button></div>" + cuerpo + avisoCal() +
      bloque(esc(fLargo(S.dia)), agenda(S.dia), "Sin eventos ni pendientes este día.", '<button data-a="addd">+ Añadir</button>') + (S.dia !== f ? '<button class="btn sec" data-a="calhoy">Ir a hoy</button>' : "");
  }
  function ordBtns(h) { return S.hord ? '<span class="ord"><button data-a="hsube" data-id="' + esc(h.id) + '" aria-label="Subir ' + esc(h.n) + '">▲</button><button data-a="hbaja" data-id="' + esc(h.id) + '" aria-label="Bajar ' + esc(h.n) + '">▼</button></span>' : ""; }
  function moverHab(id, d) {
    var hs = listaHab().filter(function (h) { return !h.arch; }), i = -1, k; for (k = 0; k < hs.length; k++) if (hs[k].id === id) i = k;
    var j = i + d; if (i < 0 || j < 0 || j >= hs.length) return; var x = hs[i]; hs[i] = hs[j]; hs[j] = x;
    hs.forEach(function (h, n) { if (h.orden !== n) { h.orden = n; touch("habito", h.id, h); } }); pintar();
  }
  function vHab0() {
    var hs = listaHab(), act = hs.filter(function (h) { return !h.arch; }), arc = hs.filter(function (h) { return h.arch; });
    var fila = function (h) { return '<div class="fila" role="button" tabindex="0" data-a="hdet" data-id="' + esc(h.id) + '"><div class="em">' + esc(h.e || "⭐") + '</div><div class="tx"><div class="tt">' + esc(h.n) + '</div><div class="st">' + esc(H.textoFrec(h)) + (h.tipo === "cant" ? " · " + h.meta + " " + esc(h.un || "") : "") + (textoRacha(h) ? " · " + textoRacha(h) : "") + "</div></div></div>"; };
    var pl = '<div class="vacio"><b>Empieza con una plantilla</b>Toca una para crearla y ajústala después.</div><div class="lista" style="margin-top:10px">' + H.PLANTILLAS.map(function (p, i) { return '<div class="fila" role="button" tabindex="0" data-a="hplant" data-i="' + i + '"><div class="em">' + p.e + '</div><div class="tx"><div class="tt">' + esc(p.n) + '</div><div class="st">' + esc(H.textoFrec(p)) + (p.tipo === "cant" ? " · " + p.meta + " " + esc(p.un) : "") + "</div></div></div>"; }).join("") + "</div>";
    return cab("Hábitos", act.length + (act.length === 1 ? " hábito activo" : " hábitos activos")) + segHab() + (act.length ? '<div class="lista">' + act.map(function (h) { return fila(h).replace(/<\/div>$/, ordBtns(h) + "</div>"); }).join("") + "</div>" : pl) + '<button class="btn" data-a="hnew">+ Nuevo hábito</button>' + (act.length > 1 ? '<button class="btn sec" data-a="hord">' + (S.hord ? "Listo" : "Ordenar hábitos") + "</button>" : "") + '<button class="btn sec" data-a="hideas">💡 Ideas de hábitos de personas exitosas</button>' + (arc.length ? bloque("Archivados", arc.map(fila).join(""), "") : "");
  }
  function vProg0() {
    var f = H.hoy(), l = H.lunes(f), ini = H.addD(l, -28), hs = listaHab().filter(function (h) { return !h.arch; }), celdas = "";
    for (var d = ini; d <= H.addD(l, 6); d = H.addD(d, 1)) { var r = H.resumenDia(db, d), p = d > f || !r.tot ? -1 : r.ok / r.tot; celdas += '<i class="' + (p < 0 ? "" : p === 0 ? "" : p < .5 ? "a1" : p < .8 ? "a2" : p < 1 ? "a3" : "a4") + '" title="' + esc(fCorto(d)) + '"></i>'; }
    var mejor = 0; hs.forEach(function (h) { mejor = Math.max(mejor, H.racha(h, db, f)); });
    var hechasSem = listaTar().filter(function (t) { return t.ok && t.upd && H.fstr(new Date(t.upd)) >= l; }).length, rd = H.resumenDia(db, f);
    var cards = hs.map(function (h) {
      var u = H.ultimos(h, db, f, 14).map(function (x) { return '<i class="' + (x === 1 ? "s" : x === -1 ? "n" : "") + '"></i>'; }).join("");
      return '<div class="fila" style="display:block"><div style="display:flex;justify-content:space-between;gap:8px"><div class="tt" style="font-weight:800">' + esc(h.e || "") + " " + esc(h.n) + '</div><b>' + H.tasa(h, db, H.addD(f, -29), f) + '%</b></div><div class="st">30 días · racha ' + H.racha(h, db, f) + (h.frec && h.frec.t === "sem" ? " sem" : " d") + '</div><div class="punt" aria-label="Últimos 14 días">' + u + "</div></div>";
    }).join("");
    return cab("Progreso", "Tus últimas 5 semanas") + '<div class="big"><div><b>' + rd.ok + "/" + rd.tot + "</b><span>Hábitos hoy</span></div><div><b>" + mejor + "</b><span>Mejor racha</span></div><div><b>" + hechasSem + "</b><span>Pendientes hechos (sem.)</span></div></div>" +
      '<div class="sec"><span>Constancia diaria</span></div><div class="lista" style="padding:14px"><div class="celdas" role="img" aria-label="Mapa de constancia de las últimas 5 semanas">' + celdas + "</div></div>" +
      (hs.length ? '<div class="sec"><span>Por hábito</span></div><div class="lista">' + cards + "</div>" : '<div class="vacio">Crea hábitos para ver tu progreso.</div>');
  }
  /* ---- diario, metas, listas, cierre y revisión ---- */
  var MOODS = ["😞", "🙁", "😐", "🙂", "😄"], PAL = ["#1E2F57", "#B45309", "#2F6B4F", "#6D28D9", "#B3261E", "#0E7490"];
  function dDoc(f) { return db.diario[f] || { f: f }; }
  function diaVacio(d) {
    return !d.a && !(d.t || "").trim() && !(d.top && d.top.length) && !(d.g && d.g.some(function (x) { return (x || "").trim(); })) && !(d.man || "").trim() && !(d.reg && Object.keys(d.reg).some(function (k) { return d.reg[k] !== undefined && d.reg[k] !== ""; }));
  }
  function guardarDia(d) { if (diaVacio(d)) { if (db.diario[d.f]) quitar("diario", d.f); } else { db.diario[d.f] = d; touch("diario", d.f, d); } }
  function setDia(f, a, t) { var d = dDoc(f); if (a != null) d.a = a; if (t != null) d.t = t; guardarDia(d); }
  function moods(sel, act) { return '<div class="moods" role="group" aria-label="¿Cómo te sentiste?">' + MOODS.map(function (m, i) { return '<button class="' + (sel === i + 1 ? "on" : "") + '" data-a="' + act + '" data-v="' + (i + 1) + '" aria-label="Ánimo ' + (i + 1) + ' de 5" aria-pressed="' + (sel === i + 1) + '">' + m + "</button>"; }).join("") + "</div>"; }
  function segHab() { return '<div class="seg"><button class="' + (S.hv === "hab" ? "on" : "") + '" data-a="hv" data-v="hab">Hábitos</button><button class="' + (S.hv === "rachas" ? "on" : "") + '" data-a="hv" data-v="rachas">Rachas</button><button class="' + (S.hv === "metas" ? "on" : "") + '" data-a="hv" data-v="metas">Metas</button></div>'; }
  function segPend() { return '<div class="seg"><button class="' + (S.pv === "fecha" ? "on" : "") + '" data-a="pv" data-v="fecha">Por fecha</button><button class="' + (S.pv === "lista" ? "on" : "") + '" data-a="pv" data-v="lista">Por lista</button></div>'; }
  function statsSemana() {
    var l = H.lunes(H.hoy()), fin = H.addD(l, 6), t = listaTar().filter(function (x) { return x.f && x.f >= l && x.f <= fin; }), ok = t.filter(function (x) { return x.ok; }).length;
    return '<div class="big"><div><b>' + ok + "</b><span>Completadas</span></div><div><b>" + (t.length - ok) + "</b><span>Pendientes</span></div><div><b>" + t.length + "</b><span>Total de la semana</span></div></div>";
  }
  function avance(m) {
    if (m.idi) return idiAvance(m);
    if (!m.hab) return m.act || 0; var h = db.habitos[m.hab]; if (!h) return 0; var desde = m.ini || "0000-00-00", tot = 0;
    Object.keys(db.registros).forEach(function (k) { var r = db.registros[k]; if (r.h !== m.hab) return; Object.keys(r.v).forEach(function (dd) { if (r.m + "-" + dd < desde) return; var v = r.v[dd]; tot += h.tipo === "cant" ? v : (v >= 1 ? 1 : 0); }); });
    return tot;
  }
  function filaMeta(m) {
    var av = avance(m), obj = m.obj || 1, pc = Math.min(100, Math.round(100 * av / obj)), lograda = av >= obj, f = H.hoy(), extra = "";
    if (m.fin && !lograda) { var dias = Math.round((H.pf(m.fin) - H.pf(f)) / 86400000); extra = dias < 0 ? " · venció el " + fCorto(m.fin) : " · " + dias + " días · necesitas " + (Math.ceil((obj - av) / Math.max(1, dias) * 10) / 10) + "/día"; }
    var ctl = (m.hab || m.idi) ? "" : '<div class="cant"><button data-a="mmenos" data-id="' + esc(m.id) + '" aria-label="Restar">−</button><button class="mas" data-a="mmas" data-id="' + esc(m.id) + '" aria-label="Sumar">+</button></div>';
    return '<div class="fila" style="display:block" role="button" tabindex="0" data-a="medit" data-id="' + esc(m.id) + '"><div style="display:flex;align-items:center;gap:12px"><div class="em">' + esc(m.e || "🎯") + '</div><div class="tx"><div class="tt" style="white-space:normal">' + esc(m.n) + '</div><div class="st">' + av + " / " + obj + " " + esc(m.un || "") + (lograda ? ' · <span class="racha">¡Lograda!</span>' : esc(extra)) + "</div></div>" + ctl + '</div><div class="barra2"><i style="width:' + pc + '%"></i></div></div>';
  }
  function vMetas(sg) {
    var ms = Object.keys(db.metas).map(function (k) { return db.metas[k]; }).sort(function (a, b) { return (a.upd || 0) - (b.upd || 0); });
    return cab("Metas", ms.length + (ms.length === 1 ? " meta" : " metas")) + sg + (ms.length ? '<div class="lista">' + ms.map(filaMeta).join("") + "</div>" : '<div class="vacio"><b>Aún no tienes metas</b>Por ejemplo «leer 12 libros este año» o «caminar 200 000 pasos en diciembre». Se pueden ligar a un hábito y avanzan solas.</div>') + '<button class="btn" data-a="mnew">+ Nueva meta</button>';
  }
  function mEditor(id) {
    var m = id ? db.metas[id] : null;
    S.me = m ? JSON.parse(JSON.stringify(m)) : { id: null, n: "", e: "🎯", hab: "", obj: 10, un: "", fin: "", ini: H.hoy(), act: 0, lig: Object.keys(db.habitos).length > 0 };
    if (m) S.me.lig = !!m.hab; S.me.modo = m ? (m.idi ? "idi" : m.hab ? "hab" : "man") : (S.me.lig ? "hab" : "man"); if (m && m.idi) S.me.idi = m.idi; if (!S.me.idi) S.me.idi = { i: "en", a: "a1" }; pintarME();
  }
  function pintarME() {
    var d = S.me, hs = listaHab().filter(function (h) { return !h.arch; });
    abrir("<h3>" + (d.id ? "Editar meta" : "Nueva meta") + '</h3><div class="dup" style="grid-template-columns:70px 1fr"><div style="flex:0 0 76px"><label class="lbl" for="me-e">Icono</label><input id="me-e" value="' + esc(d.e) + '" maxlength="4" style="text-align:center;font-size:22px"></div><div><label class="lbl" for="me-n">Meta</label><input id="me-n" value="' + esc(d.n) + '" placeholder="Leer 12 libros este año"></div></div>' +
      '<label class="lbl">¿Cómo avanza?</label><div class="seg"><button class="' + (d.modo === "hab" ? "on" : "") + '" data-a="mlig" data-v="1">Un hábito</button><button class="' + (d.modo === "man" ? "on" : "") + '" data-a="mlig" data-v="0">A mano</button><button class="' + (d.modo === "idi" ? "on" : "") + '" data-a="mlig" data-v="2">Idiomas</button></div>' +
      (d.modo === "idi" ? idiForm(d) : d.lig ? (hs.length ? '<label class="lbl" for="me-h">Hábito</label><select id="me-h">' + hs.map(function (h) { return '<option value="' + esc(h.id) + '"' + (d.hab === h.id ? " selected" : "") + ">" + esc((h.e || "") + " " + h.n) + "</option>"; }).join("") + '</select><label class="lbl" for="me-i">Contar desde</label><input id="me-i" type="date" value="' + esc(d.ini) + '">' : '<div class="vacio">Primero crea un hábito, o elige «A mano».</div>') : '<label class="lbl" for="me-u">Unidad</label><input id="me-u" value="' + esc(d.un) + '" placeholder="libros, km, soles…"><label class="lbl" for="me-a">Avance actual</label><input id="me-a" type="number" inputmode="decimal" value="' + esc(d.act || 0) + '">') +
      '<div class="dup"><div><label class="lbl" for="me-o">Objetivo</label><input id="me-o" type="number" inputmode="decimal" min="1" value="' + esc(d.obj) + '"></div><div><label class="lbl" for="me-f">Fecha límite (opcional)</label><input id="me-f" type="date" value="' + esc(d.fin || "") + '"></div></div><button class="btn" data-a="msave">Guardar</button>' + (d.id ? '<button class="btn bad" data-a="mdel">Eliminar</button>' : ""));
  }
  function leerME() { var d = S.me; if (!d || !$("#me-n")) return; d.n = $("#me-n").value; d.e = $("#me-e").value.trim() || "🎯"; d.obj = +$("#me-o").value || 1; d.fin = $("#me-f").value; if (d.modo === "idi" && $("#me-ii")) { d.idi = { i: $("#me-ii").value, a: $("#me-ia").value }; d.obj = d.idi.a === "a1" ? 50 : 5; } if ($("#me-h")) { d.hab = $("#me-h").value; d.ini = $("#me-i").value || H.hoy(); } if ($("#me-u")) d.un = $("#me-u").value.trim(); if ($("#me-a")) d.act = +$("#me-a").value || 0; }
  var LISTAS_BASE = ["Trabajo", "Casa", "Personales", "Otros"];
  function opcionesListas(sel) {
    var o = {}, extra = []; listaTar().forEach(function (t) { if (t.l && t.l !== "Notas" && LISTAS_BASE.indexOf(t.l) < 0) o[t.l] = 1; }); (db.ajustes.listas || []).forEach(function (l) { if (LISTAS_BASE.indexOf(l) < 0) o[l] = 1; }); if (sel && LISTAS_BASE.indexOf(sel) < 0) o[sel] = 1;
    extra = Object.keys(o).sort();
    return '<option value="">Sin lista</option>' + LISTAS_BASE.concat(extra).map(function (l) { return '<option value="' + esc(l) + '"' + (sel === l ? " selected" : "") + ">" + esc(l) + "</option>"; }).join("");
  }
  function selLista(nombre) {
    var s2 = $("#qa-l"); if (!s2 || !nombre) return; var q = M2(nombre), i;
    for (i = 0; i < s2.options.length; i++) if (M2(s2.options[i].value) === q) { s2.value = s2.options[i].value; return; }
    s2.add(new Option(nombre, nombre)); s2.value = nombre;
  }
  function M2(x) { return H.norm(x); }
  function nombresListas() { var o = {}; LISTAS_BASE.forEach(function (l) { o[l] = 1; }); (db.ajustes.listas || []).forEach(function (l) { o[l] = 1; }); listaTar().forEach(function (t) { if (t.l) o[t.l] = 1; }); return Object.keys(o).sort(); }
  function colLista(n) { var h = 0; for (var i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0; return PAL[h % PAL.length]; }
  function vPendLista() {
    var nombres = nombresListas().concat([""]), html = "";
    nombres.forEach(function (n) {
      var its = listaTar().filter(function (t) { return (t.l || "") === n; }); if (n === "" && !its.length) return;
      var ab = its.filter(function (t) { return !t.ok; }).sort(function (a, b) { return (a.f || "9") < (b.f || "9") ? -1 : 1; }), hc = its.filter(function (t) { return t.ok; }), nm = n || "Sin lista";
      html += '<div class="lcard"><div class="lh"><span class="pto" style="background:' + colLista(nm) + '"></span><b>' + esc(nm) + '</b><span class="cnt">' + hc.length + "/" + its.length + "</span>" + (hc.length ? '<button data-a="lbor" data-l="' + esc(n) + '">Borrar hechas</button>' : "") + "</div>" +
        (ab.concat(hc).map(function (t) { return filaTar(t, true); }).join("")) + '<div class="ladd"><input class="lad" data-l="' + esc(n) + '" placeholder="Añadir a ' + esc(nm) + '…" enterkeyhint="done" aria-label="Añadir a ' + esc(nm) + '"></div></div>';
    });
    return cab("Pendientes", "Tus listas") + segPend() + '<div class="ladd" style="margin-bottom:12px;padding:0"><input id="nl-n" placeholder="Nueva lista (Compras, Casa, Viaje…)" enterkeyhint="done" aria-label="Nueva lista"></div>' + (html || '<div class="vacio"><b>Sin listas todavía</b>Crea una arriba, por ejemplo «Compras», y añade cosas con casilla.</div>');
  }
  /* ---- Mis 3 prioridades ---- */
  function vTop() {
    var f = H.hoy(), d = db.diario[f] || {}, top = d.top || [], ayer = db.diario[H.addD(f, -1)] || {}, plan = ayer.man, h = "";
    if (plan && !top.some(function (x) { return x.t === plan; })) h += '<div class="plan"><b>🌙 Lo que planeaste anoche</b><span>' + esc(plan) + '</span><button data-a="topplan">Añadir a mis 3</button></div>';
    h += '<div class="sec"><span>Mis 3 prioridades</span><button data-a="topedit">' + (top.length ? "Editar" : "Elegir") + "</button></div>";
    if (!top.length) return h + '<div class="lista"><div class="vacio" style="padding:18px"><b>¿Qué tiene que salir hoy?</b>Elige tus 3 cosas más importantes del día.</div></div>';
    var todas = top.every(function (x) { return x.ok; });
    return h + '<div class="lista">' + top.map(function (x, i) { return '<div class="fila top' + (x.ok ? " ok" : "") + '"><button class="cb lg' + (x.ok ? " on" : "") + '" data-a="toptg" data-i="' + i + '" aria-pressed="' + !!x.ok + '" aria-label="' + (x.ok ? "Desmarcar " : "Completar ") + esc(x.t) + '">' + ico("chk") + '</button><div class="tx"><div class="tt" style="white-space:normal">' + esc(x.t) + "</div></div></div>"; }).join("") + "</div>" + (todas ? '<div class="ganado">✅ ¡Día ganado! Cumpliste tus 3 prioridades.</div>' : "");
  }
  function topEditor() {
    var f = H.hoy(), d = db.diario[f] || {}, top = d.top || [], cand = listaTar().filter(function (t) { return !t.ok && t.l !== "Notas" && t.f && t.f <= f; }).sort(function (a, b) { return nivel(a) - nivel(b); }).slice(0, 6);
    S.topids = {}; top.forEach(function (x, i) { if (x.id) S.topids[i] = x.id; });
    abrir('<h3>Mis 3 prioridades</h3><div class="st" style="color:var(--mut);font-weight:600;line-height:1.4;margin:-4px 0 6px">Lo que tiene que salir hoy, sí o sí. Escríbelas o tómalas de tus pendientes.</div>' + [0, 1, 2].map(function (i) { return '<label class="lbl" for="tp' + i + '">Prioridad ' + (i + 1) + '</label><input id="tp' + i + '" placeholder="Escribe aquí…" value="' + esc(top[i] ? top[i].t : "") + '">'; }).join("") +
      (cand.length ? '<div class="lbl">De tus pendientes</div><div class="lista">' + cand.map(function (t) { return '<div class="fila" role="button" tabindex="0" data-a="topcand" data-id="' + esc(t.id) + '"><div class="tx"><div class="tt" style="white-space:normal">' + esc(t.t) + '</div><div class="st">' + esc(fRel(t.f)) + " " + pri(t) + '</div></div><span class="pill cal">+ Usar</span></div>'; }).join("") + "</div>" : "") + '<button class="btn" data-a="topsave">Guardar</button>');
  }
  /* ---- Registros rápidos ---- */
  var REGS = { agua: { n: "Agua", u: "vasos", e: "💧", paso: 1, meta: 8 }, sueno: { n: "Sueño", u: "h", e: "😴", paso: 0.5, meta: 8 }, energia: { n: "Energía", u: "/5", e: "⚡", niv: true }, peso: { n: "Peso", u: "kg", e: "⚖️", ent: true }, pasos: { n: "Pasos", u: "", e: "👣", ent: true } };
  function regsAct() { return db.ajustes.regs || ["agua", "sueno", "energia"]; }
  function regVal(f, k) { var d = db.diario[f]; return d && d.reg && d.reg[k] !== undefined ? d.reg[k] : null; }
  function setReg(f, k, v) { var d = dDoc(f); d.reg = d.reg || {}; if (v === null || v === "" || isNaN(v)) delete d.reg[k]; else d.reg[k] = v; guardarDia(d); }
  function spark(k) {
    var f = H.hoy(), vals = [], mx = 0, i; for (i = 6; i >= 0; i--) { var v = regVal(H.addD(f, -i), k); vals.push(v); if (v && v > mx) mx = v; }
    return '<span class="spark" aria-hidden="true">' + vals.map(function (v) { return '<i style="height:' + (v && mx ? Math.max(12, Math.round(100 * v / mx)) : 6) + '%"' + (v ? "" : ' class="v"') + "></i>"; }).join("") + "</span>";
  }
  function vRegistros() {
    var f = H.hoy(), h = '<div class="sec"><span>Registros rápidos</span><button data-a="regcfg">Elegir</button></div><div class="lista">';
    var act = regsAct().filter(function (k) { return REGS[k]; });
    if (!act.length) return h + '<div class="vacio">Elige qué quieres registrar: agua, sueño, energía, peso o pasos.</div></div>';
    act.forEach(function (k) {
      var r = REGS[k], v = regVal(f, k), ctl;
      if (r.niv) ctl = '<div class="niv" role="group" aria-label="Energía de 1 a 5">' + [1, 2, 3, 4, 5].map(function (n) { return '<button class="' + (v === n ? "on" : "") + '" data-a="rge" data-k="' + k + '" data-v="' + n + '" aria-pressed="' + (v === n) + '">' + n + "</button>"; }).join("") + "</div>";
      else if (r.ent) ctl = '<input class="rgin" data-k="' + k + '" type="number" inputmode="decimal" step="any" min="0" value="' + (v === null ? "" : v) + '" placeholder="' + (k === "peso" ? "kg" : "pasos") + '" aria-label="' + r.n + '">';
      else ctl = '<div class="cant"><button data-a="rgm" data-k="' + k + '" aria-label="Quitar">−</button><div class="v">' + (v === null ? 0 : v) + "<small>" + r.u + '</small></div><button class="mas" data-a="rgp" data-k="' + k + '" aria-label="Sumar">+</button></div>';
      h += '<div class="fila rg"><div class="em">' + r.e + '</div><div class="tx"><div class="tt">' + r.n + (r.meta && v !== null && v >= r.meta ? " ✓" : "") + "</div>" + spark(k) + "</div>" + ctl + "</div>";
    });
    return h + "</div>";
  }
  /* ---- Gratitud, notas rápidas y plan de mañana ---- */
  function vGrat() {
    var d = db.diario[H.hoy()] || {}, g = d.g || [];
    return '<div class="sec"><span>3 cosas buenas de hoy</span></div><div class="lista" style="padding:12px">' + [0, 1, 2].map(function (i) { return '<input class="gin" id="g-' + i + '" placeholder="' + ["Algo que agradezco…", "Algo que salió bien…", "Algo que me hizo sonreír…"][i] + '" value="' + esc(g[i] || "") + '" aria-label="Cosa buena ' + (i + 1) + '" style="margin-bottom:' + (i < 2 ? 8 : 0) + 'px">'; }).join("") + "</div>";
  }
  function vNotas() {
    var ns = listaTar().filter(function (t) { return t.l === "Notas" && !t.ok; }).sort(function (a, b) { return (b.upd || 0) - (a.upd || 0); }).slice(0, 5);
    return '<div class="sec"><span>Notas e ideas rápidas</span></div><div class="lista"><div style="padding:12px"><input id="nt-t" placeholder="Anota una idea y pulsa Enter…" enterkeyhint="done" aria-label="Nota rápida"></div>' + ns.map(function (t) { return filaTar(t); }).join("") + "</div>" + (ns.length ? '<div class="st" style="color:var(--mut);font-weight:600;font-size:12.5px;margin:6px 2px 0">Toca una nota para ponerle fecha y convertirla en pendiente.</div>' : "");
  }
  function vPlan() {
    var d = db.diario[H.hoy()] || {};
    return '<div class="sec"><span>🌙 Plan de mañana</span></div><div class="lista" style="padding:12px"><input id="pm-t" placeholder="Lo único importante de mañana…" value="' + esc(d.man || "") + '" aria-label="Lo único importante de mañana"><div class="st" style="color:var(--mut);font-weight:600;font-size:12.5px;margin-top:6px">Mañana te lo recordaré al abrir la app.</div></div>';
  }
  function diasSin(h) { var f = H.hoy(), n = 0, i; for (i = 1; i <= 14; i++) { var d = H.addD(f, -i); if (!H.programado(h, d)) continue; if (H.cumplido(h, H.valor(db, h.id, d))) return n; n++; } return n; }
  function vSug() {
    var f = H.hoy(), c = listaHab().filter(function (h) { return !h.arch && H.programado(h, f) && !H.cumplido(h, H.valor(db, h.id, f)); }).map(function (h) { return { h: h, n: diasSin(h) }; }).sort(function (a, b) { return b.n - a.n; })[0];
    if (!c || c.n < 2) return "";
    return '<div class="sug"><b>💡 Sugerencia del día</b><span>Llevas ' + c.n + ' días sin «' + esc(c.h.n) + '». ¿Lo haces hoy?</span><button data-a="sugir" data-id="' + esc(c.h.id) + '">' + (c.h.tipo === "cant" ? "Registrar ahora" : "Marcar como hecho") + "</button></div>";
  }
  function vFechas() {
    var f = H.hoy(), lim = H.addD(f, 30), ev = S.ev.filter(function (e) { var d = e.i.slice(0, 10); return d >= f && d <= lim && /cumple|aniversario|birthday/i.test(e.t); }).sort(function (a, b) { return a.i < b.i ? -1 : 1; }).slice(0, 4);
    if (!ev.length) return "";
    return '<div class="sec"><span>Fechas importantes</span></div><div class="lista">' + ev.map(function (e) { var d = e.i.slice(0, 10), n = Math.round((H.pf(d) - H.pf(f)) / 86400000); return '<div class="fila"><div class="em">🎂</div><div class="tx"><div class="tt" style="white-space:normal">' + esc(e.t) + '</div><div class="st">' + (n === 0 ? "¡Hoy!" : n === 1 ? "Mañana" : "En " + n + " días") + " · " + esc(fCorto(d)) + "</div></div></div>"; }).join("") + "</div>";
  }
  function vHoy() {
    var h = vHoy0(), f = H.hoy(), pr = listaTar().filter(function (t) { return !t.ok && t.f === f && nivel(t) <= 2; }).map(function (t) { return filaTar(t); }).join("");
    h = h.replace('<div class="sec"><span>Mis hábitos</span></div>', vTop() + '<div class="sec"><span>Mis hábitos</span></div>');
    if (pr) h = h.replace('<div class="sec"><span>Agenda de hoy</span>', bloque("Prioridades de hoy", pr, "") + '<div class="sec"><span>Agenda de hoy</span>');
    var d = db.diario[f] || {};
    return h + vSug() + vRegistros() + vGrat() + vNotas() + vFechas() + vPlan() + '<div class="sec"><span>Diario de hoy</span><button data-a="dsheet" data-f="' + f + '">Abrir</button></div><div class="lista" style="padding:14px">' + moods(d.a, "dm") + '<input id="dh-t" style="margin-top:10px" placeholder="Una línea sobre tu día…" value="' + esc(d.t || "") + '" aria-label="Una línea sobre tu día"></div><div class="dup"><button class="btn sec" data-a="enfoque">⏱ Modo enfoque</button><button class="btn sec" data-a="cierre">Cerrar el día</button></div>';
  }
  /* ---- Conexiones entre tus hábitos y cómo te sientes ---- */
  function conexiones() {
    var f = H.hoy(), dias = [], i; for (i = 1; i <= 60; i++) dias.push(H.addD(f, -i));
    var prom = function (a) { return a.reduce(function (x, y) { return x + y; }, 0) / a.length; }, out = [];
    var mets = [{ n: "ánimo", g: function (d) { return d && d.a ? d.a : null; }, min: 0.5, u: "" }, { n: "horas de sueño", g: function (d) { return d && d.reg && d.reg.sueno != null ? d.reg.sueno : null; }, min: 0.5, u: " h" }, { n: "energía", g: function (d) { return d && d.reg && d.reg.energia != null ? d.reg.energia : null; }, min: 0.5, u: "" }];
    listaHab().filter(function (h) { return !h.arch; }).forEach(function (h) {
      mets.forEach(function (m) {
        var a = [], b = []; dias.forEach(function (d) { if (!H.programado(h, d)) return; var v = m.g(db.diario[d]); if (v === null) return; (H.cumplido(h, H.valor(db, h.id, d)) ? a : b).push(v); });
        if (a.length >= 4 && b.length >= 4) { var x = prom(a) - prom(b); if (Math.abs(x) >= m.min) out.push({ d: Math.abs(x), t: "Los días que cumples «" + h.n + "», tu " + m.n + " es " + prom(a).toFixed(1) + m.u + " frente a " + prom(b).toFixed(1) + m.u + " cuando no." }); }
      });
    });
    var bien = [], mal = []; dias.forEach(function (d) { var x = db.diario[d]; if (x && x.a && x.reg && x.reg.sueno != null) (x.reg.sueno >= 7 ? bien : mal).push(x.a); });
    if (bien.length >= 4 && mal.length >= 4 && Math.abs(prom(bien) - prom(mal)) >= 0.5) out.push({ d: Math.abs(prom(bien) - prom(mal)), t: "Cuando duermes 7 h o más, tu ánimo es " + prom(bien).toFixed(1) + " frente a " + prom(mal).toFixed(1) + " cuando duermes menos." });
    out.sort(function (a, b) { return b.d - a.d; }); return out.slice(0, 4);
  }
  function vConex() {
    var c = conexiones();
    return '<div class="sec"><span>Conexiones que encontré</span></div>' + (c.length ? '<div class="lista">' + c.map(function (x) { return '<div class="fila"><div class="em">💡</div><div class="tx"><div class="tt" style="white-space:normal;font-weight:700;font-size:15px">' + esc(x.t) + "</div></div></div>"; }).join("") + "</div>" : '<div class="vacio"><b>Aún no hay suficientes datos</b>Registra tu ánimo y tu sueño unos 10 días y aquí aparecerán conexiones, por ejemplo cómo te sientes los días que entrenas.</div>');
  }
  function vPend() { return S.pv === "lista" ? vPendLista() : vPend0(); }
  function vHab() { return S.hv === "metas" ? vMetas(segHab()) : S.hv === "rachas" ? vRachas(segHab()) : vHab0(); }
  function vProg() {
    var h = vProg0(), ds = Object.keys(db.diario).map(function (k) { return db.diario[k]; }).filter(function (d) { return !d.sem && (d.a || d.t); }).sort(function (a, b) { return a.f < b.f ? 1 : -1; }).slice(0, 10);
    h = h.replace('<div class="big">', semCard() + '<div class="dup"><button class="btn sec" data-a="revsem" style="margin-top:0">Revisión semanal</button><button class="btn sec" data-a="dsheet" data-f="' + H.hoy() + '" style="margin-top:0">Diario</button></div><div class="big" style="margin-top:12px">');
    return h + vConex() + (ds.length ? '<div class="sec"><span>Diario reciente</span></div><div class="lista">' + ds.map(function (d) { return '<div class="fila t" role="button" tabindex="0" data-a="dsheet" data-f="' + esc(d.f) + '"><div class="em">' + (MOODS[(d.a || 3) - 1]) + '</div><div class="tx"><div class="tt">' + esc(fRel(d.f)) + '</div><div class="st">' + esc(d.t || "") + "</div></div></div>"; }).join("") + "</div>" : "");
  }
  function dSheet(f) {
    var d = db.diario[f] || {}; S.df = f;
    abrir("<h3>Diario · " + esc(fRel(f)) + "</h3>" + moods(d.a, "dmm") + '<label class="lbl" for="d-t">¿Cómo fue tu día?</label><textarea id="d-t" rows="4" placeholder="Lo mejor, lo difícil, algo que agradeces…">' + esc(d.t || "") + '</textarea><button class="btn" data-a="dsave">Guardar</button>');
    S.dmood = d.a || 0;
  }
  function pendCierre() { var f = H.hoy(); return { hs: listaHab().filter(function (h) { return H.programado(h, f) && !H.cumplido(h, H.valor(db, h.id, f)); }), ts: listaTar().filter(function (t) { return !t.ok && t.f && t.f <= f; }).sort(function (a, b) { return a.f < b.f ? -1 : 1; }) }; }
  function cierre() {
    var f = H.hoy(), c = pendCierre(), r = H.resumenDia(db, f), d = db.diario[f] || {}; S.dmood = d.a || 0;
    var hs = c.hs.map(function (h) { return '<div class="fila"><div class="em">' + esc(h.e || "⭐") + '</div><div class="tx"><div class="tt">' + esc(h.n) + '</div><div class="st">' + (h.tipo === "cant" ? H.valor(db, h.id, f) + "/" + h.meta + " " + esc(h.un || "") : "Sin marcar") + '</div></div><button class="btn" style="width:auto;height:40px;margin:0;padding:0 16px;font-size:14px" data-a="cl-h" data-id="' + esc(h.id) + '">Hecho</button></div>'; }).join("");
    var fila = function (t) { return filaTar(t, true).replace('data-a="tchk"', 'data-a="cl-t"').replace('data-a="tedit"', 'data-x="1"').replace('<div class="cbw">', '<button class="pos" data-a="cl-p" data-id="' + esc(t.id) + '">Mañana</button><div class="cbw">'); };
    var sio = c.ts.filter(function (t) { return nivel(t) === 1; }), pos = c.ts.filter(function (t) { return nivel(t) !== 1; });
    abrir("<h3>Cierre del día</h3><div class=\"big\"><div><b>" + r.ok + "/" + r.tot + "</b><span>Hábitos hoy</span></div><div><b>" + c.ts.length + "</b><span>Pendientes sin hacer</span></div></div>" +
      (hs ? '<div class="sec"><span>Hábitos por cerrar</span></div><div class="lista">' + hs + "</div>" : "") +
      (sio.length ? '<div class="sec"><span>Sí o sí · no se postergan solos</span></div><div class="lista">' + sio.map(fila).join("") + "</div>" : "") +
      (pos.length ? '<div class="sec"><span>Pueden esperar</span></div><div class="lista">' + pos.map(fila).join("") + '</div><button class="btn sec" data-a="cl-man">Pasar los ' + pos.length + " a mañana</button>" : "") + (!hs && !c.ts.length ? '<div class="vacio"><b>¡Día completo!</b>No te queda nada pendiente.</div>' : "") +
      '<div class="sec"><span>¿Cómo estuvo tu día?</span></div>' + moods(d.a, "dmm") + '<input id="d-t" style="margin-top:10px" placeholder="Una línea sobre hoy…" value="' + esc(d.t || "") + '"><button class="btn" data-a="cl-ok">Listo</button>');
  }
  function revSemana() {
    var f = H.hoy(), l = H.lunes(f), fin = H.addD(l, 6), hs = listaHab().filter(function (h) { return !h.arch; }), tot = 0, hec = 0, filas = [];
    hs.forEach(function (h) { var p = 0, o = 0; for (var i = 0; i < 7; i++) { var d = H.addD(l, i); if (d > f || !H.programado(h, d)) continue; p++; if (H.cumplido(h, H.valor(db, h.id, d))) o++; } tot += p; hec += o; if (p) filas.push({ h: h, p: p, o: o, pc: Math.round(100 * o / p) }); });
    filas.sort(function (a, b) { return b.pc - a.pc; });
    var ts = listaTar().filter(function (t) { return t.f && t.f >= l && t.f <= fin; }), tok = ts.filter(function (t) { return t.ok; }).length, pend = listaTar().filter(function (t) { return !t.ok && t.f && t.f <= fin; });
    var an = [], i; for (i = 0; i < 7; i++) { var dd = db.diario[H.addD(l, i)]; if (dd && dd.a) an.push(dd.a); }
    var prom = an.length ? MOODS[Math.round(an.reduce(function (a, b) { return a + b; }, 0) / an.length) - 1] : "—", rv = db.diario["S" + l] || {};
    var ms = Object.keys(db.metas).map(function (k) { return db.metas[k]; }).map(function (m) { return '<div class="fila" style="min-height:48px"><div class="em">' + esc(m.e || "🎯") + '</div><div class="tx"><div class="tt">' + esc(m.n) + '</div><div class="st">' + avance(m) + " / " + (m.obj || 1) + " " + esc(m.un || "") + "</div></div></div>"; }).join("");
    S.rl = l;
    abrir("<h3>Revisión semanal</h3><div class=\"st\" style=\"color:var(--mut);font-weight:600;margin:-4px 0 10px\">" + esc(fCorto(l)) + " – " + esc(fCorto(fin)) + '</div><div class="big"><div><b>' + (tot ? Math.round(100 * hec / tot) : 0) + "%</b><span>Hábitos cumplidos</span></div><div><b>" + tok + "/" + ts.length + "</b><span>Pendientes hechos</span></div><div><b>" + prom + "</b><span>Ánimo promedio</span></div></div>" +
      (filas.length ? '<div class="sec"><span>Por hábito</span></div><div class="lista">' + filas.map(function (x) { return '<div class="fila" style="min-height:48px"><div class="em">' + esc(x.h.e || "⭐") + '</div><div class="tx"><div class="tt">' + esc(x.h.n) + '</div><div class="st">' + x.o + " de " + x.p + " días</div></div><b>" + x.pc + "%</b></div>"; }).join("") + "</div>" : "") +
      (filas.length > 1 ? '<div class="vacio" style="padding:10px 4px">Lo mejor: <b style="display:inline">' + esc(filas[0].h.n) + "</b> · A reforzar: <b style=\"display:inline\">" + esc(filas[filas.length - 1].h.n) + "</b></div>" : "") +
      (ms ? '<div class="sec"><span>Metas</span></div><div class="lista">' + ms + "</div>" : "") +
      '<label class="lbl" for="rv-t">¿Qué salió bien y qué quieres mejorar la próxima semana?</label><textarea id="rv-t" rows="3">' + esc(rv.t || "") + "</textarea>" +
      (pend.length ? '<button class="btn sec" data-a="rv-sig">Pasar los ' + pend.length + " pendientes sin hacer a la próxima semana</button>" : "") + '<button class="btn" data-a="rv-ok">Guardar revisión</button>');
  }
/* ---- anillo, mensajes, tablero, rachas e ideas ---- */
  function ring(pc, txt, sz, claro) {
    var r = 42, c = 2 * Math.PI * r, o = c * (1 - Math.max(0, Math.min(100, pc)) / 100);
    return '<div class="ring' + (claro ? " l" : "") + '" style="width:' + sz + "px;height:" + sz + 'px" role="img" aria-label="' + pc + ' por ciento"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="42" class="rt"/><circle cx="50" cy="50" r="42" class="rf" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + o.toFixed(1) + '" transform="rotate(-90 50 50)"/></svg><b>' + esc(txt) + "</b></div>";
  }
  function mensaje(r) {
    if (!r.tot) return "Crea tu primer hábito y empieza hoy"; if (r.ok === r.tot) return "¡Día perfecto! Todo cumplido";
    if (r.ok === 0) return "Empieza con el más fácil"; return r.ok / r.tot < 0.5 ? "Vas por buen camino, sigue así" : "Ya pasaste la mitad, ¡no pares!";
  }
  function semResumen() {
    var f = H.hoy(), l = H.lunes(f), tot = 0, ok = 0;
    listaHab().forEach(function (h) { if (h.arch) return; for (var i = 0; i < 7; i++) { var d = H.addD(l, i); if (d > f || !H.programado(h, d)) continue; tot++; if (H.cumplido(h, H.valor(db, h.id, d))) ok++; } });
    var ts = listaTar().filter(function (t) { return t.f && t.f >= l && t.f <= H.addD(l, 6); }); tot += ts.length; ok += ts.filter(function (t) { return t.ok; }).length;
    return { pc: tot ? Math.round(100 * ok / tot) : 0, ok: ok, tot: tot };
  }
  function semCard() { var s = semResumen(); return '<div class="lista" style="display:flex;align-items:center;gap:16px;padding:16px;margin-bottom:12px">' + ring(s.pc, s.pc + "%", 84, true) + '<div><div class="tt" style="font-weight:800;font-size:17px">Progreso semanal</div><div class="st" style="color:var(--mut);font-weight:600;margin-top:3px">' + s.ok + " de " + s.tot + " completados<br>(hábitos y pendientes de esta semana)</div></div></div>"; }
  function tablero(l) {
    var f = H.hoy(), cols = "";
    for (var i = 0; i < 7; i++) {
      var x = H.addD(l, i), its = [];
      evDia(x).forEach(function (e) { its.push({ k: e.td ? "00:00" : e.i.slice(11), h: '<div class="ti ev"><b>' + (e.td ? "Todo el día" : esc(e.i.slice(11))) + "</b>" + esc(e.t) + "</div>" }); });
      tareasDe(x).forEach(function (t) { its.push({ k: t.h || "99:99", d: t.ok ? 1 : 0, h: '<div class="ti' + (t.ok ? " ok" : "") + (nivel(t) <= 2 && !t.ok ? " u" : "") + (!t.ok && nivel(t) !== 4 ? " p" + nivel(t) : "") + '" role="button" tabindex="0" data-a="tedit" data-id="' + esc(t.id) + '"><button class="cb mi' + (t.ok ? " on" : "") + '" data-a="tchk" data-id="' + esc(t.id) + '" aria-label="' + (t.ok ? "Desmarcar " : "Completar ") + esc(t.t) + '">' + ico("chk") + "</button><span>" + (t.h ? "<b>" + esc(t.h) + "</b>" : "") + esc(t.t) + "</span></div>" }); });
      listaHab().forEach(function (h) { if (h.hora && H.programado(h, x)) its.push({ k: h.hora, h: '<div class="ti hb"><b>' + esc(h.hora) + "</b>" + esc((h.e || "") + " " + h.n) + "</div>" }); });
      its.sort(function (a, b) { return (a.d || 0) - (b.d || 0) || (a.k < b.k ? -1 : a.k > b.k ? 1 : 0); });
      cols += '<div class="tcol' + (x === f ? " hoy" : "") + '"><button class="th" data-a="dia" data-f="' + x + '" aria-label="' + esc(fLargo(x)) + '"><span>' + H.DIAS[i].slice(0, 3) + "</span><b>" + H.pf(x).getDate() + "</b></button>" + (its.map(function (z) { return z.h; }).join("") || '<div class="te">Libre</div>') + "</div>";
    }
    return '<div class="tab7">' + cols + "</div>";
  }
  function vRachas(sg) {
    var f = H.hoy(), hs = listaHab().filter(function (h) { return !h.arch; }).map(function (h) { return { h: h, r: H.racha(h, db, f), b: H.mejorRacha(h, db, f) }; }).sort(function (a, b) { return b.r - a.r || b.b - a.b; });
    var activos = hs.filter(function (x) { return x.r > 0; }).length, mejor = hs.reduce(function (m, x) { return Math.max(m, x.b); }, 0), larga = hs.length ? hs[0].r : 0;
    return cab("Rachas", "Constancia día tras día") + sg + '<div class="big"><div><b>' + larga + "</b><span>Racha actual más larga</span></div><div><b>" + mejor + "</b><span>Mejor racha histórica</span></div><div><b>" + activos + "</b><span>Hábitos con racha</span></div></div>" +
      (hs.length ? '<div class="lista">' + hs.map(function (x) { var sem = x.h.frec && x.h.frec.t === "sem"; return '<div class="fila" role="button" tabindex="0" data-a="hdet" data-id="' + esc(x.h.id) + '"><div class="em">' + esc(x.h.e || "⭐") + '</div><div class="tx"><div class="tt">' + esc(x.h.n) + '</div><div class="st">Mejor racha: ' + x.b + (sem ? " semanas" : " días") + "</div></div>" + (x.r >= 1 ? flama(x.h) : '<span class="pill">Sin racha</span>') + '<span class="chev">›</span></div>'; }).join("") + "</div>" : '<div class="vacio"><b>Aún no hay rachas</b>Crea hábitos y cúmplelos varios días seguidos.</div>');
  }
  function ideas() {
    var cats = {}, tiene = {}; listaHab().forEach(function (h) { tiene[H.norm(h.n)] = 1; }); H.IDEAS.forEach(function (p, i) { (cats[p.c] = cats[p.c] || []).push([p, i]); });
    abrir('<h3>Ideas de hábitos</h3><div class="st" style="color:var(--mut);font-weight:600;line-height:1.4;margin:-4px 0 4px">Los practican muchos emprendedores, deportistas y líderes. Toca uno para añadirlo; después lo ajustas a tu gusto.</div>' + Object.keys(cats).map(function (c) {
      return '<div class="sec"><span>' + esc(c) + '</span></div><div class="lista">' + cats[c].map(function (x) {
        var p = x[0], ya = tiene[H.norm(p.n)];
        return '<div class="fila" role="button" tabindex="0" ' + (ya ? "" : 'data-a="hidea" data-i="' + x[1] + '"') + '><div class="em">' + p.e + '</div><div class="tx"><div class="tt" style="white-space:normal">' + esc(p.n) + '</div><div class="st">' + esc(p.d) + (p.tipo === "cant" ? " · " + p.meta + " " + esc(p.un) : "") + "</div></div>" + (ya ? '<span class="pill">Añadido</span>' : '<span class="pill cal">+ Añadir</span>') + "</div>";
      }).join("") + "</div>";
    }).join(""));
  }
  function syncGym() {
    var c = cfg(); if (!c.token || !c.url) return Promise.resolve();
    var hs = listaHab().filter(function (h) { return h.tipo === "gym" && !h.arch; }); if (!hs.length) return Promise.resolve();
    if (S.gymT && Date.now() - S.gymT < 120000) return Promise.resolve(); S.gymT = Date.now();
    var f = H.hoy();
    return post(c.url, { op: "gym_dias", app: "habitos", token: c.token, desde: H.addD(f, -60), hasta: f }).then(function (r) {
      if (!r || !r.ok) { S.gymErr = (r && r.error) || "error"; return; } S.gymErr = ""; var n = 0;
      (r.dias || []).forEach(function (d) { hs.forEach(function (h) { if (H.valor(db, h.id, d.f) === 0) { setValor(h, d.f, 1); n++; } }); });
      if (n) { pintar(); toast("Gym: " + n + (n === 1 ? " día marcado" : " días marcados")); }
    }).catch(function () {});
  }
/* ---- modo enfoque (pomodoro) ---- */
  function enfLeer() { try { var o = JSON.parse(LS.getItem("hb_enf") || "null"); return o && o.fin ? o : null; } catch (e) { return null; } }
  function enfGuardar(o) { S.enf = o; try { if (o) LS.setItem("hb_enf", JSON.stringify(o)); else LS.removeItem("hb_enf"); } catch (e) {} tickEnf(); }
  function mmss(ms) { var s = Math.max(0, Math.ceil(ms / 1000)), m = Math.floor(s / 60); return p2(m) + ":" + p2(s % 60); }
  function chipEnf() {
    var c = $("#enfchip"); if (!S.enf) { if (c) c.remove(); return; }
    if (!c) { c = document.createElement("button"); c.id = "enfchip"; c.setAttribute("data-a", "enfoque"); document.body.appendChild(c); }
    c.textContent = (S.enf.tipo === "desc" ? "☕ " : "⏱ ") + mmss(S.enf.fin - Date.now());
    c.setAttribute("aria-label", (S.enf.tipo === "desc" ? "Descanso" : "Enfoque") + ", quedan " + mmss(S.enf.fin - Date.now()));
  }
  function tickEnf() { if (S.enf && Date.now() >= S.enf.fin) { terminarEnf(true); return; } chipEnf(); var t = $("#enf-t"); if (t && S.enf) t.textContent = mmss(S.enf.fin - Date.now()); }
  function enfoque() {
    var hs = listaHab().filter(function (h) { return !h.arch; });
    if (S.enf) {
      abrir('<h3>' + (S.enf.tipo === "desc" ? "Descanso" : "Enfoque") + '</h3><div class="foco"><b id="enf-t">' + mmss(S.enf.fin - Date.now()) + '</b><span>' + (S.enf.hab && db.habitos[S.enf.hab] ? "Para: " + esc(db.habitos[S.enf.hab].n) : "") + '</span></div><button class="btn" data-a="enf-fin">' + (S.enf.tipo === "desc" ? "Saltar descanso" : "Terminar ahora") + '</button><button class="btn sec" data-a="enf-can">Cancelar</button>');
      return;
    }
    var pref = hs.filter(function (h) { return h.tipo === "cant" && /min/i.test(h.un || ""); })[0];
    abrir('<h3>Modo enfoque</h3><div class="st" style="color:var(--mut);font-weight:600;line-height:1.4;margin:-4px 0 6px">Trabaja sin interrupciones. Al terminar, los minutos se suman al hábito que elijas.</div><label class="lbl" for="enf-h">Hábito (opcional)</label><select id="enf-h"><option value="">Sin hábito</option>' + hs.map(function (h) { return '<option value="' + esc(h.id) + '"' + (pref && pref.id === h.id ? " selected" : "") + ">" + esc((h.e || "") + " " + h.n) + "</option>"; }).join("") + '</select><label class="lbl">Duración</label><div class="chips" style="margin:0">' + [15, 25, 45, 60, 90].map(function (m) { return '<button class="' + (m === 25 ? "on" : "") + '" data-a="enf-min" data-m="' + m + '">' + m + " min</button>"; }).join("") + '</div><button class="btn" data-a="enf-ini">Empezar</button>');
    S.enfMin = 25;
  }
  function terminarEnf(completo) {
    var o = S.enf; if (!o) return; S.enf = null; try { LS.removeItem("hb_enf"); } catch (e) {} chipEnf();
    var min = completo ? o.min : Math.floor((Date.now() - o.ini) / 60000), h = o.hab && db.habitos[o.hab], sub = "";
    if (o.tipo === "desc") { mostrarAviso({ k: "enf|" + Date.now(), tipo: "enf", tit: "Descanso terminado", sub: "¿Otro bloque de enfoque?", fin: true, hab: o.hab }); return; }
    if (h && min >= 1) { var f = H.hoy(); if (h.tipo === "cant" && /min/i.test(h.un || "")) { setValor(h, f, H.valor(db, h.id, f) + min); sub = "+" + min + " min a " + h.n; } else if (h.tipo !== "cant" && completo) { setValor(h, f, 1); sub = h.n + " marcado"; } }
    try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch (e) {}
    pintar(); if (completo || min >= 1) mostrarAviso({ k: "enf|" + Date.now(), tipo: "enf", tit: completo ? "¡Bloque de enfoque listo!" : "Enfoque terminado", sub: (sub || min + " min de enfoque") + " · ¿descansas 5 minutos?", hab: o.hab });
  }
/* ---- actualización automática: avisa cuando hay una versión nueva y la instala con un toque ---- */
  function buscarActualizacion() {
    if (S.upd || !window.fetch) return;
    fetch("habitos.js?nc=" + Date.now(), { cache: "no-store" }).then(function (r) { return r.text(); }).then(function (t) {
      var m = /VERSION = "([^"]+)"/.exec(t); if (!m || m[1] === VERSION) return; S.upd = m[1];
      var b = document.createElement("button"); b.id = "upd"; b.setAttribute("data-a", "actualizar"); b.innerHTML = "<b>Hay una versión nueva (" + esc(m[1]) + ")</b><span>Toca para actualizar</span>"; document.body.appendChild(b);
    }).catch(function () {});
  }
/* ---- plantillas en lista, y conexión con Idiomas ---- */
  var IDI_NOM = { en: "Inglés", pt: "Portugués", it: "Italiano" };
  var IDI_UNI = ["Saludos y presentaciones", "Números y datos personales", "En el café", "Mi familia", "La hora, los días y mi rutina", "La casa", "La ciudad y direcciones", "Compras y dinero", "Gustos y pasatiempos", "Ahora y planes"];
  function plantillaSelect() {
    var cats = {}; H.IDEAS.forEach(function (p, i) { (cats[p.c] = cats[p.c] || []).push([p, i]); });
    var of = function (p, v) { return '<option value="' + v + '">' + esc(p.e + " " + p.n) + "</option>"; };
    return '<label class="lbl" for="he-pl">Empezar con una plantilla (opcional)</label><select id="he-pl"><option value="">Elegir de la lista…</option><optgroup label="Básicas">' + H.PLANTILLAS.map(function (p, i) { return of(p, "p:" + i); }).join("") + "</optgroup>" +
      Object.keys(cats).map(function (c) { return '<optgroup label="' + esc(c) + '">' + cats[c].map(function (x) { return of(x[0], "i:" + x[1]); }).join("") + "</optgroup>"; }).join("") + "</select>";
  }
  function aplicarPlantilla(v) {
    var p = v.charAt(0) === "p" ? H.PLANTILLAS[+v.slice(2)] : H.IDEAS[+v.slice(2)]; if (!p) return; leerHE();
    S.hd.n = p.n; S.hd.e = p.e; S.hd.tipo = p.tipo; S.hd.meta = p.meta; S.hd.un = p.un; S.hd.frec = JSON.parse(JSON.stringify(p.frec)); S.hd.frec.dias = S.hd.frec.dias || []; S.hd.frec.n = S.hd.frec.n || 3; pintarHE();
  }
  function syncIdiomas(fuerza) {
    var c = cfg(); if (!c.token || !c.url) return Promise.resolve();
    var hs = listaHab().filter(function (h) { return h.tipo === "idioma" && !h.arch; }), hayMeta = Object.keys(db.metas).some(function (k) { return db.metas[k].idi; });
    if (!hs.length && !hayMeta) return Promise.resolve();
    if (!fuerza && S.idiT && Date.now() - S.idiT < 120000) return Promise.resolve(); S.idiT = Date.now();
    var f = H.hoy();
    return post(c.url, { op: "idiomas_resumen", app: "habitos", token: c.token, desde: H.addD(f, -60), hasta: f }).then(function (r) {
      if (!r || !r.ok) { S.idiErr = (r && r.error) || "error"; return; } S.idiErr = ""; S.idiRes = { lec: r.lecciones || {}, ex: r.examenes || {} }; try { LS.setItem("hb_idi", JSON.stringify(S.idiRes)); } catch (e) {}
      var n = 0; (r.dias || []).forEach(function (d) { hs.forEach(function (h) { if (H.valor(db, h.id, d.f) === 0) { setValor(h, d.f, 1); n++; } }); });
      pintar(); if (n) toast("Idiomas: " + n + (n === 1 ? " día marcado" : " días marcados"));
    }).catch(function () {});
  }
  function idiAvance(m) {
    var r = S.idiRes; if (!r || !m.idi) return 0; var i = m.idi.i, a = m.idi.a, tot = 0, u;
    if (a === "a1") { for (u = 1; u <= 10; u++) tot += r.lec[i + "-a1-u" + u] || 0; return tot; }
    return r.lec[i + "-" + a] || 0;
  }
  function idiForm(d) {
    var di = d.idi || { i: "en", a: "a1" };
    return '<label class="lbl" for="me-ii">Idioma</label><select id="me-ii">' + Object.keys(IDI_NOM).map(function (k) { return '<option value="' + k + '"' + (di.i === k ? " selected" : "") + ">" + IDI_NOM[k] + "</option>"; }).join("") + '</select><label class="lbl" for="me-ia">¿Qué quieres lograr?</label><select id="me-ia"><option value="a1"' + (di.a === "a1" ? " selected" : "") + ">Terminar todo el nivel A1 (50 lecciones)</option>" + IDI_UNI.map(function (t, n) { return '<option value="a1-u' + (n + 1) + '"' + (di.a === "a1-u" + (n + 1) ? " selected" : "") + ">Unidad " + (n + 1) + " · " + esc(t) + " (5 lecciones)</option>"; }).join("") + '</select><div class="st" style="color:var(--mut);font-weight:600;margin:6px 2px 0">Avanza sola con cada lección que completes en tu app Idiomas.</div>';
  }
  function crearDe(tipo) {
    var p = H.PLANTILLAS.filter(function (x) { return x.tipo === tipo; })[0]; if (!p) return;
    var h = { id: H.uid(), n: p.n, e: p.e, tipo: p.tipo, meta: p.meta, un: p.un, frec: JSON.parse(JSON.stringify(p.frec)), hora: "", ini: H.hoy(), orden: Object.keys(db.habitos).length };
    db.habitos[h.id] = h; touch("habito", h.id, h); toast("Hábito creado: " + p.n); if (tipo === "gym") { S.gymT = 0; syncGym(); } else { S.idiT = 0; syncIdiomas(true); } ajustes();
  }
function conexionFila(tipo, em, app, plantilla) {
    var hay = listaHab().some(function (h) { return h.tipo === tipo && !h.arch; }), err = tipo === "gym" ? S.gymErr : S.idiErr, ver = tipo === "gym" ? "v0.8.0" : "v0.11.0", est, btn = "";
    if (!hay) { est = "Aún no tienes el hábito. Se marca solo con tu app " + app + "."; btn = '<button class="btn sec" style="margin:8px 0 0;height:44px" data-a="crear' + (tipo === "gym" ? "Gym" : "Idi") + '">Crear hábito «' + plantilla + '»</button>'; }
    else if (err === "operacion_desconocida") est = "Actualiza el script de Fergard (" + ver + " o más nueva)"; else if (err) est = "Problema: " + esc(err); else est = "Conectado ✓ · se marca solo con tus sesiones de " + app;
    return '<div class="fila" style="display:block"><div style="display:flex;gap:10px;align-items:center"><div class="em">' + em + '</div><div class="tx"><div class="tt">' + app + '</div><div class="st" style="white-space:normal">' + est + "</div></div></div>" + btn + "</div>";
  }
  var TABS = [["hoy", "Hoy"], ["pend", "Pendientes"], ["cal", "Calendario"], ["hab", "Hábitos"], ["prog", "Progreso"]];
  function pintarTabs() { $("#tabs").innerHTML = TABS.map(function (t) { return '<button class="' + (S.tab === t[0] ? "on" : "") + '" data-a="tab" data-t="' + t[0] + '" aria-current="' + (S.tab === t[0]) + '">' + ico(t[0]) + t[1] + "</button>"; }).join(""); }
  function pintar() {
    var a = $("#app"), sc = a.scrollTop, v = { hoy: vHoy, pend: vPend, cal: vCal, hab: vHab, prog: vProg }[S.tab];
    if (S.cargando) { a.innerHTML = cab("Hábitos", "Cargando tus datos…") + '<div class="vacio">Trayendo tu información de la hoja…</div>'; return; }
    a.innerHTML = v(); a.scrollTop = sc; pintarTabs(); $("#fab").hidden = S.tab === "prog"; pintarNube();
  }
  function pintarNube() { var n = Object.keys(db.pend).length, e = $("#fab"); if (e) e.title = n ? n + " cambio(s) por subir" : ""; }

  /* ---------- hojas ---------- */
  function abrir(html) { var m = $("#modal"); m.innerHTML = '<div class="caja"><div class="ctop"><div class="asa"></div><button class="cerrar" data-a="mcerrar" aria-label="Cerrar">×</button></div>' + html + "</div>"; m.hidden = false; m.onclick = function (e) { if (e.target === m) cerrar(); }; }
  function cerrar() { $("#modal").hidden = true; $("#modal").innerHTML = ""; S.hd = null; S.qa = null; S.me = null; }
  function completar(t, ok) {   // marca/desmarca y, si se repite, crea la próxima
    t.ok = ok; touch("tarea", t.id, t);
    if (ok && t.rep && t.f) {
      var f2 = H.siguiente(t.f, t.rep); if (!f2) return;
      var dup = listaTar().some(function (x) { return !x.ok && x.t === t.t && x.f === f2; }); if (dup) return;
      var n = { id: H.uid(), t: t.t, f: f2, h: t.h || "", l: t.l || "", p: compatP(nivel(t)), pr: nivel(t), av: t.av || 0, rep: t.rep, ok: false, nota: t.nota || "", sub: (t.sub || []).map(function (s) { return { t: s.t, ok: false }; }) };
      db.tareas[n.id] = n; touch("tarea", n.id, n); toast("Se repite · próxima: " + fRel(f2).toLowerCase());
    }
  }
  function addTarea(o) {
    var t = { id: H.uid(), t: o.titulo, f: o.fecha || "", h: o.hora || "", l: o.lista || "", p: compatP(o.pr || 4), pr: o.pr || 4, av: o.av || 0, rep: o.rep || "", ok: false, nota: "", sub: [] };
    db.tareas[t.id] = t; touch("tarea", t.id, t); return t;
  }
  function parseQA(deTexto) {
    var v = ($("#qa-t").value || ""), r = H.parsear(v, H.hoy()), fi = $("#qa-f"), hi = $("#qa-h");
    var pr = $("#qa-pr"); if (deTexto !== false) { if (r.fecha) fi.value = r.fecha; if (r.hora) hi.value = r.hora; if (r.prioridad && pr) pr.value = String(r.prioridad === 2 ? 1 : 3); if (r.rep && $("#qa-r")) $("#qa-r").value = r.rep; } r.rep = $("#qa-r") ? $("#qa-r").value : r.rep; if (deTexto !== false && r.lista && $("#qa-l")) selLista(r.lista); r.lista = $("#qa-l") ? $("#qa-l").value : r.lista; r.pr = pr ? (+pr.value || 4) : 4;
    r.fecha = fi.value || ""; r.hora = r.fecha ? (hi.value || "") : ""; r.av = r.hora ? (+($("#qa-a") && $("#qa-a").value) || 0) : 0; S.qa.r = r;
    var c = []; c.push(r.fecha ? "📅 " + fRel(r.fecha) : "Sin fecha (algún día)"); if (r.hora) c.push("🕒 " + r.hora); if (r.lista) c.push("#" + r.lista); if (r.rep) c.push("🔁 " + ({ dia: "Cada día", lab: "Lun–vie", sem: "Cada semana", mes: "Cada mes" }[r.rep] || "Se repite")); if (r.pr && r.pr !== 4) c.push(PRIN[r.pr]);
    $("#qa-p").innerHTML = c.map(function (x) { return '<span class="pill cal">' + esc(x) + "</span>"; }).join("");
  }
  function abrirAdd(f) {
    S.qa = { f: f || "", r: null };
    abrir('<h3>Añadir</h3><input id="qa-t" placeholder="Llamar al dentista mañana 10am #salud !" autocomplete="off" autocapitalize="sentences" enterkeyhint="done"><div class="dup fh"><div><label class="lbl" for="qa-f">Fecha (opcional)</label><input id="qa-f" type="date" value="' + esc(S.qa.f || H.hoy()) + '"></div><div><label class="lbl" for="qa-h">Hora</label><input id="qa-h" type="time"></div></div><div class="chips" style="margin-top:8px"><button data-a="qa-fh" data-v="hoy">Hoy</button><button data-a="qa-fh" data-v="man">Mañana</button><button data-a="qa-fh" data-v="no">Sin fecha</button></div><label class="lbl" for="qa-l">Lista</label><select id="qa-l">' + opcionesListas("") + '</select><label class="lbl" for="qa-pr">Prioridad</label><select id="qa-pr">' + PRIS.map(function (a) { return '<option value="' + a[0] + '"' + (a[0] === 4 ? " selected" : "") + ">" + a[1] + "</option>"; }).join("") + '</select><label class="lbl" for="qa-a">Avisarme (si tiene hora)</label><select id="qa-a">' + AVISOS.map(function (a) { return '<option value="' + a[0] + '">' + a[1] + "</option>"; }).join("") + '</select><label class="lbl" for="qa-r">Repetir</label><select id="qa-r">' + REPS.map(function (a) { return '<option value="' + a[0] + '">' + a[1] + "</option>"; }).join("") + '</select><div class="parte" id="qa-p"></div><button class="btn" data-a="qa-tarea">Añadir pendiente</button><button class="btn sec" data-a="qa-evento">Crear evento en Google Calendar</button><button class="btn sec" data-a="hnew">Nuevo hábito</button><div class="vacio" style="padding:14px 4px 0;font-size:13px">Ejemplos: «pagar la luz hoy», «reunión con Laura el viernes 15:30», «comprar regalo en 3 días #casa». Con ! o «urgente» sube la prioridad. Si no pones fecha queda como «algún día» (por ejemplo una compra futura).</div>');
    parseQA(); setTimeout(function () { var i = $("#qa-t"); if (i) i.focus(); }, 60);
  }
  function crearEvento(t, f, h) {
    var c = cfg(); if (!c.token) { toast("Vincula la app primero"); return Promise.resolve(false); }
    return post(c.url, { op: "evento_crear", app: "habitos", token: c.token, t: t, f: f, h: h || "", mins: 60 }).then(function (r) {
      if (r && r.ok) { toast("Evento creado en Google Calendar"); S.evR = {}; var rg = rangoVista(); cargarEv(rg[0], rg[1], true); cargarEv(H.hoy(), H.addD(H.hoy(), 1), true); return true; }
      toast(r && r.error === "operacion_desconocida" ? "Actualiza el script de Fergard (v0.6.0)" : "No se pudo crear (" + ((r && r.error) || "error") + ")"); return false;
    }).catch(function () { toast("Sin conexión: no se pudo crear el evento"); return false; });
  }
  var REPS = [["", "No se repite"], ["dia", "Cada día"], ["lab", "Lunes a viernes"], ["sem", "Cada semana"], ["mes", "Cada mes"]];
  var AVISOS = [[0, "A la hora"], [5, "5 min antes"], [15, "15 min antes"], [30, "30 min antes"], [60, "1 hora antes"], [120, "2 horas antes"]];
  function tEditor(id) {
    var t = db.tareas[id]; if (!t) return; S.td = id;
    var listas = {}; listaTar().forEach(function (x) { if (x.l) listas[x.l] = 1; });
    abrir('<h3>Pendiente</h3><label class="lbl" for="te-t">Título</label><input id="te-t" value="' + esc(t.t) + '"><div class="dup"><div><label class="lbl" for="te-f">Fecha</label><input id="te-f" type="date" value="' + esc(t.f) + '"></div><div><label class="lbl" for="te-h">Hora</label><input id="te-h" type="time" value="' + esc(t.h) + '"></div></div>' +
      '<div class="dup"><div><label class="lbl" for="te-l">Lista</label><select id="te-l">' + opcionesListas(t.l) + '</select></div><div><label class="lbl" for="te-p">Prioridad</label><select id="te-p">' + PRIS.map(function (a) { return '<option value="' + a[0] + '"' + (nivel(t) === a[0] ? " selected" : "") + ">" + a[1] + "</option>"; }).join("") + "</select></div></div>" + '<label class="lbl" for="te-a">Avisarme (si tiene hora)</label><select id="te-a">' + AVISOS.map(function (a) { return '<option value="' + a[0] + '"' + ((t.av || 0) === a[0] ? " selected" : "") + ">" + a[1] + "</option>"; }).join("") + "</select>" + '<label class="lbl" for="te-r">Repetir</label><select id="te-r">' + REPS.map(function (a) { return '<option value="' + a[0] + '"' + ((t.rep || "") === a[0] ? " selected" : "") + ">" + a[1] + "</option>"; }).join("") + "</select>" +
      '<label class="lbl">Pasos</label><div id="te-s">' + (t.sub || []).map(subHtml).join("") + '</div><button class="btn sec" data-a="tsubadd" style="height:44px;margin-top:4px">+ Añadir paso</button><label class="lbl" for="te-n">Nota</label><textarea id="te-n" rows="2">' + esc(t.nota || "") + '</textarea>' +
      '<button class="btn" data-a="tsave">Guardar</button><div class="dup"><button class="btn sec" data-a="tmanana">Postergar 1 día</button><button class="btn sec" data-a="tcal">A Google Calendar</button></div><button class="btn bad" data-a="tdel">Borrar</button>');
  }
  function subHtml(s) { return '<div class="sub"><button class="cb' + (s.ok ? " on" : "") + '" data-a="tsubchk" aria-label="Paso hecho">' + ico("chk") + '</button><input type="text" value="' + esc(s.t) + '" aria-label="Paso"><button class="cb" data-a="tsubdel" aria-label="Quitar paso" style="border-color:transparent;font-size:20px">×</button></div>'; }
  function leerSubs() { return $$("#te-s .sub").map(function (r) { return { t: $("input", r).value.trim(), ok: $(".cb", r).classList.contains("on") }; }).filter(function (s) { return s.t; }); }
  function leerTE() {
    var t = db.tareas[S.td]; if (!t) return null; var ti = $("#te-t").value.trim(); if (!ti) { toast("Escribe un título"); return null; }
    t.t = ti; t.f = $("#te-f").value; t.h = t.f ? $("#te-h").value : ""; t.l = $("#te-l").value.trim().replace(/^#/, ""); t.pr = +$("#te-p").value || 4; t.p = compatP(t.pr); t.av = +$("#te-a").value || 0; t.rep = $("#te-r").value; t.nota = $("#te-n").value.trim(); t.sub = leerSubs(); return t;
  }

  function hEditor(id) {
    var h = id ? db.habitos[id] : null;
    S.hd = h ? JSON.parse(JSON.stringify(h)) : { id: null, n: "", e: "⭐", tipo: "check", meta: 1, un: "", frec: { t: "dia" }, hora: "" };
    S.hd.frec = S.hd.frec || { t: "dia" }; S.hd.frec.dias = S.hd.frec.dias || []; S.hd.frec.n = S.hd.frec.n || 3; pintarHE();
  }
  function pintarHE() {
    var d = S.hd, f = d.frec, dn = ["L", "M", "M", "J", "V", "S", "D"];
    abrir('<h3>' + (d.id ? "Editar hábito" : "Nuevo hábito") + "</h3>" + (d.id ? "" : plantillaSelect()) +
      '<div class="dup" style="grid-template-columns:70px 1fr"><div style="flex:0 0 76px"><label class="lbl" for="he-e">Icono</label><input id="he-e" value="' + esc(d.e) + '" maxlength="4" style="text-align:center;font-size:22px"></div><div><label class="lbl" for="he-n">Nombre</label><input id="he-n" value="' + esc(d.n) + '" placeholder="Leer, caminar, meditar…"></div></div>' +
      '<label class="lbl">¿Cómo se mide?</label><div class="seg"><button class="' + (d.tipo === "check" ? "on" : "") + '" data-a="htipo" data-v="check">Casilla</button><button class="' + (d.tipo === "cant" ? "on" : "") + '" data-a="htipo" data-v="cant">Cantidad</button><button class="' + (d.tipo === "gym" ? "on" : "") + '" data-a="htipo" data-v="gym">Gym</button><button class="' + (d.tipo === "idioma" ? "on" : "") + '" data-a="htipo" data-v="idioma">Idiomas</button></div>' + (d.tipo === "gym" ? '<div class="st" style="color:var(--mut);font-weight:600;margin:-4px 2px 6px">Se marca solo cuando terminas un entrenamiento en tu app Gym.</div>' : d.tipo === "idioma" ? '<div class="st" style="color:var(--mut);font-weight:600;margin:-4px 2px 6px">Se marca solo cuando completas una lección en tu app Idiomas.</div>' : d.tipo === "check" ? '<div class="st" style="color:var(--mut);font-weight:600;margin:-4px 2px 6px">Lo marcas tú con un toque: hecho o no hecho.</div>' : '<div class="st" style="color:var(--mut);font-weight:600;margin:-4px 2px 6px">Con meta numérica: por ejemplo 10 páginas o 8 vasos.</div>') +
      (d.tipo === "cant" ? '<div class="dup"><div><label class="lbl" for="he-m">Meta diaria</label><input id="he-m" type="number" inputmode="numeric" min="1" value="' + esc(d.meta) + '"></div><div><label class="lbl" for="he-u">Unidad</label><input id="he-u" value="' + esc(d.un) + '" placeholder="páginas, vasos, min"></div></div>' : "") +
      '<label class="lbl">¿Con qué frecuencia?</label><div class="seg"><button class="' + (f.t === "dia" ? "on" : "") + '" data-a="hfrec" data-v="dia">Cada día</button><button class="' + (f.t === "dias" ? "on" : "") + '" data-a="hfrec" data-v="dias">Días fijos</button><button class="' + (f.t === "sem" ? "on" : "") + '" data-a="hfrec" data-v="sem">Por semana</button></div>' +
      (f.t === "dias" ? '<div class="dchips">' + dn.map(function (x, i) { return '<button class="' + (f.dias.indexOf(i + 1) >= 0 ? "on" : "") + '" data-a="hdia" data-d="' + (i + 1) + '" aria-pressed="' + (f.dias.indexOf(i + 1) >= 0) + '" aria-label="' + H.DIAS[i] + '">' + x + "</button>"; }).join("") + "</div>" : "") +
      (f.t === "sem" ? '<label class="lbl" for="he-fn">Veces por semana</label><input id="he-fn" type="number" inputmode="numeric" min="1" max="7" value="' + f.n + '">' : "") +
      '<label class="lbl" for="he-h">Aviso a esta hora (opcional)</label><input id="he-h" type="time" value="' + esc(d.hora || "") + '"><button class="btn" data-a="hsave">Guardar</button>' +
      (d.id ? '<div class="dup"><button class="btn sec" data-a="harch">' + (db.habitos[d.id] && db.habitos[d.id].arch ? "Restaurar" : "Archivar") + '</button><button class="btn bad" data-a="hdel">Eliminar</button></div>' : ""));
  }
  function leerHE() {
    var d = S.hd; if (!d || !$("#he-n")) return; d.n = $("#he-n").value; d.e = $("#he-e").value.trim() || "⭐"; d.hora = $("#he-h").value;
    if (d.tipo === "cant") { d.meta = Math.max(1, +($("#he-m") && $("#he-m").value) || d.meta || 1); d.un = $("#he-u") ? $("#he-u").value.trim() : d.un; } else { d.meta = 1; d.un = ""; }
    if (d.frec.t === "sem" && $("#he-fn")) d.frec.n = Math.min(7, Math.max(1, +$("#he-fn").value || 3));
  }
  function hDetalle(id) {
    var h = db.habitos[id]; if (!h) return; var f = H.hoy(), v = H.valor(db, id, f), u = H.ultimos(h, db, f, 14).map(function (x) { return '<i class="' + (x === 1 ? "s" : x === -1 ? "n" : "") + '"></i>'; }).join("");
    S.hdet = id;
    abrir('<h3>' + esc(h.e || "") + " " + esc(h.n) + '</h3><div class="big"><div><b>' + H.racha(h, db, f) + "</b><span>Racha</span></div><div><b>" + H.tasa(h, db, H.addD(f, -29), f) + "%</b><span>Últimos 30 días</span></div><div><b>" + H.mejorRacha(h, db, f) + "</b><span>Mejor racha</span></div></div><div class=\"punt\" aria-label=\"Últimos 14 días\">" + u + "</div>" + (H.mejorDia(h, db, f) ? '<div class="st" style="color:var(--mut);margin:8px 2px 0;font-weight:600">Tu mejor día: ' + cap(H.DIAS[H.mejorDia(h, db, f) - 1]) + "</div>" : "") +
      '<div class="dup"><div><label class="lbl" for="hd-f">Registrar el día</label><input id="hd-f" type="date" value="' + f + '" max="' + f + '"></div><div><label class="lbl" for="hd-v">' + (h.tipo === "cant" ? esc(cap(h.un || "cantidad")) : "Hecho (1) o no (0)") + '</label><input id="hd-v" type="number" inputmode="numeric" min="0" value="' + v + '"></div></div><button class="btn" data-a="hreg">Guardar registro</button><button class="btn sec" data-a="hedit" data-id="' + esc(id) + '">Editar hábito</button>');
    $("#hd-f").onchange = function () { $("#hd-v").value = H.valor(db, id, this.value || f); };
  }

  function ajustes() {
    var url = db.sync.url, n = Object.keys(db.pend).length;
    abrir('<h3>Ajustes</h3><label class="lbl">Acceso</label><div id="acc"></div><label class="lbl">Sincronización</label><div style="font-size:14px;color:var(--mut);line-height:1.5">' + esc(!cfg().token ? "Sin vincular" : S.sync || (db.sync.ok ? "Al día" : "Lista para sincronizar")) + " · pendientes: " + n + '</div><div class="dup" style="margin-top:8px"><button class="btn sec" style="margin:0" data-a="sync">Sincronizar</button>' + (url ? '<a class="btn sec" style="margin:0" target="_blank" rel="noopener" href="' + esc(url) + '">Mi hoja</a>' : "") + "</div>" +
      '<label class="lbl">Avisos dentro de la app</label><label class="sw"><input type="checkbox" id="aj-rec"' + (db.ajustes.rec !== false ? " checked" : "") + ' data-a="rec"> Avisarme de pendientes, hábitos con hora y eventos</label><div style="font-size:13px;color:var(--mut);margin-top:6px;line-height:1.45">Los avisos aparecen mientras la app está abierta. El iPhone no permite avisos con la app cerrada sin un servidor de notificaciones.</div>' +
      '<label class="lbl" for="aj-cierre">Aviso para cerrar el día (vacío = sin aviso)</label><input id="aj-cierre" type="time" value="' + esc(db.ajustes.cierre === undefined ? "21:00" : db.ajustes.cierre) + '"><label class="sw"><input type="checkbox" id="aj-rev"' + (db.ajustes.rev !== false ? " checked" : "") + ' data-a="revaj"> Recordarme la revisión semanal los domingos (6 pm)</label><label class="lbl">Conexiones con tus apps</label><div class="lista">' + conexionFila("gym", "💪", "Gym", "Ir al gym") + conexionFila("idioma", "🗣️", "Idiomas", "Estudiar un idioma") + '</div><label class="lbl">Google Calendar</label><div style="font-size:14px;color:var(--mut);line-height:1.5">' + (S.evErr ? "Problema: " + esc(S.evErr) : S.ev.length ? "Conectado · " + S.ev.length + " evento(s) cargados" : "Se leen tus calendarios propios y los eventos nuevos se crean en el principal.") + '</div><button class="btn sec" data-a="evrec" style="margin-top:8px">Recargar calendario</button>' +
      '<label class="lbl">Espacio en este dispositivo</label><div style="font-size:14px;color:var(--mut);line-height:1.5">Solo una copia pequeña de tus datos y la cáscara de la app.</div><button class="btn sec" data-a="liberar" style="margin-top:8px">Liberar espacio</button><div style="font-size:12.5px;color:var(--mut);margin-top:18px;text-align:center">Hábitos v' + VERSION + '</div><button class="btn sec" data-a="mcerrar">Cerrar</button>');
    if (window.FergardAcceso) FergardAcceso.panel($("#acc"));
  }

  /* ---------- avisos dentro de la app ---------- */
  function avKey() { try { var o = JSON.parse(LS.getItem("hb_av") || "{}"); if (o.d !== H.hoy()) o = { d: H.hoy(), k: {} }; return o; } catch (e) { return { d: H.hoy(), k: {} }; } }
  function avMarcar(k) { var o = avKey(); o.k[k] = 1; try { LS.setItem("hb_av", JSON.stringify(o)); } catch (e) {} }
  function mins(hm) { return +hm.slice(0, 2) * 60 + +hm.slice(3, 5); }
  function revisar() {
    if (db.ajustes.rec === false || !$("#aviso").hidden) return;
    var f = H.hoy(), n = new Date(), ahora = n.getHours() * 60 + n.getMinutes(), av = avKey(), it = [];
    listaTar().forEach(function (t) { if (!t.ok && t.f === f && t.h) it.push({ k: "t|" + t.id + "|" + t.h + "|" + (t.av || 0), hm: t.h, lead: t.av || 0, tit: t.t, sub: t.av ? "Empieza en " + t.av + " min · " + t.h : "Pendiente de las " + t.h, tipo: "t", id: t.id }); });
    listaHab().forEach(function (h) { if (h.hora && H.programado(h, f) && !H.cumplido(h, H.valor(db, h.id, f))) it.push({ k: "h|" + h.id + "|" + h.hora, hm: h.hora, lead: 0, tit: (h.e || "") + " " + h.n, sub: h.tipo === "cant" ? "Meta de hoy: " + h.meta + " " + (h.un || "") : "Es hora de tu hábito", tipo: "h", id: h.id }); });
    evDia(f).forEach(function (e) { if (!e.td) it.push({ k: "e|" + e.id + "|" + e.i, hm: e.i.slice(11), lead: 10, tit: e.t, sub: "Evento a las " + e.i.slice(11) + (e.l ? " · " + e.l : ""), tipo: "e" }); });
    for (var i = 0; i < it.length; i++) {
      var x = it[i], m = mins(x.hm); if (av.k[x.k]) continue; if (S.snooze[x.k] && Date.now() < S.snooze[x.k]) continue;
      if (ahora >= m - x.lead && ahora <= m + 120) { mostrarAviso(x); return; }
    }
    var ch = db.ajustes.cierre === undefined ? "21:00" : db.ajustes.cierre, c = pendCierre();
    if (ch && ahora >= mins(ch) && ahora <= mins(ch) + 120 && !av.k["c|" + f] && !(S.snooze["c|" + f] && Date.now() < S.snooze["c|" + f]) && (c.hs.length || c.ts.length)) { mostrarAviso({ k: "c|" + f, tipo: "cierre", tit: "Cierra tu día", sub: c.hs.length + " hábito(s) y " + c.ts.length + " pendiente(s) sin terminar" }); return; }
    var lun = H.lunes(f); if (H.dow(f) === 7 && db.ajustes.rev !== false && ahora >= 18 * 60 && !av.k["r|" + lun]) mostrarAviso({ k: "r|" + lun, tipo: "rev", tit: "Revisión de la semana", sub: "Mira cómo te fue y prepara la próxima" });
  }
  function mostrarAviso(x) {
    var a = $("#aviso"); S.av = x;
    a.innerHTML = "<b>" + esc(x.tit) + "</b><span>" + esc(x.sub) + '</span><div class="ac">' + (x.tipo === "enf" ? (x.fin ? "" : '<button class="p" data-a="av-desc">Descanso 5 min</button>') : x.tipo === "cierre" || x.tipo === "rev" ? '<button class="p" data-a="av-abrir">Abrir</button>' : x.tipo !== "e" ? '<button class="p" data-a="av-ok">' + (x.tipo === "t" ? "Hecho" : "Cumplido") + "</button>" : "") + '<button data-a="' + (x.tipo === "enf" ? "av-otro" : "av-luego") + '">' + (x.tipo === "enf" ? "Otro bloque" : "En 15 min") + '</button><button data-a="av-x">Cerrar</button></div>'; a.hidden = false;
  }
  function cerrarAviso(marcar) { var x = S.av; $("#aviso").hidden = true; if (x && marcar) avMarcar(x.k); S.av = null; setTimeout(revisar, 400); }

  /* ---------- acciones ---------- */
  var A = {
    tab: function (el) { S.tab = el.dataset.t; $("#app").scrollTop = 0; if (S.tab === "cal") { var r = rangoVista(); cargarEv(r[0], r[1]); } pintar(); },
    conf: ajustes, mcerrar: cerrar,
    fab: function () { if (S.tab === "hab") { if (S.hv === "metas") mEditor(null); else hEditor(null); } else abrirAdd(S.tab === "cal" ? S.dia : ""); },
    addd: function () { abrirAdd(S.dia); },
    hchk: function (el) { var h = db.habitos[el.dataset.id], f = H.hoy(); if (!h) return; setValor(h, f, H.valor(db, h.id, f) >= 1 ? 0 : 1); pintar(); },
    hmas: function (el) { var h = db.habitos[el.dataset.id], f = H.hoy(); setValor(h, f, H.valor(db, h.id, f) + paso(h)); pintar(); },
    hmenos: function (el) { var h = db.habitos[el.dataset.id], f = H.hoy(); setValor(h, f, H.valor(db, h.id, f) - paso(h)); pintar(); },
    hdet: function (el) { hDetalle(el.dataset.id); },
    hedit: function (el) { hEditor(el.dataset.id); },
    hnew: function () { hEditor(null); },
    hplant: function (el) { var p = H.PLANTILLAS[+el.dataset.i]; hEditor(null); S.hd.n = p.n; S.hd.e = p.e; S.hd.tipo = p.tipo; S.hd.meta = p.meta; S.hd.un = p.un; S.hd.frec = JSON.parse(JSON.stringify(p.frec)); S.hd.frec.dias = S.hd.frec.dias || []; S.hd.frec.n = S.hd.frec.n || 3; pintarHE(); },
    hpl: function (el) { A.hplant(el); },
    htipo: function (el) { leerHE(); S.hd.tipo = el.dataset.v; if (S.hd.tipo === "cant" && S.hd.meta < 2) S.hd.meta = 10; pintarHE(); },
    hfrec: function (el) { leerHE(); S.hd.frec.t = el.dataset.v; pintarHE(); },
    hdia: function (el) { var d = +el.dataset.d, a = S.hd.frec.dias, i = a.indexOf(d); if (i >= 0) a.splice(i, 1); else a.push(d); el.classList.toggle("on"); el.setAttribute("aria-pressed", i < 0); },
    hsave: function () {
      leerHE(); var d = S.hd; if (!d.n.trim()) { toast("Ponle un nombre al hábito"); return; }
      var fr = d.frec.t === "dias" ? { t: "dias", dias: d.frec.dias.slice().sort() } : d.frec.t === "sem" ? { t: "sem", n: d.frec.n } : { t: "dia" };
      if (fr.t === "dias" && !fr.dias.length) { toast("Elige al menos un día"); return; }
      var h = d.id ? db.habitos[d.id] : { id: H.uid(), ini: H.hoy(), orden: Object.keys(db.habitos).length };
      h.n = d.n.trim(); h.e = d.e; h.tipo = d.tipo; if (d.tipo === "gym") S.gymT = 0; h.meta = d.meta; h.un = d.un; h.frec = fr; h.hora = d.hora || ""; db.habitos[h.id] = h; touch("habito", h.id, h);
      Object.keys(db.registros).forEach(function (k) { var r = db.registros[k]; if (r.h === h.id && (r.hn !== h.n || r.meta !== h.meta)) { r.hn = h.n; r.meta = h.meta; touch("registro", k, r); } });
      cerrar(); pintar(); toast("Hábito guardado"); if (h.tipo === "gym") syncGym(); if (h.tipo === "idioma") { S.idiT = 0; syncIdiomas(true); }
    },
    harch: function () { var h = db.habitos[S.hd.id]; h.arch = !h.arch; touch("habito", h.id, h); cerrar(); pintar(); toast(h.arch ? "Hábito archivado" : "Hábito restaurado"); },
    hdel: function () { if (!confirm("¿Eliminar este hábito y su historial?")) return; var id = S.hd.id; Object.keys(db.registros).forEach(function (k) { if (db.registros[k].h === id) quitar("registro", k); }); quitar("habito", id); cerrar(); pintar(); },
    hreg: function () { var h = db.habitos[S.hdet], f = $("#hd-f").value || H.hoy(); if (f > H.hoy()) { toast("No se puede registrar el futuro"); return; } setValor(h, f, +$("#hd-v").value || 0); cerrar(); pintar(); toast("Registro guardado"); },
    tchk: function (el) { var t = db.tareas[el.dataset.id]; if (!t) return; completar(t, !t.ok); pintar(); },
    tedit: function (el) { tEditor(el.dataset.id); },
    tsave: function () { var t = leerTE(); if (!t) return; touch("tarea", t.id, t); cerrar(); pintar(); toast("Guardado"); },
    tdel: function () { quitar("tarea", S.td); cerrar(); pintar(); },
    tmanana: function () { var t = leerTE(); if (!t) return; t.f = H.addD(t.f || H.hoy(), 1); touch("tarea", t.id, t); cerrar(); pintar(); toast("Postergado 1 día"); },
    tcal: function () { var t = leerTE(); if (!t) return; if (!t.f) { toast("Ponle una fecha primero"); return; } touch("tarea", t.id, t); crearEvento(t.t, t.f, t.h); },
    tsubadd: function () { var c = $("#te-s"), d = document.createElement("div"); d.innerHTML = subHtml({ t: "", ok: false }); c.appendChild(d.firstChild); var i = $$("input", c); i[i.length - 1].focus(); },
    tsubchk: function (el) { el.classList.toggle("on"); },
    tsubdel: function (el) { el.closest(".sub").remove(); },
    tbor: function () { listaTar().filter(function (t) { return t.ok; }).forEach(function (t) { quitar("tarea", t.id); }); pintar(); toast("Hechas borradas"); },
    lista: function (el) { S.lista = el.dataset.l; pintar(); },
    cal: function (el) { S.cal = el.dataset.v; var r = rangoVista(); cargarEv(r[0], r[1]); pintar(); },
    calprev: function () { mover(-1); }, calnext: function () { mover(1); },
    calhoy: function () { S.dia = H.hoy(); var r = rangoVista(); cargarEv(r[0], r[1]); pintar(); },
    dia: function (el) { S.dia = el.dataset.f; pintar(); },
    "qa-fh": function (el) { $("#qa-f").value = el.dataset.v === "hoy" ? H.hoy() : el.dataset.v === "man" ? H.addD(H.hoy(), 1) : ""; if (el.dataset.v === "no") $("#qa-h").value = ""; parseQA(false); },
    "qa-tarea": function () { parseQA(false); var r = S.qa.r; if (!r.titulo) { toast("Escribe qué hay que hacer"); return; } addTarea(r); cerrar(); pintar(); toast("Pendiente añadido" + (r.fecha ? " · " + fRel(r.fecha).toLowerCase() : "")); },
    "qa-evento": function () { parseQA(false); var r = S.qa.r; if (!r.titulo) { toast("Escribe el título del evento"); return; } if (!r.fecha) r.fecha = H.hoy(); crearEvento(r.titulo, r.fecha, r.hora).then(function (ok) { if (ok) { cerrar(); } }); },
    sync: function () { sync(true).then(ajustes); },
    rec: function (el) { db.ajustes.rec = el.checked; touch("ajustes", "a", db.ajustes); },
    evrec: function () { S.evR = {}; S.evErr = ""; var r = rangoVista(); Promise.all([cargarEv(r[0], r[1], true), cargarEv(H.hoy(), H.addD(H.hoy(), 1), true)]).then(function () { toast(S.evErr ? "Problema: " + S.evErr : "Calendario actualizado"); ajustes(); }); },
    liberar: function () {
      if (Object.keys(db.pend).length) { toast("Hay datos sin subir: espera a que se sincronicen"); return; }
      if (!cfg().token || !db.sync.ok) { toast("Todavía no se ha sincronizado: no se puede liberar"); return; }
      LS.removeItem(DB_KEY); db = cargar(); cerrar(); S.cargando = true; pintar(); sync(true).then(function () { S.cargando = false; pintar(); });
    },
    "av-ok": function () { var x = S.av; if (x && x.tipo === "t") { var t = db.tareas[x.id]; if (t) completar(t, true); } else if (x && x.tipo === "h") { var h = db.habitos[x.id]; if (h) setValor(h, H.hoy(), h.tipo === "cant" ? h.meta : 1); } cerrarAviso(true); pintar(); },
    "av-luego": function () { var x = S.av; if (x) S.snooze[x.k] = Date.now() + 15 * 60000; cerrarAviso(false); },
    "av-x": function () { cerrarAviso(true); }
  };
  function mover(d) {
    var p = H.pf(S.dia); if (S.cal === "mes") S.dia = H.fstr(new Date(p.getFullYear(), p.getMonth() + d, 1)); else S.dia = H.addD(S.dia, 7 * d);
    var r = rangoVista(); cargarEv(r[0], r[1]); pintar();
  }
  Object.assign(A, {
    hv: function (el) { S.hv = el.dataset.v; pintar(); }, pv: function (el) { S.pv = el.dataset.v; pintar(); },
    mnew: function () { mEditor(null); }, medit: function (el) { mEditor(el.dataset.id); },
    mlig: function (el) { leerME(); S.me.modo = { "1": "hab", "0": "man", "2": "idi" }[el.dataset.v]; S.me.lig = S.me.modo === "hab"; if (!S.me.lig) S.me.hab = ""; if (S.me.modo === "idi") { S.me.idi = S.me.idi || { i: "en", a: "a1" }; S.me.obj = S.me.idi.a === "a1" ? 50 : 5; } pintarME(); },
    msave: function () {
      leerME(); var d = S.me; if (!d.n.trim()) { toast("Ponle nombre a la meta"); return; } if (d.lig && !d.hab) { toast("Elige un hábito o cambia a «A mano»"); return; }
      var m = d.id ? db.metas[d.id] : { id: H.uid() }, h = d.lig ? db.habitos[d.hab] : null;
      m.n = d.n.trim(); m.e = d.e; m.obj = d.obj; m.fin = d.fin; m.hab = d.lig ? d.hab : ""; m.hn = h ? h.n : ""; m.un = h ? (h.tipo === "cant" ? h.un : "veces") : d.un; m.ini = d.ini || H.hoy(); m.act = d.lig ? 0 : d.act; if (d.modo === "idi") { m.idi = d.idi; m.hab = ""; m.hn = ""; m.un = "lecciones"; m.act = 0; m.obj = d.obj; if (!m.n) m.n = "Idiomas"; } else delete m.idi; db.metas[m.id] = m; touch("meta", m.id, m); cerrar(); pintar(); toast("Meta guardada");
    },
    mdel: function () { if (!confirm("¿Eliminar esta meta?")) return; quitar("meta", S.me.id); cerrar(); pintar(); },
    mmas: function (el) { var m = db.metas[el.dataset.id]; m.act = (m.act || 0) + 1; touch("meta", m.id, m); pintar(); },
    mmenos: function (el) { var m = db.metas[el.dataset.id]; m.act = Math.max(0, (m.act || 0) - 1); touch("meta", m.id, m); pintar(); },
    dm: function (el) { setDia(H.hoy(), +el.dataset.v, null); pintar(); },
    dmm: function (el) { S.dmood = +el.dataset.v; $$(".moods button").forEach(function (b) { b.classList.toggle("on", b === el); b.setAttribute("aria-pressed", b === el); }); },
    dsheet: function (el) { dSheet(el.dataset.f); },
    dsave: function () { setDia(S.df, S.dmood || null, $("#d-t").value); cerrar(); pintar(); toast("Diario guardado"); },
    cierre: cierre,
    "cl-h": function (el) { var h = db.habitos[el.dataset.id]; setValor(h, H.hoy(), h.tipo === "cant" ? h.meta : 1); cierre(); pintar(); },
    "cl-t": function (el) { var t = db.tareas[el.dataset.id]; if (t) completar(t, !t.ok); cierre(); pintar(); },
    "cl-man": function () { var c = pendCierre(), m = H.addD(H.hoy(), 1); c.ts.forEach(function (t) { t.f = m; touch("tarea", t.id, t); }); cierre(); pintar(); toast(c.ts.length + " pendientes pasaron a mañana"); },
    "cl-ok": function () { setDia(H.hoy(), S.dmood || null, $("#d-t").value); cerrar(); pintar(); toast("Día cerrado. ¡Buen descanso!"); },
    revsem: revSemana, revaj: function (el) { db.ajustes.rev = el.checked; touch("ajustes", "a", db.ajustes); },
    "rv-sig": function () { var l = H.lunes(H.hoy()), sig = H.addD(l, 7), fin = H.addD(l, 6), n = 0; listaTar().forEach(function (t) { if (!t.ok && t.f && t.f <= fin) { t.f = sig; touch("tarea", t.id, t); n++; } }); revSemana(); pintar(); toast(n + " pendientes pasaron a la próxima semana"); },
    "rv-ok": function () { var l = S.rl, t = $("#rv-t").value.trim(); if (t) { db.diario["S" + l] = { f: l, sem: true, t: t }; touch("diario", "S" + l, db.diario["S" + l]); } else if (db.diario["S" + l]) quitar("diario", "S" + l); cerrar(); toast("Revisión guardada"); },
    "av-abrir": function () { var x = S.av; cerrarAviso(true); if (x && x.tipo === "rev") revSemana(); else cierre(); },
    lbor: function (el) { var n = el.dataset.l; listaTar().forEach(function (t) { if (t.ok && (t.l || "") === n) quitar("tarea", t.id); }); pintar(); },
    lnew: function () { var i = $("#nl-n"), n = (i.value || "").trim().replace(/^#/, ""); if (!n) return; db.ajustes.listas = (db.ajustes.listas || []).filter(function (x) { return x !== n; }).concat([n]); touch("ajustes", "a", db.ajustes); pintar(); }
  });
  Object.assign(A, {
    hord: function () { S.hord = !S.hord; pintar(); },
    hsube: function (el) { moverHab(el.dataset.id, -1); }, hbaja: function (el) { moverHab(el.dataset.id, 1); },
    enfoque: enfoque,
    "enf-min": function (el) { S.enfMin = +el.dataset.m; $$("[data-a=enf-min]").forEach(function (b) { b.classList.toggle("on", b === el); }); },
    "enf-ini": function () { var m = S.enfMin || 25, h = $("#enf-h") ? $("#enf-h").value : ""; cerrar(); enfGuardar({ ini: Date.now(), fin: Date.now() + m * 60000, min: m, hab: h, tipo: "foco" }); toast("Enfoque de " + m + " min · ¡a trabajar!"); },
    "enf-fin": function () { cerrar(); terminarEnf(false); },
    "enf-can": function () { cerrar(); S.enf = null; try { LS.removeItem("hb_enf"); } catch (e) {} chipEnf(); toast("Enfoque cancelado"); },
    "av-desc": function () { var x = S.av; cerrarAviso(true); enfGuardar({ ini: Date.now(), fin: Date.now() + 5 * 60000, min: 5, hab: x && x.hab || "", tipo: "desc" }); toast("Descanso de 5 min"); },
    "av-otro": function () { cerrarAviso(true); enfoque(); },
    pf: function (el) { S.pf = el.dataset.v; pintar(); },
    hideas: ideas,
    hidea: function (el) {
      var p = H.IDEAS[+el.dataset.i], sc = $(".caja") ? $(".caja").scrollTop : 0; if (!p) return;
      var h = { id: H.uid(), n: p.n, e: p.e, tipo: p.tipo, meta: p.meta, un: p.un, frec: JSON.parse(JSON.stringify(p.frec)), hora: "", ini: H.hoy(), orden: Object.keys(db.habitos).length };
      db.habitos[h.id] = h; touch("habito", h.id, h); ideas(); if ($(".caja")) $(".caja").scrollTop = sc; pintar(); toast("Añadido: " + p.n);
    },
    "cl-man": function () { var c = pendCierre(), m = H.addD(H.hoy(), 1), mov = c.ts.filter(function (t) { return nivel(t) !== 1; }), sio = c.ts.length - mov.length; mov.forEach(function (t) { t.f = m; touch("tarea", t.id, t); }); cierre(); pintar(); toast(mov.length + " pasaron a mañana" + (sio ? " · " + sio + " «sí o sí» siguen hoy" : "")); },
    "cl-p": function (el) { var t = db.tareas[el.dataset.id]; if (t) { t.f = H.addD(H.hoy(), 1); touch("tarea", t.id, t); } cierre(); pintar(); toast("Pasó a mañana"); }
  });
  Object.assign(A, { actualizar: function () {
    var fin = function () { location.reload(); };
    Promise.resolve().then(function () { return window.caches ? caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); }) : null; })
      .then(function () { return navigator.serviceWorker ? navigator.serviceWorker.getRegistrations().then(function (rs) { return Promise.all(rs.map(function (r) { return r.unregister(); })); }) : null; }).then(fin, fin);
  } });
  Object.assign(A, {
    crearGym: function () { crearDe("gym"); }, crearIdi: function () { crearDe("idioma"); },
    rgp: function (el) { var k = el.dataset.k, r = REGS[k], v = regVal(H.hoy(), k) || 0; setReg(H.hoy(), k, Math.round((v + r.paso) * 10) / 10); pintar(); },
    rgm: function (el) { var k = el.dataset.k, r = REGS[k], v = regVal(H.hoy(), k) || 0; setReg(H.hoy(), k, Math.max(0, Math.round((v - r.paso) * 10) / 10)); pintar(); },
    rge: function (el) { var k = el.dataset.k, v = +el.dataset.v; setReg(H.hoy(), k, regVal(H.hoy(), k) === v ? null : v); pintar(); },
    regcfg: function () { var act = regsAct(); abrir('<h3>¿Qué quieres registrar?</h3><div class="st" style="color:var(--mut);font-weight:600;margin:-4px 0 6px">Elige los que te sirvan; el resto no aparece.</div>' + Object.keys(REGS).map(function (k) { return '<label class="sw"><input type="checkbox" data-a="regtog" data-k="' + k + '"' + (act.indexOf(k) >= 0 ? " checked" : "") + "> " + REGS[k].e + " " + REGS[k].n + (REGS[k].u ? " (" + REGS[k].u + ")" : "") + "</label>"; }).join("") + '<button class="btn" data-a="mcerrar">Listo</button>'); },
    regtog: function (el) { var a = regsAct().slice(), k = el.dataset.k, i = a.indexOf(k); if (el.checked && i < 0) a.push(k); if (!el.checked && i >= 0) a.splice(i, 1); db.ajustes.regs = a; touch("ajustes", "a", db.ajustes); pintar(); },
    topedit: topEditor,
    topcand: function (el) { var t = db.tareas[el.dataset.id]; if (!t) return; for (var i = 0; i < 3; i++) { var inp = $("#tp" + i); if (inp && !inp.value.trim()) { inp.value = t.t; S.topids[i] = t.id; return; } } toast("Ya tienes 3 prioridades; borra una para cambiarla"); },
    topsave: function () {
      var f = H.hoy(), d = dDoc(f), prev = d.top || [], nuevo = [];
      [0, 1, 2].forEach(function (i) { var t = $("#tp" + i).value.trim(); if (!t) return; var viejo = prev.filter(function (x) { return x.t === t; })[0]; nuevo.push({ t: t, id: S.topids[i] || (viejo && viejo.id) || "", ok: !!(viejo && viejo.ok) }); });
      d.top = nuevo; guardarDia(d); cerrar(); pintar(); toast(nuevo.length ? "Prioridades guardadas" : "Prioridades borradas");
    },
    toptg: function (el) {
      var f = H.hoy(), d = dDoc(f), x = (d.top || [])[+el.dataset.i]; if (!x) return; x.ok = !x.ok; var t = x.id && db.tareas[x.id]; if (t && t.ok !== x.ok) completar(t, x.ok); guardarDia(d);
      pintar(); if (d.top.length && d.top.every(function (y) { return y.ok; })) toast("¡Día ganado! ✅");
    },
    topplan: function () { var f = H.hoy(), d = dDoc(f), plan = (db.diario[H.addD(f, -1)] || {}).man; d.top = d.top || []; if (d.top.length >= 3) { toast("Ya tienes 3 prioridades: edita una para cambiarla"); return; } d.top.push({ t: plan, id: "", ok: false }); guardarDia(d); pintar(); toast("Añadido a tus prioridades"); },
    sugir: function (el) { var h = db.habitos[el.dataset.id]; if (!h) return; if (h.tipo === "cant") { hDetalle(h.id); return; } setValor(h, H.hoy(), 1); pintar(); toast("¡Bien! «" + h.n + "» marcado"); }
  });
  document.addEventListener("click", function (e) { var el = e.target.closest("[data-a]"); if (!el) return; var f = A[el.dataset.a]; if (!f) return; if (el.type !== "checkbox") e.preventDefault(); e.stopPropagation(); f(el); });
  document.addEventListener("keydown", function (e) {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches('[role="button"][data-a]')) { e.preventDefault(); e.target.click(); }
    if (e.key === "Enter" && e.target.id === "qa-t") { e.preventDefault(); A["qa-tarea"](); }
    if (e.key === "Escape" && !$("#modal").hidden) cerrar();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Enter") return; var t = e.target;
    if (t.classList && t.classList.contains("lad")) { var v = t.value.trim(), n = t.dataset.l; if (!v) return; e.preventDefault(); addTarea({ titulo: v.charAt(0).toUpperCase() + v.slice(1), lista: n }); pintar(); var again = $$(".lad").filter(function (x) { return x.dataset.l === n; })[0]; if (again) again.focus(); }
    if (t.id === "nl-n") { e.preventDefault(); A.lnew(); }
    if (t.id === "nt-t") { var v = t.value.trim(); if (!v) return; e.preventDefault(); addTarea({ titulo: v.charAt(0).toUpperCase() + v.slice(1), lista: "Notas", fecha: "", hora: "", pr: 4 }); pintar(); toast("Nota guardada"); var n2 = $("#nt-t"); if (n2) n2.focus(); }
  });
  document.addEventListener("input", function (e) { if (e.target.id === "qa-t") parseQA(true); });
  document.addEventListener("change", function (e) {
    if (e.target.id === "he-pl" && e.target.value) aplicarPlantilla(e.target.value);
    if (e.target.id === "me-ii" || e.target.id === "me-ia") { leerME(); pintarME(); if (S.me.idi && !$("#me-n").value.trim()) { $("#me-n").value = (S.me.idi.a === "a1" ? "Terminar el nivel A1 de " : "Unidad " + S.me.idi.a.slice(4) + " de ") + IDI_NOM[S.me.idi.i]; } syncIdiomas(true); }
    if (e.target.id === "dh-t") setDia(H.hoy(), null, e.target.value);
    if (/^g-[0-2]$/.test(e.target.id)) { var dg = dDoc(H.hoy()); dg.g = dg.g || ["", "", ""]; dg.g[+e.target.id.slice(2)] = e.target.value.trim(); guardarDia(dg); }
    if (e.target.id === "pm-t") { var dp = dDoc(H.hoy()); dp.man = e.target.value.trim(); guardarDia(dp); if (dp.man) toast("Plan de mañana guardado"); }
    if (e.target.classList && e.target.classList.contains("rgin")) { var vv = e.target.value === "" ? null : +e.target.value; setReg(H.hoy(), e.target.dataset.k, vv); }
    if (e.target.id === "aj-cierre") { db.ajustes.cierre = e.target.value; touch("ajustes", "a", db.ajustes); }
    if (e.target.id === "qa-a" || e.target.id === "qa-pr" || e.target.id === "qa-r" || e.target.id === "qa-l") parseQA(false);
  });
  document.addEventListener("change", function (e) { if (e.target.id === "qa-f" || e.target.id === "qa-h") parseQA(false); });
  $("#fab").addEventListener("click", function () { A.fab(); });

(function () {
    var y0 = null, dy = 0, caja = null, m = $("#modal");
    m.addEventListener("touchstart", function (e) { caja = e.target.closest(".caja"); if (!caja || caja.scrollTop > 0) { caja = null; return; } y0 = e.touches[0].clientY; dy = 0; }, { passive: true });
    m.addEventListener("touchmove", function (e) { if (!caja || y0 == null) return; dy = e.touches[0].clientY - y0; if (dy > 0) { caja.style.transition = "none"; caja.style.transform = "translateY(" + dy + "px)"; } else dy = 0; }, { passive: true });
    m.addEventListener("touchend", function () { if (!caja) return; if (dy > 110) cerrar(); else { caja.style.transition = "transform .2s"; caja.style.transform = ""; } y0 = null; dy = 0; caja = null; });
  })();

  /* ---------- arranque ---------- */
  function boot() {
    var vacio = !db.sync.ult && !Object.keys(db.habitos).length && !Object.keys(db.tareas).length; if (vacio && cfg().token) S.cargando = true;
    pintarTabs(); pintar();
    window.HB_DEBUG = { db: function () { return db; }, S: S, A: A, pintar: pintar, revisar: revisar, setEv: function (e) { S.ev = e; pintar(); } };
    sync(false).then(function () { S.cargando = false; pintar(); cargarEv(H.hoy(), H.addD(H.hoy(), 1)); syncGym(); syncIdiomas(); revisar(); buscarActualizacion(); cargarEv(H.addD(H.hoy(), 2), H.addD(H.hoy(), 30)); });
    S.enf = enfLeer(); try { S.idiRes = JSON.parse(LS.getItem("hb_idi") || "null"); } catch (e) { S.idiRes = null; } chipEnf(); setInterval(tickEnf, 1000);
    setInterval(function () { if (!document.hidden) { var h = H.hoy(); if (S.lastDay && S.lastDay !== h) { S.dia = h; pintar(); } S.lastDay = h; revisar(); } }, 30000); S.lastDay = H.hoy();
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(function () {});
  }
  FergardAcceso.iniciar({
    app: "habitos", nombre: "Hábitos", clientId: CFG.CLIENT_ID, onListo: boot,
    tema: { bg: "#F1EFE9", fg: "#1B2433", mut: "#4F5B75", acento: "#1E2F57", btnBg: "#1E2F57", btnFg: "#FFFFFF", font: "ui-rounded,'SF Pro Rounded',-apple-system,system-ui,sans-serif" },
    marca: '<svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="#1E2F57" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3.5" width="14" height="17" rx="2.5"/><path d="M9 12.5l2.2 2.2L15.5 10"/></svg>'
  });
})();
