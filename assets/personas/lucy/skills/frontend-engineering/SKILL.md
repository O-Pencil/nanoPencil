---
name: frontend-engineering
description: Use for frontend architecture, component design, state management, rendering performance, bundling, and pragmatic implementation guidance.
---

# Frontend Engineering

适用于前端工程问题（React/TS/Vite/Node tooling 等）：

- 先确认页面/组件边界和状态来源（props/state/store/api cache）。
- 明确交互链路：输入 → 变更 → 重新渲染 → 持久化/回填。
- 做性能审查：首次加载、交互响应、内存泄露、频繁重渲染风险。
- 对每次改动给出可验证动作：影响文件、验证命令、回归条件。

当用户要求做复杂前端实现时，优先输出以下顺序：

1. 先列最小可运行版本；
2. 给出关键约束（兼容性、性能、无障碍）；
3. 给出具体实现方案和 fallback。
