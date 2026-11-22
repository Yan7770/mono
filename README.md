# MONO · 私人财富管理

一个纯前端、离线可用的个人财富管理应用。查看净资产、资产配置、财富目标，记录收支与账户变更。

界面以 **iPhone 的 iOS Safari** 为首要使用环境设计，优先考虑单手触控、屏幕安全区（safe-area）与软键盘行为。

## 特点

- **零后端**：所有数据保存在浏览器 `localStorage`，不上传服务器
- **零构建**：原生 HTML / CSS / JavaScript，没有打包步骤，改完即生效
- **零外部依赖**：不引用任何 CDN，图标为内联 SVG，可直接离线运行
- **深色优先**：默认深色主题，支持切换与隐藏金额
- **本地备份**：支持导出 / 恢复 JSON 备份文件

## 本地预览

`dist/` 就是可直接发布的站点根目录。用任意静态服务器打开：

```bash
cd dist
python -m http.server 8080
```

然后访问 <http://localhost:8080>。

> 直接双击 `index.html` 用 `file://` 打开也能运行，但建议用本地服务器，避免个别浏览器对 `localStorage` 的 `file://` 限制。

## 目录结构

```
dist/
├── index.html            页面骨架与导航
├── theme.js              主题与隐私模式初始化（阻塞在 head，避免闪烁）
├── app.js                图标、导航、总览渲染
├── panels.js             面板 / 弹窗交互
├── trend.js              趋势图渲染
├── backup.js             备份与恢复
├── backup-store.js       备份数据结构
├── style.css             基础样式、布局、设计变量
├── panels.css            面板样式
├── dock.css              底部导航
├── batch.css             批量操作
├── backup.css            备份界面
├── changes.css           变更记录
├── interactions.css      交互细节
├── mono.svg              应用图标
├── apple-touch-icon.png  iOS 主屏图标
└── terrain.svg           背景地形图
```

## 部署

推送到 `main` 分支即自动发布到 GitHub Pages（见 `.github/workflows/deploy.yml`），发布内容为 `dist/` 目录。
