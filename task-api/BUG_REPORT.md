# Bug Report

Four bugs turned up while writing the test suite. All of them are logic bugs in
`taskService.js` (plus one input-handling gap that spans the service and the
validators). I fixed all four — each one had a test that failed first, then
passed after the fix. Details below.

---

## 1. Pagination skips the entire first page  _(high severity)_

**Where:** `src/services/taskService.js` → `getPaginated()`

```js
const offset = page * limit;   // bug
```

**Expected:** `GET /tasks?page=1&limit=10` returns tasks 1–10.

**Actual:** It returns tasks 11–20. The route treats `page` as 1-indexed
(`parseInt(page) || 1` defaults to `1`), but the offset is computed as
`page * limit`. With `page=1, limit=10` the offset is `10`, so the first ten
tasks are unreachable through pagination entirely.

**How I found it:** I seeded 25 tasks and asserted that page 1 starts with
"Task 1". It came back starting at "Task 11".

**Fix:** offset must account for the 1-indexing.

```js
const offset = (page - 1) * limit;
```

---

## 2. Status filter matches substrings instead of exact values  _(high severity)_

**Where:** `src/services/taskService.js` → `getByStatus()`

```js
tasks.filter((t) => t.status.includes(status));   // bug
```

**Expected:** `GET /tasks?status=done` returns only tasks whose status is
exactly `done`.

**Actual:** It does a substring match on the status string. Any partial value
leaks unrelated tasks — e.g. `?status=in` matches `in_progress`, and
`?status=` (empty) or `?status=o` matches almost everything. It happens to
return the right thing for the three exact status words, which is why it's easy
to miss, but the moment a caller passes a partial value the filter is wrong.

**How I found it:** A test asserting that `getByStatus('do')` returns `0`
results (it should not match `todo` or `done`) failed.

**Fix:** compare for equality.

```js
tasks.filter((t) => t.status === status);
```

---

## 3. Completing a task silently resets its priority  _(medium severity)_

**Where:** `src/services/taskService.js` → `completeTask()`

```js
const updated = {
  ...task,
  priority: 'medium',   // bug
  status: 'done',
  completedAt: new Date().toISOString(),
};
```

**Expected:** Marking a task complete changes `status` to `done` and stamps
`completedAt`. Nothing else should change.

**Actual:** It also overwrites `priority` with `'medium'`. A task created as
`high` priority comes back as `medium` after completion — silent data loss.
This is the kind of bug that survives forever because the response still looks
plausible.

**How I found it:** Created a `high` priority task, completed it, and asserted
the priority was still `high`.

**Fix:** remove the `priority` line so completion only touches status and
`completedAt`.

---

## 4. Update lets the client overwrite the id (mass assignment)  _(medium severity)_

**Where:** `src/services/taskService.js` → `update()`, with a gap in
`src/utils/validators.js` → `validateUpdateTask()`

```js
const updated = { ...tasks[index], ...fields };   // bug: fields is unfiltered
```

**Expected:** `PUT /tasks/:id` updates the editable fields of a task. Identity
and audit fields (`id`, `createdAt`) are server-owned and should not be
writable by the client.

**Actual:** The whole request body is spread over the task. Sending
`PUT /tasks/<id>` with `{ "id": "anything" }` changes the task's `id`, which
orphans it — it can no longer be found, updated, or deleted by its original id.
`createdAt` can be rewritten the same way. The validator never looks at these
fields, so nothing stops it.

**How I found it:** Sent an update with a spoofed `id` and then asserted the
task was still retrievable by its original id. It wasn't.

**Fix:** strip server-owned fields before merging.

```js
const PROTECTED_FIELDS = ['id', 'createdAt'];
const safeFields = { ...fields };
PROTECTED_FIELDS.forEach((key) => delete safeFields[key]);
const updated = { ...tasks[index], ...safeFields };
```

---

## Smaller things I noticed but left alone

These aren't clear-cut bugs, so I didn't change behavior — flagging them for
discussion instead:

- **`status` and pagination can't be combined.** In the `GET /tasks` handler
  the `status` branch returns early, so `?status=todo&page=2` silently ignores
  pagination. Fine for now, but worth deciding on before this grows.
- **Pagination doesn't guard negative pages.** `?page=-1` gets past the
  `parseInt(page) || 1` default (because `-1` is truthy) and produces a negative
  offset. Low impact with `Array.slice`, but it's a rough edge.
- **No single-task GET route.** There's no `GET /tasks/:id`, so a client can't
  fetch one task by id. Might be intentional; noting it in case it isn't.
