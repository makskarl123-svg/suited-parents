/**
 * One child, for the parent. The question is "what has she done, and what do I
 * need to decide?" so the asks come first, then the money, then every switch.
 * Calm register, shared with the child's Money tab. Every number is the bank's
 * or the engine's; every switch is the parent's.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, type AccountView, type CapabilitiesView, type CapabilityView, type MoneyApi, type Pledge, type TopUpRequest, type Transaction, type Verb } from "../api";

const NAMES: Record<string, string> = { shops: "Shops", online: "Online", transport: "Transport", cash_out: "Cash out", peer_transfer: "Friends", ceiling: "Weekly limit" };
/** One illustrated object per capability (public/money/art). Sprites stand in until the matched objects are generated. */
const ART: Record<string, string> = { shops: "/money/art/bag.webp", online: "/money/art/phone-tap.webp", transport: "/money/art/metro.webp", cash_out: "/money/art/atm.webp", peer_transfer: "/money/art/plane-coin.webp", ceiling: "/money/art/coin-stack.webp" };
const ART_GIFT = "/money/art/gift.webp";
const ART_SNOWFLAKE = "/money/art/snowflake.webp";
const nameOf = (c: CapabilityView): string => NAMES[c.capability] ?? c.gateName;
const artOf = (id: string): string => ART[id] ?? "/money/art/coin-stack.webp";
const artForTx = (t: Transaction): string => t.amount > 0 ? ART_GIFT : artOf(t.control === "transit_mcc" ? "transport" : t.control === "ecommerce" ? "online" : t.control === "atm" ? "cash_out" : t.control === "p2p" ? "peer_transfer" : "shops");
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
const Obj = ({ src, size = 44, dim = false, style }: { src: string; size?: number; dim?: boolean; style?: React.CSSProperties }) => <img className={`obj${dim ? " dim" : ""}`} src={src} alt="" style={{ width: size, height: size, ...style }} />;
const Lock = () => <span className="badge" aria-hidden="true"><svg width="18" height="20" viewBox="0 0 22 24"><rect x="2" y="10" width="18" height="13" rx="4" fill="var(--navy)" /><path d="M6 10V7a5 5 0 0 1 10 0v3" fill="none" stroke="var(--bee)" strokeWidth="3.2" strokeLinecap="round" /><circle cx="11" cy="16.5" r="2" fill="var(--bee)" /></svg></span>;

/* ─── Blocks ────────────────────────────────────────────────────────── */

/** The balance, big. The one number a parent checks. */
function BalanceHead({ name, view }: { name: string; view: CapabilitiesView }) {
  const acct = view.account ?? null;
  const left = acct && acct.week.limit !== undefined ? Math.max(0, acct.week.limit - acct.week.spent) : undefined;
  return (
    <div className="balance">
      <div style={{ minWidth: 0 }}>
        <div className="lbl">{name}'s card · at the bank</div>
        {acct ? <Money amount={acct.balance} currency={acct.currency} /> : <div className="big din" style={{ marginTop: 8, fontSize: 28 }}>Card on its way</div>}
      </div>
      {acct && left !== undefined ? <div className="week num">{acct.currency} {whole(left)} left this week</div> : null}
    </div>
  );
}

/** The card as an object, the same one the child sees: straight, lit by the pointer, one sweep on arrival. */
function CardHero({ frozen }: { frozen: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [t, setT] = useState({ rx: 0, ry: 0, x: 50, y: 50, on: false });
  const [sweep, setSweep] = useState(0);
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") return;
    const r = ref.current?.getBoundingClientRect(); if (!r) return;
    const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    setT({ rx: (0.5 - py) * 12, ry: (px - 0.5) * 14, x: px * 100, y: py * 100, on: true });
  };
  return (
    <div className="card-hero">
      <div ref={ref} className={`money-card${t.on ? " is-on" : ""}`} onPointerMove={move} onPointerLeave={() => { setT({ rx: 0, ry: 0, x: 50, y: 50, on: false }); }} onClick={() => { setSweep((n) => n + 1); }} style={{ transform: `rotateX(${t.rx}deg) rotateY(${t.ry}deg)` }}>
        <img src="/money/card.webp" alt="The card" className={frozen ? "frozen" : undefined} />
        {!frozen ? <div className="money-sheen" style={{ "--x": `${t.x}%`, "--y": `${t.y}%` } as React.CSSProperties} /> : null}
        {!frozen ? <div key={sweep} className="money-sweep" /> : null}
        {frozen ? <div className="frozen-chip"><span className="chip ice"><i />Frozen at the bank</span></div> : null}
      </div>
    </div>
  );
}

