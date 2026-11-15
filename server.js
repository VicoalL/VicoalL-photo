/**
 * VicoalL 社区后端 —— 零依赖 Node 服务
 *   静态站点 + 账号（手机号/昵称 + 密码）+ 讨论区 + 灵感墙
 * 数据：data/db.json（首次启动自动创建）
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const PORT = Number(process.env.PORT || 8080);

/* ── 存储 ─────────────────────────────────────────────── */
function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: [], posts: [], sessions: {}, seq: { post: 0, reply: 0 } }, null, 2));
  }
}
let db = null;
function load() { ensureDb(); db = JSON.parse(fs.readFileSync(DB_FILE, "utf8")); }
let DBTimer = null;
function save() {
  if (DBTimer) return;
  DBTimer = setTimeout(() => {
    DBTimer = null;
    try { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); } catch (e) { console.error("save fail", e); }
  }, 200);
}

/* ── 密码 ─────────────────────────────────────────────── */
function hash(pass, salt) {
  return crypto.scryptSync(pass, salt, 32).toString("hex");
}
function makeUser(account, nick, pass) {
  const salt = crypto.randomBytes(12).toString("hex");
  return { id: crypto.randomBytes(8).toString("hex"), account, nick, salt, pw: hash(pass, salt), at: Date.now() };
}
function verify(user, pass) {
  return crypto.timingSafeEqual(Buffer.from(hash(pass, user.salt), "hex"), Buffer.from(user.pw, "hex"));
}

/* ── 会话 ─────────────────────────────────────────────── */
function newToken(userId) {
  const t = crypto.randomBytes(24).toString("hex");
  db.sessions[t] = { uid: userId, at: Date.now() };
  save();
  return t;
}
function userFrom(req) {
  const m = /(?:^|;)\s*vc=([a-f0-9]{48})/.exec(req.headers.cookie || "");
  if (!m) return null;
  const s = db.sessions[m[1]];
  if (!s) return null;
  const u = db.users.find(x => x.id === s.uid);
  return u ? { id: u.id, nick: u.nick, account: u.account, token: m[1] } : null;
}

