# Startup ASCII Banner Review

## Scope

Restore the Catui startup welcome banner and README artwork to the historical catui moon-and-cats ASCII from commit `7b427f1848a3c6674b2a83ad4f86b7f628fcb331`.

## Owner

`modes/interactive/interactive-mode.ts` owns the interactive startup welcome banner. `README.md` and `README_CN.md` mirror the static first frame for package documentation.

## Decision

Use the historical ASCII frame directly in the existing `buildAsciiLines()` path. Keep the current Catui package title (`catui-agent v...`) and only restore the artwork.

## Acceptance

- Startup banner renders the moon, stars, and two cats.
- README and README_CN use the same static frame.
- Build passes.
