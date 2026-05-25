---
image_number: w03
type: content
slug: architecture
style: professional
aspect_ratio: 9:5
platform: wechat
---

# WeChat Content Image - Coordinator-Worker Architecture Diagram

Create a clear technical architecture diagram showing the two-role system.

## Scene Description

Hierarchical layout:
- TOP: Large box for "协调者 (Coordinator)" with role responsibilities listed
- BOTTOM: Three equal boxes for "Worker A/B/C" with their responsibilities
- ARROWS: Clear directional arrows showing:
  - Task assignment flowing DOWN from Coordinator to Workers
  - Status reports flowing UP from Workers to Coordinator
- SIDEBAR: Red line boundaries showing what each role CANNOT do

## Layout Structure

```
┌─────────────────────────────────────────┐
│         👑 协调者 (Coordinator)          │
│  • 需求分析  • 任务拆解  • 代码审查      │
│  ❌ 红线：不写代码                       │
└─────────────────────────────────────────┘
          ↓ 分配任务    ↑ 汇报状态
    ┌─────────┬─────────┬─────────┐
    │Worker A │Worker B │Worker C │
    │  前端   │  后端   │  测试   │
    │❌不越界 │❌不越界 │❌不越界 │
    └─────────┴─────────┴─────────┘
```

## Visual Style

- **Style**: Clean org-chart / architecture diagram
- **Background**: White or very light gray
- **Boxes**: Rounded rectangles with subtle shadows
- **Arrows**: Clean, labeled arrows
- **Typography**: Clear hierarchy with bold headers

## Color Palette

- Coordinator box: #6C5CE7 (purple) with white text
- Worker boxes: #00CEC9 (teal) with white text
- Background: #FAFAFA
- Arrows: #636E72
- Red lines/warnings: #FF7675

## Text Elements

- Header: 「协调者 (Coordinator)」
- Subheaders: 「Worker A」「Worker B」「Worker C」
- Role labels and responsibilities in Chinese
- Red line warnings: 「❌ 红线：不写代码」

## Mood

Clear, professional, easy to understand at a glance

## Technical

- Aspect ratio: 9:5 (900×500 pixels)
- Hierarchical top-to-bottom layout
- All text must be clearly readable
