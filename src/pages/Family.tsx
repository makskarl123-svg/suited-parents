/**
 * Suited Money for parents, rebuilt on the approved Premium design
 * (prototype: claude.ai/artifact/Y7XLgGuXJ7zdfSay1Sk22C). Four tabs: Today
 * (only what needs the parent), Money (how it reaches the child, jars,
 * payments), Rewards (pledges and progress), Settings (account, how payments
 * are sent, consent). Every number comes from the Money service; every action
 * is one endpoint in its contract.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, type CapabilitiesView, type ChildSummary, type Mandate, type MoneyApi, type Payment, type Pledge, type PledgeReward, type TopUpRequest } from "../api";

type Tab = "today" | "money" | "rewards" | "settings";
const ART = { coins: "/money/art/coin-stack.webp", gift: "/money/art/gift.webp", trophy: "/money/art/trophy.webp", jar: "/money/art/jar-coins.webp", vault: "/money/art/vault.webp", piggy: "/money/art/piggy.webp", key: "/money/art/key.webp", metro: "/money/art/metro.webp", padlock: "/money/art/padlock.webp" };
const FRANK = "/family/frank.webp";
const KID_COLOURS = ["#FF9600", "#CE82FF", "#1CB0F6", "#58CC02"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const JAR_COLOURS = ["#FF9600", "#CE82FF", "#58CC02", "#FFC800"];
const aed = (n: number): string => `AED ${Math.round(n * 100) % 100 === 0 ? Math.round(n).toLocaleString("en-US") : n.toFixed(2)}`;
const day = (iso: string): string => {
  const d = new Date(iso); if (Number.isNaN(d.getTime())) return "";
  const a = new Date(); a.setHours(0, 0, 0, 0); const b = new Date(d); b.setHours(0, 0, 0, 0);
  const diff = Math.round((a.getTime() - b.getTime()) / 86_400_000);
  return diff <= 0 ? "Today" : diff === 1 ? "Yesterday" : diff < 7 ? DAYS[b.getDay()] ?? "" : b.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};
const reduceMotion = (): boolean => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** How money reaches this child right now. */
type How = "auto" | "manual";

