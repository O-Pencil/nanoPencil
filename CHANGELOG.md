# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.11.44] - 2026-04-12

### Fixed
- fix(tui): disable synchronized output on Warp terminal
- fix(tui): revert beautification changes causing display bugs, add rebuild safeguards

### Maintenance
- chore(ai): remove canvas devDependency for Windows installs
- chore(release): 1.11.43


## [1.11.42] - 2026-04-12

### Fixed
- fix(session): persist user-only turns before any assistant reply so TUI rebuilds and packaged releases keep the latest user message visible

## [1.11.41] - 2026-04-12

### Added
- feat(interactive): buddy beside input, ASCII cats, steadier cursor
- feat: buddy pet system, tools dedup, build config and docs updates
- feat(sal): add run-local experiment reporting
- feat(tui): role labels, message backgrounds, theme schema updates
- feat(core): add typed error hierarchy and streaming retry with backoff
- feat(interactive): suggest vision model variants when images are dropped
- feat(sal): implement SAL extension with default-on structural anchor localization
- feat(presence): integrate soul personality hints and recent lines history
- feat(extensions): split grub from loop, refactor scheduler
- feat(presence): AI-generated idle nudges and per-turn agent perception
- feat(team): add Phase B AgentTeam extension with persistent teammates
- feat(presence): AI-driven personalized greetings with memory context
- feat(subagent): add isolated workspace review and apply flow
- feat(update): add /reinstall command and force update flag
- feat(subagent): add SubAgent runtime and /subagent command
- feat(ai): add MiniMax thinking tag support
- feat(model): improve OAuth token handling in model switching
- feat(debug): export debug logger from core module
- feat(debug): add comprehensive debug logging system for AI providers
- feat(interactive-mode): enhance update workflow with interactive options
- feat(model-selector): add Ctrl+N to append OpenRouter model by id
- feat(interactive): enhance custom editor and mode orchestration
- feat(auth): expose openrouter in login selector
- feat(presence): add gentle proactive chat extension
- feat(mem-core): retain superseded procedural rows on merge
- feat(interview): synchronous before_agent_start hook and heuristics
- feat(mem-core): release v1.1.0
- feat(mem-core): add semantic recall and reconsolidation loop
- feat(i18n): add internationalization support (EN/ZH)
- feat(mem-core): add v2 episodic and procedural memory bridge
- feat(dream): add abortable consolidation and auto-dream gating
- feat(acp): improve zed agent parity
- feat(figma): improve remote MCP authentication flow
- feat(agent): hide internal traces and improve time grounding
- feat(mem): add graph-driven memory governance
- feat(team): add multi-agent team orchestration extension
- feat(providers): support custom protocol endpoints
- feat(loop): replace timer loop with autonomous task loop

### Fixed
- fix(retry): reset attempt counter on abort in RetryCoordinator
- fix(extensions): dispose extension runner on session shutdown
- fix(tui): align viewport scroll when chat content grows
- fix(tui): emit UI events before awaiting extension handlers for responsive streaming
- fix(scripts): generate changelog on Windows without head command
- fix(interactive): reset clipboard image sequence counter after sending
- fix(build): correct build:deps order — ai must precede agent-core
- fix(sal): stabilize structural anchor bridge
- fix(build): add path aliases for mem-core and soul-core
- fix(team): complete AgentTeam Phase B runtime gaps
- fix(update): add shell:true and env for Windows spawn
- fix(presence): pass SoulOptions to SoulManager
- fix(loop): use valid ThemeColor "error" instead of "danger" in renderer
- fix(subagent): normalize Windows paths to forward slashes
- fix(loop): update duration parsing and help messages
- fix(loop): defer scheduler ticker until session_start
- fix(build): bundle zod for global install; workspace tsc; soul empty JSON
- fix(utils): improve clipboard timeout and image resize safety
- fix(interactive): improve clipboard and attachment error handling
- fix(clipboard): add missing @mariozechner/clipboard dependency
- fix(team): resolve theme color error and abort listener leak
- fix(debug-logger): enable late environment variable detection
- fix(model-cycling): improve OAuth error handling with typed errors
- fix(interactive-mode): improve update system reliability
- fix(nanopencil): correct MiniMax API endpoint from /anthropic to /v1
- fix(build): bundle zod to dist/node_modules for peerDependency resolution
- fix(interactive-mode): replace npm update with npm install in version check prompt
- fix(tui): show NanoMem command notifications
- fix(ai): avoid InvalidCharacterError when OAuth client placeholders are not base64
- fix(nanopencil): OpenRouter in /login and slim built-in OpenRouter models
- fix(memory): verify insights and startup presence behavior
- fix(auth): preserve provider api keys in config flows
- fix(presence): wait for ui readiness before greeting
- fix(tui): stabilize startup presence and user echo
- fix(memory): prioritize conversation preferences in recall
- fix(presence): show startup greeting after UI init
- fix(memory): shift runtime recall toward V2
- fix(memory): back up legacy data before maintenance
- fix(memory): stabilize recall and startup maintenance
- fix(release): rebuild bundled packages before publish
- fix(ci): add workspaces config for npm workspace commands
- fix(tui): prevent duplicate Working messages in PencilLoader
- fix(interview): stabilize trigger and clarification flow
- fix(acp): improve zed loop and team progress visibility
- fix(mcp): load runtime config from the active MCP path
- fix(interactive): harden extension prompt focus flow
- fix(runtime): tighten workspace handling and startup prompts @o-pencil-agent
- fix(runtime): improve loop recovery and insights reporting
- fix(deps): add zod runtime dependency
- fix(ux): improve custom provider messaging
- fix(providers): reopen and refresh custom provider edits
- fix(providers): streamline custom provider setup
- fix: extract clipboard image data before sending to model

### Changed
- refactor(runtime): extract RetryCoordinator and add structured logging
- refactor(mem-core): split engine into modules
- refactor: unify config paths, env vars, and extension API surface
- refactor(i18n): translate all Chinese comments and strings to English

### Documentation
- docs: attribute repo guidance to @o-pencil-agent; add git msg filter helper
- docs(experiment): add SAL experiment results report
- docs(test): add SAL experiment template
- docs(dip): migrate AGENT.md files to WHO/FROM/TO/HERE format
- docs: add P3 protocol headers to 27 files - SubAgent, Team, workspace, security-audit, soul, simplify extensions - packages ai, tui, mem-core key source files - test utilities for agent-core and ai packages
- docs(changelog): add v1.11.39 release notes
- docs(memory): add cognitive map and SAL experiment drafts
- docs(dip): add P2 for core/sub-agent and core/workspace; sync extensions/defaults
- docs: update CHANGELOG for 1.11.37
- docs: update CHANGELOG for 1.11.36
- docs: update CHANGELOG for 1.11.35
- docs(dip): complete DIP protocol compliance for all source files
- docs(team): restructure SubAgent and AgentTeam as two-phase plan
- docs(team): add agent team refactor plan
- docs: clarify build order; fix oauth client id decode; tidy tsconfig and vitest header
- docs(agent): expand AGENT.md with cognitive architecture and quality metrics
- docs(dip): add P3 file headers and layered AGENT.md navigation
- docs(prompt): refine project assistant charter @o-pencil-agent
- docs(agents): require English for code strings and commits

