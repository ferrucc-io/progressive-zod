import { z } from "zod";
import * as amplitude from "@amplitude/analytics-browser";
import { progressive, configure, forceFlush, shutdown } from "progressive-zod/client";
import type { AmplitudeClient } from "progressive-zod/client";

// --- Initialize real Amplitude SDK ---
const AMPLITUDE_API_KEY = import.meta.env.VITE_AMPLITUDE_API_KEY;

amplitude.init(AMPLITUDE_API_KEY, {
  // Disable autocapture so we only see pzod events
  autocapture: false,
});

// --- Spy wrapper: sends to real Amplitude AND records locally for Playwright ---
interface TrackedEvent {
  name: string;
  properties?: Record<string, unknown>;
  options?: Record<string, unknown>;
}

const amplitudeEvents: TrackedEvent[] = [];

const spyClient: AmplitudeClient = {
  track(name, properties, options) {
    // Record locally for test assertions
    amplitudeEvents.push({ name, properties, options });
    // Send to real Amplitude
    amplitude.track(name, properties as Record<string, any>);
  },
};

// Expose to Playwright
(window as any).__amplitudeEvents = amplitudeEvents;
(window as any).__runTest = runTest;

// --- Configure progressive-zod with Amplitude storage ---
configure({
  storage: "amplitude",
  amplitudeClient: spyClient,
});

// --- Define schemas ---
const UserPayload = z.object({
  name: z.string(),
  email: z.string().email(),
  age: z.number().int().positive(),
});

const ApiResponse = z.object({
  status: z.literal("ok"),
  data: z.array(z.unknown()),
});

async function runTest() {
  const statusEl = document.getElementById("status")!;
  const resultsEl = document.getElementById("results")!;

  try {
    statusEl.textContent = "running...";

    // 1. Track conforming data
    const userSchema = progressive("UserPayload", UserPayload);
    userSchema.parse({ name: "Alice", email: "alice@example.com", age: 30 });
    userSchema.parse({ name: "Bob", email: "bob@test.org", age: 25 });

    // 2. Track violating data (wrong types)
    userSchema.parse({ name: 123, email: "not-email", age: -5 });
    userSchema.parse("completely wrong");

    // 3. Track without a schema (should count as violate)
    const unknownSchema = progressive("UnknownBoundary");
    unknownSchema.parse({ anything: true });
    unknownSchema.parse([1, 2, 3]);

    // 4. Track API response schema
    const apiSchema = progressive("ApiResponse", ApiResponse);
    apiSchema.parse({ status: "ok", data: [1, 2, 3] });
    apiSchema.parse({ status: "error", data: null }); // violates

    // 5. Force flush to trigger Amplitude events
    await forceFlush();

    // 6. Flush Amplitude SDK to ensure events are sent to the server
    amplitude.flush();

    // 7. Verify results
    const conformCount = amplitudeEvents.filter(
      (e) => e.properties?.result === "conforms"
    ).length;
    const violateCount = amplitudeEvents.filter(
      (e) => e.properties?.result === "violation"
    ).length;
    const allPzod = amplitudeEvents.every(
      (e) => e.name === "progressive-zod: results"
    );
    const typeNames = [
      ...new Set(amplitudeEvents.map((e) => e.properties?.type_name)),
    ].sort();

    const results = {
      totalEvents: amplitudeEvents.length,
      conformCount,
      violateCount,
      allPzod,
      typeNames,
      events: amplitudeEvents,
    };

    resultsEl.textContent = JSON.stringify(results, null, 2);
    statusEl.textContent = "done";

    // Expose for Playwright
    (window as any).__testResults = results;
  } catch (err: any) {
    statusEl.textContent = "error";
    resultsEl.textContent = err.message + "\n" + err.stack;
    (window as any).__testResults = { error: err.message };
  }

  await shutdown();
}

// Auto-run
runTest();
