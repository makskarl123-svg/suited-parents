import { useCallback, useEffect, useState } from "react";
import { ApiError, type CapabilitiesView, type CapabilityView, type MoneyApi, type Verb } from "../api";

const TAG: Record<CapabilityView["state"], { cls: string; text: string }> = {
  Locked: { cls: "", text: "Not yet earned" },
  Earned: { cls: "on", text: "Earned" },
  Requested: { cls: "ask", text: "Your call" },
  Held: { cls: "held", text: "Paused" },
  PendingBank: { cls: "bank", text: "Bank" },
  Active: { cls: "on", text: "On" },
  ActiveByParent: { cls: "on", text: "On" },
  Closed: { cls: "off", text: "Off" },
};

function CapabilityCard({ c, busy, onAct }: { c: CapabilityView; busy: boolean; onAct: (verb: Verb, limit?: number) => void }) {
  const [limit, setLimit] = useState<string>(c.limit ? String(c.limit.perWeek) : "");
  const pct = c.progress && c.progress.total > 0 ? Math.round((c.progress.done / c.progress.total) * 100) : 0;
  const tone = c.state === "Requested" ? "y" : c.state === "Active" || c.state === "ActiveByParent" ? "g" : c.state === "Held" || c.state === "PendingBank" ? "b" : "";
  const isCeiling = c.capability === "ceiling";
  const showLimit = c.capability === "cash_out" && (c.state === "Requested" || c.state === "Held" || c.state === "Locked" || c.state === "Earned");
  const parsedLimit = Number(limit);
  const limitArg = showLimit && limit !== "" && Number.isFinite(parsedLimit) && parsedLimit >= 0 ? parsedLimit : undefined;
  const t = TAG[c.state];

  return (
    <div className={`card ${tone}`}>
      <div className="row">
        <div>
          <div className="title">{titleFor(c.capability)}</div>
          <div className="meta">{c.gateName}{c.earnedAt ? ` · earned ${new Date(c.earnedAt).toLocaleDateString()}` : ""}</div>
        </div>
        <span className={`tag ${t.cls}`}>{t.text}</span>
      </div>
      <div className="meta" style={{ marginTop: 8 }}>{c.label}{c.lastActor ? ` · last changed by ${c.lastActor}` : ""}</div>
      {c.progress && c.state === "Locked" && !isCeiling ? (
        <>
          <div className="bar"><i style={{ width: `${pct}%` }} /></div>
          <div className="missing">{c.progress.done} of {c.progress.total}{c.progress.missing[0] ? ` · ${c.progress.missing[0]}` : ""}</div>
        </>
      ) : null}
      {isCeiling && c.progress ? <div className="missing">{c.progress.done} of {c.progress.total} strands this year{c.progress.missing[0] ? ` · ${c.progress.missing[0]}` : ""}</div> : null}
      {!isCeiling ? (
        <div className="actions">
          {showLimit ? <input className="limit" inputMode="numeric" placeholder="AED / week" value={limit} onChange={(e) => setLimit(e.target.value)} aria-label="Weekly limit in AED" /> : null}
          {(c.state === "Requested" || c.state === "Held") ? <button className="btn" disabled={busy} onClick={() => onAct("approve", limitArg)}>Approve</button> : null}
          {c.state === "Requested" ? <button className="btn ghost" disabled={busy} onClick={() => onAct("not-yet")}>Not yet</button> : null}
          {(c.state === "Locked" || c.state === "Earned") && c.capability !== "shops" ? <button className="btn ghost" disabled={busy} onClick={() => onAct("open-early", limitArg)}>Open now</button> : null}
          {(c.state === "Active" || c.state === "ActiveByParent") && c.capability !== "shops" ? <button className="btn red" disabled={busy} onClick={() => onAct("close")}>Switch off</button> : null}
          {c.state === "Closed" ? <button className="btn y" disabled={busy} onClick={() => onAct("reopen")}>Switch back on</button> : null}
        </div>
      ) : null}
    </div>
  );
}

function titleFor(id: string): string {
  switch (id) {
    case "shops": return "Shops";
    case "online": return "Online";
    case "transport": return "Transport";
    case "cash_out": return "Cash out";
    case "peer_transfer": return "Send to friends and family";
    case "ceiling": return "Weekly limit ceiling";
    default: return id;
  }
}

export function ChildPage({ api, childId, childName }: { api: MoneyApi; childId: string; childName: string }) {
  const [view, setView] = useState<CapabilitiesView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showAudit, setShowAudit] = useState(false);
  const [audit, setAudit] = useState<{ at: string; what: string }[]>([]);

  const load = useCallback(async () => {
    try {
      setView(await api.capabilities(childId));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 403 ? "You are not a guardian of this child." : e instanceof Error ? e.message : "Something went wrong");
    }
  }, [api, childId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!showAudit) return;
    void api.audit(childId).then((a) => { setAudit(a.entries.map((e) => ({ at: e.at, what: e.what }))); }).catch(() => undefined);
  }, [showAudit, api, childId, view]);

  const act = async (capability: string, verb: Verb, limit?: number): Promise<void> => {
    setBusy(capability);
    try {
      const snap = await api.act(childId, capability, verb, limit !== undefined ? { limit: { currency: "AED", perWeek: limit } } : {});
      setToast(snap.label);
      await load();
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
      setTimeout(() => { setToast(null); }, 2600);
    }
  };

  const asks = view?.capabilities.filter((c) => c.state === "Requested").length ?? 0;

  return (
    <div className="shell">
      <div className="top">
        <span className="wm"><img src="/suited-logo.svg" alt="Suited" /><b>Money</b></span>
      </div>
      <div className="eyebrow">{childName}{view ? ` · ${view.gateSet}` : ""}</div>
      <h1>{asks > 0 ? <>{asks === 1 ? "One thing" : `${asks} things`} <em>earned.</em> Your call.</> : <>Everything in <em>your</em> hands.</>}</h1>
      <p className="sub">{childName} earns a capability by finishing the strand that teaches it. Nothing changes on the card until you say so, and you can switch anything off at any time.</p>
      {error ? <div className="err">{error}</div> : null}
      {!view && !error ? <div className="card"><div className="meta">Loading…</div></div> : null}
      {view?.capabilities.map((c) => (
        <CapabilityCard key={c.capability} c={c} busy={busy === c.capability} onAct={(verb, limit) => void act(c.capability, verb, limit)} />
      ))}
      <div className="actions" style={{ justifyContent: "center" }}>
        <button className="btn ghost" onClick={() => { setShowAudit((s) => !s); }}>{showAudit ? "Hide history" : "Show history"}</button>
      </div>
      {showAudit ? (
        <ul className="audit">
          {[...audit].reverse().map((e, i) => <li key={i}><time>{new Date(e.at).toLocaleString()}</time>{e.what}</li>)}
        </ul>
      ) : null}
      {toast ? <div className="toast" role="status">{toast}</div> : null}
      <div className="foot">The bank holds the money. Suited holds the learning. You hold the switches.</div>
    </div>
  );
}
