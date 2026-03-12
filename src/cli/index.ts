#!/usr/bin/env node
import { Command } from "commander";
import { listCommand } from "./commands/list.js";
import { statsCommand } from "./commands/stats.js";
import { violationsCommand } from "./commands/violations.js";
import { inferCommand } from "./commands/infer.js";

const program = new Command();

program
  .name("progressive-zod")
  .description("Runtime type observability — progressively replace `any` with real Zod schemas")
  .version("0.1.0");

program
  .command("list")
  .description("List all monitored type names")
  .action(listCommand);

program
  .command("stats")
  .argument("<name>", "Type name to show stats for")
  .description("Show conform/violate statistics for a type")
  .action(statsCommand);

program
  .command("violations")
  .argument("<name>", "Type name to show violations for")
  .option("-l, --limit <n>", "Number of violations to show", "10")
  .description("Show recent non-conforming payloads")
  .action(violationsCommand);

program
  .command("infer")
  .argument("<name>", "Type name to infer schema for")
  .description("Generate a Zod schema from observed samples")
  .action(inferCommand);

program.parse();
