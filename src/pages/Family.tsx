/**
 * Suited Money for parents, on the colour pass approved 23 Nov 2026
 * (prototype: claude.ai/artifact/5c2of5yx3DjHyARD4ezQbs). Four tabs and a Give
 * button: Today (the balance, what needs the parent, what happened), Money (how
 * it reaches the child, jars, payments), Rewards (promises and progress),
 * Settings (account, how payments are sent, consent). Every card says whether
 * the child sees it. Every number comes from the Money service; every action is
 * one endpoint in its contract.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, type Bank, type PayeeCheck, type CapabilitiesView, type ChildSummary, type Mandate, type MoneyApi, type Payment, type Pledge, type PledgeReward, type TopUpRequest } from "../api";
import { aed, Amt, Dirham, Txt } from "../dirham";

type Tab = "today" | "money" | "rewards" | "settings";
const ART = { coins: "/money/art/coin-stack.webp", gift: "/money/art/gift.webp", trophy: "/money/art/trophy.webp", jar: "/money/art/jar-coins.webp", vault: "/money/art/vault.webp", piggy: "/money/art/piggy.webp", key: "/money/art/key.webp", metro: "/money/art/metro.webp", padlock: "/money/art/padlock.webp", headphones: "/money/art/headphones.webp" };
const FRANK = "/family/frank.webp";
const KID_COLOURS = ["#FF9600", "#CE82FF", "#1CB0F6", "#58CC02"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const JAR_COLOURS = ["#FF9600", "#CE82FF", "#58CC02", "#FFC800"];
/** Each reward keeps one solid colour wherever it appears (Today, Rewards), picked from its id. */
const PANELS = ["#1CB0F6", "#FF9600", "#CE82FF", "#58CC02", "#2B70C9", "#FFC800"];
const panelFor = (key: string): string => { let h = 0; for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return PANELS[h % PANELS.length] ?? "#1CB0F6"; };
/** The art tile on a colour panel: yellow, unless the panel already is. */
const tileFor = (panel: string): string => (panel === "#FFC800" ? "#1CB0F6" : "#FFC800");
const artFor = (p: Pledge): string => (p.reward?.kind === "promise" ? ART.gift : p.status === "open" ? ART.jar : ART.trophy);
const day = (iso: string): string => {
  const d = new Date(iso); if (Number.isNaN(d.getTime())) return "";
  const a = new Date(); a.setHours(0, 0, 0, 0); const b = new Date(d); b.setHours(0, 0, 0, 0);
  const diff = Math.round((a.getTime() - b.getTime()) / 86_400_000);
  return diff <= 0 ? "Today" : diff === 1 ? "Yesterday" : diff < 7 ? DAYS[b.getDay()] ?? "" : b.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};
const reduceMotion = (): boolean => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** How money reaches this child right now. */
type How = "auto" | "manual";

/** "2 min ago", "3 h ago", "22 Nov": how fresh a bank reading is. */
const ago = (iso: string): string => {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  const min = Math.max(0, Math.round(ms / 60_000));
  return min < 1 ? "just now" : min < 60 ? `${min} min ago` : min < 24 * 60 ? `${Math.round(min / 60)} h ago` : new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

export function Family({ api, kids, guardianLabel, onSwitchGuardian, onConnectChild, focusName }: { api: MoneyApi; kids: ChildSummary[]; guardianLabel: string; onSwitchGuardian?: () => void; onConnectChild?: () => void; focusName?: string }) {
  // Opens on the child just connected, when there is one.
  const [childId, setChildId] = useState<string>((focusName ? kids.find((k) => k.displayName === focusName)?.childId : undefined) ?? kids[0]?.childId ?? "");
  const [tab, setTab] = useState<Tab>("today");
  const [view, setView] = useState<CapabilitiesView | null>(null);
  const [mandates, setMandates] = useState<Mandate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; undo?: () => void } | null>(null);
  const [sheet, setSheet] = useState<null | "give" | "send" | "pocket" | "reward" | "permission">(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<{ amount: number; line: string } | null>(null);
  const [flying, setFlying] = useState(0);
  const seen = useRef<Map<string, Payment["status"]>>(new Map());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const child = kids.find((k) => k.childId === childId) ?? kids[0];
  const name = child?.displayName || "Your child";
  const colour = KID_COLOURS[Math.max(0, kids.findIndex((k) => k.childId === childId)) % KID_COLOURS.length] ?? "#FF9600";

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
  const moving = (view?.payments ?? []).some((p) => p.status === "sent" || p.status === "detected") || mandates.some((m) => m.status === "pending") || view?.bank?.status === "pending";
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
    catch (e) { const m = e instanceof Error && e.message ? e.message : "Something went wrong"; say(m.charAt(0).toUpperCase() + m.slice(1)); }
    finally { setBusy(null); }
  };

  const mine = mandates.filter((m) => m.childIds.includes(childId));
  const active = mine.find((m) => m.status === "active");
  const paused = mine.find((m) => m.status === "paused");
  const pending = mine.find((m) => m.status === "pending");
  const how: How = active ? "auto" : "manual";
  // Automatic payments ended without the parent turning them off (the child's account changed): say so, offer one tap back.
  const stopped = !!view?.setup?.automatic && !!view.payee && !active && !paused && !pending && mine.some((m) => m.status === "ended");

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
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#111A14" strokeWidth="2.2" strokeLinecap="round"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0" /></svg>
              {view && decisionsCount(view, how, pending, stopped) > 0 ? <i>{decisionsCount(view, how, pending, stopped)}</i> : null}
            </button>
          </div>
          {error ? <div className="pa-err">{error}</div> : null}
          {!view && !error ? <div className="pa-card pa-muted">Loading…</div> : null}
          {view && tab === "today" ? <Today view={view} name={name} colour={colour} total={total} how={how} pending={pending} busy={busy} run={run} afterSend={afterSend} say={say} api={api} childId={childId} onSetup={() => { setTab("settings"); window.scrollTo({ top: 0 }); }} stopped={stopped} onReapprove={() => { setSheet("permission"); }} onAllPayments={() => { setTab("money"); window.scrollTo({ top: 0 }); }} /> : null}
          {view && tab === "money" ? <Money view={view} name={name} colour={colour} total={total} how={how} paused={!!paused} flying={flying} onSend={() => { setSheet("send"); }} onPocket={() => { setSheet("pocket"); }} /> : null}
          {view && tab === "rewards" ? <Rewards view={view} name={name} onNew={() => { setSheet("reward"); }} onOpen={setDetail} /> : null}
          {view && tab === "settings" ? <Settings view={view} name={name} api={api} childId={childId} mine={mine} busy={busy} run={run} onPermission={() => { setSheet("permission"); }} guardianLabel={guardianLabel} onSwitchGuardian={onSwitchGuardian} onConnectChild={onConnectChild} /> : null}
        </main>
        <nav className="pa-tabs" aria-label="Sections">
          {(["today", "money", "give", "rewards", "settings"] as const).map((t) => t === "give" ? (
            <div key={t} className="pa-givewrap"><button type="button" className="pa-give" aria-label="Give" disabled={!view} onClick={() => { setSheet("give"); }}><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg></button>Give</div>
          ) : (
            <button key={t} type="button" className="pa-tab" aria-current={tab === t ? "page" : undefined} onClick={() => { setTab(t); window.scrollTo({ top: 0 }); }}>
              <TabIcon t={t} />{t === "today" ? "Today" : t === "money" ? "Money" : t === "rewards" ? "Rewards" : "Settings"}
            </button>
          ))}
        </nav>
      </div>

      {sheet === "give" && view ? <GiveSheet view={view} name={name} how={how} onClose={() => { setSheet(null); }} onPick={(s) => { setSheet(s); }} /> : null}
      {detail && view ? <RewardDetail view={view} name={name} id={detail} guardianLabel={guardianLabel} busy={busy} onClose={() => { setDetail(null); }} onCancel={(id) => { setDetail(null); void run(`cancel-${id}`, async () => { await api.cancelPledge(childId, id); return "Reward cancelled"; }); }} /> : null}
      {sheet === "send" && view ? <SendSheet name={name} how={how} onClose={() => { setSheet(null); }} onSend={(amount, note) => { setSheet(null); void run("send", async () => { const r = await api.topUp(childId, amount, note || `From ${guardianLabel}`); afterSend(r.payment); }); }} /> : null}
      {sheet === "pocket" && view ? <PocketSheet view={view} onClose={() => { setSheet(null); }} onSave={(amount, d) => { setSheet(null); void run("pocket", async () => { await api.setAllowance(childId, amount, d); return `${aed(amount)} every ${DAYS[d] ?? "week"}`; }); }} onStop={() => { setSheet(null); void run("pocket", async () => { await api.clearAllowance(childId); return "Pocket money stopped"; }); }} /> : null}
      {sheet === "reward" && view ? <RewardSheet view={view} name={name} onClose={() => { setSheet(null); }} onSave={(cap, amount, reward, auto) => { setSheet(null); setTab("rewards"); void run("reward", async () => { const r = await api.pledge(childId, cap, amount, undefined, reward, auto); return `${name} can see it now: ${reward.kind === "promise" ? reward.title : aed(r.pledge.amount)} for ${r.pledge.gateName}`; }); }} /> : null}
      {sheet === "permission" && view ? <PermissionSheet name={name} onClose={() => { setSheet(null); }} onStart={(pp, pw, wk) => { setSheet(null); void run("mandate", async () => { const r = await api.createMandate([childId], pp, pw, wk); window.open(r.mandate.authorisationUrl, "_blank", "noopener"); return "Your bank has opened in a new tab. Approve there, then come back."; }); }} /> : null}

      {toast ? <div className="pa-toast" role="status"><span className="pa-grow"><Txt s={toast.msg} /></span>{toast.undo ? <button type="button" onClick={() => { toast.undo?.(); setToast(null); }}>Undo</button> : null}</div> : null}
      {celebration ? <Celebrate name={name} amount={celebration.amount} line={celebration.line} onClose={() => { setCelebration(null); }} /> : null}
    </div>
  );
}

