# /apikey 命令使用说明

## 功能

`/apikey` 命令允许用户在运行时更新当前模型提供商的 API Key，无需重启 nanopencil。

## 使用方法

1. 在 nanopencil 交互界面中，输入 `/apikey` 并按回车
2. 系统会提示你输入新的 API Key
3. 输入完成后按回车确认
4. API Key 会立即保存到 `~/.nanopencil/agent/auth.json` 并生效

## 示例

```
你: /apikey

请输入 Dashscope-coding API Key: sk-sp-xxxxxxxxxxxx

✓ Dashscope-coding API Key 已更新
```

## 支持的提供商

此命令支持所有已配置的模型提供商，包括但不限于：

- `dashscope-coding` - 阿里云百炼 Coding Plan
- `qianfan-coding` - 百度千帆 Coding Plan
- `ark-coding` - 火山引擎方舟 Coding Plan
- `anthropic` - Claude
- `openai` - OpenAI GPT
- `google` - Google Gemini
- `ollama` - 本地 Ollama

## 注意事项

1. **自动检测提供商**: 命令会自动使用当前选中的模型对应的提供商
2. **持久化保存**: API Key 保存后永久有效，无需每次输入
3. **安全性**: API Key 以明文形式存储在本地文件中，请确保文件权限安全
4. **取消操作**: 如果提示时直接按回车（不输入任何内容），则取消操作

## 技术实现

- 文件: `modes/interactive/interactive-mode.ts`
- 方法: `handleApiKeyCommand()`
- 组件: `modes/interactive/components/apikey-input.ts`

## 相关命令

- `/model` - 选择或切换模型
- `/login` - OAuth 方式登录（适用于支持 OAuth 的提供商）
- `/settings` - 打开设置菜单

## 故障排除

### 问题: 提示 "No model selected"

**解决方案**: 先使用 `/model` 命令选择一个模型，然后再使用 `/apikey` 更新 API Key。

### 问题: API Key 更新后仍然无法使用

**解决方案**:
1. 检查 API Key 格式是否正确
2. 确认 API Key 是否有效（未过期、有足够配额）
3. 尝试使用 `/model` 重新选择模型以刷新连接