export function Family({ api, kids, guardianLabel, onSwitchGuardian }: { api: MoneyApi; kids: ChildSummary[]; guardianLabel: string; onSwitchGuardian?: () => void }) {
  const [childId, setChildId] = useState<string>(kids[0]?.childId ?? "");
  const [tab, setTab] = useState<Tab>("today");
  const [view, setView] = useState<CapabilitiesView | null>(null);
  const [mandates, setMandates] = useState<Mandate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; undo?: () => void } | null>(null);
  const [sheet, setSheet] = useState<null | "send" | "pocket" | "reward" | "permission">(null);
  const [celebration, setCelebration] = useState<{ amount: number; line: string } | null>(null);
  const [flying, setFlying] = useState(0);
  const seen = useRef<Map<string, Payment["status"]>>(new Map());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const child = kids.find((k) => k.childId === childId) ?? kids[0];
  const name = child?.displayName || "Your child";

  const load = useCallback(async () => {
    if (!childId) return;
    try {
      const v = await api.capabilities(childId);
      // Money that has just arrived gets its moment.
      for (const p of v.payments ?? []) {
        const before = seen.current.get(p.id);
        if (before && before !== "confirmed" && p.status === "confirmed") setCelebration({ amount: p.amount, line: `It's with ${name} now. I'll help ${name} decide which jar it goes in.` });
        seen.current.set(p.id, p.status);
      }
      setView(v); setError(null);
    } catch (e) { setError(e instanceof ApiError && e.status === 403 ? "You are not a guardian of this child." : e instanceof Error ? e.message : "Something went wrong"); }
    try { setMandates((await api.mandates()).mandates); } catch { setMandates([]); }
  }, [api, childId, name]);

  useEffect(() => { seen.current = new Map(); setView(null); void load(); }, [load]);

  // While money is moving or a bank approval is pending, check back every few seconds.
  const moving = (view?.payments ?? []).some((p) => p.status === "sent" || p.status === "detected") || mandates.some((m) => m.status === "pending");
  useEffect(() => {
    if (!moving) return;
    const t = setInterval(() => { void load(); }, 8000);
    return () => { clearInterval(t); };
  }, [moving, load]);

  const say = (msg: string, undo?: () => void): void => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, ...(undo ? { undo } : {}) });
    toastTimer.current = setTimeout(() => { setToast(null); }, 4200);
  };
  const run = async (key: string, fn: () => Promise<unknown>): Promise<void> => {
    setBusy(key);
    try { const m = await fn(); if (typeof m === "string" && m) say(m); await load(); }
    catch (e) { say(e instanceof Error ? e.message : "Something went wrong"); }
    finally { setBusy(null); }
  };

  const mine = mandates.filter((m) => m.childIds.includes(childId));
  const active = mine.find((m) => m.status === "active");
  const paused = mine.find((m) => m.status === "paused");
  const pending = mine.find((m) => m.status === "pending");
  const how: How = active ? "auto" : "manual";

  /** After a send: animate the coin when Suited moves it, or point to the copy card when the parent does. */
  const afterSend = (p: Payment | undefined): void => {
    if (!p) return;
    if (p.status === "due") { setTab("today"); say(`Copy the details and send ${aed(p.amount)} from your bank`); return; }
    setTab("money"); if (!reduceMotion()) setFlying((n) => n + 1);
    say(`${aed(p.amount)} on its way to ${name}`);
  };

  if (!child) return null;
  const total = view ? (view.account?.balance ?? 0) + (view.jars ?? []).reduce((s, j) => s + j.balance, 0) : 0;

  return (
    <div className="pa">
      <div className="pa-col">
        <main className="pa-main">
          <div className="pa-top">
            <div className="pa-kids" role="group" aria-label="Your children">
              {kids.map((k, i) => (
                <button key={k.childId} type="button" className="pa-kid" aria-pressed={k.childId === childId} onClick={() => { setChildId(k.childId); }}>
                  <span className="pa-av" style={{ background: KID_COLOURS[i % KID_COLOURS.length] }}>{(k.displayName || "?").slice(0, 1).toUpperCase()}</span>{k.displayName || "Your child"}
                </button>
              ))}
            </div>
            <button type="button" className="pa-bell" aria-label="What needs you" onClick={() => { setTab("today"); }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#5E6B63" strokeWidth="2.2" strokeLinecap="round"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0" /></svg>
              {view && decisionsCount(view, how, pending) > 0 ? <i>{decisionsCount(view, how, pending)}</i> : null}
            </button>
          </div>
          {error ? <div className="pa-err">{error}</div> : null}
          {!view && !error ? <div className="pa-card pa-muted">Loading…</div> : null}
          {view && tab === "today" ? <Today view={view} name={name} total={total} how={how} pending={pending} busy={busy} run={run} afterSend={afterSend} say={say} api={api} childId={childId} /> : null}
          {view && tab === "money" ? <Money view={view} name={name} total={total} how={how} paused={!!paused} flying={flying} onSend={() => { setSheet("send"); }} onPocket={() => { setSheet("pocket"); }} /> : null}
          {view && tab === "rewards" ? <Rewards view={view} name={name} busy={busy} onNew={() => { setSheet("reward"); }} onCancel={(id) => void run(`cancel-${id}`, async () => { await api.cancelPledge(childId, id); return "Reward cancelled"; })} /> : null}
          {view && tab === "settings" ? <Settings view={view} name={name} api={api} childId={childId} mine={mine} busy={busy} run={run} onPermission={() => { setSheet("permission"); }} guardianLabel={guardianLabel} onSwitchGuardian={onSwitchGuardian} /> : null}
        </main>
        <nav className="pa-tabs" aria-label="Sections">
          {(["today", "money", "rewards", "settings"] as Tab[]).map((t) => (
            <button key={t} type="button" className="pa-tab" aria-current={tab === t ? "page" : undefined} onClick={() => { setTab(t); window.scrollTo({ top: 0 }); }}>
              <TabIcon t={t} />{t === "today" ? "Today" : t === "money" ? "Money" : t === "rewards" ? "Rewards" : "Settings"}
            </button>
          ))}
        </nav>
      </div>

      {sheet === "send" && view ? <SendSheet name={name} how={how} onClose={() => { setSheet(null); }} onSend={(amount, note) => { setSheet(null); void run("send", async () => { const r = await api.topUp(childId, amount, note || `From ${guardianLabel}`); afterSend(r.payment); }); }} /> : null}
      {sheet === "pocket" && view ? <PocketSheet view={view} onClose={() => { setSheet(null); }} onSave={(amount, d) => { setSheet(null); void run("pocket", async () => { await api.setAllowance(childId, amount, d); return `${aed(amount)} every ${DAYS[d] ?? "week"}`; }); }} onStop={() => { setSheet(null); void run("pocket", async () => { await api.clearAllowance(childId); return "Pocket money stopped"; }); }} /> : null}
      {sheet === "reward" && view ? <RewardSheet view={view} name={name} onClose={() => { setSheet(null); }} onSave={(cap, amount, reward, auto) => { setSheet(null); setTab("rewards"); void run("reward", async () => { const r = await api.pledge(childId, cap, amount, undefined, reward, auto); return `${name} can see it now: ${reward.kind === "promise" ? reward.title : aed(r.pledge.amount)} for ${r.pledge.gateName}`; }); }} /> : null}
      {sheet === "permission" && view ? <PermissionSheet name={name} onClose={() => { setSheet(null); }} onStart={(pp, pw, wk) => { setSheet(null); void run("mandate", async () => { const r = await api.createMandate([childId], pp, pw, wk); window.open(r.mandate.authorisationUrl, "_blank", "noopener"); return "Your bank has opened in a new tab. Approve there, then come back."; }); }} /> : null}

      {toast ? <div className="pa-toast" role="status"><span className="pa-grow">{toast.msg}</span>{toast.undo ? <button type="button" onClick={() => { toast.undo?.(); setToast(null); }}>Undo</button> : null}</div> : null}
      {celebration ? <Celebrate name={name} amount={celebration.amount} line={celebration.line} onClose={() => { setCelebration(null); }} /> : null}
    </div>
  );
}

function decisionsCount(v: CapabilitiesView, how: How, pending: Mandate | undefined): number {
  return (v.pledges ?? []).filter((p) => p.status === "due").length + (v.requests ?? []).filter((r) => r.status === "pending").length + (how === "manual" ? (v.payments ?? []).filter((p) => p.status === "due").length : 0) + (pending ? 1 : 0);
}

/* ───────────── Today ───────────── */