### Maintenance
- chore: add experiment memory data to main branch
- chore(changelog): regenerate before release
- chore: add SAL experiment output files
- chore(release): v1.11.39
- chore(release): v1.11.38
- chore(models): update generated model catalog
- chore: remove old /agent team extension
- chore(release): 1.11.35
- chore(ai): regenerate models.generated.ts after build
- chore: merge origin/main into main
- chore: merge origin/main into main
- chore: release v1.11.34
- chore: run changelog before build in prepublishOnly
- chore(release): 1.11.33
- chore(release): 1.11.32
- chore(release): 1.11.31
- chore(ai): update model definitions
- chore(release): publish v1.11.18
- chore(release): v1.11.17
- chore(release): prepare 1.11.16 changelog
- chore(release): prepare 1.11.15 changelog
- chore(release): publish 1.11.15
- chore(release): prepare 1.11.14 changelog
- chore(release): prepare 1.11.13 changelog
- chore(release): publish 1.11.12
- chore(release): prepare 1.11.12 changelog
- chore(release): publish 1.11.11
- chore(release): publish 1.11.10
- chore(release): publish 1.11.8
- chore(release): publish 1.11.6
- chore(release): publish 1.11.5


## [1.11.39] - 2026-04-11

### Added
- feat(interactive): suggest vision model variants when images are dropped
- feat(sal): implement SAL extension with default-on structural anchor localization

### Fixed
- fix(interactive): reset clipboard image sequence counter after sending
- fix(build): correct build:deps order — ai must precede agent-core
- fix(sal): stabilize structural anchor bridge
- fix(build): add path aliases for mem-core and soul-core
- fix(team): complete AgentTeam Phase B runtime gaps
- fix(update): add shell:true and env for Windows spawn
- fix(presence): pass SoulOptions to SoulManager

### Changed
- refactor(mem-core): split engine into modules
- refactor: unify config paths, env vars, and extension API surface

### Documentation
- docs(test): add SAL experiment template
- docs(dip): migrate AGENT.md files to WHO/FROM/TO/HERE format
- docs: add P3 protocol headers to 27 files - SubAgent, Team, workspace, security-audit, soul, simplify extensions - packages ai, tui, mem-core key source files - test utilities for agent-core and ai packages
- docs(changelog): add v1.11.39 release notes
- docs(memory): add cognitive map and SAL experiment drafts

### Maintenance
- chore(changelog): regenerate before release
- chore: add SAL experiment output files
- chore(release): v1.11.39


## [1.11.39] - 2026-04-11

### Added
- feat(interactive): suggest vision model variants when images are dropped
- feat(sal): implement SAL extension with default-on structural anchor localization
- feat(presence): integrate soul personality hints and recent lines history
- feat(extensions): split grub from loop, refactor scheduler
- feat(presence): AI-generated idle nudges and per-turn agent perception
- feat(team): add Phase B AgentTeam extension with persistent teammates
- feat(presence): AI-driven personalized greetings with memory context
- feat(subagent): add isolated workspace review and apply flow
- feat(update): add /reinstall command and force update flag
- feat(subagent): add SubAgent runtime and /subagent command
- feat(ai): add MiniMax thinking tag support
- feat(model): improve OAuth token handling in model switching
- feat(debug): export debug logger from core module
- feat(debug): add comprehensive debug logging system for AI providers
- feat(interactive-mode): enhance update workflow with interactive options
- feat(model-selector): add Ctrl+N to append OpenRouter model by id
- feat(interactive): enhance custom editor and mode orchestration
- feat(auth): expose openrouter in login selector
- feat(presence): add gentle proactive chat extension
- feat(mem-core): retain superseded procedural rows on merge
- feat(interview): synchronous before_agent_start hook and heuristics
- feat(mem-core): release v1.1.0
- feat(mem-core): add semantic recall and reconsolidation loop
- feat(i18n): add internationalization support (EN/ZH)
- feat(mem-core): add v2 episodic and procedural memory bridge
- feat(dream): add abortable consolidation and auto-dream gating
- feat(acp): improve zed agent parity
- feat(figma): improve remote MCP authentication flow
- feat(agent): hide internal traces and improve time grounding
- feat(mem): add graph-driven memory governance
- feat(team): add multi-agent team orchestration extension
- feat(providers): support custom protocol endpoints
- feat(loop): replace timer loop with autonomous task loop

### Fixed
- fix(interactive): reset clipboard image sequence counter after sending
- fix(build): correct build:deps order — ai must precede agent-core
- fix(sal): stabilize structural anchor bridge
- fix(build): add path aliases for mem-core and soul-core
- fix(team): complete AgentTeam Phase B runtime gaps
- fix(update): add shell:true and env for Windows spawn
- fix(presence): pass SoulOptions to SoulManager
- fix(loop): use valid ThemeColor "error" instead of "danger" in renderer
- fix(subagent): normalize Windows paths to forward slashes
- fix(loop): update duration parsing and help messages
- fix(loop): defer scheduler ticker until session_start
- fix(build): bundle zod for global install; workspace tsc; soul empty JSON
- fix(utils): improve clipboard timeout and image resize safety
- fix(interactive): improve clipboard and attachment error handling
- fix(clipboard): add missing @mariozechner/clipboard dependency
- fix(team): resolve theme color error and abort listener leak
- fix(debug-logger): enable late environment variable detection
- fix(model-cycling): improve OAuth error handling with typed errors
- fix(interactive-mode): improve update system reliability
- fix(nanopencil): correct MiniMax API endpoint from /anthropic to /v1
- fix(build): bundle zod to dist/node_modules for peerDependency resolution
- fix(interactive-mode): replace npm update with npm install in version check prompt
- fix(tui): show NanoMem command notifications
- fix(ai): avoid InvalidCharacterError when OAuth client placeholders are not base64
- fix(nanopencil): OpenRouter in /login and slim built-in OpenRouter models
- fix(memory): verify insights and startup presence behavior
- fix(auth): preserve provider api keys in config flows
- fix(presence): wait for ui readiness before greeting
- fix(tui): stabilize startup presence and user echo
- fix(memory): prioritize conversation preferences in recall
- fix(presence): show startup greeting after UI init
- fix(memory): shift runtime recall toward V2
- fix(memory): back up legacy data before maintenance
- fix(memory): stabilize recall and startup maintenance
- fix(release): rebuild bundled packages before publish
- fix(ci): add workspaces config for npm workspace commands
- fix(tui): prevent duplicate Working messages in PencilLoader
- fix(interview): stabilize trigger and clarification flow
- fix(acp): improve zed loop and team progress visibility
- fix(mcp): load runtime config from the active MCP path
- fix(interactive): harden extension prompt focus flow
- fix(runtime): tighten workspace handling and startup prompts @o-pencil-agent
- fix(runtime): improve loop recovery and insights reporting
- fix(deps): add zod runtime dependency
- fix(ux): improve custom provider messaging
- fix(providers): reopen and refresh custom provider edits
- fix(providers): streamline custom provider setup
- fix: extract clipboard image data before sending to model

### Changed
- refactor(mem-core): split engine into modules
- refactor: unify config paths, env vars, and extension API surface
- refactor(i18n): translate all Chinese comments and strings to English

