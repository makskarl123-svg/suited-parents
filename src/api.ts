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
export interface Jar { id: string; name: string; currency: string; balance: number; target?: number; icon?: string; createdAt: string }
export interface FundView { currency: string; balance: number; contributions: Transaction[] }
export interface Decline { id: string; at: string; amount: number; currency: string; description: string; reason: "control_off" | "frozen" | "insufficient" | "over_limit"; control?: string }
/** `source` "suited-record": Suited's own record of confirmed payments and the child's moves, never shown as a bank balance. */
export interface AccountView { currency: string; balance: number; week: { spent: number; limit?: number; startedOn: string }; transactions: Transaction[]; declines?: Decline[]; source?: "bank" | "suited-record" }

/** The child's ask for money. Yes becomes a payment; the amount can be changed on the way. */
export interface TopUpRequest { id: string; childId: string; amount?: number; currency: string; note: string; at: string; status: "pending" | "approved" | "declined"; decidedBy?: string; decidedAt?: string; bankRef?: string; paymentId?: string }

export interface Allowance { amount: number; currency: string; dayOfWeek: number; description: string; setBy: string; lastPaidOn?: string | null; next: { on: string; daysUntil: number } }
export type PledgeReward = { kind: "money"; destination: "card" | "jar" | "fund"; jarId?: string } | { kind: "promise"; title: string };
/** What a reward is for: one thread, or every thread in a subject, of the child's grade. */
export type GoalTarget = { kind: "thread"; domain: string; thread: string } | { kind: "domain"; domain: string };
export type PledgeGoal = GoalTarget & { grade: number };
/** progress: from the reward's gate, or for a thread or subject from the curriculum. */
export interface Pledge { id: string; childId: string; capability: string; gateName: string; goal?: PledgeGoal; progress?: { done: number; total: number }; amount: number; currency: string; note: string; reward?: PledgeReward; madeBy: string; madeAt: string; status: "open" | "due" | "paid" | "cancelled"; autoRelease?: boolean; dueAt?: string; paidAt?: string; bankRef?: string; paymentId?: string; cheers?: { by: string; at: string; from: string | null }[]; cheeredByMe?: boolean }

/** The child's grade, subject by subject and thread by thread, for the reward picker. */
export interface GoalsThread { code: string; name: string; done: number; total: number; lessons: { title: string; done: boolean }[] }
export interface GoalsDomain { code: string; name: string; shortName: string; accent: string; done: number; total: number; threads: GoalsThread[] }
/** pace: lessons a week lately, for "about a week" estimates; null with no recent lessons. */
export interface Goals { childId: string; grade: number; domains: GoalsDomain[]; nextUp: { domain: string; thread: string } | null; pace: number | null }

/**
 * One movement of money to the child, whoever moves it. due: owed (sent by the parent, or waiting for a permission).
 * sent: moving. confirmed: by the bank, or by the parent and the child together. failed: refused.
 */
export type PaymentStatus = "due" | "sent" | "detected" | "confirmed" | "failed";
export interface Payment { id: string; childId: string; kind: "allowance" | "pledge" | "ask" | "top-up"; amount: number; currency: string; description: string; fromGuardianId: string; status: PaymentStatus; history: { status: PaymentStatus; at: string; by: string; note?: string }[]; confirmedBy?: "provider" | "bank-read" | "family"; parentSaidSentAt?: string; childSaidReceivedAt?: string; failureReason?: string; createdAt: string }

/** The child's own account, as Suited shows it. The IBAN stays with the payments provider. */
export interface Payee { label: string; last4: string; registeredAt: string; check?: { result: PayeeCheck["result"]; maskedName?: string; bankName?: string; at: string } | null }

/** The bank's answer to who holds an IBAN. `error`: the check could not run. */
export interface PayeeCheck { result: "match" | "probable" | "review" | "no_match" | "error"; maskedName: string | null; bankName: string | null; active: boolean | null }

/** A standing permission at the parent's bank for Suited to send money to their children's accounts within limits. */
export interface Mandate { id: string; guardianId: string; childIds: string[]; provider: string; authorisationUrl: string; status: "pending" | "active" | "paused" | "ended" | "failed"; limits: { currency: string; maxPerPayment: number; maxPerWeek: number; startDate: string; endDate: string }; createdAt: string; updatedAt: string }

