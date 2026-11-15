# 部署指南

站点不是纯静态：账号、讨论区、照片评论、投稿都需要 `server.js` 这个 Node 后端。
所以不能用 GitHub Pages / Netlify 静态托管，必须找能跑 Node 的平台。

已准备好的文件：

| 文件 | 作用 |
|---|---|
| `package.json` | `npm start` → `node server.js`，Node ≥ 18 |
| `Dockerfile` | 任意支持 Docker 的平台可直接构建 |
| `.gitignore` | 排除 `data/*.json`（用户数据）、`photos/_trash`、日志 |

站点体积 **681MB**，其中 95% 是 `photos/`（web 2000px + thumb 900px）。
上传前建议先压缩到 400MB 左右（web 1600 / thumb 720），否则推 Git 会很慢。

---

## 方案 A：Railway（最省事，推荐）

1. 把整个 `portfolio-vicoall` 推到 GitHub 一个私有仓库
2. railway.app 用 GitHub 登录 → New Project → Deploy from GitHub repo
3. 环境变量加一条：`ADMIN_PASS=你的强密码`
4. 部署完会给一个 `xxx.up.railway.app` 域名，HTTPS 自动
5. Settings → Domains → 添加你自己的域名，按提示去域名商加 CNAME

费用：前 500 小时试用，之后约 $5/月。

## 方案 B：Render

1. 同样推 GitHub
2. render.com → New → Web Service → 选仓库
3. Build Command 留空，Start Command 填 `node server.js`
4. 免费档会在 15 分钟无访问后休眠，首次打开要等 30 秒

## 方案 C：自己的 VPS（阿里云/腾讯云轻量）

1. 买一台 2核2G 轻量应用服务器（约 ¥60–100/年，学生机更便宜）
2. 装 Node ≥ 18，`git clone` 或 `scp` 上传
3. `npm start` 先用前台跑通，再用 `pm2` 守护：`pm2 start server.js --name vicoall`
4. 装 Caddy 或 Nginx 反代到 8080，自动签 HTTPS
5. **域名解析到国内服务器必须做 ICP 备案**，否则 80/443 会被拦

---

## 关于域名

| 事 | 谁做 | 说明 |
|---|---|---|
| 注册域名 | 你 | 阿里云/腾讯云/Cloudflare，`.com` 约 ¥60–90/年，`.top`/`.xyz` 更便宜 |
| 实名认证 | 你 | 国内注册商要求身份证，1–2 天通过 |
| 解析记录 | 你（我可给值） | 平台会告诉你 CNAME 或 A 记录指向 |
| ICP 备案 | 你 | 只有解析到**中国大陆服务器**才需要，2–4 周；用 Railway/Render 香港/海外节点**不需要** |

**结论**：想快就用 Railway + 自己的域名，不需要备案，半天能上线。

---

## 数据会丢吗

现在用户数据存在 `data/db.json`。新服务器上是全新的空库，旧数据要手动拷上去：

```powershell
# 本地导出
Copy-Item "D:\AAA dsh\portfolio-vicoall\data\db.json" .\db-backup.json
```

上传到服务器后放回 `data/db.json` 再启动即可。

**注意**：多数免费平台的文件系统是临时的，重启会清空 `db.json`。
长期用必须换持久化存储（Railway 加一个 Volume，或者接 Supabase/Postgres）。
