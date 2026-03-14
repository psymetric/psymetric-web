1. First-run operator journey
Likely first-run path
Step 1: Open the repo and look for the VEDA entry point

A first-time operator has C:\dev\psymetric open and likely notices there is a vscode-extension/ folder plus docs describing VEDA as a multi-project observatory.

What they probably infer:

“There is a VS Code extension.”

“VEDA probably shows up in the VS Code sidebar.”

“I probably need to run the extension host or install the extension first.”

Step 2: Try to launch the extension

The extension README says to open vscode-extension/, compile, and press F5 to launch the Extension Development Host.

This is already a small fork in the road:

If the operator opened the repo root, not vscode-extension/, they may not know whether to run from root or from the extension folder.

The repo-level docs emphasize VEDA concepts and workflows, but not a crisp “here is how a first-time operator actually gets into the VS Code surface.”

Step 3: Notice the VEDA activity bar icon

Once the extension is running, the operator should find a VEDA activity bar container with a telescope icon.

That part is reasonably discoverable.

Inside it they will see:

Project Context

Editor Context

Investigation Summary

Top Alerts

Keywords

Recent Page Workflow

SERP Observatory

VEDA Brain

Step 4: Figure out environment selection

The most obvious active control is the status bar item:

VEDA: LOCAL
or similar.

The operator likely clicks it and sees VEDA: Switch Environment.

This is decent, but there is immediate ambiguity:

Which environment should I use right now?

Is local expected to be running already?

How do I know whether the selected environment is reachable?

What makes stage or prod safe vs unsafe?

The current system lets the operator switch environments, but it does not really orient them.

Step 5: Try to select a project

Project Context empty state says:

No project selected

Run VEDA: Select Project to begin.

That is useful. The operator then runs Select Project.

Possible outcomes:

If projects exist: they pick one from Quick Pick.

If no projects exist: they get the warning
“No projects found. Ensure the VEDA environment is reachable and a project exists.”

This is a major first-run snag.

Because the stated first-run mission is “a project that needs to be added and used”, the operator will expect some path like:

Create project

Draft blueprint

Apply blueprint

Then use the observatory

But the extension currently exposes Select Project, not Create Project.

So on true first run, the operator can hit a wall immediately.

Step 6: After selecting a project, look for “what next?”

Once a project is selected, Project Context shows:

environment

active project

lifecycle badge

maybe domain

maybe maturity

next action

This is one of the stronger surfaces. It gives some orientation.

But the operator still has to translate that into action. The likely next move is basically guesswork:

Open SERP Observatory?

Open VEDA Brain?

Open a page file and use Editor Context?

Investigate Project?

Start blueprinting somewhere else?

Step 7: Explore the panels to understand the system

A first-time operator will likely click around like this:

Project Context
“Okay, I have a project.”

SERP Observatory
“This looks like climate/alerts/hints/impact. So this is operational search monitoring.”

VEDA Brain
“This looks like structural mismatch diagnostics.”

Editor Context
“This seems to classify the currently open file and maybe derive a route.”

Recent Page Workflow
“Looks like history memory, but maybe empty.”

Investigation Summary / Top Alerts / Keywords
“These seem keyword and alert oriented.”

This is where the system starts to feel smart but also somewhat mythological. There is a lot of capability aura, but not enough explicit guidance about sequence.

Step 8: Try to add a new project

Because the operator was told a project needs to be added and used, they will now look for:

a “Create Project” button

a command

an action in Project Context

maybe something in VEDA Brain or Command Center

They will not find an obvious first-class entry point in the extension.

At that point they either:

give up,

open docs,

or start manually probing the API / code.

That is exactly the kind of first-run operator gap this audit is meant to catch. Tiny gremlin, huge confusion.

2. Friction points
1. The extension supports project selection, but not project creation

This is the biggest first-run gap.

The docs define a very explicit project lifecycle:

create project container

draft blueprint

review

apply

research

targeting

observing

