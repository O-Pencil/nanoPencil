#!/usr/bin/env node
/**
 * [UPSTREAM]: Depends on main.ts
 * [SURFACE]: CLI entry point, sets process.title, calls main()
 * [LOCUS]: Entry point; orchestrates argument parsing and mode selection
 * [COVENANT]: Change CLI behavior → update AGENTS.md build commands
 */
process.title = "nanopencil";

import { main } from "./main.js";

main(process.argv.slice(2));
