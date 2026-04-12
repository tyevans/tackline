# Project Rules

## Universal Rules

### Context Trust

> strength: must | freshness: 2026-02-21

When the user provides ticket content, requirements, or scoped context for a task:

1. **Trust it as-is.** Do not re-read the ticket source, re-examine linked resources, or re-baseline information the user just provided.
2. **Stay scoped.** Do not broadly explore the codebase to "understand context" when the user has already scoped the task. Start narrow, widen only if the provided context is genuinely insufficient.
3. **Ask, don't investigate.** If something in the provided context seems incomplete or contradictory, ask the user rather than independently re-investigating.

This does not apply when context is stale (e.g., referenced files have changed since the ticket was created) or when the task explicitly requires investigation.

### Batch Safety

> strength: should | freshness: 2026-02-21

When processing a numbered collection of items (audit findings, files to review, migrations to run, tickets to close):

1. **Count before starting.** Determine the total item count before processing the first item.
2. **Warn at 12.** If the count exceeds 12, state the risk to the user and propose chunking into groups of 5-7.
3. **Write before continuing.** For each chunk, write completed results to `.opencode/memory/scratch/<task-slug>-chunk-N.md` before starting the next chunk.
4. **Never silently continue past item 12** without having written prior results to a file.

The goal is to prevent context compaction from destroying completed work in long batch operations. Intermediate files make progress recoverable.

See also: /decompose (break large collections into bounded sub-parts before processing).

### Test Conventions

> strength: should | freshness: 2026-03-13

#### Use /test-strategy Before Implementation

Run `/test-strategy` before writing any code. Do not skip this step.

---

## Skill & Pattern Rules

### Pipe Format

> strength: should | freshness: 2026-03-11 | paths: skills/**/SKILL.md

Consistent output structure so any skill's output can feed another skill's input. Context IS the pipe -- no file passing needed.

#### Structure

```
## <verb-noun phrase>

**Source**: /<skill-name>
**Input**: <one-line description of what was processed>
**Pipeline**: <provenance chain> or (none -- working from direct input)

### Items (N)

1. **<title>** -- <detail>
2. **<title>** -- <detail>

### Summary

<One paragraph synthesis.>
```

#### Rules

1. **Items are always a numbered list.** Even single-item outputs.
2. **Source line is always present.** This is how downstream skills detect upstream output.
3. **Summary is always present.** One paragraph.
4. **Markdown only.** No YAML or JSON -- LLMs parse markdown natively.
5. **Skill-specific sections go between Items and Summary.** /rank adds `### Criteria`, /diff-ideas adds `### Comparison`, etc.

#### Input Detection

Skills accept input from `$ARGUMENTS` (user input) or conversation context (prior skill output). When a skill detects the `## ... / **Source**: /...` pattern above it in context, it uses that as input and reads the `**Pipeline**` field to construct provenance. Otherwise it uses `$ARGUMENTS`.

When multiple pipe-format blocks exist, the most recent one wins.

#### Pipeline Provenance

The `**Pipeline**` field tracks the chain of skills that produced the current output. Each skill appends itself:

- **No upstream**: `(none -- working from direct input)`
- **With upstream**: `<upstream chain> -> /<skill> (N items)`
- **Merged branches**: Use `+` to show merged inputs (e.g., `/gather (8) + /gather (6) -> /merge (10)`)

#### Confidence Levels

When findings involve claims about code, docs, or external systems, tag each item:

- **CONFIRMED** -- verified by reading code or docs; evidence cited
- **LIKELY** -- strong evidence from multiple signals but incomplete verification
- **POSSIBLE** -- suspicious pattern or weak evidence; needs deeper investigation

#### Composition Rules

When a skill consumes upstream pipe-format output:

1. **Preserve source attribution** -- carry forward `source:` metadata from input items
2. **Preserve confidence levels** -- do not downgrade; upgrade only when new evidence supports it
3. **Maintain item identity** -- unless the skill explicitly reorders (rank), filters (filter), or merges (merge), input count equals output count

#### Limitation

