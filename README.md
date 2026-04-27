# A股实时监测驾驶舱

这是一个可上线部署的 React + Vite + Node 版本。前端负责 Apple 风格的简约科技 UI、K 线/分时切换、自选股、风险偏好策略与每日复盘；Node 服务负责托管静态网页，并代理东方财富行情接口，避免正式上线后只依赖本地 Vite 开发服务。

## 本地运行

```bash
npm install
npm run dev
```

## 生产模式验证

```bash
npm run build
npm start
```

默认访问地址是 `http://127.0.0.1:4179`。健康检查地址是 `/api/health`。

## 部署到 Render

1. 把项目推送到 GitHub、GitLab 或 Bitbucket。
2. 在 Render 创建 Blueprint，选择这个仓库。
3. Render 会读取 `render.yaml`，自动执行 `npm ci && npm run build`，并用 `npm start` 启动服务。
4. 部署完成后，访问 Render 给出的公网域名即可在其他电脑和手机上使用。

## 部署到 Vercel

Render 如果要求绑定银行卡，可以改用 Vercel 的 Hobby 方案。项目已经包含 `vercel.json` 和 `/api` serverless 行情代理。

1. 打开 Vercel 导入页。
2. 选择 GitHub 仓库 `wz13678330639-oss/a-share-monitor`。
3. Framework Preset 选择 Vite。
4. Build Command 使用 `npm run build`。
5. Output Directory 使用 `dist`。
6. 部署完成后，用 Vercel 给出的公网域名访问。

## Docker 部署

```bash
docker build -t a-share-monitor .
docker run -p 4179:4179 a-share-monitor
```

## 行情数据说明

当前实时行情桥接使用东方财富公开接口，适合产品原型、研究看板和策略展示。若要用于真实交易、商业分发或高可靠实时交易，需要接入有授权的证券行情服务，并按数据商要求处理延迟、频率限制、授权和风控。
