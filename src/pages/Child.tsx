/**
 * One child, for the parent. The question is "what has she done, and what do I
 * need to decide?" so the asks come first, then the money, then every switch.
 * Calm register, shared with the child's Money tab. Every number is the bank's
 * or the engine's; every switch is the parent's.
 */
import { useCallback, useEffect, useState } from "react";
import { ApiError, type AccountView, type CapabilitiesView, type CapabilityView, type MoneyApi, type Pledge, type TopUpRequest, type Transaction, type Verb } from "../api";

const NAMES: Record<string, string> = { shops: "Shops", online: "Online payments", transport: "Transport", cash_out: "Cash out", peer_transfer: "Sending to friends", ceiling: "Weekly limit" };
const SPRITES: Record<string, string> = { shops: "cart", online: "laptop", transport: "bus", cash_out: "bank", peer_transfer: "gift", ceiling: "coin" };
const nameOf = (c: CapabilityView): string => NAMES[c.capability] ?? c.gateName;
const spriteOf = (id: string): string => SPRITES[id] ?? "coin";
const isOn = (c: CapabilityView): boolean => c.state === "Active" || c.state === "ActiveByParent" || (c.capability === "shops" && c.state === "Earned") || (c.capability === "ceiling" && c.state === "Earned");
const isCeiling = (c: CapabilityView): boolean => c.capability === "ceiling";
const whole = (n: number): string => Math.floor(Math.abs(n)).toLocaleString("en-US");
const fils = (n: number): string => Math.round((Math.abs(n) % 1) * 100).toString().padStart(2, "0");
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
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