### Documentation
- docs(test): add SAL experiment template
- docs(dip): migrate AGENT.md files to WHO/FROM/TO/HERE format
- docs: add P3 protocol headers to 27 files - SubAgent, Team, workspace, security-audit, soul, simplify extensions - packages ai, tui, mem-core key source files - test utilities for agent-core and ai packages
- docs(changelog): add v1.11.39 release notes
- docs(memory): add cognitive map and SAL experiment drafts
- docs(dip): add P2 for core/sub-agent and core/workspace; sync extensions/defaults
- docs: update CHANGELOG for 1.11.37
- docs: update CHANGELOG for 1.11.36
- docs: update CHANGELOG for 1.11.35
- docs(dip): complete DIP protocol compliance for all source files
- docs(team): restructure SubAgent and AgentTeam as two-phase plan
- docs(team): add agent team refactor plan
- docs: clarify build order; fix oauth client id decode; tidy tsconfig and vitest header
- docs(agent): expand AGENT.md with cognitive architecture and quality metrics
- docs(dip): add P3 file headers and layered AGENT.md navigation
- docs(prompt): refine project assistant charter @o-pencil-agent
- docs(agents): require English for code strings and commits

### Maintenance
- chore(changelog): regenerate before release
- chore: add SAL experiment output files
- chore(release): v1.11.39
- chore(release): v1.11.38
- chore(models): update generated model catalog
- chore: remove old /agent team extension
- chore(release): 1.11.35
- chore(ai): regenerate models.generated.ts after build
- chore: merge origin/main into main
- chore: merge origin/main into main
- chore: release v1.11.34
- chore: run changelog before build in prepublishOnly
- chore(release): 1.11.33
- chore(release): 1.11.32
- chore(release): 1.11.31
- chore(ai): update model definitions
- chore(release): publish v1.11.18
- chore(release): v1.11.17
- chore(release): prepare 1.11.16 changelog
- chore(release): prepare 1.11.15 changelog
- chore(release): publish 1.11.15
- chore(release): prepare 1.11.14 changelog
- chore(release): prepare 1.11.13 changelog
- chore(release): publish 1.11.12
- chore(release): prepare 1.11.12 changelog
- chore(release): publish 1.11.11
- chore(release): publish 1.11.10
- chore(release): publish 1.11.8
- chore(release): publish 1.11.6
- chore(release): publish 1.11.5


## [1.11.39] - 2026-04-11

### Added
- feat(interactive): suggest vision model variants when images are dropped
- feat(sal): implement SAL extension with default-on structural anchor localization
- feat(presence): integrate soul personality hints and recent lines history
- feat(extensions): split grub from loop, refactor scheduler
- feat(presence): AI-generated idle nudges and per-turn agent perception
- feat(team): add Phase B AgentTeam extension with persistent teammates
- feat(presence): AI-driven personalized greetings with memory context
- feat(subagent): add isolated workspace review and apply flow
- feat(update): add /reinstall command and force update flag
- feat(subagent): add SubAgent runtime and /subagent command
- feat(ai): add MiniMax thinking tag support
- feat(model): improve OAuth token handling in model switching
- feat(debug): export debug logger from core module
- feat(debug): add comprehensive debug logging system for AI providers
- feat(interactive-mode): enhance update workflow with interactive options
- feat(model-selector): add Ctrl+N to append OpenRouter model by id
- feat(interactive): enhance custom editor and mode orchestration
- feat(auth): expose openrouter in login selector
- feat(presence): add gentle proactive chat extension
- feat(mem-core): retain superseded procedural rows on merge
- feat(interview): synchronous before_agent_start hook and heuristics
- feat(mem-core): release v1.1.0
- feat(mem-core): add semantic recall and reconsolidation loop
- feat(i18n): add internationalization support (EN/ZH)
- feat(mem-core): add v2 episodic and procedural memory bridge
- feat(dream): add abortable consolidation and auto-dream gating
- feat(acp): improve zed agent parity
- feat(figma): improve remote MCP authentication flow
- feat(agent): hide internal traces and improve time grounding
- feat(mem): add graph-driven memory governance
- feat(team): add multi-agent team orchestration extension
- feat(providers): support custom protocol endpoints
- feat(loop): replace timer loop with autonomous task loop

### Fixed
- fix(interactive): reset clipboard image sequence counter after sending
- fix(build): correct build:deps order — ai must precede agent-core
- fix(sal): stabilize structural anchor bridge
- fix(build): add path aliases for mem-core and soul-core
- fix(team): complete AgentTeam Phase B runtime gaps
- fix(update): add shell:true and env for Windows spawn
- fix(presence): pass SoulOptions to SoulManager
- fix(loop): use valid ThemeColor "error" instead of "danger" in renderer
- fix(subagent): normalize Windows paths to forward slashes
- fix(loop): update duration parsing and help messages
- fix(loop): defer scheduler ticker until session_start
- fix(build): bundle zod for global install; workspace tsc; soul empty JSON
- fix(utils): improve clipboard timeout and image resize safety
- fix(interactive): improve clipboard and attachment error handling
- fix(clipboard): add missing @mariozechner/clipboard dependency
- fix(team): resolve theme color error and abort listener leak
- fix(debug-logger): enable late environment variable detection
- fix(model-cycling): improve OAuth error handling with typed errors
- fix(interactive-mode): improve update system reliability
- fix(nanopencil): correct MiniMax API endpoint from /anthropic to /v1
- fix(build): bundle zod to dist/node_modules for peerDependency resolution
- fix(interactive-mode): replace npm update with npm install in version check prompt
- fix(tui): show NanoMem command notifications
- fix(ai): avoid InvalidCharacterError when OAuth client placeholders are not base64
- fix(nanopencil): OpenRouter in /login and slim built-in OpenRouter models
- fix(memory): verify insights and startup presence behavior
- fix(auth): preserve provider api keys in config flows
- fix(presence): wait for ui readiness before greeting
- fix(tui): stabilize startup presence and user echo
- fix(memory): prioritize conversation preferences in recall
- fix(presence): show startup greeting after UI init
- fix(memory): shift runtime recall toward V2
- fix(memory): back up legacy data before maintenance
- fix(memory): stabilize recall and startup maintenance
- fix(release): rebuild bundled packages before publish
- fix(ci): add workspaces config for npm workspace commands
- fix(tui): prevent duplicate Working messages in PencilLoader
- fix(interview): stabilize trigger and clarification flow
- fix(acp): improve zed loop and team progress visibility
- fix(mcp): load runtime config from the active MCP path
- fix(interactive): harden extension prompt focus flow
- fix(runtime): tighten workspace handling and startup prompts @o-pencil-agent
- fix(runtime): improve loop recovery and insights reporting
- fix(deps): add zod runtime dependency
- fix(ux): improve custom provider messaging
- fix(providers): reopen and refresh custom provider edits
- fix(providers): streamline custom provider setup
- fix: extract clipboard image data before sending to model

### Changed
- refactor(mem-core): split engine into modules
- refactor: unify config paths, env vars, and extension API surface
- refactor(i18n): translate all Chinese comments and strings to English

### Documentation
- docs(test): add SAL experiment template
- docs(dip): migrate AGENT.md files to WHO/FROM/TO/HERE format
- docs: add P3 protocol headers to 27 files - SubAgent, Team, workspace, security-audit, soul, simplify extensions - packages ai, tui, mem-core key source files - test utilities for agent-core and ai packages
- docs(changelog): add v1.11.39 release notes
- docs(memory): add cognitive map and SAL experiment drafts
- docs(dip): add P2 for core/sub-agent and core/workspace; sync extensions/defaults
- docs: update CHANGELOG for 1.11.37
- docs: update CHANGELOG for 1.11.36
- docs: update CHANGELOG for 1.11.35
- docs(dip): complete DIP protocol compliance for all source files
- docs(team): restructure SubAgent and AgentTeam as two-phase plan
- docs(team): add agent team refactor plan
- docs: clarify build order; fix oauth client id decode; tidy tsconfig and vitest header
- docs(agent): expand AGENT.md with cognitive architecture and quality metrics
- docs(dip): add P3 file headers and layered AGENT.md navigation
- docs(prompt): refine project assistant charter @o-pencil-agent
- docs(agents): require English for code strings and commits

