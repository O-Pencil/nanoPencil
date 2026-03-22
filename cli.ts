#!/usr/bin/env node
/**
 * CLI entry point for NanoPencil.
 * Uses main.ts with AgentSession and new mode modules.
 *
 * Test with: npx tsx cli.ts [args...]
 */
process.title = "nanopencil";

import { main } from "./main.js";

main(process.argv.slice(2));
