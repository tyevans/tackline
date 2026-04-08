---
name: review-meeting
description: "Interactive code review as a panel discussion: an implementer agent defends decisions while a reviewer surfaces findings, with specialist reviewers added based on what the diff touches. Use when you want findings discussed in real time rather than a static report. Keywords: PR review, code review, meeting, panel review, interactive review, review discussion."
argument-hint: "[PR# | commit | range | staged]"
disable-model-invocation: false
user-invocable: true
allowed-tools: Read, Grep, Glob, Write, Bash(bd:*), Bash(tk:*), Bash(git:*), Bash(gh:*), Bash(rm:*), Bash(ls:*), Task, SendMessage, TeamCreate, TeamDelete, AskUserQuestion
---

# Review Meeting: Interactive Panel Code Review

You are facilitating a **Review Meeting** — a structured code review conducted as a live panel discussion. The implementer defends decisions; reviewer(s) surface concerns. Unlike a static review, findings are discussed in real time and can be resolved or escalated before the final verdict.

**Target:** $ARGUMENTS

## Phase 0: Fetch Scope

### 0a. Parse the Target

Interpret `$ARGUMENTS` to determine what to review:

| Input | Interpretation |
|-------|---------------|
| *(empty)* | Staged changes: `git diff --cached` |
| A file path | Changes in that file |
| A commit hash | That single commit: `git show <hash>` |
| A commit range (`abc..def`) | All commits in range: `git diff <range>` |
| A PR number (`#123`) | PR changes: `gh pr diff <number>` |
| `HEAD~N` | Last N commits: `git diff HEAD~N..HEAD` |

### 0b. Fetch the Diff

```bash
git diff --cached               # staged (default)
git show <commit>               # single commit
git diff <range>                # commit range
gh pr diff <number>             # PR
```

Record: total lines changed, files affected, and a one-line description of what the change does.

### 0c. Determine Panel Composition

Read the diff and identify which specialist lenses would catch problems the general Reviewer is likely to miss. The Implementer and Reviewer are always spawned. Add specialists wherever the diff genuinely warrants a focused perspective that the general Reviewer won't cover.

For each specialist you decide to add, define:
- **Role name** — a short label describing the domain (e.g., "Security Reviewer", "Performance Reviewer")
- **Focus** — the specific concern this role covers that the general reviewer won't
- **Trigger** — what in the diff justified adding this role

State your reasoning before spawning. A specialist that duplicates the general Reviewer adds no value — only spawn one if there's a real coverage gap.

---

## Phase 1: Assemble the Panel

### 1a. Create the Team

```
TeamCreate({ team_name: "review-meeting-<short-slug>" })
```

### 1b. Spawn Panelists

Spawn the Implementer and Reviewer in parallel. Spawn specialist agents only if identified in Phase 0c.

The `name` field in each Task invocation is the canonical `SendMessage.recipient` value used throughout this skill. Specialist names are the kebab-case slug of the role (e.g., "Security Reviewer" → `"security-reviewer"`).

**Implementer:**

```
Task({
  team_name: "review-meeting-<slug>",
  name: "implementer",
  subagent_type: "general-purpose",
  run_in_background: true,
  prompt: "<implementer prompt — see below>"
})
```

> You are the **Implementer** in a code review meeting for: [target description]
>
> Your perspective: You wrote (or are representing) these changes. You know the *why* behind every decision — the constraints, tradeoffs, and alternatives you rejected. When the Reviewer raises a concern, your job is to either (a) acknowledge it as a real issue and propose a fix, or (b) explain the rationale and constraints that made this the right call. Do not be defensive for its own sake — a real issue is a real issue. Be concrete: cite specific code lines when explaining your intent.
>
> You have access to Read, Glob, Grep, and Bash(git:*) — use them to read the diff and understand the full context of the changes.
>
> **CRITICAL: You MUST use the SendMessage tool to communicate.** Your plain text output is NOT visible to anyone. Every response must be sent via `SendMessage({ type: "message", recipient: "team-lead", content: "...", summary: "..." })`. Always send to **team-lead**. If you do not call SendMessage, nobody will see what you said.

**Reviewer:**

```
Task({
  team_name: "review-meeting-<slug>",
  name: "reviewer",
  subagent_type: "general-purpose",
  run_in_background: true,
  prompt: "<reviewer prompt — see below>"
})
```

