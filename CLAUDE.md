# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this repo is

Homework submission repository for the **GenAI and Agentic AI for Software Engineering** course. It is a template for submitting homework assignments throughout the program. Each `homework-N/` folder is one assignment, and the focus is on **AI-assisted development** — documenting how AI tools contributed to the work is as important as the code itself.

## Repository structure

```
ai-assisted-dev-homework/
├── README.md                       # Course/submission instructions
├── homework-1/                     # Simple API with AI Assistance
│   ├── README.md                   # Documentation for HW1
│   ├── src/                        # Source code
│   ├── docs/screenshots/           # Screenshots demonstrating AI usage
│   └── demo/                       # Demo files and run scripts
├── homework-2/                     # Enhanced App with Tests
├── homework-3/                     # App from Specification
├── homework-4/                     # Multi-Agent System
├── homework-5/                     # MCP Server Configuration
└── homework-6/                     # Capstone Project
```

## Required documentation (every homework)

| Item | Description |
|------|-------------|
| `README.md` | Clear explanation of the solution, approach, AI tools used, and the **author**. |
| `HOWTORUN.md` | Step-by-step guide to run the application, with detailed environment setup and a testing guide. |

## Screenshots (highly expected)

Place screenshots in `docs/screenshots/` within each homework folder, demonstrating:
- AI tool interactions (prompts and responses)
- The application running successfully
- Test results (if applicable)
- Any interesting AI suggestions or corrections

Provide runnable demo scripts where applicable.

### How screenshots get produced

Split by what can be reproduced deterministically vs. what only exists on the user's screen.

**Claude auto-generates (writes directly into `docs/screenshots/`):**
- App-running / startup logs and **test results** — capture the text output; render to PNG with `silicon` if an image is needed.
- **Web UI** screenshots — drive a headless browser deterministically:
  ```bash
  npx playwright screenshot http://localhost:3000 homework-N/docs/screenshots/ui.png
  ```
- Any on-screen window via the macOS built-in CLI (captures the user's actual display):
  ```bash
  screencapture -T 2 homework-N/docs/screenshots/app-running.png   # full screen, 2s delay
  screencapture -i  homework-N/docs/screenshots/test-results.png   # interactive region/window
  ```

**User captures manually (Claude cannot see these windows):**
- **AI-tool interactions** — prompts/responses in Claude Code or the IDE. Use `Cmd+Shift+4` then space to grab a window, or `Cmd+Shift+5`.
- Any notable AI suggestion or correction shown only in the editor/terminal.

Prefer capturing reproducible **text output** (saved into `docs/`) over screenshots when the evidence is a log or test run; use image screenshots when the homework specifically expects a visual.

## Testing policy

**Always cover changes with unit/integration tests.** Every new endpoint, feature, or piece of logic ships with tests, and every bug fix adds a regression test that fails before the fix and passes after. Don't consider a change done until its tests exist and pass.

## Submission workflow

- One branch per assignment: `homework-N-submission`.
- Open a **Pull Request on your own fork** — never into the original upstream repository.
- Base branch is `main` on the personal fork; compare branch is `homework-N-submission`.
- Add the instructor `Alexey-Popov` as reviewer. Optionally add labels like `homework-1`, `ready-for-review`.

### Pull request quality (submission-critical)

A bare or one-line PR will be **rejected**. The PR body must stand on its own and include:
- Summary of what was implemented (enough detail for someone unfamiliar with the branch).
- AI tools used — prompts, workflow, and what was verified manually.
- Challenges encountered and how they were addressed.
- **Screenshots** showing the running solution and AI-assisted work, embedded in the PR (and also added to `docs/screenshots/`).

Homework without a detailed PR description and the expected screenshots will not be accepted.

## Grading criteria (optimize for these)

| Criteria | Weight | Description |
|----------|--------|-------------|
| Functionality | 30% | Does the code work as specified? |
| AI Usage Documentation | 25% | Clear documentation of how AI tools were used |
| Code Quality | 20% | Clean, readable, well-structured code |
| Documentation | 15% | README, comments, and explanations |
| Demo & Screenshots | 10% | Visual evidence of working solution and AI interaction |
