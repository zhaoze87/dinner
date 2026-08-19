# 开饭 · 多人点餐转盘

团长从后厨录入菜单，发起一轮点餐；所有团员实时收到消息，给喜欢的菜加权重，再全员参与随机。系统按权重抽一份今晚的菜。

## 规则

- 每人可投一道菜，给它叠加权重（默认每票 +20）
- 全员（含团长）点过「参与随机」后开抽；团长也可在有人未到时强抽
- **同一天不会抽中同一道菜两次**
- **最近抽中过的菜会掉权**，大约 7 天恢复到满额

权重大致为：`(基础权重 + 投票加成) × 时间衰减`

## 本地运行

需要 Node.js 18+。

```bash
npm install
npm run dev
```

本机打开 [http://127.0.0.1:4173](http://127.0.0.1:4173)。同一局域网用 `http://<电脑IP>:4173`。

- 前端：4173（Vite，开发时代理 `/api` 到后端）
- 后端：8787（Express）
- 数据：本地 `data/db.json`；生产/Vercel 需配置 Redis（见下）

## 怎么用

1. 团长报上称呼，开一桌，把邀请码发给团员
2. 团长在「我的菜单库」里维护个人菜单（首次开团自带家常菜），团员入座后自动共享
3. 点「发起点餐」，全员选一道心仪的菜
4. 团长点「开始随机点餐」，每个人再点「参与随机点餐」
5. 转盘按权重出菜

## 部署到 Vercel

Vercel 无持久磁盘、不支持 WebSocket，本项目已适配为 **REST API + 轮询同步**，数据存 **Upstash Redis**。

### 1. 准备 Redis

在 [Vercel Dashboard](https://vercel.com) → 项目 → **Storage** → 添加 **Upstash Redis**（或 [Upstash 控制台](https://console.upstash.com) 手动创建）。

绑定后会自动注入环境变量（任选一组即可）：

- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`
- 或 `KV_REST_API_URL` + `KV_REST_API_TOKEN`

### 2. 部署

```bash
npm i -g vercel
vercel
```

或在 GitHub 关联仓库后，Vercel 会自动构建部署。

构建命令：`npm run build`（见 `vercel.json`）

### 3. 验证

部署完成后访问 `https://你的域名.vercel.app`，打开 `/api/health` 应返回：

```json
{ "ok": true, "name": "开饭", "storage": "redis" }
```

若 `storage` 为 `file`，说明 Redis 环境变量未生效，生产环境数据不会持久化。

### 架构说明

| 组件 | 本地 | Vercel |
|---|---|---|
| 前端 | Vite dev server | 静态 `dist/` |
| API | `server/index.js` | `api/index.js` Serverless |
| 实时同步 | 2 秒轮询 `/api/groups/:code/sync` | 同上 |
| 数据 | `data/db.json` | Upstash Redis |
