/**
 * Family Rules: the family's money agreement, written once by a parent and agreed by
 * everyone in their own app. Three steps in the reward picker's register: pick the
 * rules, set the amounts, check what the children will see and save. Household
 * agreements, never bank restrictions: nothing here blocks a payment. Every ask the
 * child makes then shows the parent what the family already agreed.
 */
import { useEffect, useMemo, useState } from "react";
import type { ChildSummary, FamilyAgreement, MoneyApi, Rule, RuleTemplate, RuleType } from "../api";
import { Amt, Dirham, Txt, aed } from "../dirham";

const ORDER: RuleType[] = ["pocketMoney", "funBudget", "bigPurchaseWait", "parentsCover", "earningExtra", "saving", "giving", "custom"];
/** Each rule keeps one art tile and one colour wherever it appears. */
export const RULE_LOOK: Record<RuleType, { art: string; colour: string }> = {
  pocketMoney: { art: "/money/art/coin-stack.webp", colour: "#58CC02" },
  funBudget: { art: "/money/art/headphones.webp", colour: "#CE82FF" },
  bigPurchaseWait: { art: "/money/art/padlock.webp", colour: "#FF9600" },
  parentsCover: { art: "/money/art/vault.webp", colour: "#1CB0F6" },
  earningExtra: { art: "/money/art/trophy.webp", colour: "#2B70C9" },
  saving: { art: "/money/art/jar-coins.webp", colour: "#FFC800" },
  giving: { art: "/money/art/gift.webp", colour: "#FF4B4B" },
  custom: { art: "/money/art/key.webp", colour: "#8E9992" },
};
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const COVER_IDEAS = ["School things and transport", "Clothes and essentials", "Birthday presents for friends"];
const EARN_IDEAS = ["Learning rewards and family jobs", "Learning rewards only", "Family jobs, agreed in advance"];
const SAVE_IDEAS = ["We save towards the goals we agree on", "Half of gift money goes to savings", "A little from every pocket money"];
const GIVE_IDEAS = ["for causes we care about", "for someone who needs it", "at Ramadan and Eid"];

interface Draft {
  on: Record<RuleType, boolean>;
  pocket: { split: boolean; amount: number; per: Record<string, number>; cadence: "weekly" | "monthly"; day: number };
  fun: { split: boolean; amount: number; per: Record<string, number> };
  wait: { over: number; hours: number };
  cover: string; earning: string; saving: string;
  giving: { percent: number | null; text: string };
  custom: { title: string; text: string };
  months: number;
}

const blank = (kids: ChildSummary[]): Draft => ({
  on: { pocketMoney: true, funBudget: true, bigPurchaseWait: true, parentsCover: false, earningExtra: true, saving: false, giving: false, custom: false },
  pocket: { split: false, amount: 50, per: Object.fromEntries(kids.map((k) => [k.childId, 50])), cadence: "weekly", day: 0 },
  fun: { split: false, amount: 100, per: Object.fromEntries(kids.map((k) => [k.childId, 100])), },
  wait: { over: 100, hours: 48 },
  cover: COVER_IDEAS[0] ?? "", earning: EARN_IDEAS[0] ?? "", saving: SAVE_IDEAS[0] ?? "",
  giving: { percent: 10, text: GIVE_IDEAS[0] ?? "" },
  custom: { title: "", text: "" },
  months: 3,
});

