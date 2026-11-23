/**
 * New reward, guided (approved prototype: claude.ai/artifact/3pFsYbSEbCU9c8c2xXpvLy,
 * in the colour pass of 23 Nov 2026). Three steps: what to finish, what to give,
 * check and save. Parents reward a thread (about a week) or a whole subject,
 * never a single lesson: convenience first, and paying per lesson rewards
 * rushing. The suggestion comes first; browsing everything is one tap away.
 */
import { useEffect, useMemo, useState } from "react";
import { ApiError, type CapabilitiesView, type Goals, type GoalsDomain, type GoalsThread, type GoalTarget, type MoneyApi, type PledgeReward } from "../api";
import { aed, Amt, Dirham } from "../dirham";

type Size = "thread" | "subject";
/** Amounts scale with the size; the middle one is what most parents choose. */
const SIZES: Record<Size, { label: string; hint: string; popular: number; amounts: number[] }> = {
  thread: { label: "A thread", hint: "about 4 lessons", popular: 50, amounts: [25, 50, 100] },
  subject: { label: "A whole subject", hint: "all its threads", popular: 250, amounts: [100, 250, 500] },
};
const IDEAS = ["Cinema trip", "Pick Friday dinner", "A new book", "Day out together"];
const MAX = 10_000;

type Pick = { size: "thread"; domain: GoalsDomain; thread: GoalsThread } | { size: "subject"; domain: GoalsDomain };
const keyOf = (grade: number, p: Pick): string => (p.size === "thread" ? `goal:${grade}:${p.domain.code}:${p.thread.code}` : `goal:${grade}:${p.domain.code}`);
const titleOf = (p: Pick): string => (p.size === "thread" ? p.thread.name : p.domain.name);
const progressOf = (p: Pick): { done: number; total: number } => (p.size === "thread" ? { done: p.thread.done, total: p.thread.total } : { done: p.domain.done, total: p.domain.total });

/** "about a week", "about 3 weeks", "about 2 months"; nothing when there's no recent pace to go on. */
function when(left: number, pace: number | null): string {
  if (left <= 0) return "finished";
  if (!pace) return "";
  const w = Math.ceil(left / pace);
  return w <= 1 ? "about a week" : w <= 8 ? `about ${w} weeks` : `about ${Math.round(w / 4.3)} months`;
}
const joinBits = (...bits: string[]): string => bits.filter(Boolean).join(" · ");

