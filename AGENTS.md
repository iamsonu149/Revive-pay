# Second Chance

Build a credible AI-assisted revenue recovery system, not a chatbot. Decisioning is explainable, deterministic and lives in `src/domain`; UI and API routes only orchestrate it. Safety rules are hard server-side controls: one automated retry, two contacts in seven days, no cancelled/refunded/chargeback recovery, approval above ₹10,000, kill switch, idempotency and provider-outage escalation.

Use Prisma + SQLite locally, INR currency, a mock Razorpay adapter by default, and seed data that makes guardrails visible. Keep components presentational and services accountable for audit events.