/** The draft from an agreement already saved, so editing starts where the family left off. */
function fromAgreement(a: FamilyAgreement, kids: ChildSummary[]): Draft {
  const d = blank(kids);
  if (!a.rules.length) return d;
  (Object.keys(d.on) as RuleType[]).forEach((t) => { d.on[t] = false; });
  const pockets = a.rules.filter((r): r is Extract<typeof r, { type: "pocketMoney" }> => r.type === "pocketMoney");
  const funs = a.rules.filter((r): r is Extract<typeof r, { type: "funBudget" }> => r.type === "funBudget");
  const first = pockets[0];
  if (first) {
    d.on.pocketMoney = true;
    d.pocket = { ...d.pocket, cadence: first.cadence, day: first.day, amount: first.amount, split: pockets.some((p) => p.appliesTo) };
    for (const p of pockets) for (const c of p.appliesTo ?? kids.map((k) => k.childId)) d.pocket.per[c] = p.amount;
  }
  const firstFun = funs[0];
  if (firstFun) {
    d.on.funBudget = true;
    d.fun = { ...d.fun, amount: firstFun.amount, split: funs.some((f) => f.appliesTo) };
    for (const f of funs) for (const c of f.appliesTo ?? kids.map((k) => k.childId)) d.fun.per[c] = f.amount;
  }
  for (const r of a.rules) {
    if (r.type === "bigPurchaseWait") { d.on.bigPurchaseWait = true; d.wait = { over: r.overAmount, hours: r.hours }; }
    if (r.type === "parentsCover") { d.on.parentsCover = true; d.cover = r.text; }
    if (r.type === "earningExtra") { d.on.earningExtra = true; d.earning = r.text; }
    if (r.type === "saving") { d.on.saving = true; d.saving = r.text; }
    if (r.type === "giving") { d.on.giving = true; d.giving = { percent: r.percent ?? null, text: r.text ?? "" }; }
    if (r.type === "custom" && !d.on.custom) { d.on.custom = true; d.custom = { title: r.title, text: r.text }; }
  }
  return d;
}

/** The rules to save. Amounts that differ by child become one rule per child. */
function toRules(d: Draft, kids: ChildSummary[]): Rule[] {
  const out: Rule[] = [];
  const perChild = (split: boolean, amount: number, per: Record<string, number>, make: (amount: number, appliesTo?: string[]) => Rule): void => {
    if (!split || kids.length < 2) { out.push(make(amount)); return; }
    const groups = new Map<number, string[]>();
    for (const k of kids) { const a = per[k.childId] ?? amount; groups.set(a, [...(groups.get(a) ?? []), k.childId]); }
    if (groups.size === 1) { out.push(make([...groups.keys()][0] ?? amount)); return; }
    for (const [a, ids] of groups) out.push(make(a, ids));
  };
  for (const t of ORDER) {
    if (!d.on[t]) continue;
    if (t === "pocketMoney") perChild(d.pocket.split, d.pocket.amount, d.pocket.per, (amount, appliesTo) => ({ type: "pocketMoney", amount, cadence: d.pocket.cadence, day: d.pocket.day, ...(appliesTo ? { appliesTo } : {}) }));
    if (t === "funBudget") perChild(d.fun.split, d.fun.amount, d.fun.per, (amount, appliesTo) => ({ type: "funBudget", amount, period: "monthly", ...(appliesTo ? { appliesTo } : {}) }));
    if (t === "bigPurchaseWait") out.push({ type: "bigPurchaseWait", overAmount: d.wait.over, hours: d.wait.hours });
    if (t === "parentsCover") out.push({ type: "parentsCover", text: d.cover.trim() });
    if (t === "earningExtra") out.push({ type: "earningExtra", text: d.earning.trim() });
    if (t === "saving") out.push({ type: "saving", text: d.saving.trim() });
    if (t === "giving") out.push({ type: "giving", ...(d.giving.percent ? { percent: d.giving.percent } : {}), ...(d.giving.text.trim() ? { text: d.giving.text.trim() } : {}) });
    if (t === "custom") out.push({ type: "custom", title: d.custom.title.trim(), text: d.custom.text.trim() });
  }
  return out;
}

/** The sentence a rule reads as, here in the app (the service says the same once saved). */
function sentence(r: Rule): string {
  const ord = (n: number): string => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;
  switch (r.type) {
    case "pocketMoney": return r.cadence === "weekly" ? `${aed(r.amount)} every ${DAYS[r.day] ?? "week"}` : `${aed(r.amount)} on the ${ord(r.day)} of every month`;
    case "funBudget": return `${aed(r.amount)} a month for fun things`;
    case "bigPurchaseWait": return `Wait ${r.hours === 24 ? "a day" : r.hours % 24 === 0 ? `${r.hours / 24} days` : `${r.hours} hours`} before buying anything over ${aed(r.overAmount)}`;
    case "giving": return r.percent !== undefined ? `Give ${r.percent}% of what we get${r.text ? `: ${r.text}` : ""}` : (r.text ?? "");
    case "custom": return r.text;
    default: return r.text;
  }
}

