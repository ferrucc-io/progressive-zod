import { z } from "zod";

/**
 * Infer a Zod schema from an array of runtime samples.
 */
export function inferSchema(samples: unknown[]): z.ZodTypeAny {
  const objects = samples.filter(
    (s): s is Record<string, unknown> =>
      typeof s === "object" && s !== null && !Array.isArray(s),
  );

  if (objects.length === 0) {
    return inferPrimitiveUnion(samples);
  }

  // Group samples by their shape (set of keys)
  const groups = groupByShape(objects);

  if (groups.length === 1) {
    return buildObjectSchema(groups[0]);
  }

  // Try to find a discriminator field
  const discriminator = findDiscriminator(groups);
  if (discriminator) {
    return z.discriminatedUnion(
      discriminator,
      groups.map(
        (group) => buildObjectSchema(group) as z.ZodObject<any>,
      ) as any,
    );
  }

  return z.union(
    groups.map((group) => buildObjectSchema(group)) as any,
  );
}

function shapeKey(obj: Record<string, unknown>): string {
  return Object.keys(obj).sort().join(",");
}

function groupByShape(
  objects: Record<string, unknown>[],
): Record<string, unknown>[][] {
  const map = new Map<string, Record<string, unknown>[]>();
  for (const obj of objects) {
    const key = shapeKey(obj);
    let group = map.get(key);
    if (!group) {
      group = [];
      map.set(key, group);
    }
    group.push(obj);
  }
  return [...map.values()];
}

function findDiscriminator(
  groups: Record<string, unknown>[][],
): string | null {
  if (groups.length < 2) return null;

  // Get keys present in all groups
  const keySets = groups.map(
    (g) => new Set(Object.keys(g[0])),
  );
  const commonKeys = [...keySets[0]].filter((k) =>
    keySets.every((s) => s.has(k)),
  );

  for (const key of commonKeys) {
    // Check if this key has a single string literal value per group
    // and the values are distinct across groups
    const values = new Set<string>();
    let valid = true;

    for (const group of groups) {
      const groupValues = new Set(
        group.map((obj) => obj[key]).filter((v) => typeof v === "string"),
      );
      if (groupValues.size !== 1) {
        valid = false;
        break;
      }
      const val = [...groupValues][0] as string;
      if (values.has(val)) {
        valid = false;
        break;
      }
      values.add(val);
    }

    if (valid && values.size === groups.length) {
      return key;
    }
  }

  return null;
}

function buildObjectSchema(
  samples: Record<string, unknown>[],
): z.ZodObject<any> {
  const keys = Object.keys(samples[0]);
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const key of keys) {
    const values = samples.map((s) => s[key]);
    // If all values are the same string, use z.literal() (needed for discriminated unions)
    const unique = new Set(values);
    if (unique.size === 1 && typeof values[0] === "string") {
      shape[key] = z.literal(values[0] as string);
    } else {
      shape[key] = inferFieldType(values);
    }
  }

  return z.object(shape).strict();
}

function inferFieldType(values: unknown[]): z.ZodTypeAny {
  const types = new Set(values.map(classifyValue));

  if (types.size === 1) {
    const type = [...types][0];
    if (type === "string") return z.string();
    if (type === "number") return z.number();
    if (type === "boolean") return z.boolean();
    if (type === "null") return z.null();
    if (type === "object") {
      return inferSchema(values);
    }
    if (type === "array") {
      const allItems = values.flatMap((v) =>
        Array.isArray(v) ? v : [],
      );
      if (allItems.length === 0) return z.array(z.unknown());
      return z.array(inferFieldType(allItems));
    }
  }

  // Check if it's string literal values (for discriminator fields)
  if (types.size === 1 && types.has("string")) {
    const unique = new Set(values);
    if (unique.size === 1) {
      return z.literal(values[0] as string);
    }
  }

  // Mixed types — build a union
  const members: z.ZodTypeAny[] = [];
  if (types.has("string")) members.push(z.string());
  if (types.has("number")) members.push(z.number());
  if (types.has("boolean")) members.push(z.boolean());
  if (types.has("null")) members.push(z.null());
  if (types.has("object")) {
    const objs = values.filter(
      (v) => typeof v === "object" && v !== null && !Array.isArray(v),
    );
    members.push(inferSchema(objs));
  }
  if (types.has("array")) {
    const arrs = values.filter(Array.isArray);
    const allItems = arrs.flat();
    members.push(
      z.array(allItems.length > 0 ? inferFieldType(allItems) : z.unknown()),
    );
  }

  if (members.length === 1) return members[0];
  if (members.length === 2) return z.union([members[0], members[1]] as any);
  return z.union(members as any);
}

function classifyValue(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

function inferPrimitiveUnion(samples: unknown[]): z.ZodTypeAny {
  const types = new Set(samples.map(classifyValue));
  const members: z.ZodTypeAny[] = [];
  if (types.has("string")) members.push(z.string());
  if (types.has("number")) members.push(z.number());
  if (types.has("boolean")) members.push(z.boolean());
  if (types.has("null")) members.push(z.null());
  if (members.length === 0) return z.unknown();
  if (members.length === 1) return members[0];
  return z.union(members as any);
}