Long chains risk context compression destroying structured output. For chains spanning 3+ operations, write intermediate results to `.opencode/memory/scratch/` per the Memory Layout rule.

### Issue Quality

> strength: must | freshness: 2026-03-13

When any skill or workflow creates an issue, task, or ticket in an external tracker (Tacks, Beads, Linear, GitHub Issues, etc.):

1. **Descriptive title.** Use `<affected artifact>: <what needs to happen>` format. Titles must be actionable -- a reader should understand the work without opening the issue.
2. **Self-contained description.** Include enough context that someone unfamiliar with the originating conversation can act on the issue without asking clarifying questions. Reference specific file paths, function names, or code patterns when applicable.
3. **Definition of done.** Every issue must include a concrete, verifiable definition of done -- a checklist of conditions that must be true for the issue to be considered complete. Prefer observable outcomes ("endpoint returns 200 with valid payload") over process statements ("code has been reviewed").
4. **Provenance.** State which skill or workflow produced the issue and when (e.g., "Filed via /retro on 2026-03-13"). If the issue originated from pipe-format output, include the pipeline chain.
5. **Priority/severity.** Include a priority or severity level using the tracker's conventions. Default to medium/P2 if context is ambiguous.

#### What "Self-Contained" Means

A self-contained description includes:
- **Why** the work matters (the problem or motivation)
- **What** needs to change (specific files, behaviors, or interfaces)
- **How to verify** the change is correct (the definition of done)

It does NOT require:
- Full implementation details (the assignee determines approach)
- Exhaustive background (link to related issues instead of re-explaining)

#### Rationale

Issues outlive the conversation that created them. Without sufficient detail, the assignee must re-investigate context that was already known at filing time -- wasting effort and risking misinterpretation.

See also: /bug (structured bug reports), /team-meeting (task creation from planning).

### Task Tracker Discovery

> strength: must | freshness: 2026-03-13

When a skill or workflow needs to interact with an external task tracker (Tacks, Beads, Linear, GitHub Issues, or any CLI-based tracker):

1. **Discover before invoking.** Before running any task tracker command, run the tracker's help command (e.g., `tacks --help`, `beads help`) to learn the available subcommands and their syntax. Do not guess or invent commands from memory.
2. **Drill into subcommands.** After discovering top-level commands, run help on the specific subcommand you need (e.g., `tacks create --help`) to learn required and optional flags before constructing the full command.
3. **Cache for the session.** Once you have discovered the correct syntax for an operation, you do not need to re-run help for the same operation within the same session. But do not carry assumed syntax across sessions -- always discover fresh.

#### Why

LLMs frequently hallucinate CLI syntax for unfamiliar or project-specific tools. The cost of two help calls (~1 second) is far lower than the cost of multiple failed invocations, error parsing, and retry loops that burn tokens and context window.

#### Detecting the Tracker

If the project's task tracker is not obvious, check in this order:

1. **AGENTS.md** -- often names the tracker and its CLI command
2. **MCP servers** -- check if an MCP tool provides task management (e.g., `mcp__tacks__*`)
3. **Shell availability** -- run `which tacks beads linear gh 2>/dev/null` to detect installed CLIs
4. **Project config** -- look for `.tacks/`, `.beads/`, `.linear/` directories

If no tracker is detected, skip tracker operations and note the absence -- do not invent a fallback.

---

## Team & Coordination Rules

### Memory Layout

