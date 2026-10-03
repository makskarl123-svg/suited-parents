/**
 * The Money service client. Contract: suited-money-api/openapi.json.
 * Identity is supplied by the caller as headers: a Clerk bearer token in
 * production, the x-guardian-id header in development.
 */
export type CapabilityState = "Locked" | "Earned" | "Requested" | "Held" | "Active" | "ActiveByParent" | "Closed" | "PendingBank";

export interface Limit { currency: string; perWeek: number }

export interface CapabilityView {
  capability: string;
  gateName: string;
  state: CapabilityState;
  label: string;
  earnedAt: string | null;
  limit: Limit | null;
  /** For the ceiling gate: the band the child moves to when it completes. */
  nextLimit?: Limit | null;
  lastActor: string | null;
  progress: { done: number; total: number; missing: string[] } | null;
}

export interface Transaction { id: string; at: string; amount: number; currency: string; description: string; control?: string }
/** The bank's view of the account, read by the Money service through its connector. Null until the bank has a card. */
export interface Jar { id: string; name: string; currency: string; balance: number; target?: number; createdAt: string }
export interface FundView { currency: string; balance: number; contributions: Transaction[] }
export interface AccountView { currency: string; balance: number; week: { spent: number; limit?: number; startedOn: string }; transactions: Transaction[] }

/** The child's ask for money. Yes becomes a transfer through the bank; the amount can be changed on the way. */
export interface TopUpRequest { id: string; childId: string; amount?: number; currency: string; note: string; at: string; status: "pending" | "approved" | "declined"; decidedBy?: string; decidedAt?: string; bankRef?: string }

export interface Allowance { amount: number; currency: string; dayOfWeek: number; description: string; setBy: string; lastPaidOn?: string | null; next: { on: string; daysUntil: number } }
export interface Pledge { id: string; childId: string; capability: string; gateName: string; amount: number; currency: string; note: string; madeBy: string; madeAt: string; status: "open" | "paid" | "cancelled"; paidAt?: string; bankRef?: string }

export interface CapabilitiesView { childId: string; gateSet: string; capabilities: CapabilityView[]; account?: AccountView | null; requests?: TopUpRequest[]; allowance?: Allowance | null; pledges?: Pledge[]; card?: { frozen: boolean } | null; consent?: { givenAt: string; byGuardianId: string; withdrawnAt: string | null } | null; jars?: Jar[]; fund?: FundView | null }
export interface Snapshot { capability: string; state: CapabilityState; label: string; earnedAt: string | null; limit: Limit | null }
export interface AuditEntry { at: string; childId: string; capability?: string; what: string; requestId?: string; actor?: string }

export type Verb = "approve" | "not-yet" | "open-early" | "close" | "reopen";
export interface ChildSummary { childId: string; displayName: string; gateSet: string }

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

export interface Identity { headers(): Promise<Record<string, string>> }

export class MoneyApi {
  constructor(private readonly base: string, private readonly identity: Identity) {}

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = { "content-type": "application/json", ...(await this.identity.headers()), ...(init.headers as Record<string, string> | undefined) };
    const res = await fetch(`${this.base}${path}`, { ...init, headers });
    if (!res.ok) {
      let msg = res.statusText;
      try { msg = ((await res.json()) as { error?: string }).error ?? msg; } catch { /* keep statusText */ }
      throw new ApiError(res.status, msg);
    }
    return (await res.json()) as T;
  }

  myChildren(): Promise<{ guardianId: string; children: ChildSummary[] }> {
    return this.call("/me/children");
  }

  capabilities(childId: string): Promise<CapabilitiesView> {
    return this.call(`/children/${encodeURIComponent(childId)}/capabilities`);
  }

  act(childId: string, capability: string, verb: Verb, body: { limit?: Limit; reaskOn?: string } = {}): Promise<Snapshot> {
    return this.call(`/children/${encodeURIComponent(childId)}/capabilities/${encodeURIComponent(capability)}/${verb}`, { method: "POST", body: JSON.stringify(body) });
  }

  /** Money into the child's account, moved by the bank. */
  topUp(childId: string, amount: number, description?: string): Promise<{ transaction: Transaction; bankRef: string; account: AccountView | null }> {
    return this.call(`/children/${encodeURIComponent(childId)}/top-up`, { method: "POST", body: JSON.stringify({ amount, ...(description ? { description } : {}) }) });
  }

  /** Answer the child's ask. Approving with no amount uses the child's. */
  decideRequest(childId: string, requestId: string, approve: boolean, amount?: number): Promise<{ request: TopUpRequest; transaction?: Transaction }> {
    return this.call(`/children/${encodeURIComponent(childId)}/requests/${encodeURIComponent(requestId)}/${approve ? "approve" : "decline"}`, { method: "POST", body: JSON.stringify(amount !== undefined ? { amount } : {}) });
  }

  setAllowance(childId: string, amount: number, dayOfWeek: number, description?: string): Promise<{ allowance: Allowance }> {
    return this.call(`/children/${encodeURIComponent(childId)}/allowance`, { method: "PUT", body: JSON.stringify({ amount, dayOfWeek, ...(description ? { description } : {}) }) });
  }

  async clearAllowance(childId: string): Promise<void> {
    const headers = { "content-type": "application/json", ...(await this.identity.headers()) };
    const res = await fetch(`${this.base}/children/${encodeURIComponent(childId)}/allowance`, { method: "DELETE", headers });
    if (!res.ok) throw new ApiError(res.status, res.statusText);
  }

  pledge(childId: string, capability: string, amount: number, note?: string): Promise<{ pledge: Pledge }> {
    return this.call(`/children/${encodeURIComponent(childId)}/pledges`, { method: "POST", body: JSON.stringify({ capability, amount, ...(note ? { note } : {}) }) });
  }

  cancelPledge(childId: string, pledgeId: string): Promise<{ pledge: Pledge }> {
    return this.call(`/children/${encodeURIComponent(childId)}/pledges/${encodeURIComponent(pledgeId)}/cancel`, { method: "POST", body: "{}" });
  }

  /** Freeze or unfreeze the card at the bank. */
  setFrozen(childId: string, frozen: boolean): Promise<{ card: { frozen: boolean } }> {
    return this.call(`/children/${encodeURIComponent(childId)}/card/${frozen ? "freeze" : "unfreeze"}`, { method: "POST", body: "{}" });
  }

  /** Withdraw or restore educational consent. Withdrawn: controls to the bank's defaults, learning stops changing the card. */
  setConsent(childId: string, give: boolean): Promise<{ consent: { givenAt: string; byGuardianId: string; withdrawnAt?: string } | null }> {
    return this.call(`/children/${encodeURIComponent(childId)}/consent/${give ? "restore" : "withdraw"}`, { method: "POST", body: "{}" });
  }

  /** Into the 18 Fund, through the bank. */
  contributeFund(childId: string, amount: number): Promise<{ transaction: Transaction; fund: FundView | null }> {
    return this.call(`/children/${encodeURIComponent(childId)}/fund/contribute`, { method: "POST", body: JSON.stringify({ amount }) });
  }

  audit(childId: string): Promise<{ childId: string; entries: AuditEntry[] }> {
    return this.call(`/children/${encodeURIComponent(childId)}/audit`);
  }
}