/** The child asked for money. Yes moves it through the bank; the amount is the child's unless the parent changes it. */
function MoneyAsk({ r, childName, busy, onDecide }: { r: TopUpRequest; childName: string; busy: boolean; onDecide: (approve: boolean, amount?: number) => void }) {
  const [amount, setAmount] = useState<string>(r.amount !== undefined ? String(r.amount) : "");
  const n = Number(amount);
  const ok = amount !== "" && Number.isFinite(n) && n > 0;
  return (
    <div className="block sun">
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <span style={{ width: 56, height: 56, borderRadius: 18, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}><Sprite name="moneybag" size={34} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="label">{childName} asked · {dayLabel(r.at)}</div>
          <div className="big" style={{ marginTop: 4 }}>"{r.note}"</div>
          <p className="meta tint">{r.amount !== undefined ? `${childName} suggested ${r.currency} ${whole(r.amount)}. ` : `${childName} left the amount to you. `}Yes moves it from your account through the bank. Not now changes nothing.</p>
          <div className="actions">
            <label className="small tint" style={{ display: "flex", alignItems: "center", gap: 8 }}>AED <input className="limit num" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" aria-label="Amount in AED" /></label>
            <button className="btn" disabled={busy || !ok} onClick={() => onDecide(true, n)}>Yes, send it</button>
            <button className="btn ghost" disabled={busy} onClick={() => onDecide(false)}>Not now</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Add money: an amount, a note, through the bank. */
function AddMoney({ childName, busy, onSend }: { childName: string; busy: boolean; onSend: (amount: number, description: string) => void }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const n = Number(amount);
  const ok = amount !== "" && Number.isFinite(n) && n > 0;
  if (!open) return <button type="button" className="btn small" style={{ marginTop: 14, width: "100%" }} onClick={() => { setOpen(true); }}>Add money</button>;
  return (
    <div style={{ marginTop: 14, padding: 14, borderRadius: 16, background: "var(--polar)" }}>
      <div className="small" style={{ marginBottom: 8 }}>Goes to {childName}'s account at the bank. Suited never holds it.</div>
      <div className="actions" style={{ marginTop: 0 }}>
        {[10, 20, 50].map((v) => <button type="button" key={v} className={`pill ${amount === String(v) ? "mint" : "grey"}`} style={{ cursor: "pointer", padding: "8px 12px", fontSize: 13 }} onClick={() => { setAmount(String(v)); }}>AED {v}</button>)}
        <label className="small" style={{ display: "flex", alignItems: "center", gap: 8 }}>AED <input className="limit num" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Other" aria-label="Amount in AED" style={{ width: 100 }} /></label>
      </div>
      <input className="limit" value={note} onChange={(e) => setNote(e.target.value)} maxLength={80} placeholder="A note for the card, e.g. Well done this week" aria-label="Note" style={{ width: "100%", marginTop: 10 }} />
      <div className="actions">
        <button className="btn small" disabled={busy || !ok} onClick={() => { onSend(n, note.trim() || "Top-up from you"); setOpen(false); setAmount(""); setNote(""); }}>Send AED {ok ? whole(n) : "…"}</button>
        <button className="btn ghost small" disabled={busy} onClick={() => { setOpen(false); }}>Cancel</button>
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

/** Pocket money: an amount on a weekday, moved by the bank every week until stopped. */
function AllowanceEditor({ view, childName, busy, onSet, onClear }: { view: CapabilitiesView; childName: string; busy: boolean; onSet: (amount: number, day: number) => void; onClear: () => void }) {
  const a = view.allowance ?? null;
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(a ? String(a.amount) : "15");
  const [day, setDay] = useState(a ? a.dayOfWeek : 5);
  const n = Number(amount);
  const ok = amount !== "" && Number.isFinite(n) && n > 0;
  if (!open) {
    return a ? (
      <div style={{ marginTop: 14 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}><Money amount={a.amount} currency={a.currency} size={30} /><span className="small">every {DAYS_LONG[a.dayOfWeek]}</span></div>
        <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 12, background: "var(--polar)", borderRadius: 16, padding: "10px 14px" }}>
          <span style={{ width: 44, height: 44, borderRadius: 12, background: "#fff", border: "1.5px solid var(--swan)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: "none" }}><span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", color: "var(--hare)" }}>{DAYS[a.dayOfWeek]}</span><span className="num" style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)", lineHeight: 1 }}>{a.next.on.slice(8, 10)}</span></span>
          <div style={{ flex: 1 }}><b style={{ fontSize: 13.5, color: "var(--ink)" }}>Next payday: {DAYS_LONG[a.dayOfWeek]}</b><div className="small">{a.next.daysUntil === 0 ? "Today" : a.next.daysUntil === 1 ? "Tomorrow" : `In ${a.next.daysUntil} days`} · set by {a.setBy}</div></div>
        </div>
        <div className="actions" style={{ marginTop: 10 }}><button type="button" className="link" onClick={() => { setOpen(true); }}>Change</button><button type="button" className="link" style={{ color: "var(--cardinald)" }} disabled={busy} onClick={onClear}>Stop</button></div>
      </div>
    ) : (
      <div style={{ marginTop: 14 }}>
        <div className="meta">No pocket money set. A weekly amount lands on {childName}'s card on the day you choose, moved by the bank.</div>
        <button type="button" className="btn ghost small" style={{ marginTop: 10 }} onClick={() => { setOpen(true); }}>Set pocket money</button>
      </div>
    );
  }
  return (
    <div style={{ marginTop: 14, padding: 14, borderRadius: 16, background: "var(--polar)" }}>
      <div className="small" style={{ marginBottom: 8 }}>Every week on the day you pick, moved from your account by the bank.</div>
      <div className="actions" style={{ marginTop: 0 }}>
        {[10, 15, 20, 30].map((v) => <button type="button" key={v} className={`pill ${amount === String(v) ? "mint" : "grey"}`} style={{ cursor: "pointer", padding: "8px 12px", fontSize: 13 }} onClick={() => { setAmount(String(v)); }}>AED {v}</button>)}
        <label className="small" style={{ display: "flex", alignItems: "center", gap: 8 }}>AED <input className="limit num" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount in AED" style={{ width: 90 }} /></label>
      </div>
      <div className="actions" style={{ marginTop: 10 }}>
        {DAYS.map((d, i) => <button type="button" key={d} className={`pill ${day === i ? "mint" : "grey"}`} style={{ cursor: "pointer", padding: "8px 11px", fontSize: 12.5 }} onClick={() => { setDay(i); }}>{d}</button>)}
      </div>
      <div className="actions">
        <button className="btn small" disabled={busy || !ok} onClick={() => { onSet(n, day); setOpen(false); }}>Save: AED {ok ? whole(n) : "…"} every {DAYS_LONG[day]}</button>
        <button className="btn ghost small" disabled={busy} onClick={() => { setOpen(false); }}>Cancel</button>
      </div>
    </div>
  );
}

/** Pledges: "AED 50 when Budgeting is done". Kept by the bank the moment the strand completes. */
function Pledges({ view, childName, busy, onPledge, onCancel }: { view: CapabilitiesView; childName: string; busy: boolean; onPledge: (capability: string, amount: number, note: string) => void; onCancel: (id: string) => void }) {
  const pledges = view.pledges ?? [];
  const open = pledges.filter((p) => p.status === "open");
  const paid: Pledge[] = pledges.filter((p) => p.status === "paid").slice(-3).reverse();
  const candidates = view.capabilities.filter((c) => !isCeiling(c) && !isOn(c) && c.state === "Locked" && !open.some((p) => p.capability === c.capability));
  const [adding, setAdding] = useState(false);
  const [cap, setCap] = useState<string>(candidates[0]?.capability ?? "");
  const [amount, setAmount] = useState("50");
  const [note, setNote] = useState("");
  const n = Number(amount);
  const ok = cap !== "" && amount !== "" && Number.isFinite(n) && n > 0;
  return (
    <div className="card">
      <div className="title">Pledges</div>
      <div className="small">A promise {childName} can see. The bank keeps it the moment the strand is done.</div>
      {open.map((p) => (
        <div key={p.id} style={{ marginTop: 12, padding: "12px 14px", borderRadius: 16, background: "var(--mint)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
            <div><b style={{ fontSize: 14, color: "var(--ink)" }} className="num">AED {whole(p.amount)}</b><span style={{ fontSize: 13, color: "var(--mintt)" }}> when {p.gateName} is done</span>{p.note ? <div className="small" style={{ color: "var(--mintt)" }}>"{p.note}"</div> : null}<div className="small" style={{ color: "var(--mintt)" }}>by {p.madeBy}</div></div>
            <button type="button" className="link" style={{ color: "var(--mintt)" }} disabled={busy} onClick={() => onCancel(p.id)}>Cancel</button>
          </div>
        </div>
      ))}
      {paid.map((p) => (
        <div key={p.id} style={{ marginTop: 10, display: "flex", justifyContent: "space-between", gap: 10, padding: "8px 2px" }}>
          <div><b style={{ fontSize: 13.5, color: "var(--ink)" }}>{p.gateName} done</b><div className="small">Kept{p.paidAt ? ` · ${dayLabel(p.paidAt)}` : ""} · by {p.madeBy}</div></div>
          <span className="num" style={{ fontWeight: 800, color: "var(--treefrog)" }}>+{whole(p.amount)}.00</span>
        </div>
      ))}
      {!adding ? (
        candidates.length > 0 ? <button type="button" className="btn ghost small" style={{ marginTop: 12 }} onClick={() => { setAdding(true); setCap(candidates[0]?.capability ?? ""); }}>Pledge a reward</button> : <div className="small" style={{ marginTop: 10 }}>Every strand is either earned or already pledged.</div>
      ) : (
        <div style={{ marginTop: 12, padding: 14, borderRadius: 16, background: "var(--polar)" }}>
          <div className="small" style={{ marginBottom: 8 }}>Pick the strand, then the amount. It moves only when the strand completes.</div>
          <div className="actions" style={{ marginTop: 0 }}>
            {candidates.map((c) => <button type="button" key={c.capability} className={`pill ${cap === c.capability ? "mint" : "grey"}`} style={{ cursor: "pointer", padding: "8px 12px", fontSize: 12.5 }} onClick={() => { setCap(c.capability); }}>{c.gateName}</button>)}
          </div>
          <div className="actions">
            {[20, 50, 100].map((v) => <button type="button" key={v} className={`pill ${amount === String(v) ? "mint" : "grey"}`} style={{ cursor: "pointer", padding: "8px 12px", fontSize: 13 }} onClick={() => { setAmount(String(v)); }}>AED {v}</button>)}
            <label className="small" style={{ display: "flex", alignItems: "center", gap: 8 }}>AED <input className="limit num" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount in AED" style={{ width: 90 }} /></label>
          </div>
          <input className="limit" value={note} onChange={(e) => setNote(e.target.value)} maxLength={80} placeholder="A word for the card, e.g. For sticking with it" aria-label="Note" style={{ width: "100%", marginTop: 10 }} />
          <div className="actions">
            <button className="btn small" disabled={busy || !ok} onClick={() => { onPledge(cap, n, note.trim()); setAdding(false); setNote(""); }}>Pledge AED {ok ? whole(n) : "…"}</button>
            <button className="btn ghost small" disabled={busy} onClick={() => { setAdding(false); }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Limits({ view, childName, busy, onTopUp, onSetAllowance, onClearAllowance }: { view: CapabilitiesView; childName: string; busy: boolean; onTopUp: (amount: number, description: string) => void; onSetAllowance: (amount: number, day: number) => void; onClearAllowance: () => void }) {
  const ceiling = view.capabilities.find(isCeiling);
  return (
    <div className="card">
      <div className="title">Pocket money and limits</div>
      <div className="small">What goes in every week, and the ceiling the bank applies.</div>
      <AllowanceEditor view={view} childName={childName} busy={busy} onSet={onSetAllowance} onClear={onClearAllowance} />
      {ceiling ? (
        <div style={{ marginTop: 14, background: "var(--polar)", borderRadius: 16, padding: "12px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <div><b style={{ fontSize: 13.5, color: "var(--ink)" }}>Weekly limit</b><div className="small">Grows a band each time a strand completes.</div></div>
            <span className="num" style={{ fontWeight: 800, color: "var(--ink)" }}>{ceiling.limit ? `${ceiling.limit.currency} ${ceiling.limit.perWeek}` : "Bank default"}</span>
          </div>
          {ceiling.progress && ceiling.progress.total > 0 ? <><div className="bar" style={{ background: "#fff" }}><i style={{ width: `${Math.round((ceiling.progress.done / ceiling.progress.total) * 100)}%` }} /></div><div className="small" style={{ marginTop: 6 }}>{ceiling.progress.done} of {ceiling.progress.total} strands this year</div></> : null}
        </div>
      ) : null}
      {view.account ? <AddMoney childName={childName} busy={busy} onSend={onTopUp} /> : null}
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

export function ChildPage({ api, childId, childName, onSectionSeen }: { api: MoneyApi; childId: string; childName: string; onSectionSeen?: (id: string) => void }) {
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

  // Tell the sidebar which section is on screen.
  useEffect(() => {
    if (!onSectionSeen || !view || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => { for (const e of entries) if (e.isIntersecting) onSectionSeen(e.target.id); }, { rootMargin: "-30% 0px -60% 0px" });
    for (const id of ["overview", "switches", "moves", "history"]) { const el = document.getElementById(id); if (el) io.observe(el); }
    return () => { io.disconnect(); };
  }, [onSectionSeen, view]);

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

  const topUp = async (amount: number, description: string): Promise<void> => {
    setBusy("top-up");
    try {
      const r = await api.topUp(childId, amount, description);
      setToast(`AED ${whole(r.transaction.amount)} on its way to ${childName}'s card`);
      await load();
      setTick((t) => t + 1);
    } catch (e) { setToast(e instanceof Error ? e.message : "Something went wrong"); }
    finally { setBusy(null); setTimeout(() => { setToast(null); }, 2600); }
  };
  const decide = async (r: TopUpRequest, approve: boolean, amount?: number): Promise<void> => {
    setBusy(r.id);
    try {
      const out = await api.decideRequest(childId, r.id, approve, amount);
      setToast(approve && out.transaction ? `Sent AED ${whole(out.transaction.amount)} to ${childName}` : "Told them not now");
      await load();
      setTick((t) => t + 1);
    } catch (e) { setToast(e instanceof Error ? e.message : "Something went wrong"); }
    finally { setBusy(null); setTimeout(() => { setToast(null); }, 2600); }
  };

  const run = async (label: string, fn: () => Promise<string>): Promise<void> => {
    setBusy(label);
    try { setToast(await fn()); await load(); setTick((t) => t + 1); }
    catch (e) { setToast(e instanceof Error ? e.message : "Something went wrong"); }
    finally { setBusy(null); setTimeout(() => { setToast(null); }, 2600); }
  };
  const setAllowance = (amount: number, day: number) => run("allowance", async () => { const r = await api.setAllowance(childId, amount, day); return `AED ${whole(r.allowance.amount)} every ${DAYS_LONG[r.allowance.dayOfWeek]}`; });
  const clearAllowance = () => run("allowance", async () => { await api.clearAllowance(childId); return "Pocket money stopped"; });
  const makePledge = (capability: string, amount: number, note: string) => run("pledge", async () => { const r = await api.pledge(childId, capability, amount, note || undefined); return `Pledged AED ${whole(r.pledge.amount)} for ${r.pledge.gateName}`; });
  const cancelPledge = (id: string) => run("pledge", async () => { await api.cancelPledge(childId, id); return "Pledge cancelled"; });

  const asks = view?.capabilities.filter((c) => c.state === "Requested") ?? [];
  const moneyAsks = view?.requests ?? [];
  const totalAsks = asks.length + moneyAsks.length;
  const grade = view ? (/(\d{1,2})/.exec(view.gateSet)?.[1] ?? "") : "";

  return (
    <div className="shell">
      <div className="top"><span className="wm"><img src="/suited-logo.svg" alt="Suited" /><b>Money</b></span><span className="who">For parents</span></div>
      <section id="overview">
      <div className="eyebrow">{childName}{grade ? ` · Grade ${grade}` : ""}</div>
      <h1>{totalAsks > 0 ? <>{totalAsks === 1 ? "One thing" : `${totalAsks} things`} <em>waiting.</em> Your call.</> : <>Everything in <em>your</em> hands.</>}</h1>
      <p className="sub">{childName} earns a capability by finishing the strand that teaches it. Nothing changes on the card until you say so, and you can switch anything off at any time.</p>
      {error ? <div className="err">{error}</div> : null}
      </section>
      {!view && !error ? <div className="card" style={{ marginTop: 20 }}><div className="meta">Loading…</div></div> : null}
      {view ? (
        <div className="grid">
          <div className="col">
            {asks.map((c) => <Ask key={c.capability} c={c} busy={busy === c.capability} onAct={(verb, limit) => void act(c.capability, verb, limit)} />)}
            {moneyAsks.map((r) => <MoneyAsk key={r.id} r={r} childName={childName} busy={busy === r.id} onDecide={(approve, amount) => void decide(r, approve, amount)} />)}
            <Hero name={childName} view={view} />
            <Stats view={view} />
            <section id="switches"><Switches view={view} busy={busy} onAct={(cap, verb, limit) => void act(cap, verb, limit)} /></section>
            <div className="says"><img src="/family/frank.webp" alt="" /><div className="bubble"><div className="label">Frank, to {childName}</div><p>Every lesson in a strand gets you closer to the next unlock. Your parents say yes, the bank switches it on.</p></div></div>
          </div>
          <aside className="rail">
            <Limits view={view} childName={childName} busy={busy === "top-up" || busy === "allowance"} onTopUp={(a, d) => void topUp(a, d)} onSetAllowance={(a, d) => void setAllowance(a, d)} onClearAllowance={() => void clearAllowance()} />
            <Pledges view={view} childName={childName} busy={busy === "pledge"} onPledge={(c, a, n) => void makePledge(c, a, n)} onCancel={(id) => void cancelPledge(id)} />
            <section id="moves">{view.account ? <Recent acct={view.account} /> : null}</section>
            <section id="history"><History api={api} childId={childId} tick={tick} /></section>
          </aside>
        </div>
      ) : null}
      {toast ? <div className="toast" role="status">{toast}</div> : null}
      <div className="foot">The bank holds the money. Suited holds the learning. You hold the switches.</div>
    </div>
  );
}
