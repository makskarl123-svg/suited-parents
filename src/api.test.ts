import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, MoneyApi } from "./api";

const identity = { headers: () => Promise.resolve({ "x-guardian-id": "mum" }) };

describe("MoneyApi", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("sends identity headers and parses the capabilities view", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ childId: "maya", gateSet: "G6-2026-27", capabilities: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const api = new MoneyApi("/api", identity);
    const v = await api.capabilities("maya");
    expect(v.gateSet).toBe("G6-2026-27");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/children/maya/capabilities");
    expect((init.headers as Record<string, string>)["x-guardian-id"]).toBe("mum");
  });

  it("posts a decision with a limit and surfaces the service's error message", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ capability: "cash_out", state: "Active", label: "On", earnedAt: null, limit: { currency: "AED", perWeek: 80 } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "cannot apply Approve in state Active" }), { status: 409 }));
    vi.stubGlobal("fetch", fetchMock);
    const api = new MoneyApi("/api", identity);
    const snap = await api.act("maya", "cash_out", "approve", { limit: { currency: "AED", perWeek: 80 } });
    expect(snap.limit?.perWeek).toBe(80);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ limit: { currency: "AED", perWeek: 80 } });
    await expect(api.act("maya", "cash_out", "approve")).rejects.toMatchObject({ status: 409, message: "cannot apply Approve in state Active" } satisfies Partial<ApiError>);
  });
});