export interface CapabilitiesView { childId: string; gateSet: string; capabilities: CapabilityView[]; account?: AccountView | null; requests?: TopUpRequest[]; allowance?: Allowance | null; pledges?: Pledge[]; card?: { frozen: boolean } | null; consent?: { givenAt: string; byGuardianId: string; withdrawnAt: string | null } | null; jars?: Jar[]; fund?: FundView | null; payments?: Payment[]; payee?: Payee | null; bank?: BankView | null; setup?: PaymentSetup }

/** The child's real balance, read from their bank with the account holder's read-only permission. */
/** matchesAccount false: the account shared at the bank is not the child's account that money is sent to. */
export interface BankView { status: "pending" | "active" | "ended" | "failed"; bankName: string | null; expiresAt: string | null; balance: { amount: number; currency: string; asOf: string; last4: string } | null; matchesAccount?: boolean }
export interface Bank { id: string; name: string; logoUrl?: string }

/** What the payments side can do: whether a child's account can be added, and whether automatic payments exist. */
export interface PaymentSetup { provider: string; acceptsAccounts: boolean; automatic: boolean; readsBalances?: boolean }
export interface Snapshot { capability: string; state: CapabilityState; label: string; earnedAt: string | null; limit: Limit | null }
export interface AuditEntry { at: string; childId: string; capability?: string; what: string; requestId?: string; actor?: string }

export type Verb = "approve" | "not-yet" | "open-early" | "close" | "reopen";
export interface ChildSummary { childId: string; displayName: string; gateSet: string }