But in the actual VS Code operator surface, the first visible project action is Select Project, not Create Project.

For a brand-new operator with no projects, the system effectively says:

“Choose a project”

and when none exist:

“Make sure one exists”

That is accurate but not helpful. It assumes someone else already prepared the world.

2. Environment selection is visible but not contextualized

The status bar entry is discoverable, but the operator lacks basic first-run answers:

Which environment should be used first?

Does local require the app to be running?

How do I verify connectivity?

Is the selected environment empty, wrong, or broken?

The current experience treats environment choice as obvious. It is not obvious.

3. Empty states are too thin in high-friction places

Some empty states are decent, but many stop one step too early.

Examples:

No project selected → useful

Select a project to view the SERP Observatory → technically true, but not enough

Loading Brain diagnostics… / Failed to load → okay, but not actionable

No projects found. Ensure the VEDA environment is reachable and a project exists. → this is the classic “the machine knows but the human does not” message

The operator often needs:

what this panel is for

why it is empty

the next valid step

Currently many surfaces only provide the middle one.

4. Blueprint workflow exists in docs but is not discoverable in the operator surface

The roadmap and specs clearly say the blueprint is foundational.

But from the operator’s first-run perspective, there is no obvious visible bridge from:

project created
to

blueprint draft/review/apply

So blueprint feels architecturally important but operationally hidden.

That creates a nasty cognition split:

the docs say blueprint is required before research

the extension does not visibly usher the operator into blueprint work

5. The system uses strong internal terms without enough first-run meaning

Terms like:

Project Context

SERP Observatory

VEDA Brain

Page Command Center

proposals

blueprint

lifecycle state

next valid action

make sense after orientation, but a first-time operator can’t reliably infer all of them.

Some terms are intuitive-ish, others are not.

In particular:

VEDA Brain sounds important but not concretely actionable

Page Command Center is referenced indirectly, not explained as part of an operator journey

proposals are defined in spec but not surfaced as a first-run concept

Project Context is visible, but not explicitly framed as the control point for project state

6. Action continuity from diagnostics to next step is inconsistent

VEDA Brain does one thing well: it lets you jump from mismatch items into Page Command Center.

That cross-panel link is good and high leverage.

But outside that path, many diagnostics don’t answer the operator’s immediate question:

“What am I supposed to do now?”

They show:

a mismatch

a gap

an opportunity

a weather state

a hint

But not always:

where to go next

which command to run next

whether this belongs to blueprint, content graph, SERP observation, or page-level review

7. Some panels are useful only after hidden prerequisites are already satisfied

A first-time operator may open:

SERP Observatory

Keywords

Top Alerts

Investigation Summary

VEDA Brain

and see data only if the project is already meaningfully populated and observed.

That means the operator can encounter a sophisticated dashboard that is operationally dead on first run, without enough explanation of prerequisites.

The machine is waiting for history. The human is waiting for instruction. Two lonely ships in the fog.

3. Dead ends / ambiguity zones
A. “No projects found” is a dead end

This is the cleanest dead end in the current experience.

The operator is told:

select a project

but there are none

and there is no adjacent create action

That blocks first-run adoption immediately.

B. After project selection, the next meaningful move is unclear

Even with a selected project, the operator is not clearly guided into one of these distinct paths:

blueprint work

keyword research

SERP observation

page-level diagnosis

The system shows many surfaces, but it does not strongly tell the operator which one is the right next move for the project’s lifecycle state.

C. Blueprint is architecturally central but operatorically ghostly

The docs make it essential.
The extension does not make it discoverable.
That creates ambiguity around whether blueprint work is:

done in the extension,

done via MCP,

done through API,

or done manually somewhere else.

D. VEDA Brain can diagnose structure, but not always explain the workflow stage it belongs to

A first-time operator may see:

archetype mismatches

entity gaps

schema opportunities

authority opportunities

and ask:

“Is this for blueprint revision?”

“Is this for content graph curation?”

