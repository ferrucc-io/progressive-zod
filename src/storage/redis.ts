import type { StorageBackend, ProgressiveConfig } from "../types.js";

/**
 * Redis storage backend for production use.
 * Requires `ioredis` as a peer dependency.
 */
export class RedisStorage implements StorageBackend {
  private redis: any;
  private prefix: string;
  private maxSamples: number;
  private maxViolations: number;

  constructor(config: ProgressiveConfig = {}) {
    this.prefix = config.keyPrefix ?? "pzod:";
    this.maxSamples = config.maxSamples ?? 1000;
    this.maxViolations = config.maxViolations ?? 1000;
  }

  private async getClient(): Promise<any> {
    if (!this.redis) {
      let Redis: any;
      try {
        // Use a variable to prevent consuming bundlers (e.g. Vite) from
        // statically resolving this optional peer dependency.
        const moduleName = "ioredis";
        Redis = (await import(moduleName)).default;
      } catch {
        throw new Error(
          "ioredis is required for Redis storage. Install it with: npm install ioredis",
        );
      }
      const url =
        process.env.PROGRESSIVE_ZOD_REDIS_URL ?? "redis://localhost:6379";
      this.redis = new Redis(url);
    }
    return this.redis;
  }

  async addName(name: string): Promise<void> {
    const r = await this.getClient();
    await r.sadd(`${this.prefix}names`, name).catch(() => {});
  }

  async addSample(name: string, sample: string): Promise<void> {
    const r = await this.getClient();
    const p = r.pipeline();
    p.lpush(`${this.prefix}${name}:samples`, sample);
    p.ltrim(`${this.prefix}${name}:samples`, 0, this.maxSamples - 1);
    await p.exec().catch(() => {});
  }

  async addViolation(name: string, violation: string): Promise<void> {
    const r = await this.getClient();
    const p = r.pipeline();
    p.lpush(`${this.prefix}${name}:violations`, violation);
    p.ltrim(`${this.prefix}${name}:violations`, 0, this.maxViolations - 1);
    await p.exec().catch(() => {});
  }

  async incrConform(name: string): Promise<void> {
    const r = await this.getClient();
    await r.incr(`${this.prefix}${name}:conform`).catch(() => {});
  }

  async incrViolate(name: string): Promise<void> {
    const r = await this.getClient();
    await r.incr(`${this.prefix}${name}:violate`).catch(() => {});
  }

  async getNames(): Promise<string[]> {
    const r = await this.getClient();
    const names = await r.smembers(`${this.prefix}names`);
    return names.sort();
  }

  async getSamples(name: string): Promise<string[]> {
    const r = await this.getClient();
    return r.lrange(`${this.prefix}${name}:samples`, 0, -1);
  }

  async getViolations(name: string, limit: number): Promise<string[]> {
    const r = await this.getClient();
    return r.lrange(`${this.prefix}${name}:violations`, 0, limit - 1);
  }

  async getStats(
    name: string,
  ): Promise<{ conform: number; violate: number }> {
    const r = await this.getClient();
    const [conform, violate] = await Promise.all([
      r.get(`${this.prefix}${name}:conform`),
      r.get(`${this.prefix}${name}:violate`),
    ]);
    return {
      conform: parseInt(conform ?? "0", 10),
      violate: parseInt(violate ?? "0", 10),
    };
  }

  async disconnect(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
    }
  }
}
