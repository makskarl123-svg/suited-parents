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

  it("posts a grade, and a grade without rewards yet comes back as a 409", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ childId: "maya", grade: 5, gradeSet: "G5-2026-27", changed: true, gradeInfo: { current: 5, setBy: "parent", changedAt: "2026-11-29T10:00:00.000Z", confirmedByParentAt: "2026-11-29T10:00:00.000Z" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "grade data missing", grade: 3 }), { status: 409 }));
    vi.stubGlobal("fetch", fetchMock);
    const api = new MoneyApi("/api", identity);
    const r = await api.setGrade("maya", 5);
    expect(r).toMatchObject({ grade: 5, changed: true, gradeInfo: { setBy: "parent" } });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/children/maya/grade");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ grade: 5 });
    await expect(api.setGrade("maya", 3)).rejects.toMatchObject({ status: 409 } satisfies Partial<ApiError>);
  });
});
