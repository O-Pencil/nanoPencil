# input-submit-controller 专项评审（实施前）

```yaml
doc: input-submit-analysis
phase: P5
finding: UI06
status: review
source: modes/interactive/interactive-mode.ts::setupEditorSubmitHandler
decision: extract interactive input-submit controller after slash/model/auth/tree/settings owners stabilized
```

## 0. 当前前提

`slash-dispatcher-controller` 已落地并由 maintainer 确认 build 通过（`bce01d2` + `0c96e05`）。因此 input-submit 现在不需要再关心 33 个 built-in slash 的 command table，只需要在 submit 开头调用 slash dispatcher 并尊重其返回值。

本评审不要求录 characterization baseline；它是结构评审，目标是确定“是否抽、怎么抽、哪些行为不能变”。

## 1. 现象层：当前 onSubmit 分支

当前 `setupEditorSubmitHandler` 的提交管线按顺序执行：

| 顺序 | 分支 | 当前行为 | 初步 owner |
|------|------|----------|------------|
| 0 | trim/empty | trim 输入，空文本直接 return | input-submit |
| 1 | pending paste | `imagePipeline.awaitPendingPaste()` | image-pipeline port |
| 2 | built-in slash | `slashDispatcher.execute(text)` 命中即 return | slash-dispatcher port |
| 3 | embedded persona | `文本 /persona ...`：先执行 persona，再把前置文本作为用户消息提交 | input-submit + persona port |
| 4 | standalone persona duplicate | `/persona...` 直接执行 persona | **candidate dead branch**（built-in slash 已先命中） |
| 5 | `/memory`/`/arminsayshi`/`/resume`/`/quit` duplicates | 直接执行对应行为 | **candidate dead branches**（built-in slash 已先命中） |
| 6 | bash `!`/`!!` | bash running 时保留 editor 文本并 warning；否则执行 bash，更新 bash mode/border | bash port + editor/render port |
| 7 | compacting | extension command 立即 prompt；普通文本 queue compaction message | input-submit queue policy + extension detector |
| 8 | streaming | add history/clear editor；乐观显示用户消息；处理图片/附件；不支持图片则丢弃并提示；以 steer 提交 | input-submit core + image/render/session ports |
| 9 | normal idle | flush pending bash; optional external callback; add history/clear; extract images/attachments; image capability guard; optimistic render; `promptAfterRender`; failure rollback; cleanup temp images | input-submit core + image/render/session ports |

关键事实：built-in slash 已先执行，因此 standalone `/persona`、`/memory`、`/arminsayshi`、`/resume`、`/quit` 在当前顺序下不可达。它们是 UI06 可以删除的重复分支，但删除必须在验收中确认行为仍由 slash dispatcher 提供。

## 2. 本质层：边界

`input-submit-controller` 应该是 interactive submit classifier，不是 slash dispatcher、不是 image pipeline、不是 AgentSession。

### 归它

- submit 顺序和互斥规则。
- trim/empty/pending paste 顺序。
- built-in slash “命中即终止”的调用点。
- embedded persona 这一种“命令嵌入普通文本”的特例。
- bash `!`/`!!` 分类。
- compaction 期普通文本 vs extension command 的分流。
- streaming steer 的乐观渲染、附件转引用、图片能力过滤、steer 提交。
- idle 普通提交的 optimistic render、prompt、rollback、cleanup。

### 不归它

- built-in slash command token table：继续归 `SlashDispatcherController`。
- model/provider/settings/tree/auth overlay 行为：继续归各 owner。
- image extraction/attachment storage/cleanup 细节：继续归 `ImagePipelineController`。
- AgentSession prompt/steer/followUp/compaction 实现：继续归 runtime。
- chat component rendering细节：通过 render port 委托。

## 3. 哲学层：为什么要抽

当前 onSubmit 同时承担“输入分类 + UI side effects + runtime submit + optimistic rollback”。这不是组合根职责。抽出后收益不是复用，而是：

- 删除重复 slash 分支，降低分支爆炸。
- 把“用户输入如何变成 AgentSession 调用”的顺序显式化。
- 让后续 render-layer 拆分时不再被 submit 分派牵制。
- 明确 token-neutral 约束：拆分不得改变最终提交的 text/images/attachments/streamingBehavior。

## 4. 建议 controller 形状

文件：

`modes/interactive/controllers/input-submit-controller.ts`

建议 context 分组：

| Port | 能力 |
|------|------|
| `editor` | get/set text, add history, onInputCallback |
| `slash` | execute built-in slash |
| `persona` | handle persona command |
| `bash` | is running, execute bash, set bash mode, update border, warning |
| `image` | await pending paste, extract images, take/process attachments, cleanup |
| `session` | isCompacting/isStreaming/model/cwd, promptAfterRender, queueCompactionMessage |
| `extension` | isExtensionCommand |
| `render` | optimistic user message add/remove, requestRender, pending display, flush pending bash, showStatus/showWarning/showError |

不要把 `InteractiveMode` 整个传入 controller；否则只是换文件名。

## 5. 死分支处理

可以删除的重复分支：

- `if (text === "/persona" || text.startsWith("/persona "))`
- `if (text === "/memory")`
- `if (text === "/arminsayshi")`
- `if (text === "/resume")`
- `if (text === "/quit")`

保留的 persona 特例：

- `text.match(/\s+\/persona\b/)` embedded persona。它不是 built-in slash token，因为输入不是以 `/persona` 开头。

删除规则：只能在 controller 抽出时删除，且验收 `/persona`、`/memory`、`/arminsayshi`、`/resume`、`/quit` 仍经 slash dispatcher 正常工作。

## 6. Token-neutral 约束

这刀不得改变用户实际 token 消耗：

- 普通提交给 `promptAfterRender` 的 `processedText` 不变。
- streaming steer 的 `steerPromptText` 和 attachment path reference 拼接规则不变。
- `images` 数量和丢弃条件不变。
- extension slash 在 compaction/streaming 下仍按原路径立即 prompt。
- unknown slash 仍能进入后续 extension/prompt 处理，不被 built-in dispatcher 吞掉。
- optimistic display 不应向 AgentSession 额外提交任何消息。

## 7. 验收矩阵

| 场景 | 验收 |
|------|------|
| built-in slash | `/settings`、`/model` 命中后不作为普通 prompt 发送 |
| unknown slash | 未命中 built-in 后继续后续路径，extension/prompt command 行为不变 |
| embedded persona | `hello /persona use xxx` 先切 persona，再提交 `hello` |
| bash | `!pwd` 执行 bash；bash running 时保留 editor text 并提示 |
| excluded bash | `!!cmd` 仍以 excludedFromContext 执行 |
| compaction | 普通文本进入 compaction queue；extension command 立即执行 |
| streaming steer | 乐观显示用户消息，然后以 `streamingBehavior: "steer"` 提交 |
| streaming images | 图片/附件处理、模型不支持图片时丢弃并提示 |
| idle attachments | 附件转图片进入 message；提交后 cleanup |
| onInputCallback | callback 存在时不走 agent prompt |
| rollback | prompt 抛错时移除对应 optimistic user message |

## 8. 下一步

实现前先确认 context port 列表。若 context 宽度明显超过上述分组，应先把 render optimistic helpers 或 bash command handling再独立成 port facade，而不是让 input-submit 直接拿到 container/editor/session 全对象。