/** What a parent came to do, one tap from the top: send money, set pocket money, freeze. Each opens inline. */
function DoRow({ view, childName, busy, onTopUp, onSetAllowance, onClearAllowance, onFreeze }: { view: CapabilitiesView; childName: string; busy: string | null; onTopUp: (amount: number, description: string) => void; onSetAllowance: (amount: number, day: number) => void; onClearAllowance: () => void; onFreeze: (frozen: boolean) => void }) {
  const [open, setOpen] = useState<"send" | "pocket" | null>(null);
  const a = view.allowance ?? null;
  const frozen = view.card?.frozen === true;
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [pAmount, setPAmount] = useState(a ? String(a.amount) : "15");
  const [pDay, setPDay] = useState(a ? a.dayOfWeek : 5);
  const n = Number(amount), pn = Number(pAmount);
  const ok = amount !== "" && Number.isFinite(n) && n > 0;
  const pok = pAmount !== "" && Number.isFinite(pn) && pn > 0;
  return (
    <div>
      <div className="do">
        <button type="button" className={`do-btn ${open === "send" ? "on" : ""}`} disabled={!view.account} onClick={() => { setOpen(open === "send" ? null : "send"); }}><Obj src={ART_GIFT} size={40} /><b>Send money</b><small>To the card, now</small></button>
        <button type="button" className={`do-btn ${open === "pocket" ? "on" : ""}`} onClick={() => { setOpen(open === "pocket" ? null : "pocket"); }}><Obj src="/money/art/coin-stack.webp" size={40} /><b>Pocket money</b><small>{a ? `AED ${whole(a.amount)} every ${DAYS_LONG[a.dayOfWeek] ?? "week"}` : "Not set"}</small></button>
        <button type="button" className={`do-btn ${frozen ? "ice" : ""}`} disabled={!view.card || busy === "card"} onClick={() => onFreeze(!frozen)}><Obj src={ART_SNOWFLAKE} size={40} /><b>{frozen ? "Unfreeze" : "Freeze"}</b><small>{frozen ? "Card is frozen" : "One tap, at the bank"}</small></button>
      </div>
      {open === "send" ? (
        <div className="sheet">
          <div className="small">Goes to {childName}'s account at the bank. Suited never holds it.</div>
          <div className="actions" style={{ marginTop: 10 }}>
            {[10, 20, 50, 100].map((v) => <button type="button" key={v} className={`pill ${amount === String(v) ? "mint" : "grey"}`} style={{ cursor: "pointer", padding: "10px 14px", fontSize: 14 }} onClick={() => { setAmount(String(v)); }}>AED {v}</button>)}
            <label className="small" style={{ display: "flex", alignItems: "center", gap: 8 }}>AED <input className="limit num" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Other" aria-label="Amount in AED" style={{ width: 96 }} /></label>
          </div>
          <input className="limit" value={note} onChange={(e) => setNote(e.target.value)} maxLength={80} placeholder="A note for the card, e.g. Well done this week" aria-label="Note" style={{ width: "100%", marginTop: 10 }} />
          <div className="actions">
            <button className="btn" disabled={busy === "top-up" || !ok} onClick={() => { onTopUp(n, note.trim() || "Top-up from you"); setOpen(null); setAmount(""); setNote(""); }}>Send AED {ok ? whole(n) : "…"}</button>
            <button className="btn ghost" onClick={() => { setOpen(null); }}>Cancel</button>
          </div>
        </div>
      ) : null}
      {open === "pocket" ? (
        <div className="sheet">
          <div className="small">Every week on the day you pick, moved from your account by the bank. Change or stop it any time.</div>
          <div className="actions" style={{ marginTop: 10 }}>
            {[10, 15, 20, 30, 50].map((v) => <button type="button" key={v} className={`pill ${pAmount === String(v) ? "mint" : "grey"}`} style={{ cursor: "pointer", padding: "10px 14px", fontSize: 14 }} onClick={() => { setPAmount(String(v)); }}>AED {v}</button>)}
            <label className="small" style={{ display: "flex", alignItems: "center", gap: 8 }}>AED <input className="limit num" inputMode="decimal" value={pAmount} onChange={(e) => setPAmount(e.target.value)} aria-label="Amount in AED" style={{ width: 90 }} /></label>
          </div>
          <div className="actions" style={{ marginTop: 10 }}>
            {DAYS.map((d, i) => <button type="button" key={d} className={`pill ${pDay === i ? "mint" : "grey"}`} style={{ cursor: "pointer", padding: "10px 12px", fontSize: 13 }} onClick={() => { setPDay(i); }}>{d}</button>)}
          </div>
          <div className="actions">
            <button className="btn" disabled={busy === "allowance" || !pok} onClick={() => { onSetAllowance(pn, pDay); setOpen(null); }}>{a ? "Save" : "Start"}: AED {pok ? whole(pn) : "…"} every {DAYS_LONG[pDay]}</button>
            {a ? <button className="btn red" disabled={busy === "allowance"} onClick={() => { onClearAllowance(); setOpen(null); }}>Stop pocket money</button> : null}
            <button className="btn ghost" onClick={() => { setOpen(null); }}>Cancel</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** What a parent has put in this month, by kind. The number they screenshot for the other parent. */
function GivenThisMonth({ view, childName }: { view: CapabilitiesView; childName: string }) {
  const acct = view.account ?? null;
  if (!acct) return null;
  const now = new Date(); const m = now.getMonth(), y = now.getFullYear();
  const ins = acct.transactions.filter((t) => { const d = new Date(t.at); return t.amount > 0 && d.getMonth() === m && d.getFullYear() === y; });
  const total = ins.reduce((n, t) => n + t.amount, 0);
  const pocket = ins.filter((t) => /pocket|allowance/i.test(t.description)).reduce((n, t) => n + t.amount, 0);
  const pledged = ins.filter((t) => /pledge/i.test(t.description)).reduce((n, t) => n + t.amount, 0);
  const topups = total - pocket - pledged;
  const month = now.toLocaleString("en-GB", { month: "long" });
  return (
    <div className="card">
      <div className="label">Given in {month}</div>
      <div className="money" style={{ fontSize: 34 }}><span className="cur">{acct.currency}</span>{whole(total)}</div>
      <div className="small" style={{ marginTop: 8 }}>{total === 0 ? `Nothing yet this month. Pocket money, top-ups and kept pledges all land here.` : [pocket > 0 ? `AED ${whole(pocket)} pocket money` : "", topups > 0 ? `AED ${whole(topups)} top-ups` : "", pledged > 0 ? `AED ${whole(pledged)} pledges kept` : ""].filter(Boolean).join(" · ")} {total > 0 ? `To ${childName}, through the bank.` : ""}</div>
    </div>
  );
}

type PowerState = "on" | "next" | "waiting" | "locked" | "off";
const powerState = (c: CapabilityView, next: CapabilityView | undefined): PowerState =>
  isOn(c) ? "on" : c.state === "Closed" || c.state === "Held" ? "off" : c.state === "Requested" || c.state === "Earned" ? "waiting" : next?.capability === c.capability ? "next" : "locked";
const powerLine = (c: CapabilityView, st: PowerState): string => {
  if (st === "on") return "On";
  if (st === "off") return c.state === "Held" ? "Paused" : "Off";
  if (st === "waiting") return "Your call";
  const p = c.progress;
  if (st === "next" && p && p.total > 0) { const left = Math.max(0, p.total - p.done); return left === 1 ? "1 lesson away" : `${left} lessons away`; }
  return c.gateName.length <= 14 ? c.gateName : "Locked";
};

/** The five powers as badges under the card. Tapping one scrolls to its switch. */
function Powers({ view }: { view: CapabilitiesView }) {
  const caps = view.capabilities.filter((c) => !isCeiling(c));
  const next = caps.find((c) => c.state === "Locked");
  return (
    <div className="powers" style={{ gridTemplateColumns: `repeat(${caps.length}, minmax(0, 1fr))` }}>
      {caps.map((c, i) => {
        const st = powerState(c, next);
        return (
          <button type="button" key={c.capability} className="power" style={{ "--d": `${120 + i * 70}ms` } as React.CSSProperties} onClick={() => document.getElementById("switches")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
            <span className={`disc ${st}`}><Obj src={artOf(c.capability)} dim={st === "locked"} />{st === "locked" ? <Lock /> : null}</span>
            <b>{nameOf(c)}</b>
            <small className={st}>{powerLine(c, st)}</small>
          </button>
        );
      })}
    </div>
  );
}

function Ask({ c, busy, onAct }: { c: CapabilityView; busy: boolean; onAct: (verb: Verb, limit?: number) => void }) {
  const [limit, setLimit] = useState<string>(c.limit ? String(c.limit.perWeek) : "100");
  const n = Number(limit);
  const limitArg = c.capability === "cash_out" && limit !== "" && Number.isFinite(n) && n >= 0 ? n : undefined;
  return (
    <div className="block sun">
      <div className="obj-row" style={{ alignItems: "flex-start" }}>
        <Obj src={artOf(c.capability)} size={96} />
        <div className="words">
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
      <div className="obj-row" style={{ alignItems: "flex-start" }}>
        <Obj src={ART_GIFT} size={96} />
        <div className="words">
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
              <span className="ic"><Obj src={artOf(c.capability)} dim={!on && c.state === "Locked"} /></span>
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
  return (
    <div>
      <div className="title">Recent money moves</div>
      <div className="small">Every payment, as the bank reports it.</div>
      <div className="card flush" style={{ marginTop: 12 }}>
        {acct.transactions.slice(0, 6).map((t) => (
          <div key={t.id} className="line">
            <span className="ic"><Obj src={artForTx(t)} /></span>
            <div className="body"><b>{t.description}</b><small>{dayLabel(t.at)}</small></div>
            <span className={`amt num ${t.amount > 0 ? "in" : ""}`}>{t.amount > 0 ? "+" : "-"}{whole(t.amount)}.{fils(t.amount)}</span>
          </div>
        ))}
        {acct.transactions.length === 0 ? <div className="line"><div className="body"><small>No payments yet.</small></div></div> : null}
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
        <div key={p.id} className="obj-row" style={{ marginTop: 12, padding: "12px 14px", borderRadius: 16, background: "var(--mint)", boxShadow: "0 3px 0 var(--minte)" }}>
          <Obj src={ART_GIFT} size={48} />
          <div className="words" style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
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

/** The weekly ceiling: what it is, what it becomes, what finishes it. */
function Limits({ view, childName }: { view: CapabilitiesView; childName: string }) {
  const ceiling = view.capabilities.find(isCeiling);
  const acct = view.account ?? null;
  if (!ceiling) return null;
  const now = acct?.week.limit !== undefined ? `${acct.currency} ${acct.week.limit}` : ceiling.limit ? `${ceiling.limit.currency} ${ceiling.limit.perWeek}` : "Bank default";
  const next = ceiling.nextLimit ?? null;
  const p = ceiling.progress ?? null;
  const togo = p && p.total > 0 ? Math.max(0, p.total - p.done) : null;
  return (
    <div className="card">
      <div className="title">Weekly ceiling</div>
      <div className="small">The most {childName} can spend in a week. The bank applies it; you can lower it any time.</div>
      <div style={{ marginTop: 12, display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <span className="num din" style={{ fontWeight: 700, fontSize: 24, color: "var(--ink)" }}>{now}</span>
        {next && !isOn(ceiling) ? <span className="small" style={{ color: "var(--mintt)", fontWeight: 700 }}>climbs to {next.currency} {next.perWeek}</span> : null}
      </div>
      {next && !isOn(ceiling) && p && p.total > 0 ? (
        <>
          <div style={{ marginTop: 10, display: "flex", gap: 5 }} aria-label={`${p.done} of ${p.total} strands done`}>{Array.from({ length: p.total }, (_, i) => <span key={i} style={{ height: 8, flex: 1, borderRadius: 99, background: i < p.done ? "var(--owl)" : "var(--polar)" }} />)}</div>
          <div className="small" style={{ marginTop: 8 }}>{togo === 0 ? "Earned. Waiting for your yes." : `${p.done} of ${p.total} Grade 6 strands done · ${togo === 1 ? "1 strand" : `${togo} strands`} to go. You say yes, the bank lifts it.`}</div>
        </>
      ) : null}
    </div>
  );
}

/** Educational consent, with the door to withdraw it. Rare, so quiet; but it must always be one tap away. */
function ConsentCard({ view, childName, busy, onSet }: { view: CapabilitiesView; childName: string; busy: boolean; onSet: (give: boolean) => void }) {
  const c = view.consent ?? null;
  const withdrawn = c?.withdrawnAt != null;
  const [confirm, setConfirm] = useState(false);
  return (
    <div className={withdrawn ? "block rose" : "card"}>
      <div className="title">{withdrawn ? "Consent withdrawn" : "Your consent"}</div>
      <div className="small" style={withdrawn ? { color: "var(--roset)" } : undefined}>{withdrawn ? `Learning no longer changes ${childName}'s card. The card is on the bank's defaults. Earned badges are kept.` : c ? `Given ${dayLabel(c.givenAt)} by ${c.byGuardianId}. ${childName}'s learning may request card capabilities that you approve.` : `${childName} was linked before consent was recorded here. The bank's own agreement is separate.`}</div>
      {!withdrawn && !confirm ? <div className="actions"><button type="button" className="link" style={{ color: "var(--cardinald)" }} onClick={() => { setConfirm(true); }}>Withdraw consent</button></div> : null}
      {!withdrawn && confirm ? (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 14, background: "var(--rose)" }}>
          <div style={{ fontSize: 13.5, color: "var(--roset)", fontWeight: 600 }}>Every capability goes back to the bank's defaults and learning stops changing the card. You can give consent again any time.</div>
          <div className="actions"><button className="btn red small" disabled={busy} onClick={() => { onSet(false); setConfirm(false); }}>Yes, withdraw</button><button className="btn ghost small" onClick={() => { setConfirm(false); }}>Keep it</button></div>
        </div>
      ) : null}
      {withdrawn ? <div className="actions"><button className="btn small" disabled={busy} onClick={() => onSet(true)}>Give consent again</button></div> : null}
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
  const setFrozen = (frozen: boolean) => run("card", async () => { await api.setFrozen(childId, frozen); return frozen ? "Card frozen at the bank" : "Card unfrozen"; });
  const setConsent = (give: boolean) => run("consent", async () => { await api.setConsent(childId, give); return give ? "Consent given again" : "Consent withdrawn"; });

  const asks = view?.capabilities.filter((c) => c.state === "Requested") ?? [];
  const moneyAsks = view?.requests ?? [];
  const totalAsks = asks.length + moneyAsks.length;
  const grade = view ? (/(\d{1,2})/.exec(view.gateSet)?.[1] ?? "") : "";

  return (
    <div className="shell">
      <div className="top"><span className="wm"><img src="/suited-logo.svg" alt="Suited" /><b>Money</b></span><span className="who">For parents</span></div>
      <section id="overview">
      <div className="lbl">{childName}{grade ? ` · Grade ${grade}` : ""}</div>
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
            <BalanceHead name={childName} view={view} />
            <CardHero frozen={view.card?.frozen === true} />
            <DoRow view={view} childName={childName} busy={busy} onTopUp={(a, d) => void topUp(a, d)} onSetAllowance={(a, d) => void setAllowance(a, d)} onClearAllowance={() => void clearAllowance()} onFreeze={(f) => void setFrozen(f)} />
            <Powers view={view} />
            <section id="switches"><Switches view={view} busy={busy} onAct={(cap, verb, limit) => void act(cap, verb, limit)} /></section>
            <div className="says"><img src="/family/frank.webp" alt="" /><div className="bubble"><div className="label">Frank, to {childName}</div><p>Every lesson in a strand gets you closer to the next unlock. Your parents say yes, the bank switches it on.</p></div></div>
          </div>
          <aside className="rail">
            <GivenThisMonth view={view} childName={childName} />
            <Limits view={view} childName={childName} />
            <Pledges view={view} childName={childName} busy={busy === "pledge"} onPledge={(c, a, n) => void makePledge(c, a, n)} onCancel={(id) => void cancelPledge(id)} />
            <section id="moves">{view.account ? <Recent acct={view.account} /> : null}</section>
            <ConsentCard view={view} childName={childName} busy={busy === "consent"} onSet={(g) => void setConsent(g)} />
            <section id="history"><History api={api} childId={childId} tick={tick} /></section>
          </aside>
        </div>
      ) : null}
      {toast ? <div className="toast" role="status">{toast}</div> : null}
      <div className="foot">The bank holds the money. Suited holds the learning. You hold the switches.</div>
    </div>
  );
}
