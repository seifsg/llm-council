---
name: llm-council
description: Runs a council of independent simulated people on any idea, offer, plan, draft, price or decision, shows every answer live in a browser, and ranks common issues into a short action list. Each seat is a fresh isolated process that sees only the real materials and never another seat's answer. Seats can be natures alone (Contrarian, Believer, Neutral, Confused, First Principles, Executor) or personas crossed with natures for a wider audience. Use when asked for a council, a roast, a red team, a pressure test, multiple points of view, a buyer or user panel, or a second opinion on a decision, even if the word council never comes up. Not for questions with a checkable answer, or as evidence of real demand.
---

# LLM Council

One model asked one question gives one careful, agreeable voice. A council forces real spread: separate processes, separate people, no shared answers. Its point is to find what different people all trip over. It cannot prove anyone would pay, use or agree, so real people always outrank it.

Treat it as a test bench: keep the seats fixed and change the draft, so drafts compare. Work through the steps in order. Keep each run in `.council/<run-name>/`, out of Git: it may hold private material.

## 1. Frame the decision

Get these from the user, one short question at a time, skipping what is already known:

1. **Subject:** what is being judged.
2. **Decision:** what the user will do differently depending on the result. No decision, no council: say so and stop.
3. **Materials:** the real text a seat reads, as the audience would see it. Complete: no brackets or blanks, or every seat just complains about them. For a personal decision, include the user's own stakes: seats are then friends or advisers hearing it for the first time. Leave out names, and tell the user that this text goes to the model providers and that a seat's web searches can repeat it.
4. **Kept out:** anything the audience would never see, such as margins, internal costs, other people's private data, past answers.
5. **Options under test:** optional. Named alternatives to decide on one by one, such as prices or versions.

Write it to `frame.md`.

## 2. Choose the seats

| Shape | Seats | Use when |
|---|---|---|
| **Natures only** | The 6 natures, once each | A plan, draft or decision with no specific audience. The default. |
| **Quick** | Personas x Neutral | Each draft while iterating. |
| **Focus** | The personas a change affects x 6 natures | A changed offer or section. |
| **Full** | Personas x 6 natures | A baseline, and before anything goes live. |

Any number of LLMs can run the same seats, and each one adds the full seat count. They catch quirks of one model, and the viewer shows where they differ on the same person.

Read [natures.md](references/natures.md) and use the wording exactly. For personas, read [personas.md](references/personas.md), draft them, have a fresh agent check them, and get the user's approval. Within one persona, shared facts stay fixed and each person has their own interview.

## 3. Build the seat prompts

Fill in [seat-prompt.md](references/seat-prompt.md) for each seat and save it as `seats/<persona>--<nature>.prompt.md` (natures only: `panel--<nature>`). Show the user one finished prompt.

The template handles the known weaknesses of simulated judges. Keep these defences:

| Weakness | Defence |
|---|---|
| Politeness | Private notes, "no one grading you", and only Neutral scores |
| Convergence | Forced natures, first-person people, no shared answers |
| Over-reading | "Stop when you would stop", plus `## Not read` |
| Stated intent: saying yes costs nothing | "Saying yes means giving something up: say what" |
| Forced complaints | "None is fine" |
| Scripted scores: a negative seat scores low because it was told to | Natures other than Neutral give no score |
| Trust gap: seats judge everyone as a stranger, real buyers often come through people | `first_pick_if_introduced` |
| A pitch that cannot be retold to whoever else decides | `## Retell` |

## 4. Pilot, estimate, then run

**Isolation.** A seat is a separate process, never an in-session subagent: those inherit the user's instructions, memory and tools. Run it from a new empty temp folder, outside any repo, with global instructions, memory, plugins, skills and hooks off, and web lookups as its only tool. Limits live in the runner, not the prompt: stop it after about 3 lookups and let the runner save the reply. Confirm the flags with each CLI's `--help`. An engine with no such mode, such as one whose read-only mode still has a shell that can read the user's files: stop and ask. Without a CLI, give the user the prompts to run in separate chats, and cut the unchained block.

**Files the runner writes**, so the viewer shows them live:

- `run.json` before the first seat: `{"title", "decision", "kind": "round"|"pilot", "round": <number, or null for a pilot>, "date": "<ISO>", "effort", "hashes": {"prompt": "<hash of the seat prompt template>", "lives": {"<persona>": "<hash of its facts and interviews>"}}, "engines": [...], "llms": {"<engine>": {"name": "<model shown to the user>"}}, "natures": [...], "people": {"<persona>--<nature>": "<first name>"}}`. Same engine folder names as below. An optional `"icon"` beside `name` takes a base64 image data URI; otherwise common LLMs get a simple mark.
- `live/<engine>/<persona>--<nature>.txt`: reply text, appended as it streams.
- On finish: `answers/<engine>/<persona>--<nature>.md`, and delete the live file. On failure: `answers/<engine>/<persona>--<nature>.error` with the reason.

