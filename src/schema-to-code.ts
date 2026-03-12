import { z } from "zod";

/**
 * Convert a Zod schema into readable TypeScript code that recreates it.
 */
export function schemaToCode(schema: z.ZodTypeAny, indent = 0): string {
  const pad = "  ".repeat(indent);

  if (schema instanceof z.ZodString) return "z.string()";
  if (schema instanceof z.ZodNumber) return "z.number()";
  if (schema instanceof z.ZodBoolean) return "z.boolean()";
  if (schema instanceof z.ZodNull) return "z.null()";
  if (schema instanceof z.ZodUnknown) return "z.unknown()";

  if (schema instanceof z.ZodLiteral) {
    const val = schema.value;
    return typeof val === "string" ? `z.literal("${val}")` : `z.literal(${val})`;
  }

  if (schema instanceof z.ZodArray) {
    const inner = schemaToCode(schema.element, indent);
    return `z.array(${inner})`;
  }

  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    const keys = Object.keys(shape);
    if (keys.length === 0) return "z.object({})";

    const inner = pad + "  ";
    const fields = keys.map(
      (k) => `${inner}${safeProp(k)}: ${schemaToCode(shape[k], indent + 1)},`,
    );

    const strict =
      schema._def && (schema._def as any).unknownKeys === "strict"
        ? ".strict()"
        : "";

    return `z.object({\n${fields.join("\n")}\n${pad}})${strict}`;
  }

  if (schema instanceof z.ZodUnion) {
    const opts = (schema as any).options as z.ZodTypeAny[];
    const members = opts.map((o) => schemaToCode(o, indent));
    if (members.every((m) => !m.includes("\n"))) {
      return `z.union([${members.join(", ")}])`;
    }
    const inner = pad + "  ";
    return `z.union([\n${members.map((m) => `${inner}${m},`).join("\n")}\n${pad}])`;
  }

  if (schema instanceof z.ZodDiscriminatedUnion) {
    const disc = (schema as any)._def.discriminator as string;
    const opts = (schema as any)._def.options as z.ZodTypeAny[];
    const members = opts.map((o) => schemaToCode(o, indent + 1));
    const inner = pad + "  ";
    return `z.discriminatedUnion("${disc}", [\n${members.map((m) => `${inner}${m},`).join("\n")}\n${pad}])`;
  }

  return "z.unknown()";
}

function safeProp(key: string): string {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : `"${key}"`;
}
