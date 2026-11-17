/* Hábitos · núcleo: fechas, hábitos con meta, rachas, progreso y el «añadir escribiendo».
   Todo son funciones puras sobre fechas locales «AAAA-MM-DD» (lunes = 1 … domingo = 7). */
(function (root) {
  "use strict";
  var DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
  var MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
  function p2(n) { return ("0" + n).slice(-2); }
  function fstr(d) { return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()); }
  function pf(s) { var a = s.split("-"); return new Date(+a[0], +a[1] - 1, +a[2]); }
  function hoy() { return fstr(new Date()); }
  function addD(s, n) { var d = pf(s); d.setDate(d.getDate() + n); return fstr(d); }
  function dow(s) { var x = pf(s).getDay(); return x === 0 ? 7 : x; }
  function lunes(s) { return addD(s, -(dow(s) - 1)); }
  function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  /* ---------- hábitos ---------- */
  function valor(db, hid, f) { var r = db.registros[hid + "|" + f.slice(0, 7)]; return (r && r.v && r.v[f.slice(8)]) || 0; }
  function cumplido(h, v) { return h.tipo === "cant" ? v >= (h.meta || 1) : v >= 1; }
  function programado(h, f) {
    if (h.arch || (h.ini && f < h.ini)) return false;
    var t = h.frec && h.frec.t || "dia";
    if (t === "dias") return (h.frec.dias || []).indexOf(dow(f)) >= 0;
    return true;   // «cada día» y «N veces por semana» se pueden hacer cualquier día
  }
  function hechosSemana(h, db, f) { var l = lunes(f), n = 0; for (var i = 0; i < 7; i++) if (cumplido(h, valor(db, h.id, addD(l, i)))) n++; return n; }
  function racha(h, db, hasta) {
    var t = h.frec && h.frec.t || "dia", n = 0, i;
    if (t === "sem") {   // semanas seguidas cumpliendo «N veces por semana»
      var meta = h.frec.n || 3, l = lunes(hasta);
      if (hechosSemana(h, db, l) >= meta) n++;
      for (i = 1; i < 520; i++) { var w = addD(l, -7 * i); if (h.ini && addD(w, 6) < h.ini) break; if (hechosSemana(h, db, w) >= meta) n++; else break; }
      return n;
    }
    for (i = 0; i < 1500; i++) {   // días programados seguidos; hoy no rompe la racha mientras siga pendiente
      var f = addD(hasta, -i); if (h.ini && f < h.ini) break;
      if (!programado(h, f)) continue;
      if (cumplido(h, valor(db, h.id, f))) n++; else if (i === 0) continue; else break;
    }
    return n;
  }
  function tasa(h, db, desde, hasta) {   // % de días programados cumplidos
    var tot = 0, ok = 0; for (var f = desde; f <= hasta; f = addD(f, 1)) { if (!programado(h, f)) continue; tot++; if (cumplido(h, valor(db, h.id, f))) ok++; } return tot ? Math.round(ok / tot * 100) : 0;
  }
  function ultimos(h, db, hasta, n) {   // últimos n días: 1 hecho, 0 pendiente/fallado, -1 no programado
    var o = []; for (var i = n - 1; i >= 0; i--) { var f = addD(hasta, -i); o.push(!programado(h, f) ? -1 : cumplido(h, valor(db, h.id, f)) ? 1 : 0); } return o;
  }
  function resumenDia(db, f) {   // cuántos hábitos de ese día están cumplidos
    var tot = 0, ok = 0; Object.keys(db.habitos).forEach(function (k) { var h = db.habitos[k]; if (!programado(h, f)) return; tot++; if (cumplido(h, valor(db, h.id, f))) ok++; }); return { tot: tot, ok: ok };
  }
  var PLANTILLAS = [
    { n: "Leer", e: "📖", tipo: "cant", meta: 10, un: "páginas", frec: { t: "dia" } }, { n: "Beber agua", e: "💧", tipo: "cant", meta: 8, un: "vasos", frec: { t: "dia" } },
    { n: "Meditar", e: "🧘", tipo: "cant", meta: 10, un: "min", frec: { t: "dia" } }, { n: "Escuchar música", e: "🎧", tipo: "cant", meta: 30, un: "min", frec: { t: "dia" } },
    { n: "Estudiar", e: "🎓", tipo: "cant", meta: 30, un: "min", frec: { t: "dias", dias: [1, 2, 3, 4, 5] } }, { n: "Caminar", e: "🚶", tipo: "cant", meta: 6000, un: "pasos", frec: { t: "dia" } },
    { n: "Entrenar", e: "🏋️", tipo: "check", meta: 1, un: "", frec: { t: "sem", n: 4 } }, { n: "Dormir temprano", e: "😴", tipo: "check", meta: 1, un: "", frec: { t: "dia" } },
    { n: "Escribir en el diario", e: "✍️", tipo: "check", meta: 1, un: "", frec: { t: "dia" } }, { n: "Sin redes sociales", e: "📵", tipo: "check", meta: 1, un: "", frec: { t: "dia" } }
  ];
  function textoFrec(h) { var f = h.frec || { t: "dia" }; if (f.t === "dias") return (f.dias || []).map(function (d) { return DIAS[d - 1].slice(0, 3); }).join(" · "); if (f.t === "sem") return f.n + " veces por semana"; return "Cada día"; }

  /* ---------- «añadir escribiendo»: «llamar al dentista mañana 10am #salud !» ---------- */
  function sacar(txt, re) { var m = re.exec(txt); if (!m) return { txt: txt, m: null }; return { txt: (txt.slice(0, m.index) + " " + txt.slice(m.index + m[0].length)), m: m }; }
  function fechaDe(t, hoyS) {
    var x, y;
    x = sacar(t, /\s(pasado\s+ma[ñn]ana)(?=\s|$|[.,])/i); if (x.m) return { f: addD(hoyS, 2), txt: x.txt };
    x = sacar(t, /\s(ma[ñn]ana)(?=\s|$|[.,])/i); if (x.m) return { f: addD(hoyS, 1), txt: x.txt };
    x = sacar(t, /\s(hoy)(?=\s|$|[.,])/i); if (x.m) return { f: hoyS, txt: x.txt };
    x = sacar(t, /\sen\s+(\d{1,3})\s+d[ií]as?(?=\s|$|[.,])/i); if (x.m) return { f: addD(hoyS, +x.m[1]), txt: x.txt };
    x = sacar(t, /\s(?:el\s+)?(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|se[pt]iembre|octubre|noviembre|diciembre)(?:\s+de\s+(\d{4}))?(?=\s|$|[.,])/i);
    if (x.m) {
      var mi = MESES.indexOf(x.m[2].toLowerCase().replace("septiembre", "setiembre")); y = x.m[3] ? +x.m[3] : pf(hoyS).getFullYear();
      var f1 = y + "-" + p2(mi + 1) + "-" + p2(+x.m[1]); if (!x.m[3] && f1 < hoyS) f1 = (y + 1) + "-" + p2(mi + 1) + "-" + p2(+x.m[1]);
      return { f: f1, txt: x.txt };
    }
    x = sacar(t, /\s(\d{1,2})[\/-](\d{1,2})(?=\s|$|[.,])/);
    if (x.m && +x.m[2] >= 1 && +x.m[2] <= 12 && +x.m[1] >= 1 && +x.m[1] <= 31) {
      y = pf(hoyS).getFullYear(); var f2 = y + "-" + p2(+x.m[2]) + "-" + p2(+x.m[1]); if (f2 < hoyS) f2 = (y + 1) + "-" + p2(+x.m[2]) + "-" + p2(+x.m[1]); return { f: f2, txt: x.txt };
    }
    var dn = norm(t).match(/\s(?:el\s+|este\s+|proximo\s+)?(lunes|martes|miercoles|jueves|viernes|sabado|domingo)(?:\s+(\d{1,2}))?(?=\s|$|[.,])/);
    if (dn) {
      var idx = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"].indexOf(dn[1]) + 1, delta = (idx - dow(hoyS) + 7) % 7; if (delta === 0) delta = 7;
      var f3 = addD(hoyS, delta); if (dn[2]) { var cand = pf(hoyS); cand.setDate(+dn[2]); f3 = fstr(cand); }
      var re = new RegExp("\\s(?:el\\s+|este\\s+|pr[oó]ximo\\s+)?" + dn[1].replace("miercoles", "mi[eé]rcoles").replace("sabado", "s[aá]bado") + (dn[2] ? "\\s+" + dn[2] : "") + "(?=\\s|$|[.,])", "i");
      return { f: f3, txt: t.replace(re, " ") };
    }
    x = sacar(t, /\s(?:el\s+)(\d{1,2})(?=\s|$|[.,])/);
    if (x.m && +x.m[1] >= 1 && +x.m[1] <= 31) { var c2 = pf(hoyS); c2.setDate(+x.m[1]); var f4 = fstr(c2); if (f4 < hoyS) { c2 = pf(hoyS); c2.setMonth(c2.getMonth() + 1, +x.m[1]); f4 = fstr(c2); } return { f: f4, txt: x.txt }; }
    return null;
  }
  function parsear(entrada, hoyS) {
    var t = " " + String(entrada || "").trim() + " ", r = { titulo: "", fecha: "", hora: "", lista: "", prioridad: 0, partes: [] }, x;
    hoyS = hoyS || hoy();
    // lista: #casa  o  «lista: casa»
    x = sacar(t, /\s#([\wáéíóúñÁÉÍÓÚÑ-]+)/); if (x.m) { r.lista = x.m[1]; t = x.txt; r.partes.push("Lista: " + x.m[1]); }
    else { x = sacar(t, /\slista:\s*([\wáéíóúñÁÉÍÓÚÑ-]+)/i); if (x.m) { r.lista = x.m[1]; t = x.txt; r.partes.push("Lista: " + x.m[1]); } }
    // prioridad
    x = sacar(t, /\s(!{1,3})(?=\s)/); if (x.m) { r.prioridad = Math.min(2, x.m[1].length); t = x.txt; r.partes.push("Prioridad"); }
    else { x = sacar(t, /\s(urgente|importante)(?=\s)/i); if (x.m) { r.prioridad = /urgente/i.test(x.m[1]) ? 2 : 1; t = x.txt; r.partes.push("Prioridad"); } }
    // hora
    var h = null;
    x = sacar(t, /\s(?:a\s+las?\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)(?=\s|$|[.,])/i);
    if (x.m) { h = { h: +x.m[1], m: +(x.m[2] || 0), ap: x.m[3].toLowerCase()[0] }; t = x.txt; }
    else { x = sacar(t, /\s(?:a\s+las?\s+)?(\d{1,2}):(\d{2})(?=\s|$|[.,])/); if (x.m) { h = { h: +x.m[1], m: +x.m[2] }; t = x.txt; }
      else { x = sacar(t, /\s(?:a\s+las?\s+)?(\d{1,2})\s*(?:h|hs|hrs)(?=\s|$|[.,])/i); if (x.m) { h = { h: +x.m[1], m: 0 }; t = x.txt; }
        else { x = sacar(t, /\sa\s+las?\s+(\d{1,2})(?=\s|$|[.,])/i); if (x.m) { h = { h: +x.m[1], m: 0 }; t = x.txt; }
          else { x = sacar(t, /\s(mediod[ií]a|medianoche)(?=\s|$|[.,])/i); if (x.m) { h = { h: /noche/i.test(x.m[1]) ? 0 : 12, m: 0 }; t = x.txt; } } } } }
    if (h) { if (h.ap === "p" && h.h < 12) h.h += 12; if (h.ap === "a" && h.h === 12) h.h = 0; if (h.h <= 23 && h.m <= 59) { r.hora = p2(h.h) + ":" + p2(h.m); r.partes.push(r.hora); } }
    // fecha: se prueba cada forma en orden y se queda con la primera que aparezca
    var f = "", fd = fechaDe(t, hoyS); if (fd) { f = fd.f; t = fd.txt; }
    if (f) { r.fecha = f; r.partes.unshift(f === hoyS ? "Hoy" : f === addD(hoyS, 1) ? "Mañana" : DIAS[dow(f) - 1].slice(0, 3) + " " + pf(f).getDate() + " " + MESES[pf(f).getMonth()].slice(0, 3)); }
    else if (r.hora) { r.fecha = hoyS; r.partes.unshift("Hoy"); }
    t = t.replace(/\s+(el|para|a|de|en|a las?)\s*$/i, " ").replace(/^\s*(recuérdame|recordarme|recordar)\s+/i, "").replace(/\s+/g, " ").trim();
    r.titulo = t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
    return r;
  }

  var api = { DIAS: DIAS, MESES: MESES, fstr: fstr, pf: pf, hoy: hoy, addD: addD, dow: dow, lunes: lunes, norm: norm, uid: uid, valor: valor, cumplido: cumplido, programado: programado, hechosSemana: hechosSemana,
    racha: racha, tasa: tasa, ultimos: ultimos, resumenDia: resumenDia, PLANTILLAS: PLANTILLAS, textoFrec: textoFrec, parsear: parsear };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.HCore = api;
})(typeof window !== "undefined" ? window : this);