> strength: should | freshness: 2026-03-12 | paths: .opencode/memory/**

Single source of truth for persistent state: where it lives, who writes it, and how to survive context compaction. Skills SHOULD reference this rule rather than inlining their own memory instructions.

#### Root Path

All persistent state lives under `.opencode/memory/`.

#### Path Registry

| Path | Purpose | Written By |
|------|---------|------------|
| `sessions/YYYY-MM-DDThh-mm-ssZ.md` | Session state snapshot, rolling buffer; last 3 kept | SessionEnd hook |
| `sessions/last.md` | Copy of most recent session snapshot | SessionEnd hook |
| `sessions/pre-compact.md` | Pre-compaction snapshot: in-progress tasks, recent commits, open questions | PreCompact hook |
| `agents/<name>/learnings.md` | Agent-specific learnings (persistent, append-only) | /sprint, /retro, /curate |
| `agents/<name>/archive.md` | Archived stale learnings (>21 days) | /retro, /curate |
| `agents/<name>/challenges/` | Challenge definitions and outcome history | /active-learn |
| `agents/<name>/capability.yaml` | Agent capability profile (strengths/weaknesses) | /active-learn, /diagnose-agent |
| `team/decisions.md` | Cross-cutting team decisions log | /assemble, /team-meeting |
| `team/retro-history.md` | Retrospective history (append-only) | /retro |
| `epics/<epic-id>/epic.md` | Epic state: spike findings, priority order, task IDs, critical path | /blossom |
| `project/domain.md` | Project domain terminology and disambiguation rules | /domain |
| `scratch/<skill-name>-checkpoint.md` | Compaction checkpoint (ephemeral) | Multi-phase skills |

All paths are relative to `.opencode/memory/`.

#### Rules

1. **Read from known paths.** Skills that need system state should use the paths above, not invent new locations.
2. **No new write obligations.** Only subsystems that already persist state should write here. Stateless primitives (gather, distill, rank, etc.) must not acquire memory side-effects.
3. **Free-form markdown.** Files have no required sections or field-level schemas. Content structure is owned by the writing subsystem.
4. **Sessions: rolling buffer, last 3.** The SessionEnd hook prunes to keep the 3 most recent timestamped files. `last.md` is always a copy of the most recent.
5. **Agent learnings: tiered and capped.** Core + Task-Relevant tiers, capped at 60 lines total (30 + 30). Overflow moves to `archive.md`.
6. **Reference, don't repeat.** Skills should say "Per the Memory Layout rule, checkpoint at phase boundaries" -- not inline the full protocol.

#### Checkpoint Protocol

Skills with 3+ phases SHOULD write intermediate state to `scratch/<skill-name>-checkpoint.md` at each phase boundary. The checkpoint captures:

- Which phases have completed
- Key findings or output items produced so far
- Any decisions made that affect later phases

##### Recovery

When a skill detects a checkpoint file at startup:

1. Read the checkpoint
2. Report which phases are already complete
3. Skip completed phases and resume from the first incomplete phase
4. Treat checkpoint items as confirmed prior output -- do not re-derive them

##### PreCompact Hook

The PreCompact hook auto-persists the most recent pipe-format output block to `sessions/pre-compact.md`. This covers single-phase primitives without requiring explicit checkpoint writes.

##### Scratch Cleanup

Files in `scratch/` are ephemeral:

- The skill SHOULD delete its checkpoint on successful completion
- The SessionEnd hook MAY sweep stale scratch files older than one session
- Do not treat scratch files as durable state

### Team Protocol

> strength: should | freshness: 2026-02-21 | paths: skills/**/*.md, agents/**/*.md

Spec for persistent learning teams. Defines the manifest format, spawn protocol, reflection schema, and learning lifecycle. All team-aware skills reference this document.

#### Team Manifest

Teams are defined in `.opencode/team.yaml`. This is the single source of truth for team composition.

```yaml
team: project-slug
description: "One-line project description"

members:
  - name: architect
    role: "System design, API contracts, patterns"
    tools: [Read, Grep, Glob, "Bash(git:*)"]
    owns: ["src/core/**", "docs/**", "*.md"]

  - name: backend
    role: "Server logic, data models, business rules"
    tools: [Read, Write, Edit, Grep, Glob, "Bash(git:*)", "Bash(uv run pytest:*)"]
    owns: ["src/domain/**", "src/infra/**", "tests/**"]
    isolation: worktree
```

##### Required Fields