function Today({ view, name, total, how, pending, busy, run, afterSend, say, api, childId }: { view: CapabilitiesView; name: string; total: number; how: How; pending: Mandate | undefined; busy: string | null; run: (k: string, fn: () => Promise<unknown>) => Promise<void>; afterSend: (p: Payment | undefined) => void; say: (m: string, undo?: () => void) => void; api: MoneyApi; childId: string }) {
  const due = (view.pledges ?? []).filter((p) => p.status === "due");
  const asks = (view.requests ?? []).filter((r) => r.status === "pending");
  const toSend = how === "manual" ? (view.payments ?? []).filter((p) => p.status === "due") : [];
  const waiting = (view.payments ?? []).filter((p) => p.status === "sent" && p.parentSaidSentAt);
  const weekAgo = Date.now() - 7 * 86_400_000;
  const inThisWeek = (view.payments ?? []).filter((p) => p.status === "confirmed" && new Date(p.createdAt).getTime() > weekAgo).reduce((s, p) => s + p.amount, 0);
  const saved = (view.jars ?? []).reduce((s, j) => s + j.balance, 0);
  const lessons = view.capabilities.reduce((s, c) => s + (c.progress?.done ?? 0), 0);
  const open = (view.pledges ?? []).filter((p) => p.status === "open");
  const count = due.length + asks.length + toSend.length + (pending ? 1 : 0);
  const capOf = (p: Pledge) => view.capabilities.find((c) => c.capability === p.capability);

  return (
    <div className="pa-stack">
      <div className="pa-hero">
        <div className="lbl">{name}'s money</div>
        <div className="num"><small>AED</small>{total.toLocaleString("en-US", { maximumFractionDigits: 2 })}</div>
        <div className="stats">
          <div className="stat"><b>+{Math.round(inThisWeek)}</b><span>this week</span></div>
          <div className="stat"><b>{Math.round(saved)}</b><span>in jars</span></div>
          <div className="stat"><b>{lessons}</b><span>lessons</span></div>
        </div>
        <div className="pa-trust"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>Bank to bank through a licensed provider · Suited never holds money</div>
      </div>

      <div className="pa-row" style={{ justifyContent: "space-between" }}><span className="pa-eyebrow">{count ? `Your call · ${count}` : "Your call"}</span>{count ? <span className="pa-small">Takes a minute</span> : null}</div>

      {pending ? (
        <article className="pa-decision" style={{ ["--edge" as string]: "#1CB0F6" }}>
          <div className="pa-row" style={{ alignItems: "flex-start" }}><img className="art" src={ART.vault} alt="" />
            <div className="pa-grow"><div className="who">Waiting for your bank</div><div className="what">Finish approving automatic payments</div><div className="why">Up to {aed(pending.limits.maxPerPayment)} a payment, {aed(pending.limits.maxPerWeek)} a week.</div></div></div>
          <div className="acts"><a className="pa-btn" href={pending.authorisationUrl} target="_blank" rel="noreferrer">Approve at my bank</a></div>
        </article>
      ) : null}

      {due.map((p) => (
        <article key={p.id} className="pa-decision" style={{ ["--edge" as string]: "#FFC800" }}>
          <div className="pa-row" style={{ alignItems: "flex-start" }}><img className="art" src={ART.trophy} alt="" />
            <div className="pa-grow"><div className="who">{name} · {p.dueAt ? day(p.dueAt) : "just now"}</div><div className="what">Finished {p.gateName}</div>
              <div className="why">{capOf(p)?.progress ? `${capOf(p)?.progress?.total ?? 0} of ${capOf(p)?.progress?.total ?? 0} lessons. ` : ""}You promised {p.reward?.kind === "promise" ? `"${p.reward.title}"` : aed(p.amount)}.</div></div></div>
          <div className="acts"><button type="button" className="pa-btn block" disabled={busy === p.id} onClick={() => void run(p.id, async () => {
            const r = await api.releasePledge(childId, p.id);
            if (r.pledge.reward?.kind === "promise") return `Kept: ${r.pledge.reward.title}`;
            const pays = (await api.payments(childId)).payments;
            afterSend(pays.find((x) => x.id === r.pledge.paymentId));
          })}>{p.reward?.kind === "promise" ? "Kept it" : how === "manual" ? `I'll send ${aed(p.amount)}` : `Send ${aed(p.amount)}`}</button></div>
        </article>
      ))}

      {asks.map((r) => <AskCard key={r.id} r={r} name={name} busy={busy === r.id} onDecide={(yes, amount) => void run(r.id, async () => {
        const out = await api.decideRequest(childId, r.id, yes, amount);
        if (!yes) { say(`Told ${name} not now`); return; }
        const pays = (await api.payments(childId)).payments;
        afterSend(pays.find((x) => x.id === out.request.paymentId));
      })} />)}

      {toSend.map((p) => (
        <article key={p.id} className="pa-decision" style={{ ["--edge" as string]: "#FF9600" }}>
          <div className="pa-row" style={{ alignItems: "flex-start" }}><img className="art" src={ART.gift} alt="" />
            <div className="pa-grow"><div className="who">Waiting for you</div><div className="what">Send {aed(p.amount)} from your banking app</div><div className="why">{p.description}. Copy the details, pay in your bank, then tap below.</div></div></div>
          {view.payee ? <CopyRow label={`To · ${view.payee.label}`} value={`Account ending ${view.payee.last4}`} copy={view.payee.last4} /> : null}
          <CopyRow label="Amount" value={aed(p.amount)} copy={p.amount.toFixed(2)} />
          <CopyRow label="Reference" value={`Suited ${p.description}`.slice(0, 34)} copy={`Suited ${p.description}`.slice(0, 34)} />
          <div className="acts"><button type="button" className="pa-btn block" disabled={busy === p.id} onClick={() => void run(p.id, async () => { const r = await api.markSent(childId, p.id); return r.payment.status === "confirmed" ? `${name} already said it arrived` : `Thanks. ${name} will confirm when it lands`; })}>I've sent it</button></div>
        </article>
      ))}

      {count === 0 ? (
        <div className="pa-card pa-done"><img src={FRANK} alt="Frank" /><div className="pa-h2">All caught up</div><div className="pa-muted" style={{ marginTop: 4 }}>Nothing needs you right now. We'll tell you when {name} finishes something.</div></div>
      ) : null}

      {waiting.length ? <div className="pa-card"><div className="pa-small">Waiting for {name} to confirm: {waiting.map((p) => aed(p.amount)).join(", ")}</div></div> : null}

      <FrankNote name={name} lessons={lessons} saved={saved} next={open[0]} cap={open[0] ? capOf(open[0]) : undefined} />
      {open.length ? <span className="pa-eyebrow" style={{ marginTop: 6 }}>Learning to earning</span> : null}

      {open.slice(0, 2).map((p) => <LearnCard key={p.id} p={p} cap={capOf(p)} name={name} />)}
    </div>
  );
}

