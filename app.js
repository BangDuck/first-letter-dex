/* ==========================================================
   첫 글자 도감 — 동작
   data/pokemon-data.js 가 먼저 로드되어 window.POKEDEX 를 만든다.
   ========================================================== */
(function () {
  "use strict";

  var DATA = window.POKEDEX || [];
  var META = window.POKEDEX_META || {};
  var ART_BASE = META.artworkBase || "";

  var TYPE_KO = {
    normal: "노말", fire: "불꽃", water: "물", grass: "풀", electric: "전기",
    ice: "얼음", fighting: "격투", poison: "독", ground: "땅", flying: "비행",
    psychic: "에스퍼", bug: "벌레", rock: "바위", ghost: "고스트", dragon: "드래곤",
    dark: "악", steel: "강철", fairy: "페어리"
  };
  // 공식 도감 배지 색 (style.css 의 --t-* 와 같은 값, 캔버스용)
  var TYPE_COLOR = {
    normal: "#999999", fire: "#ff612c", water: "#2992ff", grass: "#42bf24",
    electric: "#ffdb00", ice: "#42d8ff", fighting: "#ffa202", poison: "#994dcf",
    ground: "#ab7939", flying: "#95c9ff", psychic: "#ff637f", bug: "#9fa424",
    rock: "#bcb889", ghost: "#6e4570", dragon: "#5462d6", dark: "#4f4747",
    steel: "#6aaed3", fairy: "#ffb1ff"
  };

  var MSG_INVALID = "완성된 글자 하나를 입력해 주세요";
  var MSG_NONE = "해당 글자로 시작하는 포켓몬이 없습니다";

  /* ------------------------------------------------ 한글 도우미 */

  var SYL_START = 0xac00;
  var SYL_END = 0xd7a3;
  // 중성 21개를 기본 모음으로 묶음 (ㅑ→ㅏ, ㅕ→ㅓ ...) : 대안 글자 제안용
  var JUNG_BASE = [0, 1, 0, 1, 4, 5, 4, 5, 8, 0, 1, 5, 8, 13, 4, 5, 20, 13, 18, 20, 20];

  function nfc(s) {
    return typeof s.normalize === "function" ? s.normalize("NFC") : s;
  }
  function isSyllable(ch) {
    if (!ch) return false;
    var c = ch.codePointAt(0);
    return c >= SYL_START && c <= SYL_END;
  }
  function decompose(ch) {
    var c = ch.codePointAt(0) - SYL_START;
    return { cho: Math.floor(c / 588), jung: Math.floor((c % 588) / 28), jong: c % 28 };
  }
  function compose(cho, jung, jong) {
    return String.fromCharCode(SYL_START + cho * 588 + jung * 28 + jong);
  }
  function firstChar(s) {
    return Array.from(s)[0] || "";
  }
  // '방'으로 / '피'로 (받침이 없거나 ㄹ받침이면 '로')
  function josaRo(ch) {
    if (!isSyllable(ch)) return "로";
    var jong = decompose(ch).jong;
    return jong === 0 || jong === 8 ? "로" : "으로";
  }
  function pad4(n) {
    return ("000" + n).slice(-4);
  }

  /* ------------------------------------------------ 데이터 준비 */

  // 검색 대상 항목: 기본 모습 + (옵션) 특수 폼
  var entries = [];
  DATA.forEach(function (p) {
    var name = nfc(p.name);
    entries.push({
      key: "p" + p.id, id: p.id, form: false, kind: "base",
      name: name, baseName: name, nameEn: p.nameEn, genus: p.genus, flavor: p.flavor,
      types: p.types, height: p.height, weight: p.weight, art: p.art
    });
    (p.forms || []).forEach(function (f) {
      entries.push({
        key: f.key, id: p.id, form: true, kind: f.kind,
        name: nfc(f.name), baseName: name, nameEn: p.nameEn, genus: p.genus, flavor: p.flavor,
        types: f.types, height: f.height, weight: f.weight, art: f.art
      });
    });
  });
  var byKey = {};
  entries.forEach(function (e) { byKey[e.key] = e; });

  // 첫 글자 → 항목 목록. 특수 폼은 원래 포켓몬 이름의 첫 글자로 찾는다.
  var index = {};
  entries.forEach(function (e) {
    var ch = firstChar(e.baseName);
    (index[ch] = index[ch] || []).push(e);
  });

  // 두음법칙 짝 (양쪽 방향으로 찾음)
  var DUEUM_PAIRS = [
    ["이", "리"], ["임", "림"], ["유", "류"], ["노", "로"], ["나", "라"], ["양", "량"],
    ["여", "려"], ["연", "련"], ["염", "렴"], ["엽", "렵"], ["육", "륙"], ["윤", "륜"],
    ["율", "률"], ["이", "니"]
  ];
  var DUEUM = {};
  DUEUM_PAIRS.forEach(function (p) {
    (DUEUM[p[0]] = DUEUM[p[0]] || []).push(p[1]);
    (DUEUM[p[1]] = DUEUM[p[1]] || []).push(p[0]);
  });

  var state = {
    char: "",
    dueum: false,       // 두음법칙 (기본 꺼짐)
    includeForms: false // 특수 폼 (기본 꺼짐: 기본 모습만)
  };

  // 결과 항목: { e: 포켓몬, via: 두음법칙으로 함께 찾은 글자 또는 null }
  function lookup(ch) {
    var chars = [ch].concat(state.dueum ? (DUEUM[ch] || []) : []);
    var items = [];
    chars.forEach(function (c, i) {
      (index[c] || []).forEach(function (e) {
        if (state.includeForms || !e.form) items.push({ e: e, via: i === 0 ? null : c });
      });
    });
    return items.sort(function (a, b) {
      return a.e.id - b.e.id || (a.e.form - b.e.form);
    });
  }
  function countFor(ch) {
    return lookup(ch).length;
  }

  /* ------------------------------------------------ 대안 글자 제안 */

  function suggest(ch) {
    var d = decompose(ch);
    var same = [];
    for (var jong = 0; jong < 28; jong++) {
      var s = compose(d.cho, d.jung, jong);
      if (s !== ch && countFor(s) > 0) same.push(s);
    }
    if (same.length) {
      return { kind: "same", list: same.slice(0, 10) };
    }
    // 초성·중성이 같은 글자가 없으면: 초성이 같고 비슷한 모음(ㅑ→ㅏ 등)인 글자부터
    var cands = [];
    for (var jung = 0; jung < 21; jung++) {
      if (jung === d.jung) continue;
      for (var jg = 0; jg < 28; jg++) {
        var c = compose(d.cho, jung, jg);
        var n = countFor(c);
        if (n > 0) {
          cands.push({
            ch: c, n: n,
            score: (JUNG_BASE[jung] === JUNG_BASE[d.jung] ? 0 : 2) + (jg === d.jong ? 0 : 1)
          });
        }
      }
    }
    cands.sort(function (a, b) { return a.score - b.score || b.n - a.n; });
    return { kind: "similar", list: cands.slice(0, 10).map(function (c) { return c.ch; }) };
  }

  /* ------------------------------------------------ 화면 요소 */

  var $ = function (id) { return document.getElementById(id); };
  var device = document.querySelector(".device");
  var form = $("search-form");
  var input = $("q");
  var msgEl = $("lcd-msg");
  var noteEl = $("lcd-note");
  var cardsEl = $("cards");
  var emptyEl = $("results-empty");
  var hintEl = $("results-hint");

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === "text") node.textContent = attrs[k];
        else if (k === "className") node.className = attrs[k];
        else node.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) {
      if (c != null) node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  function typeBadges(types) {
    return el("span", { className: "types" }, types.map(function (t) {
      var badge = el("span", { className: "type", text: TYPE_KO[t] || t });
      badge.style.setProperty("--tc", TYPE_COLOR[t] || "#999");
      return badge;
    }));
  }

  function artUrl(art) {
    return /^https?:/.test(art) ? art : ART_BASE + art;
  }

  var FORM_TAG = { mega: "메가", gmax: "거다이맥스", regional: "리전폼", other: "폼" };

  function card(item, i) {
    var e = item.e;
    var img = el("img", {
      src: artUrl(e.art), alt: e.name, loading: "lazy", decoding: "async",
      width: "200", height: "200", crossorigin: "anonymous"
    });
    img.addEventListener("error", function () { img.closest(".card__art").classList.add("is-broken"); });

    var nameNode;
    if (e.form) {
      nameNode = el("span", { className: "card__name" }, [
        e.name, el("span", { className: "card__form", text: e.baseName + "의 특수 폼" })
      ]);
    } else {
      var chars = Array.from(e.name);
      nameNode = el("span", { className: "card__name" }, [
        el("span", { className: "first", text: chars[0] }), chars.slice(1).join("")
      ]);
    }

    var btn = el("button", { type: "button", className: "card", "data-key": e.key }, [
      el("span", { className: "card__no", text: "No." + pad4(e.id) }),
      e.form ? el("span", { className: "card__tag", text: FORM_TAG[e.kind] || "폼" }) : null,
      el("span", { className: "card__art" }, [img]),
      nameNode,
      typeBadges(e.types),
      item.via ? el("span", { className: "card__dueum", text: "두음법칙 · " + item.via }) : null
    ]);
    btn.style.setProperty("--i", Math.min(i, 20));
    return el("li", null, [btn]);
  }

  function setMsg(html, warn) {
    msgEl.innerHTML = html;
    msgEl.classList.toggle("is-warn", !!warn);
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function scanEffect() {
    device.classList.remove("is-scanning");
    void device.offsetWidth; // 애니메이션 다시 시작
    device.classList.add("is-scanning");
    clearTimeout(scanEffect.t);
    scanEffect.t = setTimeout(function () { device.classList.remove("is-scanning"); }, 800);
  }

  function chip(ch) {
    var b = el("button", { type: "button", className: "chip", "data-char": ch,
      "aria-label": ch + " 로 검색 (" + countFor(ch) + "마리)" }, [
      ch, el("small", { text: countFor(ch) + "" })
    ]);
    return el("li", null, [b]);
  }

  function showIdle() {
    setMsg("글자 하나를 넣으면 그 글자로 <strong>시작하는</strong> 포켓몬만 찾아드려요.");
    cardsEl.innerHTML = "";
    hintEl.hidden = true;
    emptyEl.innerHTML = "";
    emptyEl.appendChild(el("h2", { text: "이렇게 찾아보세요" }));
    emptyEl.appendChild(el("p", { text: "자기 성(姓)을 넣어 보세요. 예를 들어 '피'를 넣으면 피카츄가 나오지만, '카'를 넣으면 피카츄는 나오지 않아요." }));
    emptyEl.appendChild(el("ul", { className: "chips" }, ["방", "이", "조", "강", "윤", "한", "고", "오"].map(chip)));
    emptyEl.hidden = false;
  }

  function showNone(ch) {
    setMsg(MSG_NONE, true);
    cardsEl.innerHTML = "";
    hintEl.hidden = true;
    var s = suggest(ch);
    emptyEl.innerHTML = "";
    emptyEl.appendChild(el("h2", { text: "'" + ch + "'" + josaRo(ch) + " 시작하는 포켓몬이 없어요" }));
    if (s.list.length) {
      emptyEl.appendChild(el("p", { text: s.kind === "same"
        ? "초성과 중성이 같은 이 글자들은 어때요?"
        : "초성과 중성이 같은 글자에도 없어서, 비슷한 글자를 골라 봤어요." }));
      emptyEl.appendChild(el("ul", { className: "chips" }, s.list.map(chip)));
    } else {
      emptyEl.appendChild(el("p", { text: "비슷한 글자도 찾지 못했어요. 다른 글자를 넣어 보세요." }));
    }
    emptyEl.hidden = false;
  }

  function showResults(ch, list) {
    setMsg("'<strong>" + esc(ch) + "</strong>'" + josaRo(ch) + " 시작하는 포켓몬 <strong>" + list.length + "</strong>마리 발견");
    emptyEl.hidden = true;
    hintEl.hidden = false;
    var frag = document.createDocumentFragment();
    list.forEach(function (item, i) { frag.appendChild(card(item, i)); });
    cardsEl.innerHTML = "";
    cardsEl.appendChild(frag);
  }

  /* ------------------------------------------------ 검색 */

  function run(force) {
    var raw = nfc(input.value).trim();
    var chars = Array.from(raw);
    var ch = chars[0] || "";

    if (!raw) {
      noteEl.textContent = "";
      if (state.char !== "" || force) { state.char = ""; showIdle(); updateUrl(); }
      return;
    }
    if (!isSyllable(ch)) {
      if (state.char) { state.char = ""; updateUrl(); }
      noteEl.textContent = "자음·모음만, 또는 영문·숫자·기호는 검색할 수 없어요.";
      setMsg(MSG_INVALID, true);
      cardsEl.innerHTML = "";
      emptyEl.hidden = true;
      hintEl.hidden = true;
      return;
    }
    var list = lookup(ch);
    var notes = [];
    if (chars.length > 1) {
      notes.push("'" + raw + "' 중 첫 글자 '" + ch + "'" + josaRo(ch) + " 검색했어요.");
    }
    var viaChars = [];
    list.forEach(function (it) {
      if (it.via && viaChars.indexOf(it.via) < 0) viaChars.push(it.via);
    });
    if (viaChars.length) {
      notes.push("두음법칙으로 '" + viaChars.join("'·'") + "'" + josaRo(viaChars[viaChars.length - 1]) + " 시작하는 포켓몬도 함께 보여 줘요.");
    }
    noteEl.textContent = notes.join(" ");

    if (ch === state.char && !force) return;
    state.char = ch;

    if (list.length) showResults(ch, list); else showNone(ch);
    scanEffect();
    updateUrl();
    rememberSoon(ch);
  }

  function searchFor(ch) {
    input.value = ch;
    run(true);
    remember(ch);
    input.focus();
  }

  input.addEventListener("input", function () { run(false); });
  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    run(true);
    if (state.char) remember(state.char);
  });

  emptyEl.addEventListener("click", function (ev) {
    var b = ev.target.closest(".chip");
    if (b) searchFor(b.getAttribute("data-char"));
  });

  /* ------------------------------------------------ 옵션 · 공유 링크 */

  var optDueum = $("opt-dueum");
  var optForms = $("opt-forms");

  optDueum.addEventListener("change", function () {
    state.dueum = optDueum.checked;
    run(true);
  });
  optForms.addEventListener("change", function () {
    state.includeForms = optForms.checked;
    run(true);
  });

  // 검색어와 옵션을 주소에 반영 (예: ?q=방). 페이지를 새로 불러오지 않는다.
  function buildUrl() {
    var params = [];
    if (state.char) params.push("q=" + encodeURIComponent(state.char));
    if (state.dueum) params.push("dueum=1");
    if (state.includeForms) params.push("forms=1");
    return location.href.split(/[?#]/)[0] + (params.length ? "?" + params.join("&") : "");
  }
  function updateUrl() {
    try {
      history.replaceState(null, "", buildUrl());
    } catch (err) {
      // 일부 환경(파일로 연 경우 등)에서 주소 변경이 막혀도 검색은 계속 동작
    }
  }

  function readUrl() {
    var params;
    try {
      params = new URLSearchParams(location.search);
    } catch (err) {
      return;
    }
    state.dueum = params.get("dueum") === "1";
    state.includeForms = params.get("forms") === "1";
    optDueum.checked = state.dueum;
    optForms.checked = state.includeForms;
    var q = params.get("q");
    if (q) input.value = nfc(q);
  }

  var shareStatus = $("share-status");
  $("share").addEventListener("click", function () {
    var url = buildUrl();
    var done = function (ok) {
      shareStatus.textContent = ok ? "링크를 복사했어요!" : "복사가 안 되면 주소창의 주소를 복사해 주세요.";
      clearTimeout(done.t);
      done.t = setTimeout(function () { shareStatus.textContent = ""; }, 3000);
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(url).then(function () { done(true); }, function () { done(fallbackCopy(url)); });
    } else {
      done(fallbackCopy(url));
    }
  });
  function fallbackCopy(text) {
    var ta = el("textarea", { readonly: "", "aria-hidden": "true" });
    ta.value = text;
    ta.style.cssText = "position:fixed;top:-100px;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (err) { ok = false; }
    ta.remove();
    return ok;
  }

  /* ------------------------------------------------ 최근 검색 */

  var RECENT_KEY = "firstLetterDex.recent";
  var RECENT_MAX = 5;
  var recentRow = $("recent-row");
  var recentEl = $("recent");

  // 브라우저 저장소를 쓸 수 없는 환경(사생활 보호 모드 등)에서는 메모리에만 기억
  var store = (function () {
    try {
      var k = "__dex_test__";
      window.localStorage.setItem(k, k);
      window.localStorage.removeItem(k);
      return window.localStorage;
    } catch (err) {
      return null;
    }
  })();
  var recent = (function () {
    try {
      var saved = JSON.parse((store && store.getItem(RECENT_KEY)) || "[]");
      return Array.isArray(saved) ? saved.filter(isSyllable).slice(0, RECENT_MAX) : [];
    } catch (err) {
      return [];
    }
  })();

  function renderRecent() {
    recentEl.innerHTML = "";
    recent.forEach(function (ch) {
      recentEl.appendChild(el("li", null, [
        el("button", { type: "button", className: "chip", "data-char": ch, "aria-label": ch + " 다시 검색" }, [ch])
      ]));
    });
    recentRow.hidden = recent.length === 0;
  }

  function remember(ch) {
    clearTimeout(rememberSoon.t);
    if (!isSyllable(ch)) return;
    recent = [ch].concat(recent.filter(function (c) { return c !== ch; })).slice(0, RECENT_MAX);
    try {
      if (store) store.setItem(RECENT_KEY, JSON.stringify(recent));
    } catch (err) { /* 저장 실패해도 화면은 정상 동작 */ }
    renderRecent();
  }
  // 한글은 '바'→'방'처럼 조합되며 입력되므로, 잠시 멈췄을 때의 글자만 기억한다
  function rememberSoon(ch) {
    clearTimeout(rememberSoon.t);
    rememberSoon.t = setTimeout(function () {
      if (state.char === ch) remember(ch);
    }, 1200);
  }

  recentEl.addEventListener("click", function (ev) {
    var b = ev.target.closest(".chip");
    if (b) searchFor(b.getAttribute("data-char"));
  });
  $("recent-clear").addEventListener("click", function () {
    recent = [];
    try {
      if (store) store.removeItem(RECENT_KEY);
    } catch (err) { /* 무시 */ }
    renderRecent();
    input.focus();
  });

  /* ------------------------------------------------ 상세 보기 */

  var dialog = $("detail");
  var detailImg = $("detail-img");
  var current = null;
  var lastFocus = null;

  cardsEl.addEventListener("click", function (ev) {
    var b = ev.target.closest(".card");
    if (b) openDetail(byKey[b.getAttribute("data-key")], b);
  });

  function fmt(n, unit) {
    return (Math.round(n * 10) / 10).toFixed(1) + unit;
  }

  function openDetail(e, opener) {
    if (!e) return;
    current = e;
    lastFocus = opener || document.activeElement;
    if (state.char) remember(state.char);
    $("detail-no").textContent = "No." + pad4(e.id);
    $("detail-name").textContent = e.name;
    $("detail-en").textContent = e.nameEn;
    $("detail-genus").textContent = e.genus;
    var typesCell = $("detail-types");
    typesCell.innerHTML = "";
    typesCell.appendChild(typeBadges(e.types));
    $("detail-height").textContent = fmt(e.height, "m");
    $("detail-weight").textContent = fmt(e.weight, "kg");
    $("detail-flavor").textContent = e.flavor || "도감 설명이 아직 준비되지 않았어요.";
    detailImg.alt = e.name;
    detailImg.src = artUrl(e.art);
    $("profile-status").textContent = "";

    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    dialog.scrollTop = 0;
    renderPreview();
  }

  function closeDetail() {
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  $("detail-close").addEventListener("click", closeDetail);
  dialog.addEventListener("click", function (ev) {
    if (ev.target === dialog) closeDetail(); // 바깥(어두운 부분) 클릭
  });
  dialog.addEventListener("close", function () {
    current = null;
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  });

  /* ------------------------------------------------ 프로필 사진 */

  var SIZE = 800;
  var ART_RATIO = 0.8; // 일러스트는 화면의 약 80%
  var canvas = $("profile-canvas");
  var ctx = canvas.getContext("2d");
  var saveBtn = $("profile-save");
  var statusEl = $("profile-status");
  var imgCache = {};

  var BG_LABEL = { white: "흰색", transparent: "투명", type: "타입색", dex: "도감화면" };

  function selectedBg() {
    var r = document.querySelector('input[name="bg"]:checked');
    return r ? r.value : "white";
  }

  // CORS 허용 이미지로 불러온다. (다른 사이트 이미지를 캔버스에 그린 뒤 저장하려면 필요)
  function loadArt(url) {
    if (imgCache[url]) return imgCache[url];
    imgCache[url] = new Promise(function (resolve, reject) {
      var img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = function () { resolve(img); };
      img.onerror = function () { delete imgCache[url]; reject(new Error("image")); };
      img.src = url;
    });
    return imgCache[url];
  }

  function shade(hex, amt) {
    var n = parseInt(hex.slice(1), 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    var f = function (v) { return Math.max(0, Math.min(255, Math.round(amt > 0 ? v + (255 - v) * amt : v * (1 + amt)))); };
    return "rgb(" + f(r) + "," + f(g) + "," + f(b) + ")";
  }

  function drawBackground(c, bg, e) {
    c.clearRect(0, 0, SIZE, SIZE);
    if (bg === "transparent") return;
    if (bg === "white") {
      c.fillStyle = "#ffffff";
      c.fillRect(0, 0, SIZE, SIZE);
      return;
    }
    if (bg === "type") {
      var base = TYPE_COLOR[e.types[0]] || "#999999";
      var g = c.createRadialGradient(SIZE / 2, SIZE / 2, SIZE * 0.05, SIZE / 2, SIZE / 2, SIZE * 0.72);
      g.addColorStop(0, shade(base, 0.35));
      g.addColorStop(1, base);
      c.fillStyle = g;
      c.fillRect(0, 0, SIZE, SIZE);
      return;
    }
    // 도감 화면 스타일: 어두운 녹색 LCD + 격자 + 주사선
    var lg = c.createRadialGradient(SIZE / 2, SIZE / 2, SIZE * 0.05, SIZE / 2, SIZE / 2, SIZE * 0.75);
    lg.addColorStop(0, "#2a6b35");
    lg.addColorStop(0.6, "#163d20");
    lg.addColorStop(1, "#0b2211");
    c.fillStyle = lg;
    c.fillRect(0, 0, SIZE, SIZE);
    c.fillStyle = "rgba(157,242,122,0.10)";
    for (var x = 0; x < SIZE; x += 20) c.fillRect(x, 0, 2, SIZE);
    for (var y = 0; y < SIZE; y += 20) c.fillRect(0, y, SIZE, 2);
    c.fillStyle = "rgba(0,0,0,0.16)";
    for (var s = 0; s < SIZE; s += 6) c.fillRect(0, s, SIZE, 2);
    var glow = c.createRadialGradient(SIZE / 2, SIZE / 2, 0, SIZE / 2, SIZE / 2, SIZE * 0.42);
    glow.addColorStop(0, "rgba(190,255,160,0.35)");
    glow.addColorStop(1, "rgba(190,255,160,0)");
    c.fillStyle = glow;
    c.fillRect(0, 0, SIZE, SIZE);
  }

  function drawProfile(c, img, bg, e) {
    drawBackground(c, bg, e);
    var box = SIZE * ART_RATIO;
    var scale = Math.min(box / img.naturalWidth, box / img.naturalHeight);
    var w = img.naturalWidth * scale, h = img.naturalHeight * scale;
    c.imageSmoothingQuality = "high";
    c.drawImage(img, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
  }

  function renderPreview() {
    var e = current;
    if (!e) return;
    var bg = selectedBg();
    drawBackground(ctx, bg, e);
    hideResult();
    loadArt(artUrl(e.art)).then(function (img) {
      if (current !== e) return;
      drawProfile(ctx, img, selectedBg(), e);
      prepare(e, selectedBg());
    }).catch(function () {
      statusEl.textContent = "일러스트를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.";
    });
  }

  document.querySelectorAll('input[name="bg"]').forEach(function (r) {
    r.addEventListener("change", renderPreview);
  });

  // 아이폰·아이패드: 다운로드하면 '파일' 앱으로 가므로, 공유 창의 '이미지 저장'으로 사진 앱에 넣는다
  var IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var resultBox = $("profile-result");
  var resultImg = $("profile-result-img");
  var resultUrl = null;

  // 공유 창은 버튼을 누른 '바로 그 순간'에 열어야 해서, 저장할 이미지를 미리 만들어 둔다
  var prepared = null; // { e, bg, blob }
  function prepare(e, bg) {
    if (prepared && prepared.e === e && prepared.bg === bg) return;
    var p = { e: e, bg: bg, blob: null };
    prepared = p;
    makeProfileBlob(e, bg).then(function (blob) { p.blob = blob; }, function () {});
  }

  function fileNameFor(e, bg) {
    return e.name.replace(/[\\/:*?"<>|\s]+/g, "_") + "_No" + pad4(e.id) + "_" + BG_LABEL[bg] + ".png";
  }

  function shareableFile(blob, name) {
    if (!navigator.share || !navigator.canShare || typeof File !== "function") return null;
    var file = new File([blob], name, { type: "image/png" });
    try {
      return navigator.canShare({ files: [file] }) ? file : null;
    } catch (err) {
      return null;
    }
  }

  function hideResult() {
    resultBox.hidden = true;
    if (resultUrl) { URL.revokeObjectURL(resultUrl); resultUrl = null; }
  }

  // 공유 창을 쓸 수 없을 때(인앱 브라우저 등): 이미지를 보여 주고 길게 눌러 저장하게 안내
  function showResult(blob) {
    hideResult();
    resultUrl = URL.createObjectURL(blob);
    resultImg.src = resultUrl;
    resultBox.hidden = false;
    statusEl.textContent = "";
    resultBox.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function saveToPhotos(blob, name) {
    var file = shareableFile(blob, name);
    if (!file) {
      showResult(blob);
      return;
    }
    statusEl.textContent = "공유 창에서 '이미지 저장'을 누르면 사진 앱에 저장돼요.";
    navigator.share({ files: [file] }).catch(function (err) {
      if (err && err.name === "AbortError") {
        statusEl.textContent = "저장을 취소했어요.";
      } else {
        showResult(blob); // 공유 창이 막힌 경우
      }
    });
  }

  function download(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = el("a", { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    statusEl.textContent = "저장했어요: " + name + " (800×800)";
  }

  // 800×800 PNG 파일 데이터를 만든다
  function makeProfileBlob(e, bg) {
    return loadArt(artUrl(e.art)).then(function (img) {
      var out = document.createElement("canvas");
      out.width = SIZE;
      out.height = SIZE;
      drawProfile(out.getContext("2d"), img, bg, e);
      return new Promise(function (resolve, reject) {
        try {
          out.toBlob(function (blob) { blob ? resolve(blob) : reject(new Error("blob")); }, "image/png");
        } catch (err) {
          reject(err); // 다른 사이트 이미지 사용이 막히면(CORS) 여기서 SecurityError
        }
      });
    });
  }

  saveBtn.addEventListener("click", function () {
    var e = current;
    if (!e) return;
    var bg = selectedBg();
    var name = fileNameFor(e, bg);

    // 아이폰에서 이미지가 미리 준비돼 있으면 바로 공유 창을 연다
    if (IS_IOS && prepared && prepared.e === e && prepared.bg === bg && prepared.blob) {
      saveToPhotos(prepared.blob, name);
      return;
    }

    saveBtn.disabled = true;
    statusEl.textContent = "이미지를 만드는 중…";
    makeProfileBlob(e, bg).then(function (blob) {
      if (IS_IOS) saveToPhotos(blob, name); else download(blob, name);
    }).catch(function (err) {
      statusEl.textContent = err && err.name === "SecurityError"
        ? "보안 규칙 때문에 이미지를 저장할 수 없어요. 다른 브라우저로 시도해 주세요."
        : "저장하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.";
    }).then(function () {
      saveBtn.disabled = false;
    });
  });

  /* ------------------------------------------------ 시작 */

  // 테스트·디버깅용으로 핵심 함수 노출
  window.FirstLetterDex = {
    lookup: lookup, suggest: suggest, search: searchFor, state: state,
    makeProfileBlob: function (key, bg) { return makeProfileBlob(byKey[key], bg); }
  };

  readUrl();      // 공유 링크(?q=방)로 들어오면 바로 그 결과를 보여 준다
  renderRecent();
  run(true);
})();
