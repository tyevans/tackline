// tackline-hooks.ts -- OpenCode hooks plugin
// Ported from tackline's hooks/hooks.json
// All hooks fail gracefully and target <500ms execution

import type { Plugin } from "@opencode-ai/plugin"
import { execSync } from "child_process"
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "fs"

const MEMORY = ".opencode/memory"

function run(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf-8", timeout: 3000 }).trim()
  } catch {
    return ""
  }
}

export const TacklineHooks: Plugin = async (ctx) => {
  return {
    event: async ({ event }) => {
      // --- session.created (replaces SessionStart) ---
      if (event.type === "session.created") {
        const lastCommits = run("git log --oneline -3 2>/dev/null")
          .split("\n")
          .map((l) => `Last:    ${l}`)
          .join("\n")
        const uncommitted = run("git status --short 2>/dev/null | wc -l")
        console.log("=== Session Start ===")
        console.log(lastCommits)
        console.log(`Tree:    ${uncommitted} uncommitted files`)
        console.log("=== ===")
      }

      // --- session.compacted (replaces PreCompact) ---
      // Note: fires AFTER compaction, not before
      if (event.type === "session.compacted") {
        const dir = `${MEMORY}/sessions`
        mkdirSync(dir, { recursive: true })
        const now = new Date().toISOString()
        const commits = run("git log --oneline -5 2>/dev/null") || "(no git)"
        const tree = run("git status --short 2>/dev/null") || "(no git)"
        const content = `## Pre-Compact Snapshot\n**Time**: ${now}\n\n### Recent Commits\n${commits}\n\n### Working Tree\n${tree}\n`
        writeFileSync(`${dir}/pre-compact.md`, content)
      }
    },

    // --- tool.execute.before (replaces PreToolUse Bash) ---
    "tool.execute.before": async (input, output) => {
      if (input.tool !== "Bash") return
      const cmd = typeof input.args === "string" ? input.args : JSON.stringify(input.args)
      const patterns = [
        { re: /git reset --hard/, msg: "git reset --hard will discard all uncommitted changes" },
        { re: /git checkout \./, msg: "git checkout . will discard all unstaged changes" },
        { re: /git clean -f/, msg: "git clean -f will permanently delete untracked files" },
        { re: /rm -rf [^"]*[^/.]/, msg: "rm -rf detected on a non-trivial path" },
      ]
      for (const { re, msg } of patterns) {
        if (re.test(cmd)) {
          console.error(`DESTRUCTIVE WARNING: ${msg}. This is irreversible.`)
          return
        }
      }
    },

    // --- tool.execute.after (replaces PostToolUse Task + Skill) ---
    "tool.execute.after": async (input, output) => {
      if (input.tool === "Task") {
        console.error(
          "REVIEW GATE: Agent completed. Verify deliverable quality before proceeding:\n" +
          "  [ ] Findings tagged with confidence: CONFIRMED | LIKELY | POSSIBLE\n" +
          "  [ ] Evidence includes file paths and line numbers\n" +
          "  [ ] Gaps captured as new tasks"
        )
      }
    },

    // --- NO SessionEnd equivalent ---
    // Use periodic checkpoints and /archive-session command instead.
  }
}
