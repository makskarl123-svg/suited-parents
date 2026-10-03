/**
 * One child, for the parent. The question is "what has she done, and what do I
 * need to decide?" so the asks come first, then the money, then every switch.
 * Calm register, shared with the child's Money tab. Every number is the bank's
 * or the engine's; every switch is the parent's.
 */
import { useCallback, useEffect, useState } from "react";
import { ApiError, type AccountView, type CapabilitiesView, type CapabilityView, type MoneyApi, type Transaction, type Verb } from "../api";

const NAMES: Record<string, string> = { shops: "Shops", online: "Online payments", transport: "Transport", cash_out: "Cash out", peer_transfer: "Sending to friends", ceiling: "Weekly limit" };
const SPRITES: Record<string, string> = { shops: "cart", online: "laptop", transport: "bus", cash_out: "bank", peer_transfer: "gift", ceiling: "coin" };
const nameOf = (c: CapabilityView): string => NAMES[c.capability] ?? c.gateName;
const spriteOf = (id: string): string => SPRITES[id] ?? "coin";
const isOn = (c: CapabilityView): boolean => c.state === "Active" || c.state === "ActiveByParent" || (c.capability === "shops" && c.state === "Earned") || (c.capability === "ceiling" && c.state === "Earned");
const isCeiling = (c: CapabilityView): boolean => c.capability === "ceiling";
const whole = (n: number): string => Math.floor(Math.abs(n)).toLocaleString("en-US");
const fils = (n: number): string => Math.round((Math.abs(n) % 1) * 100).toString().padStart(2, "0");
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function dayLabel(iso: string): string {
  const d = new Date(iso); if (Number.isNaN(d.getTime())) return "";
  const a = new Date(); a.setHours(0, 0, 0, 0); const b = new Date(d); b.setHours(0, 0, 0, 0);
  const diff = Math.round((a.getTime() - b.getTime()) / 86_400_000);
  return diff <= 0 ? "Today" : diff === 1 ? "Yesterday" : diff < 7 ? (DAYS[b.getDay()] ?? "") : b.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** The parent's word for each state. */
function stateFor(c: CapabilityView): { text: string; pill: string } {
  if (isOn(c)) return { text: c.state === "ActiveByParent" ? "On, opened by you" : "On", pill: "mint" };
  switch (c.state) {
    case "Requested": return { text: "Earned, your call", pill: "sun" };
    case "Earned": return { text: "Earned", pill: "sun" };
    case "Held": return { text: "Paused by you", pill: "sky" };
    case "PendingBank": return { text: "Bank switching on", pill: "sky" };
    case "Closed": return { text: "Off", pill: "grey" };
    default: return { text: "Not yet earned", pill: "grey" };
  }
}

const Money = ({ amount, currency, size = 44 }: { amount: number; currency: string; size?: number }) => (
  <div className="money num" style={{ fontSize: size }}><span className="cur">{currency}</span><span>{whole(amount)}</span><span className="f">.{fils(amount)}</span></div>
);
const Sprite = ({ name, size = 24 }: { name: string; size?: number }) => <img src={`/sprites/item-${name}.webp`} alt="" style={{ width: size, height: size, objectFit: "contain" }} />;

/* ─── Blocks ────────────────────────────────────────────────────────── */

function Hero({ name, view }: { name: string; view: CapabilitiesView }) {
  const acct = view.account ?? null;
  const caps = view.capabilities.filter((c) => !isCeiling(c));
  return (
    <div className="block sky">
      <div className="hero-text">
        <div className="label">{name}'s money</div>
        {acct ? <Money amount={acct.balance} currency={acct.currency} /> : <div className="big" style={{ marginTop: 8 }}>Card on its way</div>}
        <p className="meta tint" style={{ marginTop: 8 }}>{acct ? "Held at the bank. You see every payment here." : "The bank is getting the card ready."}</p>
        <div className="chips" style={{ marginTop: 16 }}>
          {caps.map((c) => isOn(c) ? <span key={c.capability} className="chip on"><i />{nameOf(c)}</span> : <span key={c.capability} className="chip ice"><i />{nameOf(c)}</span>)}
        </div>
      </div>
      <img className="hero-art hero-card" src="/money/card.webp" alt="" />
    </div>
  );
}

function Stats({ view }: { view: CapabilitiesView }) {
  const acct = view.account ?? null;
  const caps = view.capabilities.filter((c) => !isCeiling(c));
  const on = caps.filter(isOn).length;
  const asks = caps.filter((c) => c.state === "Requested").length;
  const left = acct && acct.week.limit !== undefined ? Math.max(0, acct.week.limit - acct.week.spent) : undefined;
  return (
    <div className="stats">
      <div className="stat block mint"><div className="label"><Sprite name="coin" size={16} />This week</div><div className="v num">{acct && left !== undefined ? `${acct.currency} ${whole(left)}` : "No limit"}</div><div className="small tint" style={{ marginTop: 6 }}>{acct && acct.week.limit !== undefined ? `of ${acct.week.limit} left` : "Set with the bank"}</div></div>
      <div className="stat block sun"><div className="label"><Sprite name="crown" size={16} />Your call</div><div className="v num">{asks}</div><div className="small tint" style={{ marginTop: 6 }}>{asks === 1 ? "earned, waiting" : "earned, waiting"}</div></div>
      <div className="stat block sky"><div className="label"><Sprite name="bus" size={16} />Unlocked</div><div className="v num">{on} of {caps.length}</div><div className="small tint" style={{ marginTop: 6 }}>earned by learning</div></div>
    </div>
  );
}

function Ask({ c, busy, onAct }: { c: CapabilityView; busy: boolean; onAct: (verb: Verb, limit?: number) => void }) {
  const [limit, setLimit] = useState<string>(c.limit ? String(c.limit.perWeek) : "100");
  const n = Number(limit);
  const limitArg = c.capability === "cash_out" && limit !== "" && Number.isFinite(n) && n >= 0 ? n : undefined;
  return (
    <div className="block sun">
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <span style={{ width: 56, height: 56, borderRadius: 18, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}><Sprite name={spriteOf(c.capability)} size={34} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="label">Earned · your call</div>
          <div className="big" style={{ marginTop: 4 }}>{nameOf(c)}</div>
          <p className="meta tint">{c.gateName} is finished. Say yes and the bank switches it on. Say not yet and nothing changes; the badge stays earned.</p>
          <div className="actions">
            {c.capability === "cash_out" ? <label className="small tint" style={{ display: "flex", alignItems: "center", gap: 8 }}>AED a week <input className="limit num" inputMode="numeric" value={limit} onChange={(e) => setLimit(e.target.value)} aria-label="Weekly cash-out limit in AED" /></label> : null}
            <button className="btn" disabled={busy} onClick={() => onAct("approve", limitArg)}>Yes, switch it on</button>
            <button className="btn ghost" disabled={busy} onClick={() => onAct("not-yet")}>Not yet</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Switches({ view, busy, onAct }: { view: CapabilitiesView; busy: string | null; onAct: (capability: string, verb: Verb, limit?: number) => void }) {
  const caps = view.capabilities.filter((c) => !isCeiling(c));
  return (
    <div>
      <div className="title">Every switch</div>
      <div className="small">What the card can do. You can change any of them.</div>
      <div className="card flush" style={{ marginTop: 12 }}>
        {caps.map((c) => {
          const st = stateFor(c);
          const pct = c.progress && c.progress.total > 0 ? Math.round((c.progress.done / c.progress.total) * 100) : 0;
          const on = isOn(c);
          return (
            <div key={c.capability} className="line" style={{ alignItems: "flex-start" }}>
              <span className={`ic ${on ? "mint" : c.state === "Requested" ? "sun" : ""}`}><Sprite name={spriteOf(c.capability)} /></span>
              <div className="body">
                <b>{nameOf(c)}</b>
                <small>{c.gateName}{c.state === "Locked" && c.progress ? ` · ${c.progress.done} of ${c.progress.total}${c.progress.missing[0] ? ` · ${c.progress.missing[0]}` : ""}` : c.limit ? ` · ${c.limit.currency} ${c.limit.perWeek} a week` : ""}{c.lastActor && c.lastActor !== "system" ? ` · by ${c.lastActor}` : ""}</small>
                {c.state === "Locked" && c.progress && c.progress.total > 0 ? <div className="bar lilac" style={{ maxWidth: 220 }}><i style={{ width: `${pct}%` }} /></div> : null}
                <div className="actions" style={{ marginTop: 10 }}>
                  {(c.state === "Locked" || c.state === "Earned") && c.capability !== "shops" ? <button className="btn ghost small" disabled={busy === c.capability} onClick={() => onAct(c.capability, "open-early")}>Open now</button> : null}
                  {c.state === "Held" ? <button className="btn small" disabled={busy === c.capability} onClick={() => onAct(c.capability, "approve")}>Resume</button> : null}
                  {on && c.capability !== "shops" ? <button className="btn red small" disabled={busy === c.capability} onClick={() => onAct(c.capability, "close")}>Switch off</button> : null}
                  {c.state === "Closed" ? <button className="btn small" disabled={busy === c.capability} onClick={() => onAct(c.capability, "reopen")}>Switch back on</button> : null}
                </div>
              </div>
              <span className={`pill ${st.pill}`}>{st.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Recent({ acct }: { acct: AccountView }) {
  const sprite = (t: Transaction): string => t.amount > 0 ? "moneybag" : t.control === "transit_mcc" ? "bus" : t.control === "ecommerce" ? "laptop" : t.control === "atm" ? "bank" : t.control === "p2p" ? "gift" : "cart";
  return (
    <div>
      <div className="title">Recent money moves</div>
      <div className="small">Every payment, as the bank reports it.</div>
      <div className="card flush" style={{ marginTop: 12 }}>
        {acct.transactions.slice(0, 6).map((t) => (
          <div key={t.id} className="line">
            <span className={`ic ${t.amount > 0 ? "mint" : ""}`}><Sprite name={sprite(t)} /></span>
            <div className="body"><b>{t.description}</b><small>{dayLabel(t.at)}</small></div>
            <span className={`amt num ${t.amount > 0 ? "in" : ""}`}>{t.amount > 0 ? "+" : "-"}{whole(t.amount)}.{fils(t.amount)}</span>
          </div>
        ))}
        {acct.transactions.length === 0 ? <div className="line"><div className="body"><small>No payments yet.</small></div></div> : null}
      </div>
    </div>
  );
}

function Limits({ view }: { view: CapabilitiesView }) {
  const ceiling = view.capabilities.find(isCeiling);
  const acct = view.account ?? null;
  const topUp = acct?.transactions.find((t) => t.amount > 0);
  return (
    <div className="card">
      <div className="title">Pocket money and limits</div>
      <div className="small">What goes in, and the ceiling the bank applies.</div>
      {topUp ? <div style={{ marginTop: 14 }}><Money amount={topUp.amount} currency={topUp.currency} size={30} /><div className="small" style={{ marginTop: 4 }}>{topUp.description} · {dayLabel(topUp.at)}</div></div> : <div className="meta" style={{ marginTop: 12 }}>No top-ups yet.</div>}
      {ceiling ? (
        <div style={{ marginTop: 14, background: "var(--polar)", borderRadius: 16, padding: "12px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <div><b style={{ fontSize: 13.5, color: "var(--ink)" }}>Weekly limit</b><div className="small">Grows a band each time a strand completes.</div></div>
            <span className="num" style={{ fontWeight: 800, color: "var(--ink)" }}>{ceiling.limit ? `${ceiling.limit.currency} ${ceiling.limit.perWeek}` : "Bank default"}</span>
          </div>
          {ceiling.progress && ceiling.progress.total > 0 ? <><div className="bar" style={{ background: "#fff" }}><i style={{ width: `${Math.round((ceiling.progress.done / ceiling.progress.total) * 100)}%` }} /></div><div className="small" style={{ marginTop: 6 }}>{ceiling.progress.done} of {ceiling.progress.total} strands this year</div></> : null}
        </div>
      ) : null}
    </div>
  );
}

function History({ api, childId, tick }: { api: MoneyApi; childId: string; tick: number }) {
  const [open, setOpen] = useState(false);
  const [audit, setAudit] = useState<{ at: string; what: string }[]>([]);
  useEffect(() => {
    if (!open) return;
    void api.audit(childId).then((a) => { setAudit(a.entries.map((e) => ({ at: e.at, what: e.what }))); }).catch(() => undefined);
  }, [open, api, childId, tick]);
  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div><div className="title">History</div><div className="small">Every request, decision and bank change.</div></div>
        <button className="link" onClick={() => { setOpen((s) => !s); }}>{open ? "Hide" : "Show"}</button>
      </div>
      {open ? <ul className="audit" style={{ marginTop: 10 }}>{[...audit].reverse().map((e, i) => <li key={i}><time>{new Date(e.at).toLocaleString()}</time>{e.what}</li>)}</ul> : null}
    </div>
  );
}

/* ─── Page ──────────────────────────────────────────────────────────── */

export function ChildPage({ api, childId, childName }: { api: MoneyApi; childId: string; childName: string }) {
  const [view, setView] = useState<CapabilitiesView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    try { setView(await api.capabilities(childId)); setError(null); }
    catch (e) { setError(e instanceof ApiError && e.status === 403 ? "You are not a guardian of this child." : e instanceof Error ? e.message : "Something went wrong"); }
  }, [api, childId]);
  useEffect(() => { void load(); }, [load]);

  const act = async (capability: string, verb: Verb, limit?: number): Promise<void> => {
    setBusy(capability);
    try {
      const snap = await api.act(childId, capability, verb, limit !== undefined ? { limit: { currency: "AED", perWeek: limit } } : {});
      setToast(snap.label);
      await load();
      setTick((t) => t + 1);
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
      setTimeout(() => { setToast(null); }, 2600);
    }
  };

  const asks = view?.capabilities.filter((c) => c.state === "Requested") ?? [];
  const grade = view ? (/(\d{1,2})/.exec(view.gateSet)?.[1] ?? "") : "";

  return (
    <div className="shell">
      <div className="top"><span className="wm"><img src="/suited-logo.svg" alt="Suited" /><b>Money</b></span><span className="who">For parents</span></div>
      <div className="eyebrow">{childName}{grade ? ` · Grade ${grade}` : ""}</div>
      <h1>{asks.length > 0 ? <>{asks.length === 1 ? "One thing" : `${asks.length} things`} <em>earned.</em> Your call.</> : <>Everything in <em>your</em> hands.</>}</h1>
      <p className="sub">{childName} earns a capability by finishing the strand that teaches it. Nothing changes on the card until you say so, and you can switch anything off at any time.</p>
      {error ? <div className="err">{error}</div> : null}
      {!view && !error ? <div className="card" style={{ marginTop: 20 }}><div className="meta">Loading…</div></div> : null}
      {view ? (
        <div className="grid">
          <div className="col">
            {asks.map((c) => <Ask key={c.capability} c={c} busy={busy === c.capability} onAct={(verb, limit) => void act(c.capability, verb, limit)} />)}
            <Hero name={childName} view={view} />
            <Stats view={view} />
            <Switches view={view} busy={busy} onAct={(cap, verb, limit) => void act(cap, verb, limit)} />
            <div className="says"><img src="/family/frank.webp" alt="" /><div className="bubble"><div className="label">Frank, to {childName}</div><p>Every lesson in a strand gets you closer to the next unlock. Your parents say yes, the bank switches it on.</p></div></div>
          </div>
          <aside className="rail">
            <Limits view={view} />
            {view.account ? <Recent acct={view.account} /> : null}
            <History api={api} childId={childId} tick={tick} />
          </aside>
        </div>
      ) : null}
      {toast ? <div className="toast" role="status">{toast}</div> : null}
      <div className="foot">The bank holds the money. Suited holds the learning. You hold the switches.</div>
    </div>
  );
}