/** The child's account is the first step whenever the payments side can take one and none is added yet. */
const needsAccount = (v: CapabilitiesView): boolean => !!v.setup?.acceptsAccounts && !v.payee;

function decisionsCount(v: CapabilitiesView, how: How, pending: Mandate | undefined, stopped = false): number {
  return (needsAccount(v) ? 1 : 0) + (stopped ? 1 : 0) + (v.pledges ?? []).filter((p) => p.status === "due").length + (v.requests ?? []).filter((r) => r.status === "pending").length + (how === "manual" ? (v.payments ?? []).filter((p) => p.status === "due").length : 0) + (pending ? 1 : 0);
}

/* ───────────── Today ───────────── */

const Eye = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>;
const Lock = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>;

/** Who sees a card: the child, or only the parent. Then when, then anything on the right. */
function Seen({ name, child, when, end }: { name: string; child: boolean; when?: string; end?: React.ReactNode }) {
  return <div className="pa-meta">{child ? <Eye /> : <Lock />}{child ? `${name} sees this` : "Only you"}{when ? ` · ${when}` : ""}{end ? <span className="end">{end}</span> : null}</div>;
}

/** A colour panel: the art on a tilted tile, the thread's progress on a tilted card. */
function Panel({ colour, art, title, line, done, total, height }: { colour: string; art: string; title: string; line: string; done: number; total: number; height?: number }) {
  return (
    <div className="pa-panel" style={{ background: colour, ...(height ? { height } : {}) }} aria-hidden="true">
      <div className="pa-tile art" style={{ background: tileFor(colour) }}><img src={art} alt="" /></div>
      <div className="pa-tile card"><b>{title}</b><small>{line}</small>{total ? <div className="pa-dots">{Array.from({ length: Math.min(total, 12) }, (_, i) => <i key={i} className={i < Math.round((done / total) * Math.min(total, 12)) ? "on" : ""} />)}</div> : null}</div>
    </div>
  );
}