const reviewOn = (months: number): string => {
  const d = new Date(Date.now() + 4 * 3_600_000);
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d.getUTCDate(), last));
  return t.toISOString().slice(0, 10);
};
const longDate = (iso: string): string => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

function Amounts({ values, value, onPick, label }: { values: number[]; value: number; onPick: (n: number) => void; label: string }) {
  const custom = !values.includes(value);
  return (
    <>
      <div className="pa-amounts" role="group" aria-label={label}>{values.map((v) => <button key={v} type="button" className="pa-amt" aria-pressed={value === v} onClick={() => { onPick(v); }}><Amt n={v} /></button>)}</div>
      <label className={`pa-custom${custom ? " on" : ""}`}><span>Other amount</span><span className="cin"><Dirham /><input inputMode="numeric" maxLength={5} aria-label={`${label}, other amount in dirhams`} value={custom && value ? String(value) : ""} placeholder="e.g. 75" onChange={(e) => { const n = Number(e.target.value.replace(/[^0-9]/g, "").slice(0, 5)); if (n > 0) onPick(Math.min(10_000, n)); }} /></span></label>
    </>
  );
}

function PerChild({ kids, per, split, onSplit, onSet, values, label }: { kids: ChildSummary[]; per: Record<string, number>; split: boolean; onSplit: (v: boolean) => void; onSet: (id: string, n: number) => void; values: number[]; label: string }) {
  if (kids.length < 2) return null;
  return (
    <>
      <div className="pa-seg2" style={{ marginTop: 14 }} role="group" aria-label={`${label} for each child`}>
        <button type="button" aria-pressed={!split} onClick={() => { onSplit(false); }}>The same for everyone</button>
        <button type="button" aria-pressed={split} onClick={() => { onSplit(true); }}>Different for each</button>
      </div>
      {split ? kids.map((k) => (
        <div key={k.childId} style={{ marginTop: 12 }}>
          <div className="pa-small" style={{ margin: "0 4px 6px" }}><b>{k.displayName || "Your child"}</b></div>
          <div className="pa-amounts" role="group" aria-label={`${label} for ${k.displayName}`}>{values.map((v) => <button key={v} type="button" className="pa-amt" aria-pressed={(per[k.childId] ?? 0) === v} onClick={() => { onSet(k.childId, v); }}><Amt n={v} /></button>)}</div>
        </div>
      )) : null}
    </>
  );
}

function Ideas({ ideas, onPick }: { ideas: string[]; onPick: (s: string) => void }) {
  return <div className="pa-ideas">{ideas.map((i) => <button key={i} type="button" onClick={() => { onPick(i); }}>{i}</button>)}</div>;
}

function RuleHead({ type, title, helper }: { type: RuleType; title: string; helper: string }) {
  const look = RULE_LOOK[type];
  return (
    <div className="pa-rulehead">
      <span className="ic" style={{ background: look.colour }}><img src={look.art} alt="" /></span>
      <span className="pa-grow"><b>{title}</b><small>{helper}</small></span>
    </div>
  );
}

