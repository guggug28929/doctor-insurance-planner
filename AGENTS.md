# AGENTS.md — Doctor Gug Insurance LINE OA

## Purpose

This repository powers the DoctorGugInsurance LINE OA chatbot and the web premium planner. The assistant must understand natural Thai, remember each LINE user, ask only for missing information, calculate premiums deterministically, and hand medical-underwriting cases to Doctor Gug or a real administrator.

Read this file before changing the project. Permanent product rules belong here.

## Repository map

- `api/line-webhook.js`: LINE signature verification, idempotency, Redis profile persistence, pause/resume/reset, and replies.
- `api/line-agent.js`: AI interpretation of each normal customer turn, structured profile updates, missing questions, recommendation, and handoff.
- `api/premium-quote.js`: deterministic product selection and premium calculation.
- `data/premium-rates.json`: the only premium-rate source used by the web planner and APIs.
- `index.html`: web UI; it must load `data/premium-rates.json` and must not contain a second embedded rate table.
- `test/`: deterministic calculator and conversation-routing tests.

When profile fields change, update the agent schema, default/migration, webhook persistence, calculator normalization, and tests together.

## Authoritative data

`https://www.muangthai-agent.com/` is the owner-approved reference. Product-specific URLs and the verification date are stored in `data/premium-rates.json` under `metadata`.

Rules:

1. Never invent, estimate, or interpolate a premium.
2. Every amount sent to a customer must come from `api/premium-quote.js` and `data/premium-rates.json`.
3. If repository data conflicts with muangthai-agent, use muangthai-agent and record the correction/source.
4. If a published rate is unavailable, ask for a supported age/plan or hand off; do not guess.
5. UI and AI prompts must not duplicate numeric rate tables.
6. Run the test suite after changing rates or eligibility.

## Architecture and safety

- AI interprets every normal customer message through strict structured output. Deterministic keyword matching is a safety net, not the primary language router.
- Deterministic matching is appropriate for reset, pause/resume, webhook security, idempotency, arithmetic, and persistence.
- Verify the LINE signature against the exact raw body.
- Bot pause/handoff is per user, never global.
- Store only the minimum health information needed; do not persist full medical records.
- The latest explicit customer statement overrides older memory.
- Do not ask a question already answered in the same turn or in stored memory.
- LINE replies are natural Thai, concise, end politely with `ครับ`, contain no Markdown or raw links, and must never say `D Health Plus` (use `D Health Lite`).

## Health-history behavior

If a customer discloses a disease, surgery, hospitalization, regular medicine, or abnormal test while still requesting a plan:

1. acknowledge neutrally;
2. continue collecting non-medical planning information;
3. recommend and quote a preliminary plan first;
4. state that acceptance, exclusion, loading, and documents depend on underwriting;
5. set only that user to human mode;
6. hand the conversation to Doctor Gug or staff.

Do not reject or stop before giving useful preliminary planning. Direct underwriting questions such as “โรคนี้รับไหม” must be handed off without speculation.

Negative statements such as `ไม่มีโรคประจำตัว`, `สุขภาพแข็งแรง`, `ไม่เคยผ่าตัด`, and `ผลตรวจปกติ` mean no known history unless contradicted.

## Budget and health-plan rules

The stated annual budget is the target. Prefer a valid package at or below it. Only essential coverage may exceed it, never above 150% without asking. When the customer says the premium is too high, recompute and remove optional extras first.

For room preference below 10,000 baht:

- start with D Health Lite 5 million baht per confinement;
- attach Care Plus 5 million for cancer/chronic kidney failure;
- if eligible and within budget, use Smart Protection 99/20, capital 200,000, with PA Easy Plan 1;
- Smart Protection 99/20 must always attach accident or critical-illness coverage. Never offer it alone;
- a 99/99 main plan must attach PA;
- deductible is used only when the customer requests it or has existing group/policy benefits and the existing amount is known;
- Extra Care Plus Plan 3 + Care Plus is the last health fallback.

For room preference at least 10,000 baht:

- use Elite Health Plus;
- below 50,000 annual budget without confirmed OPD: Elite 20 million;
- at least 50,000 or confirmed OPD: Elite 75 million;
- optional OPD wording does not force Elite 75;
- do not attach Care Plus to Elite;
- do not recommend Elite 40 as the primary choice because its premium is close to 75 million.

Direct latest plan requests override old room rules.

## Critical illness

When a customer is interested in critical illness, first ask whether the priority is:

1. medical expenses;
2. a lump-sum “เจอจ่ายจบ” benefit; or
3. both.

Do not skip this question if the preference is unknown.

- Medical expenses: use the normal D Health Lite + Care Plus or Elite Health Plus flow.
- Lump sum: compare CI Perfect Care, Multiple CI, D Care, and cancer coverage with premiums from the database.
- Both: quote the health package and show lump-sum alternatives separately so alternatives are not accidentally added together.

## Maternity and well-being riders

- Pregnancy, childbirth, or maternity needs: offer Maternity Plus with premium.
- Health check, vaccine, dental, or vision needs: offer Well-Being Plus with premium.
- Neither product can be bought alone. It must attach to D Health Lite or Elite Health Plus.
- Maternity Plus is female age 15-49 with the published 280-day waiting period.
- Well-Being Plus is age 11-90.
- If eligibility does not match, explain it; do not force a quote.

## Retirement-health concern

Recognize natural wording such as fear of unaffordable premiums after retirement, concern about medical bills at retirement, currently having employer/state-enterprise benefits, or wanting to prepare while still working.

Recommend `เมืองไทยเฟล็กซี่ โพรเทคชั่น 99/20` when appropriate:

- issue age 30 days-45 years;
- pay 20 years, coverage to age 99, fixed premium;
- from age 65 through 98, remaining life benefit can be used for eligible IPD/OPD medical expenses up to the insured amount;
- death or maturity benefit is the remaining amount after medical claims, per policy conditions;
- choose the insured amount from the published table based on the customer’s annual budget.

## Tax-deductible savings

If the customer wants savings/tax deduction and does not prioritize life cover, compare Smart Link 15/3 and 15/6. Choose the published capital whose annual premium fits the requested budget. State tax eligibility as subject to Revenue Department rules and do not present non-guaranteed dividends as guaranteed.

## Verification

Before publishing:

1. `npm run check`
2. `npm test`
3. verify the web page loads `data/premium-rates.json`;
4. test at least: critical-preference question, treatment-only, lump-sum comparison, both, maternity, well-being, Flexi retirement, 15/3 and 15/6, health-history quote-then-handoff, and a standard D Health/Elite case;
5. confirm no premium number was generated by the AI layer.
