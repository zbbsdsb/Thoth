# Thoth 移动端开发第一阶段：PWA 实现计划

## 1. 目标
将 Thoth 转换为 **Progressive Web App (PWA)**，使用户能够在 Android 和 iOS 设备上将其“安装”到主屏幕，获得接近原生应用的使用体验，而无需通过应用商店。

## 2. 核心任务清单

### A. 基础配置文件
- [ ] **创建 `public/manifest.json`**：定义应用的名称、图标、启动颜色和显示模式。
- [ ] **创建 `public/sw.js` (Service Worker)**：实现基础的离线缓存逻辑，确保在网络不佳时应用仍能加载框架。

### B. HTML 头部集成 (`index.html`)
- [ ] **添加 PWA 关联标签**：链接 `manifest.json`。
- [ ] **iOS 专项优化**：
    - 添加 `apple-mobile-web-app-capable` 标签。
    - 设置 `apple-mobile-web-app-status-bar-style`（建议设为 `black-translucent` 以匹配 Thoth 的深色调）。
    - 定义 `apple-touch-icon`。

### C. 视觉与品牌化
- [ ] **图标准备**：
    - 准备 192x192 和 512x512 尺寸的图标。
    - 确保图标在 Android 的圆形/方形遮罩下显示正常（Maskable Icon）。
- [ ] **主题色配置**：设置 `theme_color` 为 `#09090b` (Zinc-950)，确保手机状态栏与应用背景融为一体。

### D. 交互增强
- [ ] **安装提示逻辑**：在 UI 中添加一个优雅的提示，引导用户“添加到主屏幕”。
- [ ] **禁止弹性滚动**：在移动端 CSS 中优化滚动行为，防止出现浏览器特有的拉伸回弹效果，增强应用感。

## 3. 技术细节

### Manifest 配置预览
```json
{
  "name": "Thoth - 梦境图书馆",
  "short_name": "Thoth",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#09090b",
  "theme_color": "#09090b",
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

## 4. 预期效果
- **全屏运行**：隐藏浏览器地址栏和底部工具栏。
- **独立任务栏**：在手机多任务切换界面，Thoth 将作为一个独立应用显示。
- **快速启动**：利用缓存机制缩短二次启动时间。

---
**状态：待执行**
**负责人：AIS Agent**