export function RulesBuilder({ api, kids, family, onClose, onSaved }: { api: MoneyApi; kids: ChildSummary[]; family: FamilyAgreement; onClose: () => void; onSaved: (f: FamilyAgreement) => void }) {
  const [templates, setTemplates] = useState<RuleTemplate[] | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [d, setD] = useState<Draft>(() => fromAgreement(family, kids));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const names = kids.map((k) => k.displayName || "Your child");
  const who = names.length === 1 ? names[0] ?? "Your child" : names.length === 2 ? `${names[0]} and ${names[1]}` : "Your children";
  const one = kids.length === 1;

  useEffect(() => {
    let live = true;
    api.agreementTemplates(family.familyId).then((r) => { if (live) setTemplates(r.templates); }, () => { if (live) setTemplates([]); });
    return () => { live = false; };
  }, [api, family.familyId]);
  useEffect(() => {
    const k = (e: KeyboardEvent): void => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k); return () => { window.removeEventListener("keydown", k); };
  }, [onClose]);

  const tpl = (t: RuleType): RuleTemplate | undefined => templates?.find((x) => x.type === t);
  const rules = useMemo(() => toRules(d, kids), [d, kids]);
  const chosen = ORDER.filter((t) => d.on[t]);
  const ready = rules.length > 0 && rules.every((r) => ("text" in r ? (r.text ?? "").trim().length > 0 || (r.type === "giving" && !!r.percent) : true) && (r.type !== "custom" || r.title.trim().length > 0));
  const set = (patch: Partial<Draft>): void => { setD((x) => ({ ...x, ...patch })); };
  const titleOf = (t: RuleType): string => tpl(t)?.title ?? t;

  const save = async (): Promise<void> => {
    setSaving(true); setErr(null);
    try { onSaved((await api.saveAgreement(family.familyId, rules, reviewOn(d.months))).family); }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't save your rules"); setSaving(false); }
  };

  let head: { back: () => void; backLabel: string; title: string; sub: string };
  let body: React.ReactNode;
  let foot: React.ReactNode;

  if (step === 1) {
    head = { back: onClose, backLabel: "✕ Cancel", title: "What will your family agree?", sub: `Pick the rules that fit. ${who} ${one ? "sees" : "see"} them and ${one ? "agrees" : "agree"} in ${one ? "their" : "their own"} app.` };
    body = templates === null ? <div className="pa-card pa-muted" style={{ marginTop: 16 }}>Loading the rules…</div> : (
      <div className="pa-picklist" style={{ marginTop: 16 }}>
        {ORDER.map((t) => {
          const x = tpl(t); if (!x) return null;
          const look = RULE_LOOK[t];
          return (
            <button key={t} type="button" className="pa-ruleopt" aria-pressed={d.on[t]} onClick={() => { setD((v) => ({ ...v, on: { ...v.on, [t]: !v.on[t] } })); }}>
              <span className="ic" style={{ background: look.colour }}><img src={look.art} alt="" /></span>
              <span className="pa-grow"><b>{x.title}</b><small>{x.helper}</small></span>
              <span className="tick" aria-hidden="true">{d.on[t] ? "✓" : ""}</span>
            </button>
          );
        })}
      </div>
    );
    foot = <button type="button" className="pa-btn block" disabled={!chosen.length} onClick={() => { setStep(2); }}>{chosen.length ? `Continue with ${chosen.length} ${chosen.length === 1 ? "rule" : "rules"}` : "Pick at least one rule"}</button>;
  } else if (step === 2) {
    head = { back: () => { setStep(1); }, backLabel: "‹ Back", title: "Set the details", sub: "Suggestions to start from. Change anything to suit your family." };
    body = (
      <div className="pa-stack" style={{ marginTop: 16 }}>
        {d.on.pocketMoney ? (
          <div className="pa-card">
            <RuleHead type="pocketMoney" title={titleOf("pocketMoney")} helper="The same amount, on the same day." />
            <div className="pa-seg2" style={{ marginTop: 14 }} role="group" aria-label="How often"><button type="button" aria-pressed={d.pocket.cadence === "weekly"} onClick={() => { set({ pocket: { ...d.pocket, cadence: "weekly", day: 0 } }); }}>Every week</button><button type="button" aria-pressed={d.pocket.cadence === "monthly"} onClick={() => { set({ pocket: { ...d.pocket, cadence: "monthly", day: 1 } }); }}>Every month</button></div>
            {!d.pocket.split ? <div style={{ marginTop: 12 }}><Amounts label="Pocket money" values={d.pocket.cadence === "weekly" ? [20, 30, 50, 100] : [100, 150, 200, 300]} value={d.pocket.amount} onPick={(n) => { set({ pocket: { ...d.pocket, amount: n } }); }} /></div> : null}
            <PerChild kids={kids} label="Pocket money" split={d.pocket.split} per={d.pocket.per} values={d.pocket.cadence === "weekly" ? [20, 30, 50, 100] : [100, 150, 200, 300]} onSplit={(v) => { set({ pocket: { ...d.pocket, split: v } }); }} onSet={(id, n) => { set({ pocket: { ...d.pocket, per: { ...d.pocket.per, [id]: n } } }); }} />
            <div className="pa-eyebrow" style={{ margin: "16px 4px 8px" }}>{d.pocket.cadence === "weekly" ? "Which day" : "Which date"}</div>
            <div className="pa-amounts" role="group" aria-label="Which day">{d.pocket.cadence === "weekly"
              ? DAYS.map((x, i) => <button key={x} type="button" className="pa-amt" aria-pressed={d.pocket.day === i} onClick={() => { set({ pocket: { ...d.pocket, day: i } }); }}>{x.slice(0, 3)}</button>)
              : [1, 15, 28].map((n) => <button key={n} type="button" className="pa-amt" aria-pressed={d.pocket.day === n} onClick={() => { set({ pocket: { ...d.pocket, day: n } }); }}>{n === 1 ? "1st" : n === 15 ? "15th" : "28th"}</button>)}</div>
          </div>
        ) : null}
        {d.on.funBudget ? (
          <div className="pa-card">
            <RuleHead type="funBudget" title={titleOf("funBudget")} helper="Games, treats and outings come from this each month." />
            {!d.fun.split ? <div style={{ marginTop: 12 }}><Amounts label="Fun money" values={[50, 100, 150, 200]} value={d.fun.amount} onPick={(n) => { set({ fun: { ...d.fun, amount: n } }); }} /></div> : null}
            <PerChild kids={kids} label="Fun money" split={d.fun.split} per={d.fun.per} values={[50, 100, 150, 200]} onSplit={(v) => { set({ fun: { ...d.fun, split: v } }); }} onSet={(id, n) => { set({ fun: { ...d.fun, per: { ...d.fun.per, [id]: n } } }); }} />
            <p className="pa-small" style={{ margin: "12px 4px 0" }}>When {one ? (names[0] ?? "your child") : "a child"} asks for something fun, you'll see how much is left this month.</p>
          </div>
        ) : null}
        {d.on.bigPurchaseWait ? (
          <div className="pa-card">
            <RuleHead type="bigPurchaseWait" title={titleOf("bigPurchaseWait")} helper="A pause before big buys." />
            <div className="pa-eyebrow" style={{ margin: "14px 4px 8px" }}>For anything over</div>
            <div className="pa-amounts" role="group" aria-label="For anything over">{[50, 100, 200, 500].map((v) => <button key={v} type="button" className="pa-amt" aria-pressed={d.wait.over === v} onClick={() => { set({ wait: { ...d.wait, over: v } }); }}><Amt n={v} /></button>)}</div>
            <div className="pa-eyebrow" style={{ margin: "14px 4px 8px" }}>Wait</div>
            <div className="pa-amounts" role="group" aria-label="Wait">{[[24, "A day"], [48, "2 days"], [72, "3 days"], [168, "A week"]].map(([h, l]) => <button key={h} type="button" className="pa-amt" aria-pressed={d.wait.hours === h} onClick={() => { set({ wait: { ...d.wait, hours: h as number } }); }}>{l}</button>)}</div>
          </div>
        ) : null}
        {d.on.parentsCover ? (
          <div className="pa-card"><RuleHead type="parentsCover" title={titleOf("parentsCover")} helper="So pocket money is for everything else." />
            <div className="pa-field"><input aria-label="What we cover" maxLength={200} value={d.cover} onChange={(e) => { set({ cover: e.target.value }); }} /></div><Ideas ideas={COVER_IDEAS} onPick={(s) => { set({ cover: s }); }} /></div>
        ) : null}
        {d.on.earningExtra ? (
          <div className="pa-card"><RuleHead type="earningExtra" title={titleOf("earningExtra")} helper="How extra money can be earned." />
            <div className="pa-field"><input aria-label="Earning extra" maxLength={200} value={d.earning} onChange={(e) => { set({ earning: e.target.value }); }} /></div><Ideas ideas={EARN_IDEAS} onPick={(s) => { set({ earning: s }); }} /></div>
        ) : null}
        {d.on.saving ? (
          <div className="pa-card"><RuleHead type="saving" title={titleOf("saving")} helper="What we save towards, together." />
            <div className="pa-field"><input aria-label="Saving" maxLength={200} value={d.saving} onChange={(e) => { set({ saving: e.target.value }); }} /></div><Ideas ideas={SAVE_IDEAS} onPick={(s) => { set({ saving: s }); }} /></div>
        ) : null}
        {d.on.giving ? (
          <div className="pa-card"><RuleHead type="giving" title={titleOf("giving")} helper="A little for others, every time." />
            <div className="pa-amounts" style={{ marginTop: 12 }} role="group" aria-label="How much to give">{[5, 10, 20].map((p) => <button key={p} type="button" className="pa-amt" aria-pressed={d.giving.percent === p} onClick={() => { set({ giving: { ...d.giving, percent: p } }); }}>{p}%</button>)}<button type="button" className="pa-amt" aria-pressed={d.giving.percent === null} onClick={() => { set({ giving: { ...d.giving, percent: null } }); }}>No set amount</button></div>
            <div className="pa-field"><input aria-label="What for" maxLength={200} value={d.giving.text} onChange={(e) => { set({ giving: { ...d.giving, text: e.target.value } }); }} placeholder="for causes we care about" /></div><Ideas ideas={GIVE_IDEAS} onPick={(s) => { set({ giving: { ...d.giving, text: s } }); }} /></div>
        ) : null}
        {d.on.custom ? (
          <div className="pa-card"><RuleHead type="custom" title={titleOf("custom")} helper="Anything else your family wants to agree." />
            <div className="pa-field"><label htmlFor="rule-custom-title">Name</label><input id="rule-custom-title" maxLength={60} value={d.custom.title} onChange={(e) => { set({ custom: { ...d.custom, title: e.target.value } }); }} placeholder="Screen-free Fridays" /></div>
            <div className="pa-field"><label htmlFor="rule-custom-text">The rule</label><input id="rule-custom-text" maxLength={200} value={d.custom.text} onChange={(e) => { set({ custom: { ...d.custom, text: e.target.value } }); }} placeholder="No buying games on Fridays" /></div></div>
        ) : null}
      </div>
    );
    foot = <button type="button" className="pa-btn block" disabled={!ready} onClick={() => { setStep(3); }}>Continue</button>;
  } else {
    head = { back: () => { setStep(2); }, backLabel: "‹ Back", title: "Check and save", sub: `This is what ${who} will see.` };
    body = (
      <>
        <div className="pa-dealcard" style={{ marginTop: 16 }}>
          <div className="e">Our family agreement</div>
          <div className="rows">
            {rules.map((r, i) => {
              const look = RULE_LOOK[r.type];
              const kidsFor = r.appliesTo ? r.appliesTo.map((id) => kids.find((k) => k.childId === id)?.displayName).filter(Boolean).join(", ") : "";
              return (
                <div key={i} className="row">
                  <span className="ic" style={{ background: look.colour }}><img src={look.art} alt="" /></span>
                  <span className="pa-grow"><b>{r.type === "custom" ? r.title : titleOf(r.type)}{kidsFor ? <i> · {kidsFor}</i> : null}</b><span><Txt s={sentence(r)} /></span></span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="pa-card pa-row" style={{ marginTop: 6 }}>
          <img src="/family/frank.webp" alt="" style={{ width: 44, height: 44, borderRadius: "50%" }} />
          <div className="pa-grow pa-small" style={{ fontSize: 14 }}><b className="din" style={{ display: "block", fontSize: 15, color: "var(--ink)" }}>{who} will see this and agree in {one ? "their" : "their own"} app</b>When everyone has agreed, every ask shows you what you all said.</div>
        </div>
        <div className="pa-eyebrow" style={{ margin: "18px 4px 8px" }}>Look at it again</div>
        <div className="pa-amounts" role="group" aria-label="Review">{[1, 3, 6].map((m) => <button key={m} type="button" className="pa-amt" aria-pressed={d.months === m} onClick={() => { set({ months: m }); }}>{m === 1 ? "In a month" : `In ${m} months`}</button>)}</div>
        <p className="pa-muted" style={{ margin: "10px 4px 0" }}>We'll remind you on {longDate(reviewOn(d.months))}. Rules are what your family agrees, not limits at the bank. You decide every ask.</p>
        {err ? <div className="pa-err" style={{ marginTop: 12 }}>{err}</div> : null}
      </>
    );
    foot = <button type="button" className="pa-btn block" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : family.version > 0 ? "Save the new version" : "Save our rules"}</button>;
  }

  return (
    <div className="pa-fp" role="dialog" aria-modal="true" aria-label="Family rules">
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

/**
 * The agreement in Settings: the rules in words, who has agreed, and the way to change
 * them. Before there is one, an invitation to write it.
 */
export function AgreementCard({ family, me, busy, onWrite, onAgree }: { family: FamilyAgreement | null; me: string | null; busy: boolean; onWrite: () => void; onAgree: () => void }) {
  if (!family || family.version === 0) {
    return (
      <div className="pa-card">
        <span className="pa-eyebrow">Family rules</span>
        <div className="pa-row" style={{ marginTop: 10, alignItems: "flex-start" }}>
          <div className="pa-grow"><b className="din" style={{ fontSize: 17 }}>Agree your family's money rules</b><div className="pa-muted" style={{ marginTop: 4 }}>Pocket money, fun money and big buys, agreed once by everyone. Then every ask shows you what you all said.</div></div>
          <img src="/money/art/padlock.webp" alt="" style={{ width: 54, flex: "none" }} />
        </div>
        <button type="button" className="pa-btn block" style={{ marginTop: 14 }} onClick={onWrite}>Write our rules</button>
      </div>
    );
  }
  const mine = family.parents.find((p) => p.guardianId === me);
  return (
    <div className="pa-card">
      <div className="pa-row" style={{ justifyContent: "space-between" }}><span className="pa-eyebrow">Family rules</span>{family.everyoneAgreed ? <span className="pa-chip ok">Everyone agreed</span> : <span className="pa-chip wait">Waiting for agreement</span>}</div>
      <div className="pa-rulelist">
        {family.rules.map((r) => {
          const look = RULE_LOOK[r.type];
          return <div key={r.id} className="row"><span className="ic" style={{ background: look.colour }}><img src={look.art} alt="" /></span><span className="pa-grow"><b>{r.title}</b><span><Txt s={r.sentence} /></span></span></div>;
        })}
      </div>
      <div className="pa-agreed" aria-label="Who has agreed">
        {[...family.parents.map((p) => ({ k: p.guardianId, name: p.guardianId === me ? "You" : p.label, at: p.agreedAt })), ...family.children.map((c) => ({ k: c.childId, name: c.displayName || "Your child", at: c.agreedAt }))].map((x) => (
          <span key={x.k} className={x.at ? "yes" : ""}>{x.at ? "✓ " : ""}{x.name}{x.at ? "" : " · not yet"}</span>
        ))}
      </div>
      {family.reviewDate ? <div className="pa-small" style={{ marginTop: 8 }}>Version {family.version} · look at it again on {longDate(family.reviewDate)}</div> : null}
      <div className="pa-row" style={{ gap: 8, marginTop: 14 }}>
        {mine && !mine.agreedAt ? <button type="button" className="pa-btn small" disabled={busy} onClick={onAgree}>I agree</button> : null}
        <button type="button" className="pa-btn ghost small" onClick={onWrite}>Change the rules</button>
      </div>
    </div>
  );
}
