#!/usr/bin/env node
/**
 * [WHO]: CLI entry point, sets process.title, calls main()
 * [FROM]: Depends on main.ts
 * [TO]: Consumed by bin/nanopencil (npm binary)
 * [HERE]: Entry point; orchestrates argument parsing and mode selection
 */
process.title = "nanopencil";

import { main } from "./main.js";

main(process.argv.slice(2));
