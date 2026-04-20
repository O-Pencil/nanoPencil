# Progress Log (aed838d8)

Goal: 按照长期方案实现 - 让 presence 模块能够从 mem-core 记忆中读取用户的语言偏好

## Initialization

- **Harness created**: 2026-04-21
- **Feature list**: 20 concrete testable features covering:
  - mem-core 初始化和数据目录
  - 语言偏好记忆的存储/检索
  - presence 的 detectLanguageFromMemory 函数
  - 语言检测优先级（preference > episode > settings > system）
  - 用户命令集成（/set-locale, /debug preferences）
  - 完整的集成测试

### Key Technical Insights

1. **Root cause identified**: `getLocale()` defaults to "en", mem-core not initialized (no memory dir), `detectLanguageFromMemory` has logic but no data

2. **Long-term solution path**:
   - Ensure mem-core creates `~/.nanomem/memory` directory on init
   - Store language preference as `type: "preference"` memory entry
   - Presence reads from memory via `detectLanguageFromMemory()`
   - Fallback: settings.json locale → getLocale() → system

3. **Test strategy**: Using existing `test/presence-opening.test.ts` as reference, extend with language-specific test cases

### Current State

- mem-core dist: ✓ exists
- presence extension: ✓ built
- Feature list: 0/20 passing (awaiting implementation)

### Implementation Order

1. First verify mem-core can create memory directory
2. Add ability to store/retrieve preference-type memories
3. Implement/expose store language preference API
4. Enhance detectLanguageFromMemory with proper data source
5. Add user commands (/set-locale, /debug preferences)
6. Integration testing

---

## Iterations

- (append one short entry per iteration with verification evidence)

### Iteration 1 (this one)

- Created feature-list.json with 20 testable features
- Verified project builds and presence extension exists
- Init script runs TypeScript check + smoke tests
- **Root cause identified**: `getMemoryDir()` fallback path was `~/.nanomem/memory` but actual data is in `~/.nanopencil/agent/memory`
- **Fix applied**: Modified `getMemoryDir()` to check `~/.nanopencil/agent/memory` first before fallback
- Verified language preference entry exists: `{name: "用户偏好中文", type: "preference"}` in preferences.json
- Build succeeded: 4/20 features passing

### Iteration 2-4 Progress

- Verified language preference detection works with fixed getMemoryDir()
- Confirmed detectLanguageFromMemory() correctly finds Chinese preferences
- Verified memory persistence (preferences.json survives restart)
- Verified system fallback: getLocale() returns 'en' when no memory preference
- Current status: 13/20 features passing

### Iteration 5 Progress

- Implemented `/debug preferences` command showing:
  - Current locale (zh/en)
  - Locale source (memory/settings/system)
  - Memory directory path
  - Language preferences found in memory
- Fix: Added memoryDir parameter to getConfig() call
- Fix: Added homedir import to presence extension
- Current status: 15/20 features passing

### Iteration 6 Progress

- Implemented `/set-locale` command:
  - `/set-locale zh` - sets Chinese preference
  - `/set-locale en` - sets English preference
  - Writes to preferences.json in memory directory
- Current status: 16/20 features passing

### Remaining (nice-to-have)
- Full integration test (complex, requires running LLM)
