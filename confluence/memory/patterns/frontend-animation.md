---
name: frontend-animation
type: pattern
tags: [frontend, animation, css, ux, performance]
confidence: high
source: ultraskills/external/frontend-slides
references: []
---

# Frontend Animation Patterns - 前端动画模式

> 按意图选择动画,匹配用户预期感受

---

## Effect-to-Feeling Guide - 效果到感受映射

| 感受 | 动画 | 视觉线索 |
|------|------|---------|
| **Dramatic / Cinematic** | 慢淡入(1-1.5s), 大scale过渡(0.9→1), 视差滚动 | 深色背景, 聚光灯效果, 全出血图片 |
| **Techy / Futuristic** | 霓虹光晕(box-shadow), 故障/scramble文字, 网格reveal | 粒子系统(canvas), 网格图案, 等宽字体, cyan/magenta/电蓝 |
| **Playful / Friendly** | 弹跳easing(spring物理), 浮动/摇晃 | 圆角, 粉彩/亮色, 手绘元素 |
| **Professional / Corporate** | 微妙快速动画(200-300ms), 干净切换 | 海军蓝/石板色/炭灰, 精确间距, 数据可视化 |
| **Calm / Minimal** | 极慢微妙运动, 温和淡入淡出 | 高留白, 柔和色板, 衬线字体, 慷慨padding |
| **Editorial / Magazine** | 交错文字reveal, 图文交互 | 强类型层级, 引用框, 打破网格布局, 衬线标题+无衬线正文 |

---

## Entrance Animations - 入场动画

### 1. Fade + Slide Up (最通用)

```css
.reveal {
    opacity: 0;
    transform: translateY(30px);
    transition: opacity 0.6s var(--ease-out-expo),
                transform 0.6s var(--ease-out-expo);
}
.visible .reveal {
    opacity: 1;
    transform: translateY(0);
}
```

**用途:** 通用内容入场,专业感

---

### 2. Scale In - 缩放入场

```css
.reveal-scale {
    opacity: 0;
    transform: scale(0.9);
    transition: opacity 0.6s, transform 0.6s var(--ease-out-expo);
}
```

**用途:** 弹出框、卡片、重要元素

---

### 3. Slide from Left - 从左滑入

```css
.reveal-left {
    opacity: 0;
    transform: translateX(-50px);
    transition: opacity 0.6s, transform 0.6s var(--ease-out-expo);
}
```

**用途:** 侧边栏、导航、时间线

---

### 4. Blur In - 模糊入场

```css
.reveal-blur {
    opacity: 0;
    filter: blur(10px);
    transition: opacity 0.8s, filter 0.8s var(--ease-out-expo);
}
```

**用途:** 背景图、hero section、电影感

---

## Background Effects - 背景效果

### Gradient Mesh - 渐变网格

```css
.gradient-bg {
    background:
        radial-gradient(ellipse at 20% 80%, rgba(120, 0, 255, 0.3) 0%, transparent 50%),
        radial-gradient(ellipse at 80% 20%, rgba(0, 255, 200, 0.2) 0%, transparent 50%),
        var(--bg-primary);
}
```

**用途:** 创造深度感,futuristic风格

---

### Noise Texture - 噪声纹理

```css
.noise-bg {
    background-image: url("data:image/svg+xml,..."); /* Inline SVG noise */
}
```

**用途:** 减少色带,增加质感

---

### Grid Pattern - 网格图案

```css
.grid-bg {
    background-image:
        linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
    background-size: 50px 50px;
}
```

**用途:** Tech风格,结构感,深色背景

---

## Interactive Effects - 交互效果

### 3D Tilt on Hover - 悬停3D倾斜

```javascript
class TiltEffect {
    constructor(element) {
        this.element = element;
        this.element.style.transformStyle = 'preserve-3d';
        this.element.style.perspective = '1000px';

        this.element.addEventListener('mousemove', (e) => {
            const rect = this.element.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width - 0.5;
            const y = (e.clientY - rect.top) / rect.height - 0.5;
            this.element.style.transform = `rotateY(${x * 10}deg) rotateX(${-y * 10}deg)`;
        });

        this.element.addEventListener('mouseleave', () => {
            this.element.style.transform = 'rotateY(0) rotateX(0)';
        });
    }
}
```

