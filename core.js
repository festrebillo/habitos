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
    { n: "Escribir en el diario", e: "✍️", tipo: "check", meta: 1, un: "", frec: { t: "dia" } }, { n: "Sin redes sociales", e: "📵", tipo: "check", meta: 1, un: "", frec: { t: "dia" } },
    { n: "Ir al gym", e: "💪", tipo: "gym", meta: 1, un: "", frec: { t: "sem", n: 4 } }
  ];
  /* Ideas de hábitos que practican muchos emprendedores, deportistas y líderes (c = categoría, d = para qué sirve) */
  var IDEAS = [
    { c: "Mañana", n: "Levantarme temprano", e: "🌅", tipo: "check", meta: 1, un: "", frec: { t: "dia" }, d: "Ganar horas tranquilas antes de que empiece el ruido del día" },
    { c: "Mañana", n: "Beber agua al despertar", e: "🥛", tipo: "check", meta: 1, un: "", frec: { t: "dia" }, d: "Hidratarte antes del café" },
    { c: "Mañana", n: "Sin celular la primera hora", e: "📵", tipo: "check", meta: 1, un: "", frec: { t: "dia" }, d: "Empezar con tu agenda, no con la de otros" },
    { c: "Mañana", n: "Ejercicio de mañana", e: "🏃", tipo: "cant", meta: 20, un: "min", frec: { t: "dia" }, d: "Energía y ánimo para todo el día" },
    { c: "Mañana", n: "Ducha fría", e: "🚿", tipo: "check", meta: 1, un: "", frec: { t: "dia" }, d: "Disciplina y activación" },
    { c: "Mañana", n: "Tender la cama", e: "🛏️", tipo: "check", meta: 1, un: "", frec: { t: "dia" }, d: "Primera victoria del día" },
    { c: "Mente", n: "Leer 30 minutos", e: "📚", tipo: "cant", meta: 30, un: "min", frec: { t: "dia" }, d: "Aprender un poco cada día" },
    { c: "Mente", n: "Escribir 3 gratitudes", e: "🙏", tipo: "cant", meta: 3, un: "cosas", frec: { t: "dia" }, d: "Entrena la atención en lo bueno" },
    { c: "Mente", n: "Aprender algo nuevo", e: "🧠", tipo: "cant", meta: 20, un: "min", frec: { t: "dia" }, d: "Un idioma, un curso, una habilidad" },
    { c: "Mente", n: "Visualizar mis metas", e: "🎯", tipo: "cant", meta: 5, un: "min", frec: { t: "dia" }, d: "Tener claro hacia dónde vas" },
    { c: "Trabajo", n: "Elegir mis 3 prioridades del día", e: "✅", tipo: "check", meta: 1, un: "", frec: { t: "dias", dias: [1, 2, 3, 4, 5] }, d: "Lo importante antes que lo urgente" },
    { c: "Trabajo", n: "Trabajo profundo", e: "🧑‍💻", tipo: "cant", meta: 90, un: "min", frec: { t: "dias", dias: [1, 2, 3, 4, 5] }, d: "Un bloque sin interrupciones en lo más importante" },
    { c: "Trabajo", n: "Revisar mis finanzas", e: "💰", tipo: "check", meta: 1, un: "", frec: { t: "sem", n: 3 }, d: "5 minutos para saber en qué estás" },
    { c: "Trabajo", n: "Escribir a alguien de mi red", e: "🤝", tipo: "check", meta: 1, un: "", frec: { t: "sem", n: 3 }, d: "Cuidar relaciones y oportunidades" },
    { c: "Trabajo", n: "Revisión semanal", e: "🗓️", tipo: "check", meta: 1, un: "", frec: { t: "dias", dias: [7] }, d: "Cerrar la semana y planear la siguiente" },
    { c: "Cuerpo", n: "Caminar 10 000 pasos", e: "🚶", tipo: "cant", meta: 10000, un: "pasos", frec: { t: "dia" }, d: "Movimiento diario sin gimnasio" },
    { c: "Cuerpo", n: "Estirar", e: "🤸", tipo: "cant", meta: 10, un: "min", frec: { t: "dia" }, d: "Menos tensión y más movilidad" },
    { c: "Cuerpo", n: "Frutas y verduras", e: "🥗", tipo: "cant", meta: 5, un: "porciones", frec: { t: "dia" }, d: "Comer mejor sin dietas" },
    { c: "Cuerpo", n: "Sin azúcar ni alcohol", e: "🚫", tipo: "check", meta: 1, un: "", frec: { t: "dia" }, d: "Menos antojos, mejor sueño" },
    { c: "Noche", n: "Preparar el día de mañana", e: "📝", tipo: "check", meta: 1, un: "", frec: { t: "dia" }, d: "Dormir tranquilo y arrancar sin dudas" },
    { c: "Noche", n: "Apagar pantallas antes de dormir", e: "🌙", tipo: "check", meta: 1, un: "", frec: { t: "dia" }, d: "Una hora sin pantallas para dormir mejor" },
    { c: "Noche", n: "Dormir 7 a 8 horas", e: "😴", tipo: "check", meta: 1, un: "", frec: { t: "dia" }, d: "La base de todo lo demás" }
  ];
  function mejorRacha(h, db, hasta) {   // la racha más larga de toda la historia del hábito
    var ini = h.ini || hasta, best = 0, cur = 0, t = h.frec && h.frec.t || "dia", d, g = 0;
    if (t === "sem") { var n = h.frec.n || 3, lh = lunes(hasta); for (d = lunes(ini); d <= lh && g < 400; d = addD(d, 7), g++) { if (hechosSemana(h, db, d) >= n) { cur++; if (cur > best) best = cur; } else if (d !== lh) cur = 0; } return best; }
    for (d = ini; d <= hasta && g < 1500; d = addD(d, 1), g++) { if (!programado(h, d)) continue; if (cumplido(h, valor(db, h.id, d))) { cur++; if (cur > best) best = cur; } else if (d !== hasta) cur = 0; }
    return best;
  }
  function mejorDia(h, db, hasta) {   // día de la semana (1 lunes … 7 domingo) en el que más lo cumples; 0 si aún no hay datos
    var c = [0, 0, 0, 0, 0, 0, 0, 0], d, g = 0, ini = h.ini || hasta, best = 0, bd = 0;
    for (d = ini; d <= hasta && g < 1500; d = addD(d, 1), g++) if (cumplido(h, valor(db, h.id, d))) c[dow(d)]++;
    for (var i = 1; i <= 7; i++) if (c[i] > best) { best = c[i]; bd = i; }
    return bd;
  }
  function siguiente(f, rep) {   // próxima fecha de una tarea que se repite
    if (rep === "dia") return addD(f, 1); if (rep === "sem") return addD(f, 7);
    if (rep === "lab") { var n = addD(f, 1); while (dow(n) > 5) n = addD(n, 1); return n; }
    if (rep === "mes") { var d = pf(f), m = new Date(d.getFullYear(), d.getMonth() + 1, 1), ult = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate(); m.setDate(Math.min(d.getDate(), ult)); return fstr(m); }
    return "";
  }
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
    var t = " " + String(entrada || "").trim() + " ", r = { titulo: "", fecha: "", hora: "", lista: "", prioridad: 0, rep: "", partes: [] }, x;
    hoyS = hoyS || hoy();
    // lista: #casa  o  «lista: casa»
    x = sacar(t, /\s#([\wáéíóúñÁÉÍÓÚÑ-]+)/); if (x.m) { r.lista = x.m[1]; t = x.txt; r.partes.push("Lista: " + x.m[1]); }
    else { x = sacar(t, /\slista:\s*([\wáéíóúñÁÉÍÓÚÑ-]+)/i); if (x.m) { r.lista = x.m[1]; t = x.txt; r.partes.push("Lista: " + x.m[1]); } }
    // prioridad
    x = sacar(t, /\s(!{1,3})(?=\s)/); if (x.m) { r.prioridad = Math.min(2, x.m[1].length); t = x.txt; r.partes.push("Prioridad"); }
    else { x = sacar(t, /\s(urgente|importante)(?=\s)/i); if (x.m) { r.prioridad = /urgente/i.test(x.m[1]) ? 2 : 1; t = x.txt; r.partes.push("Prioridad"); } }
    // repetición: «cada día», «lunes a viernes», «cada semana», «cada mes», «cada lunes»
    x = sacar(t, /\s(?:cada\s+d[ií]a|todos\s+los\s+d[ií]as|diario)(?=\s|$|[.,])/i); if (x.m) { r.rep = "dia"; t = x.txt; r.partes.push("Cada día"); }
    if (!r.rep) { x = sacar(t, /\s(?:de\s+)?lunes\s+a\s+viernes(?=\s|$|[.,])/i); if (x.m) { r.rep = "lab"; t = x.txt; r.partes.push("Lun–vie"); } }
    if (!r.rep) { x = sacar(t, /\s(?:cada\s+semana|todas\s+las\s+semanas|semanal)(?=\s|$|[.,])/i); if (x.m) { r.rep = "sem"; t = x.txt; r.partes.push("Cada semana"); } }
    if (!r.rep) { x = sacar(t, /\s(?:cada\s+mes|todos\s+los\s+meses|mensual)(?=\s|$|[.,])/i); if (x.m) { r.rep = "mes"; t = x.txt; r.partes.push("Cada mes"); } }
    if (!r.rep) { x = sacar(t, /\scada\s+(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)(?=\s|$|[.,])/i); if (x.m) { r.rep = "sem"; t = x.txt + x.m[1] + " "; r.partes.push("Cada " + x.m[1].toLowerCase()); } }
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
    else if (r.hora || r.rep) { r.fecha = hoyS; r.partes.unshift("Hoy"); }
    t = t.replace(/\s+(el|para|a|de|en|a las?)\s*$/i, " ").replace(/^\s*(recuérdame|recordarme|recordar)\s+/i, "").replace(/\s+/g, " ").trim();
    r.titulo = t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
    return r;
  }

  var api = { DIAS: DIAS, MESES: MESES, fstr: fstr, pf: pf, hoy: hoy, addD: addD, dow: dow, lunes: lunes, norm: norm, uid: uid, valor: valor, cumplido: cumplido, programado: programado, hechosSemana: hechosSemana,
    racha: racha, tasa: tasa, ultimos: ultimos, resumenDia: resumenDia, PLANTILLAS: PLANTILLAS, IDEAS: IDEAS, mejorRacha: mejorRacha, mejorDia: mejorDia, textoFrec: textoFrec, parsear: parsear, siguiente: siguiente };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.HCore = api;
})(typeof window !== "undefined" ? window : this);