**Viewer.** Before the first seat, run this in the background and give the user the link. Node 18 or later, no install. See it first with `--demo`.

```text
node <skill-folder>/viewer/serve.mjs .council
```

Pointed at a parent folder it lists every round and compares any two. Pointed at one run folder it shows just that run.

**Pilot.** Before the first real run, and after any change to prompt, model or engine, run 3 seats on each engine: a Confused, a Believer and a Neutral. Read every sentence. It passes when:

- Nobody mentions being AI, a model, a prompt or a simulation.
- Nobody uses knowledge the person should not have.
- Nothing leaks from the user's instructions, memory or private files. Search for names that should not appear.
- The format is valid, and answers read as a person deciding, not as theatre.

If it fails, fix the wording once and rerun. If an engine refuses or breaks on the unchained block, show the user and let them choose.

**Estimate.** Multiply the pilot's tokens per seat by the seat count. Tell the user, and offer a smaller shape if it outweighs the decision. Wait for their OK.

**Models.** A mid-tier model at medium effort is usually enough for seats, because spread comes from the natures. Keep the strongest model for ranking. Keep models fixed across drafts, or scores stop comparing.

**Run.** Parallel batches. A missing or malformed answer gets rerun once alone. Report any seat that still fails.

## 5. Check and rank

Read every answer. Then:

1. **Out of character:** mark any such sentence. A finding from it counts as tainted.
2. **Misread:** check each finding against the materials. Keep it, marked `misread`: confusion is a finding about the materials.
3. **Spread alarm:** with 4 or more Neutral seats, `overall` scores span 4 points or less, or one first pick takes over 75%: report that the council converged. Do not present it as agreement.
4. **Real-world test:** compare the closest seats with anything real the user knows. A miss goes at the top of the report as a known bias.
5. **Merge** findings that mean the same thing, and keep the seats behind each.
6. **Tier** each:
   - **A:** 2 or more natures across 2 or more personas (natures only: 3 or more natures), or a P1 from a Believer.
   - **B:** any other finding from 2 or more seats.
   - **C:** one seat only. List it, do not act on it.
7. **Pull the against-type signals**, the strongest output of the run: a Believer's blocker, and what held up for a Contrarian.
8. **Report disagreement.** Never average it away.

Within a tier, P1 before P2 before P3, then the most seats. Write `issues.json`, which the viewer shows above its live groups: `[{"title","tier","real","type","target","do","money","seats":["<persona>--<nature>"]}]`.

## 6. Write the report

Save `report.md`, lead with the list, and keep it to what the user can act on:

```text
# Council: <subject>
Decision: <the decision from the frame>
Seats: <count, shape, models>. Simulated people: use this to find problems, not to prove demand.
Known bias: <spread alarm, real-world miss, or none>

| # | Tier | Real | Type | Target | Finding | Do this | Payoff | Seats |
```

- **Real:** `confirmed`, `contradicted` or `untested`.
- **Type:** `fix` (wrong), `add` (missing) or `improve` (could be better).
- **Do this:** one concrete change, not a theme.
- **Payoff:** what the change is worth. For anything commercial, name how it earns or saves money.

Then, briefly: changed since the last draft, against-type signals, Neutral scores, disagreements, Confused questions, better framings, first stalls, and the 1 to 3 real-world checks that would settle the biggest unknowns.

## 7. Feed in reality

Real reactions outrank every seat. When the user reports a call, sale, refusal, test or usage figure:

1. Add it to `reality.md` with the date, who, what they did, and whether money, time or access changed hands. Never show this file to a seat.
2. Mark each affected finding `confirmed`, `contradicted` or `untested`, and rank by this first, ahead of tier.
3. If a persona behaved unlike the real person, correct it and say so.

Before a real conversation, offer the top unknowns as questions about past behaviour, not opinions of the idea. With a real person's consent and names removed, an interview with them makes a stronger seat than an invented one.

## Keeping rounds

Each run of a draft is a round in its own folder, and old rounds are never overwritten. Number them in order, and give a pilot no number. At the start, copy the materials and frame into the round's folder and have seats read that copy, so later edits cannot change its history. Keep `report.md` and `issues.json` there too. Refuse to start in a folder where every requested seat has answered. A resume is only for missing seats, and only if the fingerprints still match.

## Comparing drafts

Compare only the same person on the same engine, with the same prompt, facts, interview and scale. If any changed, compare findings instead and say why. The viewer's Rounds tab applies this from the fingerprints in `run.json`, and marks options that exist in only one round rather than comparing them. Never present a score rise as proof of demand: it may only mean the seats saw better wording.