### Maintenance
- chore: add SAL experiment output files
- chore(release): v1.11.39
- chore(release): v1.11.38
- chore(models): update generated model catalog
- chore: remove old /agent team extension
- chore(release): 1.11.35
- chore(ai): regenerate models.generated.ts after build
- chore: merge origin/main into main
- chore: merge origin/main into main
- chore: release v1.11.34
- chore: run changelog before build in prepublishOnly
- chore(release): 1.11.33
- chore(release): 1.11.32
- chore(release): 1.11.31
- chore(ai): update model definitions
- chore(release): publish v1.11.18
- chore(release): v1.11.17
- chore(release): prepare 1.11.16 changelog
- chore(release): prepare 1.11.15 changelog
- chore(release): publish 1.11.15
- chore(release): prepare 1.11.14 changelog
- chore(release): prepare 1.11.13 changelog
- chore(release): publish 1.11.12
- chore(release): prepare 1.11.12 changelog
- chore(release): publish 1.11.11
- chore(release): publish 1.11.10
- chore(release): publish 1.11.8
- chore(release): publish 1.11.6
- chore(release): publish 1.11.5


## [1.11.39] - 2026-04-10

### Added
- feat(sal): implement SAL extension with default-on structural anchor localization
- feat(presence): integrate soul personality hints and recent lines history
- feat(extensions): split grub from loop, refactor scheduler
- feat(presence): AI-generated idle nudges and per-turn agent perception
- feat(team): add Phase B AgentTeam extension with persistent teammates
- feat(presence): AI-driven personalized greetings with memory context
- feat(subagent): add isolated workspace review and apply flow
- feat(update): add /reinstall command and force update flag
- feat(subagent): add SubAgent runtime and /subagent command
- feat(ai): add MiniMax thinking tag support
- feat(model): improve OAuth token handling in model switching
- feat(debug): export debug logger from core module
- feat(debug): add comprehensive debug logging system for AI providers
- feat(interactive-mode): enhance update workflow with interactive options
- feat(model-selector): add Ctrl+N to append OpenRouter model by id
- feat(interactive): enhance custom editor and mode orchestration
- feat(auth): expose openrouter in login selector
- feat(presence): add gentle proactive chat extension
- feat(mem-core): retain superseded procedural rows on merge
- feat(interview): synchronous before_agent_start hook and heuristics
- feat(mem-core): release v1.1.0
- feat(mem-core): add semantic recall and reconsolidation loop
- feat(i18n): add internationalization support (EN/ZH)
- feat(mem-core): add v2 episodic and procedural memory bridge
- feat(dream): add abortable consolidation and auto-dream gating

### Fixed
- fix(sal): stabilize structural anchor bridge
- fix(build): add path aliases for mem-core and soul-core
- fix(team): complete AgentTeam Phase B runtime gaps
- fix(update): add shell:true and env for Windows spawn
- fix(presence): pass SoulOptions to SoulManager
- fix(loop): use valid ThemeColor "error" instead of "danger" in renderer
- fix(subagent): normalize Windows paths to forward slashes
- fix(loop): update duration parsing and help messages
- fix(loop): defer scheduler ticker until session_start
- fix(build): bundle zod for global install; workspace tsc; soul empty JSON
- fix(utils): improve clipboard timeout and image resize safety
- fix(interactive): improve clipboard and attachment error handling
- fix(clipboard): add missing @mariozechner/clipboard dependency
- fix(team): resolve theme color error and abort listener leak
- fix(debug-logger): enable late environment variable detection
- fix(model-cycling): improve OAuth error handling with typed errors
- fix(interactive-mode): improve update system reliability
- fix(nanopencil): correct MiniMax API endpoint from /anthropic to /v1
- fix(build): bundle zod to dist/node_modules for peerDependency resolution
- fix(interactive-mode): replace npm update with npm install in version check prompt
- fix(tui): show NanoMem command notifications
- fix(ai): avoid InvalidCharacterError when OAuth client placeholders are not base64
- fix(nanopencil): OpenRouter in /login and slim built-in OpenRouter models
- fix(memory): verify insights and startup presence behavior
- fix(auth): preserve provider api keys in config flows
- fix(presence): wait for ui readiness before greeting
- fix(tui): stabilize startup presence and user echo
- fix(memory): prioritize conversation preferences in recall
- fix(presence): show startup greeting after UI init
- fix(memory): shift runtime recall toward V2
- fix(memory): back up legacy data before maintenance
- fix(memory): stabilize recall and startup maintenance
- fix(release): rebuild bundled packages before publish
- fix(ci): add workspaces config for npm workspace commands
- fix(tui): prevent duplicate Working messages in PencilLoader
- fix(interview): stabilize trigger and clarification flow

### Changed
- refactor(i18n): translate all Chinese comments and strings to English

### Documentation
- docs(memory): add cognitive map and SAL experiment drafts
- docs(dip): add P2 for core/sub-agent and core/workspace; sync extensions/defaults
- docs: update CHANGELOG for 1.11.37
- docs: update CHANGELOG for 1.11.36
- docs: update CHANGELOG for 1.11.35
- docs(dip): complete DIP protocol compliance for all source files
- docs(team): restructure SubAgent and AgentTeam as two-phase plan
- docs(team): add agent team refactor plan
- docs: clarify build order; fix oauth client id decode; tidy tsconfig and vitest header
- docs(agent): expand AGENT.md with cognitive architecture and quality metrics
- docs(dip): add P3 file headers and layered AGENT.md navigation

### Maintenance
- chore(release): v1.11.39
- chore(release): v1.11.38
- chore(models): update generated model catalog
- chore: remove old /agent team extension
- chore(release): 1.11.35
- chore(ai): regenerate models.generated.ts after build
- chore: merge origin/main into main
- chore: merge origin/main into main
- chore: release v1.11.34
- chore: run changelog before build in prepublishOnly
- chore(release): 1.11.33
- chore(release): 1.11.32
- chore(release): 1.11.31
- chore(ai): update model definitions
- chore(release): publish v1.11.18
- chore(release): v1.11.17


## [1.11.37] - 2026-04-06

### Added
- feat(update): add /reinstall command and force update flag
- feat(subagent): add SubAgent runtime and /subagent command
- feat(ai): add MiniMax thinking tag support
- feat(model): improve OAuth token handling in model switching
- feat(debug): export debug logger from core module
- feat(debug): add comprehensive debug logging system for AI providers
- feat(interactive-mode): enhance update workflow with interactive options
- feat(model-selector): add Ctrl+N to append OpenRouter model by id
- feat(interactive): enhance custom editor and mode orchestration

### Fixed
- fix(loop): update duration parsing and help messages
- fix(loop): defer scheduler ticker until session_start
- fix(build): bundle zod for global install; workspace tsc; soul empty JSON
- fix(utils): improve clipboard timeout and image resize safety
- fix(interactive): improve clipboard and attachment error handling
- fix(clipboard): add missing @mariozechner/clipboard dependency
- fix(team): resolve theme color error and abort listener leak
- fix(debug-logger): enable late environment variable detection
- fix(model-cycling): improve OAuth error handling with typed errors
- fix(interactive-mode): improve update system reliability
- fix(nanopencil): correct MiniMax API endpoint from /anthropic to /v1
- fix(build): bundle zod to dist/node_modules for peerDependency resolution
- fix(interactive-mode): replace npm update with npm install in version check prompt
- fix(tui): show NanoMem command notifications
- fix(ai): avoid InvalidCharacterError when OAuth client placeholders are not base64
- fix(nanopencil): OpenRouter in /login and slim built-in OpenRouter models

