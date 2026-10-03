import { useEffect, useMemo, useState } from "react";
import { ApiError, MoneyApi, type ChildSummary } from "./api";
import { AuthProvider, useIdentity } from "./auth";
import { ChildPage } from "./pages/Child";
import { InvitePage } from "./pages/Invite";

// In development the Vite proxy maps /api → the Money sandbox. In production
// the app is told where the service lives.
const API_BASE: string = (import.meta.env["VITE_MONEY_API_URL"] as string | undefined) ?? "/api";

const SECTIONS: { id: string; label: string; sprite: string }[] = [
  { id: "overview", label: "Overview", sprite: "/sprites/item-coin.webp" },
  { id: "switches", label: "Every switch", sprite: "/sprites/item-bus.webp" },
  { id: "moves", label: "Money moves", sprite: "/sprites/item-cart.webp" },
  { id: "history", label: "History", sprite: "/sprites/item-book.webp" },
];

/** The wide-screen sidebar: the product's sections, the guardian's children, who is signed in. */
function Side({ children, picked, onPick, active, onSection, guardianLabel, mode, signOut }: { children: ChildSummary[]; picked: string | null; onPick: (id: string) => void; active: string; onSection: (id: string) => void; guardianLabel: string; mode: "clerk" | "dev"; signOut?: () => void }) {
  return (
    <aside className="side">
      <span className="wm"><img src="/suited-logo.svg" alt="Suited" /><b>Money</b></span>
      <nav className="nav" aria-label="Sections">
        {SECTIONS.map((s) => (
          <button type="button" key={s.id} className={`navitem ${active === s.id ? "on" : ""}`} onClick={() => onSection(s.id)} disabled={!picked}>
            <span className="ic"><img src={s.sprite} alt="" /></span>{s.label}
          </button>
        ))}
      </nav>
      {children.length > 1 ? (
        <div className="kids">
          <div className="label">Your children</div>
          {children.map((c) => (
            <button type="button" key={c.childId} className={`kid ${picked === c.childId ? "on" : ""}`} onClick={() => onPick(c.childId)}>
              <span className="dot">{(c.displayName || "?").slice(0, 1).toUpperCase()}</span>{c.displayName || "Your child"}
            </button>
          ))}
        </div>
      ) : null}
      <div className="foot-side">
        <div><b>{mode === "dev" ? `Signed in as ${guardianLabel}` : "Signed in"}</b>{mode === "dev" ? "Development · sandbox" : "Parent account"}</div>
        {mode === "dev" && signOut ? <button type="button" className="link" onClick={signOut}>Switch guardian</button> : null}
      </div>
    </aside>
  );
}

/** The one deep link the app has: /invite/<token>. Everything else is the overview. */
function inviteToken(): string | null {
  const m = /^\/invite\/([^/]+)\/?$/.exec(window.location.pathname);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

function Inner() {
  const { identity, signOut, mode, guardianLabel } = useIdentity();
  const [invite, setInvite] = useState<string | null>(() => inviteToken());
  if (invite) return <InvitePage token={invite} onLinked={() => { window.history.replaceState(null, "", "/"); setInvite(null); }} />;
  return <Home identity={identity} signOut={signOut} mode={mode} guardianLabel={guardianLabel} />;
}

function Home({ identity, signOut, mode, guardianLabel }: { identity: ReturnType<typeof useIdentity>["identity"]; signOut?: () => void; mode: "clerk" | "dev"; guardianLabel: string }) {
  const api = useMemo(() => new MoneyApi(API_BASE, identity), [identity]);
  const [children, setChildren] = useState<ChildSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [section, setSection] = useState<string>("overview");

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
  const goSection = (id: string) => {
    setSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const header = <div className="top"><span className="wm"><img src="/suited-logo.svg" alt="Suited" /><b>Money</b></span><span className="who">For parents</span></div>;

  return (
    <div className="frame">
      <Side children={children ?? []} picked={picked} onPick={setPicked} active={section} onSection={goSection} guardianLabel={guardianLabel} mode={mode} signOut={signOut} />
      <div className="main">
        {error ? <div className="shell">{header}<div className="err">{error}</div></div> : null}
        {!error && children === null ? <div className="shell">{header}<div className="card" style={{ marginTop: 20 }}><div className="meta">Loading…</div></div></div> : null}
        {!error && children !== null && children.length === 0 ? (
          <div className="shell">
            {header}
            <div className="eyebrow">Signed in as {guardianLabel}</div>
            <h1>No children <em>linked yet.</em></h1>
            <p className="sub">When your child's school enrols them in Suited Money and you give consent, they appear here. Nothing to do for now.</p>
          </div>
        ) : null}
        {!error && children !== null && children.length > 1 && !current ? (
          <div className="shell">
            {header}
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
            <ChildPage api={api} childId={current.childId} childName={current.displayName || "Your child"} onSectionSeen={setSection} />
            {children && children.length > 1 ? (
              <div className="actions" style={{ justifyContent: "center", paddingBottom: 24 }}>
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
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Inner />
    </AuthProvider>
  );
}
