// tackline-hooks.ts -- OpenCode hooks plugin
// Ported from tackline's hooks/hooks.json
// All hooks fail gracefully and target <500ms execution

import { execSync } from "child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";

const MEMORY = ".opencode/memory";

function run(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf-8", timeout: 3000 }).trim();
  } catch {
    return "";
  }
}

// --- session.created (replaces SessionStart) ---
// Display git diagnostics at session start
export function onSessionCreated() {
  const lastCommits = run("git log --oneline -3 2>/dev/null")
    .split("\n")
    .map((l) => `Last:    ${l}`)
    .join("\n");
  const uncommitted = run(
    "git status --short 2>/dev/null | wc -l"
  );
  console.log("=== Session Start ===");
  console.log(lastCommits);
  console.log(`Tree:    ${uncommitted} uncommitted files`);
  console.log("=== ===");
}

// --- session.compacted + message.updated (replaces PreCompact) ---
// Note: OpenCode fires AFTER compaction, not before.
// Use message.updated for pre-compaction state if needed.
export function onSessionCompacted() {
  const dir = `${MEMORY}/sessions`;
  mkdirSync(dir, { recursive: true });
  const now = new Date().toISOString();
  const commits = run("git log --oneline -5 2>/dev/null") || "(no git)";
  const tree = run("git status --short 2>/dev/null") || "(no git)";
  const content = `## Pre-Compact Snapshot
**Time**: ${now}

### Recent Commits
${commits}

### Working Tree
${tree}

### Open Questions
(fill in before context is lost)

### Working Theories
(fill in before context is lost)

### Key Decisions
(fill in before context is lost)
`;
  writeFileSync(`${dir}/pre-compact.md`, content);
}

// --- tool.execute.before (replaces PreToolUse Bash) ---
// Warn on destructive commands
export function onToolExecuteBefore(toolName: string, input: string) {
  if (toolName !== "Bash") return;
  const patterns = [
    { re: /git reset --hard/, msg: "git reset --hard will discard all uncommitted changes" },
    { re: /git checkout \./, msg: "git checkout . will discard all unstaged changes" },
    { re: /git clean -f/, msg: "git clean -f will permanently delete untracked files" },
    { re: /rm -rf [^"]*[^/.]/, msg: "rm -rf detected on a non-trivial path" },
  ];
  for (const { re, msg } of patterns) {
    if (re.test(input)) {
      console.error(`DESTRUCTIVE WARNING: ${msg}. This is irreversible.`);
      return;
    }
  }
}

// --- tool.execute.after (replaces PostToolUse Task + Skill) ---
export function onToolExecuteAfter(toolName: string, _input: string) {
  if (toolName === "Task") {
    console.error(
      "REVIEW GATE: Agent completed. Verify deliverable quality before proceeding:\n" +
      "  [ ] Spike sections present\n" +
      "  [ ] Findings tagged with confidence: CONFIRMED | LIKELY | POSSIBLE\n" +
      "  [ ] Evidence includes file paths and line numbers\n" +
      "  [ ] Gaps captured as new tasks"
    );
  }
  // Skill telemetry is optional -- implement if you have a telemetry path
}

// --- tui.prompt.append (replaces UserPromptSubmit) ---
// Domain context injection from .opencode/memory/project/domain.md
export function onPromptAppend(prompt: string): string | undefined {
  const domainPath = `${MEMORY}/project/domain.md`;
  if (!existsSync(domainPath)) return undefined;
  const text = readFileSync(domainPath, "utf-8");
  const blocks = text.split(/(?=^## )/m).filter((b) => b.startsWith("## "));
  const matched = blocks.filter((b) => {
    const m = b.match(/^## (.+)/);
    return m && new RegExp(m[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "i").test(prompt);
  });
  if (matched.length === 0) return undefined;
  return "<!-- domain-context -->\n" + matched.map((b) => b.trim()).join("\n\n");
}

// --- NO SessionEnd equivalent ---
// OpenCode has no SessionEnd hook. Use periodic checkpoints
// and an explicit /archive-session command instead.