/** A connection a parent started from the code on a child's screen. */
export interface PairingSummary { id: string; status: "waiting" | "claimed" | "connected" | "declined" | "cancelled" | "expired"; displayName: string; grade: number; expiresAt: string; decidedAt?: string }

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

  /** The code from the child's screen: whose it is, before agreeing to anything. */
  previewPairing(code: string): Promise<{ displayName: string; grade: number; expiresAt: string }> {
    return this.call("/me/pairing/preview", { method: "POST", body: JSON.stringify({ code }) });
  }

  /** Agree and connect. The parent's identity comes from their sign-in, never from here. */
  claimPairing(code: string, consentVersion: string): Promise<{ status: string; displayName: string; expiresAt: string }> {
    return this.call("/me/pairing/claim", { method: "POST", body: JSON.stringify({ code, consentVersion, agreed: true }) });
  }

  /** Connections this parent started: waiting for the child to say yes, or finished. */
  myPairings(): Promise<{ pairings: PairingSummary[] }> {
    return this.call("/me/pairings");
  }

  capabilities(childId: string): Promise<CapabilitiesView> {
    return this.call(`/children/${encodeURIComponent(childId)}/capabilities`);
  }

  act(childId: string, capability: string, verb: Verb, body: { limit?: Limit; reaskOn?: string } = {}): Promise<Snapshot> {
    return this.call(`/children/${encodeURIComponent(childId)}/capabilities/${encodeURIComponent(capability)}/${verb}`, { method: "POST", body: JSON.stringify(body) });
  }

  /** Money to the child: sent by the provider under a permission, or due for the parent to send. */
  topUp(childId: string, amount: number, description?: string): Promise<{ payment: Payment; transaction?: Transaction; bankRef?: string; account: AccountView | null }> {
    return this.call(`/children/${encodeURIComponent(childId)}/top-up`, { method: "POST", body: JSON.stringify({ amount, ...(description ? { description } : {}) }) });
  }

  payments(childId: string): Promise<{ childId: string; payments: Payment[] }> {
    return this.call(`/children/${encodeURIComponent(childId)}/payments`);
  }

  /** The parent says they sent a due payment in their own banking app. The child confirms it arrived. */
  markSent(childId: string, paymentId: string): Promise<{ payment: Payment }> {
    return this.call(`/children/${encodeURIComponent(childId)}/payments/${encodeURIComponent(paymentId)}/sent`, { method: "POST", body: "{}" });
  }

  /** Add the child's own account with the payments provider. `confirmed`: the parent said yes to a partial name match. */
  setPayee(childId: string, iban: string, holderName: string, accountType: "Savings" | "CurrentAccount", confirmed = false): Promise<{ payee: Payee | null }> {
    return this.call(`/children/${encodeURIComponent(childId)}/payee`, { method: "PUT", body: JSON.stringify({ iban, holderName, accountType, ...(confirmed ? { confirmed: true } : {}) }) });
  }

  /** Confirmation of payee: who the bank says holds this IBAN (masked), and how well it matches the typed name. */
  checkPayee(childId: string, iban: string, holderName: string): Promise<{ check: PayeeCheck }> {
    return this.call(`/children/${encodeURIComponent(childId)}/payee/check`, { method: "POST", body: JSON.stringify({ iban, holderName }) });
  }

  mandates(): Promise<{ guardianId: string; mandates: Mandate[] }> {
    return this.call("/me/mandates");
  }

  /** Start a permission; the parent then opens `authorisationUrl` to approve it at their bank. */
  createMandate(childIds: string[], maxPerPayment: number, maxPerWeek: number, weeks: number): Promise<{ mandate: Mandate }> {
    return this.call("/me/mandates", { method: "POST", body: JSON.stringify({ childIds, maxPerPayment, maxPerWeek, weeks }) });
  }

  setMandatePaused(mandateId: string, paused: boolean): Promise<{ mandate: Mandate }> {
    return this.call(`/me/mandates/${encodeURIComponent(mandateId)}/${paused ? "pause" : "resume"}`, { method: "POST", body: "{}" });
  }

  /** Drop a permission the bank never approved (a wrong account, a bank error page). */
  cancelMandate(mandateId: string): Promise<{ mandate: Mandate }> {
    return this.call(`/me/mandates/${encodeURIComponent(mandateId)}/cancel`, { method: "POST", body: "{}" });
  }

  /** Banks that can share a child's balance. */
  banks(): Promise<{ banks: Bank[] }> {
    return this.call("/banks");
  }

  /**
   * Ask the child's bank for read-only access to the balance; the link is where the account holder approves it.
   * The email the bank needs is the parent's verified sign-in email, which the Money service takes from Clerk.
   */
  connectBankRead(childId: string, bankId: string): Promise<{ authorisationUrl: string; bank: BankView }> {
    return this.call(`/children/${encodeURIComponent(childId)}/bank-read`, { method: "POST", body: JSON.stringify({ bankId }) });
  }

  stopBankRead(childId: string): Promise<{ bank: BankView | null }> {
    return this.call(`/children/${encodeURIComponent(childId)}/bank-read/stop`, { method: "POST", body: "{}" });
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

  pledge(childId: string, capability: string, amount: number, note?: string, reward?: PledgeReward, autoRelease = false): Promise<{ pledge: Pledge }> {
    return this.call(`/children/${encodeURIComponent(childId)}/pledges`, { method: "POST", body: JSON.stringify({ capability, amount, ...(note ? { note } : {}), ...(reward ? { reward } : {}), ...(autoRelease ? { autoRelease: true } : {}) }) });
  }

  /** Every subject and thread of the child's grade with progress, and the thread to suggest first. */
  goals(childId: string): Promise<Goals> {
    return this.call(`/children/${encodeURIComponent(childId)}/goals`);
  }

  /** A reward for finishing a thread or a whole subject. */
  pledgeGoal(childId: string, goal: GoalTarget, amount: number, reward: PledgeReward, autoRelease = false): Promise<{ pledge: Pledge }> {
    return this.call(`/children/${encodeURIComponent(childId)}/pledges`, { method: "POST", body: JSON.stringify({ goal, amount, reward, ...(autoRelease ? { autoRelease: true } : {}) }) });
  }

  /** The parent keeps a due pledge: a promise is marked kept; a money pledge moves the money. */
  releasePledge(childId: string, pledgeId: string): Promise<{ pledge: Pledge }> {
    return this.call(`/children/${encodeURIComponent(childId)}/pledges/${encodeURIComponent(pledgeId)}/release`, { method: "POST", body: "{}" });
  }

  /** A heart for something the child finished. No money moves; the child is told. */
  cheer(childId: string, pledgeId: string): Promise<{ pledge: Pledge }> {
    return this.call(`/children/${encodeURIComponent(childId)}/pledges/${encodeURIComponent(pledgeId)}/cheer`, { method: "POST", body: "{}" });
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
