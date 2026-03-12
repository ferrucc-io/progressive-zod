import { getStorage, disconnectStorage } from "../../storage/index.js";
import { inferSchema } from "../../infer-schema.js";
import { schemaToCode } from "../../schema-to-code.js";

export async function inferCommand(name: string): Promise<void> {
  const storage = await getStorage();
  const raw = await storage.getSamples(name);

  if (raw.length === 0) {
    console.log(`No samples found for "${name}". Run your app to collect data first.`);
    await disconnectStorage();
    return;
  }

  const samples = raw.map((r) => {
    try {
      return JSON.parse(r);
    } catch {
      return r;
    }
  });

  const schema = inferSchema(samples);
  const code = schemaToCode(schema);

  console.log(`// Inferred schema for "${name}" from ${samples.length} samples\n`);
  console.log(`import { z } from "zod";\n`);
  console.log(`const ${safeName(name)}Schema = ${code};\n`);

  await disconnectStorage();
}

function safeName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9]/g, " ")
    .replace(/\s+(.)/g, (_, c) => c.toUpperCase())
    .replace(/^\w/, (c) => c.toLowerCase());
}