| Field | Scope | Description |
|-------|-------|-------------|
| `team` | top | Slug used for directory naming |
| `description` | top | One-line project description |
| `members` | top | Array of team member definitions |
| `name` | member | Unique identifier, lowercase |
| `role` | member | One-line responsibility description |
| `tools` | member | Tool list for `--allowedTools` |
| `owns` | member | Glob patterns for files this member is responsible for |

##### Optional Fields

| Field | Scope | Values | Default | Description |
|-------|-------|--------|---------|-------------|
| `isolation` | member | `worktree`, `none` | `none` | Dispatch isolation mode. `worktree` means the member can be dispatched in a dedicated git worktree; `none` means the member must run in the main working context. |

**When to set `isolation: worktree`:**
- The member's `owns` patterns don't overlap with any other member's patterns
- The member's tasks don't require reading or writing shared state files (e.g., `.opencode/memory/team/decisions.md`)
- The member's work is self-contained within its owned paths for the duration of the sprint

**Consumed by /sprint**: The sprint skill reads `isolation` at dispatch time and passes worktree-isolated members to the worktree dispatch path. Members with `isolation: none` (or no `isolation` field) are dispatched in the main context.

#### Learnings Files

Each member has a file at `.opencode/memory/agents/<name>/learnings.md`. These are version-controlled, human-readable, and injected into every spawn.

##### Format

```markdown
# Learnings: <name>

## Codebase Patterns
- API v2 uses joi for validation, not zod (added: 2026-02-13)

## Gotchas
- TrustService requires bootstrap before first call (added: 2026-02-13)

## Preferences
- User prefers explicit error types over generic Error (added: 2026-02-13)

## Cross-Agent Notes
- (from architect) Use TrustLevel enum from src/core/types.ts (added: 2026-02-13)
```

##### Categories

- **Codebase Patterns** -- Confirmed conventions, naming patterns, architectural rules
- **Gotchas** -- Bugs, quirks, workarounds that cost time to discover
- **Preferences** -- User/project preferences for style, approach, tooling
- **Cross-Agent Notes** -- Learnings forwarded from other team members

##### Size Cap and Tiered Structure

Learnings files are capped at **60 lines**. Structure them as:

- **Core (30 lines max)**: Always-injected entries with high reuse frequency (5+ references across sprints). These are foundational patterns and gotchas that apply to every task.
- **Task-Relevant (30 lines max)**: Selective entries that apply to specific contexts. These should be pruned more aggressively.

##### Consolidation Triggers

