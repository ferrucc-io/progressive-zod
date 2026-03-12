import { describe, it, expect } from "vitest";
import { z } from "zod";
import { inferSchema } from "../infer-schema.js";

describe("inferSchema", () => {
  it("infers a simple object schema", () => {
    const samples = [
      { name: "Alice", age: 30 },
      { name: "Bob", age: 25 },
    ];
    const schema = inferSchema(samples);
    expect(schema.safeParse({ name: "Eve", age: 22 }).success).toBe(true);
    expect(schema.safeParse({ name: "Eve" }).success).toBe(false);
  });

  it("infers a discriminated union", () => {
    const samples = [
      { type: "dog", breed: "labrador" },
      { type: "dog", breed: "poodle" },
      { type: "cat", indoor: true },
      { type: "cat", indoor: false },
    ];
    const schema = inferSchema(samples);
    expect(schema.safeParse({ type: "dog", breed: "husky" }).success).toBe(true);
    expect(schema.safeParse({ type: "cat", indoor: true }).success).toBe(true);
  });

  it("infers primitive types when no objects present", () => {
    const schema = inferSchema([1, 2, 3]);
    expect(schema.safeParse(42).success).toBe(true);
    expect(schema.safeParse("hello").success).toBe(false);
  });

  it("handles mixed primitive types", () => {
    const schema = inferSchema([1, "hello", true]);
    expect(schema.safeParse(42).success).toBe(true);
    expect(schema.safeParse("world").success).toBe(true);
    expect(schema.safeParse(false).success).toBe(true);
  });

  it("handles nested objects", () => {
    const samples = [
      { user: { name: "Alice" }, score: 10 },
      { user: { name: "Bob" }, score: 20 },
    ];
    const schema = inferSchema(samples);
    expect(schema.safeParse({ user: { name: "Eve" }, score: 5 }).success).toBe(true);
  });

  it("handles arrays in objects", () => {
    const samples = [
      { tags: ["a", "b"] },
      { tags: ["c"] },
    ];
    const schema = inferSchema(samples);
    expect(schema.safeParse({ tags: ["x", "y", "z"] }).success).toBe(true);
    expect(schema.safeParse({ tags: [1] }).success).toBe(false);
  });
});