“Is this for page execution?”

“Is this just analysis?”

“Am I supposed to apply anything?”

That is a workflow ambiguity zone.

E. Page Command Center is discoverable only indirectly

The operator can get there from Brain via the icon link, or from page investigation flows, but it is not clearly introduced as a core destination in the visible first-run journey.

This means an important operational surface may feel like a hidden room behind the bookshelf.

F. Proposals exist in spec/API but are not yet part of an operator-understandable loop

The proposal spec is clear:

read-only

operator-reviewable

archetype + schema first

no automatic mutation

But for a first-time operator, “proposals” are not yet part of a discoverable workflow in the extension, so there is no visible mental model for:

where proposals appear

why they matter

what happens after review

4. Hidden assumptions

The current system assumes the operator already knows several things that a true first-time operator does not.

1. It assumes the operator knows how to launch the extension

The extension README explains it, but the broader repo context does not make this the obvious first-run move.

2. It assumes the operator knows which environment to use

The system exposes environment switching but does not teach environment choice.

3. It assumes a project already exists somewhere

That is the most consequential hidden assumption.

The extension behaves like a command center for an already-initialized system, not like a full first-run operator cockpit.

4. It assumes the operator understands lifecycle semantics

States like:

created

draft

researching

targeting

observing

are meaningful in docs, but the operator may not know what practical action each state implies.

5. It assumes the operator understands the distinction between observatory vs structure vs planning

A first-time user may not naturally know the boundaries between:

SERP Observatory

VEDA Brain

Project Context

Page Command Center

Content Graph

blueprint

Those separations are builder-obvious, not operator-obvious.

6. It assumes the operator understands that some surfaces depend on historical project data

Panels like alerts, keywords, disturbance climate, and structural gaps all become more meaningful after setup and data accrual. That prerequisite is not always surfaced.

7. It assumes the operator knows where blueprint work happens

The docs say blueprint is required. The visible extension path does not show the blueprint entry point clearly enough to justify that assumption.

5. Minimal improvements only

These are intentionally small, high-leverage changes. No redesigns. No giant UX moonshot.

1. Add a first-run “no projects found” recovery path

When Select Project returns no projects, the message should not stop at “ensure a project exists.”

Minimal improvement:

Add a second action in that warning/message/empty state:

Create Project

or Open Create Project Workflow

Even if full creation is not yet implemented in the extension, provide a guided next step:

open the relevant doc

open command palette suggestion

open a lightweight webview with instructions

This single fix removes the harshest first-run dead end.

2. Strengthen Project Context as the first-run anchor

Project Context is already the closest thing to a control tower.

Minimal improvements:

When no project is selected, show:

Select Project

Create Project

How VEDA project setup works

When a project is selected, show a clearer lifecycle-specific hint:

created → “Next: draft blueprint”

draft → “Next: review/apply blueprint”

researching → “Next: define keyword targets”

targeting → “Next: begin SERP observation”

This uses the surface that already exists rather than inventing a new one.

3. Add one-line purpose text to major empty states

For the first-run operator, every empty state should teach:

what this panel is for

why it is empty

what to do next

Examples:

SERP Observatory
“Tracks live search climate, alerts, and affected keywords for the active project. Select a project with observed keywords to view data.”

VEDA Brain
“Shows structural diagnostics between tracked keywords, mapped pages, and SERP patterns. Select a project with keyword and page data to view diagnostics.”

Recent Page Workflow
“Stores your recent page and page-keyword investigations for quick return.”

Keywords
“Shows tracked keyword targets for the active project.”

Tiny text. Big operator sanity.

4. Make blueprint workflow discoverable from the extension

Minimal options:

Add a command like VEDA: Open Project Blueprint Workflow

Mention blueprint explicitly in Project Context next action

Add a lightweight link/hint in the empty/no-project or created/draft lifecycle states

This would fix the current “docs say blueprint is essential, UI acts like it’s folklore” problem.

