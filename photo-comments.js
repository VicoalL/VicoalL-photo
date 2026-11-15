/* 灯箱里的单张照片评论面板
   用法：PhotoComments.mount(document.getElementById('lb'), () => 'scene/xxx.jpg');
   面板会自动插到灯箱里，跟着当前照片切换。 */
(() => {
  "use strict";
  if (window.PhotoComments) return;

  const css = `
  .pc{margin-top:14px;border-top:1px solid rgb(255 255 255 / .14);padding-top:12px;
      max-height:32vh;display:flex;flex-direction:column;gap:10px;font-family:var(--mono,monospace)}
  .pc-list{overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding-right:4px}
  .pc-list::-webkit-scrollbar{width:6px}
  .pc-list::-webkit-scrollbar-thumb{background:rgb(255 255 255 / .2);border-radius:3px}
  .pc-item{font-size:11.5px;line-height:1.65;color:rgb(255 255 255 / .82);
           font-family:var(--sans,system-ui);display:flex;gap:8px}
  .pc-item b{font-family:var(--mono,monospace);font-size:9.5px;font-weight:400;
             color:rgb(255 255 255 / .5);white-space:nowrap;padding-top:2px}
  .pc-empty{font-size:10.5px;color:rgb(255 255 255 / .38);letter-spacing:.04em}
  .pc-form{display:flex;gap:8px;align-items:center}
  .pc-form input{flex:1;min-width:0;padding:9px 11px;border-radius:8px;font-size:12.5px;
                 background:rgba(0,0,0,.5);border:1px solid rgb(255 255 255 / .18);
                 color:#fff;outline:none;font-family:var(--sans,system-ui)}
  .pc-form input:focus{border-color:rgb(255 255 255 / .5)}
  .pc-form button{cursor:pointer;padding:9px 14px;border-radius:8px;border:1px solid #fff;
                  background:#fff;color:#08080b;font-size:10.5px;letter-spacing:.06em;
                  font-family:var(--mono,monospace);white-space:nowrap}
  .pc-form button:disabled{opacity:.4;cursor:not-allowed}
  .pc-msg{font-size:10px;color:#ff9b9b;min-height:12px}
  `;

  function style() {
    if (document.getElementById("pc-style")) return;
    const s = document.createElement("style");
    s.id = "pc-style";
    s.textContent = css;
    document.head.appendChild(s);
  }

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function mount(lb, getKey) {
    if (!lb) return null;
    style();
    let box = lb.querySelector(".pc");
    if (!box) {
      box = document.createElement("div");
      box.className = "pc";
      box.innerHTML = `
        <div class="pc-list"><div class="pc-empty">还没有评论</div></div>
        <div class="pc-form">
          <input placeholder="对这张照片说点什么…" maxlength="500">
          <button type="button">发送</button>
        </div>
        <div class="pc-msg"></div>`;
      // 插到灯箱图片容器之后（或灯箱末尾）
      lb.appendChild(box);
    }
    const listEl = box.querySelector(".pc-list");
    const input = box.querySelector("input");
    const btn = box.querySelector("button");
    const msg = box.querySelector(".pc-msg");
    let user = null;

    async function load() {
      const key = getKey();
      if (!key) return;
      try {
        const r = await fetch("/api/photo-comments?key=" + encodeURIComponent(key), { credentials: "same-origin", cache: "no-store" });
        const j = await r.json();
        user = j.user;
        const cs = j.comments || [];
        listEl.innerHTML = cs.length
          ? cs.map(c => `<div class="pc-item"><b>${esc(c.nick)}</b><span>${esc(c.body)}</span></div>`).join("")
          : `<div class="pc-empty">还没有评论</div>`;
        input.disabled = !user;
        btn.disabled = !user;
        if (!user) input.placeholder = "登录后才能评论（去「留言」页登录）";
      } catch (e) {
        listEl.innerHTML = `<div class="pc-empty">评论加载失败</div>`;
      }
    }

    btn.addEventListener("click", async () => {
      const body = input.value.trim();
      const key = getKey();
      if (!body || !key) return;
      msg.textContent = "";
      try {
        const r = await fetch("/api/photo-comments", {
          method: "POST", credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, body })
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "发送失败");
        input.value = "";
        load();
      } catch (e) { msg.textContent = e.message; }
    });
    input.addEventListener("keydown", e => { if (e.key === "Enter") btn.click(); });

    load();
    return { reload: load };
  }

  window.PhotoComments = { mount };
})();
