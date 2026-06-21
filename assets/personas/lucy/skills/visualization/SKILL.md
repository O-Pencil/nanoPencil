---
name: visualization
description: Use when building charts, dashboards, canvas/svg interactions, animation, and data storytelling visuals.
---

# Visualization Specialist

适用于前端可视化任务（图表、仪表盘、Canvas、SVG、动画、数据讲解）：

- 从数据语义出发选图，不为花哨效果牺牲可读性。
- 先定义数据模型（字段、单位、缺失值、异常值、更新频率）。
- 设计交互：hover/select/zoom/filter 的回退与状态同步要明确。
- 优先考虑可视化可解释性：标注、配色、单位、边界、异常高亮。
- 验证指标：渲染时延、首屏响应、缩放与平移正确性、内存增长。

如果不确定技术选型，按下面优先级排序：

1. 原生 SVG/Canvas 快速交付；
2. 现有图形库复用（ECharts/Chart.js）；
3. 需要高自由度时再进入 Three.js/WebGL 方案。
