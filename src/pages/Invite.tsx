/**
 * The invite link lands here. The parent reads, in plain words, what Suited
 * does, what the bank does, what data moves and what never does, enters the
 * child's date of birth (the only personal field the engine uses, for age
 * gates), ticks, and agrees. Then the learning API enrols the child with the
 * Money service and the parent sees them on the overview.
 *
 * Educational consent only. Banking consent, KYC and the account are the
 * bank's own onboarding, which comes next, with the bank.
 */
import { useEffect, useState } from "react";
import { useIdentity } from "../auth";

const LEARNING_API: string = (import.meta.env["VITE_LEARNING_API_URL"] as string | undefined) ?? "/learning";

interface Invite { displayName: string; grade: number; status: "open" | "accepted" | "expired"; expiresAt: string }

export function InvitePage({ token, onLinked }: { token: string; onLinked: () => void }) {
  const { guardianLabel, mode } = useIdentity();
  const [invite, setInvite] = useState<Invite | null | "missing">(null);
  const [dob, setDob] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`${LEARNING_API}/money/invites/${encodeURIComponent(token)}`).then(async (r) => {
      if (!live) return;
      if (!r.ok) { setInvite("missing"); return; }
      setInvite((await r.json()) as Invite);
    }).catch(() => { if (live) setInvite("missing"); });
    return () => { live = false; };
  }, [token]);

  const accept = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`${LEARNING_API}/money/invites/${encodeURIComponent(token)}/accept`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ guardianId: guardianLabel, agreed, ...(dob ? { dateOfBirth: dob } : {}) }) });
      if (!r.ok) { const b = (await r.json().catch(() => ({}))) as { error?: string }; setErr(b.error ?? "Something went wrong. Try again."); return; }
      setDone(true);
      setTimeout(onLinked, 1400);
    } catch { setErr("Could not reach Suited. Check your connection and try again."); }
    finally { setBusy(false); }
  };

  const name = invite && invite !== "missing" ? invite.displayName : "your child";

  return (
    <div className="shell" style={{ maxWidth: 720 }}>
      <div className="top"><span className="wm"><img src="/suited-logo.svg" alt="Suited" /><b>Money</b></span><span className="who">For parents</span></div>
      {invite === null ? <div className="card" style={{ marginTop: 20 }}><div className="meta">Opening your invite…</div></div> : null}
      {invite === "missing" ? (
        <>
          <div className="eyebrow">Suited Money</div>
          <h1>This link is <em>not valid.</em></h1>
          <p className="sub">It may have been typed wrongly. Ask {name} to send a new one from the Money tab in their Suited app.</p>
        </>
      ) : null}
      {invite && invite !== "missing" && invite.status !== "open" ? (
        <>
          <div className="eyebrow">Suited Money</div>
          <h1>{invite.status === "accepted" ? <>Already <em>set up.</em></> : <>This link has <em>expired.</em></>}</h1>
          <p className="sub">{invite.status === "accepted" ? `${invite.displayName}'s card is already linked to a parent. If that is you, go to the overview.` : `Links work for seven days. Ask ${invite.displayName} to send a new one from the Money tab in their Suited app.`}</p>
          {invite.status === "accepted" ? <div className="actions"><button className="btn" onClick={onLinked}>Go to the overview</button></div> : null}
        </>
      ) : null}
      {invite && invite !== "missing" && invite.status === "open" && !done ? (
        <>
          <div className="eyebrow">{invite.displayName} · Grade {invite.grade}</div>
          <h1>{invite.displayName} asked you to set up <em>Suited Money.</em></h1>
          <p className="sub">A real bank account and card, held at a licensed UAE partner bank, whose capabilities open as {invite.displayName} completes the lessons that teach them. You say yes to every step. Two minutes to read, one tick to agree.</p>

          <div className="grid" style={{ gridTemplateColumns: "1fr" }}>
            <div className="col">
              <div className="block sky">
                <div className="label">What Suited does</div>
                <ul style={{ marginTop: 10, paddingLeft: 18, fontSize: 14, lineHeight: 1.55, color: "var(--ink)" }}>
                  <li>Teaches the financial literacy curriculum {invite.displayName} already uses at school.</li>
                  <li>Turns finished strands into requests to you: Transport after Budgeting, online payments after Money Safety, and so on.</li>
                  <li>Sends your yes to the bank, keeps a record of every request and decision, and shows you every payment the bank reports.</li>
                  <li>Lets you set pocket money, make pledges, add money, freeze the card, and switch anything off at any time.</li>
                </ul>
              </div>
              <div className="block mint">
                <div className="label">What the bank does</div>
                <ul style={{ marginTop: 10, paddingLeft: 18, fontSize: 14, lineHeight: 1.55, color: "var(--ink)" }}>
                  <li>Opens and holds the account, issues the card, and moves every dirham. Suited never holds money.</li>
                  <li>Does its own identity checks with you directly, under its own terms. That step comes next, with the bank.</li>
                  <li>Applies a weekly spending ceiling for minors and keeps the account in the UAE.</li>
                </ul>
              </div>
              <div className="block sun">
                <div className="label">What moves, and what never does</div>
                <ul style={{ marginTop: 10, paddingLeft: 18, fontSize: 14, lineHeight: 1.55, color: "var(--ink)" }}>
                  <li>From learning to Suited Money: which lessons were finished and quiz results, under a pseudonym. No name, no school, no class.</li>
                  <li>From Suited Money to the bank: your approved requests and the card reference. Nothing about {invite.displayName}'s learning.</li>
                  <li>From the bank to Suited Money: balance, payments and card status, so you and {invite.displayName} can see them.</li>
                  <li>Never: advertising, selling or profiling. No brands are ever shown to {invite.displayName}. You can withdraw consent at any time; the card goes back to the bank's defaults and learning stops changing it.</li>
                </ul>
              </div>

              <div className="card">
                <div className="title">{invite.displayName}'s date of birth</div>
                <div className="small">Some capabilities have an age, for example sending to friends from 12. This is the only personal detail the engine uses, and it never goes to the bank from Suited.</div>
                <input className="limit num" type="date" value={dob} onChange={(e) => setDob(e.target.value)} aria-label="Date of birth" style={{ width: 200, marginTop: 12 }} />
              </div>

              <label className="card" style={{ display: "flex", gap: 14, alignItems: "flex-start", cursor: "pointer" }}>
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ width: 22, height: 22, marginTop: 2, accentColor: "var(--owl)" }} />
                <span style={{ fontSize: 14.5, lineHeight: 1.5, color: "var(--ink)" }}>I am {invite.displayName}'s parent or guardian. I agree that {invite.displayName}'s Suited learning may be used, under a pseudonym, to request card capabilities that I approve, and I understand the account and card are the bank's, under the bank's own terms, which I will agree to separately with the bank.</span>
              </label>

              {err ? <div className="err">{err}</div> : null}
              <div className="actions" style={{ marginTop: 4 }}>
                <button className="btn" disabled={busy || !agreed} onClick={() => void accept()}>{busy ? "Linking…" : `Agree and link ${invite.displayName}`}</button>
                <span className="small">Signed in as {mode === "dev" ? guardianLabel : "you"}.</span>
              </div>
            </div>
          </div>
        </>
      ) : null}
      {done ? (
        <>
          <div className="eyebrow">Suited Money</div>
          <h1><em>Linked.</em> {name} will see the card appear.</h1>
          <p className="sub">The bank's own onboarding is next and comes from the bank. Meanwhile everything {name} learns already counts toward the first unlock.</p>
        </>
      ) : null}
      <div className="foot">The bank holds the money. Suited holds the learning. You hold the switches.</div>
    </div>
  );
}
