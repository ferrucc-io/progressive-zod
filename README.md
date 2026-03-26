# progressive-zod

Runtime type observability for TypeScript — progressively replace `any` with real Zod schemas.

## How it works

1. **Wrap** untyped boundaries with `progressive()` — it records every value that flows through
2. **Run** your app normally — data gets collected in the background
3. **Infer** Zod schemas from observed patterns using the CLI

No upfront schema writing. No runtime errors. `progressive()` never throws and always returns input unchanged.

## Quick start

```bash
npm install progressive-zod zod
```

```typescript
import { progressive } from "progressive-zod";

// Wrap any untyped boundary
const UserPayload = progressive("UserPayload");

app.post("/users", (req, res) => {
  const data = UserPayload.parse(req.body); // records + passes through
  // ... your existing logic
});
```

### Using in a frontend (Vite, Next.js, etc.)

If you're bundling with Vite or another frontend bundler, import from the client entry point to avoid pulling in server-only dependencies like `ioredis`:

```typescript
import { progressive } from "progressive-zod/client";
```

The client entry supports memory and Amplitude storage. If you need Redis, use the server entry (`progressive-zod`).

Run your app, hit some endpoints, then:

```bash
npx progressive-zod list              # see monitored types
npx progressive-zod infer UserPayload # generate a Zod schema
```

Output:

```typescript
import { z } from "zod";

const userPayloadSchema = z.object({
  name: z.string(),
  email: z.string(),
  age: z.number(),
}).strict();
```

## No Redis required for local development

By default, progressive-zod uses **in-memory storage** with file persistence to `.progressive-zod/`. No Redis, no external dependencies.

```typescript
import { configure } from "progressive-zod";

// This is the default — no config needed for localhost
configure({
  storage: "memory",
  dataDir: ".progressive-zod",
});
```

For production, you can use Redis or Amplitude:

```bash
npm install ioredis
```

```typescript
configure({
  storage: "redis",
  redisUrl: "redis://your-redis:6379",
});
```

### Amplitude adapter

The Amplitude adapter streams type-check results as analytics events instead of storing raw samples locally. This is useful when you want to track conformance rates in a dashboard without managing storage infrastructure.

**How it works:** each call to `.parse()` fires a single Amplitude event (default name: `progressive-zod: results`). Conform checks send `{ type_name, result: "conforms" }`. Violations include extra properties: `sample_type`, `field_count`, `sample_preview` (first 256 chars, flattened to a `key=value` string), and `validation_errors`.

Read methods (`list`, `infer`, `stats`, `violations`) are no-ops — use the Amplitude dashboard to query your data.

```bash
npm install @amplitude/analytics-node
```

```typescript
import * as amplitude from "@amplitude/analytics-node";
import { configure } from "progressive-zod";

// Use a separate Amplitude project for observability, not your main product analytics
const pzodAmplitude = amplitude.createInstance();
pzodAmplitude.init("YOUR_OBSERVABILITY_PROJECT_API_KEY");

configure({
  storage: "amplitude",
  amplitudeClient: pzodAmplitude,
});
```

Works in the browser too — import from `progressive-zod/client` and use `@amplitude/analytics-browser` instead.

You can customize the event name:

```typescript
configure({
  storage: "amplitude",
  amplitudeClient: pzodAmplitude,
  amplitudeEventName: "my-app: type results",
});
```

Events use whatever `user_id` and `device_id` you configured on your Amplitude client instance.

## Track conformance against existing schemas

Already have a partial schema? Pass it as the second argument to track how much real data conforms:

```typescript
import { z } from "zod";
import { progressive } from "progressive-zod";

const mySchema = z.object({ name: z.string(), age: z.number() });
const UserPayload = progressive("UserPayload", mySchema);
```

```bash
npx progressive-zod stats UserPayload
# Conform: 847
# Violate: 23
# Conformance: 97.4%

npx progressive-zod violations UserPayload
# Shows the 23 payloads that don't match your schema
```

## CLI commands

| Command | Description |
|---------|-------------|
| `progressive-zod list` | List all monitored types |
| `progressive-zod infer <name>` | Generate Zod schema from observed data |
| `progressive-zod stats <name>` | Show conform/violate counts |
| `progressive-zod violations <name>` | Show non-conforming payloads |

## Claude Code skill

This package includes a `/instrument` skill for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Run it in your project and Claude will scan your codebase for untyped boundaries and add `progressive()` wrappers automatically.

## Configuration

| Option | Env var | Default | Description |
|--------|---------|---------|-------------|
| `storage` | `PROGRESSIVE_ZOD_STORAGE` | `"memory"` | `"memory"`, `"redis"`, or `"amplitude"` |
| `redisUrl` | `PROGRESSIVE_ZOD_REDIS_URL` | `redis://localhost:6379` | Redis URL (only for redis storage) |
| `keyPrefix` | `PROGRESSIVE_ZOD_KEY_PREFIX` | `pzod:` | Key namespace prefix |
| `maxSamples` | `PROGRESSIVE_ZOD_MAX_SAMPLES` | `1000` | Max samples per type |
| `maxViolations` | `PROGRESSIVE_ZOD_MAX_VIOLATIONS` | `1000` | Max violations per type |
| `dataDir` | `PROGRESSIVE_ZOD_DATA_DIR` | `.progressive-zod` | File persistence path (memory mode) |
| `amplitudeClient` | — | — | Amplitude SDK instance (required for amplitude storage) |
| `amplitudeEventName` | — | `"progressive-zod: results"` | Custom event name (amplitude storage only) |
