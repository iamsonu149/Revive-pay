# Revive Pay

An explainable, deterministic recovery operations demo for failed subscription payments. Next.js, TypeScript, Prisma + SQLite, INR, and a durable mock Razorpay provider. Scores are heuristics, not calibrated recovery probabilities or LLM predictions.

## Local setup

Requires Node.js 20.12+ (verified with Node 22).

```powershell
npm install
Copy-Item .env.example .env
npm run auth:setup
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Open http://localhost:3000/dashboard. The browser requests merchant credentials; read `MERCHANT_USER` and `MERCHANT_PASSWORD` from your local `.env`. Authentication fails closed if credentials are missing or the password is shorter than 16 characters. All pages and API routes require the single merchant administrator identity. API handlers authorize independently of middleware, reject cross-origin mutations, and record the authenticated actor. Keep `.env` private. Use HTTPS if exposing the app beyond localhost; browser Basic authentication is intended for this single-merchant local demo, not a multi-tenant identity system.

`db:seed` **replaces demo data**, including audit history and settings. Do not run it to upgrade an existing database. This workspace was upgraded with a backup under `prisma/backups/`; existing cases were retained. On an older unversioned database, back up first, apply the schema with `prisma db push`, baseline both included migrations (`202609050001_recovery_safety` and `202609050002_approval_amount`) with `prisma migrate resolve --applied <name>`, then run `npm run db:backfill`. Backfill locks legacy executions for review and conservatively timestamps old contact counters for seven days. Legacy provider outcomes cannot be reconstructed automatically.

## AI Recovery Analyst (optional Gemini integration)

The recovery-detail page has an **AI Recovery Analyst** panel. **Analyze case** makes a server-side request to Gemini using only an explicit allowlist: coarse failure/status codes, INR amount, bank-health and engagement signals, payment-history counts, method age, retry/contact counts, an elapsed-time band, and policy/approval/execution state. Names, email addresses, phone numbers, customer/payment identifiers, raw provider responses and credentials are excluded from the prompt. Unknown textual codes are converted to an allowlisted unknown value; no free-form case notes are sent.

Google's [current model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash) lists `gemini-3.8-flash` as stable with structured-output support. This feature uses the [documented generateContent REST structured-output API](https://ai.google.dev/gemini-api/docs/migrate-to-interactions), including its legacy `responseMimeType` and `responseSchema` fields, rather than adding an SDK, to control the timeout, response size and error handling directly. Google's [SDK guidance](https://ai.google.dev/gemini-api/docs/libraries) was also checked. Documentation checked on September 5, 2026.

To enable Gemini locally:

1. Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/apikey).
2. Add these entries to your existing `.env` file, preserving its other values:

   ```dotenv
   GEMINI_API_KEY=your_actual_key_here
   GEMINI_MODEL=gemini-3.8-flash
   ```

3. For an existing checkout, stop the web server before regenerating Prisma's Windows client, then run `npm run db:migrate` and `npm run db:generate`. The analyst migration is additive; **do not reseed** the existing database.
4. Restart development with `npm run dev`. For production mode, run `npm run build` followed by `npm start`. Environment changes require a server restart.
5. Sign in, open a recovery case, and select **Analyze case**. A successful validated response is labeled **Gemini analysis** and shows the requested model and analysis timestamp.

Keep the key server-side; never use `NEXT_PUBLIC_`. No key is required to use the app. Missing credentials, invalid model configuration, timeouts, provider rate limits, provider errors and invalid output produce **Deterministic fallback**, with a specific explanation. A fallback is never labeled as a successful Gemini call. No live Gemini call was verified during implementation because credentials were not configured.

Each analysis includes a diagnosis, references to supplied evidence, one supported proposed action, a rationale, uncertainty, escalation information and an optional customer-message draft. The server strictly validates the shape, bounds and evidence references; rejects unsupported actions, generated URLs and numeric success probabilities; and rechecks proposals through shared deterministic policy/scoring logic. Generated prose remains advisory and should be reviewed for factual accuracy. Drafts use placeholders, are shown as unsent, and are withheld when policy blocks outreach.

Analysis never changes approval, the saved recovery action, payment/subscription state, retry/contact counters or provider executions. The existing controls remain the only route to recovery actions. A different proposal is explicitly advisory. Hard stops, the kill switch, approval, scheduling and existing executions remain authoritative; no model tools or payment functions are exposed to Gemini.

Reliability controls: one provider attempt per admitted request, a 15-second deadline, a 3,072-token generation cap, a 64 KB provider-body cap, a 12,000-character output cap and bounded schema fields. The authenticated endpoint accepts only a UUID request ID, not client-supplied evidence. Persistent SQLite admission limits permit at most 20 new analyses per merchant per hour and one new analysis per case per minute. Concurrent requests for one case are blocked; request-ID retries are deduplicated. Valid Gemini results for the same snapshot/model/prompt are reused for up to ten minutes. GET requests only load saved metadata and do not call Gemini.

Validated analyses and sanitized snapshots are stored separately from recovery state. Audit events record source, model, prompt version, timestamp, fingerprint, policy validation and a bounded fallback reason; they do not store raw provider responses or secrets. Current evidence is compared with the saved fingerprint when the panel loads, after case refreshes, on focus and every 30 seconds. Relevant changes, including contact expiry and timing boundaries, mark the diagnosis **stale**. Policy is checked against current evidence even for a stale analysis. A crashed in-flight request stops blocking a new request after its short lease and cooldown; it never triggers an automatic paid retry.

Automated analyst tests mock Gemini and use isolated databases. The production smoke test explicitly disables Gemini credentials; it cannot make paid calls.

## Running scheduled retries

Run a separate worker alongside the web app:

```powershell
npm run worker
# Or process one batch and exit:
npm run worker:once
```

The worker checks due retries every 30 seconds, up to 100 cases per batch. It uses the same service and safeguards as manual execution. Retries cannot run before their scheduled time or within 24 hours of the failed payment. High-value and review decisions require approval. An authenticated scheduler can alternatively POST to `/api/recoveries/run-due` using the merchant credentials.

## Safety and execution lifecycle

- `src/domain` owns policy, execution, settings validation, simulator and audit behavior. Routes orchestrate services.
- Execution reloads payment and subscription status, amount, settings and customer-wide contact history. Cancellation, refund, chargeback, already-paid state, one previously reserved automated retry, and the contact cap block new actions.
- Limits can only be tightened: approval above ₹10,000 and at most two contacts in seven days are mandatory. Partial setting changes preserve other values, including the kill switch.
- Review is not executable. A merchant must explicitly choose and approve a permitted retry or payment-update link. Approval is bound to the payment amount.
- A SQLite transaction claims one unique execution per case, reserves the retry/contact, and writes an audit event before the provider call. Concurrent claims cannot send another action. Contact reservations are shared across all of a customer's cases and expire after seven days. An uncertain send keeps its reservation conservatively.
- The mock provider persists operations by idempotency key. A successful retry produces a confirmed mock recovery; a declined retry ends in `FAILED`. A sent link remains `EXECUTED` with zero recovered revenue until **Simulate customer payment (mock)** confirms it.
- Provider exceptions produce `NEEDS_REVIEW` and an HTTP 503. Reconciliation looks up the original operation; it never submits another retry. Interrupted database finalization leaves the claim intact. If the provider has no confirmed outcome, the case stays blocked for manual investigation.
- The kill switch blocks admission of new actions; it cannot recall a provider request already admitted. Reconciliation of existing operations remains available while enabled.
- Audit writes for claims, approval, settings and outcomes share transactions with their state changes. Provider errors and blocked policy actions are also logged.

## Demo walkthrough

1. Dashboard starts at zero recovered revenue and displays actual database outcomes.
2. Open a due bank-technical case and execute its one retry.
3. Open a payment over ₹10,000 and approve before execution.
4. Open a review case, choose an action explicitly, and approve it.
5. Send an expired-card payment link, then simulate customer payment to see revenue and audit updates.
6. Inspect cancellation/refund/chargeback, retry-limit and contact-cap cases.
7. The seeded `outage-attempt` escalates to review. Repeated execution stays blocked.
8. Change settings, reload, and verify that the saved kill switch and limits persist.

Operational pages and API reads are dynamic and uncached. Queue and audit searches work, and audit entries are paginated. The simulator compares the current unexecuted failed cases using the same deterministic draw and heuristic score for every strategy. Review/stopped actions recover nothing; no strategy receives an artificial success bonus. Simulated outcomes and contact pressure are illustrative, not evidence of production lift.

## Verification

```powershell
npm test
npm run lint
npm run build
npm run test:smoke
```

Tests cover real SQLite concurrency, contact reservations, retry boundaries, live status/amount checks, approval, schedules, kill switch, outages, lost responses, database finalization failures, reconciliation, settings, authentication and simulator behavior. They use isolated temporary databases. The smoke check requires a completed production build and starts an isolated local server.

The provider remains a mock. `RazorpayTestAdapter` is an alias of that mock, not a live Razorpay integration. A real integration must implement the adapter's idempotency and lookup contract, authenticate provider confirmations and preserve the same service safeguards.