/* ── 工具 ─────────────────────────────────────────────── */
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".webp": "image/webp", ".svg": "image/svg+xml", ".mp4": "video/mp4", ".ico": "image/x-icon"
};
function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", c => {
      size += c.length;
      if (size > 200 * 1024) { reject(new Error("too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      try { resolve(Buffer.concat(chunks).toString("utf8")); } catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}
const clean = s => String(s == null ? "" : s).replace(/[\u0000-\u001f]/g, "").trim();

/* ── API ──────────────────────────────────────────────── */
async function api(req, res, url) {
  const p = url.pathname;
  const me = userFrom(req);

  if (p === "/api/me") return sendJSON(res, 200, { user: me ? { id: me.id, nick: me.nick } : null });

  if (p === "/api/register" && req.method === "POST") {
    let d; try { d = JSON.parse(await readBody(req)); } catch { return sendJSON(res, 400, { error: "请求格式错误" }); }
    const account = clean(d.account), nick = clean(d.nick) || account, pass = String(d.pass || "");
    if (!/^1\d{10}$/.test(account) && account.length < 3) return sendJSON(res, 400, { error: "账号请用 11 位手机号，或至少 3 位昵称" });
    if (pass.length < 6) return sendJSON(res, 400, { error: "密码至少 6 位" });
    if (db.users.some(u => u.account === account)) return sendJSON(res, 409, { error: "这个账号已经注册过了" });
    const u = makeUser(account, nick.slice(0, 20), pass);
    db.users.push(u); save();
    const t = newToken(u.id);
    res.setHeader("Set-Cookie", `vc=${t}; Path=/; SameSite=Lax; Max-Age=2592000`);
    return sendJSON(res, 200, { user: { id: u.id, nick: u.nick } });
  }

  if (p === "/api/login" && req.method === "POST") {
    let d; try { d = JSON.parse(await readBody(req)); } catch { return sendJSON(res, 400, { error: "请求格式错误" }); }
    const account = clean(d.account), pass = String(d.pass || "");
    const u = db.users.find(x => x.account === account);
    if (!u || !verify(u, pass)) return sendJSON(res, 401, { error: "账号或密码不对" });
    const t = newToken(u.id);
    res.setHeader("Set-Cookie", `vc=${t}; Path=/; SameSite=Lax; Max-Age=2592000`);
    return sendJSON(res, 200, { user: { id: u.id, nick: u.nick } });
  }

  if (p === "/api/logout" && req.method === "POST") {
    if (me) { delete db.sessions[me.token]; save(); }
    res.setHeader("Set-Cookie", "vc=; Path=/; Max-Age=0");
    return sendJSON(res, 200, { ok: true });
  }

  /* ── 用户投稿照片 ────────────────────────────────────── */
  if (p === "/api/uploads" && req.method === "GET") {
    const wantAll = url.searchParams.get("all") === "1" && adminUser(req);
    const list = (db.uploads || [])
      .filter(u => wantAll || u.status !== "pending")
      .slice().reverse();
    return sendJSON(res, 200, { uploads: list, user: me ? { id: me.id, nick: me.nick } : null, admin: !!adminUser(req) });
  }
  if (p === "/api/uploads" && req.method === "POST") {
    if (!me) return sendJSON(res, 401, { error: "登录后才能投稿" });
    let d; try { d = JSON.parse(await readBody(req)); } catch { return sendJSON(res, 400, { error: "格式错误" }); }
    const data = String(d.data || "");
    const m = /^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/i.exec(data);
    if (!m) return sendJSON(res, 400, { error: "只支持 JPG / PNG / WebP" });
    const buf = Buffer.from(m[2], "base64");
    if (buf.length > 4 * 1024 * 1024) return sendJSON(res, 413, { error: "图片太大（上限 4MB）" });
    const dir = path.join(ROOT, "photos", "uploads");
    fs.mkdirSync(dir, { recursive: true });
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const ext = m[1].toLowerCase() === "png" ? "png" : (m[1].toLowerCase() === "webp" ? "webp" : "jpg");
    fs.writeFileSync(path.join(dir, id + "." + ext), buf);
    db.uploads = db.uploads || [];
    db.uploads.push({
      id, file: "uploads/" + id + "." + ext, uid: me.id, nick: me.nick,
      title: clean(d.title).slice(0, 60), at: Date.now(), status: "pending"
    });
    save();
    return sendJSON(res, 200, { ok: true, id });
  }
  /* ── 单张照片的评论 ─────────────────────────────────── */
  if (p === "/api/photo-comments" && req.method === "GET") {
    const key = clean(url.searchParams.get("key") || "");
    const all = (db.photoComments || {})[key] || [];
    return sendJSON(res, 200, { comments: all, user: me ? { id: me.id, nick: me.nick } : null });
  }
  if (p === "/api/photo-comments" && req.method === "POST") {
    if (!me) return sendJSON(res, 401, { error: "先登录再评论" });
    let d; try { d = JSON.parse(await readBody(req)); } catch { return sendJSON(res, 400, { error: "格式错误" }); }
    const key = clean(d.key).slice(0, 160);
    const body = clean(d.body).slice(0, 500);
    if (!key) return sendJSON(res, 400, { error: "缺少照片标识" });
    if (body.length < 1) return sendJSON(res, 400, { error: "写点什么" });
    db.photoComments = db.photoComments || {};
    const arr = db.photoComments[key] || (db.photoComments[key] = []);
    arr.push({ id: "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), uid: me.id, nick: me.nick, body, at: Date.now() });
    save();
    return sendJSON(res, 200, { ok: true, comments: arr });
  }
  if (p === "/api/posts" && req.method === "GET") {
    const topic = url.searchParams.get("topic") || "board";
    const list = db.posts
      .filter(x => x.topic === topic)
      .sort((a, b) => b.at - a.at)
      .map(x => ({
        id: x.id, topic: x.topic, title: x.title, body: x.body,
        nick: x.nick, uid: x.uid, at: x.at, likes: Object.keys(x.likes || {}).length,
        liked: me ? !!(x.likes || {})[me.id] : false,
        replies: (x.replies || []).map(r => ({ id: r.id, nick: r.nick, body: r.body, at: r.at }))
      }));
    return sendJSON(res, 200, { posts: list, user: me ? { id: me.id, nick: me.nick } : null });
  }

  if (p === "/api/posts" && req.method === "POST") {
    if (!me) return sendJSON(res, 401, { error: "先登录再发" });
    let d; try { d = JSON.parse(await readBody(req)); } catch { return sendJSON(res, 400, { error: "请求格式错误" }); }
    const topic = d.topic === "idea" ? "idea" : "board";
    const title = clean(d.title).slice(0, 80);
    const body = clean(d.body).slice(0, 2000);
    if (body.length < 2) return sendJSON(res, 400, { error: "内容太短了" });
    if (topic === "board" && title.length < 2) return sendJSON(res, 400, { error: "给帖子起个标题" });
    const post = {
      id: "p" + (++db.seq.post), topic, title: title || body.slice(0, 24),
      body, uid: me.id, nick: me.nick, at: Date.now(), likes: {}, replies: []
    };
    db.posts.push(post); save();
    return sendJSON(res, 200, { ok: true, id: post.id });
  }

  let m = /^\/api\/posts\/([^/]+)\/reply$/.exec(p);
  if (m && req.method === "POST") {
    if (!me) return sendJSON(res, 401, { error: "先登录再回" });
    const post = db.posts.find(x => x.id === m[1]);
    if (!post) return sendJSON(res, 404, { error: "帖子不存在" });
    let d; try { d = JSON.parse(await readBody(req)); } catch { return sendJSON(res, 400, { error: "请求格式错误" }); }
    const body = clean(d.body).slice(0, 1000);
    if (body.length < 1) return sendJSON(res, 400, { error: "写点什么" });
    post.replies.push({ id: "r" + (++db.seq.reply), uid: me.id, nick: me.nick, body, at: Date.now() });
    save();
    return sendJSON(res, 200, { ok: true });
  }

  m = /^\/api\/posts\/([^/]+)\/like$/.exec(p);
  if (m && req.method === "POST") {
    if (!me) return sendJSON(res, 401, { error: "先登录再点赞" });
    const post = db.posts.find(x => x.id === m[1]);
    if (!post) return sendJSON(res, 404, { error: "帖子不存在" });
    post.likes = post.likes || {};
    if (post.likes[me.id]) delete post.likes[me.id]; else post.likes[me.id] = 1;
    save();
    return sendJSON(res, 200, { ok: true, liked: !!post.likes[me.id], likes: Object.keys(post.likes).length });
  }

  return sendJSON(res, 404, { error: "no such api" });
}

/* ── 后台：管理员 + 覆盖配置 ───────────────────────────── */
const OVERRIDES_FILE = path.join(DATA_DIR, "overrides.json");
const EMPTY_OVERRIDES = { hidden: [], order: {}, picks: {}, captions: {}, chapters: {}, hero: "" };

function loadOverrides() {
  try {
    if (!fs.existsSync(OVERRIDES_FILE)) return JSON.parse(JSON.stringify(EMPTY_OVERRIDES));
    const o = JSON.parse(fs.readFileSync(OVERRIDES_FILE, "utf8"));
    return Object.assign(JSON.parse(JSON.stringify(EMPTY_OVERRIDES)), o);
  } catch { return JSON.parse(JSON.stringify(EMPTY_OVERRIDES)); }
}
function saveOverrides(o) {
  fs.writeFileSync(OVERRIDES_FILE, JSON.stringify(o, null, 2));
}
function adminUser(req) {
  const m = /(?:^|;)\s*va=([a-f0-9]{48})/.exec(req.headers.cookie || "");
  if (!m) return null;
  const s = (db.adminSessions || {})[m[1]];
  return s ? { token: m[1] } : null;
}
function ensureAdmin() {
  if (!db.admin) {
    const salt = crypto.randomBytes(12).toString("hex");
    const pass = process.env.ADMIN_PASS || "vicoall-admin";
    db.admin = { salt, pw: hash(pass, salt), at: Date.now() };
    db.adminSessions = {};
    save();
    console.log("初始管理员密码：" + pass + "（可用 ADMIN_PASS 环境变量指定）");
  }
  if (!db.adminSessions) db.adminSessions = {};
}

async function adminApi(req, res, url) {
  const p = url.pathname;
  const ok = adminUser(req);

  if (p === "/api/overrides" && req.method === "GET") {
    return sendJSON(res, 200, loadOverrides());
  }

  if (p === "/api/admin/session") return sendJSON(res, 200, { admin: !!ok });

  if (p === "/api/admin/login" && req.method === "POST") {
    let d; try { d = JSON.parse(await readBody(req)); } catch { return sendJSON(res, 400, { error: "格式错误" }); }
    const pass = String(d.pass || "");
    const a = db.admin;
    const good = a && crypto.timingSafeEqual(Buffer.from(hash(pass, a.salt), "hex"), Buffer.from(a.pw, "hex"));
    if (!good) return sendJSON(res, 401, { error: "密码不对" });
    const t = crypto.randomBytes(24).toString("hex");
    db.adminSessions[t] = { at: Date.now() };
    save();
    res.setHeader("Set-Cookie", `va=${t}; Path=/; SameSite=Lax; Max-Age=43200`);
    return sendJSON(res, 200, { ok: true });
  }

  if (p === "/api/admin/logout" && req.method === "POST") {
    if (ok) { delete db.adminSessions[ok.token]; save(); }
    res.setHeader("Set-Cookie", "va=; Path=/; Max-Age=0");
    return sendJSON(res, 200, { ok: true });
  }

  if (p === "/api/admin/pass" && req.method === "POST") {
    if (!ok) return sendJSON(res, 401, { error: "请先登录" });
    let d; try { d = JSON.parse(await readBody(req)); } catch { return sendJSON(res, 400, { error: "格式错误" }); }
    const pass = String(d.pass || "");
    if (pass.length < 6) return sendJSON(res, 400, { error: "新密码至少 6 位" });
    const salt = crypto.randomBytes(12).toString("hex");
    db.admin = { salt, pw: hash(pass, salt), at: Date.now() };
    save();
    return sendJSON(res, 200, { ok: true });
  }

  if (p === "/api/admin/overrides" && req.method === "POST") {
    if (!ok) return sendJSON(res, 401, { error: "请先登录" });
    let d; try { d = JSON.parse(await readBody(req)); } catch { return sendJSON(res, 400, { error: "格式错误" }); }
    saveOverrides(Object.assign(JSON.parse(JSON.stringify(EMPTY_OVERRIDES)), d));
    return sendJSON(res, 200, { ok: true });
  }

  if (p === "/api/admin/upload" && req.method === "POST") {
    if (!ok) return sendJSON(res, 401, { error: "请先登录" });
    let d; try { d = JSON.parse(await readBody(req)); } catch { return sendJSON(res, 400, { error: "格式错误" }); }
    const id = clean(d.id), act = clean(d.action);
    const arr = db.uploads || [];
    const i = arr.findIndex(u => u.id === id);
    if (i < 0) return sendJSON(res, 404, { error: "找不到这条投稿" });
    if (act === "approve") arr[i].status = "ok";
    else if (act === "reject") { try { fs.unlinkSync(path.join(ROOT, "photos", arr[i].file)); } catch {} arr.splice(i, 1); }
    else return sendJSON(res, 400, { error: "未知操作" });
    save();
    return sendJSON(res, 200, { ok: true });
  }

  if (p === "/api/admin/trash" && req.method === "POST") {
    if (!ok) return sendJSON(res, 401, { error: "请先登录" });
    let d; try { d = JSON.parse(await readBody(req)); } catch { return sendJSON(res, 400, { error: "格式错误" }); }
    const slug = clean(d.slug), file = clean(d.file);
    if (!/^[a-z]+$/.test(slug) || !file) return sendJSON(res, 400, { error: "参数不对" });
    const trash = path.join(ROOT, "photos", "_trash");
    fs.mkdirSync(trash, { recursive: true });
    let moved = 0;
    for (const kind of ["web", "thumb"]) {
      const from = path.join(ROOT, "photos", kind, slug, file);
      if (fs.existsSync(from)) {
        fs.renameSync(from, path.join(trash, kind + "-" + slug + "-" + file));
        moved++;
      }
    }
    return sendJSON(res, 200, { ok: true, moved });
  }

  return sendJSON(res, 404, { error: "no such admin api" });
}
/* ── 静态 ─────────────────────────────────────────────── */
function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === "/") rel = "/index.html";
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end("forbidden"); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end("not found"); }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Content-Length": st.size,
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=604800"
    });
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://" + (req.headers.host || "localhost"));
  if (url.pathname.startsWith("/api/admin/") || url.pathname === "/api/overrides") {
    adminApi(req, res, url).catch(e => { console.error(e); try { sendJSON(res, 500, { error: "服务器错误" }); } catch {} });
    return;
  }
  if (url.pathname.startsWith("/api/")) {
    api(req, res, url).catch(e => { console.error(e); try { sendJSON(res, 500, { error: "服务器错误" }); } catch {} });
    return;
  }
  // data/ 不许直接下载
  if (url.pathname.startsWith("/data/")) { res.writeHead(403); return res.end("forbidden"); }
  serveStatic(req, res, url);
});

load(); ensureAdmin();
server.listen(PORT, "0.0.0.0", () => {
  console.log("VicoalL server on http://0.0.0.0:" + PORT);
  console.log("root:", ROOT);
});
