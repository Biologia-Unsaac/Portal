(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };

  var S = {
    headers: [],
    data: [],
    mapping: { codigo: -1, apellidos: -1, nombres: -1, curso: -1, docente: -1, seccion: -1, celular: -1, correo: -1 },
    cursoManual: ""
  };

  var CAMPOS = [
    { key: "codigo", label: "Código/DNI" },
    { key: "apellidos", label: "Apellidos" },
    { key: "nombres", label: "Nombres" },
    { key: "curso", label: "Curso" },
    { key: "docente", label: "Docente" },
    { key: "seccion", label: "Sección/Grupo" },
    { key: "celular", label: "Celular" },
    { key: "correo", label: "Correo" }
  ];

  function norm(s) {
    return (s || "").toString()
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function makeDetecters() {
    return {
      codigo: function (n) { return /(^|\b)(dni|codigo|cod\.?|matricula|#)\b|^cod$/.test(n); },
      apellidos: function (n) { return /(^|\b)apellido/.test(n); },
      nombres: function (n) { return /(^|\b)nombre/.test(n); },
      curso: function (n) { return /(^|\b)(curso|asignatura|materia|asign)\b/.test(n); },
      docente: function (n) { return /(^|\b)(docente|profesor|profe|doc)\b/.test(n); },
      seccion: function (n) { return /(^|\b)(seccion|grupo|grp|turno|paralelo|taller)\b/.test(n); },
      celular: function (n) { return /(^|\b)(celular|cel\.?|telefono|movil|contacto|whatsapp)\b/.test(n); },
      correo: function (n) { return /(^|\b)(correo|email|e-mail|mail)\b/.test(n); }
    };
  }

  function splitCSV(text) {
    var lines = [];
    var cur = "";
    var inQ = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (c === '"') {
        cur += c;
        if (inQ && text[i + 1] === '"') { cur += c; i++; }
        else inQ = !inQ;
      } else if (c === "\n" && !inQ) {
        lines.push(cur); cur = "";
      } else if (c === "\r" && !inQ) {
        // skip
      } else {
        cur += c;
      }
    }
    if (cur.length) lines.push(cur);
    return lines;
  }

  function detectDelimiter(text) {
    var head = splitCSV(text)[0] || "";
    var cands = [';', ',', '\t', '|'];
    var best = ';', bestN = 0;
    cands.forEach(function (d) {
      var n = head.split(d).length - 1;
      if (n > bestN) { bestN = n; best = d; }
    });
    return best;
  }

  function csvLine(line, delim) {
    var cells = [], cur = "", inQ = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (inQ) {
        if (c === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; }
          else { inQ = false; }
        } else {
          cur += c;
        }
      } else if (c === '"') {
        inQ = true;
      } else if (c === delim) {
        cells.push(cur.trim()); cur = "";
      } else {
        cur += c;
      }
    }
    cells.push(cur.trim());
    return cells;
  }

  function rowsFromText(text) {
    text = text.replace(/^\uFEFF/, "");
    var delim = detectDelimiter(text);
    var out = [];
    splitCSV(text).forEach(function (line) {
      if (delim === '\t' && line.indexOf('\t') === -1) return;
      out.push(csvLine(line, delim));
    });
    return out;
  }

  function rowsFromWorkbook(data) {
    if (!window.XLSX) return null;
    var wb = XLSX.read(data, { type: "array" });
    var ws = wb.Sheets[wb.SheetNames[0]];
    var rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    return rows.map(function (r) { return r.map(function (c) { return String(c).trim(); }); });
  }

  function cleanRows(rows) {
    return rows.filter(function (r) {
      return r.some(function (c) { return norm(c) !== ""; });
    });
  }

  function detectMapping(headers) {
    var detect = makeDetecters();
    var map = { codigo: -1, apellidos: -1, nombres: -1, curso: -1, docente: -1, seccion: -1, celular: -1, correo: -1 };
    var used = {};
    CAMPOS.forEach(function (f) {
      for (var i = 0; i < headers.length; i++) {
        if (used[i]) continue;
        var n = norm(headers[i]);
        if (detect[f.key](n)) { map[f.key] = i; used[i] = true; break; }
      }
    });
    var fullName = -1;
    headers.forEach(function (h, i) {
      var n = norm(h);
      if (/(^|\b)(nombres?\s+y\s+apellidos?|apellidos?\s+y\s+nombres?|nombres?\s+y\s+apellidos?)\b/.test(n)) fullName = i;
    });
    if (map.nombres === -1 && map.apellidos === -1 && fullName >= 0) map.nombres = fullName;
    return map;
  }

  function cell(r, key) {
    var i = S.mapping[key];
    if (i === null || i === undefined || i < 0) return "";
    return S.data[r][i] || "";
  }

  function nombreCompleto(r) {
    var a = cell(r, "apellidos"), n = cell(r, "nombres");
    if (a && n) return a + ", " + n;
    return (a || n) || ("Estudiante " + (r + 1));
  }

  function distinctCol(idx) {
    var set = {};
    S.data.forEach(function (row) {
      var v = (idx >= 0 && row[idx]) ? String(row[idx]).trim() : "";
      if (v) set[v] = true;
    });
    return Object.keys(set);
  }

  function setEstado(id, txt) {
    $(id).textContent = txt;
  }

  function download(filename, content, mime) {
    var blob = new Blob([content], { type: mime || "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 400);
  }

  function csvEscape(v) {
    v = String(v == null ? "" : v);
    if (/[";\n]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"';
    return v;
  }

  function renderCols() {
    var wrap = $("herrCols");
    wrap.innerHTML = "";
    CAMPOS.forEach(function (f) {
      var lab = document.createElement("label");
      lab.className = "herr-label";
      lab.textContent = f.label;
      var sel = document.createElement("select");
      sel.className = "herr-input";
      sel.dataset.key = f.key;
      var opt = document.createElement("option");
      opt.value = "-1"; opt.textContent = "— No viene —";
      sel.appendChild(opt);
      S.headers.forEach(function (h, i) {
        var o = document.createElement("option");
        o.value = String(i); o.textContent = h;
        if (S.mapping[f.key] === i) o.selected = true;
        sel.appendChild(o);
      });
      var col = document.createElement("div");
      col.appendChild(lab);
      col.appendChild(sel);
      wrap.appendChild(col);
    });
    $("herrAplCols").disabled = false;
  }

  function aplicarCols() {
    var selects = $("herrCols").querySelectorAll("select");
    selects.forEach(function (sel) {
      S.mapping[sel.dataset.key] = parseInt(sel.value, 10);
    });
    actualizarTodo();
  }

  function popClave(selectId) {
    var sel = $(selectId);
    var actual = sel.value;
    sel.innerHTML = "";
    var o = document.createElement("option");
    o.value = "__todos"; o.textContent = "Todos";
    sel.appendChild(o);
    var cursoIdx = S.mapping.curso;
    if (cursoIdx >= 0) {
      distinctCol(cursoIdx).forEach(function (c) {
        var op = document.createElement("option");
        op.value = c; op.textContent = c;
        sel.appendChild(op);
      });
    }
    if (actual && actual !== "__todos") sel.value = actual;
  }

  function filtrarRows(selectId) {
    var sel = $(selectId);
    if (!sel) return S.data.map(function (_, i) { return i; });
    var v = sel.value;
    if (v === "__todos" || S.mapping.curso < 0) return S.data.map(function (_, i) { return i; });
    return S.data.reduce(function (acc, row, i) {
      if (String(row[S.mapping.curso] || "").trim() === v) acc.push(i);
      return acc;
    }, []);
  }

  function renderPreview() {
    var t = $("herrTabla");
    var html = "<thead><tr>";
    S.headers.forEach(function (h) { html += "<th>" + (h || "?") + "</th>"; });
    html += "</tr></thead><tbody>";
    var shown = Math.min(S.data.length, 20);
    for (var r = 0; r < shown; r++) {
      html += "<tr>";
      S.headers.forEach(function (_, c) { html += "<td>" + (S.data[r][c] || "") + "</td>"; });
      html += "</tr>";
    }
    html += "</tbody>";
    t.innerHTML = html;

    var cursoLink = "";
    var cIdx = S.mapping.curso;
    if (cIdx >= 0) {
      var set = distinctCol(cIdx);
      cursoLink = set.length === 1 ? " · curso: <b>" + set[0] + "</b>" : " · cursos: <b>" + set.length + "</b>";
    } else if (S.cursoManual) {
      cursoLink = " · curso: <b>" + S.cursoManual + "</b>";
    }
    $("herrResumen").innerHTML = S.data.length + " estudiantes" + cursoLink;
    $("herrPrevCard").classList.remove("herr-hidden");
    popClave("herrFiltro");
    popClave("herrWaFiltro");
  }

  function actualizarTodo() {
    renderPreview();
  }

  function cargarRows(rows, fromCursoManual) {
    rows = cleanRows(rows || []);
    if (!rows.length) { setEstado("herrEstado", "La planilla está vacía o no se entendió."); return; }
    S.headers = rows[0];
    S.data = rows.slice(1);
    S.mapping = detectMapping(S.headers);
    if (fromCursoManual) S.cursoManual = $("herrCursoManual").value.trim();
    $("herrDetectarCard").classList.remove("herr-hidden");
    renderCols();
    renderPreview();
    setEstado("herrEstado", "Planilla cargada: " + S.headers.length + " columnas, " + S.data.length + " estudiantes.");
    $("herrGuardarCurso").disabled = false;
  }

  $("herrFile").addEventListener("change", function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var name = file.name.toLowerCase();
    var isXls = /\.xlsx?$/.test(name);
    if (isXls) {
      var fr = new FileReader();
      fr.onload = function () {
        var rows = rowsFromWorkbook(fr.result);
        if (!rows) { setEstado("herrEstado", "No se pudo leer el Excel."); return; }
        cargarRows(rows, true);
      };
      fr.readAsArrayBuffer(file);
    } else {
      var fr2 = new FileReader();
      fr2.onload = function () {
        cargarRows(rowsFromText(fr2.result), true);
      };
      fr2.readAsText(file);
    }
    e.target.value = "";
  });

  $("herrCargar").addEventListener("click", function () {
    var txt = $("herrPaste").value;
    if (!txt.trim()) { setEstado("herrEstado", "Pega texto o sube un archivo primero."); return; }
    cargarRows(rowsFromText(txt));
  });

  $("herrAplCols").addEventListener("click", aplicarCols);

  $("herrEjemplo").addEventListener("click", function () {
    var nombres = [
      ["Quispe Mamani", "Ana Rosa"], ["Ccahuana Huamán", "Jorge Luis"],
      ["Condori Puma", "Lucia"], ["Huanca Flores", "Diego"],
      ["Ñaupa Quispe", "Maribel"], ["Aguilar Ccorimanya", "Renato"],
      ["Uscamayta Yupanqui", "Paola"], ["Pacheco Villena", "Kevin"],
      ["Huaracha Valer", "Camila"], ["Orosco Baca", "Miguel"],
      ["Loaiza Chipana", "Nadia"], ["Cusihuallpa Ancco", "Bryan"],
      ["Sumire Ninancuro", "Iris"], ["Yancachajlla Huallpa", "Edson"],
      ["Ttito Ccahua", "Fiorella"], ["Ataucuri Canahuire", "Rodrigo"],
      ["Huaman Aramburú", "Daniela"], ["Zuniga Cruz", "Luis"],
      ["Pillco Huanaco", "Gaby"], ["Ticona Bautista", "Alessandra"],
      ["Sallo Cusi", "Brian"], ["Aparicio Valencia", "Karla"]
    ];
    var lines = ["Apellidos;Nombres;Codigo;Seccion;Curso;Celular"];
    nombres.forEach(function (p, i) {
      var sec = i < 11 ? "A" : "B";
      lines.push(p[0] + ";" + p[1] + ";20" + ("0" + (i + 1)).slice(-2) + "-0" + (i + 1) + ";" + sec + ";BI-120;9" + String(10000000 + i * 137473).slice(0, 8));
    });
    $("herrPaste").value = lines.join("\n");
    cargarRows(rowsFromText($("herrPaste").value));
  });

  // ===== TABS =====
  $("herrTabs").addEventListener("click", function (e) {
    var btn = e.target.closest(".herr-tab");
    if (!btn) return;
    document.querySelectorAll(".herr-tab").forEach(function (b) { b.classList.toggle("active", b === btn); });
    document.querySelectorAll(".herr-pane").forEach(function (p) {
      p.classList.toggle("active", p.id === "tab-" + btn.dataset.tab);
    });
  });

  // ===== GRUPOS =====
  var gruposActuales = [];

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  function generarGrupos() {
    var idxs = filtrarRows("herrFiltro");
    if (!idxs.length) { setEstado("herrGEstado", "No hay estudiantes para ese filtro."); return; }
    if ($("herrOrder").checked) shuffle(idxs);
    var n = Math.max(2, Math.min(40, parseInt($("herrNgrupos").value, 10) || 5));
    if (n > idxs.length) n = idxs.length;
    var grupos = [];
    for (var g = 0; g < n; g++) grupos.push([]);
    var base = Math.floor(idxs.length / n);
    var extra = idxs.length % n;
    var p = 0;
    for (var g2 = 0; g2 < n; g2++) {
      var size = base + (g2 < extra ? 1 : 0);
      for (var k = 0; k < size; k++) {
        grupos[g2].push(idxs[p]);
        p++;
      }
    }
    gruposActuales = { grupos: grupos, n: n };
    renderGrupos(grupos, n);
  }

  function renderGrupos(grupos, n) {
    var wrap = $("herrGrupos");
    wrap.innerHTML = "";
    var total = grupos.reduce(function (a, g) { return a + g.length; }, 0);
    grupos.forEach(function (g, i) {
      var card = document.createElement("div");
      card.className = "herr-grupo";
      var h = document.createElement("h4");
      h.innerHTML = "Grupo " + (i + 1) + " · " + g.length + " de " + total + " <span></span>";
      var ul = document.createElement("ul");
      g.forEach(function (r) {
        var li = document.createElement("li");
        var cab = cell(r, "seccion") ? " · " + cell(r, "seccion") : "";
        li.textContent = nombreCompleto(r) + cab;
        ul.appendChild(li);
      });
      card.appendChild(h); card.appendChild(ul);
      wrap.appendChild(card);
    });
    setEstado("herrGEstado", n + " grupos generados.");
  }

  function aoaExport() {
    var aoa = [["Grupo", "N", "Codigo", "Apellidos", "Nombres", "Nombre completo", "Seccion", "Celular"]];
    var hasApe = S.mapping.apellidos >= 0, hasNom = S.mapping.nombres >= 0;
    if (!hasApe && !hasNom) aoa[0][5] = "Nombre";
    var grupos = gruposActuales.grupos || [];
    grupos.forEach(function (g, gi) {
      g.forEach(function (r, k) {
        aoa.push([
          gi + 1, k + 1,
          cell(r, "codigo"), cell(r, "apellidos"), cell(r, "nombres"),
          nombreCompleto(r), cell(r, "seccion"), cell(r, "celular")
        ]);
      });
    });
    return aoa;
  }

  $("herrGenGrupos").addEventListener("click", function () {
    if (!S.data.length) { setEstado("herrGEstado", "Carga primero una planilla."); return; }
    generarGrupos();
  });

  $("herrExpCsv").addEventListener("click", function () {
    if (!gruposActuales.grupos) { setEstado("herrGEstado", "Genera grupos primero."); return; }
    var rows = aoaExport().map(function (r) { return r.map(csvEscape).join(";"); });
    download("grupos.csv", "\uFEFF" + rows.join("\n"), "text/csv;charset=utf-8");
  });

  $("herrExpXlsx").addEventListener("click", function () {
    if (!gruposActuales.grupos) { setEstado("herrGEstado", "Genera grupos primero."); return; }
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoaExport()), "Grupos");
    XLSX.writeFile(wb, "grupos.xlsx");
  });

  // ===== WHATSAPP =====
  function numerosWa() {
    if (S.mapping.celular < 0) return [];
    var pref = ($("herrPrefijo").value || "").trim().replace(/\s+/g, "");
    var solo9 = $("herrSolo9").checked;
    var sel = $("herrWaFiltro");
    var v = sel.value;
    var out = [];
    S.data.forEach(function (row, r) {
      if (v !== "__todos" && S.mapping.curso >= 0 && String(row[S.mapping.curso] || "").trim() !== v) return;
      var num = String(row[S.mapping.celular] || "").replace(/[^\d]/g, "");
      if (!num) return;
      if (solo9 && !(num.length === 9 && num[0] === "9")) return;
      var wy = num.length === 9 ? (pref + num) : num;
      out.push({ num: num, wa: wy, nombre: nombreCompleto(r) });
    });
    return out;
  }

  $("herrGenVcf").addEventListener("click", function () {
    var nums = numerosWa();
    if (!nums.length) { setEstado("herrWaEstado", "No hay celulares para exportar."); return; }
    var vcf = nums.map(function (x) {
      return "BEGIN:VCARD\nVERSION:3.0\nFN:" + csvEscape(x.nombre).replace(/["]/g, "") + "\nTEL;TYPE=CELL:" + x.wa + "\nEND:VCARD";
    }).join("\n");
    download("contactos-cursos.vcf", vcf, "text/vcard;charset=utf-8");
    renderWaList(nums);
    setEstado("herrWaEstado", nums.length + " contactos generados.");
  });

  $("herrCopiarNum").addEventListener("click", function () {
    var nums = numerosWa();
    if (!nums.length) { setEstado("herrWaEstado", "No hay celulares para copiar."); return; }
    var txt = nums.map(function (x) { return x.wa + " " + x.nombre; }).join("\n");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(function () {
        setEstado("herrWaEstado", "Números copiados (" + nums.length + ").");
      });
    } else {
      setEstado("herrWaEstado", "No se pudo copiar: selecciona del listado.");
      renderWaList(nums, true);
    }
  });

  function renderWaList(nums, plain) {
    var w = $("herrWaList");
    if (!nums.length) { w.innerHTML = ""; return; }
    w.innerHTML = nums.map(function (x, i) {
      if (plain) return (i + 1) + ". " + x.wa + " " + x.nombre;
      return (i + 1) + '. <a href="https://wa.me/' + x.wa + '" target="_blank" rel="noreferrer">' + x.wa + "</a> — " + x.nombre;
    }).join("<br>");
  }

  // ===== DATOS DEL CURSO =====
  function rootCurso() {
    var cIdx = S.mapping.curso;
    if (cIdx >= 0) {
      var set = distinctCol(cIdx);
      if (set.length === 1) return set[0];
      if (set.length > 1) return set.length + " cursos";
    }
    return S.cursoManual || "Curso sin especificar";
  }

  function resumenActual() {
    var res = {};
    if (S.mapping.curso >= 0) {
      S.data.forEach(function (row) {
        var c = String(row[S.mapping.curso] || "").trim() || "—";
        if (!res[c]) res[c] = { n: 0, secc: {} };
        res[c].n++;
        var s = S.mapping.seccion >= 0 ? String(row[S.mapping.seccion] || "").trim() : "";
        if (s) res[c].secc[s] = (res[c].secc[s] || 0) + 1;
      });
    } else {
      var n = S.data.length;
      var secc = {};
      if (S.mapping.seccion >= 0) {
        S.data.forEach(function (row) {
          var s = String(row[S.mapping.seccion] || "").trim();
          if (s) secc[s] = (secc[s] || 0) + 1;
        });
      }
      res[S.cursoManual || "—"] = { n: n, secc: secc };
    }
    return res;
  }

  $("herrGuardarCurso").addEventListener("click", function () {
    if (!S.data.length) { setEstado("herrCEstado", "Carga una planilla primero."); return; }
    var guardados = JSON.parse(localStorage.getItem("herrCursos") || "[]");
    var suma = resumenActual();
    var ahora = new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" });
    var nuevo = { fecha: ahora, base: rootCurso(), cursos: suma };
    var base = nuevo.base;
    if (base && base !== "Curso sin especificar" && base.indexOf(" cursos") === -1) {
      var i = guardados.findIndex(function (g) { return g.base === base; });
      if (i >= 0) guardados[i] = nuevo;
      else guardados.push(nuevo);
    } else {
      guardados.push(nuevo);
    }
    localStorage.setItem("herrCursos", JSON.stringify(guardados));
    renderCursoTabla();
    setEstado("herrCEstado", "Resumen guardado.");
  });

  function renderCursoTabla() {
    var t = $("herrCursoTabla");
    var guardados = JSON.parse(localStorage.getItem("herrCursos") || "[]");
    if (!guardados.length) {
      t.innerHTML = "<tbody><tr><td style=\"color:var(--muted)\">Sin cursos guardados todavía.</td></tr></tbody>";
      return;
    }
    var html = "<thead><tr><th>Curso</th><th>Alumnos</th><th>Secciones</th><th>Guardado</th><th></th></tr></thead><tbody>";
    guardados.forEach(function (g, gi) {
      var n = 0, seccTxt = [];
      Object.keys(g.cursos).forEach(function (c) {
        n += g.cursos[c].n;
        var s = Object.keys(g.cursos[c].secc);
        if (s.length) s.forEach(function (x) { seccTxt.push(x + " (" + g.cursos[c].secc[x] + ")"); });
      });
      html += "<tr><td>" + g.base + "</td><td>" + n + "</td><td>" + (seccTxt.join(", ") || "—") + "</td><td>" + g.fecha + "</td>" +
        '<td><button type="button" class="herr-btn-sec" data-del="' + gi + '">Borrar</button></td></tr>';
    });
    html += "</tbody>";
    t.innerHTML = html;
    t.querySelectorAll("[data-del]").forEach(function (b) {
      b.addEventListener("click", function () {
        guardados.splice(parseInt(b.dataset.del, 10), 1);
        localStorage.setItem("herrCursos", JSON.stringify(guardados));
        renderCursoTabla();
      });
    });
  }

  $("herrLimpiarCurso").addEventListener("click", function () {
    localStorage.removeItem("herrCursos");
    renderCursoTabla();
    setEstado("herrCEstado", "Todos los resúmenes borrados.");
  });

  renderCursoTabla();

  // ===== CATÁLOGO DE HORARIOS / MI HORARIO =====
  var DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  var PALETTA = ["#1e8a5a", "#2c6fb0", "#8a5fc0", "#c05a4a", "#b38616", "#b04e7a", "#2d8f8f", "#6b8f2f"];

  var CATFIELDS = [
    { key: "codigo", label: "Código" },
    { key: "curso", label: "Curso" },
    { key: "seccion", label: "Sección" },
    { key: "docente", label: "Docente" },
    { key: "dia", label: "Día" },
    { key: "desde", label: "Hora inicio" },
    { key: "hasta", label: "Hora fin" },
    { key: "aula", label: "Aula" }
  ];

  var catalogo = [];
  var selIds = {};
  var catCols = { codigo: -1, curso: -1, seccion: -1, docente: -1, dia: -1, desde: -1, hasta: -1, aula: -1 };
  var catPendRows = [];

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function catSave() {
    localStorage.setItem("herrCatalogo", JSON.stringify(catalogo));
    localStorage.setItem("herrHorarioSel", JSON.stringify(Object.keys(selIds)));
  }

  function catLoad() {
    try {
      catalogo = JSON.parse(localStorage.getItem("herrCatalogo") || "[]");
      var ids = JSON.parse(localStorage.getItem("herrHorarioSel") || "[]");
      catalogo.forEach(function (s) {
        if (ids.indexOf(s.id) !== -1) selIds[s.id] = true;
      });
    } catch (e) { catalogo = []; selIds = {}; }
  }

  function catId() {
    return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function colorCurso(curso) {
    var h = 0, s = norm(curso || "");
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return PALETTA[h % PALETTA.length];
  }

  function fmtHora(m) {
    if (m === null || m === undefined) return "—";
    var h = Math.floor(m / 60), mi = m % 60;
    return (h < 10 ? "0" : "") + h + ":" + (mi < 10 ? "0" : "") + mi;
  }

  function horaMin(v) {
    if (v === null || v === undefined) return null;
    v = String(v).trim();
    if (!v) return null;
    var m = v.match(/(\d{1,2})[:.]?\s*(\d{2})?\s*(am|pm)?/i);
    if (!m) return null;
    var h = parseInt(m[1], 10), mi = m[2] ? parseInt(m[2], 10) : 0;
    var ap = (m[3] || "").toLowerCase();
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    if (h > 23) h = 23;
    if (mi > 59) mi = 59;
    return h * 60 + mi;
  }

  function parseDia(v) {
    var n = norm(v);
    if (/^lun/.test(n)) return 0;
    if (/^mar/.test(n)) return 1;
    if (/^mie/.test(n)) return 2;
    if (/^jue/.test(n)) return 3;
    if (/^vie/.test(n)) return 4;
    if (/^sab/.test(n)) return 5;
    if (/^dom/.test(n)) return 6;
    return -1;
  }

  function scanRango(cell) {
    var c = String(cell || "").trim();
    var m = c.match(/(\d{1,2}(?::\d{2})?)\s*(?:-|–|—|a|hasta)\s*(\d{1,2}(?::\d{2})?)/i);
    if (!m) return null;
    var a = horaMin(m[1]), b = horaMin(m[2]);
    if (a === null || b === null) return null;
    if (b <= a) b = Math.min(1440, a + 60);
    return { desde: a, hasta: b };
  }

  function heurRow(cells) {
    var codigo = "", curso = "", seccion = "", docente = "", aula = "";
    var dia = -1, desde = null, hasta = null;
    cells.forEach(function (c) {
      c = String(c || "").trim();
      if (!c) return;
      if (!codigo && /^bi-\d/i.test(c)) codigo = c;
      if (!seccion && /^[A-Za-z]$/.test(c)) seccion = c;
      if (dia < 0) dia = parseDia(c);
      if (!curso && c.length >= 3 && c.length <= 45 &&
        !/^bi-\d/i.test(c) &&
        parseDia(c) < 0 &&
        !scanRango(c) &&
        !/^[\d:.\s]+$/.test(c) &&
        !/^l-\d|\baula\b|\baud\b|\blab/i.test(c) &&
        !/(\bm\.?\s?sc\.?|\bmg\b|\bing\.?|\blic\.?|\bdr[oa]?\.?|\bprof\.?|docente)/i.test(c) &&
        !/(seccion|docente|d[ií]a|hora (inicio|fin)|inicio|hasta|aula|vacantes|c[oó]digo|curso)/i.test(c)) curso = c;
      if ((desde === null || hasta === null) && !/^bi/i.test(c)) {
        var r = scanRango(c);
        if (r) {
          if (desde === null) desde = r.desde;
          if (hasta === null) hasta = r.hasta;
        }
      }
      if (!docente && /(\bm\.?\s?sc\.?|\bmg\b|\bing\.?|\blic\.?|\bdr[oa]?\.?|\bprof\.?|docente)/i.test(c)) docente = c;
      if (!aula && (/^l-\d|\baula\b|\baud\b|\blab/i.test(c)) && !/^bi-/i.test(c)) aula = c;
    });
    return { curso: curso || codigo, codigo: codigo, seccion: seccion || "A", dia: dia, desde: desde, hasta: hasta, docente: docente, aula: aula };
  }

  function detectCatMap(headers) {
    var map = { codigo: -1, curso: -1, seccion: -1, docente: -1, dia: -1, desde: -1, hasta: -1, aula: -1 };
    var used = {};
    CATFIELDS.forEach(function (f) {
      for (var i = 0; i < headers.length; i++) {
        if (used[i]) continue;
        var n = norm(headers[i]);
        var ok = f.key === "codigo" ? (/(^|\b)(codigo|cod\.?|matricula|#)\b|^cod$/.test(n) || /^bi-\d/.test(n))
          : f.key === "curso" ? /(^|\b)(curso|asignatura|materia)\b/.test(n)
          : f.key === "seccion" ? /(^|\b)(seccion|grupo|grp|paralelo|turno)\b/.test(n)
          : f.key === "docente" ? /(^|\b)(docente|profesor|profe)\b/.test(n)
          : f.key === "dia" ? (/(^|\b)dia\b/.test(n) || parseDia(n) >= 0)
          : f.key === "desde" ? /(^|\b)(inicio|inicia|inicio de|desde|empieza|comienzo)\b/.test(n)
          : f.key === "hasta" ? /(^|\b)(fin|final|termina|hasta|fin de)\b/.test(n)
          : /(^|\b)(aula|salon|ambiente|laboratorio|lab)\b/.test(n);
        if (ok) { map[f.key] = i; used[i] = true; break; }
      }
    });
    return map;
  }

  function renderCatMapCard(headers, rows) {
    catPendRows = rows;
    var wrap = $("herrCatCols");
    wrap.innerHTML = "";
    CATFIELDS.forEach(function (f) {
      var lab = document.createElement("label");
      lab.className = "herr-label";
      lab.textContent = f.label;
      var sel = document.createElement("select");
      sel.className = "herr-input";
      sel.dataset.key = f.key;
      var opt = document.createElement("option");
      opt.value = "-1"; opt.textContent = "— No viene —";
      sel.appendChild(opt);
      headers.forEach(function (h, i) {
        var o = document.createElement("option");
        o.value = String(i); o.textContent = (h || "?");
        if (catCols[f.key] === i) o.selected = true;
        sel.appendChild(o);
      });
      var col = document.createElement("div");
      col.appendChild(lab); col.appendChild(sel);
      wrap.appendChild(col);
    });
    $("herrCatMapCard").classList.remove("herr-hidden");
  }

  function aplicarCatCols() {
    $("herrCatCols").querySelectorAll("select").forEach(function (sel) {
      catCols[sel.dataset.key] = parseInt(sel.value, 10);
    });
    if (catPendRows.length) procesarCatRows(catPendRows);
  }

  function catKey(s) {
    return (s.curso || "") + "|" + s.seccion + "|" + s.dia + "|" + s.desde + "|" + s.hasta;
  }

  function procesarCatRows(rows) {
    rows = cleanRows(rows || []);
    var headerMode = !(catCols.curso === -1 && catCols.desde === -1);
    var conocidos = {};
    catalogo.forEach(function (s) { conocidos[catKey(s)] = true; });
    var agregadas = 0, ignoradas = 0;
    rows.forEach(function (cells) {
      var sec;
      if (!headerMode) {
        sec = heurRow(cells);
      } else {
        var get = function (k) {
          var i = catCols[k];
          return (i >= 0 && i < cells.length) ? String(cells[i] || "").trim() : "";
        };
        sec = {
          curso: get("curso"), codigo: get("codigo"), seccion: get("seccion") || "A",
          dia: parseDia(get("dia")), desde: horaMin(get("desde")), hasta: horaMin(get("hasta")),
          docente: get("docente"), aula: get("aula")
        };
        var hr = heurRow(cells);
        if (sec.dia < 0) sec.dia = hr.dia;
        if (sec.desde === null) sec.desde = hr.desde;
        if (sec.hasta === null) sec.hasta = hr.hasta;
        if (!sec.docente) sec.docente = hr.docente;
        if (!sec.aula) sec.aula = hr.aula;
        if (!sec.curso && !sec.codigo) { sec.curso = hr.curso; sec.codigo = hr.codigo; }
      }
      if (!sec.curso && !sec.codigo) { ignoradas++; return; }
      if (sec.dia < 0 || sec.desde === null || sec.hasta === null) { ignoradas++; return; }
      if (sec.hasta <= sec.desde) sec.hasta = Math.min(1440, sec.desde + 60);
      if (!sec.curso) sec.curso = sec.codigo;
      sec.id = catId();
      if (conocidos[catKey(sec)]) { ignoradas++; return; }
      conocidos[catKey(sec)] = true;
      catalogo.push(sec);
      agregadas++;
    });
    catSave();
    renderCat();
    renderHorario();
    setEstado("herrCatEstado", "Secciones agregadas: " + agregadas + (ignoradas ? " · sin día u hora válida o repetidas: " + ignoradas : "") + ".");
  }

  function filtraCat() {
    var q = norm($("herrCatBusq").value);
    if (!q) return catalogo;
    return catalogo.filter(function (s) {
      return norm(s.curso + " " + s.codigo + " " + s.docente + " " + s.seccion + " " + s.aula).indexOf(q) !== -1;
    });
  }

  function renderCat() {
    var t = $("herrCatTabla");
    var lista = filtraCat();
    $("herrCatResumen").textContent = catalogo.length + " secciones · " + Object.keys(selIds).length + " en tu horario";
    if (!catalogo.length) {
      t.innerHTML = "<tbody><tr><td style=\"color:var(--muted)\">El catálogo está vacío: pega las tablas del catálogo de horarios o agrega una sección a mano.</td></tr></tbody>";
      return;
    }
    if (!lista.length) {
      t.innerHTML = "<tbody><tr><td style=\"color:var(--muted)\">Nada coincide con la búsqueda.</td></tr></tbody>";
      return;
    }
    var html = "<thead><tr><th class=\"herr-cat-n\"></th><th>Curso</th><th>Código</th><th>Sec.</th><th>Día</th><th>Horario</th><th>Docente</th><th>Aula</th><th></th></tr></thead><tbody>";
    lista.forEach(function (s) {
      var sel = !!selIds[s.id];
      html += "<tr class=\"" + (sel ? "herr-envi" : "") + "\">" +
        "<td class=\"herr-cat-n\"><input type=\"checkbox\" class=\"herr-cat-chk\" data-id=\"" + s.id + "\"" + (sel ? " checked" : "") + "></td>" +
        "<td>" + esc(s.curso) + "</td>" +
        "<td>" + esc(s.codigo || "—") + "</td>" +
        "<td>" + esc(s.seccion) + "</td>" +
        "<td><span class=\"herr-cat-dia\">" + (s.dia <= 5 ? DIAS[s.dia] : (s.dia === 6 ? "Dom" : "?")) + "</span></td>" +
        "<td class=\"herr-cat-hora\">" + fmtHora(s.desde) + " – " + fmtHora(s.hasta) + "</td>" +
        "<td>" + esc(s.docente || "—") + "</td>" +
        "<td>" + esc(s.aula || "—") + "</td>" +
        "<td><button type=\"button\" class=\"herr-quitar\" title=\"Quitar del catálogo\" data-del=\"" + s.id + "\">✕</button></td>" +
        "</tr>";
    });
    html += "</tbody>";
    t.innerHTML = html;
    t.querySelectorAll(".herr-cat-chk").forEach(function (chk) {
      chk.addEventListener("change", function () {
        var id = chk.dataset.id;
        if (chk.checked) selIds[id] = true; else delete selIds[id];
        catSave(); renderCat(); renderHorario();
      });
    });
    t.querySelectorAll("[data-del]").forEach(function (b) {
      b.addEventListener("click", function () {
        var id = b.dataset.del;
        catalogo = catalogo.filter(function (x) { return x.id !== id; });
        delete selIds[id];
        catSave(); renderCat(); renderHorario();
      });
    });
  }

  function renderHorario() {
    var sel = catalogo.filter(function (s) { return !!selIds[s.id]; });
    var vis = sel.filter(function (s) { return s.dia >= 0 && s.dia <= 5; });
    var w = $("herrHorario");
    var lista = $("herrHorLista");
    var h0 = 7 * 60, h9 = 21 * 60;
    vis.forEach(function (s) {
      if (s.desde != null) h0 = Math.min(h0, Math.floor(s.desde / 60) * 60);
      if (s.hasta != null) h9 = Math.max(h9, Math.ceil(s.hasta / 60) * 60);
    });
    if (h9 - h0 <= 0) h9 = h0 + 14 * 60;
    var horas = (h9 - h0) / 60;

    var clash = {};
    for (var d = 0; d <= 5; d++) {
      var gg = vis.filter(function (s) { return s.dia === d; }).sort(function (a, b) { return a.desde - b.desde; });
      for (var i = 0; i < gg.length; i++) {
        for (var j = i + 1; j < gg.length; j++) {
          if (gg[j].desde < gg[i].hasta) { clash[gg[i].id] = true; clash[gg[j].id] = true; }
          else break;
        }
      }
    }

    var html = '<div class="herr-hcorner" style="grid-row:1;grid-column:1">Hora</div>';
    DIAS.forEach(function (nm, d) {
      html += '<div class="herr-dhead' + (d === 5 ? " sabado" : "") + '" style="grid-row:1;grid-column:' + (d + 2) + '">' + nm + "</div>";
    });
    html += '<div class="herr-hours" style="grid-row:2;grid-column:1">';
    for (var h = 0; h < horas; h++) html += '<div class="herr-hour">' + fmtHora(h0 + h * 60) + "</div>";
    html += "</div>";
    for (var d2 = 0; d2 < 6; d2++) {
      var hh = vis.filter(function (s) { return s.dia === d2; });
      var hpx = horas * 44;
      html += '<div class="herr-td" style="grid-row:2;grid-column:' + (d2 + 2) + ';height:' + hpx + 'px">';
      html += '<div class="herr-lines"></div>';
      hh.forEach(function (s) {
        var top = (s.desde - h0) / 60 * 44;
        var height = Math.max((s.hasta - s.desde) / 60 * 44, 22);
        var estilo = "background:" + colorCurso(s.curso) + ";top:" + top + "px;height:" + height + "px";
        var txt = "<b>" + esc(s.curso) + " " + esc(s.seccion) + "</b>" + esc(s.docente || "") + (s.aula ? " · " + esc(s.aula) : "");
        html += '<div class="herr-block' + (clash[s.id] ? " herr-choque" : "") + '" title="Quitar de tu horario" data-id="' + s.id + '" style="' + estilo + '">' + txt + "</div>";
      });
      html += "</div>";
    }
    w.innerHTML = html;
    w.querySelectorAll(".herr-block").forEach(function (b) {
      b.addEventListener("click", function () {
        delete selIds[b.dataset.id];
        catSave(); renderCat(); renderHorario();
      });
    });

    var nClash = Object.keys(clash).length;
    $("herrHorResumen").textContent = vis.length + " bloques en tu semana";
    $("herrHorEstado").textContent = vis.length
      ? (nClash ? "Atención: " + nClash + " secciones con choque horario" : "Sin choques · todo cuadra")
      : "Sin secciones elegidas aún. Marca en la pestaña Catálogo.";
    if (!vis.length) {
      lista.innerHTML = "";
      return;
    }
    var porCurso = {};
    vis.forEach(function (s) {
      if (!porCurso[s.curso]) porCurso[s.curso] = [];
      porCurso[s.curso].push(s);
    });
    lista.innerHTML = Object.keys(porCurso).map(function (c) {
      var items = porCurso[c].map(function (s) {
        var est = clash[s.id] ? " class=\"herr-choque\"" : "";
        return "<li" + est + ">" + DIAS[s.dia] + " " + fmtHora(s.desde) + "–" + fmtHora(s.hasta) +
          (s.docente ? " · " + esc(s.docente) : "") +
          '<button type="button" class="herr-quitar" data-id="' + s.id + '">✕</button></li>';
      }).join("");
      return '<div class="herr-grupo"><h4><span class="herr-dot" style="background:' + colorCurso(c) + '"></span>' + esc(c) + " <span>" + porCurso[c].length + " bloques</span></h4><ul>" + items + "</ul></div>";
    }).join("");
    lista.querySelectorAll(".herr-quitar").forEach(function (b) {
      b.addEventListener("click", function () {
        delete selIds[b.dataset.id];
        catSave(); renderCat(); renderHorario();
      });
    });
  }

  $("herrProcCat").addEventListener("click", function () {
    var txt = $("herrCatPaste").value;
    if (!txt.trim()) { setEstado("herrCatEstado", "Pega las tablas del catálogo primero."); return; }
    var rows = rowsFromText(txt);
    if (!rows.length) { setEstado("herrCatEstado", "No se entendió lo pegado."); return; }
    catCols = detectCatMap(rows[0]);
    var headerMode = !(catCols.curso === -1 && catCols.desde === -1);
    if (headerMode) {
      renderCatMapCard(rows[0], rows.slice(1));
      procesarCatRows(rows.slice(1));
    } else {
      $("herrCatMapCard").classList.add("herr-hidden");
      procesarCatRows(rows);
    }
  });

  $("herrCatApl").addEventListener("click", aplicarCatCols);

  $("herrCatEjemplo").addEventListener("click", function () {
    var ej = [
      ["BI-120", "Botánica General", "A", "Miércoles", "07:00", "08:50", "Dra. C. Huamán", "L-101"],
      ["BI-120", "Botánica General", "B", "Miércoles", "09:00", "10:50", "Dra. C. Huamán", "L-102"],
      ["BI-121", "Zoología I", "A", "Lunes", "08:00", "09:50", "M.Sc. R. Quispe", "L-201"],
      ["BI-121", "Zoología I", "A", "Viernes", "15:00", "16:50", "M.Sc. R. Quispe", "L-201"],
      ["BI-130", "Genética", "A", "Martes", "10:00", "11:50", "Dr. J. Loaiza", "L-301"],
      ["BI-131", "Evolución", "B", "Jueves", "17:00", "19:20", "Dr. G. Cusi", "L-303"],
      ["BI-140", "Ecología General", "A", "Lunes", "13:00", "14:50", "Dra. L. Sumire", "Aud 03"],
      ["BI-140", "Ecología General", "A", "Martes", "13:00", "14:50", "Dra. L. Sumire", "Aud 03"],
      ["BI-150", "Biología Molecular", "A", "Sábado", "09:00", "12:00", "Dr. D. Huanca", "Lab Mol"]
    ];
    var tmp = catCols;
    catCols = { codigo: 0, curso: 1, seccion: 2, dia: 3, desde: 4, hasta: 5, docente: 6, aula: 7 };
    procesarCatRows(ej.map(function (r) { return r.map(String); }));
    catCols = tmp;
    setEstado("herrCatEstado", "Catálogo de ejemplo listo. Marca tus secciones y pasa a Mi horario.");
  });

  $("herrMAgr").addEventListener("click", function () {
    var curso = $("herrMCurso").value.trim();
    if (!curso) { setEstado("herrMEstado", "Pon el curso (código o nombre)."); return; }
    var desde = horaMin($("herrMDesde").value);
    var hasta = horaMin($("herrMHasta").value);
    if (desde === null || hasta === null || hasta <= desde) {
      setEstado("herrMEstado", "Horario no válido: la hora fin debe ser después del inicio.");
      return;
    }
    var sec = {
      id: catId(),
      curso: curso, codigo: "", seccion: $("herrMSecc").value.trim() || "A",
      dia: parseInt($("herrMDia").value, 10),
      desde: desde, hasta: hasta,
      docente: $("herrMDoc").value.trim(), aula: $("herrMAula").value.trim()
    };
    catalogo.push(sec);
    selIds[sec.id] = true;
    catSave(); renderCat(); renderHorario();
    $("herrMCurso").value = "";
    $("herrMSecc").value = "";
    setEstado("herrMEstado", "Sección agregada y marcada en tu horario.");
  });

  var catBusqTmr = null;
  $("herrCatBusq").addEventListener("input", function () {
    if (catBusqTmr) clearTimeout(catBusqTmr);
    catBusqTmr = setTimeout(renderCat, 120);
  });

  $("herrHorLimpiar").addEventListener("click", function () {
    selIds = {};
    catSave(); renderCat(); renderHorario();
  });

  $("herrHorCSV").addEventListener("click", function () {
    var sel = catalogo.filter(function (s) { return !!selIds[s.id]; }).sort(function (a, b) { return (a.dia - b.dia) || (a.desde - b.desde); });
    if (!sel.length) { setEstado("herrHorEstado", "Marca secciones primero."); return; }
    var lines = [["Curso", "Seccion", "Dia", "Desde", "Hasta", "Docente", "Aula"]];
    sel.forEach(function (s) {
      lines.push([s.curso, s.seccion, s.dia <= 5 ? DIAS[s.dia] : "Dom", fmtHora(s.desde), fmtHora(s.hasta), s.docente, s.aula]);
    });
    download("mi-horario.csv", "\uFEFF" + lines.map(function (r) { return r.map(csvEscape).join(";"); }).join("\n"), "text/csv;charset=utf-8");
  });

  catLoad();
  renderCat();
  renderHorario();
})();