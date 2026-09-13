(function(){
"use strict";
var DATA = window.MALLA_DATA;
var AREA_COLORS = {
  genetica: "#6B4FA0",
  vegetal: "#3F7D3B",
  zoologia: "#B8611F",
  microbiologia: "#1E7A76",
  pesquera: "#2761A3",
  ecologia: "#7A8B2E"
};
var AREA_ORDER = ["genetica", "vegetal", "zoologia", "microbiologia", "pesquera", "ecologia"];

var ALL = {};
Object.keys(DATA.trunk).forEach(function(sem){
  DATA.trunk[sem].forEach(function(c){
    ALL[c.code] = Object.assign({}, c, { kind: "trunk", sem: sem });
  });
});
AREA_ORDER.forEach(function(areaKey){
  DATA.areas[areaKey].courses.forEach(function(c){
    ALL[c.code] = Object.assign({}, c, { kind: areaKey });
  });
});

var UNLOCKS = {};
Object.keys(ALL).forEach(function(code){ UNLOCKS[code] = []; });
Object.keys(ALL).forEach(function(code){
  var pr = ALL[code].prereq;
  if (pr && ALL[pr]) { UNLOCKS[pr].push(code); }
});

var timelineInner = document.getElementById("timelineInner");
for (var s = 1; s <= 10; s++) {
  var col = document.createElement("div");
  col.className = "sem-col";
  var h = document.createElement("h3");
  h.textContent = "Semestre " + s;
  col.appendChild(h);

  var courses = DATA.trunk[String(s)] || [];
  courses.forEach(function(c){
    col.appendChild(buildNode(c, "trunk"));
  });

  var slots = DATA.electiveSlots[String(s)];
  if (slots) {
    var ph = document.createElement("div");
    ph.className = "node";
    ph.style.opacity = ".55";
    ph.style.borderStyle = "dashed";
    ph.innerHTML = '<span class="code">EEEP</span><span class="name">' + slots + ' electivo(s) de especialidad</span>';
    col.appendChild(ph);
  }

  timelineInner.appendChild(col);
}

var svgTrunk = document.createElementNS("http://www.w3.org/2000/svg", "svg");
svgTrunk.setAttribute("class", "linelayer");
timelineInner.appendChild(svgTrunk);

function buildNode(c, kind){
  var div = document.createElement("div");
  div.className = "node" + (kind !== "trunk" ? " area" : "");
  div.dataset.code = c.code;
  div.innerHTML =
    '<span class="code">' + c.code + '</span>' +
    '<span class="name">' + c.name + '</span>' +
    '<span class="cr">' + c.credits + ' créd.' + (c.prereq && ALL[c.prereq] ? ' · req: ' + ALL[c.prereq].name : '') + '</span>';
  div.addEventListener("mouseenter", function(){ focusCourse(c.code); });
  div.addEventListener("mouseleave", function(){ clearFocus(); });
  div.addEventListener("click", function(e){ e.stopPropagation(); openDetail(c.code); });
  return div;
}

var areaButtons = document.getElementById("areaButtons");
var areaPanel = document.getElementById("areaPanel");
var currentArea = null;

AREA_ORDER.forEach(function(key){
  var info = DATA.areas[key];
  var btn = document.createElement("button");
  btn.className = "area-btn";
  btn.textContent = info.short;
  btn.style.setProperty("--accent-color", AREA_COLORS[key]);
  btn.addEventListener("click", function(){
    if (currentArea === key) {
      currentArea = null;
      renderAreaPanel();
      updateButtonStates();
      return;
    }
    currentArea = key;
    renderAreaPanel();
    updateButtonStates();
  });
  btn.dataset.key = key;
  areaButtons.appendChild(btn);
});

function updateButtonStates(){
  Array.prototype.forEach.call(areaButtons.children, function(btn){
    btn.classList.toggle("active", btn.dataset.key === currentArea);
  });
}

function levelOf(code, areaKey, memo){
  if (memo[code] !== undefined) return memo[code];
  var c = ALL[code];
  if (!c || !c.prereq) { memo[code] = 0; return 0; }
  var pr = ALL[c.prereq];
  if (!pr || pr.kind !== areaKey) { memo[code] = 0; return 0; }
  var lvl = 1 + levelOf(c.prereq, areaKey, memo);
  memo[code] = lvl;
  return lvl;
}

function renderAreaPanel(){
  areaPanel.innerHTML = "";
  if (!currentArea) {
    var empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Elige una especialidad arriba para ver su árbol de cursos electivos y sus conexiones.";
    areaPanel.appendChild(empty);
    return;
  }

  var info = DATA.areas[currentArea];
  var color = AREA_COLORS[currentArea];
  areaPanel.style.borderColor = color;

  var head = document.createElement("div");
  head.className = "area-panel-head";
  head.innerHTML = '<h4 style="color:' + color + '">' + info.label + '</h4><span>' + info.courses.length + ' cursos electivos</span>';
  areaPanel.appendChild(head);

  var scroll = document.createElement("div");
  scroll.className = "tree-scroll";
  var inner = document.createElement("div");
  inner.className = "tree-inner";

  var memo = {};
  var byLevel = {};
  info.courses.forEach(function(c){
    var lvl = levelOf(c.code, currentArea, memo);
    byLevel[lvl] = byLevel[lvl] || [];
    byLevel[lvl].push(c);
  });

  var maxLvl = Math.max.apply(null, Object.keys(byLevel).map(Number));
  for (var l = 0; l <= maxLvl; l++) {
    var lvlDiv = document.createElement("div");
    lvlDiv.className = "tree-level";

    var lab = document.createElement("div");
    lab.className = "lvl-label";
    lab.textContent = l === 0 ? "Curso base" : "Nivel " + (l + 1);
    lvlDiv.appendChild(lab);

    var itemsWrap = document.createElement("div");
    itemsWrap.className = "lvl-items";
    (byLevel[l] || []).forEach(function(c){
      var node = buildNode(c, currentArea);
      node.style.borderColor = color;
      var pr = ALL[c.prereq];
      if (pr && pr.kind === "trunk") {
        var note = document.createElement("div");
        note.className = "req-note";
        note.innerHTML = 'Requiere <a data-jump="' + pr.code + '">' + pr.name + '</a> (sem. ' + pr.sem + ')';
        note.querySelector("a").addEventListener("click", function(ev){
          ev.stopPropagation();
          jumpToTrunk(ev.target.dataset.jump);
        });
        node.appendChild(note);
      }
      itemsWrap.appendChild(node);
    });

    lvlDiv.appendChild(itemsWrap);
    inner.appendChild(lvlDiv);
  }

  var svgArea = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svgArea.setAttribute("class", "linelayer");
  inner.appendChild(svgArea);
  scroll.appendChild(inner);
  areaPanel.appendChild(scroll);

  requestAnimationFrame(function(){ drawEdges(inner, svgArea, currentArea, true); });
  scroll.addEventListener("scroll", function(){ drawEdges(inner, svgArea, currentArea, true); });
}

function jumpToTrunk(code){
  var el = document.querySelector('.timeline-inner .node[data-code="' + code + '"]');
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  el.classList.add("pulse");
  setTimeout(function(){ el.classList.remove("pulse"); }, 2300);
}

function drawEdges(container, svg, scopeAreaKey, isArea){
  var rect = container.getBoundingClientRect();
  svg.setAttribute("width", container.scrollWidth);
  svg.setAttribute("height", container.scrollHeight);
  svg.innerHTML = '<defs><marker id="arrow-' + (scopeAreaKey || 'trunk') + '" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="currentColor"/></marker></defs>';

  var nodes = container.querySelectorAll(".node[data-code]");
  var pos = {};
  nodes.forEach(function(n){
    var r = n.getBoundingClientRect();
    pos[n.dataset.code] = {
      left: r.left - rect.left,
      right: r.right - rect.left,
      top: r.top - rect.top,
      bottom: r.bottom - rect.top,
      midY: r.top - rect.top + r.height / 2,
      el: n
    };
  });

  Object.keys(pos).forEach(function(code){
    var c = ALL[code];
    if (!c.prereq) return;
    var pr = pos[c.prereq];
    if (!pr) return;
    var a = pr, b = pos[code];
    var x1 = a.right, y1 = a.midY, x2 = b.left, y2 = b.midY;
    var mx = (x1 + x2) / 2;
    var d = "M" + x1 + "," + y1 + " C" + mx + "," + y1 + " " + mx + "," + y2 + " " + x2 + "," + y2;
    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    path.setAttribute("class", "edge");
    path.dataset.from = c.prereq;
    path.dataset.to = code;
    path.style.color = isArea ? AREA_COLORS[scopeAreaKey] : "#B9B29B";
    if (isArea) path.setAttribute("stroke", AREA_COLORS[scopeAreaKey]);
    path.setAttribute("marker-end", "url(#arrow-" + (scopeAreaKey || 'trunk') + ")");
    svg.appendChild(path);
  });
}

var timelineWrap = document.getElementById("timelineWrap");
function redrawTrunk(){ drawEdges(timelineInner, svgTrunk, null, false); }
requestAnimationFrame(redrawTrunk);
window.addEventListener("resize", function(){
  redrawTrunk();
  if (currentArea) {
    var scrollEl = areaPanel.querySelector(".tree-scroll");
    if (scrollEl) drawEdges(scrollEl.firstChild, scrollEl.querySelector("svg"), currentArea, true);
  }
});
timelineWrap.addEventListener("scroll", redrawTrunk);

function focusCourse(code){
  var allNodes = document.querySelectorAll(".node[data-code]");
  var related = new Set([code]);
  var c = ALL[code];
  if (c.prereq) related.add(c.prereq);
  (UNLOCKS[code] || []).forEach(function(u){ related.add(u); });

  allNodes.forEach(function(n){
    var nc = n.dataset.code;
    n.classList.remove("hl-self", "hl-req", "hl-unlock");
    if (!related.has(nc)) {
      n.classList.add("dim");
    } else {
      n.classList.remove("dim");
      if (nc === code) n.classList.add("hl-self");
      else if (nc === c.prereq) n.classList.add("hl-req");
      else n.classList.add("hl-unlock");
    }
  });

  document.querySelectorAll(".edge").forEach(function(e){
    if (e.dataset.from === code || e.dataset.to === code) {
      e.classList.add("hl");
    }
  });
}

function clearFocus(){
  document.querySelectorAll(".node[data-code]").forEach(function(n){
    n.classList.remove("dim", "hl-self", "hl-req", "hl-unlock");
  });
  document.querySelectorAll(".edge").forEach(function(e){ e.classList.remove("hl"); });
}

var detailPanel = document.getElementById("detailPanel");
var dTitle = document.getElementById("dTitle");
var dMeta = document.getElementById("dMeta");
var dDesc = document.getElementById("dDesc");
var dReq = document.getElementById("dReq");
var dUnlocks = document.getElementById("dUnlocks");
document.getElementById("detailClose").addEventListener("click", closeDetail);

function openDetail(code){
  var c = ALL[code];
  if (!c) return;
  var areaLabel = c.kind === "trunk" ? "Plan común · Semestre " + c.sem : DATA.areas[c.kind].label + " · Especialidad";
  dTitle.textContent = c.name;
  dMeta.textContent = c.code + " · " + c.credits + " créditos · " + areaLabel;
  dDesc.textContent = c.desc || "Sin resumen disponible.";

  dReq.innerHTML = "";
  if (c.prereq && ALL[c.prereq]) {
    var li = document.createElement("li");
    li.textContent = ALL[c.prereq].name;
    li.addEventListener("click", function(){ openDetail(c.prereq); });
    dReq.appendChild(li);
  } else if (c.prereq) {
    var li2 = document.createElement("li");
    li2.className = "none";
    li2.textContent = c.prereq;
    dReq.appendChild(li2);
  } else {
    var li3 = document.createElement("li");
    li3.className = "none";
    li3.textContent = "Ninguno";
    dReq.appendChild(li3);
  }

  dUnlocks.innerHTML = "";
  var uk = UNLOCKS[code] || [];
  if (uk.length === 0) {
    var lu = document.createElement("li");
    lu.className = "none";
    lu.textContent = "No es requisito de otro curso";
    dUnlocks.appendChild(lu);
  } else {
    uk.forEach(function(u){
      var lu2 = document.createElement("li");
      lu2.textContent = ALL[u].name;
      lu2.addEventListener("click", function(){ openDetail(u); });
      dUnlocks.appendChild(lu2);
    });
  }

  detailPanel.classList.add("open");
  focusCourse(code);
}

function closeDetail(){
  detailPanel.classList.remove("open");
  clearFocus();
}

document.addEventListener("click", function(e){
  if (!detailPanel.contains(e.target) && !e.target.closest(".node")) {
    closeDetail();
  }
});
})();
