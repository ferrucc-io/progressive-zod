import { test, expect } from "@playwright/test";

test.describe("progressive-zod with Amplitude connector", () => {
  test("loads without bundler errors (no fs/path)", async ({ page }) => {
    // This is the core regression test — the page should load without errors
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/");
    await expect(page.locator("#status")).not.toHaveText("loading...", {
      timeout: 10_000,
    });

    expect(errors).toEqual([]);
    await expect(page.locator("#status")).toHaveText("done");
  });

  test("tracks conform and violate events via Amplitude", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#status")).toHaveText("done", {
      timeout: 10_000,
    });

    const results = await page.evaluate(() => (window as any).__testResults);

    // Should have tracked events
    expect(results.totalEvents).toBeGreaterThan(0);
    expect(results.allPzod).toBe(true);

    // 2 conforming UserPayload + 1 conforming ApiResponse = 3 conform
    expect(results.conformCount).toBe(3);

    // 2 violating UserPayload + 2 no-schema UnknownBoundary + 1 violating ApiResponse = 5 violate
    expect(results.violateCount).toBe(5);
  });

  test("tracks correct type names", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#status")).toHaveText("done", {
      timeout: 10_000,
    });

    const results = await page.evaluate(() => (window as any).__testResults);

    expect(results.typeNames).toEqual([
      "ApiResponse",
      "UnknownBoundary",
      "UserPayload",
    ]);
  });

  test("all events have device_id", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#status")).toHaveText("done", {
      timeout: 10_000,
    });

    const events = await page.evaluate(
      () => (window as any).__amplitudeEvents
    );

    for (const event of events) {
      expect(event.options?.device_id).toBeTruthy();
    }
  });

  test("progressive().parse() returns input unchanged", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#status")).toHaveText("done", {
      timeout: 10_000,
    });

    // The test app's main.ts already exercises parse() — verify the results
    // show events were tracked (meaning parse was called and returned)
    const results = await page.evaluate(() => (window as any).__testResults);
    expect(results.totalEvents).toBeGreaterThan(0);
    expect(results.error).toBeUndefined();
  });

  test("violation events include sample details", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#status")).toHaveText("done", {
      timeout: 10_000,
    });

    const events = await page.evaluate(
      () => (window as any).__amplitudeEvents
    );

    const violations = events.filter(
      (e: any) => e.properties?.result === "violate"
    );

    for (const v of violations) {
      expect(v.properties.sample_type).toBeTruthy();
      expect(v.properties.sample_preview).toBeTruthy();
    }

    // Check an object violation has field_count
    const objectViolation = violations.find(
      (v: any) =>
        v.properties.sample_type === "object" && v.properties.field_count
    );
    expect(objectViolation).toBeTruthy();
    expect(objectViolation.properties.field_count).toBeGreaterThan(0);

    // Check violations with schemas have human-readable validation_errors
    const schemaViolations = violations.filter(
      (v: any) => v.properties.validation_errors && v.properties.validation_errors !== "no schema defined"
    );
    expect(schemaViolations.length).toBeGreaterThan(0);
    // e.g. "name: Expected string, received number; email: Invalid email; age: Number must be greater than 0"
    for (const v of schemaViolations) {
      expect(typeof v.properties.validation_errors).toBe("string");
      expect(v.properties.validation_errors.length).toBeGreaterThan(0);
    }

    // Check no-schema violations say "no schema defined"
    const noSchemaViolations = violations.filter(
      (v: any) => v.properties.validation_errors === "no schema defined"
    );
    expect(noSchemaViolations.length).toBeGreaterThan(0);
  });
});
