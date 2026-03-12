import { getStorage, disconnectStorage } from "../../storage/index.js";

export async function violationsCommand(
  name: string,
  opts: { limit: string },
): Promise<void> {
  const storage = await getStorage();
  const limit = parseInt(opts.limit, 10);
  const violations = await storage.getViolations(name, limit);

  if (violations.length === 0) {
    console.log(`No violations found for "${name}".`);
  } else {
    console.log(`Recent violations for "${name}" (${violations.length}):\n`);
    for (const v of violations) {
      try {
        console.log(JSON.stringify(JSON.parse(v), null, 2));
      } catch {
        console.log(v);
      }
      console.log("---");
    }
  }

  await disconnectStorage();
}
