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
})();