import { useMemo } from "react";
import { MoneyApi } from "./api";
import { AuthProvider, useIdentity } from "./auth";
import { ChildPage } from "./pages/Child";

// In development the Vite proxy maps /api → the Money sandbox. In production
// the app is told where the service lives.
const API_BASE: string = (import.meta.env["VITE_MONEY_API_URL"] as string | undefined) ?? "/api";

// The family link (which children this guardian has) comes from the learning
// API's family model, not yet built. Until then the sandbox child is fixed.
const SANDBOX_CHILD = { id: "maya", name: "Maya" };

function Inner(): JSX.Element {
  const { identity, signOut, mode } = useIdentity();
  const api = useMemo(() => new MoneyApi(API_BASE, identity), [identity]);
  return (
    <>
      <ChildPage api={api} childId={SANDBOX_CHILD.id} childName={SANDBOX_CHILD.name} />
      {mode === "dev" && signOut ? (
        <div className="actions" style={{ justifyContent: "center", paddingBottom: 24 }}>
          <button className="btn ghost" onClick={signOut}>Switch guardian</button>
        </div>
      ) : null}
    </>
  );
}

export default function App(): JSX.Element {
  return (
    <AuthProvider>
      <Inner />
    </AuthProvider>
  );
}