> You are the **Reviewer** in a code review meeting for: [target description]
>
> Your perspective: You are a systematic, rigorous code reviewer. You evaluate changes across five dimensions: **correctness** (does it work?), **security** (OWASP Top 10), **style consistency** (matches project conventions?), **architectural coherence** (right place, right abstraction?), and **test coverage** (critical paths covered?). You ask probing questions — "Why X over Y?" — not just list problems. Every finding must cite a specific file:line and state a concrete severity: CRITICAL (must fix), WARNING (should fix), SUGGESTION (consider), or NITPICK (optional).
>
> You have access to Read, Glob, Grep, and Bash(git:*) — use them to read the full files, not just the diff hunks.
>
> **CRITICAL: You MUST use the SendMessage tool to communicate.** Your plain text output is NOT visible to anyone. Every response must be sent via `SendMessage({ type: "message", recipient: "team-lead", content: "...", summary: "..." })`. Always send to **team-lead**. If you do not call SendMessage, nobody will see what you said.

**Specialist** (one Task per specialist identified in Phase 0c):

```
Task({
  team_name: "review-meeting-<slug>",
  name: "<specialist-slug>",        # kebab-case, e.g. "security-reviewer"
  subagent_type: "general-purpose",
  run_in_background: true,
  prompt: "<specialist prompt — see below>"
})
```

> You are the **[Role Name]** in a code review meeting for: [target description]
>
> Your perspective: [2-3 sentences grounding this role's specific concern — what you look for, what questions you ask, what failure modes you watch for. Be specific to this role's domain. Do not duplicate the general Reviewer's concerns — your value is the gap they're unlikely to catch.]
>
> You do not duplicate general code quality findings. Every finding cites file:line and explains the specific risk from your domain's perspective.
>
> You have access to Read, Glob, Grep, and Bash(git:*) — use them to trace the relevant flows and patterns.
>
> **CRITICAL: You MUST use the SendMessage tool to communicate.** All responses via `SendMessage({ type: "message", recipient: "team-lead", content: "...", summary: "..." })`. Always send to **team-lead**.

### 1c. Capture Panelist IDs

After spawning, write to `memory/scratch/review-meeting-panelists.md`:

```markdown
# Review Meeting Panelists

target: <one-line description of what is being reviewed>

## Panelists

- role: implementer
  agent-id: <task-agent-id>
- role: reviewer
  agent-id: <task-agent-id>
- role: <specialist-role-name>   # one entry per specialist spawned
  agent-id: <task-agent-id>
  focus: <one-line description of this specialist's domain>
```

---

## Phase 2: Opening Round

Send the opening question to each panelist via **direct message** (not broadcast). Include the diff inline for small diffs (<300 lines); provide the target reference (commit hash / PR number / file list) and ask agents to fetch it themselves for larger diffs.

**To Implementer:**

> Implementer, here are the changes under review: [diff or fetch instructions]. Before we begin, walk us through your intent: What problem does this solve? What were the key design decisions? Were there alternatives you rejected? 2-4 paragraphs, be specific.

**To Reviewer:**

> Reviewer, here are the changes under review: [diff or fetch instructions]. Read the full files (not just the diff hunks). Present your **initial findings** as a numbered list with severity (CRITICAL/WARNING/SUGGESTION/NITPICK), file:line reference, and a one-line description of the concern. Group by severity. Also note what looks good.

**To each specialist (if spawned):**