/** Uncle Frank's weekly read on the child: something to be proud of, and what is coming up. Always there, never noisy. */
function FrankNote({ name, lessons, saved, next, cap }: { name: string; lessons: number; saved: number; next: Pledge | undefined; cap: CapabilitiesView["capabilities"][number] | undefined }) {
  const left = cap?.progress ? Math.max(0, cap.progress.total - cap.progress.done) : null;
  const proud = lessons > 0 ? `${name} has finished ${lessons} ${lessons === 1 ? "lesson" : "lessons"}${saved > 0 ? ` and has ${aed(saved)} put away in jars` : ""}.` : `${name} hasn't started a lesson yet. The first one takes about five minutes.`;
  const coming = next && left !== null ? ` ${left === 1 ? "One lesson" : `${left} lessons`} left in ${next.gateName}, then ${next.reward?.kind === "promise" ? "your promise is due" : `${aed(next.amount)} comes ${name}'s way`}.` : next ? ` Next up: ${next.gateName}.` : " Set a reward for what's next and I'll keep cheering.";
  return (
    <div className="pa-frank"><img src={FRANK} alt="Uncle Frank" />
      <div className="bub"><b>Uncle Frank · this week</b><p>{proud}{coming}</p></div>
    </div>
  );
}

function AskCard({ r, name, busy, onDecide }: { r: TopUpRequest; name: string; busy: boolean; onDecide: (yes: boolean, amount?: number) => void }) {
  const base = r.amount ?? 10;
  const options = Array.from(new Set([Math.max(5, base - 5), base, base + 5, base + 10])).sort((a, b) => a - b);
  const [amount, setAmount] = useState<number>(base);
  return (
    <article className="pa-decision" style={{ ["--edge" as string]: "#1CB0F6" }}>
      <div className="pa-row" style={{ alignItems: "flex-start" }}><img className="art" src={ART.metro} alt="" />
        <div className="pa-grow"><div className="who">{name} asked · {day(r.at)}</div><div className="what">"{r.note}"</div><div className="why">{r.amount !== undefined ? `${name} suggested ${aed(r.amount)}. Change it if you like.` : `${name} left the amount to you.`}</div></div></div>
      <div className="pa-amounts" role="group" aria-label="Amount">{options.map((v) => <button key={v} type="button" className="pa-amt" aria-pressed={amount === v} onClick={() => { setAmount(v); }}>{v}</button>)}</div>
      <div className="acts"><button type="button" className="pa-btn" disabled={busy} onClick={() => { onDecide(true, amount); }}>Yes, {aed(amount)}</button><button type="button" className="pa-btn ghost" disabled={busy} onClick={() => { onDecide(false); }}>Not now</button></div>
    </article>
  );
}

function LearnCard({ p, cap, name }: { p: Pledge; cap: CapabilitiesView["capabilities"][number] | undefined; name: string }) {
  const done = cap?.progress?.done ?? 0, totalL = cap?.progress?.total ?? 0;
  const pct = totalL ? Math.round((done / totalL) * 100) : 0;
  return (
    <div className="pa-card"><div className="pa-row">
      <div className="pa-ring" style={{ ["--p" as string]: pct }}><span>{done}/{totalL || "?"}</span></div>
      <div className="pa-grow"><b className="din" style={{ fontSize: 16, display: "block" }}>{p.gateName}</b>
        {totalL ? <div className="pa-lessons">{Array.from({ length: totalL }, (_, i) => <i key={i} className={i < done ? "on" : ""} />)}</div> : null}
        <div className="pa-tag">{p.reward?.kind === "promise" ? `You promised: ${p.reward.title}` : `${aed(p.amount)} when ${name} finishes${p.autoRelease ? ", sent automatically" : ""}`}</div>
      </div></div>
      {totalL ? <div className="pa-muted" style={{ marginTop: 10 }}>{totalL - done === 1 ? "One lesson to go." : `${totalL - done} lessons to go.`}</div> : null}
    </div>
  );
}

function CopyRow({ label, value, copy }: { label: string; value: string; copy: string }) {
  const [done, setDone] = useState(false);
  const go = (): void => {
    const ok = (): void => { setDone(true); setTimeout(() => { setDone(false); }, 1400); };
    try { void navigator.clipboard.writeText(copy).then(ok, ok); } catch { ok(); }
  };
  return <div className="pa-copy"><span><small>{label}</small>{value}</span><button type="button" onClick={go}>{done ? "Copied" : "Copy"}</button></div>;
}

/* ───────────── Money ───────────── */

