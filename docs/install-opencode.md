# Installing Tackline for OpenCode

Port tackline's 54 skills, 3 agents, 10 rules, hooks, and MCP servers to an OpenCode project.

## Prerequisites

- [OpenCode](https://opencode.ai) installed and configured
- A git repository (tackline's memory system is file-based)
- Node.js 18+ or Bun (for MCP servers and the hooks plugin)
- A local clone of tackline: `git clone https://github.com/tyevans/tackline.git`

## 1. Directory Structure

Create the `.opencode/` layout in your project root:

```bash
mkdir -p .opencode/{memory/{sessions,agents,team,epics,project,scratch},skills,agents,commands,plugins}
```

Result:

```
.opencode/
├── memory/
│   ├── sessions/
│   ├── agents/
│   ├── team/
│   ├── epics/
│   ├── project/
│   └── scratch/
├── skills/
├── agents/
├── commands/
└── plugins/
opencode.json          # <-- project root, NOT inside .opencode/
```

## 2. Skills Installation

Tackline organizes skills in three tiers: `core/`, `workflows/`, `teams/`. OpenCode expects a flat structure under `.opencode/skills/`.

### Copy and flatten

```bash
TACKLINE=/path/to/tackline

# Core skills (16)
for d in gather distill rank filter assess verify expand transform decompose \
         critique plan merge diff-ideas sketch do discover; do
  cp -r "$TACKLINE/skills/core/$d" .opencode/skills/
done

# Workflow skills (29)
for d in advise blossom bootstrap bug challenge-gen challenge-run consensus \
         consolidate deploy diagnose-agent domain drift drive evolution \
         formalize fractal handoff integrate meeting optimize premortem \
         review review-meeting session-health spec status storm-prep \
         test-strategy tracer; do
  cp -r "$TACKLINE/skills/workflows/$d" .opencode/skills/
done

# Team skills (9)
for d in active-learn assemble curate promote retro sprint standup \
         team-meeting tend; do
  cp -r "$TACKLINE/skills/teams/$d" .opencode/skills/
done
```

### Fix memory paths

Team skills reference `.claude/tackline/memory/`. Replace with `.opencode/memory/`:

```bash
cd .opencode/skills
# Linux:
grep -rl '.claude/tackline/memory/' . | xargs sed -i 's|\.claude/tackline/memory/|.opencode/memory/|g'
# macOS:
grep -rl '.claude/tackline/memory/' . | xargs sed -i '' 's|\.claude/tackline/memory/|.opencode/memory/|g'
```

Affected skills: retro, curate, promote, tend, active-learn, sprint, assemble, standup, and any skill referencing `memory-layout.md` paths.

The `SKILL.md` format itself is identical -- no other changes needed.

## 3. Agents Installation

Copy the three agent definitions:

```bash
cp "$TACKLINE/agents/agent-generator.md" .opencode/agents/
cp "$TACKLINE/agents/project-bootstrapper.md" .opencode/agents/
cp "$TACKLINE/agents/code-reviewer.md" .opencode/agents/
```

Add OpenCode-specific frontmatter fields to each file. For example, `code-reviewer.md` ships with:

```yaml
---
name: code-reviewer
description: Reviews staged diffs or PR diffs for correctness, security, style consistency, and architectural coherence.
tools: Read, Glob, Grep, Bash
model: sonnet
---
```

Add `mode` and `permissions`:

```yaml
---
name: code-reviewer
description: Reviews staged diffs or PR diffs for correctness, security, style consistency, and architectural coherence.
tools: Read, Glob, Grep, Bash
model: sonnet
mode: "subagent"
permissions:
  read: true
  write: false
  execute: ["git diff", "git log", "git show"]
---
```

Guidelines:
- `code-reviewer.md` -- `mode: "subagent"`, read-only permissions
- `agent-generator.md` -- `mode: "subagent"`, read+write permissions
- `project-bootstrapper.md` -- `mode: "primary"`, full permissions

Also update any `.claude/tackline/memory/` references to `.opencode/memory/` inside agent files.

## 4. Rules Installation

Tackline has 10 rule files:

| File | Purpose |
|------|---------|
| `pipe-format.md` | Composable primitive output contract |
| `issue-quality.md` | Issue/ticket quality standards |
| `context-trust.md` | Trust user-provided context |
| `batch-safety.md` | Chunk batch operations at 12 items |
| `task-tracker-discovery.md` | Auto-detect task tracker |
| `memory-layout.md` | Path registry for persistent state |
| `test-conventions.md` | Testing conventions |
| `team-protocol.md` | Team manifest, spawn protocol, reflection schema |
| `delegation.md` | Dispatch to subagents, parallelism rules |
| `chain-thinking.md` | Chain-of-thought reasoning patterns |

### Option A: Consolidated AGENTS.md (recommended)

Create a single `AGENTS.md` at your project root, organized by section:

```markdown
# Project Rules

## Universal Rules
<!-- Contents of: context-trust.md, batch-safety.md, test-conventions.md -->

## Skill & Pattern Rules
<!-- Contents of: pipe-format.md, issue-quality.md, task-tracker-discovery.md -->

## Team & Coordination Rules
<!-- Contents of: team-protocol.md, memory-layout.md -->
<!-- Replace all .claude/tackline/memory/ with .opencode/memory/ -->

## Orchestrator-Only Rules
<!-- Contents of: delegation.md, chain-thinking.md -->
```

Preserve `strength` and `freshness` metadata inline:

```markdown
### Memory Layout
> strength: should | freshness: 2026-03-12

All persistent state lives under `.opencode/memory/`.
...
```

### Option B: Individual rule files

Copy rules to a `rules/` directory and reference them in config:

```bash
mkdir -p rules
cp "$TACKLINE/rules/"*.md rules/
grep -rl '.claude/tackline/memory/' rules/ | xargs sed -i 's|\.claude/tackline/memory/|.opencode/memory/|g'
```

In `opencode.json`:

```json
{
  "instructions": ["rules/*.md"]
}
```

Note: tilde expansion (`~/`) does not work in OpenCode glob patterns. Use relative paths from the project root.

## 5. Hooks Plugin

Create `.opencode/plugins/tackline-hooks.ts`:

```typescript
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
// The quick start script below creates a commands/archive-session
// placeholder you can flesh out.
```

### Hook mapping reference

| Tackline Hook | OpenCode Event | Notes |
|---|---|---|
| `SessionStart` | `session.created` | Direct equivalent |
| `PreCompact` | `session.compacted` + `message.updated` | Fires AFTER in OpenCode; use `message.updated` for pre-compaction state |
| `PreToolUse` (Bash) | `tool.execute.before` | Direct equivalent |
| `PostToolUse` (Task) | `tool.execute.after` | Direct equivalent |
| `PostToolUse` (Skill) | `tool.execute.after` | Direct equivalent |
| `UserPromptSubmit` | `tui.prompt.append` | Direct equivalent |
| `SessionEnd` | None | Use periodic checkpoints + explicit `/archive-session` command |

## 6. opencode.json Configuration

Create `opencode.json` at the project root (not inside `.opencode/`):

```json
{
  "instructions": ["AGENTS.md"],
  "mcp": {
    "sequential-thinking": {
      "type": "local",
      "command": ["npx", "-y", "@modelcontextprotocol/server-sequential-thinking"]
    },
    "context7": {
      "type": "local",
      "command": ["npx", "-y", "@upstash/context7-mcp@2.1.1"]
    },
    "memory": {
      "type": "local",
      "command": ["npx", "-y", "@modelcontextprotocol/server-memory"]
    }
  }
}
```

If using Option B for rules (individual files), change `instructions` to:

```json
{
  "instructions": ["rules/*.md"]
}
```

## 7. Memory System

The memory system is file-based and uses the same structure and formats as tackline, rooted at `.opencode/memory/` instead of `.claude/tackline/memory/`.

### Path registry

| Path | Purpose | Written By |
|------|---------|------------|
| `sessions/YYYY-MM-DDThh-mm-ssZ.md` | Session snapshots (last 3 kept) | Archive command |
| `sessions/last.md` | Most recent session snapshot | Archive command |
| `sessions/pre-compact.md` | Pre-compaction snapshot | Compaction hook |
| `agents/<name>/learnings.md` | Agent learnings (60-line cap) | /sprint, /retro, /curate |
| `agents/<name>/archive.md` | Archived stale learnings | /retro, /curate |
| `agents/<name>/challenges/` | Challenge definitions and outcomes | /active-learn |
| `agents/<name>/capability.yaml` | Agent capability profile | /active-learn, /diagnose-agent |
| `team/decisions.md` | Cross-cutting team decisions | /assemble, /team-meeting |
| `team/retro-history.md` | Retrospective history | /retro |
| `epics/<epic-id>/epic.md` | Epic state and task IDs | /blossom |
| `project/domain.md` | Domain terminology | /domain |

### Learning lifecycle

`/retro` -> `/curate` -> `/promote` -> `/tend`

Learnings files are capped at 60 lines (30 core + 30 task-relevant). Entries older than 21 days without references are archived. Entries confirmed across 3+ sprints are promoted to project rules.

### Initialize

```bash
mkdir -p .opencode/memory/{sessions,agents,team,epics,project,scratch}
```

## 8. Team Orchestration

### MVP: Serial dispatch

OpenCode's Task tool is synchronous, so the minimum viable team setup dispatches one agent at a time:

- `/assemble` creates `team.yaml` and learnings files -- works as-is after path replacement
- `/sprint` dispatches agents serially (no background/parallel support without plugins)
- Learning injection works: the orchestrator reads `learnings.md` and embeds it in the Task prompt
- Reflection parsing works: parse structured JSON from Task output, append to `learnings.md`

### Upgrade path

Install community plugins for parallel and advanced orchestration:

| Plugin | Capability |
|--------|------------|
| **opencode-worktree** | Git worktree isolation for parallel agents |
| **Oh My OpenAgent (OMO)** | Full orchestrator with background tasks |
| **OpenCode Ensemble** | Team messaging + shared task board |

## 9. Known Limitations

| Limitation | Workaround |
|---|---|
| No parallel agent dispatch | Serial dispatch; or install opencode-worktree / OMO |
| No `SessionEnd` hook | Periodic checkpoints + explicit `/archive-session` command |
| `PreCompact` fires after compaction, not before | Use `message.updated` for pre-compaction state capture |
| No native team messaging (`SendMessage`) | Use file-based messaging via `team/decisions.md`, or install Ensemble |
| No worktree isolation | Install opencode-worktree plugin |
| Rules not auto-loaded from directory | Consolidate into `AGENTS.md` or use `"instructions": ["rules/*.md"]` in `opencode.json` |
| Tilde expansion in glob patterns does not work | Use relative paths from project root |

## 10. Quick Start Script

Save as `install-tackline.sh` and run from your project root:

```bash
#!/usr/bin/env bash
set -euo pipefail

TACKLINE="${1:?Usage: install-tackline.sh /path/to/tackline}"

if [ ! -d "$TACKLINE/skills" ]; then
  echo "Error: $TACKLINE does not look like a tackline repo" >&2
  exit 1
fi

echo "Creating directory structure..."
mkdir -p .opencode/{skills,agents,commands,plugins}
mkdir -p .opencode/memory/{sessions,agents,team,epics,project,scratch}

echo "Copying skills (flattened)..."
for tier in core workflows teams; do
  if [ -d "$TACKLINE/skills/$tier" ]; then
    for skill_dir in "$TACKLINE/skills/$tier"/*/; do
      skill_name=$(basename "$skill_dir")
      cp -r "$skill_dir" ".opencode/skills/$skill_name"
    done
  fi
done

echo "Fixing memory paths in skills..."
grep -rl '.claude/tackline/memory/' .opencode/skills/ 2>/dev/null | \
  xargs -r sed -i 's|\.claude/tackline/memory/|.opencode/memory/|g'

echo "Copying agents..."
cp "$TACKLINE/agents/"*.md .opencode/agents/
# Fix memory paths in agents
grep -rl '.claude/tackline/memory/' .opencode/agents/ 2>/dev/null | \
  xargs -r sed -i 's|\.claude/tackline/memory/|.opencode/memory/|g'

echo "Creating opencode.json..."
cat > opencode.json << 'CONF'
{
  "instructions": ["AGENTS.md"],
  "mcp": {
    "sequential-thinking": {
      "type": "local",
      "command": ["npx", "-y", "@modelcontextprotocol/server-sequential-thinking"]
    },
    "context7": {
      "type": "local",
      "command": ["npx", "-y", "@upstash/context7-mcp@2.1.1"]
    },
    "memory": {
      "type": "local",
      "command": ["npx", "-y", "@modelcontextprotocol/server-memory"]
    }
  }
}
CONF

echo "Copying AGENTS.md (pre-built consolidated rules)..."
cp "$TACKLINE/docs/opencode-AGENTS.md" AGENTS.md

echo "Creating hooks plugin (see section 5 for full implementation details)..."
cp "$TACKLINE/docs/opencode-hooks.ts" .opencode/plugins/tackline-hooks.ts 2>/dev/null || {
  echo "  Note: opencode-hooks.ts not found in tackline repo."
  echo "  Copy the TypeScript from section 5 of docs/install-opencode.md into"
  echo "  .opencode/plugins/tackline-hooks.ts manually."
}

echo "Creating archive-session command placeholder..."
mkdir -p .opencode/commands
cat > .opencode/commands/archive-session.md << 'CMD'
---
name: archive-session
description: Archive the current session state (replaces SessionEnd hook which has no OpenCode equivalent)
---

# Archive Session

Save session state to `.opencode/memory/sessions/`.

1. Write a session snapshot with recent commits and working tree status
2. Copy to `last.md`
3. Keep only the 3 most recent session files
CMD

echo ""
echo "Done. Next steps:"
echo "  1. Add OpenCode-specific frontmatter (mode, permissions) to .opencode/agents/*.md"
echo "  2. Run 'opencode' and test with /gather or /status"
```

Make executable and run:

```bash
chmod +x install-tackline.sh
./install-tackline.sh /path/to/tackline
```

## 11. Verify Installation

After setup, confirm these items:

```bash
# Directory structure exists
ls .opencode/skills/ | wc -l          # Should show ~54 directories
ls .opencode/agents/                   # Should show 3 .md files
ls .opencode/memory/                   # Should show 6 directories

# No stale Claude paths remain
grep -r '.claude/tackline/memory/' .opencode/ && echo "FAIL: stale paths found" || echo "OK: paths clean"

# opencode.json is valid JSON
python3 -c "import json; json.load(open('opencode.json'))" && echo "OK: valid JSON" || echo "FAIL: invalid JSON"

# MCP servers respond
npx -y @modelcontextprotocol/server-sequential-thinking --help 2>/dev/null && echo "OK: sequential-thinking" || echo "WARN: check node/npx"

# Skills have SKILL.md files
find .opencode/skills -name 'SKILL.md' | wc -l   # Should be ~54
```

Then launch OpenCode and test a skill:

```
/gather What testing frameworks does this project use?
```

If it runs without errors and produces structured output, the installation is working.