**用途:** 卡片、面板、产品展示

---

## Performance - 性能注意事项

### ✅ 高性能动画属性

```css
/* 只用transform和opacity - GPU加速 */
.fast-animation {
    transform: translateX(100px);
    opacity: 0.5;
}
```

### ❌ 避免触发Layout/Paint

```css
/* 会触发reflow - 慢 */
.slow-animation {
    left: 100px;    /* 避免 */
    width: 200px;   /* 避免 */
    height: 100px;  /* 避免 */
}
```

### will-change谨慎使用

```css
/* 只在真正需要时用 */
.about-to-animate {
    will-change: transform;
}

/* 动画结束后移除 */
.animation-done {
    will-change: auto;
}
```

**Why:** `will-change`消耗内存,过度使用反而降低性能。

---

## Troubleshooting - 问题排查

| 问题 | 修复 |
|------|------|
| 字体未加载 | 检查Fontshare/Google Fonts URL; 确保CSS中字体名匹配 |
| 动画未触发 | 验证Intersection Observer运行; 检查`.visible`类是否添加 |
| Scroll snap不工作 | 确保html有`scroll-snap-type: y mandatory`; 每个slide需要`scroll-snap-align: start` |
| 移动端问题 | 在768px断点禁用重效果; 测试触摸事件; 减少粒子数 |
| 性能问题 | 谨慎使用`will-change`; 优先`transform`/`opacity`; throttle滚动handler |

---

## 响应式策略

### 移动端降级

```css
/* 桌面: 复杂动画 */
@media (min-width: 768px) {
    .complex-animation {
        animation: fancy-effect 2s;
    }
}

/* 移动: 简化或禁用 */
@media (max-width: 767px) {
    .complex-animation {
        animation: none; /* 或简单fade */
    }
}
```

### 尊重用户偏好

```css
/* 用户禁用动画时关闭 */
@media (prefers-reduced-motion: reduce) {
    * {
        animation-duration: 0.01ms !important;
        transition-duration: 0.01ms !important;
    }
}
```

---

## 实用Easing函数

```css
:root {
    --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
    --ease-in-out-circ: cubic-bezier(0.85, 0, 0.15, 1);
    --bounce: cubic-bezier(0.68, -0.55, 0.265, 1.55);
}

/* 使用 */
.smooth {
    transition: transform 0.6s var(--ease-out-expo);
}
```

---

## Quick Reference - 快速参考

### 动画时长指南

| 元素类型 | 时长 | Easing |
|---------|------|--------|
| 微交互(按钮hover) | 100-200ms | ease-out |
| 内容入场 | 300-600ms | ease-out-expo |
| Page transition | 400-800ms | ease-in-out |
| 电影感效果 | 1000-1500ms | ease-out-circ |

### 常见组合

```css
/* Professional - 快速精准 */
transition: all 0.2s ease-out;

/* Playful - 弹跳感 */
transition: transform 0.4s var(--bounce);

/* Cinematic - 慢且平滑 */
transition: all 1.2s var(--ease-out-expo);
```

---

## 与eket前端开发对照

虽然eket主要后端,但这些模式适用于:
- **Dashboard UI** - Professional风格(200-300ms fast animations)
- **Agent状态可视化** - Tech风格(网格背景 + 霓虹效果)
- **错误提示** - Playful弹跳(非严重错误)或Dramatic淡入(严重错误)

**关联:** [[lazy-load-docs]] 中的UX考虑 - 大文档加载时显示skeleton + fade-in动画。

---

## 延伸资源

- Cubic Bezier生成器: https://cubic-bezier.com/
- CSS Easing Functions: https://easings.net/
- Motion Design参考: https://material.io/design/motion
