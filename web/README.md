# web/ — EKET Dashboard 静态资源

本目录为 Node.js dashboard server 的静态文件根目录。

## 依赖关系

`node/src/api/web-server.ts` 在启动时将此目录挂载为静态资源路径：

```typescript
// web-server.ts:63
staticPath: config.staticPath || path.resolve(__dirname, '../../../web'),
```

启动命令：

```bash
cd node && npm run dashboard
# 访问 http://localhost:<port>/
```

## 文件说明

| 文件 | 职责 |
|------|------|
| `index.html` | Dashboard 主页面（EKET Monitor） |
| `styles.css` | Dashboard 样式 |
| `app.js` | Dashboard 前端逻辑（WebSocket/SSE 连接） |

> ⚠️ 此目录不是独立旧版本，不可归档。Node server 运行时必须存在。