export function RewardPicker({ api, childId, name, view, guardianLabel, autoLimit, onClose, onSaved }: {
  api: MoneyApi; childId: string; name: string; view: CapabilitiesView; guardianLabel: string;
  /** The most per payment the parent approved at their bank; null when payments aren't automatic. */
  autoLimit: number | null;
  onClose: () => void; onSaved: (message: string) => void;
}) {
  const [goals, setGoals] = useState<Goals | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [browse, setBrowse] = useState(false);
  const [size, setSize] = useState<Size>("thread");
  const [domainCode, setDomainCode] = useState("FL");
  const [pick, setPick] = useState<Pick | null>(null);
  const [kind, setKind] = useState<"money" | "promise">("money");
  const [amount, setAmount] = useState<number | null>(null);
  const [custom, setCustom] = useState(false);
  const [promise, setPromise] = useState("");
  const [auto, setAuto] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api.goals(childId).then((g) => { if (live) setGoals(g); }, (e: unknown) => { if (live) setFailed(e instanceof ApiError && e.status === 404 ? `Rewards by thread aren't ready for ${name}'s grade yet.` : e instanceof Error ? e.message : "Couldn't load what's being learned"); });
    return () => { live = false; };
  }, [api, childId, name]);

  useEffect(() => {
    const k = (e: KeyboardEvent): void => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k); return () => { window.removeEventListener("keydown", k); };
  }, [onClose]);

  // Threads and subjects that already have a reward on the way.
  const taken = useMemo(() => new Set((view.pledges ?? []).filter((p) => p.status === "open" || p.status === "due").map((p) => p.capability)), [view.pledges]);
  const next = useMemo(() => {
    if (!goals?.nextUp) return null;
    const d = goals.domains.find((x) => x.code === goals.nextUp?.domain);
    const t = d?.threads.find((x) => x.code === goals.nextUp?.thread);
    return d && t ? { domain: d, thread: t } : null;
  }, [goals]);

  const who = guardianLabel.includes("@") ? "You" : guardianLabel;
  const isSel = (p: Pick): boolean => !!pick && !!goals && keyOf(goals.grade, pick) === keyOf(goals.grade, p);
  const choose = (p: Pick): void => { setPick(p); setAmount(null); setCustom(false); };
  const pace = goals?.pace ?? null;
  const sizeOfPick = pick ? SIZES[pick.size] : SIZES.thread;
  const overLimit = autoLimit !== null && amount !== null && amount > autoLimit;
  const sendsAuto = kind === "money" && autoLimit !== null && auto && !overLimit;

  const save = async (): Promise<void> => {
    if (!pick || !goals) return;
    const target: GoalTarget = pick.size === "thread" ? { kind: "thread", domain: pick.domain.code, thread: pick.thread.code } : { kind: "domain", domain: pick.domain.code };
    const reward: PledgeReward = kind === "money" ? { kind: "money", destination: "card" } : { kind: "promise", title: promise.trim() };
    setSaving(true); setSaveError(null);
    try {
      await api.pledgeGoal(childId, target, kind === "money" ? amount ?? 0 : 0, reward, sendsAuto);
      onSaved(`${name} can see it now: ${kind === "money" ? aed(amount ?? 0) : promise.trim()} for ${titleOf(pick)}`);
    } catch (e) { setSaveError(e instanceof Error ? e.message : "Couldn't save the reward"); setSaving(false); }
  };

  /* ── pieces ── */

  const threadCard = (d: GoalsDomain, t: GoalsThread, isNext: boolean) => {
    const p: Pick = { size: "thread", domain: d, thread: t };
    const finished = t.total > 0 && t.done >= t.total;
    const has = goals ? taken.has(keyOf(goals.grade, p)) : false;
    const off = finished || has;
    return (
      <button key={`${d.code}${t.code}`} type="button" className={`pa-pick${isNext ? " next" : ""}`} aria-pressed={isSel(p)} disabled={off} onClick={() => { choose(p); }} style={{ ["--c" as string]: d.accent }}>
        {isNext ? <span className="tag">Next up for {name}</span> : null}
        <span className="nm">{t.name}</span>
        <span className="mt">{finished ? `${name} finished this` : has ? "Already has a reward" : joinBits(d.name, `${t.done} of ${t.total} done`, when(t.total - t.done, pace))}</span>
        <span className="pa-dots" aria-hidden="true">{t.lessons.map((l, i) => <i key={i} className={l.done ? "on" : ""} />)}</span>
        {isNext ? (
          <ul className="pa-lessonlist">{t.lessons.map((l, i) => <li key={i} className={l.done ? "done" : ""}><b aria-hidden="true">{l.done ? "✓" : ""}</b><span>{l.title}</span></li>)}</ul>
        ) : <span className="pk">{t.lessons.slice(0, 2).map((l) => l.title).join(" · ")}{t.lessons.length > 2 ? " …" : ""}</span>}
      </button>
    );
  };

  const subjectCard = (d: GoalsDomain, big: boolean) => {
    const p: Pick = { size: "subject", domain: d };
    const finished = d.total > 0 && d.done >= d.total;
    const has = goals ? taken.has(keyOf(goals.grade, p)) : false;
    return (
      <button key={d.code} type="button" className="pa-pick" aria-pressed={isSel(p)} disabled={finished || has} onClick={() => { choose(p); }} style={{ ["--c" as string]: d.accent }}>
        {big ? <span className="ey">Or a bigger goal</span> : null}
        <span className="nm"><i className="sw" aria-hidden="true" />{big ? `Finish all of ${d.name}` : d.name}</span>
        <span className="mt">{finished ? `${name} finished this` : has ? "Already has a reward" : joinBits(`${d.threads.length} threads`, `${d.total} lessons`, `${d.done} done`, when(d.total - d.done, pace))}</span>
        <span className="pa-bar" aria-hidden="true"><i style={{ width: `${Math.max(2, Math.round((d.done / Math.max(1, d.total)) * 100))}%` }} /></span>
        {big ? null : <span className="pk">{d.threads.slice(0, 4).map((t) => t.name).join(" · ")} …</span>}
      </button>
    );
  };

  const browseDomain = goals?.domains.find((d) => d.code === domainCode) ?? goals?.domains[0];

  /* ── steps ── */

  let head: { back: () => void; backLabel: string; title: string; sub: string };
  let body: React.ReactNode;
  let foot: React.ReactNode;

  if (step === 1) {
    head = { back: onClose, backLabel: "✕ Cancel", title: `What should ${name} finish?`, sub: "Tap one to choose: a thread of about four lessons, or a whole subject." };
    body = failed ? <div className="pa-card pa-muted">{failed}</div> : !goals ? <div className="pa-card pa-muted">Loading what {name} is learning…</div> : (
      <>
        {next ? <div style={{ marginTop: 14 }}>{threadCard(next.domain, next.thread, true)}</div> : null}
        {!browse ? (
          <>
            {next ? <div className="pa-picklist">{subjectCard(next.domain, true)}</div> : null}
            <button type="button" className="pa-browse" onClick={() => { setBrowse(true); }}><span>Browse other threads and subjects</span><span aria-hidden="true">›</span></button>
          </>
        ) : (
          <>
            <div className="pa-eyebrow" style={{ margin: "20px 4px 8px" }}>Browse</div>
            <div className="pa-seg2" role="group" aria-label="Size">{(Object.keys(SIZES) as Size[]).map((k) => <button key={k} type="button" aria-pressed={size === k} onClick={() => { setSize(k); }}>{SIZES[k].label}<small>{SIZES[k].hint}</small></button>)}</div>
            {size === "thread" ? (
              <>
                <div className="pa-dchips" role="group" aria-label="Subject">{goals.domains.map((d) => <button key={d.code} type="button" aria-pressed={d.code === browseDomain?.code} onClick={() => { setDomainCode(d.code); }}><i style={{ background: d.accent }} />{d.shortName}</button>)}</div>
                <div className="pa-picklist">{browseDomain?.threads.map((t) => threadCard(browseDomain, t, false))}</div>
              </>
            ) : <div className="pa-picklist">{goals.domains.map((d) => subjectCard(d, false))}</div>}
          </>
        )}
      </>
    );
    foot = <button type="button" className="pa-btn block" disabled={!pick} onClick={() => { setStep(2); }}>{pick ? `Continue with ${titleOf(pick)}` : "Choose something to finish"}</button>;
  } else if (step === 2 && pick) {
    const pr = progressOf(pick); const left = pr.total - pr.done;
    head = { back: () => { setStep(1); }, backLabel: "‹ Back", title: "What will you give?", sub: `For finishing ${titleOf(pick)} (${left} ${left === 1 ? "lesson" : "lessons"} to go${when(left, pace) ? `, ${when(left, pace)}` : ""}).` };
    body = (
      <>
        <div className="pa-seg2" style={{ marginTop: 16 }} role="group" aria-label="Reward"><button type="button" aria-pressed={kind === "money"} onClick={() => { setKind("money"); }}>Money</button><button type="button" aria-pressed={kind === "promise"} onClick={() => { setKind("promise"); }}>A promise</button></div>
        {kind === "money" ? (
          <>
            <div className="pa-eyebrow" style={{ margin: "20px 4px 6px" }}>Amount</div>
            <p className="pa-muted" style={{ margin: "0 4px" }}>Most parents choose around <Amt n={sizeOfPick.popular} /> for {pick.size === "thread" ? "a thread" : "a whole subject"}. Or set your own.</p>
            <div className="pa-amounts" style={{ marginTop: 18 }} role="group" aria-label="Amount">{sizeOfPick.amounts.map((a) => <button key={a} type="button" className={`pa-amt${a === sizeOfPick.popular ? " sugg" : ""}`} aria-pressed={amount === a && !custom} onClick={() => { setAmount(a); setCustom(false); }}><Amt n={a} /></button>)}</div>
            <label className={`pa-custom${custom ? " on" : ""}`}><span>Other amount</span><span className="cin"><Dirham /><input inputMode="numeric" maxLength={5} placeholder="e.g. 75" value={custom && amount ? String(amount) : ""} onFocus={() => { if (!custom) { setCustom(true); setAmount(null); } }} onChange={(e) => { const d = e.target.value.replace(/[^0-9]/g, "").slice(0, 5); setAmount(d ? Math.min(MAX, Number(d)) : null); }} aria-label="Other amount in dirhams" /></span></label>
            {autoLimit !== null ? (
              <>
                {overLimit && auto ? <p className="pa-muted" style={{ margin: "10px 4px 0" }}>This is more than your automatic limit of <Amt n={autoLimit} /> a payment, so you'll send this one with one tap when {name} finishes.</p> : null}
                <div className="pa-card pa-row" style={{ marginTop: 16 }}><div className="pa-grow"><b className="din">Send it when {name} finishes</b><div className="pa-small">Automatic, within the limits you approved at your bank. Off: you send it with one tap.</div></div><button type="button" className="pa-switch" role="switch" aria-label="Send automatically" aria-checked={auto} onClick={() => { setAuto(!auto); }} /></div>
              </>
            ) : <p className="pa-muted" style={{ margin: "14px 4px 0" }}>When {name} finishes, we'll tell you, and you send it from your banking app.</p>}
          </>
        ) : (
          <>
            <div className="pa-eyebrow" style={{ margin: "20px 4px 6px" }}>Your promise</div>
            <div className="pa-field" style={{ marginTop: 0 }}><input maxLength={60} placeholder="What will you do?" value={promise} onChange={(e) => { setPromise(e.target.value); }} aria-label="Your promise" /></div>
            <div className="pa-ideas">{IDEAS.map((i) => <button key={i} type="button" onClick={() => { setPromise(i); }}>{i}</button>)}</div>
            <p className="pa-muted" style={{ margin: "12px 4px 0" }}>{name} sees your promise in your words. You tap "Kept it" when you've done it.</p>
          </>
        )}
      </>
    );
    foot = <button type="button" className="pa-btn block" disabled={kind === "money" ? !amount : !promise.trim()} onClick={() => { setStep(3); }}>Continue</button>;
  } else if (pick) {
    const pr = progressOf(pick); const left = pr.total - pr.done;
    const dots = Math.min(pr.total, 12); const on = Math.round((pr.done / Math.max(1, pr.total)) * dots);
    const reward = kind === "money" ? <Amt n={amount ?? 0} /> : promise.trim();
    head = { back: () => { setStep(2); }, backLabel: "‹ Back", title: "Check and save", sub: `This is what ${name} will see in the Money tab.` };
    body = (
      <>
        <div className="pa-kidcard" style={{ marginTop: 16 }}>
          <div className="e">{who} promised</div>
          <div className="n">{reward}</div>
          <div className="w">when you finish {titleOf(pick)} · {pr.done} of {pr.total} lessons</div>
          <div className="pa-dots">{Array.from({ length: dots }, (_, i) => <i key={i} className={i < on ? "on" : ""} />)}</div>
        </div>
        <div className="pa-card pa-summary">
          <div><span>Finish</span><b>{titleOf(pick)}</b></div>
          <div><span>Where</span><b>{pick.size === "thread" ? pick.domain.name : `${pick.domain.threads.length} threads`}</b></div>
          <div><span>Left to do</span><b>{joinBits(`${left} ${left === 1 ? "lesson" : "lessons"}`, when(left, pace))}</b></div>
          <div><span>Reward</span><b>{reward}</b></div>
          <div><span>When {name} finishes</span><b>{kind === "promise" ? "You tap \"Kept it\"" : sendsAuto ? "Sent automatically" : "You send it with one tap"}</b></div>
        </div>
        <p className="pa-muted" style={{ margin: "14px 4px 0" }}>You can cancel a reward any time before {name} finishes it.</p>
        {saveError ? <div className="pa-err">{saveError}</div> : null}
      </>
    );
    foot = <button type="button" className="pa-btn block" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save reward"}</button>;
  } else {
    head = { back: onClose, backLabel: "✕ Cancel", title: "", sub: "" };
    body = null; foot = null;
  }

  return (
    <div className="pa-fp" role="dialog" aria-modal="true" aria-label="New reward">
      <div className="pa-fp-in">
        <div className="pa-fp-top">
          <div className="pa-row" style={{ justifyContent: "space-between" }}><button type="button" className="pa-fp-back" onClick={head.back}>{head.backLabel}</button><span className="pa-small">Step {step} of 3</span></div>
          <div className="pa-steps" aria-hidden="true">{[1, 2, 3].map((n) => <i key={n} className={n <= step ? "on" : ""} />)}</div>
          <h2 className="pa-h1" style={{ marginTop: 14, fontSize: 25 }}>{head.title}</h2>
          <p className="pa-muted" style={{ margin: "2px 0 0" }}>{head.sub}</p>
        </div>
        <div className="pa-fp-scroll">{body}</div>
        <div className="pa-fp-foot">{foot}</div>
      </div>
    </div>
  );
}
