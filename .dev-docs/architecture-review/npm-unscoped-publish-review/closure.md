# Closure

Implemented:

- Renamed the root publish package to `catui-agent`.
- Renamed first-party published packages to `catui-protocol`, `catui-mem`, and
  `catui-soul`.
- Updated package dependencies and protocol imports to the new public names.
- Kept private internal workspace package names unchanged.

Deferred:

- Historical `@catui/*` references in older architecture-review records remain
  as historical context unless a documentation sweep is requested.