function Money({ view, name, total, how, paused, flying, onSend, onPocket }: { view: CapabilitiesView; name: string; total: number; how: How; paused: boolean; flying: number; onSend: () => void; onPocket: () => void }) {
  const a = view.allowance ?? null;
  const pays = [...(view.payments ?? [])];
  const jars = [{ id: "spend", name: "Spend", balance: view.account?.balance ?? 0, target: undefined as number | undefined }, ...(view.jars ?? []).map((j) => ({ id: j.id, name: j.name, balance: j.balance, target: j.target }))];
  const max = Math.max(1, ...jars.map((j) => j.target ?? j.balance));
  const coin = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!flying || !coin.current) return;
    // Restart the flight: drop the class, force a reflow, add it back.
    coin.current.classList.remove("go"); coin.current.getBoundingClientRect(); coin.current.classList.add("go");
  }, [flying]);
  const chip = how === "auto" ? ["ok", "Automatic"] : paused ? ["off", "Paused"] : ["wait", "You send it"];
  return (
    <div className="pa-stack">
      <div className="pa-card">
        <div className="pa-row" style={{ justifyContent: "space-between" }}><span className="pa-eyebrow">How money reaches {name}</span><span className={`pa-chip ${chip[0]}`}>{chip[1]}</span></div>
        <div className="pa-flow">
          <div className="pa-node"><div className="bubble" style={{ background: "#17321C" }}>You</div>Your bank</div>
          <div className="pa-track"><div className="pa-coin" ref={coin}>AED</div></div>
          <div className="pa-node"><div className="bubble" style={{ background: "#FF9600" }}>{name.slice(0, 1)}</div>{view.payee ? view.payee.label : `${name}'s account`}</div>
        </div>
        <div className="pa-muted" style={{ textAlign: "center" }}>{how === "auto" ? "Bank to bank, within the limits you approved. Suited never holds it." : `You send from your banking app; ${name} confirms when it lands. Suited never holds it.`}</div>
        <button type="button" className="pa-btn block" style={{ marginTop: 14 }} onClick={onSend}>Send money</button>
      </div>
      <div className="pa-card">
        <div className="pa-row" style={{ justifyContent: "space-between" }}><div className="pa-h2">{name}'s jars</div><b className="din" style={{ fontSize: 18 }}>{aed(total)}</b></div>
        <div className="pa-muted" style={{ marginBottom: 6 }}>{name} decides what goes where. {view.account?.source === "suited-record" ? "Suited's record, not a bank balance." : "Read from the bank."}</div>
        {jars.map((j, i) => {
          const pct = Math.min(100, Math.round((j.balance / (j.target ?? max)) * 100));
          return <div key={j.id} className="pa-jar"><span>{j.name}{j.target ? ` · ${pct}%` : ""}</span><b>{aed(j.balance)}</b><div className="bar"><i style={{ width: `${pct}%`, background: i === 0 ? "#1CB0F6" : JAR_COLOURS[(i - 1) % JAR_COLOURS.length] }} /></div></div>;
        })}
      </div>
      <div className="pa-card"><div className="pa-row">
        <div className="pa-lrow" style={{ padding: 0, border: 0 }}><div className="ic" style={{ background: "#FFF6CC" }}><img src={ART.coins} alt="" /></div></div>
        <div className="pa-grow"><b className="din" style={{ fontSize: 16 }}>Pocket money</b><div className="pa-muted">{a ? `${aed(a.amount)} every ${DAYS[a.dayOfWeek] ?? "week"}${how === "auto" ? ", sent automatically" : ", you send it"}` : "Not set yet"}</div></div>
        <button type="button" className="pa-btn ghost small" onClick={onPocket}>{a ? "Change" : "Set up"}</button></div></div>
      <div className="pa-card">
        <div className="pa-h2" style={{ marginBottom: 4 }}>Payments</div>
        {pays.map((p) => <PayRow key={p.id} p={p} name={name} />)}
        {pays.length === 0 ? <div className="pa-muted" style={{ paddingTop: 8 }}>No payments yet. Pocket money, rewards and anything you send appear here.</div> : null}
      </div>
    </div>
  );
}

function PayRow({ p, name }: { p: Payment; name: string }) {
  const st = p.status === "confirmed" ? ["ok", "Arrived"] : p.status === "failed" ? ["bad", "Didn't go through"] : p.status === "sent" ? (p.parentSaidSentAt ? ["wait", `Waiting for ${name}`] : ["way", "On its way"]) : p.status === "detected" ? ["way", "Seen at your bank"] : ["due", "Due"];
  const art = p.kind === "pledge" ? ART.trophy : p.kind === "allowance" ? ART.coins : ART.gift;
  return (
    <div className="pa-lrow"><div className="ic"><img src={art} alt="" /></div>
      <div className="pa-grow"><b>{p.description}</b><small>{day(p.createdAt)}{p.status === "failed" && p.failureReason ? ` · ${p.failureReason}` : ""}</small></div>
      <div style={{ display: "grid", justifyItems: "end", gap: 4 }}><span className="amt">+{p.amount % 1 ? p.amount.toFixed(2) : p.amount}</span><span className={`pa-chip ${st[0]}`}>{st[1]}</span></div>
    </div>
  );
}

/* ───────────── Rewards ───────────── */

