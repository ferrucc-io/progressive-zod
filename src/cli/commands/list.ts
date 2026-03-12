import { getStorage, disconnectStorage } from "../../storage/index.js";

export async function listCommand(): Promise<void> {
  const storage = await getStorage();
  const names = await storage.getNames();

  if (names.length === 0) {
    console.log("No monitored types found.");
  } else {
    console.log("Monitored types:\n");
    for (const name of names) {
      console.log(`  ${name}`);
    }
  }

  await disconnectStorage();
}
