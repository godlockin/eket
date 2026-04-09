# EKET 文档站

基于 Docusaurus v3.10.0 构建的 EKET Framework 官方文档站点。

## 快速开始

```bash
# 安装依赖
npm install

# 本地开发
npm start

# 构建生产版本
npm run build

# 本地预览构建结果
npm run serve
```

## 目录结构

```
docs-site/
├── docs/                    # 文档内容
│   ├── intro.md
│   ├── quickstart.md
│   ├── architecture.md
│   ├── master-slaver.md
│   ├── cli-reference.md
│   └── configuration.md
├── src/
│   ├── css/
│   │   └── custom.css
│   └── pages/
│       └── index.tsx
├── docusaurus.config.ts
├── sidebars.ts
└── package.json
```

## 部署

文档站部署到 GitHub Pages：

```bash
npm run deploy
```

访问：https://godlockin.github.io/eket/

## License

MIT