function Rewards({ view, name, busy, onNew, onCancel }: { view: CapabilitiesView; name: string; busy: string | null; onNew: () => void; onCancel: (id: string) => void }) {
  const pledges = (view.pledges ?? []).filter((p) => p.status !== "cancelled");
  const capOf = (p: Pledge) => view.capabilities.find((c) => c.capability === p.capability);
  return (
    <div className="pa-stack">
      <div className="pa-row" style={{ justifyContent: "space-between" }}><h1 className="pa-h1">Rewards</h1><button type="button" className="pa-btn small" onClick={onNew}>New reward</button></div>
      <div className="pa-muted" style={{ marginTop: -6 }}>Promises {name} can see, in your words, for finishing what {name} is learning.</div>
      {pledges.map((p) => {
        const c = capOf(p); const done = c?.progress?.done ?? 0, tot = c?.progress?.total ?? 0;
        const pct = p.status === "open" && tot ? Math.round((done / tot) * 100) : 100;
        return (
          <div key={p.id} className="pa-card"><div className="pa-row">
            <div className="pa-ring" style={{ ["--p" as string]: pct }}><span>{p.status === "open" ? `${done}/${tot || "?"}` : "✓"}</span></div>
            <div className="pa-grow"><b className="din" style={{ fontSize: 16, display: "block" }}>{p.gateName}</b>
              <div className="pa-tag" style={{ marginTop: 4 }}>{p.reward?.kind === "promise" ? p.reward.title : aed(p.amount)}</div>
              <div className="pa-small" style={{ marginTop: 2 }}>{p.status === "paid" ? (p.reward?.kind === "promise" ? "Kept" : "Sent") : p.status === "due" ? "Finished. It's on Today for you" : p.reward?.kind === "promise" ? "You tap Kept it when you've done it" : p.autoRelease ? "Sent automatically when finished" : "You send it with one tap when finished"}</div></div>
            {p.status === "open" ? <button type="button" className="pa-btn ghost small" disabled={busy === `cancel-${p.id}`} onClick={() => { onCancel(p.id); }}>Cancel</button> : null}
          </div></div>
        );
      })}
      {pledges.length === 0 ? <div className="pa-card pa-muted">No rewards yet. Pick something {name} is learning and promise something for finishing it.</div> : null}
    </div>
  );
}

/* ───────────── Settings ───────────── */

