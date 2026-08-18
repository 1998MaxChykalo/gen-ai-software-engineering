# Skill: Research Quality Measurement

**Used by:** Bug Research Verifier (`agents/research-verifier.agent.md`)
**Purpose:** Define a repeatable scale and output format for grading the quality of a
`codebase-research.md` document, so that research quality is measured the same way on every
pipeline run and the Bug Planner knows exactly how much it can trust the research.

## Quality levels

| Level | Label | Criteria (ALL must hold for the level) |
|-------|-------|----------------------------------------|
| 5 | **GOLD** | 100% of file:line references resolve; 100% of quoted snippets match source exactly; every reported symptom has an identified root cause; no relevant code path missed |
| 4 | **SILVER** | ≥ 90% of references resolve; snippets match with only trivial drift (whitespace/line shift ≤ 2 lines); every root cause identified; at most one minor omission |
| 3 | **BRONZE** | ≥ 75% of references resolve; root causes correct for all high-severity items; some snippets stale or secondary claims unverified |
| 2 | **UNRELIABLE** | < 75% of references resolve, or at least one root cause is wrong/unsupported by the code |
| 1 | **REJECTED** | Research is misleading: fabricated references, wrong files, or root-cause analysis that would send the Bug Fixer to edit the wrong code |

**Gate rule:** The pipeline may proceed to planning only at **BRONZE or above**. At
UNRELIABLE or REJECTED, the verifier must mark the verification **FAIL** and the pipeline
stops so the Bug Researcher can be re-run.

## How to measure

1. **Reference resolution** — for every `file:line` claim, open the file and check the line
   exists and contains the code the research says it does. Count resolved / total.
2. **Snippet accuracy** — diff every quoted snippet against the actual source. Exact match,
   trivial drift, or mismatch.
3. **Root-cause soundness** — for each symptom in `bug-context.md`, decide whether the
   claimed root cause actually explains the reported behavior (reason through the code path;
   run the referenced tests if available).
4. **Coverage** — check whether any file involved in the symptom is missing from the
   research (search the codebase for the symptom's code path).

## Required output format for `verified-research.md`

The verifier MUST produce these sections, in this order:

```markdown
# Verified Research — <batch id>

## Verification Summary
- Overall: PASS | FAIL
- Research Quality: <LEVEL NAME> (level <n>/5) — per skills/research-quality-measurement.md
- References resolved: <x>/<y>
- Snippets exact: <x>/<y>

## Verified Claims
| # | Claim | File:Line | Verdict | Note |

## Discrepancies Found
(numbered list; "None" if empty)

## Research Quality Assessment
(level + reasoning against the criteria table above)

## References
(files inspected, commands run)
```
