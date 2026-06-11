# 火山引擎方舟 Coding Plan 配置指南

NanoPencil 支持火山引擎方舟 Coding Plan，可接入 Doubao、Kimi、DeepSeek、GLM、MiniMax 等模型。

## 获取 API Key

1. 访问 [方舟 Coding Plan 活动](https://www.volcengine.com/activity/codingplan) 订阅套餐
2. 在 [方舟 API Key 管理](https://console.volcengine.com/ark/region:ark+cn-beijing/apikey) 创建并复制 API Key

## 配置方式

### 方式一：首次启动时配置

首次运行 `nanopencil` 时，若未配置任何 Coding Plan API Key，会提示选择：

```
请选择要配置的 Coding Plan：1) 百炼 (Alibaba) 2) 千帆 (Baidu) 3) 方舟 (Volcano) [1]:
```

选择 `3` 后输入方舟 API Key 即可。

### 方式二：使用 /login 或 /apikey 命令

在交互模式下，使用 `/login` 或 `/apikey` 命令配置 `ark-coding` 的 API Key。

## 支持的模型

| 模型 ID | 名称 |
|---------|------|
| doubao-seed-2.0-code | Doubao Seed 2.0 Code (方舟) |
| doubao-seed-2.0-pro | Doubao Seed 2.0 Pro (方舟) |
| doubao-seed-2.0-lite | Doubao Seed 2.0 Lite (方舟) |
| doubao-seed-code | Doubao Seed Code (方舟) |
| minimax-m2.5 | MiniMax M2.5 (方舟) |
| glm-4.7 | GLM-4.7 (方舟) |
| deepseek-v3.2 | DeepSeek V3.2 (方舟) |
| kimi-k2.5 | Kimi K2.5 (方舟) |

## 技术说明

- **Base URL**：`https://ark.cn-beijing.volces.com/api/coding/v3`（兼容 OpenAI 接口）
- **API 协议**：兼容 OpenAI chat/completions 接口
- **Provider ID**：`ark-coding`
- **auth.json 存储**：`auth.json` 中 `ark-coding` 条目存储 API Key

> ⚠️ 请勿使用 `https://ark.cn-beijing.volces.com/api/v3`：该 Base URL 不会消耗 Coding Plan 额度，而是会产生额外费用。

## 模型配置说明

- 支持在 models.json 中配置 Model Name 实时切换模型
- 支持全小写格式（如 `minimax-m2.5`）或直接复制开通管理页面中的模型名称