### Changed
- refactor(i18n): translate all Chinese comments and strings to English

### Documentation
- docs: update CHANGELOG for 1.11.36
- docs: update CHANGELOG for 1.11.35
- docs(dip): complete DIP protocol compliance for all source files
- docs(team): restructure SubAgent and AgentTeam as two-phase plan
- docs(team): add agent team refactor plan
- docs: clarify build order; fix oauth client id decode; tidy tsconfig and vitest header

### Maintenance
- chore(release): 1.11.35
- chore(ai): regenerate models.generated.ts after build
- chore: merge origin/main into main
- chore: merge origin/main into main
- chore: release v1.11.34
- chore: run changelog before build in prepublishOnly
- chore(release): 1.11.33
- chore(release): 1.11.32
- chore(release): 1.11.31


## [1.11.36] - 2026-04-06

### Added
- feat(ai): add MiniMax thinking tag support
- feat(model): improve OAuth token handling in model switching
- feat(debug): export debug logger from core module
- feat(debug): add comprehensive debug logging system for AI providers
- feat(interactive-mode): enhance update workflow with interactive options
- feat(model-selector): add Ctrl+N to append OpenRouter model by id
- feat(interactive): enhance custom editor and mode orchestration

### Fixed
- fix(loop): defer scheduler ticker until session_start
- fix(build): bundle zod for global install; workspace tsc; soul empty JSON
- fix(utils): improve clipboard timeout and image resize safety
- fix(interactive): improve clipboard and attachment error handling
- fix(clipboard): add missing @mariozechner/clipboard dependency
- fix(team): resolve theme color error and abort listener leak
- fix(debug-logger): enable late environment variable detection
- fix(model-cycling): improve OAuth error handling with typed errors
- fix(interactive-mode): improve update system reliability
- fix(nanopencil): correct MiniMax API endpoint from /anthropic to /v1
- fix(build): bundle zod to dist/node_modules for peerDependency resolution
- fix(interactive-mode): replace npm update with npm install in version check prompt
- fix(tui): show NanoMem command notifications
- fix(ai): avoid InvalidCharacterError when OAuth client placeholders are not base64
- fix(nanopencil): OpenRouter in /login and slim built-in OpenRouter models

### Changed
- refactor(i18n): translate all Chinese comments and strings to English

### Documentation
- docs: update CHANGELOG for 1.11.35
- docs(dip): complete DIP protocol compliance for all source files
- docs(team): restructure SubAgent and AgentTeam as two-phase plan
- docs(team): add agent team refactor plan
- docs: clarify build order; fix oauth client id decode; tidy tsconfig and vitest header

### Maintenance
- chore(release): 1.11.35
- chore(ai): regenerate models.generated.ts after build
- chore: merge origin/main into main
- chore: merge origin/main into main
- chore: release v1.11.34
- chore: run changelog before build in prepublishOnly
- chore(release): 1.11.33
- chore(release): 1.11.32
- chore(release): 1.11.31


## [1.11.35] - 2026-04-06

### Added
- feat(ai): add MiniMax thinking tag support
- feat(model): improve OAuth token handling in model switching
- feat(debug): export debug logger from core module
- feat(debug): add comprehensive debug logging system for AI providers
- feat(interactive-mode): enhance update workflow with interactive options
- feat(model-selector): add Ctrl+N to append OpenRouter model by id
- feat(interactive): enhance custom editor and mode orchestration

### Fixed
- fix(build): bundle zod for global install; workspace tsc; soul empty JSON
- fix(utils): improve clipboard timeout and image resize safety
- fix(interactive): improve clipboard and attachment error handling
- fix(clipboard): add missing @mariozechner/clipboard dependency
- fix(team): resolve theme color error and abort listener leak
- fix(debug-logger): enable late environment variable detection
- fix(model-cycling): improve OAuth error handling with typed errors
- fix(interactive-mode): improve update system reliability
- fix(nanopencil): correct MiniMax API endpoint from /anthropic to /v1
- fix(build): bundle zod to dist/node_modules for peerDependency resolution
- fix(interactive-mode): replace npm update with npm install in version check prompt
- fix(tui): show NanoMem command notifications
- fix(ai): avoid InvalidCharacterError when OAuth client placeholders are not base64
- fix(nanopencil): OpenRouter in /login and slim built-in OpenRouter models

### Changed
- refactor(i18n): translate all Chinese comments and strings to English

### Documentation
- docs(dip): complete DIP protocol compliance for all source files
- docs(team): restructure SubAgent and AgentTeam as two-phase plan
- docs(team): add agent team refactor plan
- docs: clarify build order; fix oauth client id decode; tidy tsconfig and vitest header

### Maintenance
- chore(release): 1.11.35
- chore(ai): regenerate models.generated.ts after build
- chore: merge origin/main into main
- chore: merge origin/main into main
- chore: release v1.11.34
- chore: run changelog before build in prepublishOnly
- chore(release): 1.11.33
- chore(release): 1.11.32
- chore(release): 1.11.31


## [1.11.34] - 2026-04-04

### Added
- feat(ai): add MiniMax thinking tag support
- feat(model): improve OAuth token handling in model switching
- feat(debug): export debug logger from core module
- feat(debug): add comprehensive debug logging system for AI providers
- feat(interactive-mode): enhance update workflow with interactive options
- feat(model-selector): add Ctrl+N to append OpenRouter model by id
- feat(interactive): enhance custom editor and mode orchestration
- feat(auth): expose openrouter in login selector
- feat(presence): add gentle proactive chat extension
- feat(mem-core): retain superseded procedural rows on merge
- feat(interview): synchronous before_agent_start hook and heuristics
- feat(mem-core): release v1.1.0
- feat(mem-core): add semantic recall and reconsolidation loop
- feat(i18n): add internationalization support (EN/ZH)
- feat(mem-core): add v2 episodic and procedural memory bridge
- feat(dream): add abortable consolidation and auto-dream gating

### Fixed
- fix(debug-logger): enable late environment variable detection
- fix(model-cycling): improve OAuth error handling with typed errors
- fix(interactive-mode): improve update system reliability
- fix(nanopencil): correct MiniMax API endpoint from /anthropic to /v1
- fix(build): bundle zod to dist/node_modules for peerDependency resolution
- fix(interactive-mode): replace npm update with npm install in version check prompt
- fix(tui): show NanoMem command notifications
- fix(ai): avoid InvalidCharacterError when OAuth client placeholders are not base64
- fix(nanopencil): OpenRouter in /login and slim built-in OpenRouter models
- fix(memory): verify insights and startup presence behavior
- fix(auth): preserve provider api keys in config flows
- fix(presence): wait for ui readiness before greeting
- fix(tui): stabilize startup presence and user echo
- fix(memory): prioritize conversation preferences in recall
- fix(presence): show startup greeting after UI init
- fix(memory): shift runtime recall toward V2
- fix(memory): back up legacy data before maintenance
- fix(memory): stabilize recall and startup maintenance
- fix(release): rebuild bundled packages before publish
- fix(ci): add workspaces config for npm workspace commands
- fix(tui): prevent duplicate Working messages in PencilLoader
- fix(interview): stabilize trigger and clarification flow

