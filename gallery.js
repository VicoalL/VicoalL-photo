/* ─────────────────────────────────────────────────────────────
   照片墙 + 灯箱  (VicoalL)
   数据：photos.js (window.SITE)
   排版：行式拼版（12 栏，按宽高比组行 + 交错缩进）
   ───────────────────────────────────────────────────────────── */
(async () => {
  "use strict";
  const SITE = window.SITE;
  if (!SITE || !SITE.chapters) return;

  const thumb = (s, f) => `photos/thumb/${s}/${encodeURIComponent(f)}`;
  const web = (s, f) => `photos/web/${s}/${encodeURIComponent(f)}`;

  const dateLine = p => (p.date ? p.date.replace(/-/g, ".") : "");
  const exifLine = p => {
    const b = [];
    if (p.focal) b.push(p.focal + "mm");
    if (p.fnum) b.push("ƒ/" + p.fnum);
    if (p.exp) b.push(p.exp + "s");
    if (p.iso) b.push("ISO" + p.iso);
    return b.join(" · ");
  };
  const fmtRange = r => {
    if (!r) return "";
    const parts = r.split(" — ").map(s => s.replace(/-/g, ".").trim()).filter(Boolean);
    return parts.length > 1 && parts[0] === parts[1] ? parts[0] : parts.join(" — ");
  };

  const light = [];

  /* ── 后台覆盖配置 ─────────────────────────────────────── */
  let OV = {};
  try {
    const r = await fetch("api/overrides", { credentials: "same-origin", cache: "no-store" });
    if (r.ok) OV = await r.json();
  } catch (_) {}
  const OVHID = new Set(OV.hidden || []);
  const ovKey = (slug, f) => slug + "/" + f;
  const ovPick = (slug, p) => (OV.picks && OV.picks[slug]) ? OV.picks[slug].includes(p.f) : p.pick;
  const ovCap = (slug, p) => (OV.captions || {})[ovKey(slug, p.f)] || "";
  function ovList(slug, ch, onlyPicks) {
    let arr = ch.photos.filter(p => !OVHID.has(ovKey(slug, p.f)));
    const ord = (OV.order || {})[slug];
    if (ord && ord.length) {
      arr = arr.slice().sort((a, b) => {
        const ia = ord.indexOf(a.f), ib = ord.indexOf(b.f);
        return (ia < 0 ? 1e6 : ia) - (ib < 0 ? 1e6 : ib);
      });
    }
    return onlyPicks ? arr.filter(p => ovPick(slug, p)) : arr;
  }

  /* ── 行式拼版 ─────────────────────────────────────────────── */
  /* 组行：按宽高比决定一行放几张，再按比例分栏宽 —— 同一行底边对齐 */
  function planRows(list, cap, narrow) {
    const rows = [];
    let i = 0;
    while (i < list.length) {
      const p = list[i];
      const ar = p.w / p.h;
      let n;
      if (ar >= 2.0) n = 1;                                   // 超宽：独占一行
      else if (ar < 1.0) n = (i + 1 < list.length) ? 2 : 1;   // 竖幅：配一张
      else if (ar >= 1.45) n = 3;                             // 横幅：三张一排
      else n = 2;

      // 窄屏两栏等宽：宽高比差太多就会在矮的底下空一块。
      // 先在后面 3 张里找宽高比接近的换上，找不到才让这张单独占一行。
      if (narrow && n > 1) {
        const near = (a, b) => Math.max(a, b) / Math.min(a, b) <= 1.32;
        let ok = true;
        for (let k = 1; k < n && i + k < list.length; k++) {
          if (!near(ar, list[i + k].w / list[i + k].h)) { ok = false; break; }
        }
        if (!ok) {
          let swapped = false;
          for (let j = i + 1; j < Math.min(i + 4, list.length); j++) {
            const b = list[j].w / list[j].h;
            if (!near(ar, b)) continue;
            let allOk = true;
            for (let k = 1; k < n; k++) {
              const c = (k === 1) ? b : (list[i + k] ? list[i + k].w / list[i + k].h : b);
              if (!near(ar, c)) { allOk = false; break; }
            }
            if (allOk) {
              const tmp = list[i + 1]; list[i + 1] = list[j]; list[j] = tmp;
              swapped = true; break;
            }
          }
          if (!swapped) n = 1;
        }
      }
      if (cap) n = Math.min(n, Math.max(1, cap));
      const items = list.slice(i, i + n);
      rows.push(items);
      i += items.length;
    }
    // 首图单独成行：否则强制通栏后，同行的第二张会被挤到下一行留下半边空
    if (rows.length && rows[0].length > 1) {
      const first = rows[0];
      rows.splice(0, 1, [first[0]], first.slice(1));
    }
    return rows;
  }

  /* 把一行的宽高比换算成 12 栏里的列宽，保证渲染高度一致 */
  function spansFor(items) {
    const ars = items.map(p => p.w / p.h);
    if (items.length === 1) {
      const ar = ars[0];
      const span = Math.max(4, Math.min(12, Math.round(ar * 6)));
      return [span];
    }
    const sum = ars.reduce((a, b) => a + b, 0);
    let out = ars.map(a => Math.round(a / sum * 12));
    // 修掉四舍五入的误差，保证合计 12
    let diff = 12 - out.reduce((a, b) => a + b, 0);
    let k = 0;
    while (diff !== 0) {
      const idx = k % out.length;
      if (diff > 0) { out[idx]++; diff--; }
      else if (out[idx] > 2) { out[idx]--; diff++; }
      k++;
    }
    return out;
  }

  function fill(box, slug, onlyPicks) {
    const ch = SITE.chapters[slug];
    if (!ch) return 0;
    // 章节网格里不放全景：它们太扁，而且下面有专门的全景带
    let list = ovList(slug, ch, onlyPicks);
    if (onlyPicks) list = list.filter(p => p.w / p.h < 2.2);
    const rows = planRows(list, ((OV.chapters || {})[slug] || {}).density || 0, innerWidth < 720);

    rows.forEach((row, ri) => {
      const spans = spansFor(row);
      const el = document.createElement("div");
      el.className = "ph-row";
      if (ri % 4 === 3) el.classList.add("is-step");
      if (ri % 5 === 2 && row.length > 1) el.classList.add("is-indent");

      row.forEach((p, k) => {
        if (!p) return;
        const fig = document.createElement("figure");
        fig.className = "ph" + (p.w / p.h > 1.9 ? " w" : "");
        fig.dataset.index = light.length;
        fig.style.gridColumn = `span ${spans[k]}`;
        fig.style.aspectRatio = `${p.w} / ${p.h}`;
        const custom = ovCap(slug, p);
        const alt = custom || [dateLine(p), exifLine(p)].filter(Boolean).join(" · ");
        fig.innerHTML =
          `<img src="${thumb(slug, p.f)}" width="${p.w}" height="${p.h}" loading="lazy" decoding="async" alt="${alt}">` +
          `<figcaption><b>${custom || dateLine(p)}</b><span>${exifLine(p)}</span></figcaption>`;
        el.appendChild(fig);
        light.push({ src: web(slug, p.f), slug, ...p });
      });
      box.appendChild(el);
    });

    return list.length;
  }

  let rendered = 0;
  document.querySelectorAll("[data-album]").forEach(box => {
    rendered += fill(box, box.dataset.album, true);
  });

  /* ── 章节元信息 ───────────────────────────────────────────── */
  document.querySelectorAll(".chapter").forEach(sec => {
    const ch = SITE.chapters[sec.id];
    if (!ch) return;
    const picks = ch.photos.filter(p => p.pick).length;
    const c = sec.querySelector("[data-count]");
    if (c) c.textContent = picks + " 张精选 / 共 " + ch.photos.length + " 张";
    const r = sec.querySelector("[data-range]");
    if (r && ch.range) r.textContent = fmtRange(ch.range);
    const cs = (OV.chapters || {})[sec.id] || {};
    if (cs.density) sec.style.setProperty("--density", cs.density);
    if (cs.surface) sec.setAttribute("data-surface", cs.surface);
    const noteEl = sec.querySelector("[data-note]");
    if (noteEl && cs.note) noteEl.textContent = cs.note;
    const more = sec.querySelector("[data-more]");
    if (more) {
      more.textContent = "看全部 " + ch.photos.length + " 张";
      more.href = "all.html?c=" + sec.id;
    }
  });
  if (OV.hero) {
    const hs = document.querySelector(".hero-shot");
    if (hs) hs.src = "photos/web/" + OV.hero;
  }

  const totalEl = document.querySelector("[data-total]");
  if (totalEl) totalEl.textContent = SITE.order.reduce((n, k) => n + (SITE.chapters[k] ? SITE.chapters[k].photos.length : 0), 0);

  /* ── 全景带 ───────────────────────────────────────────────── */
  const panoBox = document.getElementById("panoList");
  if (panoBox) {
    const wide = [];
    Object.keys(SITE.chapters).forEach(slug => {
      SITE.chapters[slug].photos.forEach(p => {
        // 前三张是同一场景的重复全景，只留最宽那张；3122 那张已并入宽幅集另行处理
        if (p.w / p.h >= 2.2 && !/Pano-[24]\.jpg$/i.test(p.f)) wide.push({ slug, p, ar: p.w / p.h });
      });
    });
    wide.sort((a, b) => b.ar - a.ar);

    wide.forEach(item => {
      const { slug, p } = item;
      const el = document.createElement("div");
      el.className = "pano-item";
      el.dataset.index = light.length;
      el.innerHTML =
        `<img src="photos/wide/${encodeURIComponent(p.f)}" alt="全景照片" loading="lazy" decoding="async" ` +
        `onerror="this.onerror=null;this.src='photos/web/${slug}/${encodeURIComponent(p.f)}'">` +
        `<span class="pano-hint"><i>←</i>悬停横向浏览</span>` +
        `<div class="pano-meta"><b>${p.w} × ${p.h}</b><em>${SITE.chapters[slug].title} · ${item.ar.toFixed(2)}:1</em></div>`;
      panoBox.appendChild(el);

      light.push({ src: web(slug, p.f), slug, ...p });
    });
    const cnt = document.querySelector("[data-pano-count]");
    if (cnt) cnt.textContent = wide.length;

    // 全景带出现时收起左侧导航，避免压住照片
    const sec = document.getElementById("panorama");
    if (sec && "IntersectionObserver" in window) {
      new IntersectionObserver(es => {
        es.forEach(e => document.body.classList.toggle("pano-mode", e.isIntersecting));
      }, { threshold: .1 }).observe(sec);
    }
  }

  /* ── reveal ───────────────────────────────────────────────── */
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) {
    document.querySelectorAll(".ph").forEach(f => f.classList.add("in"));
  } else {
    const io = new IntersectionObserver(es => {
      es.forEach(e => {
        if (!e.isIntersecting) return;
        e.target.classList.add("in");
        io.unobserve(e.target);
      });
    }, { threshold: .08, rootMargin: "0px 0px -4% 0px" });
    document.querySelectorAll(".ph").forEach(f => io.observe(f));
  }

  /* ── 灯箱 ─────────────────────────────────────────────────── */
  const lb = document.getElementById("lb");
  if (!lb) return;
  const img = lb.querySelector("img");
  const capEl = lb.querySelector(".lb-cap");
  const cntEl = lb.querySelector(".lb-count");
  let at = -1;
  let pc = null;

  function show(i) {
    if (!light.length) return;
    at = (i + light.length) % light.length;
    const p = light[at];
    img.src = p.src;
    img.alt = [dateLine(p), exifLine(p)].filter(Boolean).join(" · ");
    const cap = [dateLine(p), exifLine(p)].filter(Boolean).join("   ");
    capEl.innerHTML = `<b>${cap || "未记录参数"}</b><span>${(SITE.chapters[p.slug] || {}).title || ""}${p.cam ? " · " + p.cam : ""}</span>`;
    cntEl.textContent = `${String(at + 1).padStart(2, "0")} / ${String(light.length).padStart(2, "0")}`;
    if (pc) pc.reload();
  }
  function open(i) {
    show(i);
    lb.dataset.open = "";
    lb.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }
  function close() {
    delete lb.dataset.open;
    lb.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  if (window.PhotoComments) {
    pc = PhotoComments.mount(lb, () => { const p = light[at]; return p ? p.slug + "/" + p.f : ""; });
  }

  document.querySelectorAll(".ph, .pano-item").forEach(el => {
    el.addEventListener("click", () => open(+el.dataset.index));
  });
  lb.addEventListener("click", e => {
    if (e.target.classList.contains("lb-close") || e.target === lb) close();
    else if (e.target.closest(".lb-prev")) show(at - 1);
    else if (e.target.closest(".lb-next")) show(at + 1);
  });
  addEventListener("keydown", e => {
    if (!("open" in lb.dataset)) return;
    if (e.key === "Escape") close();
    if (e.key === "ArrowLeft") show(at - 1);
    if (e.key === "ArrowRight") show(at + 1);
  }, { passive: true });

  let sx = null;
  lb.addEventListener("touchstart", e => { sx = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener("touchend", e => {
    if (sx === null) return;
    const dx = e.changedTouches[0].clientX - sx;
    if (Math.abs(dx) > 50) show(at + (dx < 0 ? 1 : -1));
    sx = null;
  }, { passive: true });
})();