function Today({ view, name, colour, total, how, pending, busy, run, afterSend, say, api, childId, onSetup, stopped, onReapprove, onAllPayments }: { view: CapabilitiesView; name: string; colour: string; total: number; how: How; pending: Mandate | undefined; busy: string | null; run: (k: string, fn: () => Promise<unknown>) => Promise<void>; afterSend: (p: Payment | undefined) => void; say: (m: string, undo?: () => void) => void; api: MoneyApi; childId: string; onSetup: () => void; stopped: boolean; onReapprove: () => void; onAllPayments: () => void }) {
  // Reading the child's own account (the one money is sent to): money landing is spotted, nobody needs to confirm.
  const reading = view.bank?.status === "active" && !!view.bank.balance && view.bank.matchesAccount !== false;
  const due = (view.pledges ?? []).filter((p) => p.status === "due");
  const asks = (view.requests ?? []).filter((r) => r.status === "pending");
  const toSend = how === "manual" ? (view.payments ?? []).filter((p) => p.status === "due") : [];
  const waiting = (view.payments ?? []).filter((p) => p.status === "sent" && p.parentSaidSentAt);
  const recent = [...(view.payments ?? [])].filter((p) => p.status !== "due").sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 3);
  const weekAgo = Date.now() - 7 * 86_400_000;
  const inThisWeek = (view.payments ?? []).filter((p) => p.status === "confirmed" && new Date(p.createdAt).getTime() > weekAgo).reduce((s, p) => s + p.amount, 0);
  const saved = (view.jars ?? []).reduce((s, j) => s + j.balance, 0);
  const lessons = view.capabilities.reduce((s, c) => s + (c.progress?.done ?? 0), 0);
  const open = (view.pledges ?? []).filter((p) => p.status === "open");
  const setupStep = needsAccount(view);
  const count = (setupStep ? 1 : 0) + (stopped ? 1 : 0) + due.length + asks.length + toSend.length + (pending ? 1 : 0);
  const capOf = (p: Pledge) => view.capabilities.find((c) => c.capability === p.capability);

  return (
    <div className="pa-stack">
      <div className="pa-hero">
        <img className="art" src={ART.coins} alt="" />
        <div className="lbl">{reading && view.bank?.balance ? `In ${name}'s bank account · ${ago(view.bank.balance.asOf)}` : `${name}'s money`}</div>
        <div className="num"><Amt n={reading && view.bank?.balance ? view.bank.balance.amount : total} /></div>
        <div className="pills">
          <span className="pill"><Amt n={Math.round(inThisWeek)} plus />&nbsp;this week</span>
          <span className="pill"><Amt n={Math.round(saved)} />&nbsp;saved</span>
          <span className="pill">{lessons} {lessons === 1 ? "lesson" : "lessons"}</span>
        </div>
        <div className="pa-trust"><Lock />Bank to bank · Suited never holds money</div>
      </div>

      <div className="pa-section"><span>{count ? `Your call · ${count}` : "Your call"}</span>{count ? <small>Takes a minute</small> : null}</div>

      {stopped ? (
        <article className="pa-post">
          <Seen name={name} child={false} end={<span className="pa-chip due">Stopped</span>} />
          <div className="pa-say">Approve {name}'s new account <em>at your bank</em></div>
          <div className="pa-why">{name}'s account changed, so your bank needs to approve sending to the new one. Until then, you send payments yourself.</div>
          <div className="pa-acts"><button type="button" className="pa-btn" onClick={onReapprove}>Turn back on</button></div>
        </article>
      ) : null}

      {setupStep ? (
        <article className="pa-post">
          <Seen name={name} child={false} when="First step" />
          <div className="pa-say">Add {name}'s account</div>
          <div className="pa-why">{name}'s own savings account at your bank, so pocket money and rewards go straight to {name}. Takes a minute.</div>
          <div className="pa-acts"><button type="button" className="pa-btn" onClick={onSetup}>Add {name}'s account</button></div>
        </article>
      ) : null}

      {pending ? (
        <article className="pa-post">
          <Seen name={name} child={false} when="Waiting for your bank" />
          <div className="pa-say">Finish approving <em>automatic payments</em></div>
          <div className="pa-why"><Txt s={`Up to ${aed(pending.limits.maxPerPayment)} a payment, ${aed(pending.limits.maxPerWeek)} a week.`} /></div>
          <div className="pa-acts"><a className="pa-btn grow" href={pending.authorisationUrl} target="_blank" rel="noreferrer">Approve at my bank</a>
            <button type="button" className="pa-btn ghost" disabled={busy === "mandate"} onClick={() => void run("mandate", async () => { await api.cancelMandate(pending.id); return "Cancelled. Check the account in Settings, then try again"; })}>Cancel</button></div>
          <div className="pa-small" style={{ marginTop: 10 }}>Bank couldn't find the account? Cancel, check {name}'s account in Settings, and start again.</div>
        </article>
      ) : null}

      {due.map((p) => {
        const c = capOf(p); const tot = c?.progress?.total ?? 0;
        const colour = panelFor(p.capability);
        return (
          <article key={p.id} className="pa-post">
            <Seen name={name} child when={p.dueAt ? day(p.dueAt) : "just now"} />
            <div className="pa-say"><span className="pa-av sm" style={{ background: colour }}>{name.slice(0, 1).toUpperCase()}</span>{name} <em>finished</em> {p.gateName} <em>· you promised</em> {p.reward?.kind === "promise" ? `“${p.reward.title}”` : <Amt n={p.amount} />}</div>
            <Panel colour={colour} art={ART.trophy} title={p.gateName} line={tot ? `${tot} of ${tot} lessons` : "Finished"} done={tot} total={tot} />
            <div className="pa-acts"><button type="button" className="pa-btn" disabled={busy === p.id} onClick={() => void run(p.id, async () => {
              const r = await api.releasePledge(childId, p.id);
              if (r.pledge.reward?.kind === "promise") return `Kept: ${r.pledge.reward.title}`;
              const pays = (await api.payments(childId)).payments;
              afterSend(pays.find((x) => x.id === r.pledge.paymentId));
            })}>{p.reward?.kind === "promise" ? "Kept it" : how === "manual" ? <>I'll send <Amt n={p.amount} /></> : <>Send <Amt n={p.amount} /></>}</button></div>
          </article>
        );
      })}

      {asks.map((r) => <AskCard key={r.id} r={r} name={name} colour={colour} busy={busy === r.id} onDecide={(yes, amount) => void run(r.id, async () => {
        const out = await api.decideRequest(childId, r.id, yes, amount);
        if (!yes) { say(`Told ${name} not now`); return; }
        const pays = (await api.payments(childId)).payments;
        afterSend(pays.find((x) => x.id === out.request.paymentId));
      })} />)}

      {toSend.map((p) => (
        <article key={p.id} className="pa-post">
          <Seen name={name} child={false} when="Waiting for you" />
          <div className="pa-say">Send <Amt n={p.amount} /> <em>from your banking app</em></div>
          <div className="pa-why">{p.description}. Copy the details, pay in your bank, then tap below.</div>
          {view.payee ? <CopyRow label={`To · ${view.payee.label}`} value={`Account ending ${view.payee.last4}`} copy={view.payee.last4} /> : null}
          <CopyRow label="Amount" value={aed(p.amount)} copy={p.amount.toFixed(2)} />
          <CopyRow label="Reference" value={`Suited ${p.description}`.slice(0, 34)} copy={`Suited ${p.description}`.slice(0, 34)} />
          <div className="pa-acts"><button type="button" className="pa-btn block" disabled={busy === p.id} onClick={() => void run(p.id, async () => { const r = await api.markSent(childId, p.id); return r.payment.status === "confirmed" ? `${name} already said it arrived` : `Thanks. ${name} will confirm when it lands`; })}>I've sent it</button></div>
        </article>
      ))}

      {count === 0 ? (
        <div className="pa-card pa-done"><img src={FRANK} alt="Frank" /><div className="pa-h2">All caught up</div><div className="pa-muted" style={{ marginTop: 4 }}>Nothing needs you right now. We'll tell you when {name} finishes something.</div></div>
      ) : null}

      {waiting.length ? <div className="pa-card"><div className="pa-small"><Txt s={`${reading ? `Waiting for it to land in ${name}'s account` : `Waiting for ${name} to confirm`}: ${waiting.map((p) => aed(p.amount)).join(", ")}`} /></div></div> : null}

      <FrankNote name={name} lessons={lessons} saved={saved} next={open[0]} cap={open[0] ? capOf(open[0]) : undefined} />

      {open.length ? <div className="pa-section"><span>Learning to earning</span></div> : null}
      {open.slice(0, 2).map((p) => <LearnCard key={p.id} p={p} cap={capOf(p)} name={name} />)}

      {recent.length ? <div className="pa-section"><span>Recent</span><button type="button" onClick={onAllPayments}>See all</button></div> : null}
      {recent.map((p) => <RecentPost key={p.id} p={p} name={name} />)}
    </div>
  );
}

/** One payment as a sentence: "You sent Maya ⃃30 pocket money". */
function RecentPost({ p, name }: { p: Payment; name: string }) {
  const st = payState(p, name);
  const gate = /^Pledge kept: (.*) done$/.exec(p.description)?.[1];
  const note = p.kind === "ask" ? p.description.replace(/^Top-up from [^:]*:\s*/, "") : p.description;
  return (
    <div className="pa-post quiet">
      <Seen name={name} child when={day(p.createdAt)} end={<span className={`pa-chip ${st[0]}`}>{st[1]}</span>} />
      <div className="pa-say">
        {p.kind === "allowance" ? <>You <em>sent</em> {name} <Amt n={p.amount} /> <em>pocket money</em></>
          : p.kind === "pledge" ? <>You <em>sent</em> <Amt n={p.amount} /> <em>for finishing</em> {gate ?? "a reward"}</>
          : p.kind === "ask" ? <>You <em>said yes to</em> <Amt n={p.amount} /> <em>for</em> {note}</>
          : <>You <em>sent</em> {name} <Amt n={p.amount} />{note && !/^From /.test(note) ? <> <em>·</em> {note}</> : null}</>}
      </div>
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
      <div className="bub"><b>Uncle Frank · this week</b><p><Txt s={proud + coming} /></p></div>
    </div>
  );
}

function AskCard({ r, name, colour, busy, onDecide }: { r: TopUpRequest; name: string; colour: string; busy: boolean; onDecide: (yes: boolean, amount?: number) => void }) {
  const base = r.amount ?? 10;
  const options = Array.from(new Set([Math.max(5, base - 5), base, base + 5, base + 10])).sort((a, b) => a - b);
  const [amount, setAmount] = useState<number>(base);
  return (
    <article className="pa-post">
      <Seen name={name} child when={day(r.at)} />
      <div className="pa-say"><span className="pa-av sm" style={{ background: colour }}>{name.slice(0, 1).toUpperCase()}</span>{name} <em>asked for</em> {r.amount !== undefined ? <Amt n={r.amount} /> : "money"} <em>for</em> {r.note}</div>
      <div className="pa-why">{r.amount !== undefined ? "Change the amount if you like." : `${name} left the amount to you.`}</div>
      <div className="pa-amounts" role="group" aria-label="Amount">{options.map((v) => <button key={v} type="button" className="pa-amt" aria-pressed={amount === v} onClick={() => { setAmount(v); }}>{v}</button>)}</div>
      <div className="pa-acts"><button type="button" className="pa-btn grow" disabled={busy} onClick={() => { onDecide(true, amount); }}>Yes, <Amt n={amount} /></button><button type="button" className="pa-btn ghost" disabled={busy} onClick={() => { onDecide(false); }}>Not now</button></div>
    </article>
  );
}

/** A reward in progress: what the child can see, with the thread's progress on a colour panel. */
function LearnCard({ p, cap, name }: { p: Pledge; cap: CapabilitiesView["capabilities"][number] | undefined; name: string }) {
  const done = cap?.progress?.done ?? 0, totalL = cap?.progress?.total ?? 0;
  const left = totalL - done;
  return (
    <article className="pa-post">
      <Seen name={name} child when={`set ${day(p.madeAt).toLowerCase() === "today" ? "today" : day(p.madeAt)}`} />
      <div className="pa-say">{p.reward?.kind === "promise" ? `“${p.reward.title}”` : <Amt n={p.amount} />} <em>when {name} finishes</em> {p.gateName}</div>
      <Panel colour={panelFor(p.capability)} art={artFor(p)} title={p.gateName} line={totalL ? `${done} of ${totalL} lessons` : "Not started"} done={done} total={totalL} height={136} />
      <div className="pa-why">{totalL ? (left === 1 ? "One lesson to go." : `${left} lessons to go.`) : ""}{p.reward?.kind === "promise" ? " You tap Kept it when you've done it." : p.autoRelease ? " Sent automatically when it's done." : " You send it with one tap when it's done."}</div>
    </article>
  );
}

function CopyRow({ label, value, copy }: { label: string; value: string; copy: string }) {
  const [done, setDone] = useState(false);
  const go = (): void => {
    const ok = (): void => { setDone(true); setTimeout(() => { setDone(false); }, 1400); };
    try { void navigator.clipboard.writeText(copy).then(ok, ok); } catch { ok(); }
  };
  return <div className="pa-copy"><span><small>{label}</small><Txt s={value} /></span><button type="button" onClick={go}>{done ? "Copied" : "Copy"}</button></div>;
}

/* ───────────── Money ───────────── */

function Money({ view, name, colour, total, how, paused, flying, onSend, onPocket }: { view: CapabilitiesView; name: string; colour: string; total: number; how: How; paused: boolean; flying: number; onSend: () => void; onPocket: () => void }) {
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
      <h1 className="pa-h1" style={{ padding: "4px 4px 0" }}>Money</h1>
      <div className="pa-card">
        <div className="pa-row" style={{ justifyContent: "space-between" }}><span className="pa-eyebrow">How money reaches {name}</span><span className={`pa-chip ${chip[0]}`}>{chip[1]}</span></div>
        <div className="pa-flow">
          <div className="pa-node"><div className="bubble" style={{ background: "#111A14" }}>You</div>Your bank</div>
          <div className="pa-track"><div className="pa-coin" ref={coin}><Dirham /></div></div>
          <div className="pa-node"><div className="bubble" style={{ background: colour }}>{name.slice(0, 1)}</div>{view.payee ? view.payee.label : `${name}'s account`}</div>
        </div>
        <div className="pa-muted" style={{ textAlign: "center" }}>{how === "auto" ? "Bank to bank, within the limits you approved. Suited never holds it." : `You send from your banking app; ${name} confirms when it lands. Suited never holds it.`}</div>
        <button type="button" className="pa-btn block" style={{ marginTop: 14 }} onClick={onSend}>Send money</button>
      </div>
      <div className="pa-card">
        <div className="pa-row" style={{ justifyContent: "space-between" }}><div className="pa-h2">{name}'s jars</div><b className="din" style={{ fontSize: 18 }}><Amt n={total} /></b></div>
        <div className="pa-muted" style={{ marginBottom: 6 }}>{name} decides what goes where. {view.account?.source === "suited-record" ? "Suited's record, not a bank balance." : "Read from the bank."}</div>
        {jars.map((j, i) => {
          const pct = Math.min(100, Math.round((j.balance / (j.target ?? max)) * 100));
          return <div key={j.id} className="pa-jar"><span>{j.name}{j.target ? ` · ${pct}%` : ""}</span><b><Amt n={j.balance} /></b><div className="bar"><i style={{ width: `${pct}%`, background: i === 0 ? "#1CB0F6" : JAR_COLOURS[(i - 1) % JAR_COLOURS.length] }} /></div></div>;
        })}
      </div>
      <div className="pa-card"><div className="pa-row">
        <div className="pa-lrow" style={{ padding: 0, border: 0 }}><div className="ic" style={{ background: "#FFC800" }}><img src={ART.coins} alt="" /></div></div>
        <div className="pa-grow"><b className="din" style={{ fontSize: 16 }}>Pocket money</b><div className="pa-muted">{a ? <Txt s={`${aed(a.amount)} every ${DAYS[a.dayOfWeek] ?? "week"}${how === "auto" ? ", sent automatically" : ", you send it"}`} /> : "Not set yet"}</div></div>
        <button type="button" className="pa-btn ghost small" onClick={onPocket}>{a ? "Change" : "Set up"}</button></div></div>
      <div className="pa-card">
        <div className="pa-h2" style={{ marginBottom: 4 }}>Payments</div>
        {pays.map((p) => <PayRow key={p.id} p={p} name={name} />)}
        {pays.length === 0 ? <div className="pa-muted" style={{ paddingTop: 8 }}>No payments yet. Pocket money, rewards and anything you send appear here.</div> : null}
      </div>
    </div>
  );
}

/** The parent's words for where a payment is, and its chip colour. */
function payState(p: Payment, name: string): [string, string] {
  return p.status === "confirmed" ? ["ok", "Arrived"] : p.status === "failed" ? ["bad", "Didn't go through"] : p.status === "sent" ? (p.parentSaidSentAt ? ["wait", `Waiting for ${name}`] : ["way", "On its way"]) : p.status === "detected" ? ["way", "Seen at your bank"] : ["due", "Due"];
}

function PayRow({ p, name }: { p: Payment; name: string }) {
  const st = payState(p, name);
  const [art, bg] = p.kind === "pledge" ? [ART.trophy, "#FFC800"] : p.kind === "allowance" ? [ART.coins, "#58CC02"] : [ART.gift, "#1CB0F6"];
  return (
    <div className="pa-lrow"><div className="ic" style={{ background: bg }}><img src={art} alt="" /></div>
      <div className="pa-grow"><b>{p.description}</b><small>{day(p.createdAt)}{p.status === "failed" && p.failureReason ? ` · ${p.failureReason}` : ""}</small></div>
      <div style={{ display: "grid", justifyItems: "end", gap: 4 }}><span className="amt"><Amt n={p.amount} plus /></span><span className={`pa-chip ${st[0]}`}>{st[1]}</span></div>
    </div>
  );
}

/* ───────────── Rewards ───────────── */

/** The reward itself, set apart from what it's for: a green pill for money, a yellow one for a promise. */
function Prize({ p }: { p: Pledge }) {
  const promise = p.reward?.kind === "promise";
  return (
    <span className={`pa-prize ${promise ? "promise" : "money"}`}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="8" width="18" height="5" rx="1" /><path d="M5 13v7h14v-7M12 8v12M12 8S10.5 3.5 8 4.5 9 8 12 8zm0 0s1.5-4.5 4-3.5S15 8 12 8z" /></svg>
      <span className="t">{promise && p.reward?.kind === "promise" ? p.reward.title : <Amt n={p.amount} />}</span>
    </span>
  );
}

/** "Sent automatically when finished", or what happens next for this reward. */
function rewardLine(p: Pledge): string {
  return p.status === "paid" ? (p.reward?.kind === "promise" ? "Kept" : "Sent") : p.status === "due" ? "Finished. It's on Today for you" : p.reward?.kind === "promise" ? "You tap Kept it when you've done it" : p.autoRelease ? "Sent automatically when finished" : "You send it with one tap when finished";
}

function Rewards({ view, name, onNew, onOpen }: { view: CapabilitiesView; name: string; onNew: () => void; onOpen: (id: string) => void }) {
  const all = (view.pledges ?? []).filter((p) => p.status !== "cancelled");
  const working = all.filter((p) => p.status === "open" || p.status === "due");
  const finished = all.filter((p) => p.status === "paid");
  const [seg, setSeg] = useState<"working" | "finished">("working");
  const list = seg === "working" ? working : finished;
  const capOf = (p: Pledge) => view.capabilities.find((c) => c.capability === p.capability);
  return (
    <div className="pa-stack">
      <div className="pa-row" style={{ justifyContent: "space-between", padding: "4px 4px 0" }}><h1 className="pa-h1">Rewards</h1><button type="button" className="pa-btn small" onClick={onNew}>New reward</button></div>
      {all.length ? (
        <div className="pa-segs" role="group" aria-label="Show">
          <button type="button" className="pa-seg" aria-pressed={seg === "working"} onClick={() => { setSeg("working"); }}>Working on · {working.length}</button>
          <button type="button" className="pa-seg" aria-pressed={seg === "finished"} onClick={() => { setSeg("finished"); }}>Finished · {finished.length}</button>
        </div>
      ) : null}
      {list.map((p) => {
        const c = capOf(p); const done = c?.progress?.done ?? 0, tot = c?.progress?.total ?? 0;
        return (
          <button key={p.id} type="button" className="pa-reward" onClick={() => { onOpen(p.id); }}>
            <div className="sw" style={{ background: panelFor(p.capability) }}><img src={artFor(p)} alt="" /><span>{p.status === "open" ? `${done}/${tot || "?"}` : "✓"}</span></div>
            <div className="pa-grow"><div className="pa-say">{p.gateName}</div><Prize p={p} /><small>{rewardLine(p)}</small></div>
            <svg className="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>
          </button>
        );
      })}
      {all.length === 0 ? <div className="pa-card pa-muted">No rewards yet. Pick something {name} is learning and promise something for finishing it.</div>
        : list.length === 0 ? <div className="pa-card pa-muted">{seg === "working" ? `Nothing in progress. Tap New reward to give ${name} something to work towards.` : "Nothing finished yet. Kept promises and sent rewards show up here."}</div> : null}
      {working.length > 0 ? <div className="pa-frank" style={{ marginTop: 4 }}><img src={FRANK} alt="Uncle Frank" /><div className="bub"><b>Tip from Frank</b><p>One reward per subject works best. Too many at once and none of them feel special.</p></div></div> : null}
    </div>
  );
}

/** One reward, as the child sees it, with the parent's way out while it's still open. */
function RewardDetail({ view, name, id, guardianLabel, busy, onClose, onCancel }: { view: CapabilitiesView; name: string; id: string; guardianLabel: string; busy: string | null; onClose: () => void; onCancel: (id: string) => void }) {
  const p = (view.pledges ?? []).find((x) => x.id === id);
  if (!p) return null;
  const c = view.capabilities.find((x) => x.capability === p.capability);
  const done = c?.progress?.done ?? 0, tot = c?.progress?.total ?? 0;
  const who = guardianLabel.includes("@") ? "You" : guardianLabel;
  return (
    <Sheet onClose={onClose}>
      <h3 className="c">What {name} sees</h3>
      <div className="pa-muted c">In {name}'s Money tab</div>
      <div className="pa-kidcard">
        <div className="e">{who} promised</div>
        <div className="n">{p.reward?.kind === "promise" ? p.reward.title : <Amt n={p.amount} />}</div>
        <div className="w">when you finish {p.gateName}{tot ? ` · ${done} of ${tot}` : ""}</div>
        {tot ? <div className="pa-dots">{Array.from({ length: Math.min(tot, 12) }, (_, i) => <i key={i} className={i < Math.round((done / tot) * Math.min(tot, 12)) ? "on" : ""} />)}</div> : null}
      </div>
      <div className="pa-muted c">{rewardLine(p)}.</div>
      {p.status === "open" ? <button type="button" className="pa-btn danger block" style={{ marginTop: 16 }} disabled={busy === `cancel-${p.id}`} onClick={() => { onCancel(p.id); }}>Cancel this reward</button> : null}
      <button type="button" className="pa-btn ghost block" style={{ marginTop: 8 }} onClick={onClose}>Done</button>
    </Sheet>
  );
}

/* ───────────── Settings ───────────── */

/**
 * The child's real balance: read-only access at the child's bank, approved once by the account holder.
 * Suited can never move money with it. Shows the balance on Today and spots money landing.
 */
function BankBalance({ view, name, api, childId, busy, run }: { view: CapabilitiesView; name: string; api: MoneyApi; childId: string; busy: string | null; run: (k: string, fn: () => Promise<unknown>) => Promise<void> }) {
  const [banks, setBanks] = useState<Bank[] | null>(null);
  const [bankId, setBankId] = useState("");
  const [open, setOpen] = useState(false);
  const bank = view.bank ?? null;
  const live = bank && (bank.status === "active" || bank.status === "pending");
  useEffect(() => {
    if (!open || banks) return;
    void api.banks().then((r) => { setBanks(r.banks); if (r.banks.length === 1 && r.banks[0]) setBankId(r.banks[0].id); }).catch(() => { setBanks([]); });
  }, [open, banks, api]);
  const until = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");
  return (
    <div className="pa-card">
      <span className="pa-eyebrow">{name}'s real balance</span>
      {bank?.status === "active" && bank.matchesAccount === false && !open ? (
        <>
          <div className="pa-check warn"><b>We're looking at the wrong account</b><span>We send {name}'s money to the account ending {view.payee?.last4}, but when you approved at your bank you let us see the account ending {bank.balance?.last4 ?? "in other digits"}. Payments still work. To show {name}'s real balance, approve again and tick the account ending {view.payee?.last4}.</span></div>
          <div className="pa-row" style={{ gap: 8, marginTop: 12 }}>
            <button type="button" className="pa-btn small" onClick={() => { setOpen(true); }}>Share the right account</button>
            <button type="button" className="pa-btn ghost small" disabled={busy === "bank"} onClick={() => void run("bank", async () => { await api.stopBankRead(childId); return `Stopped reading. Remove the access for good in your banking app.`; })}>Stop reading</button>
          </div>
        </>
      ) : bank?.status === "active" ? (
        <>
          <div className="pa-row" style={{ marginTop: 8 }}>
            <div className="pa-grow"><b className="din" style={{ fontSize: 15 }}>{bank.balance ? <Amt n={bank.balance.amount} /> : "Reading…"}</b>
              <div className="pa-small">{bank.bankName ?? "Bank"}{bank.balance ? ` · ending ${bank.balance.last4} · ${ago(bank.balance.asOf)}` : ""}{bank.expiresAt ? ` · until ${until(bank.expiresAt)}` : ""}</div></div>
            <span className="pa-chip ok">Read-only</span>
          </div>
          <button type="button" className="pa-btn ghost small" style={{ marginTop: 12 }} disabled={busy === "bank"} onClick={() => void run("bank", async () => { await api.stopBankRead(childId); return `Stopped reading ${name}'s balance. Remove the access for good in your banking app.`; })}>Stop reading</button>
        </>
      ) : bank?.status === "pending" && !open ? (
        <>
          <div className="pa-muted" style={{ marginTop: 6 }}>Waiting for {name}'s bank. Approve in the tab that opened; this updates by itself.</div>
          <button type="button" className="pa-btn ghost small" style={{ marginTop: 10 }} onClick={() => { setOpen(true); }}>Start again</button>
        </>
      ) : !open ? (
        <>
          <div className="pa-muted" style={{ marginTop: 6 }}>Show {name}'s real bank balance here and in {name}'s app, and know the moment money lands, with nothing to check. Read-only: Suited can never move money with it.</div>
          <button type="button" className="pa-btn block" style={{ marginTop: 12 }} onClick={() => { setOpen(true); }}>Connect {name}'s bank</button>
        </>
      ) : (
        <>
          <div className="pa-muted" style={{ marginTop: 6 }}>Choose {name}'s bank. You'll approve read-only access there, once.</div>
          <div className="pa-banks" role="radiogroup" aria-label="Bank">
            {banks === null ? <div className="pa-small">Loading banks…</div> : banks.length === 0 ? <div className="pa-small">No banks are available right now.</div>
              : banks.map((b) => <button key={b.id} type="button" role="radio" aria-checked={bankId === b.id} className="pa-choice" onClick={() => { setBankId(b.id); }}><div className="pa-grow"><b>{b.name}</b></div></button>)}
          </div>
          <div className="pa-small" style={{ marginTop: 10 }}>Your bank receives the email you signed in to Suited with, so it knows the request is yours. Nothing else about you or {name}.</div>
          <button type="button" className="pa-btn block" style={{ marginTop: 14 }} disabled={busy === "bank" || !bankId} onClick={() => void run("bank", async () => {
            const r = await api.connectBankRead(childId, bankId);
            setOpen(false);
            window.open(r.authorisationUrl, "_blank", "noopener");
            return "Your bank has opened in a new tab. Approve read-only access there.";
          })}>Continue to the bank</button>
          {live ? null : <button type="button" className="pa-btn ghost block" style={{ marginTop: 8 }} onClick={() => { setOpen(false); }}>Not now</button>}
        </>
      )}
    </div>
  );
}

function Settings({ view, name, api, childId, mine, busy, run, onPermission, guardianLabel, onSwitchGuardian, onConnectChild }: { view: CapabilitiesView; name: string; api: MoneyApi; childId: string; mine: Mandate[]; busy: string | null; run: (k: string, fn: () => Promise<unknown>) => Promise<void>; onPermission: () => void; guardianLabel: string; onSwitchGuardian?: () => void; onConnectChild?: () => void }) {
  const [holder, setHolder] = useState(name);
  const [iban, setIban] = useState("");
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [changing, setChanging] = useState(false);
  // Confirmation of payee: the bank's (masked) holder name, checked before the account is added.
  const [check, setCheck] = useState<PayeeCheck | null>(null);
  const addAccount = (confirmed: boolean) => run("payee", async () => {
    const r = await api.setPayee(childId, iban, holder.trim(), "Savings", confirmed);
    setChanging(false); setCheck(null);
    return r.payee ? `${r.payee.label} added, ending ${r.payee.last4}` : "Account added";
  });
  const current = [...mine].reverse().find((m) => m.status === "active" || m.status === "paused" || m.status === "pending");
  const setup = view.setup;
  const consent = view.consent ?? null;
  const until = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return (
    <div className="pa-stack">
      <h1 className="pa-h1">Settings</h1>
      <div className="pa-card">
        <span className="pa-eyebrow">{name}'s account</span>
        {view.payee && !changing ? (
          <div className="pa-lrow" style={{ border: 0 }}><div className="ic"><img src={ART.vault} alt="" /></div><div className="pa-grow"><b>{view.payee.label}</b><small>Ending {view.payee.last4}{view.payee.check?.maskedName ? ` · held by ${view.payee.check.maskedName}` : ""}{view.payee.check?.bankName ? ` at ${view.payee.check.bankName}` : ""} · money goes straight here</small></div>
            {setup?.acceptsAccounts ? <button type="button" className="pa-btn ghost small" onClick={() => { setIban(""); setChanging(true); }}>Change</button> : <span className="pa-chip ok">Ready</span>}</div>
        ) : setup?.acceptsAccounts ? (
          <>
            <div className="pa-muted" style={{ marginTop: 6 }}>{name}'s own savings account, so money goes straight to {name}. Suited keeps only the last four digits.</div>
            {changing && current ? <div className="pa-small" style={{ marginTop: 8 }}>Automatic payments stop when you change the account. You approve them again for the new one.</div> : null}
            <div className="pa-field"><label htmlFor="acct-name">Name on the account</label><input id="acct-name" value={holder} onChange={(e) => { setHolder(e.target.value); setCheck(null); }} maxLength={70} /></div>
            <div className="pa-field"><label htmlFor="acct-iban">IBAN</label><input id="acct-iban" value={iban} onChange={(e) => { setIban(e.target.value); setCheck(null); }} maxLength={40} placeholder="AE07 0331 2345 6789 0123 456" /></div>
            {!check ? (
              <button type="button" className="pa-btn block" style={{ marginTop: 14 }} disabled={busy === "payee" || !/^[A-Za-z0-9 ]{8,40}$/.test(iban.trim()) || !holder.trim()} onClick={() => void run("payee", async () => { setCheck((await api.checkPayee(childId, iban, holder.trim())).check); })}>Check account</button>
            ) : check.result === "match" || check.result === "probable" ? (
              <>
                <div className="pa-check ok"><b>{check.maskedName ?? holder}</b><span>Account holder at {check.bankName ?? "the bank"}{check.result === "probable" ? " · close match" : " · name matches"}</span></div>
                <button type="button" className="pa-btn block" style={{ marginTop: 12 }} disabled={busy === "payee"} onClick={() => void addAccount(false)}>{changing ? "Use this account" : "Add account"}</button>
              </>
            ) : check.result === "review" ? (
              <>
                <div className="pa-check warn"><b>{check.maskedName ?? "Name partly matches"}</b><span>Only partly matches "{holder}" at {check.bankName ?? "the bank"}. Make sure this is {name}'s account.</span></div>
                <button type="button" className="pa-btn block" style={{ marginTop: 12 }} disabled={busy === "payee"} onClick={() => void addAccount(true)}>Yes, it's {name}'s account</button>
              </>
            ) : check.result === "no_match" ? (
              <div className="pa-check bad"><b>{check.maskedName ?? "Someone else's account"}</b><span>This account is in someone else's name at {check.bankName ?? "the bank"}. Check the IBAN and try again.</span></div>
            ) : (
              <>
                <div className="pa-check"><b>We couldn't check the name right now</b><span>The bank didn't answer. You can add the account anyway; check the IBAN carefully first.</span></div>
                <button type="button" className="pa-btn ghost block" style={{ marginTop: 12 }} disabled={busy === "payee"} onClick={() => void addAccount(false)}>Add anyway</button>
              </>
            )}
            {changing ? <button type="button" className="pa-btn ghost block" style={{ marginTop: 8 }} onClick={() => { setChanging(false); }}>Keep the current account</button> : null}
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
                <div className="pa-small"><Txt s={`Up to ${aed(current.limits.maxPerPayment)} a payment and ${aed(current.limits.maxPerWeek)} a week, until ${until(current.limits.endDate)}.${current.status === "active" ? " Cancel for good in your banking app." : ""}`} /></div></div>
              {current.status === "pending" ? <div className="pa-row" style={{ gap: 8 }}><button type="button" className="pa-btn ghost small" disabled={busy === "mandate"} onClick={() => void run("mandate", async () => { await api.cancelMandate(current.id); return "Cancelled. Check the account, then try again"; })}>Cancel</button><a className="pa-btn small" href={current.authorisationUrl} target="_blank" rel="noreferrer">Approve</a></div>
                : <button type="button" className="pa-switch" role="switch" aria-checked={current.status === "active"} aria-label="Automatic payments" disabled={busy === "mandate"} onClick={() => void run("mandate", async () => { await api.setMandatePaused(current.id, current.status === "active"); return current.status === "active" ? "Automatic payments paused" : "Automatic payments back on"; })} />}
            </div>
          ) : null}
        </div>
      ) : null}

      {setup?.readsBalances ? <BankBalance view={view} name={name} api={api} childId={childId} busy={busy} run={run} /> : null}

      <div className="pa-card">
        <span className="pa-eyebrow">Learning and money</span>
        <div className="pa-muted" style={{ marginTop: 6 }}>{consent?.withdrawnAt ? `Withdrawn. ${name}'s lessons no longer unlock rewards. What ${name} earned stays earned.` : `You agreed that ${name}'s lessons can unlock rewards you approve. You can take this back any time; what ${name} earned stays earned.`}</div>
        {consent?.withdrawnAt ? <button type="button" className="pa-btn small" style={{ marginTop: 10 }} disabled={busy === "consent"} onClick={() => void run("consent", async () => { await api.setConsent(childId, true); return "Consent given again"; })}>Give consent again</button>
          : !confirmWithdraw ? <button type="button" className="pa-btn danger small" style={{ marginTop: 10 }} onClick={() => { setConfirmWithdraw(true); }}>Withdraw consent</button>
          : <div className="pa-row" style={{ marginTop: 10, gap: 8 }}><button type="button" className="pa-btn danger small" disabled={busy === "consent"} onClick={() => void run("consent", async () => { await api.setConsent(childId, false); setConfirmWithdraw(false); return "Consent withdrawn"; })}>Yes, withdraw</button><button type="button" className="pa-btn ghost small" onClick={() => { setConfirmWithdraw(false); }}>Keep it</button></div>}
      </div>

      {onConnectChild ? (
        <div className="pa-card pa-row"><div className="pa-grow"><b className="din" style={{ fontSize: 15 }}>Another child?</b><div className="pa-small">Sit with them and enter the code from their Money tab.</div></div><button type="button" className="pa-btn ghost small" onClick={onConnectChild}>Connect</button></div>
      ) : null}

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

/** The Give button: every way to give, one tap away from any tab. */
function GiveSheet({ view, name, how, onClose, onPick }: { view: CapabilitiesView; name: string; how: How; onClose: () => void; onPick: (s: "send" | "pocket" | "reward") => void }) {
  const a = view.allowance ?? null;
  return (
    <Sheet onClose={onClose}>
      <h3 className="c">Give {name}</h3>
      <div className="pa-muted c">{how === "auto" ? "Sent bank to bank within your limits" : "You send it from your banking app"}</div>
      <div style={{ marginTop: 10 }}>
        <button type="button" className="pa-opt" onClick={() => { onPick("send"); }}><span className="ic" style={{ background: "#1CB0F6" }}><img src={ART.gift} alt="" /></span><span className="pa-grow"><b>Send money</b><small>Once, now, with a note {name} sees</small></span></button>
        <button type="button" className="pa-opt" onClick={() => { onPick("pocket"); }}><span className="ic" style={{ background: "#58CC02" }}><img src={ART.coins} alt="" /></span><span className="pa-grow"><b>Pocket money</b><small>{a ? <Txt s={`${aed(a.amount)} every ${DAYS[a.dayOfWeek] ?? "week"}. Change it`} /> : "The same amount, the same day, every week"}</small></span></button>
        <button type="button" className="pa-opt" onClick={() => { onPick("reward"); }}><span className="ic" style={{ background: "#FFC800" }}><img src={ART.trophy} alt="" /></span><span className="pa-grow"><b>A reward for learning</b><small>For finishing something {name} is learning</small></span></button>
      </div>
    </Sheet>
  );
}

function SendSheet({ name, how, onClose, onSend }: { name: string; how: How; onClose: () => void; onSend: (amount: number, note: string) => void }) {
  const [amount, setAmount] = useState(20);
  const [note, setNote] = useState("");
  return (
    <Sheet onClose={onClose}>
      <h3>Send to {name}</h3><div className="pa-muted">From your account to {name}'s.</div>
      <div className="pa-bignum"><Amt n={amount} /></div>
      <div className="pa-amounts" style={{ justifyContent: "center" }}>{[10, 20, 50, 100].map((v) => <button key={v} type="button" className="pa-amt" aria-pressed={amount === v} onClick={() => { setAmount(v); }}>{v}</button>)}</div>
      <div className="pa-field"><label htmlFor="send-note">A note {name} sees</label><input id="send-note" maxLength={60} value={note} onChange={(e) => { setNote(e.target.value); }} placeholder="Well done this week" /></div>
      <button type="button" className="pa-btn block" style={{ marginTop: 16 }} onClick={() => { onSend(amount, note.trim()); }}>Send <Amt n={amount} /></button>
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
      <button type="button" className="pa-btn block" style={{ marginTop: 18 }} onClick={() => { onSave(amount, d); }}><Amt n={amount} /> every {DAYS[d]}</button>
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
  const [amount, setAmount] = useState(50);
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
              <div className="pa-amounts">{[25, 50, 100, 250].map((v) => <button key={v} type="button" className="pa-amt" aria-pressed={amount === v} onClick={() => { setAmount(v); }}><Amt n={v} /></button>)}</div>
              <div className="pa-row" style={{ marginTop: 14 }}><div className="pa-grow"><b className="din">Send it automatically</b><div className="pa-small">Otherwise you send it with one tap when {name} finishes</div></div><button type="button" className="pa-switch" role="switch" aria-label="Send automatically" aria-checked={auto} onClick={() => { setAuto(!auto); }} /></div>
            </>
          ) : <div className="pa-field"><label htmlFor="promise-text">Your promise</label><input id="promise-text" maxLength={60} value={promise} onChange={(e) => { setPromise(e.target.value); }} placeholder="Pizza night, their pick" /></div>}
          <button type="button" className="pa-btn block" style={{ marginTop: 18 }} disabled={!ok} onClick={() => { onSave(cap, kind === "money" ? amount : 0, kind === "money" ? { kind: "money", destination: "card" } : { kind: "promise", title: promise.trim() }, kind === "money" && auto); }}>{kind === "money" ? <>Promise <Amt n={amount} /></> : "Promise it"}</button>
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
      <div className="pa-amounts">{[50, 100, 200].map((v) => <button key={v} type="button" className="pa-amt" aria-pressed={pp === v} onClick={() => { setPp(v); if (pw < v) setPw(v); }}><Amt n={v} /></button>)}</div>
      <div className="pa-eyebrow" style={{ marginTop: 14 }}>Most per week</div>
      <div className="pa-amounts">{[100, 200, 400].filter((v) => v >= pp).map((v) => <button key={v} type="button" className="pa-amt" aria-pressed={pw === v} onClick={() => { setPw(v); }}><Amt n={v} /></button>)}</div>
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
        <div className="big">{name} got <Amt n={amount} /></div>
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