### Documentation
- docs: clarify build order; fix oauth client id decode; tidy tsconfig and vitest header
- docs(agent): expand AGENT.md with cognitive architecture and quality metrics
- docs(dip): add P3 file headers and layered AGENT.md navigation

### Maintenance
- chore: release v1.11.34
- chore: run changelog before build in prepublishOnly
- chore(release): 1.11.32
- chore(release): 1.11.31
- chore(ai): update model definitions
- chore(release): publish v1.11.18
- chore(release): v1.11.17


## [1.11.34] - 2026-04-04

### Added
- feat(ai): add MiniMax thinking tag support
- feat(model): improve OAuth token handling in model switching
- feat(debug): export debug logger from core module
- feat(debug): add comprehensive debug logging system for AI providers
- feat(interactive-mode): enhance update workflow with interactive options
- feat(model-selector): add Ctrl+N to append OpenRouter model by id
- feat(interactive): enhance custom editor and mode orchestration
- feat(auth): expose openrouter in login selector
- feat(presence): add gentle proactive chat extension
- feat(mem-core): retain superseded procedural rows on merge
- feat(interview): synchronous before_agent_start hook and heuristics
- feat(mem-core): release v1.1.0
- feat(mem-core): add semantic recall and reconsolidation loop
- feat(i18n): add internationalization support (EN/ZH)
- feat(mem-core): add v2 episodic and procedural memory bridge
- feat(dream): add abortable consolidation and auto-dream gating

### Fixed
- fix(debug-logger): enable late environment variable detection
- fix(model-cycling): improve OAuth error handling with typed errors
- fix(interactive-mode): improve update system reliability
- fix(nanopencil): correct MiniMax API endpoint from /anthropic to /v1
- fix(build): bundle zod to dist/node_modules for peerDependency resolution
- fix(interactive-mode): replace npm update with npm install in version check prompt
- fix(tui): show NanoMem command notifications
- fix(ai): avoid InvalidCharacterError when OAuth client placeholders are not base64
- fix(nanopencil): OpenRouter in /login and slim built-in OpenRouter models
- fix(memory): verify insights and startup presence behavior
- fix(auth): preserve provider api keys in config flows
- fix(presence): wait for ui readiness before greeting
- fix(tui): stabilize startup presence and user echo
- fix(memory): prioritize conversation preferences in recall
- fix(presence): show startup greeting after UI init
- fix(memory): shift runtime recall toward V2
- fix(memory): back up legacy data before maintenance
- fix(memory): stabilize recall and startup maintenance
- fix(release): rebuild bundled packages before publish
- fix(ci): add workspaces config for npm workspace commands
- fix(tui): prevent duplicate Working messages in PencilLoader
- fix(interview): stabilize trigger and clarification flow

### Documentation
- docs: clarify build order; fix oauth client id decode; tidy tsconfig and vitest header
- docs(agent): expand AGENT.md with cognitive architecture and quality metrics
- docs(dip): add P3 file headers and layered AGENT.md navigation

### Maintenance
- chore: release v1.11.34
- chore: run changelog before build in prepublishOnly
- chore(release): 1.11.32
- chore(release): 1.11.31
- chore(ai): update model definitions
- chore(release): publish v1.11.18
- chore(release): v1.11.17


## [1.11.34] - 2026-04-04

### Added
- feat(ai): add MiniMax thinking tag support
- feat(model): improve OAuth token handling in model switching
- feat(debug): export debug logger from core module
- feat(debug): add comprehensive debug logging system for AI providers
- feat(interactive-mode): enhance update workflow with interactive options
- feat(model-selector): add Ctrl+N to append OpenRouter model by id
- feat(interactive): enhance custom editor and mode orchestration
- feat(auth): expose openrouter in login selector
- feat(presence): add gentle proactive chat extension
- feat(mem-core): retain superseded procedural rows on merge
- feat(interview): synchronous before_agent_start hook and heuristics
- feat(mem-core): release v1.1.0
- feat(mem-core): add semantic recall and reconsolidation loop
- feat(i18n): add internationalization support (EN/ZH)
- feat(mem-core): add v2 episodic and procedural memory bridge
- feat(dream): add abortable consolidation and auto-dream gating

### Fixed
- fix(debug-logger): enable late environment variable detection
- fix(model-cycling): improve OAuth error handling with typed errors
- fix(interactive-mode): improve update system reliability
- fix(nanopencil): correct MiniMax API endpoint from /anthropic to /v1
- fix(build): bundle zod to dist/node_modules for peerDependency resolution
- fix(interactive-mode): replace npm update with npm install in version check prompt
- fix(tui): show NanoMem command notifications
- fix(ai): avoid InvalidCharacterError when OAuth client placeholders are not base64
- fix(nanopencil): OpenRouter in /login and slim built-in OpenRouter models
- fix(memory): verify insights and startup presence behavior
- fix(auth): preserve provider api keys in config flows
- fix(presence): wait for ui readiness before greeting
- fix(tui): stabilize startup presence and user echo
- fix(memory): prioritize conversation preferences in recall
- fix(presence): show startup greeting after UI init
- fix(memory): shift runtime recall toward V2
- fix(memory): back up legacy data before maintenance
- fix(memory): stabilize recall and startup maintenance
- fix(release): rebuild bundled packages before publish
- fix(ci): add workspaces config for npm workspace commands
- fix(tui): prevent duplicate Working messages in PencilLoader
- fix(interview): stabilize trigger and clarification flow

### Documentation
- docs: clarify build order; fix oauth client id decode; tidy tsconfig and vitest header
- docs(agent): expand AGENT.md with cognitive architecture and quality metrics
- docs(dip): add P3 file headers and layered AGENT.md navigation

### Maintenance
- chore: release v1.11.34
- chore: run changelog before build in prepublishOnly
- chore(release): 1.11.32
- chore(release): 1.11.31
- chore(ai): update model definitions
- chore(release): publish v1.11.18
- chore(release): v1.11.17


## [1.11.34] - 2026-04-04

### Added
- feat(ai): add MiniMax thinking tag support
- feat(model): improve OAuth token handling in model switching
- feat(debug): export debug logger from core module
- feat(debug): add comprehensive debug logging system for AI providers
- feat(interactive-mode): enhance update workflow with interactive options
- feat(model-selector): add Ctrl+N to append OpenRouter model by id
- feat(interactive): enhance custom editor and mode orchestration
- feat(auth): expose openrouter in login selector
- feat(presence): add gentle proactive chat extension
- feat(mem-core): retain superseded procedural rows on merge
- feat(interview): synchronous before_agent_start hook and heuristics
- feat(mem-core): release v1.1.0
- feat(mem-core): add semantic recall and reconsolidation loop
- feat(i18n): add internationalization support (EN/ZH)
- feat(mem-core): add v2 episodic and procedural memory bridge
- feat(dream): add abortable consolidation and auto-dream gating

