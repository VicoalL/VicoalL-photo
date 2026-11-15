# VicoalL — 作品展示站

Shopify Editions 那套框架做底（章节换色 / 链条运镜 / 标题描边填充），加上照片墙、灯箱、无极画布和延时视频。

```
index.html      首页：Hero（延时视频）/ 五个专题 / 联系
plane.html      无极：全部照片铺成一张大画布，拖动浏览
timelapse.html  （已下线，未在导航里；文件留着备用）
all.html        某个专题的全部照片：all.html?c=field|campus|uni|scene|sport|composites
photos.js       照片数据（自动生成，别手改）
gallery.js      照片墙 + 灯箱 + Hero 视频
photos/         web/（长边 2000px，灯箱用）+ thumb/（900px，网格用）
media/          延时视频 / 海报 / 六帧
build/          生成脚本
```

## 现在的内容

| 专题 | 底数 | 精选 | 来源文件夹 |
|---|---|---|---|
| 01 田野 Fieldwork | 134 | 12 | 三下乡 |
| 02 校园 Campus | 276 | 16 | 高中时期乱七八糟 + 高二高三 + 国旗队 |
| 03 大学 University | 642 | 12 | 大学picture |
| 04 风景 Landscape | 76 | 14 | 怀化大峡谷（星空打头）+ 拾贝公园 + 处女照 |
| 05 赛场 Sport | 17 | 10 | 高中运动会 |
| 合成 Composites | 19 | — | uuid 命名的二次创作，单独一页 |

合计 **1145 张**，首页 64 张精选。站体 602MB（web 437 + thumb 103 + media 56），2481 个文件。
原图（`D:\成品\照片`，约 8GB）一个字节没动。

## 星空排序

`build/stars.txt` 列出星空照片的文件名，`build-data.ps1` 给它们 `rank: 0`，排序时 `Sort-Object rank, date, f` 就排到风景章最前面。
（注意：峡谷的 230–234 才是星空，224–228 是营地帐篷，别搞混。）

## 延时视频

源：`D:\成品\照片\yanshi png\yanshi001–363.jpg`，5568×3712，24fps → 15.1 秒。

```powershell
# 正放
ffmpeg -framerate 24 -i yanshi%03d.jpg -vf "scale=1200:-2,hqdn3d=2:1.5:3:3" -c:v libx264 -crf 26 -preset slow _fwd.mp4
# 倒放
ffmpeg -i _fwd.mp4 -vf reverse -c:v libx264 -crf 26 -preset slow _rev.mp4
# 拼成无缝循环 30.2 秒
ffmpeg -f concat -i list.txt -c copy timelapse-loop.mp4
```

正放 + 倒放是为了消掉"天黑后突然跳回天亮"的闪。产物在 `media/`：`timelapse-loop.mp4`（11.9MB）、`timelapse-poster.jpg`、`frame00–300.jpg`。

## 重新生成

```powershell
.\build\make-picks.ps1   -Root "D:\成品\照片" -Out ".\_picks.json"          # 生成精选
.\build\resize.ps1       -Root "D:\成品\照片" -OutDir ".\photos" -MapJson ".\build\map.json" -SkipDirs "yanshi png","COS"
.\build\build-data.ps1   -Manifest ".\photos\manifest.json" -PicksJson ".\_picks.json" `
                         -ExcludeList ".\build\exclude.txt" -StarsList ".\build\stars.txt" -Out ".\photos.js"
.\build\assemble-site.ps1
```

`resize.ps1` 会跳过已存在的文件，增量很快；同名文件自动加 `-2` 后缀，不会互相覆盖。

## 待办

- **COS 章节**：文件夹目前是空的，等放图后加第 6 章（需要同时调框架的 5 个 cluster）
- **大学里的非实拍**：`赛博朋克2077`、`异环`、`孤独摇滚`、`gbc`、`素材`、`素材美图`、`海南映像素材图片`、`视频封面` 共约 145 个，目前**保留**在 `all.html?c=uni` 里，等确认后可从 `build/exclude.txt` 排除
- Instagram / 小红书 / 微信的具体昵称

## 讨论区 / 账号（server.js）

站点已从"纯静态"升级成 **Node 单进程**（零依赖，不需要 npm install）：

```powershell
node server.js          # 默认 8080
```

- 静态文件 + `data/` 目录（已禁止直接下载）
- 账号：手机号或昵称 + 密码，`scrypt` 加盐哈希，会话存 `data/db.json`
- 接口：`/api/me` `/api/register` `/api/login` `/api/logout` `/api/posts` `/api/posts/:id/reply` `/api/posts/:id/like`
- 页面：`community.html`（讨论区 + 灵感墙两个标签页）

数据全在 `data/db.json`，删掉即清空。

**未接入 微信 / QQ 登录**：需要企业资质 + 已备案域名 + 微信开放平台应用（或 QQ 互联审核），见对话里的说明。