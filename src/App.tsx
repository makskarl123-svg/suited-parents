import { useEffect, useMemo, useState } from "react";
import { ApiError, MoneyApi, type ChildSummary } from "./api";
import { AuthProvider, useIdentity } from "./auth";
import { ChildPage } from "./pages/Child";

// In development the Vite proxy maps /api → the Money sandbox. In production
// the app is told where the service lives.
const API_BASE: string = (import.meta.env["VITE_MONEY_API_URL"] as string | undefined) ?? "/api";

function Inner() {
  const { identity, signOut, mode, guardianLabel } = useIdentity();
  const api = useMemo(() => new MoneyApi(API_BASE, identity), [identity]);
  const [children, setChildren] = useState<ChildSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api.myChildren().then((r) => {
      if (!live) return;
      setChildren(r.children);
      if (r.children.length === 1 && r.children[0]) setPicked(r.children[0].childId);
    }).catch((e: unknown) => {
      if (!live) return;
      if (e instanceof ApiError && e.status === 404) setError("The Money service you are connected to is older than this app. Restart it (npm run sandbox) and reload.");
      else setError(e instanceof Error ? e.message : "Something went wrong");
    });
    return () => { live = false; };
  }, [api]);

  const current = children?.find((c) => c.childId === picked) ?? null;

  return (
    <>
      {error ? <div className="shell"><div className="err">{error}</div></div> : null}
      {!error && children === null ? <div className="shell"><div className="card" style={{ marginTop: 20 }}><div className="meta">Loading…</div></div></div> : null}
      {!error && children !== null && children.length === 0 ? (
        <div className="shell">
          <div className="top"><span className="wm"><img src="/suited-logo.svg" alt="Suited" /><b>Money</b></span><span className="who">For parents</span></div>
          <div className="eyebrow">Signed in as {guardianLabel}</div>
          <h1>No children <em>linked yet.</em></h1>
          <p className="sub">When your child's school enrols them in Suited Money and you give consent, they appear here. Nothing to do for now.</p>
        </div>
      ) : null}
      {!error && children !== null && children.length > 1 && !current ? (
        <div className="shell">
          <div className="top"><span className="wm"><img src="/suited-logo.svg" alt="Suited" /><b>Money</b></span><span className="who">For parents</span></div>
          <div className="eyebrow">Your children</div>
          <h1>Who are we <em>looking at?</em></h1>
          <div className="pick">
            {children.map((c) => (
              <button key={c.childId} className="card" onClick={() => { setPicked(c.childId); }}>
                <div className="title">{c.displayName || "Your child"}</div>
                <div className="meta">{c.gateSet}</div>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {current ? (
        <>
          <ChildPage api={api} childId={current.childId} childName={current.displayName || "Your child"} />
          {children && children.length > 1 ? (
            <div className="actions" style={{ justifyContent: "center" }}>
              <button className="btn ghost" onClick={() => { setPicked(null); }}>Another child</button>
            </div>
          ) : null}
        </>
      ) : null}
      {mode === "dev" && signOut ? (
        <div className="actions" style={{ justifyContent: "center", paddingBottom: 24 }}>
          <button className="btn ghost" onClick={signOut}>Switch guardian</button>
        </div>
      ) : null}
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Inner />
    </AuthProvider>
  );
}
