# suited-parents

Suited Money for parents, at parents.suited.ae. Approve what your child has earned, hold the limits, switch anything off, see every move. React, TypeScript, Vite. Talks only to the Money service (`suited-money-api`, contract in its `openapi.json`). Never to a bank, never to the learning API.

## Run it against the sandbox

Two terminals.

```
# 1. the Money service on the mock bank, with one enrolled child (Maya)
cd ../suited-money-api && npm run sandbox

# 2. this app
npm ci
npm run dev            # http://localhost:5180, also reachable on your phone over the same wifi (the address Vite prints)
```

Pick "Mum" or "Dad". You will see Maya's capabilities. To make her earn transport, send the sandbox the four lesson signals it prints as step 1 when it starts; the page then shows "Your call" on Transport. Approve it and watch the mock bank's ledger in the sandbox terminal.

With no `VITE_CLERK_PUBLISHABLE_KEY` the app runs in development mode with a guardian picker and sends the `x-guardian-id` header the sandbox accepts. A production build without the key refuses to build.

## Production

- `VITE_CLERK_PUBLISHABLE_KEY`: the parents.suited.ae Clerk application (a second Clerk instance; parents are not learners).
- `VITE_MONEY_API_URL`: where the Money service lives, e.g. `https://money-api.suited.ae`.
- Deployed on Vercel from `main`, SPA rewrite to `index.html`.

## Check it

| Command | What it does |
|---|---|
| `npm run typecheck` | strict TypeScript, zero errors |
| `npm run lint` | strict type-checked lint, zero warnings |
| `npm test` | Vitest (jsdom) |
| `npm run build` | type check then Vite build |

## Rules

- No child data is stored here. The app renders what the Money service returns and forgets it.
- Every action the parent can take maps to one endpoint in the contract. No client-side gate logic, ever.
- Labels come from the service in plain words; the app does not invent states.
- Brand: DIN Round, the Suited palette in solid fills, hard-offset shadows. No gradients, no opacity tints.
