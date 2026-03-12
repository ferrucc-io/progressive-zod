import { getStorage, disconnectStorage } from "../../storage/index.js";

export async function statsCommand(name: string): Promise<void> {
  const storage = await getStorage();
  const { conform, violate } = await storage.getStats(name);
  const total = conform + violate;
  const pct = total > 0 ? ((conform / total) * 100).toFixed(1) : "0.0";

  console.log(`Stats for "${name}":\n`);
  console.log(`  Conform:    ${conform}`);
  console.log(`  Violate:    ${violate}`);
  console.log(`  Total:      ${total}`);
  console.log(`  Conformance: ${pct}%`);

  await disconnectStorage();
}