When a file exceeds 60 lines or meets any of these conditions:
1. **Merge similar entries**: Consolidate learnings that say the same thing in different ways
2. **Archive stale entries**: Move entries older than 21 days (without recent references) to `.opencode/memory/agents/<name>/archive.md`
3. **Promote high-value entries**: If a learning has been confirmed across 3+ sprints, promote it to project rules or AGENTS.md
4. **Validate cross-agent notes**: Notes in "Cross-Agent Notes" that are older than 14 days must be either:
   - Acknowledged (merged into other sections)
   - Acted upon (integrated into the agent's workflow)
   - Discarded (moved to archive with rationale)

#### Shared Team Memory

Cross-cutting decisions live in `.opencode/memory/team/decisions.md`:

```markdown
# Team Decisions

## Architecture
- REST over GraphQL for all public APIs (decided: 2026-02-13, by: architect)

## Conventions
- All dates stored as ISO 8601 UTC (decided: 2026-02-13, by: backend)
```

Retrospective summaries append to `.opencode/memory/team/retro-history.md`.

#### Spawn Protocol

The orchestrator dispatches team members via the Task tool.

##### Dispatch via Task Tool

Use the Task tool with `subagent_type: "general-purpose"` (or a custom agent type matching the member name if registered in agents/).

The task prompt must include:
1. The member's accumulated learnings (contents of `.opencode/memory/agents/<name>/learnings.md`)
2. The task description with context
3. Reflection instructions requesting structured output

##### Prompt Template

```
You are acting as team member "<name>".
Role: <role>
Owns: <owns patterns>

## Your Accumulated Learnings
<contents of .opencode/memory/agents/<name>/learnings.md>

## Task
<task description>

## Worktree Discipline
You MUST work in an isolated worktree -- never modify files in the primary working directory.
- Use `isolation: "worktree"` when dispatched, or `EnterWorktree` if working interactively
- All file changes happen in your worktree only
- If you find yourself in the primary directory, stop and request worktree isolation

## Commit Discipline
You MUST commit your changes to your worktree branch before finishing.
- Commit early and often -- each logical change gets its own commit
- Keep commits focused: one concern per commit (e.g., separate "add feature" from "update tests")
- Do not batch all changes into a single large commit
- Use conventional commit messages (feat:, fix:, refactor:, docs:, chore:)
- If your task is partially complete, commit what you have -- partial progress committed is better than full progress uncommitted
- Run `git status` at the end to confirm nothing is left uncommitted

## Reflection Protocol
After completing your task, end your response with a structured reflection:
- task_result: status (completed/partial/blocked/failed), summary, files_changed
- reflection: what_worked, what_didnt, confidence (high/medium/low)
- suggested_learnings: category, content, for_agent (if cross-agent)
- follow_up: suggested_next, needs_human
```

##### Dispatch Strategy

**Default: parallelize with worktree isolation.** Dispatch tasks concurrently using `isolation: "worktree"` and `run_in_background: true`. Each agent gets its own repo copy, eliminating merge conflicts regardless of file overlap. Cherry-pick or merge worktree branches after agents complete.

**Fall back to serial** only when tasks have true sequential dependencies -- i.e., each task needs the previous one's output to proceed. Serial dispatch is the exception, not the default.

#### Dispatch Model

##### Decision Boundary: Task vs. Native Teams

Default to Task tool dispatch. Prefer native TeamCreate only when agents must exchange messages during execution -- not merely because tasks depend on each other.

| Condition | Mechanism |
|-----------|-----------|
| Tasks are independent or sequentially ordered | Task tool (serialize or parallelize) |
| Agents must communicate mid-execution (e.g., one agent's output shapes another's next step in real time) | Native TeamCreate |
| Tasks have shared dependencies but no runtime message exchange | Task tool |

Having dependencies between tasks is not sufficient justification for native teams. Use your task tracker for ordering, Task tool for dispatch.

##### Injection Invariant

Regardless of dispatch mechanism, the orchestrator always injects learnings into the agent's initial prompt. Agents never self-load their own learnings files.

1. Read `.opencode/memory/agents/<name>/learnings.md` before dispatching.
2. Embed the contents in the agent's initial prompt (see Prompt Template above).
3. This applies to both Task tool dispatch and native TeamCreate spawns.

##### Known Gap: team.yaml Budget and Tools Enforcement

The `tools` and budget fields in `team.yaml` are not enforced by native TeamCreate. Enforcement is the orchestrator's responsibility:

- Pass `--allowedTools` explicitly when constructing the spawn.
- Validate that the tool list matches the member's `tools` field before dispatching.
- Budget limits must be applied in the orchestrator logic, not relied upon from TeamCreate.

#### Agent Continuity

After expensive phases -- multi-turn research, large code generation, or long iterative tasks -- the orchestrator SHOULD record the agent ID returned by the Task tool so the agent can be resumed rather than re-dispatched from scratch.

##### Resume Convention

When the Task tool returns an agent ID for a completed or partial run, write it to a checkpoint file:

```
.opencode/memory/scratch/<skill-name>-agent-<member>.md
```

Format:

```markdown
# Agent Checkpoint: <skill-name> / <member>

agent_id: <id returned by Task tool>
task: <one-line task description>
phase_completed: <last completed phase, e.g. "research", "draft", "review">
recorded: <ISO date>
```

##### When to Resume

On re-invocation, check for a checkpoint file before dispatching. Offer resume when:

1. The checkpoint file exists and is less than 7 days old
2. The files the agent was working on have not changed significantly since the checkpoint
3. The task definition has not changed
4. The agent did not fail or block -- it paused or was partially completed

Resume by passing the agent ID to the Task tool's `agent_id` parameter, injecting the same learnings plus a brief resume note in the prompt.

##### When to Dispatch Fresh

| Condition | Decision |
|-----------|----------|
| Checkpoint is older than 7 days | Fresh dispatch |
| Task definition has changed since checkpoint | Fresh dispatch |
| Working branch or major files changed since checkpoint | Fresh dispatch |
| Agent status was `blocked` or `failed` | Fresh dispatch |
| No checkpoint file exists | Fresh dispatch |
| Checkpoint exists, agent paused mid-task, context still valid | Resume |
| Checkpoint exists, task is identical, files unchanged | Resume |

##### Checkpoint Cleanup

Delete the checkpoint file after a successful fresh dispatch or after the resumed agent reaches `completed` status. Stale checkpoints older than 14 days may be deleted during `/retro` without review.

#### Reflection Schema

Every spawned team member returns this JSON structure:

```json
{
  "type": "object",
  "required": ["task_result", "reflection", "suggested_learnings", "follow_up"],
  "properties": {
    "task_result": {
      "type": "object",
      "required": ["status", "summary", "files_changed"],
      "properties": {
        "status": { "type": "string", "enum": ["completed", "partial", "blocked", "failed"] },
        "summary": { "type": "string", "description": "1-3 sentence summary of what was done" },
        "files_changed": { "type": "array", "items": { "type": "string" }, "description": "Paths of files created or modified" }
      }
    },
    "reflection": {
      "type": "object",
      "required": ["what_worked", "what_didnt", "confidence"],
      "properties": {
        "what_worked": { "type": "string", "description": "Techniques or approaches that went well" },
        "what_didnt": { "type": "string", "description": "Issues encountered or suboptimal choices made" },
        "confidence": { "type": "string", "enum": ["high", "medium", "low"], "description": "Confidence in the quality of work produced" }
      }
    },
    "suggested_learnings": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["category", "content"],
        "properties": {
          "category": { "type": "string", "enum": ["codebase-pattern", "gotcha", "preference", "cross-agent"] },
          "content": { "type": "string", "description": "The learning to persist" },
          "for_agent": { "type": "string", "description": "Target agent name if cross-agent, otherwise omit" }
        }
      }
    },
    "follow_up": {
      "type": "object",
      "required": ["needs_human"],
      "properties": {
        "blocked_by": { "type": "string", "description": "What is blocking further progress, if anything" },
        "suggested_next": { "type": "string", "description": "Recommended next task or action" },
        "needs_human": { "type": "boolean", "description": "Whether human input is needed to proceed" }
      }
    }
  }
}
```

#### Learning Lifecycle

##### 1. Seed (during /assemble)
- Create `.opencode/memory/agents/<name>/learnings.md` with initial role context
- Create `.opencode/memory/team/decisions.md` with empty sections

##### 2. Inject (during spawn)
- Read learnings file, embed in `--append-system-prompt`
- Agent behavior is shaped by accumulated learnings

##### 3. Reflect (after task)
- Parse `suggested_learnings` from reflection JSON
- Categorize each learning and append to the appropriate agent's file
- Route `cross-agent` learnings to the target agent's file under "Cross-Agent Notes"

##### 4. Prune (during /retro)
- Merge duplicate or similar entries
- Archive stale entries (>21 days, never referenced)
- Promote high-value entries to rules or AGENTS.md
- Validate cross-agent notes (acknowledge, act, or discard within 14 days)
- Ensure no file exceeds 60 lines (30 core + 30 task-relevant)

##### 5. Transfer (optional)
- When a new member is added, seed their learnings from related members
- When a member is removed, redistribute their cross-agent notes

#### Compatibility with Memory MCP

File-based learnings are the **primary** persistence mechanism. Memory MCP is a **secondary** mechanism for cross-project queries, agent identity when file context is unavailable, and relation-based discovery.

| Scenario | Use |
|----------|-----|
| Team member learnings (within a project) | File-based |
| Cross-project knowledge queries | MCP (`mcp__memory__search_nodes`) |
| Agent identity when file context unavailable | MCP |
| Relation-based discovery between agents | MCP |

##### MCP Namespace Convention

Each agent gets a unique entity: `agent:<agent-name>` (e.g., `agent:code-reviewer`) with type `agent-memory`.

##### Read-on-Spawn (MCP path)

```
mcp__memory__open_nodes(names: ["agent:<agent-name>"])
```

If the node exists, review observations before beginning work. If not, proceed normally.

##### Write-on-Complete (MCP path)

```
mcp__memory__add_observations(observations: [{
  entityName: "agent:<agent-name>",
  contents: ["<observation>"]
}])
```

Create the entity first if it doesn't exist:

```
mcp__memory__create_entities(entities: [{
  name: "agent:<agent-name>",
  entityType: "agent-memory",
  observations: ["<initial observations>"]
}])
```

##### What to Remember (MCP)

- Patterns confirmed across multiple files or sessions
- Codebase-specific conventions (naming, structure, architecture)
- Library gotchas and workarounds that were hard-won
- User preferences for approach, style, or tooling
- Recurring issues and their root causes

Do NOT remember: session-specific context, unverified hunches, information already in AGENTS.md or rules, secrets.

##### Relation Wiring

When an agent discovers knowledge relevant to another agent:

```
mcp__memory__create_relations(relations: [{
  from: "agent:code-reviewer",
  relationType: "learned-relevant-to",
  to: "agent:test-generator"
}])
```

##### For Skill Authors

Skills dispatching agents with memory should:

1. Check for team manifest first (`.opencode/team.yaml`). If present, use file-based learnings.
2. Fall back to MCP if no team manifest exists. Include in the agent's prompt: "Before starting, check for prior learnings via `agent:<name>` in Memory MCP. Before finishing, write any new learnings worth preserving."

---

## Orchestrator-Only Rules

### Delegation

> strength: must | freshness: 2026-03-13

The primary session is a coordinator, not an implementer. Dispatch work to subagents and use skills to guide execution.

#### Dispatch, Don't Do

Do not perform implementation work in the primary session even when it feels faster. The coordination overhead pays for itself through parallelism and better-guided execution.

- **Single task**: dispatch to one subagent (worktree isolation preferred)
- **Multiple independent tasks**: dispatch in parallel, each in its own worktree
- **Multi-faceted work requiring coordination**: use a team (TeamCreate) with direct messaging to resolve conflicts
- **Any task with a matching skill**: invoke the skill -- it encodes domain knowledge that ad-hoc reasoning lacks

The only work the primary session performs directly is triage, coordination, and content-only edits in content-only repos (per AGENTS.md operating mode).

##### Mandatory Agent Instructions

Every dispatched subagent prompt MUST include these three directives:

1. **Worktree isolation**: "You MUST work in an isolated worktree -- never modify files in the primary working directory."
2. **Commit to worktree branch**: "You MUST commit all changes to your worktree branch before finishing. Nothing left uncommitted."

These are non-negotiable. The orchestrator includes them in every agent prompt regardless of dispatch mechanism (Task tool, TeamCreate, or ad-hoc Agent).

##### Post-Task Review Gate

After a coding subagent completes, the **orchestrator** dispatches a fresh review agent (separate context, no prior involvement) against the subagent's worktree branch. The review agent runs `/review` on the diff. The orchestrator does not merge the worktree branch until the review passes.

This is orchestrator work -- subagents cannot spawn subagents.

#### Concurrency by Default

Assume tasks can run in parallel unless there is a true data dependency (one task's output is the next task's input). When in doubt, parallelize -- merge conflicts in isolated worktrees are cheaper than serial execution time.

| Situation | Approach |
|-----------|----------|
| Independent tasks, no shared files | Parallel worktree agents |
| Independent tasks, overlapping files | Parallel worktree agents (merge after) |
| Tasks needing mid-execution communication | Team with direct messaging |
| Strictly sequential dependency chain | Serial dispatch (the exception) |

#### Skills Over Intuition

When a skill exists for the task at hand, use it. Skills encode tested workflows, phase gates, and output contracts that raw model reasoning does not reliably reproduce. Check `/discover` or the skill list before improvising a multi-step approach.

Key examples:
- **Before writing tests**: run `/test-strategy` to classify the epistemic level and select TDD vs test-after
- **Before large implementation**: run `/spec` or `/blossom` to scope the work
- **Before code review**: run `/review` for structured findings
- **Before deployment**: run `/deploy` for readiness checks and rollback criteria

#### Exceptions

- Trivial content edits in content-only repos (fixing a typo, updating a date)
- Single-line clarification questions back to the user
- Reading files to understand context before dispatching

### Chain Thinking

> strength: should | freshness: 2026-03-26 | paths: skills/**/*.md, agents/**/*.md

Vocabulary and mental models for reasoning about end-to-end completeness. Use any of these when they fit the problem. Skip them when they don't.

#### Chain Maps

A chain map traces a behavior from trigger to user-visible output. It answers: "does this work end-to-end, or are there gaps?"

```
Trigger: user clicks "Place Order"
  -> OrderService.create validates input, persists order
  -> PaymentGateway.charge processes payment
  -> EmailService.send sends confirmation
Output: user sees confirmation page + receives email
```

Think in chains when building multi-system features, integration work, or anything where "it compiles but doesn't work" is a risk. Each step should have a clear consumer for its output.

Don't think in chains for single-file changes, library internals, config updates, or work that stays within one boundary. Not every task needs an end-to-end trace.

There is no canonical format. A chain map might be a numbered list, a table, or a paragraph -- whatever makes the flow clear for the task at hand.

#### Task Types: BUILD / WIRE / CONSUME

One useful way to categorize implementation work:

- **BUILD** -- implement logic within a boundary. Narrow and deep (few files, many lines). These parallelize naturally.
- **WIRE** -- connect two systems. Broad and shallow (many files, few lines each). Imports, subscriptions, signal connections, API calls. Depends on both endpoints existing.
- **CONSUME** -- verify data flows end-to-end. Confirms the chain actually works from trigger to output.

This decomposition fits well when there are explicit integration points -- events, APIs, message buses, signal systems. It fits poorly for monoliths where wiring is just function calls, libraries where the consumer does the wiring, or CLI tools with linear pipelines.

It is one useful lens, not the only one. Use it when it clarifies the work structure. Ignore it when it doesn't.

#### Five Traps

Named failure modes worth watching for during review and decomposition:

1. **Island** -- declared but never consumed. A function, signal, or export that nothing calls.
2. **Catalog** -- data defined but never read. Registry entries, config maps, enum variants with no consumer.
3. **Stub** -- placeholder bodies left unfinished. TODO markers, hardcoded returns, empty implementations.
4. **Artifact** -- references to things that don't exist. Imports pointing to missing files, config keys with no backing value.
5. **Invisible** -- computation that never reaches the user. State changes with no path to output, logging, or feedback.

These are patterns to recognize, not mandatory checks. They are most valuable during review of multi-file changes and during decomposition of complex features. A reviewer who knows the names can flag "this looks like an Island" without running a formal protocol.

#### Spec Constants

Authoritative values from design documents that agents should use exactly, not improvise. When a spec says "max retries = 3" or "timeout = 30s", those are spec constants -- downstream agents implementing that behavior should use the specified values.

When a design produces specific values, capturing them in a simple table helps agents stay aligned:

| Constant | Value | Notes |
|----------|-------|-------|
| MAX_RETRIES | 3 | POST /api/orders |
| SESSION_TTL | 3600s | auth chain |

Not every project has spec constants. Not every spec produces them. When they exist, inject them into agent prompts so implementors don't have to guess.

#### Applicability

These concepts are available for any skill or agent to leverage. They don't require structural changes. An agent doing `/decompose` might think in BUILD/WIRE/CONSUME terms. An agent doing `/review` might spot an Island. An agent doing `/blossom` might discover proto-chains. None of this is required -- it is shared vocabulary that improves communication and completeness when applicable.
