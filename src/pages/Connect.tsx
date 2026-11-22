/**
 * Connect your child, in person.
 *
 * The child's Money tab shows a code (or a QR code that opens this page with
 * the code filled in). The parent, signed in here, enters it, sees whose it is,
 * reads what Suited Money does and agrees. The child then sees the parent's
 * first name and masked email and taps "Yes, that's my grown-up". Only then are
 * they connected. Codes last 15 minutes and work once.
 *
 * The parent's identity and verified email come from their sign-in, checked by
 * the Money service with the identity provider. Nothing here can claim to be
 * someone else.
 */
import { useEffect, useRef, useState } from "react";
import { ApiError, type MoneyApi } from "../api";

/** The consent the parent agrees to. Bump the version whenever the words below change. */
export const CONSENT_VERSION = "money-terms-2026-11";

type Step =
  | { at: "code" }
  | { at: "agree"; code: string; name: string; grade: number }
  | { at: "waiting"; name: string; until: string }
  | { at: "done"; name: string }
  | { at: "declined"; name: string }
  | { at: "expired"; name: string };

/** XXXX-XXXX as the parent types: capitals, no 0/O/1/I confusion, a dash after four. */
function tidy(raw: string): string {
  const c = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  return c.length > 4 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
}

/** A QR code on the child's screen opens /connect#K7MPQ2XD; the fragment never reaches a server log. */
export function codeFromLink(): string {
  return /^\/connect\/?$/.test(window.location.pathname) ? tidy(window.location.hash.slice(1)) : "";
}