5. Add lightweight cross-panel hints

Panels should point to neighboring relevant surfaces when appropriate.

Examples:

In VEDA Brain empty state or header:

“Use Page Command Center to inspect mapped pages”

In SERP Observatory:

“Use VEDA Brain for structural mismatch review”

In Project Context:

“Use SERP Observatory for external search conditions”

“Use VEDA Brain for structural diagnostics”

No redesign needed. Just breadcrumbs.

6. Improve environment switching guidance

Minimal enhancement:

In the environment picker or after switch, show a message like:

LOCAL — uses http://localhost:3000

If possible, surface reachability failure more explicitly when project load fails:

“Could not reach LOCAL at http://localhost:3000”

instead of forcing the operator to infer that from generic absence

That turns an invisible infrastructure assumption into an understandable operator state.

7. Clarify Page Command Center naming/context where it appears

When VEDA Brain opens Page Command Center, the operator should understand what that destination is.

Minimal improvement:

The open action tooltip/title could say:

“Open mapped page in Page Command Center”

The resulting panel title could include a short descriptor:

“Page Command Center — /route”

Tiny language tweak, much less mystery.

8. Add a first-run command palette cluster

Without redesigning anything, you can improve discoverability by ensuring the command palette has a clear setup path:

Suggested command naming tweaks only:

VEDA: Select Project

VEDA: Create Project

VEDA: Open Project Blueprint Workflow

VEDA: Switch Environment

VEDA: Investigate Project

Right now the available names skew diagnostic/operational rather than onboarding.

6. Priority ordering

Ranked by operator impact vs implementation effort.

Priority 1 — Add a recovery path when no projects exist

Why first: This is the biggest first-run blocker.
Effort: Small.
Impact: Huge.

Without this, first-run use can collapse instantly.

Priority 2 — Use Project Context as the lifecycle-guided next-step surface

Why: The panel already exists and already shows next action.
Effort: Small.
Impact: Huge.

This is the cheapest way to turn VEDA from “many smart panels” into “I know what to do next.”

Priority 3 — Make blueprint workflow explicitly discoverable

Why: Blueprint is central in docs but hidden in operator flow.
Effort: Small to medium.
Impact: Very high.

This closes the biggest conceptual gap between architecture and usage.

Priority 4 — Improve empty-state copy across core panels

Why: Empty states are where first-run trust is won or lost.
Effort: Small.
Impact: High.

This reduces confusion without changing the system shape.

Priority 5 — Improve environment guidance and failure messaging

Why: Environment confusion is subtle but very common on first run.
Effort: Small.
Impact: High.

Especially important for local.

Priority 6 — Add lightweight cross-panel hints

Why: Helps operators understand panel relationships.
Effort: Small.
Impact: Medium-high.

This improves continuity without adding new architecture.

Priority 7 — Clarify Page Command Center wording

Why: Useful but currently semi-hidden and underexplained.
Effort: Very small.
Impact: Medium.

Priority 8 — Tighten command naming for onboarding discoverability

Why: Helps command palette-driven users.
Effort: Small.
Impact: Medium.

Bottom line

The current VEDA surface already has real strengths:

the VEDA activity bar entry point is discoverable

Project Context is the right kind of anchor

VEDA Brain → Page Command Center linking is a strong continuity pattern

the system has a coherent underlying lifecycle model

But as a first-run operator experience, it currently behaves too much like a command center for a world that already exists.

The biggest gap is simple and brutal:

VEDA assumes project existence more than it supports project initialization.

That one hidden assumption cascades into most of the friction:

project creation is not obvious

blueprint workflow is not surfaced enough

empty states stop too early

diagnostics appear before the journey is legible

The good news is that this does not need a redesign. A handful of small improvements would do a lot of work:

recover from “no projects found”

make blueprint visible

let Project Context actively guide next steps

make empty states teach the operator what comes next

That would turn the first-run experience from “clever but cryptic” into “usable on day one.”