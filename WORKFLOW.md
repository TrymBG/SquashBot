Working with Claude Code: my workflow

A short guide for using Claude Code efficiently on the squash bot, without losing my own understanding of the code.

Checklist: TODO.md is the single list of what to do. Check items off there when they are done and verified, and add new tasks there.

The core loop
Spec the feature in a few lines: inputs, outputs, edge cases.
Plan with plan mode. Read the plan and correct it before any code is written.
Build one small step at a time.
Verify with tests, typecheck and lint.
Review the diff like a code reviewer.
Commit the working step.
Explain back in my own words, and log what the agent got wrong.
Rules
1. Give it a way to check its own work
Put the commands in CLAUDE.md: npm test, npm run typecheck.
Ask for tests first, then make them pass.
Tests are my safety net. The 19 tests in elo.test.ts are the model to copy.
2. Plan before code
Use plan mode for anything bigger than a small fix.
A wrong assumption costs one sentence at the plan stage and a revert after 300 lines of code.
3. Be specific
Bad: "Add /h2h."
Good: "Add /h2h taking two users, showing wins, losses and the last 5 matches from matches, with tests, following how /stats is structured."
Point it at an existing file as the pattern to follow.
4. Keep tasks small, commit often
One feature at a time and one commit per working step.
Small diffs are easy to review, and a bad change is easy to undo.
5. Keep CLAUDE.md short and useful
Include: commands to run, project structure, rules I care about, decisions already made.
Update it when the agent gets something wrong twice.
A long, vague file gets ignored.
6. Manage context
Start a fresh session for a new task.
Clear or compact a cluttered conversation.
Give file paths instead of pasting whole files.
7. Review every diff
Ask: what did you assume, and what did you not test?
If I don't understand a part, make it explain that part before I accept it.
8. Use it for the right things
Good use	Be careful
Exploring unfamiliar code	Design decisions I can't explain
Writing tests	Anything I'd be unable to debug myself
Boilerplate and refactors	Security and input validation (check by hand)
Debugging from stack traces	
9. Correct it early
If it heads the wrong way, interrupt and redirect.
Don't wait for it to finish and then undo the work.
What I write by hand vs delegate
By hand: elo.ts, the core rating logic. I must be able to explain every line.
Delegate with a plan: slash command handlers, database queries, the API and the website.
Always check myself: tests and the diff.
Check I'm not leaning on it too much
 Can I explain every part of last week's features without looking?
 Could I rebuild elo.ts on a blank page?
 When the agent is wrong, do I notice before the tests do?

If any answer is no, move a few hours back to writing by hand.

Agent log

One line per agent-assisted change: