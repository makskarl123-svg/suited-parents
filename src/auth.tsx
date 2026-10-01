/**
 * Who is signed in. Two modes, chosen at build time by VITE_CLERK_PUBLISHABLE_KEY:
 *   Clerk    production. The parents.suited.ae Clerk application; the Money service
 *            verifies the session token and takes the guardian id from it.
 *   Dev      no key. A guardian picker (mum, dad) sending the x-guardian-id header
 *            the sandbox accepts. Never shipped: the build fails without a key when
 *            MODE is production (see main.tsx).
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { ClerkProvider, SignIn, SignedIn, SignedOut, UserButton, useAuth } from "@clerk/clerk-react";
import type { Identity } from "./api";

interface AuthValue {
  identity: Identity;
  /** Who the service will see us as, for display. */
  guardianLabel: string;
  signOut?: () => void;
  mode: "clerk" | "dev";
}

const Ctx = createContext<AuthValue | null>(null);

export function useIdentity(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useIdentity outside AuthProvider");
  return v;
}

export const CLERK_KEY: string | undefined = import.meta.env["VITE_CLERK_PUBLISHABLE_KEY"] as string | undefined;

export function AuthProvider({ children }: { children: ReactNode }) {
  return CLERK_KEY ? <ClerkAuth publishableKey={CLERK_KEY}>{children}</ClerkAuth> : <DevAuth>{children}</DevAuth>;
}

function ClerkAuth({ publishableKey, children }: { publishableKey: string; children: ReactNode }) {
  return (
    <ClerkProvider publishableKey={publishableKey} afterSignOutUrl="/">
      <SignedOut>
        <div className="shell" style={{ display: "grid", placeItems: "center", minHeight: "80vh" }}>
          <SignIn />
        </div>
      </SignedOut>
      <SignedIn>
        <ClerkBridge>{children}</ClerkBridge>
      </SignedIn>
    </ClerkProvider>
  );
}

function ClerkBridge({ children }: { children: ReactNode }) {
  const { getToken, userId, signOut } = useAuth();
  const value = useMemo<AuthValue>(() => ({
    mode: "clerk",
    guardianLabel: userId ?? "",
    identity: { headers: async () => { const h: Record<string, string> = {}; const t = await getToken(); if (t) h["authorization"] = `Bearer ${t}`; return h; } },
    signOut: () => void signOut(),
  }), [getToken, userId, signOut]);
  return <Ctx.Provider value={value}><div className="top"><span /><UserButton /></div>{children}</Ctx.Provider>;
}

const DEV_GUARDIANS = ["mum", "dad"];

function DevAuth({ children }: { children: ReactNode }) {
  const [who, setWho] = useState<string | null>(() => { try { return localStorage.getItem("suited.dev.guardian"); } catch { return null; } });
  const value = useMemo<AuthValue | null>(() => who ? ({
    mode: "dev",
    guardianLabel: who,
    identity: { headers: () => Promise.resolve({ "x-guardian-id": who }) },
    signOut: () => { try { localStorage.removeItem("suited.dev.guardian"); } catch { /* ignore */ } setWho(null); },
  }) : null, [who]);

  if (!value) {
    return (
      <div className="shell">
        <div className="devbar">Development · sandbox · no real accounts</div>
        <div className="top"><span className="wm"><img src="/suited-logo.svg" alt="Suited" /><b>Money</b></span></div>
        <div className="eyebrow">Who are you today?</div>
        <h1>Pick a <em>guardian.</em></h1>
        <p className="sub">The sandbox child is Maya. Mum and Dad are both her guardians; either approval counts.</p>
        <div className="pick">
          {DEV_GUARDIANS.map((g) => (
            <button key={g} className="card" onClick={() => { try { localStorage.setItem("suited.dev.guardian", g); } catch { /* ignore */ } setWho(g); }}>
              <div className="title" style={{ textTransform: "capitalize" }}>{g}</div>
              <div className="meta">Signs in as guardian id "{g}"</div>
            </button>
          ))}
        </div>
      </div>
    );
  }
  return <Ctx.Provider value={value}><div className="devbar">Development · signed in as {who} · sandbox</div>{children}</Ctx.Provider>;
}