function Settings({ view, name, api, childId, mine, busy, run, onPermission, guardianLabel, onSwitchGuardian }: { view: CapabilitiesView; name: string; api: MoneyApi; childId: string; mine: Mandate[]; busy: string | null; run: (k: string, fn: () => Promise<unknown>) => Promise<void>; onPermission: () => void; guardianLabel: string; onSwitchGuardian?: () => void }) {
  const [holder, setHolder] = useState(name);
  const [iban, setIban] = useState("");
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const current = [...mine].reverse().find((m) => m.status === "active" || m.status === "paused" || m.status === "pending");
  const setup = view.setup;
  const consent = view.consent ?? null;
  const until = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return (
    <div className="pa-stack">
      <h1 className="pa-h1">Settings</h1>
      <div className="pa-card">
        <span className="pa-eyebrow">{name}'s account</span>
        {view.payee ? (
          <div className="pa-lrow" style={{ border: 0 }}><div className="ic"><img src={ART.vault} alt="" /></div><div className="pa-grow"><b>{view.payee.label}</b><small>Ending {view.payee.last4} · checked with {name}'s name</small></div><span className="pa-chip ok">Ready</span></div>
        ) : setup?.acceptsAccounts ? (
          <>
            <div className="pa-muted" style={{ marginTop: 6 }}>{name}'s own savings account, so money goes straight to {name}. Suited keeps only the last four digits.</div>
            <div className="pa-field"><label htmlFor="acct-name">Name on the account</label><input id="acct-name" value={holder} onChange={(e) => { setHolder(e.target.value); }} maxLength={70} /></div>
            <div className="pa-field"><label htmlFor="acct-iban">IBAN</label><input id="acct-iban" value={iban} onChange={(e) => { setIban(e.target.value); }} maxLength={40} placeholder="AE07 0331 2345 6789 0123 456" /></div>
            <button type="button" className="pa-btn block" style={{ marginTop: 14 }} disabled={busy === "payee" || !/^[A-Za-z0-9 ]{8,40}$/.test(iban.trim()) || !holder.trim()} onClick={() => void run("payee", async () => { const r = await api.setPayee(childId, iban, holder.trim(), "Savings"); return r.payee ? `${r.payee.label} added, ending ${r.payee.last4}` : "Account added"; })}>Check and add</button>
          </>
        ) : <div className="pa-muted" style={{ marginTop: 6 }}>You send each payment from your own banking app to {name}'s account, and {name} confirms it arrived.</div>}
      </div>

      {setup?.automatic && view.payee ? (
        <div className="pa-card">
          <span className="pa-eyebrow">How payments are sent</span>
          <button type="button" className="pa-choice" aria-pressed={current?.status === "active"} onClick={() => { if (!current) onPermission(); }}>
            <div className="pa-grow"><b>Automatic</b><small>Approve once at your bank. Suited sends pocket money and rewards within your limits.</small></div><span className="pa-chip ok">Recommended</span></button>
          <button type="button" className="pa-choice" aria-pressed={!current || current.status === "paused"} onClick={() => { if (current?.status === "active") void run("mandate", async () => { await api.setMandatePaused(current.id, true); return "You'll send each payment yourself"; }); }}>
            <div className="pa-grow"><b>I'll send it myself</b><small>Copy the details into your banking app. {name} confirms it arrived.</small></div></button>
          {current ? (
            <div className="pa-row" style={{ marginTop: 14 }}>
              <div className="pa-grow"><b className="din" style={{ fontSize: 15 }}>{current.status === "pending" ? "Waiting for your bank" : current.status === "paused" ? "Automatic payments paused" : "Automatic payments on"}</b>
                <div className="pa-small">Up to {aed(current.limits.maxPerPayment)} a payment and {aed(current.limits.maxPerWeek)} a week, until {until(current.limits.endDate)}.{current.status === "active" ? " Cancel for good in your banking app." : ""}</div></div>
              {current.status === "pending" ? <a className="pa-btn small" href={current.authorisationUrl} target="_blank" rel="noreferrer">Approve</a>
                : <button type="button" className="pa-switch" role="switch" aria-checked={current.status === "active"} aria-label="Automatic payments" disabled={busy === "mandate"} onClick={() => void run("mandate", async () => { await api.setMandatePaused(current.id, current.status === "active"); return current.status === "active" ? "Automatic payments paused" : "Automatic payments back on"; })} />}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="pa-card">
        <span className="pa-eyebrow">Learning and money</span>
        <div className="pa-muted" style={{ marginTop: 6 }}>{consent?.withdrawnAt ? `Withdrawn. ${name}'s lessons no longer unlock rewards. What ${name} earned stays earned.` : `You agreed that ${name}'s lessons can unlock rewards you approve. You can take this back any time; what ${name} earned stays earned.`}</div>
        {consent?.withdrawnAt ? <button type="button" className="pa-btn small" style={{ marginTop: 10 }} disabled={busy === "consent"} onClick={() => void run("consent", async () => { await api.setConsent(childId, true); return "Consent given again"; })}>Give consent again</button>
          : !confirmWithdraw ? <button type="button" className="pa-btn danger small" style={{ marginTop: 10 }} onClick={() => { setConfirmWithdraw(true); }}>Withdraw consent</button>
          : <div className="pa-row" style={{ marginTop: 10, gap: 8 }}><button type="button" className="pa-btn danger small" disabled={busy === "consent"} onClick={() => void run("consent", async () => { await api.setConsent(childId, false); setConfirmWithdraw(false); return "Consent withdrawn"; })}>Yes, withdraw</button><button type="button" className="pa-btn ghost small" onClick={() => { setConfirmWithdraw(false); }}>Keep it</button></div>}
      </div>

      <div className="pa-card pa-row"><div className="pa-grow"><b className="din" style={{ fontSize: 15 }}>Signed in</b><div className="pa-small">{guardianLabel}</div></div>{onSwitchGuardian ? <button type="button" className="pa-btn ghost small" onClick={onSwitchGuardian}>Switch</button> : null}</div>
    </div>
  );
}

/* ───────────── Sheets ───────────── */

function Sheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k); return () => { window.removeEventListener("keydown", k); };
  }, [onClose]);
  return <><div className="pa-scrim" onClick={onClose} /><div className="pa-sheet" role="dialog" aria-modal="true"><div className="grab" />{children}</div></>;
}

function SendSheet({ name, how, onClose, onSend }: { name: string; how: How; onClose: () => void; onSend: (amount: number, note: string) => void }) {
  const [amount, setAmount] = useState(20);
  const [note, setNote] = useState("");
  return (
    <Sheet onClose={onClose}>
      <h3>Send to {name}</h3><div className="pa-muted">From your account to {name}'s.</div>
      <div className="pa-bignum"><small>AED</small><span>{amount}</span></div>
      <div className="pa-amounts" style={{ justifyContent: "center" }}>{[10, 20, 50, 100].map((v) => <button key={v} type="button" className="pa-amt" aria-pressed={amount === v} onClick={() => { setAmount(v); }}>{v}</button>)}</div>
      <div className="pa-field"><label htmlFor="send-note">A note {name} sees</label><input id="send-note" maxLength={60} value={note} onChange={(e) => { setNote(e.target.value); }} placeholder="Well done this week" /></div>
      <button type="button" className="pa-btn block" style={{ marginTop: 16 }} onClick={() => { onSend(amount, note.trim()); }}>Send {aed(amount)}</button>
      <div className="pa-note">{how === "auto" ? "Sent under your permission. Your bank shows every payment." : "We'll give you the details to copy into your banking app."}</div>
    </Sheet>
  );
}

function PocketSheet({ view, onClose, onSave, onStop }: { view: CapabilitiesView; onClose: () => void; onSave: (amount: number, day: number) => void; onStop: () => void }) {
  const a = view.allowance ?? null;
  const [amount, setAmount] = useState(a?.amount ?? 20);
  const [d, setD] = useState(a?.dayOfWeek ?? 5);
  return (
    <Sheet onClose={onClose}>
      <h3>Pocket money</h3><div className="pa-muted">Same amount, same day, every week.</div>
      <div className="pa-eyebrow" style={{ marginTop: 14 }}>How much</div>
      <div className="pa-amounts">{[10, 15, 20, 30, 50].map((v) => <button key={v} type="button" className="pa-amt" aria-pressed={amount === v} onClick={() => { setAmount(v); }}>{v}</button>)}</div>
      <div className="pa-eyebrow" style={{ marginTop: 14 }}>Which day</div>
      <div className="pa-amounts">{DAYS.map((x, i) => <button key={x} type="button" className="pa-amt" aria-pressed={d === i} onClick={() => { setD(i); }}>{x.slice(0, 3)}</button>)}</div>
      <button type="button" className="pa-btn block" style={{ marginTop: 18 }} onClick={() => { onSave(amount, d); }}>{aed(amount)} every {DAYS[d]}</button>
      {a ? <button type="button" className="pa-btn danger block" style={{ marginTop: 10 }} onClick={onStop}>Stop pocket money</button> : null}
    </Sheet>
  );
}

function RewardSheet({ view, name, onClose, onSave }: { view: CapabilitiesView; name: string; onClose: () => void; onSave: (capability: string, amount: number, reward: PledgeReward, auto: boolean) => void }) {
  const options = useMemo(() => {
    const taken = new Set((view.pledges ?? []).filter((p) => p.status === "open" || p.status === "due").map((p) => p.capability));
    return view.capabilities.filter((c) => c.state === "Locked" && !taken.has(c.capability));
  }, [view.capabilities, view.pledges]);
  const [cap, setCap] = useState(options[0]?.capability ?? "");
  const [kind, setKind] = useState<"money" | "promise">("money");
  const [amount, setAmount] = useState(30);
  const [auto, setAuto] = useState(false);
  const [promise, setPromise] = useState("");
  const ok = cap !== "" && (kind === "money" ? amount > 0 : promise.trim().length > 0);
  return (
    <Sheet onClose={onClose}>
      <h3>New reward</h3><div className="pa-muted">When {name} finishes…</div>
      {options.length === 0 ? <div className="pa-muted" style={{ marginTop: 12 }}>Everything {name} is learning already has a reward or is finished.</div> : (
        <>
          <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
            {options.slice(0, 5).map((c) => <button key={c.capability} type="button" className="pa-choice" style={{ marginTop: 0 }} aria-pressed={cap === c.capability} onClick={() => { setCap(c.capability); }}><div className="pa-grow"><b>{c.gateName}</b><small>{c.progress ? `${c.progress.done} of ${c.progress.total} lessons done` : "Not started"}</small></div></button>)}
          </div>
          <div className="pa-eyebrow" style={{ marginTop: 14 }}>{name} gets</div>
          <div className="pa-amounts"><button type="button" className="pa-amt" aria-pressed={kind === "money"} onClick={() => { setKind("money"); }}>Money</button><button type="button" className="pa-amt" aria-pressed={kind === "promise"} onClick={() => { setKind("promise"); }}>Something together</button></div>
          {kind === "money" ? (
            <>
              <div className="pa-amounts">{[20, 30, 50, 100].map((v) => <button key={v} type="button" className="pa-amt" aria-pressed={amount === v} onClick={() => { setAmount(v); }}>AED {v}</button>)}</div>
              <div className="pa-row" style={{ marginTop: 14 }}><div className="pa-grow"><b className="din">Send it automatically</b><div className="pa-small">Otherwise you send it with one tap when {name} finishes</div></div><button type="button" className="pa-switch" role="switch" aria-label="Send automatically" aria-checked={auto} onClick={() => { setAuto(!auto); }} /></div>
            </>
          ) : <div className="pa-field"><label htmlFor="promise-text">Your promise</label><input id="promise-text" maxLength={60} value={promise} onChange={(e) => { setPromise(e.target.value); }} placeholder="Pizza night, their pick" /></div>}
          <button type="button" className="pa-btn block" style={{ marginTop: 18 }} disabled={!ok} onClick={() => { onSave(cap, kind === "money" ? amount : 0, kind === "money" ? { kind: "money", destination: "card" } : { kind: "promise", title: promise.trim() }, kind === "money" && auto); }}>{kind === "money" ? `Promise ${aed(amount)}` : "Promise it"}</button>
        </>
      )}
    </Sheet>
  );
}

function PermissionSheet({ name, onClose, onStart }: { name: string; onClose: () => void; onStart: (perPayment: number, perWeek: number, weeks: number) => void }) {
  const [pp, setPp] = useState(100);
  const [pw, setPw] = useState(200);
  const [wk, setWk] = useState(12);
  return (
    <Sheet onClose={onClose}>
      <h3>Send automatically</h3><div className="pa-muted">Approve once at your bank and Suited sends pocket money and rewards to {name} within these limits. Your bank shows every payment.</div>
      <div className="pa-eyebrow" style={{ marginTop: 14 }}>Most per payment</div>
      <div className="pa-amounts">{[50, 100, 200].map((v) => <button key={v} type="button" className="pa-amt" aria-pressed={pp === v} onClick={() => { setPp(v); if (pw < v) setPw(v); }}>AED {v}</button>)}</div>
      <div className="pa-eyebrow" style={{ marginTop: 14 }}>Most per week</div>
      <div className="pa-amounts">{[100, 200, 400].filter((v) => v >= pp).map((v) => <button key={v} type="button" className="pa-amt" aria-pressed={pw === v} onClick={() => { setPw(v); }}>AED {v}</button>)}</div>
      <div className="pa-eyebrow" style={{ marginTop: 14 }}>For</div>
      <div className="pa-amounts">{[4, 12, 26].map((v) => <button key={v} type="button" className="pa-amt" aria-pressed={wk === v} onClick={() => { setWk(v); }}>{v} weeks</button>)}</div>
      <button type="button" className="pa-btn block" style={{ marginTop: 18 }} onClick={() => { onStart(pp, pw, wk); }}>Continue to my bank</button>
      <div className="pa-note">Pause it here any time, or cancel it in your banking app.</div>
    </Sheet>
  );
}

/* ───────────── The moment money lands ───────────── */

function Celebrate({ name, amount, line, onClose }: { name: string; amount: number; line: string; onClose: () => void }) {
  const pieces = useMemo(() => Array.from({ length: reduceMotion() ? 0 : 40 }, (_, i) => ({ left: Math.random() * 100, delay: Math.random() * 0.5, dur: 1.4 + Math.random(), colour: ["#FFC800", "#1CB0F6", "#FF9600", "#CE82FF", "#FFFFFF"][i % 5] })), []);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => { btn.current?.focus(); }, []);
  return (
    <div className="pa-celebrate" role="dialog" aria-label="Money arrived">
      <div className="pa-confetti">{pieces.map((p, i) => <i key={i} style={{ left: `${p.left}%`, background: p.colour, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s` }} />)}</div>
      <div className="inner">
        <img className="coin" src={ART.coins} alt="" />
        <div className="big">{name} got {aed(amount)}</div>
        <div className="pa-says"><img src={FRANK} alt="Frank" /><div className="bub"><b>Frank</b>{line}</div></div>
        <button ref={btn} type="button" className="pa-btn ghost" style={{ marginTop: 8 }} onClick={onClose}>Nice</button>
      </div>
    </div>
  );
}

function TabIcon({ t }: { t: Tab }) {
  const p = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (t === "today") return <svg {...p}><path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" /></svg>;
  if (t === "money") return <svg {...p}><rect x="3" y="6" width="18" height="13" rx="3" /><path d="M3 10h18M16 15h2" /></svg>;
  if (t === "rewards") return <svg {...p}><path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8M10 17h4" /></svg>;
  return <svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12a7 7 0 0 0 .1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6A7 7 0 0 0 19 12z" /></svg>;
}