export function Connect({ api, onConnected, onCancel, first }: { api: MoneyApi; onConnected: (displayName: string) => void; onCancel?: () => void; first: boolean }) {
  const [step, setStep] = useState<Step>({ at: "code" });
  const [code, setCode] = useState(codeFromLink);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { if (step.at === "code") input.current?.focus(); }, [step.at]);

  // While the child decides, check every few seconds.
  useEffect(() => {
    if (step.at !== "waiting") return;
    const t = setInterval(() => {
      void api.myPairings().then(({ pairings }) => {
        const p = pairings[0];
        if (!p) return;
        if (p.status === "connected") { setStep({ at: "done", name: p.displayName }); setTimeout(() => { onConnected(p.displayName); }, 1600); }
        else if (p.status === "declined") setStep({ at: "declined", name: p.displayName });
        else if (p.status === "expired" || p.status === "cancelled") setStep({ at: "expired", name: p.displayName });
      }).catch(() => undefined);
    }, 3000);
    return () => { clearInterval(t); };
  }, [step.at, api, onConnected]);

  const find = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api.previewPairing(code);
      setStep({ at: "agree", code, name: r.displayName, grade: r.grade });
    } catch (e) { setErr(e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong. Try again."); }
    finally { setBusy(false); }
  };

  const connect = async (s: Extract<Step, { at: "agree" }>) => {
    setBusy(true); setErr(null);
    try {
      const r = await api.claimPairing(s.code, CONSENT_VERSION);
      setStep({ at: "waiting", name: r.displayName, until: r.expiresAt });
    } catch (e) { setErr(e instanceof Error ? e.message : "Something went wrong. Try again."); }
    finally { setBusy(false); }
  };

  const restart = () => { setCode(""); setAgreed(false); setErr(null); setStep({ at: "code" }); };

  return (
    <div className="pa">
      <div className="pa-col">
        <main className="pa-main">
          <div className="pa-top">
            <span className="pa-eyebrow">Suited Money</span>
            {onCancel && step.at !== "done" ? <button type="button" className="pa-btn ghost small" onClick={onCancel}>Close</button> : null}
          </div>

          {step.at === "code" ? (
            <div className="pa-stack">
              <h1 className="pa-h1">{first ? "Connect your child" : "Connect another child"}</h1>
              <p className="pa-muted">Sit with your child. In the Money tab of their Suited app, they tap <b>Connect my grown-up</b> and a code appears. Type it here.</p>
              <div className="pa-card">
                <div className="pa-field">
                  <label htmlFor="pair-code">Code on your child's screen</label>
                  <input
                    id="pair-code" ref={input} value={code} inputMode="text" autoComplete="one-time-code" autoCapitalize="characters" spellCheck={false}
                    placeholder="K7MP-Q2XD" maxLength={9} className="pa-code"
                    onChange={(e) => { setCode(tidy(e.target.value)); setErr(null); }}
                    onKeyDown={(e) => { if (e.key === "Enter" && code.length === 9 && !busy) void find(); }}
                  />
                </div>
                {err ? <div className="pa-err" role="alert">{err}</div> : null}
                <button type="button" className="pa-btn block" style={{ marginTop: 14 }} disabled={busy || code.length !== 9} onClick={() => void find()}>{busy ? "Checking…" : "Continue"}</button>
              </div>
              <p className="pa-small">Codes last 15 minutes and work once, so a code can't be used by anyone who isn't with your child.</p>
            </div>
          ) : null}

          {step.at === "agree" ? (
            <div className="pa-stack">
              <span className="pa-eyebrow">{step.name} · Grade {step.grade}</span>
              <h1 className="pa-h1">Connect to {step.name}</h1>
              <div className="pa-card pa-consent">
                <h2>What Suited Money does</h2>
                <ul>
                  <li>{step.name} keeps learning in Suited. Finishing lessons can unlock rewards that <b>you</b> choose and approve.</li>
                  <li>Money goes from your bank to {step.name}'s own bank account, sent by you or, if you allow it at your bank, automatically within limits you set. <b>Suited never holds money.</b></li>
                  <li>{step.name} can ask you for money, plan it in jars and note what they spend. {step.name} can't send money anywhere.</li>
                </ul>
                <h2>What you control</h2>
                <ul>
                  <li>Every reward, every payment and every permission. Pause or stop anything at any time, here or at your bank.</li>
                  <li>Disconnect whenever you like. What {step.name} has already received stays theirs.</li>
                </ul>
                <h2>What's shared, and what never is</h2>
                <ul>
                  <li>From learning to Suited Money: which lessons {step.name} finished, under a private code. No school, no class, no marks beyond the lesson quiz.</li>
                  <li>{step.name} sees your first name and a hidden version of your email (like k•••@gmail.com), so they know it's you.</li>
                  <li>Never: advertising, selling data, or showing brands to {step.name}.</li>
                </ul>
              </div>
              <label className="pa-card pa-agree">
                <input type="checkbox" checked={agreed} onChange={(e) => { setAgreed(e.target.checked); }} />
                <span>I am {step.name}'s parent or legal guardian, and I agree to Suited Money as described above.</span>
              </label>
              {err ? <div className="pa-err" role="alert">{err}</div> : null}
              <button type="button" className="pa-btn block" disabled={busy || !agreed} onClick={() => void connect(step)}>{busy ? "Connecting…" : `Agree and connect to ${step.name}`}</button>
              <button type="button" className="pa-btn ghost block" onClick={restart}>That's not my child</button>
            </div>
          ) : null}

          {step.at === "waiting" ? (
            <div className="pa-stack">
              <h1 className="pa-h1">Over to {step.name}</h1>
              <div className="pa-card pa-wait" aria-live="polite">
                <span className="pa-pulse" aria-hidden="true" />
                <p className="pa-muted">{step.name}'s screen now shows your name. Ask {step.name} to tap <b>Yes, that's my grown-up</b>.</p>
                <p className="pa-small">This page moves on by itself.</p>
              </div>
            </div>
          ) : null}

          {step.at === "done" ? (
            <div className="pa-stack">
              <h1 className="pa-h1">You're connected to {step.name}</h1>
              <p className="pa-muted">Opening {step.name}'s money…</p>
            </div>
          ) : null}

          {step.at === "declined" ? (
            <div className="pa-stack">
              <h1 className="pa-h1">{step.name} said that wasn't you</h1>
              <p className="pa-muted">Nothing was connected. If it was a mistake, ask {step.name} to show a new code and try again together.</p>
              <button type="button" className="pa-btn block" onClick={restart}>Enter a new code</button>
            </div>
          ) : null}

          {step.at === "expired" ? (
            <div className="pa-stack">
              <h1 className="pa-h1">That code ran out</h1>
              <p className="pa-muted">Codes last 15 minutes. Ask {step.name} to show a new one.</p>
              <button type="button" className="pa-btn block" onClick={restart}>Enter a new code</button>
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}