### Fixed
- fix(debug-logger): enable late environment variable detection
- fix(model-cycling): improve OAuth error handling with typed errors
- fix(interactive-mode): improve update system reliability
- fix(nanopencil): correct MiniMax API endpoint from /anthropic to /v1
- fix(build): bundle zod to dist/node_modules for peerDependency resolution
- fix(interactive-mode): replace npm update with npm install in version check prompt
- fix(tui): show NanoMem command notifications
- fix(ai): avoid InvalidCharacterError when OAuth client placeholders are not base64
- fix(nanopencil): OpenRouter in /login and slim built-in OpenRouter models
- fix(memory): verify insights and startup presence behavior
- fix(auth): preserve provider api keys in config flows
- fix(presence): wait for ui readiness before greeting
- fix(tui): stabilize startup presence and user echo
- fix(memory): prioritize conversation preferences in recall
- fix(presence): show startup greeting after UI init
- fix(memory): shift runtime recall toward V2
- fix(memory): back up legacy data before maintenance
- fix(memory): stabilize recall and startup maintenance
- fix(release): rebuild bundled packages before publish
- fix(ci): add workspaces config for npm workspace commands
- fix(tui): prevent duplicate Working messages in PencilLoader
- fix(interview): stabilize trigger and clarification flow

### Documentation
- docs: clarify build order; fix oauth client id decode; tidy tsconfig and vitest header
- docs(agent): expand AGENT.md with cognitive architecture and quality metrics
- docs(dip): add P3 file headers and layered AGENT.md navigation

### Maintenance
- chore: release v1.11.34
- chore: run changelog before build in prepublishOnly
- chore(release): 1.11.32
- chore(release): 1.11.31
- chore(ai): update model definitions
- chore(release): publish v1.11.18
- chore(release): v1.11.17


## [1.11.32] - 2026-04-04

### Added
- feat(ai): add MiniMax thinking tag support
- feat(model): improve OAuth token handling in model switching
- feat(debug): export debug logger from core module
- feat(debug): add comprehensive debug logging system for AI providers
- feat(interactive-mode): enhance update workflow with interactive options
- feat(model-selector): add Ctrl+N to append OpenRouter model by id
- feat(interactive): enhance custom editor and mode orchestration
- feat(auth): expose openrouter in login selector
- feat(presence): add gentle proactive chat extension
- feat(mem-core): retain superseded procedural rows on merge
- feat(interview): synchronous before_agent_start hook and heuristics
- feat(mem-core): release v1.1.0
- feat(mem-core): add semantic recall and reconsolidation loop
- feat(i18n): add internationalization support (EN/ZH)
- feat(mem-core): add v2 episodic and procedural memory bridge
- feat(dream): add abortable consolidation and auto-dream gating

### Fixed
- fix(debug-logger): enable late environment variable detection
- fix(model-cycling): improve OAuth error handling with typed errors
- fix(interactive-mode): improve update system reliability
- fix(nanopencil): correct MiniMax API endpoint from /anthropic to /v1
- fix(build): bundle zod to dist/node_modules for peerDependency resolution
- fix(interactive-mode): replace npm update with npm install in version check prompt
- fix(tui): show NanoMem command notifications
- fix(ai): avoid InvalidCharacterError when OAuth client placeholders are not base64
- fix(nanopencil): OpenRouter in /login and slim built-in OpenRouter models
- fix(memory): verify insights and startup presence behavior
- fix(auth): preserve provider api keys in config flows
- fix(presence): wait for ui readiness before greeting
- fix(tui): stabilize startup presence and user echo
- fix(memory): prioritize conversation preferences in recall
- fix(presence): show startup greeting after UI init
- fix(memory): shift runtime recall toward V2
- fix(memory): back up legacy data before maintenance
- fix(memory): stabilize recall and startup maintenance
- fix(release): rebuild bundled packages before publish
- fix(ci): add workspaces config for npm workspace commands
- fix(tui): prevent duplicate Working messages in PencilLoader
- fix(interview): stabilize trigger and clarification flow

### Documentation
- docs: clarify build order; fix oauth client id decode; tidy tsconfig and vitest header
- docs(agent): expand AGENT.md with cognitive architecture and quality metrics
- docs(dip): add P3 file headers and layered AGENT.md navigation

### Maintenance
- chore: run changelog before build in prepublishOnly
- chore(release): 1.11.32
- chore(release): 1.11.31
- chore(ai): update model definitions
- chore(release): publish v1.11.18
- chore(release): v1.11.17


## [1.11.32] - 2026-04-04

### Fixed
- fix(ai): avoid InvalidCharacterError when OAuth client placeholders are not base64
- fix(nanopencil): OpenRouter in /login and slim built-in OpenRouter models

### Documentation
- docs: clarify build order; fix oauth client id decode; tidy tsconfig and vitest header

### Maintenance
- chore(release): 1.11.31


## [1.11.31] - 2026-04-04

### Added
- feat(auth): expose openrouter in login selector
- feat(presence): add gentle proactive chat extension
- feat(mem-core): retain superseded procedural rows on merge
- feat(interview): synchronous before_agent_start hook and heuristics
- feat(mem-core): release v1.1.0
- feat(mem-core): add semantic recall and reconsolidation loop
- feat(i18n): add internationalization support (EN/ZH)
- feat(mem-core): add v2 episodic and procedural memory bridge
- feat(dream): add abortable consolidation and auto-dream gating

### Fixed
- fix(nanopencil): OpenRouter 在 /login 与精简内置模型列表
- fix(memory): verify insights and startup presence behavior
- fix(auth): preserve provider api keys in config flows
- fix(presence): wait for ui readiness before greeting
- fix(tui): stabilize startup presence and user echo
- fix(memory): prioritize conversation preferences in recall
- fix(presence): show startup greeting after UI init
- fix(memory): shift runtime recall toward V2
- fix(memory): back up legacy data before maintenance
- fix(memory): stabilize recall and startup maintenance
- fix(release): rebuild bundled packages before publish
- fix(ci): add workspaces config for npm workspace commands
- fix(tui): prevent duplicate Working messages in PencilLoader
- fix(interview): stabilize trigger and clarification flow

### Documentation
- docs(agent): expand AGENT.md with cognitive architecture and quality metrics
- docs(dip): add P3 file headers and layered AGENT.md navigation

### Maintenance
- chore(ai): update model definitions
- chore(release): publish v1.11.18
- chore(release): v1.11.17


## [1.11.15] - 2026-03-30

### Added
- feat(acp): improve zed agent parity
- feat(figma): improve remote MCP authentication flow
- feat(agent): hide internal traces and improve time grounding
- feat(mem): add graph-driven memory governance
- feat(team): add multi-agent team orchestration extension
- feat(providers): support custom protocol endpoints
- feat(loop): replace timer loop with autonomous task loop

### Fixed
- fix(acp): improve zed loop and team progress visibility
- fix(mcp): load runtime config from the active MCP path
- fix(interactive): harden extension prompt focus flow
- fix(runtime): tighten workspace handling and startup prompts @o-pencil-agent
- fix(runtime): improve loop recovery and insights reporting
- fix(deps): add zod runtime dependency
- fix(ux): improve custom provider messaging
- fix(providers): reopen and refresh custom provider edits
- fix(providers): streamline custom provider setup
- fix: extract clipboard image data before sending to model

### Documentation
- docs(prompt): refine project assistant charter @o-pencil-agent
- docs(agents): require English for code strings and commits

### Maintenance
- chore(release): prepare 1.11.15 changelog
- chore(release): publish 1.11.15
- chore(release): prepare 1.11.14 changelog
- chore(release): prepare 1.11.13 changelog
- chore(release): publish 1.11.12
- chore(release): prepare 1.11.12 changelog
- chore(release): publish 1.11.11
- chore(release): publish 1.11.10
- chore(release): publish 1.11.8
- chore(release): publish 1.11.6
- chore(release): publish 1.11.5


