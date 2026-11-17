/* Hábitos · hábitos con meta, pendientes, calendario (Google Calendar) y avisos dentro de la app. Los datos van a tu hoja «Fergard · Hábitos». */
(function () {
  "use strict";
  var CFG = window.FG_CFG || {}, VERSION = "0.1.1", DB_KEY = "habitos_db", H = window.HCore;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var LS = (function () { try { localStorage.setItem("_t", "1"); localStorage.removeItem("_t"); return localStorage; } catch (e) { var m = {}; return { getItem: function (k) { return m[k] || null; }, setItem: function (k, v) { m[k] = String(v); }, removeItem: function (k) { delete m[k]; } }; } })();
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function p2(n) { return (n < 10 ? "0" : "") + n; }

  /* ---------- datos locales y nube ---------- */
  function vacia() { return { v: 1, habitos: {}, registros: {}, tareas: {}, ajustes: { rec: true }, pend: {}, sync: { ult: 0 } }; }
  function cargar() { var d; try { d = JSON.parse(LS.getItem(DB_KEY)); } catch (e) { d = null; } if (!d || typeof d !== "object") d = vacia(); var b = vacia(); Object.keys(b).forEach(function (k) { if (d[k] === undefined) d[k] = b[k]; }); return d; }
  var db = cargar();
  var S = { tab: "hoy", cal: "sem", dia: H.hoy(), lista: "", ev: [], evR: {}, evErr: "", cargando: false, sync: "", hd: null, qa: null, snooze: {} };
  function save() { try { LS.setItem(DB_KEY, JSON.stringify(db)); } catch (e) {} }
  function touch(t, id, o) { if (o) o.upd = Date.now(); db.pend[t + ":" + id] = Date.now(); save(); schedSync(); }
  function mapa(t) { return t === "habito" ? db.habitos : t === "registro" ? db.registros : t === "tarea" ? db.tareas : null; }
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
      claves.forEach(function (k) { if (db.pend[k] <= t0) delete db.pend[k]; });
      var n = aplicar(r.docs); db.sync.ult = r.ahora || t0; db.sync.ok = Date.now(); if (r.url) db.sync.url = r.url; save();
      S.sync = "Al día"; if (manual) toast("Sincronizado"); if (n) pintar();
    }).catch(function () { S.sync = "Sin conexión · se subirá después"; if (manual) toast("Sin conexión"); }).then(function () { syncing = false; pintarNube(); });
  }
  window.addEventListener("online", function () { sync(false); });
  document.addEventListener("visibilitychange", function () { if (!document.hidden) { sync(false); S.dia = S.dia || H.hoy(); revisar(); } });

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
  function subHab(h) {
    var f = H.hoy(), partes = [];
    if (h.tipo === "cant") partes.push("Meta " + h.meta + " " + esc(h.un || ""));
    if (h.frec && h.frec.t === "sem") partes.push(H.hechosSemana(h, db, f) + "/" + h.frec.n + " esta semana"); else if (h.frec && h.frec.t === "dias") partes.push(esc(H.textoFrec(h)));
    var r = textoRacha(h); if (r) partes.push(r); if (h.hora) partes.push("⏰ " + esc(h.hora));
    return partes.join(" · ") || "Cada día";
  }
  function filaHab(h, f) {
    var v = H.valor(db, h.id, f), ok = H.cumplido(h, v), id = esc(h.id), ctl;
    if (h.tipo === "cant") ctl = '<div class="cant"><button data-a="hmenos" data-id="' + id + '" aria-label="Quitar ' + paso(h) + '">−</button><div class="v">' + v + "/" + h.meta + "<small>" + esc(h.un || "") + '</small></div><button class="mas" data-a="hmas" data-id="' + id + '" aria-label="Sumar ' + paso(h) + '">+</button></div>';
    else ctl = '<div class="cbw"><button class="cb' + (ok ? " on" : "") + '" data-a="hchk" data-id="' + id + '" aria-label="' + (ok ? "Desmarcar " : "Marcar ") + esc(h.n) + '" aria-pressed="' + ok + '">' + ico("chk") + "</button></div>";
    return '<div class="fila' + (ok ? " ok" : "") + '" role="button" tabindex="0" data-a="hdet" data-id="' + id + '"><div class="em">' + esc(h.e || "⭐") + '</div><div class="tx"><div class="tt">' + esc(h.n) + '</div><div class="st">' + subHab(h) + "</div></div>" + ctl + "</div>";
  }

  /* ---------- pendientes y agenda ---------- */
  function listaTar() { return Object.keys(db.tareas).map(function (k) { return db.tareas[k]; }); }
  function tareasDe(f) { return listaTar().filter(function (t) { return t.f === f; }); }
  function atrasadas() { var h = H.hoy(); return listaTar().filter(function (t) { return !t.ok && t.f && t.f < h; }).sort(function (a, b) { return a.f < b.f ? -1 : 1; }); }
  function evDia(f) {
    return S.ev.filter(function (e) { var a = e.i.slice(0, 10), b = e.f.slice(0, 10); if (!e.td && e.f.slice(11) === "00:00" && b > a) b = H.addD(b, -1); return a <= f && f <= b; });
  }
  function pri(t) { return t.p === 2 ? '<span class="pill alta">Alta</span>' : t.p === 1 ? '<span class="pill">Media</span>' : ""; }
  function filaTar(t, conFecha) {
    var id = esc(t.id), subs = t.sub && t.sub.length ? '<span class="pill">' + t.sub.filter(function (s) { return s.ok; }).length + "/" + t.sub.length + " pasos</span>" : "";
    var atras = !t.ok && t.f && t.f < H.hoy() ? '<span class="pill alta">Atrasada</span>' : "";
    var st = atras + pri(t) + (t.l ? '<span class="pill">#' + esc(t.l) + "</span>" : "") + subs + (conFecha && t.f ? '<span class="pill">' + esc(fRel(t.f)) + "</span>" : "") + (t.nota ? esc(t.nota.slice(0, 40)) : "");
    return '<div class="fila t' + (t.ok ? " ok" : "") + '" role="button" tabindex="0" data-a="tedit" data-id="' + id + '"><div class="hora">' + esc(t.h || "") + '</div><div class="tx"><div class="tt">' + esc(t.t) + "</div>" + (st ? '<div class="st">' + st + "</div>" : "") + '</div><div class="cbw"><button class="cb' + (t.ok ? " on" : "") + '" data-a="tchk" data-id="' + id + '" aria-label="' + (t.ok ? "Desmarcar " : "Completar ") + esc(t.t) + '" aria-pressed="' + !!t.ok + '">' + ico("chk") + "</button></div></div>";
  }
  function filaEv(e) {
    return '<div class="fila t"><div class="hora">' + (e.td ? "Todo<br>el día" : esc(e.i.slice(11))) + '</div><div class="tx"><div class="tt">' + esc(e.t) + '</div><div class="st"><span class="pill cal">Google Calendar</span>' + (e.l ? esc(e.l) : "") + "</div></div></div>";
  }
  function agenda(f) {   // eventos + pendientes de un día, por hora
    var it = [];
    evDia(f).forEach(function (e) { it.push({ k: e.td ? "00:00" : e.i.slice(11), h: filaEv(e) }); });
    tareasDe(f).forEach(function (t) { it.push({ k: t.h || "99:99", d: t.ok ? 1 : 0, h: filaTar(t) }); });
    it.sort(function (a, b) { return (a.d || 0) - (b.d || 0) || (a.k < b.k ? -1 : a.k > b.k ? 1 : 0); });
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
  function vHoy() {
    var f = H.hoy(), r = H.resumenDia(db, f), l = H.lunes(f), hs = listaHab().filter(function (h) { return H.programado(h, f); }), sem = "";
    for (var i = 0; i < 7; i++) { var d = H.addD(l, i), rd = H.resumenDia(db, d), pc = d > f || !rd.tot ? 0 : Math.round(100 * rd.ok / rd.tot); sem += '<div class="' + (d === f ? "hoy" : "") + '"><b><i style="height:' + pc + '%"></i></b>' + H.DIAS[i].charAt(0).toUpperCase() + "</div>"; }
    var h = '<div class="hero"><div class="t">Hábitos de hoy</div><div class="n">' + r.ok + "<small> / " + r.tot + '</small></div><div class="barra"><i style="width:' + (r.tot ? Math.round(100 * r.ok / r.tot) : 0) + '%"></i></div><div class="sem" aria-hidden="true">' + sem + "</div></div>";
    var vac = '<div class="vacio"><b>Aún no tienes hábitos para hoy</b>Crea el primero: leer 10 páginas, beber agua, caminar…</div><button class="btn" data-a="hnew">Crear un hábito</button>';
    var at = atrasadas(), atH = at.map(function (t) { return filaTar(t, true); }).join("");
    return cab("Hoy", fLargo(f)) + h + '<div class="sec"><span>Mis hábitos</span><button data-a="hnew">+ Nuevo</button></div>' + (hs.length ? '<div class="lista">' + hs.map(function (x) { return filaHab(x, f); }).join("") + "</div>" : vac) +
      (atH ? bloque("Atrasadas", atH, "") : "") + avisoCal() + bloque("Agenda de hoy", agenda(f), "Nada pendiente para hoy. Toca + para añadir.") + bloque("Mañana · " + fCorto(H.addD(f, 1)), agenda(H.addD(f, 1)), "Nada planeado para mañana todavía.");
  }
  function vPend() {
    var f = H.hoy(), m = H.addD(f, 1), todas = listaTar(), listas = {}; todas.forEach(function (t) { if (t.l) listas[t.l] = 1; });
    var fl = function (t) { return !S.lista || t.l === S.lista; }, ab = todas.filter(function (t) { return !t.ok && fl(t); });
    var ord = function (a, b) { return (a.f || "9") < (b.f || "9") ? -1 : (a.f || "9") > (b.f || "9") ? 1 : (a.h || "99") < (b.h || "99") ? -1 : 1; };
    ab.sort(ord);
    var sec = function (n, arr, c) { return arr.length ? bloque(n, arr.map(function (t) { return filaTar(t, c); }).join(""), "") : ""; };
    var hechas = todas.filter(function (t) { return t.ok && fl(t); }).sort(function (a, b) { return (b.upd || 0) - (a.upd || 0); }).slice(0, 8);
    var chips = '<div class="chips"><button class="' + (!S.lista ? "on" : "") + '" data-a="lista" data-l="">Todas</button>' + Object.keys(listas).sort().map(function (l) { return '<button class="' + (S.lista === l ? "on" : "") + '" data-a="lista" data-l="' + esc(l) + '">#' + esc(l) + "</button>"; }).join("") + "</div>";
    var cuerpo = sec("Atrasadas", ab.filter(function (t) { return t.f && t.f < f; }), true) + sec("Hoy", ab.filter(function (t) { return t.f === f; })) + sec("Mañana", ab.filter(function (t) { return t.f === m; })) + sec("Próximos", ab.filter(function (t) { return t.f && t.f > m; }), true) + sec("Algún día", ab.filter(function (t) { return !t.f; }));
    if (!cuerpo) cuerpo = '<div class="vacio" style="margin-top:20px"><b>Todo al día</b>No tienes pendientes' + (S.lista ? " en #" + esc(S.lista) : "") + ". Toca + para añadir uno escribiendo.</div>";
    return cab("Pendientes", ab.length + (ab.length === 1 ? " por hacer" : " por hacer")) + (Object.keys(listas).length ? chips : "") + cuerpo +
      (hechas.length ? bloque("Hechas", hechas.map(function (t) { return filaTar(t, true); }).join(""), "", '<button data-a="tbor">Borrar hechas</button>') : "");
  }
  function pts(f) { var n = evDia(f).length, t = tareasDe(f).filter(function (x) { return !x.ok; }).length, s = ""; for (var i = 0; i < Math.min(3, n + t); i++) s += "<i></i>"; return '<div class="pts">' + s + "</div>"; }
  function vCal() {
    var f = H.hoy(), p = H.pf(S.dia), r = rangoVista(), cuerpo, tit;
    if (S.cal === "mes") {
      tit = cap(H.MESES[p.getMonth()]) + " " + p.getFullYear(); var g = '<div class="mes">' + "LMMJVSD".split("").map(function (c) { return '<div class="h">' + c + "</div>"; }).join("");
      for (var d = r[0]; d <= r[1]; d = H.addD(d, 1)) { var dd = H.pf(d); g += '<button class="' + (dd.getMonth() !== p.getMonth() ? "fuera " : "") + (d === S.dia ? "on " : "") + (d === f ? "hoy" : "") + '" data-a="dia" data-f="' + d + '" aria-label="' + esc(fLargo(d)) + '">' + dd.getDate() + pts(d) + "</button>"; }
      cuerpo = g + "</div>";
    } else {
      var l = r[0]; tit = fCorto(l) + " – " + fCorto(r[1]); cuerpo = '<div class="dias7">';
      for (var i = 0; i < 7; i++) { var x = H.addD(l, i); cuerpo += '<button class="' + (x === S.dia ? "on " : "") + (x === f ? "hoy" : "") + '" data-a="dia" data-f="' + x + '" aria-label="' + esc(fLargo(x)) + '">' + H.DIAS[i].slice(0, 3) + "<b>" + H.pf(x).getDate() + "</b>" + pts(x) + "</button>"; }
      cuerpo += "</div>";
    }
    return cab("Calendario", cfg().token ? "Conectado a Google Calendar" : "Sin vincular") + '<div class="seg"><button class="' + (S.cal === "sem" ? "on" : "") + '" data-a="cal" data-v="sem">Semana</button><button class="' + (S.cal === "mes" ? "on" : "") + '" data-a="cal" data-v="mes">Mes</button></div>' +
      '<div class="nav"><button data-a="calprev" aria-label="Anterior">' + ico("izq") + "</button><b>" + esc(tit) + '</b><button data-a="calnext" aria-label="Siguiente">' + ico("der") + "</button></div>" + cuerpo + avisoCal() +
      bloque(esc(fLargo(S.dia)), agenda(S.dia), "Sin eventos ni pendientes este día.", '<button data-a="addd">+ Añadir</button>') + (S.dia !== f ? '<button class="btn sec" data-a="calhoy">Ir a hoy</button>' : "");
  }
  function vHab() {
    var hs = listaHab(), act = hs.filter(function (h) { return !h.arch; }), arc = hs.filter(function (h) { return h.arch; });
    var fila = function (h) { return '<div class="fila" role="button" tabindex="0" data-a="hdet" data-id="' + esc(h.id) + '"><div class="em">' + esc(h.e || "⭐") + '</div><div class="tx"><div class="tt">' + esc(h.n) + '</div><div class="st">' + esc(H.textoFrec(h)) + (h.tipo === "cant" ? " · " + h.meta + " " + esc(h.un || "") : "") + (textoRacha(h) ? " · " + textoRacha(h) : "") + "</div></div></div>"; };
    var pl = '<div class="vacio"><b>Empieza con una plantilla</b>Toca una para crearla y ajústala después.</div><div class="lista" style="margin-top:10px">' + H.PLANTILLAS.map(function (p, i) { return '<div class="fila" role="button" tabindex="0" data-a="hplant" data-i="' + i + '"><div class="em">' + p.e + '</div><div class="tx"><div class="tt">' + esc(p.n) + '</div><div class="st">' + esc(H.textoFrec(p)) + (p.tipo === "cant" ? " · " + p.meta + " " + esc(p.un) : "") + "</div></div></div>"; }).join("") + "</div>";
    return cab("Hábitos", act.length + (act.length === 1 ? " hábito activo" : " hábitos activos")) + (act.length ? '<div class="lista">' + act.map(fila).join("") + "</div>" : pl) + '<button class="btn" data-a="hnew">+ Nuevo hábito</button>' + (arc.length ? bloque("Archivados", arc.map(fila).join(""), "") : "");
  }
  function vProg() {
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
  var TABS = [["hoy", "Hoy"], ["pend", "Pendientes"], ["cal", "Calendario"], ["hab", "Hábitos"], ["prog", "Progreso"]];
  function pintarTabs() { $("#tabs").innerHTML = TABS.map(function (t) { return '<button class="' + (S.tab === t[0] ? "on" : "") + '" data-a="tab" data-t="' + t[0] + '" aria-current="' + (S.tab === t[0]) + '">' + ico(t[0]) + t[1] + "</button>"; }).join(""); }
  function pintar() {
    var a = $("#app"), sc = a.scrollTop, v = { hoy: vHoy, pend: vPend, cal: vCal, hab: vHab, prog: vProg }[S.tab];
    if (S.cargando) { a.innerHTML = cab("Hábitos", "Cargando tus datos…") + '<div class="vacio">Trayendo tu información de la hoja…</div>'; return; }
    a.innerHTML = v(); a.scrollTop = sc; pintarTabs(); $("#fab").hidden = S.tab === "prog"; pintarNube();
  }
  function pintarNube() { var n = Object.keys(db.pend).length, e = $("#fab"); if (e) e.title = n ? n + " cambio(s) por subir" : ""; }

  /* ---------- hojas ---------- */
  function abrir(html) { var m = $("#modal"); m.innerHTML = '<div class="caja"><div class="asa"></div>' + html + "</div>"; m.hidden = false; m.onclick = function (e) { if (e.target === m) cerrar(); }; }
  function cerrar() { $("#modal").hidden = true; $("#modal").innerHTML = ""; S.hd = null; S.qa = null; }
  function addTarea(o) {
    var t = { id: H.uid(), t: o.titulo, f: o.fecha || "", h: o.hora || "", l: o.lista || "", p: o.prioridad || 0, ok: false, nota: "", sub: [] };
    db.tareas[t.id] = t; touch("tarea", t.id, t); return t;
  }
  function parseQA(deTexto) {
    var v = ($("#qa-t").value || ""), r = H.parsear(v, H.hoy()), fi = $("#qa-f"), hi = $("#qa-h");
    if (deTexto !== false) { if (r.fecha) fi.value = r.fecha; if (r.hora) hi.value = r.hora; }
    r.fecha = fi.value || ""; r.hora = r.fecha ? (hi.value || "") : ""; S.qa.r = r;
    var c = []; c.push(r.fecha ? "📅 " + fRel(r.fecha) : "Sin fecha (algún día)"); if (r.hora) c.push("🕒 " + r.hora); if (r.lista) c.push("#" + r.lista); if (r.prioridad) c.push(r.prioridad === 2 ? "Prioridad alta" : "Prioridad media");
    $("#qa-p").innerHTML = c.map(function (x) { return '<span class="pill cal">' + esc(x) + "</span>"; }).join("");
  }
  function abrirAdd(f) {
    S.qa = { f: f || "", r: null };
    abrir('<h3>Añadir</h3><input id="qa-t" placeholder="Llamar al dentista mañana 10am #salud !" autocomplete="off" autocapitalize="sentences" enterkeyhint="done"><div class="dup"><div><label class="lbl" for="qa-f">Fecha (puedes dejarla en blanco)</label><input id="qa-f" type="date" value="' + esc(S.qa.f || H.hoy()) + '"></div><div><label class="lbl" for="qa-h">Hora</label><input id="qa-h" type="time"></div></div><div class="chips" style="margin-top:8px"><button data-a="qa-fh" data-v="hoy">Hoy</button><button data-a="qa-fh" data-v="man">Mañana</button><button data-a="qa-fh" data-v="no">Sin fecha</button></div><div class="parte" id="qa-p"></div><button class="btn" data-a="qa-tarea">Añadir pendiente</button><button class="btn sec" data-a="qa-evento">Crear evento en Google Calendar</button><button class="btn sec" data-a="hnew">Nuevo hábito</button><div class="vacio" style="padding:14px 4px 0;font-size:13px">Ejemplos: «pagar la luz hoy», «reunión con Laura el viernes 15:30», «comprar regalo en 3 días #casa». Con ! o «urgente» sube la prioridad. Si no pones fecha queda como «algún día» (por ejemplo una compra futura).</div>');
    parseQA(); setTimeout(function () { var i = $("#qa-t"); if (i) i.focus(); }, 60);
  }
  function crearEvento(t, f, h) {
    var c = cfg(); if (!c.token) { toast("Vincula la app primero"); return Promise.resolve(false); }
    return post(c.url, { op: "evento_crear", app: "habitos", token: c.token, t: t, f: f, h: h || "", mins: 60 }).then(function (r) {
      if (r && r.ok) { toast("Evento creado en Google Calendar"); S.evR = {}; var rg = rangoVista(); cargarEv(rg[0], rg[1], true); cargarEv(H.hoy(), H.addD(H.hoy(), 1), true); return true; }
      toast(r && r.error === "operacion_desconocida" ? "Actualiza el script de Fergard (v0.6.0)" : "No se pudo crear (" + ((r && r.error) || "error") + ")"); return false;
    }).catch(function () { toast("Sin conexión: no se pudo crear el evento"); return false; });
  }
  function tEditor(id) {
    var t = db.tareas[id]; if (!t) return; S.td = id;
    var listas = {}; listaTar().forEach(function (x) { if (x.l) listas[x.l] = 1; });
    abrir('<h3>Pendiente</h3><label class="lbl" for="te-t">Título</label><input id="te-t" value="' + esc(t.t) + '"><div class="dup"><div><label class="lbl" for="te-f">Fecha</label><input id="te-f" type="date" value="' + esc(t.f) + '"></div><div><label class="lbl" for="te-h">Hora</label><input id="te-h" type="time" value="' + esc(t.h) + '"></div></div>' +
      '<div class="dup"><div><label class="lbl" for="te-l">Lista</label><input id="te-l" list="te-ls" value="' + esc(t.l) + '" placeholder="casa, trabajo…"><datalist id="te-ls">' + Object.keys(listas).map(function (l) { return '<option value="' + esc(l) + '">'; }).join("") + '</datalist></div><div><label class="lbl" for="te-p">Prioridad</label><select id="te-p"><option value="0"' + (!t.p ? " selected" : "") + '>Normal</option><option value="1"' + (t.p === 1 ? " selected" : "") + '>Media</option><option value="2"' + (t.p === 2 ? " selected" : "") + ">Alta</option></select></div></div>" +
      '<label class="lbl">Pasos</label><div id="te-s">' + (t.sub || []).map(subHtml).join("") + '</div><button class="btn sec" data-a="tsubadd" style="height:44px;margin-top:4px">+ Añadir paso</button><label class="lbl" for="te-n">Nota</label><textarea id="te-n" rows="2">' + esc(t.nota || "") + '</textarea>' +
      '<button class="btn" data-a="tsave">Guardar</button><div class="dup"><button class="btn sec" data-a="tmanana">Pasar a mañana</button><button class="btn sec" data-a="tcal">A Google Calendar</button></div><button class="btn bad" data-a="tdel">Borrar</button>');
  }
  function subHtml(s) { return '<div class="sub"><button class="cb' + (s.ok ? " on" : "") + '" data-a="tsubchk" aria-label="Paso hecho">' + ico("chk") + '</button><input type="text" value="' + esc(s.t) + '" aria-label="Paso"><button class="cb" data-a="tsubdel" aria-label="Quitar paso" style="border-color:transparent;font-size:20px">×</button></div>'; }
  function leerSubs() { return $$("#te-s .sub").map(function (r) { return { t: $("input", r).value.trim(), ok: $(".cb", r).classList.contains("on") }; }).filter(function (s) { return s.t; }); }
  function leerTE() {
    var t = db.tareas[S.td]; if (!t) return null; var ti = $("#te-t").value.trim(); if (!ti) { toast("Escribe un título"); return null; }
    t.t = ti; t.f = $("#te-f").value; t.h = t.f ? $("#te-h").value : ""; t.l = $("#te-l").value.trim().replace(/^#/, ""); t.p = +$("#te-p").value; t.nota = $("#te-n").value.trim(); t.sub = leerSubs(); return t;
  }

  function hEditor(id) {
    var h = id ? db.habitos[id] : null;
    S.hd = h ? JSON.parse(JSON.stringify(h)) : { id: null, n: "", e: "⭐", tipo: "check", meta: 1, un: "", frec: { t: "dia" }, hora: "" };
    S.hd.frec = S.hd.frec || { t: "dia" }; S.hd.frec.dias = S.hd.frec.dias || []; S.hd.frec.n = S.hd.frec.n || 3; pintarHE();
  }
  function pintarHE() {
    var d = S.hd, f = d.frec, dn = ["L", "M", "M", "J", "V", "S", "D"];
    abrir('<h3>' + (d.id ? "Editar hábito" : "Nuevo hábito") + "</h3>" + (d.id ? "" : '<div class="plant">' + H.PLANTILLAS.map(function (p, i) { return '<button data-a="hpl" data-i="' + i + '">' + p.e + " " + esc(p.n) + "</button>"; }).join("") + "</div>") +
      '<div class="dup" style="grid-template-columns:70px 1fr"><div style="flex:0 0 76px"><label class="lbl" for="he-e">Icono</label><input id="he-e" value="' + esc(d.e) + '" maxlength="4" style="text-align:center;font-size:22px"></div><div><label class="lbl" for="he-n">Nombre</label><input id="he-n" value="' + esc(d.n) + '" placeholder="Leer, caminar, meditar…"></div></div>' +
      '<label class="lbl">¿Cómo se mide?</label><div class="seg"><button class="' + (d.tipo === "check" ? "on" : "") + '" data-a="htipo" data-v="check">Hecho / no hecho</button><button class="' + (d.tipo === "cant" ? "on" : "") + '" data-a="htipo" data-v="cant">Con cantidad</button></div>' +
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
    abrir('<h3>' + esc(h.e || "") + " " + esc(h.n) + '</h3><div class="big"><div><b>' + H.racha(h, db, f) + "</b><span>Racha</span></div><div><b>" + H.tasa(h, db, H.addD(f, -29), f) + "%</b><span>Últimos 30 días</span></div></div><div class=\"punt\" aria-label=\"Últimos 14 días\">" + u + "</div>" +
      '<div class="dup"><div><label class="lbl" for="hd-f">Registrar el día</label><input id="hd-f" type="date" value="' + f + '" max="' + f + '"></div><div><label class="lbl" for="hd-v">' + (h.tipo === "cant" ? esc(cap(h.un || "cantidad")) : "Hecho (1) o no (0)") + '</label><input id="hd-v" type="number" inputmode="numeric" min="0" value="' + v + '"></div></div><button class="btn" data-a="hreg">Guardar registro</button><button class="btn sec" data-a="hedit" data-id="' + esc(id) + '">Editar hábito</button>');
    $("#hd-f").onchange = function () { $("#hd-v").value = H.valor(db, id, this.value || f); };
  }

  function ajustes() {
    var url = db.sync.url, n = Object.keys(db.pend).length;
    abrir('<h3>Ajustes</h3><label class="lbl">Acceso</label><div id="acc"></div><label class="lbl">Sincronización</label><div style="font-size:14px;color:var(--mut);line-height:1.5">' + esc(!cfg().token ? "Sin vincular" : S.sync || (db.sync.ok ? "Al día" : "Lista para sincronizar")) + " · pendientes: " + n + '</div><div class="dup" style="margin-top:8px"><button class="btn sec" style="margin:0" data-a="sync">Sincronizar</button>' + (url ? '<a class="btn sec" style="margin:0" target="_blank" rel="noopener" href="' + esc(url) + '">Mi hoja</a>' : "") + "</div>" +
      '<label class="lbl">Avisos dentro de la app</label><label class="sw"><input type="checkbox" id="aj-rec"' + (db.ajustes.rec !== false ? " checked" : "") + ' data-a="rec"> Avisarme de pendientes, hábitos con hora y eventos</label><div style="font-size:13px;color:var(--mut);margin-top:6px;line-height:1.45">Los avisos aparecen mientras la app está abierta. El iPhone no permite avisos con la app cerrada sin un servidor de notificaciones.</div>' +
      '<label class="lbl">Google Calendar</label><div style="font-size:14px;color:var(--mut);line-height:1.5">' + (S.evErr ? "Problema: " + esc(S.evErr) : S.ev.length ? "Conectado · " + S.ev.length + " evento(s) cargados" : "Se leen tus calendarios propios y los eventos nuevos se crean en el principal.") + '</div><button class="btn sec" data-a="evrec" style="margin-top:8px">Recargar calendario</button>' +
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
    listaTar().forEach(function (t) { if (!t.ok && t.f === f && t.h) it.push({ k: "t|" + t.id + "|" + t.h, hm: t.h, lead: 0, tit: t.t, sub: "Pendiente de las " + t.h, tipo: "t", id: t.id }); });
    listaHab().forEach(function (h) { if (h.hora && H.programado(h, f) && !H.cumplido(h, H.valor(db, h.id, f))) it.push({ k: "h|" + h.id + "|" + h.hora, hm: h.hora, lead: 0, tit: (h.e || "") + " " + h.n, sub: h.tipo === "cant" ? "Meta de hoy: " + h.meta + " " + (h.un || "") : "Es hora de tu hábito", tipo: "h", id: h.id }); });
    evDia(f).forEach(function (e) { if (!e.td) it.push({ k: "e|" + e.id + "|" + e.i, hm: e.i.slice(11), lead: 10, tit: e.t, sub: "Evento a las " + e.i.slice(11) + (e.l ? " · " + e.l : ""), tipo: "e" }); });
    for (var i = 0; i < it.length; i++) {
      var x = it[i], m = mins(x.hm); if (av.k[x.k]) continue; if (S.snooze[x.k] && Date.now() < S.snooze[x.k]) continue;
      if (ahora >= m - x.lead && ahora <= m + 120) { mostrarAviso(x); return; }
    }
  }
  function mostrarAviso(x) {
    var a = $("#aviso"); S.av = x;
    a.innerHTML = "<b>" + esc(x.tit) + "</b><span>" + esc(x.sub) + '</span><div class="ac">' + (x.tipo !== "e" ? '<button class="p" data-a="av-ok">' + (x.tipo === "t" ? "Hecho" : "Cumplido") + "</button>" : "") + '<button data-a="av-luego">En 15 min</button><button data-a="av-x">Cerrar</button></div>'; a.hidden = false;
  }
  function cerrarAviso(marcar) { var x = S.av; $("#aviso").hidden = true; if (x && marcar) avMarcar(x.k); S.av = null; setTimeout(revisar, 400); }

  /* ---------- acciones ---------- */
  var A = {
    tab: function (el) { S.tab = el.dataset.t; $("#app").scrollTop = 0; if (S.tab === "cal") { var r = rangoVista(); cargarEv(r[0], r[1]); } pintar(); },
    conf: ajustes, mcerrar: cerrar,
    fab: function () { if (S.tab === "hab") hEditor(null); else abrirAdd(S.tab === "cal" ? S.dia : ""); },
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
      h.n = d.n.trim(); h.e = d.e; h.tipo = d.tipo; h.meta = d.meta; h.un = d.un; h.frec = fr; h.hora = d.hora || ""; db.habitos[h.id] = h; touch("habito", h.id, h);
      Object.keys(db.registros).forEach(function (k) { var r = db.registros[k]; if (r.h === h.id && (r.hn !== h.n || r.meta !== h.meta)) { r.hn = h.n; r.meta = h.meta; touch("registro", k, r); } });
      cerrar(); pintar(); toast("Hábito guardado");
    },
    harch: function () { var h = db.habitos[S.hd.id]; h.arch = !h.arch; touch("habito", h.id, h); cerrar(); pintar(); toast(h.arch ? "Hábito archivado" : "Hábito restaurado"); },
    hdel: function () { if (!confirm("¿Eliminar este hábito y su historial?")) return; var id = S.hd.id; Object.keys(db.registros).forEach(function (k) { if (db.registros[k].h === id) quitar("registro", k); }); quitar("habito", id); cerrar(); pintar(); },
    hreg: function () { var h = db.habitos[S.hdet], f = $("#hd-f").value || H.hoy(); if (f > H.hoy()) { toast("No se puede registrar el futuro"); return; } setValor(h, f, +$("#hd-v").value || 0); cerrar(); pintar(); toast("Registro guardado"); },
    tchk: function (el) { var t = db.tareas[el.dataset.id]; if (!t) return; t.ok = !t.ok; touch("tarea", t.id, t); pintar(); },
    tedit: function (el) { tEditor(el.dataset.id); },
    tsave: function () { var t = leerTE(); if (!t) return; touch("tarea", t.id, t); cerrar(); pintar(); toast("Guardado"); },
    tdel: function () { quitar("tarea", S.td); cerrar(); pintar(); },
    tmanana: function () { var t = leerTE(); if (!t) return; t.f = H.addD(H.hoy(), 1); touch("tarea", t.id, t); cerrar(); pintar(); toast("Pasó a mañana"); },
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
    "av-ok": function () { var x = S.av; if (x && x.tipo === "t") { var t = db.tareas[x.id]; if (t) { t.ok = true; touch("tarea", t.id, t); } } else if (x && x.tipo === "h") { var h = db.habitos[x.id]; if (h) setValor(h, H.hoy(), h.tipo === "cant" ? h.meta : 1); } cerrarAviso(true); pintar(); },
    "av-luego": function () { var x = S.av; if (x) S.snooze[x.k] = Date.now() + 15 * 60000; cerrarAviso(false); },
    "av-x": function () { cerrarAviso(true); }
  };
  function mover(d) {
    var p = H.pf(S.dia); if (S.cal === "mes") S.dia = H.fstr(new Date(p.getFullYear(), p.getMonth() + d, 1)); else S.dia = H.addD(S.dia, 7 * d);
    var r = rangoVista(); cargarEv(r[0], r[1]); pintar();
  }
  document.addEventListener("click", function (e) { var el = e.target.closest("[data-a]"); if (!el) return; var f = A[el.dataset.a]; if (!f) return; if (el.type !== "checkbox") e.preventDefault(); e.stopPropagation(); f(el); });
  document.addEventListener("keydown", function (e) {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches('[role="button"][data-a]')) { e.preventDefault(); e.target.click(); }
    if (e.key === "Enter" && e.target.id === "qa-t") { e.preventDefault(); A["qa-tarea"](); }
    if (e.key === "Escape" && !$("#modal").hidden) cerrar();
  });
  document.addEventListener("input", function (e) { if (e.target.id === "qa-t") parseQA(true); });
  document.addEventListener("change", function (e) { if (e.target.id === "qa-f" || e.target.id === "qa-h") parseQA(false); });
  $("#fab").addEventListener("click", function () { A.fab(); });

  /* ---------- arranque ---------- */
  function boot() {
    var vacio = !db.sync.ult && !Object.keys(db.habitos).length && !Object.keys(db.tareas).length; if (vacio && cfg().token) S.cargando = true;
    pintarTabs(); pintar();
    window.HB_DEBUG = { db: function () { return db; }, S: S, A: A, pintar: pintar, revisar: revisar, setEv: function (e) { S.ev = e; pintar(); } };
    sync(false).then(function () { S.cargando = false; pintar(); cargarEv(H.hoy(), H.addD(H.hoy(), 1)); revisar(); });
    setInterval(function () { if (!document.hidden) { var h = H.hoy(); if (S.lastDay && S.lastDay !== h) { S.dia = h; pintar(); } S.lastDay = h; revisar(); } }, 30000); S.lastDay = H.hoy();
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(function () {});
  }
  FergardAcceso.iniciar({
    app: "habitos", nombre: "Hábitos", clientId: CFG.CLIENT_ID, onListo: boot,
    tema: { bg: "#F1EFE9", fg: "#1B2433", mut: "#4F5B75", acento: "#1E2F57", btnBg: "#1E2F57", btnFg: "#FFFFFF", font: "ui-rounded,'SF Pro Rounded',-apple-system,system-ui,sans-serif" },
    marca: '<svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="#1E2F57" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3.5" width="14" height="17" rx="2.5"/><path d="M9 12.5l2.2 2.2L15.5 10"/></svg>'
  });
})();
