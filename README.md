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

For production, you can optionally use Redis:

```bash
npm install ioredis
```

```typescript
configure({
  storage: "redis",
  redisUrl: "redis://your-redis:6379",
});
```

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
