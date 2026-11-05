# LLM Council

A Claude skill that puts any idea, offer, plan, draft, price or decision in front of a council of independent simulated viewpoints, then ranks what they found into a short action list.

Ask one model and you get one careful, agreeable voice. A council gets real spread: each seat is a fresh agent with its own temperament, reading only the real materials and never another seat's answer.

## The six lenses

| Lens | Its one job |
|---|---|
| Contrarian | Find the fatal flaw. Never says it's fine. |
| Believer | Show how it pays off and where it could be bigger. |
| Neutral | Weigh it objectively. The only lens that gives scores. |
| Confused | Ask everything a newcomer would not understand. |
| First Principles | Ask what is really being solved, and whether this is the right question. |
| Executor | Walk through Monday morning and name each stall. |

Use the lenses alone for a plan or decision (6 seats). Cross them with personas when the answer depends on who is judging: 10 personas make 60 seats.

The strongest signals come from seats going against type: a blocker from the Believer, and what still held up for the Contrarian.

## Install

As a Claude Code plugin:

```text
/plugin marketplace add seifsg/llm-council
/plugin install llm-council@llm-council
```

Or copy `skills/llm-council` into your personal or project skills folder. In the Claude apps, upload that folder as a skill. Running seats in parallel needs a host with subagents.

## Use

Just ask:

```text
Run a council on this pricing page before I publish it.
Red-team my plan to move off the old billing system.
Get me a panel of buyers on these three landing page headlines.
```

The skill asks what decision the result will change, confirms what seats may read, shows you the personas and a cost estimate from one pilot seat, and only then runs the rest. Each run lives in `.council/<run-name>/`. Add `.council/` to your `.gitignore`: it may hold private material.

## What it cannot do

These are simulated viewpoints. They find confusion, objections and blind spots, but they cannot show that anyone would really pay, use or agree. The skill records real reactions alongside each finding, and real ones always win.

## License

[MIT](LICENSE)
