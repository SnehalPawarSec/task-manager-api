# Notes

## New endpoint: `PATCH /tasks/:id/assign`

**Request:** `{ "assignee": "string" }` → **Response:** the updated task.

I added an `assignee` field to the task. `create()` now initializes it to
`null` so the field is always present on every task rather than appearing only
after the first assignment — I'd rather the shape be predictable for clients
than have `assignee` blink into existence.

The endpoint lives in `routes/tasks.js`, validation in `validators.js`
(`validateAssign`), and the store update in `taskService.js` (`assign`), which
matches how the rest of the codebase is split up.

### Decisions and edge cases

- **Empty / whitespace-only assignee → 400.** An empty string isn't a real
  assignment, so I treat it like a missing value. The assignee is trimmed and
  must be a non-empty string; `""`, `"   "`, and a missing field all return 400.
- **Non-string assignee → 400.** Sending `{ "assignee": 42 }` is rejected
  rather than coerced.
- **Stored value is trimmed.** `"  Priya  "` is stored as `"Priya"` — consistent
  with the leading/trailing-space handling the title validator already implies.
- **Unknown task → 404**, matching the other `/:id` routes.
- **Already assigned?** I let reassignment overwrite the previous assignee and
  return 200 with the updated task. Reassigning work is a normal thing to do, so
  blocking it (e.g. 409 Conflict) felt wrong for a task manager. If the product
  actually wanted assignment to be one-shot, that's a small change — but I'd want
  that to be a real requirement, not a guess.

### One tradeoff worth calling out

I validate the body **before** checking whether the task exists, so
`PATCH /tasks/<missing-id>/assign` with an empty assignee returns 400, not 404.
I chose "the request is malformed regardless of the target" — fail fast on
client error. A reasonable person could argue 404 should win because the
resource doesn't exist. It's a judgment call; happy to flip it.

---

## Submission note

**What I'd test next with more time**

- The `status` + pagination combination and negative/oversized page values
  (see the bug report) — right now pagination and filtering can't be used
  together, and I'd want a decision plus tests around that.
- Concurrency on the in-memory store. It's fine single-threaded, but I'd add
  tests for interleaved create/complete/delete if this ever moved to a real db.
- A test that actually exercises the 500 error handler in `app.js` (it's the one
  meaningful uncovered branch).

**What surprised me**

The bugs were quiet ones. Nothing throws — every buggy endpoint returns a
plausible-looking 200. The pagination and priority-reset bugs in particular
would sail through a quick manual smoke test and only show up when you assert on
exact values. That's the whole argument for the test suite.

**Questions I'd ask before shipping to production**

- The README and ASSIGNMENT.md disagree on status values
  (`pending/in-progress/completed` vs `todo/in_progress/done`). The code uses
  `todo/in_progress/done`; I went with the code. Which is the source of truth?
- Should assignment be restricted to known users, or is any free-text name fine?
  Right now it's free text.
- Is the in-memory store a stand-in for a real database, or intentional? It
  resets on restart, which is fine for the exercise but not for production.

---

## Test summary

50 tests across 3 files, all passing.

```
File             | % Stmts | % Branch | % Funcs | % Lines
-----------------|---------|----------|---------|--------
All files        |    97.5 |     95.5 |   93.54 |   97.24
 routes/tasks.js |     100 |    91.66 |     100 |     100
 taskService.js  |     100 |    94.73 |     100 |     100
 validators.js   |     100 |      100 |     100 |     100
 app.js          |   69.23 |       75 |       0 |   69.23
```

`app.js` is the only file below the line — the uncovered part is the
`app.listen()` bootstrap and the error-handler branch, not application logic.

- `tests/taskService.test.js` — unit tests for the service functions directly
- `tests/tasks.routes.test.js` — integration tests (Supertest) for the existing endpoints
- `tests/assign.routes.test.js` — integration tests for the new assign endpoint