## [1.11.15] - 2026-03-31

### Added
- feat(acp): improve zed agent parity
- feat(figma): improve remote MCP authentication flow
- feat(agent): hide internal traces and improve time grounding
- feat(mem): add graph-driven memory governance
- feat(team): add multi-agent team orchestration extension
- feat(providers): support custom protocol endpoints
- feat(loop): replace timer loop with autonomous task loop

### Fixed
- fix(mcp): load runtime config from the active MCP path
- fix(interactive): harden extension prompt focus flow
- fix(runtime): tighten workspace handling and startup prompts @o-pencil-agent
- fix(runtime): improve loop recovery and insights reporting
- fix(deps): add zod runtime dependency
- fix(ux): improve custom provider messaging
- fix(providers): reopen and refresh custom provider edits
- fix(providers): streamline custom provider setup
- fix: extract clipboard image data before sending to model

### Documentation
- docs(prompt): refine project assistant charter @o-pencil-agent
- docs(agents): require English for code strings and commits

### Maintenance
- chore(release): prepare 1.11.14 changelog
- chore(release): prepare 1.11.13 changelog
- chore(release): publish 1.11.12
- chore(release): prepare 1.11.12 changelog
- chore(release): publish 1.11.11
- chore(release): publish 1.11.10
- chore(release): publish 1.11.8
- chore(release): publish 1.11.6
- chore(release): publish 1.11.5


## [1.11.13] - 2026-03-29

### Added
- feat(figma): improve remote MCP authentication flow
- feat(agent): hide internal traces and improve time grounding
- feat(mem): add graph-driven memory governance
- feat(team): add multi-agent team orchestration extension
- feat(providers): support custom protocol endpoints
- feat(loop): replace timer loop with autonomous task loop

### Fixed
- fix(mcp): load runtime config from the active MCP path
- fix(interactive): harden extension prompt focus flow
- fix(runtime): tighten workspace handling and startup prompts @o-pencil-agent
- fix(runtime): improve loop recovery and insights reporting
- fix(deps): add zod runtime dependency
- fix(ux): improve custom provider messaging
- fix(providers): reopen and refresh custom provider edits
- fix(providers): streamline custom provider setup
- fix: extract clipboard image data before sending to model

### Documentation
- docs(prompt): refine project assistant charter @o-pencil-agent
- docs(agents): require English for code strings and commits

### Maintenance
- chore(release): prepare 1.11.13 changelog
- chore(release): publish 1.11.12
- chore(release): prepare 1.11.12 changelog
- chore(release): publish 1.11.11
- chore(release): publish 1.11.10
- chore(release): publish 1.11.8
- chore(release): publish 1.11.6
- chore(release): publish 1.11.5


## [1.11.13] - 2026-03-30

### Added
- feat(figma): add standalone Figma MCP OAuth groundwork and built-in Figma setup guidance

### Fixed
- fix(mcp): support streamable HTTP event-stream responses for remote MCP servers
- fix(mcp): allow HTTP MCP tools to execute through the NanoPencil MCP client
- fix(figma): make remote Figma MCP usable through built-in presets and authenticated tool discovery

## [1.11.12] - 2026-03-29

### Fixed
- Hardened interactive extension prompt focus handling so interview selectors, extension inputs, and multiline editors recover focus more reliably.
- Prevented stale prompt abort/cancel callbacks from dismissing a newer prompt, reducing the risk of blocked input during long-running or multi-step interactions.
- Restored editor focus more consistently around agent start/end transitions so users can keep typing while execution continues.


## [1.11.11] - 2026-03-29

### Added
- Added separate switches to hide working traces and NanoMem traces by default, making chat responses feel more natural.
- Added a built-in `time` tool so the agent can confirm the real current system time for time-sensitive questions.

### Changed
- Refresh the system prompt timestamp on every turn instead of relying on the session startup time.
- Include real system time context in NanoMem transcript extraction and store episode start/end time metadata for longer-term temporal recall.


## [1.11.10] - 2026-03-29

### Added
- **NanoMem memory governance**
  - Added key event memory, progressive graph context, and relation-aware recall
  - Added current state signals to separate short-term state from stable identity
  - Added alignment snapshot, conflict detection, and review tooling
  - Added memory editing and conflict resolution commands/tools

### Changed
- **NanoMem retrieval and forgetting**
  - Prioritize core memory and key events in progressive disclosure
  - Strengthen graph edges on successful recall and decay weak links over time
  - Let low-signal ambient and situational memory fade faster

### Fixed
- Reduced memory drift caused by temporary mood or short-lived context
- Reduced duplicate cue/context injection by de-duplicating graph neighbors and cue memories

---

## [1.11.2] - 2026-03-19

### Added
- **Interview 扩展优化**
  - 降低 Interview 触发频率，只在模糊需求或短文本时触发
  - 添加 `NANOPENCIL_JUST_SWITCHED_PERSONA` 环境变量，人格切换后跳过 interview
  - 添加 Interview 过程可视化（状态栏和通知）
- **人格包一键切换**: 支持在同一运行环境下按角色隔离 Pencil/Soul/NanoMEM/Skills/MCP 并通过 reload 即时生效

### Fixed
- 修复 /persona 命令在混合消息中无法识别的问题
- 修复版本比较逻辑导致低版本误报更新提示

---

## [1.11.1] - 2026-03-11

### Added
- **Interview 扩展**: 需求澄清扩展，类似 Cursor/Claude Interview，通过交互式问答帮助用户明确需求

### Fixed
- 修复 interview 扩展类型错误
- 更新模型配置

---

## [1.11.0] - 2026-03-10

### Added
- **架构重构**
  - 抽取 AgentSession 协调器，职责更清晰
  - system-prompt 动态化
  - MCP 抽象化为扩展 + ToolSource 接口

### Changed
- **目录重构**
  - `core/` 重构为子目录结构
  - `extensions/` 拆分为 `defaults/` 和 `optional/`
  - `nano-mem` -> `mem-core`, `soul` -> `soul-core`
  - `utils` 目录归类

### Added
- **NanoMem 新功能**
  - 新增 namespaced tools 和 priority 系统
  - 新增 human-insights 模块
  - 新增 generateEnhancedInsights 方法
  - 新增大白话洞察类型和 Prompt

---

## [1.10.7] - 2026-02-28

### Added
- 优化记忆系统提示词，使其更自然类人
- 添加对百度千帆和火山方舟 Coding Plan 的支持
- link-world 扩展支持自动检测并加载 internet-search skill

---

## [1.10.6] - 2026-02-20

### Added
- 添加 MiniMax 和智谱 Coding Plan 支持

---

## [1.10.5] - 2026-02-15

### Added
- 安全审计扩展添加拦截模式 (strict)

---

## [1.10.4] - 2026-02-10

### Fixed
- 将 security-audit 添加到内置扩展加载列表

---

## [1.10.3] - 2026-02-05

### Added
- Security Audit Extension 安全审计扩展

---

## [1.10.2] - 2026-01-28

### Added
- 更新模型选择器以支持无认证模型和 API 密钥提示
- 优化 context 使用显示和颜色逻辑

---

## [1.10.1] - 2026-01-20

### Fixed
- 修复构建脚本和 skill 目录结构

---

## [1.10.0] - 2026-01-15

### Added
- 统一 Soul 包并迁移为扩展

---

*Changelog generated from commit history. For older releases, please refer to git history.*