> [Role Name], here are the changes: [diff or fetch instructions]. Focus exclusively on [this role's domain concern from Phase 0c]. Present findings only within your domain — do not duplicate general quality findings. Cite file:line for each finding and explain the specific risk from your perspective.

Send to all panelists in parallel.

---

## Phase 3: Facilitation Loop

After opening responses arrive, run this loop. Maintain a **findings tracker**: a running list of findings with status: `open`, `resolved`, `escalated`.

### 3a. Synthesize Findings

Collect findings from all reviewers. For each finding:
- Assign a unique ID (R-1, R-2, S-1, S-2, etc.)
- Record: severity, file:line, description, source role, status: `open`

Present a consolidated findings list to the user before starting the dialogue.

### 3b. Relay Loop

For each `open` finding (prioritize CRITICAL → WARNING → SUGGESTION):

1. **Send finding to Implementer** via direct message:
   > Implementer, finding [ID] (SEVERITY): [description] at [file:line]. Is this a real issue? If so, what's the fix? If intentional, explain the constraint that made this the right call.

2. **Relay the response to the relevant Reviewer** (anonymize the source — describe the analytical frame, not who said it):
   > Reviewer, from an implementation-constraints perspective: [implementer's explanation]. Does this resolve the concern, or does the risk remain?

3. **Update finding status:**
   - Reviewer accepts explanation → mark `resolved`
   - Reviewer maintains concern → mark `escalated`, note the unresolved tension

4. **Checkpoint at 3 findings** (or when a CRITICAL remains escalated): summarize resolved vs. open, then ask the user:
   > **Continue** reviewing open findings, **deep-dive** on an escalated finding, **pivot** to a new concern, or **conclude**?

   - *Continue* → Next batch of findings
   - *Deep-dive* → Send the specific finding to all relevant panelists simultaneously, ask for concrete resolution proposal
   - *Pivot* → Ask user for new focus area; send targeted question to relevant panelists
   - *Conclude* → Proceed to Phase 4

### 3c. Context Management

After 2+ checkpoint cycles, compress completed threads (resolved findings) into a 2-bullet summary. Keep the active thread and all `escalated` findings uncompressed.

### 3d. Keeping It Productive

- If a panelist gives a vague response, push back: "Be specific — what exactly at which line?"
- If an implementer explanation is circular ("I did it this way because it made sense"), redirect: "What was the alternative and why did you reject it?"
- If the reviewer and implementer reach agreement, immediately mark the finding resolved and move on

---

## Phase 4: Verdict and Close

### 4a. Request Verdict

Ask the Reviewer (and any specialists) for their final verdict:

> Reviewer, given the full discussion: what is your verdict? List any remaining conditions that must be met before merge. Be explicit: PASS, PASS WITH CONDITIONS, or FAIL.

### 4b. Produce Meeting Summary

Synthesize into a final output:

```markdown
## Review Meeting: [target]

### Panel
- Implementer — [one-line description of changes defended]
- Reviewer — [one-line summary of review posture]
- [Specialist role name and focus, one line per specialist spawned]

### Findings Summary

| ID | Severity | Description | File:Line | Status |
|----|----------|-------------|-----------|--------|
| R-1 | CRITICAL | ... | ... | resolved / escalated |
| R-2 | WARNING | ... | ... | resolved |
| S-1 | WARNING | ... | ... | escalated |

### Verdict

| Verdict | Critical | Warning | Suggestion | Nitpick |
|---------|----------|---------|------------|---------|
| [PASS / PASS WITH CONDITIONS / FAIL] | C | W | S | N |

**Conditions (must resolve before merge):**
- [ ] [escalated finding ID]: [what must change]

### What Looks Good
- [positive observations]

### Action Items

[Apply sharpening gate: every item must name the specific file/function, state what concretely changes, and be assignable to one agent in one session.]

### Key Insight
[The single most valuable thing that emerged from the discussion.]
```

### 4c. Shutdown

```
SendMessage({ type: "shutdown_request", recipient: "implementer", content: "Review meeting concluded, shutting down" })
SendMessage({ type: "shutdown_request", recipient: "reviewer", content: "Review meeting concluded, shutting down" })
# one shutdown_request per specialist spawned
SendMessage({ type: "shutdown_request", recipient: "<specialist-role>", content: "Review meeting concluded, shutting down" })
```

After confirmations:

```
TeamDelete()
```

```bash
rm -f memory/scratch/review-meeting-panelists.md
```

### 4d. Create Tasks for Unresolved Findings

For escalated findings that became action items:

```bash
# tacks
tk create -t bug "[SEVERITY]: [finding title]"
# bd: bd create --title="[SEVERITY]: [finding title]" --type=bug --priority=<1-for-critical,2-for-warning> \
#   --description="From review meeting on [target]. Location: [file:line]. Issue: [description]. Suggested fix: [fix]."
```

---

## Guidelines

1. **Implementer is not a pushover.** Good explanations of tradeoffs are valid responses. The reviewer should update their position when given good reasons.
2. **Reviewer is not a rubber stamp.** If the implementer's explanation doesn't address the concern, the finding stays open.
3. **Facilitate, don't adjudicate.** The facilitator summarizes and relays — it does not decide who is right. Let panelist reasoning drive resolution.
4. **Anonymize sources, preserve lenses.** When relaying arguments, describe the analytical frame ("from an implementation-constraints perspective") not the role ("the Implementer says"). Prevents authority bias.
5. **CRITICAL findings block.** If any CRITICAL finding remains escalated at the end, the verdict is FAIL regardless of other findings.
6. **Specialists are additive.** Their findings use the same severity scale and relay protocol as the Reviewer's. They never duplicate the general reviewer's concerns — their value is the domain gap.
7. **Short turns.** Panelist responses should be 2-4 paragraphs. This is dialogue, not a report. Push back on essays.

## See Also

- `/review` — static structured review without dialogue; use when you don't need the implementer perspective
- `/meeting` — free-form multi-agent discussion; use when the topic isn't a code review
- `/premortem` — adversarial risk analysis before building; use when you want to stress-test a design, not review existing code
- `/bug` — file escalated findings as tracked issues after the meeting closes
