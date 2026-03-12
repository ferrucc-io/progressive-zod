You are helping the user add runtime type observability to their codebase using `progressive-zod`.

## What progressive-zod does

`progressive-zod` records every piece of data flowing through untyped boundaries in a running app, then infers Zod schemas from observed patterns. It lets developers **progressively replace `any` with real schemas** without upfront effort.

## Your task

Scan the user's codebase and instrument untyped boundaries with `progressive()` wrappers. Follow these steps:

### 1. Find untyped boundaries

Search for code patterns that handle data without runtime validation:

- **API route handlers** — request bodies, query params, path params (`req.body`, `req.query`, `request.json()`, etc.)
- **External API responses** — `fetch()`, `axios`, HTTP client calls where the response is used as `any`
- **Database query results** — raw results from ORMs, query builders, or direct DB clients
- **JSON.parse()** calls — parsing untrusted or untyped JSON
- **Message queue consumers** — Kafka, RabbitMQ, SQS message handlers
- **WebSocket message handlers** — incoming message parsing
- **File reads** — parsing CSV, YAML, config files
- **Third-party SDK responses** — any SDK call returning untyped data
- **Function parameters typed as `any`, `unknown`, or with type assertions** (`as SomeType`)

### 2. Add progressive-zod wrappers

For each boundary found, add a `progressive()` call. Use descriptive names that identify the boundary.

```typescript
import { progressive } from "progressive-zod";

// Before: untyped
const data = req.body;

// After: observed
const UserCreate = progressive("UserCreate");
const data = UserCreate.parse(req.body);
```

**Naming convention:** Use PascalCase names that describe what the data represents, e.g.:
- `"UserCreate"` for a user creation endpoint body
- `"StripeWebhook"` for a Stripe webhook payload
- `"OrderQuery"` for a database query result

### 3. Ensure progressive-zod is configured

If there's no existing setup, add this to the app's entry point:

```typescript
import { configure } from "progressive-zod";

// For localhost development — no Redis needed
configure({
  storage: "memory",
  dataDir: ".progressive-zod",
});
```

Add `.progressive-zod/` to `.gitignore` if not already there.

### 4. Show the user what you did

After instrumenting, summarize:
- How many boundaries you found and wrapped
- The names you chose for each
- How to use the CLI to see results after running the app:
  - `npx progressive-zod list` — see all monitored types
  - `npx progressive-zod infer <name>` — generate a Zod schema from observed data
  - `npx progressive-zod stats <name>` — see conform/violate counts
  - `npx progressive-zod violations <name>` — see payloads that don't match

## Important rules

- **Never modify business logic** — only wrap data access points
- **progressive() never throws** — it always returns input unchanged, so it's safe to add anywhere
- **Be conservative** — only instrument clear untyped boundaries, don't wrap already-typed internal code
- **One progressive() per boundary** — don't double-wrap
- If the user already has Zod schemas for some boundaries, pass them as the second argument:
  ```typescript
  const UserCreate = progressive("UserCreate", existingUserSchema);
  ```
  This tracks conformance so the user can see what percentage of real data matches their schema.
