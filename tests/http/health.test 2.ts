import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ getPool: () => ({ query: mocks.query }) }));

import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  beforeEach(() => mocks.query.mockReset());

  it("returns only the public healthy database state", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, db: "up" });
  });

  it("returns only the public unavailable database state", async () => {
    mocks.query.mockRejectedValueOnce(new Error("connection details must stay private"));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, db: "down" });
  });
});
