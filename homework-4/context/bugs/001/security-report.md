# Security Report — Bug Batch 001

**Reviewer:** Security Vulnerabilities Verifier (report only — no code was modified)
**Date:** 2026-08-10
**Input:** [`fix-summary.md`](./fix-summary.md) · [`bug-context.md`](./bug-context.md)

---

## Scope

### Files reviewed

| File | Role in this batch | Lines reviewed |
|------|--------------------|----------------|
| `src/utils.js` | **Changed** — Change 1 (`calculateTotal`), Change 2 (`filterByMonth`) | 1–29 (full) |
| `src/auth.js` | **Changed** — Change 3 (remove hardcoded token, constant-time compare) | 1–17 (full) |
| `src/server.js` | Direct caller of every changed function | 1–93 (full) |
| `src/store.js` | Callee of the `/expenses` and `/admin/reset` paths | 1–31 (full) |
| `package.json` | Dependency posture (zero-dependency constraint) | full |
| `README.md`, `context/bugs/001/**` | Residual-secret sweep | grep sweep |

### Changed-file inventory (per `fix-summary.md` §References)

- `src/utils.js` — Changes 1 and 2
- `src/auth.js` — Change 3

Both were reviewed in full, together with their direct callers (`src/server.js`) and the
state layer they mutate (`src/store.js`), as required by the agent process.

### Verification method

Findings are not read-only guesses; each exploitable claim below was reproduced locally
against the real code (Node v18.16.0) with throwaway probe scripts written to the
scratchpad. Observed output is quoted inline. No project file was created or edited except
this report.

### Checks performed (per agent definition, minimum scope)

Injection (command / code / header / JSON) · hardcoded secrets · insecure comparisons ·
missing/weak input validation incl. types, ranges and prototype pollution · unsafe
dependency usage · XSS / CSRF relevance · regression check on the fixes themselves.

---

## Findings

| ID | Severity | Title | Location | In changed code? |
|----|----------|-------|----------|------------------|
| SEC-001 | **HIGH** | Unauthenticated remote DoS — unhandled exception in async handler crashes the process | `src/server.js:33` | No (caller) |
| SEC-002 | **HIGH** | `amount` type/range never validated — unauthenticated forgery of the `/summary` total | `src/utils.js:24`, `src/utils.js:6` | **Yes** |
| SEC-003 | MEDIUM | No brute-force protection, rate limit or audit log on destructive `POST /admin/reset` | `src/server.js:76-82` | No (caller) |
| SEC-004 | MEDIUM | Unbounded request-body accumulation — memory-exhaustion DoS | `src/server.js:19` | No (caller) |
| SEC-005 | MEDIUM | Unbounded unauthenticated store growth, no field size caps | `src/store.js:18`, `src/server.js:39` | No (callee) |
| SEC-006 | LOW | `isAdmin` length-mismatch early return leaks the admin token's byte length | `src/auth.js:12` | **Yes** |
| SEC-007 | LOW | No authentication on expense read/write endpoints | `src/server.js:39,54,63` | No (caller) |
| SEC-008 | LOW | Missing `X-Content-Type-Options: nosniff`; `description` echoed verbatim | `src/server.js:11` | No (caller) |
| SEC-009 | LOW | Retired credential `admin123` still documented in-repo — must never be reused | `README.md:76` | No (docs) |
| SEC-010 | LOW | `month` query parameter unvalidated — malformed input silently returns `200` + empty | `src/server.js:65-69` | **Yes** (semantics) |
| SEC-011 | INFO | No strength/entropy requirement on `ADMIN_TOKEN` | `src/auth.js:6-7` | **Yes** |
| SEC-012 | INFO | Fail-closed on unset `ADMIN_TOKEN` is indistinguishable from a wrong token | `src/auth.js:7`, `src/server.js:78` | **Yes** |
| SEC-013 | INFO | Verified-clean: injection, prototype pollution, CSRF, dependencies | — | — |

**Counts:** 2 HIGH · 3 MEDIUM · 5 LOW · 3 INFO. No CRITICAL.

---

### SEC-001 — HIGH — Unauthenticated remote DoS: unhandled exception in the async request handler

**Location:** `src/server.js:33` (thrown), `src/server.js:32` (unguarded `async` handler)

```js
32  const server = http.createServer(async (req, res) => {
33    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
```

**Description.** The `Host` request header is fully attacker-controlled and is interpolated
straight into a `new URL(...)` base. A syntactically invalid host makes `new URL` throw
`ERR_INVALID_URL`. Because the handler is `async` and nothing awaits it, the throw becomes
an **unhandled promise rejection**, whose default disposition in Node ≥ 15 is to terminate
the process. There is no `try/catch` anywhere in the handler, so this generalises: *any*
exception on any code path takes the whole server down rather than returning `500`.

**Exploit scenario.** One raw request, no authentication, no valid route needed:

```
GET /health HTTP/1.1
Host: ]
Connection: close
```

Reproduced against `src/server.js`:

```
TypeError [ERR_INVALID_URL]: Invalid URL
    at Server.<anonymous> (src/server.js:33:15)
Node.js v18.16.0
EXIT CODE: 1
```

The process exits with status 1 and the client never receives a response. A single
unauthenticated packet is a complete availability kill; trivially repeatable to defeat any
supervisor restart loop, and it also wipes the entire in-memory store (`src/store.js:6`) —
achieving the same data destruction as `POST /admin/reset` **without** the admin token that
Change 3 was written to protect. That interaction is what elevates this to HIGH.

**Remediation.**
1. Wrap the handler body in `try/catch` and reply `sendJson(res, 500, { error: 'internal error' })`.
2. Do not trust `Host` for URL parsing — parse the path safely and independently, e.g.
   `const url = new URL(req.url, 'http://localhost');` (the base is only needed to satisfy
   the relative-URL form; the real host is never used).
3. Add a process-level `process.on('unhandledRejection', …)` net so a future gap logs rather
   than exits.
4. Optionally validate `Host` against an allow-list if it ever becomes semantically relevant.

---

### SEC-002 — HIGH — `amount` type and range are never validated: unauthenticated forgery of the `/summary` total

**Location:** `src/utils.js:24` (validation gap), `src/utils.js:6` (unchecked accumulation sink)

```js
24    if (body.amount === undefined || body.amount === null) errors.push('amount is required');
```
```js
 5    for (let i = 0; i < expenses.length; i++) {
 6      total += expenses[i].amount;
```

**Description.** `validateExpense` checks only that `amount` is *present*. It asserts
nothing about type, finiteness, sign or magnitude, and `calculateTotal` then applies `+=`
to whatever arrived. Because JavaScript's `+` is overloaded, a non-numeric `amount` does not
error — it silently changes the meaning of the summation. Confirmed behaviour, every case
passing validation with `valid=true`:

| Posted `amount` | `validateExpense` | `calculateTotal` result |
|-----------------|-------------------|--------------------------|
| `"100"` (string) | valid | `100` — coerced, looks fine |
| `{}` | valid | `null` in JSON (`NaN`) |
| `"abc"` | valid | `null` in JSON (`NaN`) |
| `1e309` | valid | `null` in JSON (`Infinity`) |
| `true` | valid | `1` |
| `[5]` | valid | `5` |
| `-999999` | valid | `-999999` |

**Exploit scenario — total forgery (order-dependent concatenation).** `+` on a string
operand concatenates instead of adding, so the *position* of one poisoned record rewrites
every subsequent record's contribution. Reproduced:

```
calculateTotal([{amount:10},{amount:"5"}])  ->  105
calculateTotal([{amount:"5"},{amount:10}])  ->  510
```

An unauthenticated attacker POSTs a single expense with `"amount": "5"` **before** the
legitimate records exist. Every later `GET /summary` reports a fabricated total (`510`
instead of the true `15`) — a remote integrity attack on the application's primary business
output, persisting until an admin reset. This is the same class of wrong-total symptom as
Bug Report #1 that this batch was created to fix: Change 1 closed the off-by-one path to a
wrong total while this input path remains wide open, so the batch's own acceptance criterion
is still reachable by an attacker.

**Exploit scenario — availability/correctness of `/summary`.** Posting `"amount": {}`,
`"amount": "abc"` or `"amount": 1e309` makes `total` `NaN`/`Infinity`; `JSON.stringify`
serialises both as `null`, so `GET /summary` returns `{"count":N,"total":null}` indefinitely.
One request permanently poisons the endpoint for all consumers, and any client doing
arithmetic on `total` breaks downstream.

**Remediation.** In `validateExpense` (`src/utils.js:18-27`), replace the presence check
with a full contract, and make `calculateTotal` defensive in depth:

```js
if (typeof body.amount !== 'number' || !Number.isFinite(body.amount)) {
  errors.push('amount must be a finite number');
} else if (body.amount <= 0 || body.amount > 1_000_000) {
  errors.push('amount must be between 0 and 1000000');
}
```

Also validate `description` (`typeof === 'string'`, non-empty, max length — see SEC-005) and
`date` (`typeof === 'string'` matching `YYYY-MM-DD`, and `!Number.isNaN(Date.parse(...))`);
`filterByMonth` (`src/utils.js:13`) currently calls `new Date(e.date)` on unvalidated input
and silently drops records whose date is unparseable. In `calculateTotal`, skip or reject
non-finite entries rather than accumulating them.

---

### SEC-003 — MEDIUM — No brute-force protection, rate limiting or audit logging on `POST /admin/reset`

**Location:** `src/server.js:76-82`

```js
76  if (req.method === 'POST' && url.pathname === '/admin/reset') {
77    if (!isAdmin(req.headers['x-admin-token'])) {
78      return sendJson(res, 403, { error: 'forbidden' });
```

**Description.** The single most destructive operation in the app (`reset()` wipes all
expenses and resets the id counter, `src/store.js:26-29`) is guarded by one shared bearer
token with no attempt counter, no lockout, no per-IP throttle, and no logging of either
successful or failed attempts. Change 3 correctly made the *comparison* safe but left the
*rate* of guessing unbounded.

**Exploit scenario.** An attacker scripts unlimited `POST /admin/reset` requests with
candidate `x-admin-token` values. Combined with SEC-006 (the exact token length is
recoverable) and SEC-011 (no minimum entropy — an operator may legitimately set
`ADMIN_TOKEN=admin`), an offline-quality dictionary attack becomes an online one at full
network speed. Because nothing is logged, a successful reset leaves no forensic trace: the
operator sees an empty dataset with no record of who emptied it or when, and no failed-attempt
spike to alert on.

**Remediation.** Add per-IP rate limiting with exponential backoff on `/admin/reset`;
log every attempt (timestamp, source IP, outcome) without echoing the supplied token;
alert on failure bursts. Prefer per-operator credentials over one shared token, and require
a confirmation parameter for destructive actions.

---

### SEC-004 — MEDIUM — Unbounded request-body accumulation (memory-exhaustion DoS)

**Location:** `src/server.js:19` (within `readBody`, `src/server.js:15-30`)

```js
18    req.on('data', (chunk) => {
19      raw += chunk;
20    });
```

**Description.** `readBody` concatenates every inbound chunk into one string with no byte
cap, no `Content-Length` pre-check, and no idle timeout. The full body is buffered in memory
before `JSON.parse` is even attempted, so the size limit is the process heap.

**Exploit scenario.** An unauthenticated `POST /expenses` with a multi-gigabyte body (or a
chunked stream that never ends) drives resident memory up until V8 aborts with
out-of-memory. A handful of concurrent connections is enough. The body need not be valid
JSON — the parse only happens at `req.on('end')`, so the memory is consumed regardless and
the eventual `400 invalid JSON body` never arrives.

**Remediation.** Enforce a maximum body size (e.g. 64 KB for this schema): track a running
byte count in the `data` handler, and on exceedance `req.destroy()` after replying `413`.
Reject up front when `Content-Length` exceeds the cap. Add an explicit body-read timeout.
Note Node 18's default `headersTimeout` (60 s) / `requestTimeout` (300 s) blunt pure
slowloris but do nothing about volumetric bodies.

---

### SEC-005 — MEDIUM — Unbounded, unauthenticated store growth with no field size caps

**Location:** `src/store.js:18` (`expenses.push`), reachable via `src/server.js:39` (`POST /expenses`)

**Description.** `POST /expenses` requires no credential (SEC-007) and appends to a
process-lifetime in-memory array (`src/store.js:6`) that is never capped, paged or evicted.
`addExpense` copies `description` and `category` with no length limit (`src/store.js:12,14`),
and `validateExpense` sets no maximum either.

**Exploit scenario.** An attacker loops `POST /expenses` with a maximal-size `description`
(each request individually under any body cap added for SEC-004) until the heap is
exhausted and the process dies — persistent resource-exhaustion DoS that also destroys all
legitimate data on crash. Secondary effect: `GET /expenses` (`src/server.js:54`) serialises
the entire array on every call, so a large store turns each read into a CPU/memory
amplification of the attacker's earlier writes.

**Remediation.** Cap `description`/`category` length in `validateExpense` (e.g. 200/50
chars); impose a maximum record count (or per-source quota) in `addExpense` and return `429`
/ `507` beyond it; move to a bounded, persistent store for anything beyond the demo.

---

### SEC-006 — LOW — `isAdmin` length-mismatch early return leaks the admin token's byte length

**Location:** `src/auth.js:12`

```js
10    const expected = Buffer.from(adminToken, 'utf8');
11    const supplied = Buffer.from(token, 'utf8');
12    if (expected.length !== supplied.length) return false;
13
14    return crypto.timingSafeEqual(supplied, expected);
```

**Description.** The `timingSafeEqual` call itself is correct, and the length guard is
*required* to avoid the `RangeError` that `timingSafeEqual` throws on unequal buffer
lengths — so this is the right structure, not a mistake. It does, however, leave one
residual side channel: the length check short-circuits, so a wrong-length token returns on a
measurably shorter path than a right-length token. The comparison is constant-time *given*
the length, but not across lengths.

**Exploit scenario.** An attacker sends `x-admin-token` values of increasing length and
measures response latency for `POST /admin/reset`. The length whose responses are
consistently slower reveals the exact byte length of `ADMIN_TOKEN`, shrinking the
brute-force keyspace before the search even starts. With SEC-003 (no rate limiting) the
attacker has unlimited samples to average away network noise, and with SEC-011 a short
token becomes practically searchable. Exploiting this over a real network is genuinely
hard — hence LOW — but it is a free win to remove.

**Remediation.** Hash both sides to a fixed width first, so buffer lengths are always equal
and no early return is needed:

```js
const a = crypto.createHash('sha256').update(String(token), 'utf8').digest();
const b = crypto.createHash('sha256').update(adminToken, 'utf8').digest();
return crypto.timingSafeEqual(a, b);
```

Keep the `typeof token !== 'string'` guard at `src/auth.js:8` — it is doing real work
(verified below).

---

### SEC-007 — LOW — No authentication on the expense read/write endpoints

**Location:** `src/server.js:39` (`POST /expenses`), `src/server.js:54` (`GET /expenses`), `src/server.js:63` (`GET /summary`)

**Description.** Only `/admin/reset` is gated. Anyone who can reach the port may create
records and read every stored expense — description, amount, category and date for all
users. There is no notion of an owner or tenant anywhere in the data model
(`src/store.js:10-16`).

**Exploit scenario.** `curl http://host:3000/expenses` returns the complete financial
ledger to an unauthenticated caller; `curl -d '{...}' http://host:3000/expenses` injects
arbitrary records (the delivery mechanism for SEC-002 and SEC-005).

**Assessment.** `src/store.js:3-4` documents this as an intentionally simple demo, and the
app binds a local port with no CORS grant, so **as a local exercise this is an accepted
design choice — rated LOW on that basis.** It becomes MEDIUM/HIGH the moment the process is
exposed beyond localhost.

**Remediation.** If exposure is ever contemplated: require an auth token on all endpoints,
scope records to an owner id, and enforce owner filtering in `listExpenses`. Otherwise
document the localhost-only constraint explicitly and bind to `127.0.0.1`.

---

### SEC-008 — LOW — Missing `X-Content-Type-Options: nosniff`; stored `description` echoed verbatim

**Location:** `src/server.js:11` (`sendJson`), with the reflection at `src/server.js:51` and `src/server.js:60`

```js
11    res.writeHead(status, { 'Content-Type': 'application/json' });
```

**Description.** Responses set a correct `application/json` content type and the app renders
no HTML anywhere, so there is **no direct XSS vector today**. The gap is defensive: no
`nosniff` header, and attacker-controlled `description` is stored raw (`src/store.js:12`)
and echoed back verbatim by both `POST /expenses` (201) and `GET /expenses`. No security
response headers are set at all.

**Exploit scenario.** An attacker POSTs `"description": "<img src=x onerror=alert(document.cookie)>"`.
It is stored and returned unmodified. The payload fires as **stored XSS** in the first
consumer that renders the field as HTML — a future dashboard, an admin UI, a report
generator — with no further attacker action needed; the malicious record is already
persisted server-side. Content sniffing by a legacy browser fetching `/expenses` directly is
a second, narrower path.

**Remediation.** Add `X-Content-Type-Options: nosniff` in `sendJson`, alongside
`Content-Type: application/json; charset=utf-8`. Add
`Content-Security-Policy: default-src 'none'` and `Referrer-Policy: no-referrer` for the API
surface. Treat output encoding as the consumer's obligation but constrain the input anyway
(SEC-002/SEC-005 validation).

---

### SEC-009 — LOW — Retired credential `admin123` still documented in-repo; must never be reused

**Location:** `README.md:76`; also `context/bugs/001/{implementation-plan,fix-summary}.md` and `context/bugs/001/research/*.md`

**Description.** The removed literal is gone from all runtime code — a repo-wide sweep found
zero occurrences under `src/`. Every remaining hit is prose describing the vulnerability that
was fixed, which is legitimate and expected pipeline documentation.

**Exploit scenario.** The realistic risk is operator copy-paste: an engineer reading the
README or the fix summary sets `ADMIN_TOKEN=admin123` because that is the value the
documentation shows. The credential is then a publicly-readable string in a documentation
file, and `POST /admin/reset` is effectively unprotected again — reintroducing the original
Critical concern through configuration rather than code.

**Remediation.** Mark the value in `README.md:76` explicitly as a **burned credential —
never use as `ADMIN_TOKEN`**. Document the real provisioning path: generate with
`openssl rand -hex 32` (or `node -e "console.log(crypto.randomBytes(32).toString('hex'))"`),
store in a secret manager, never in the repo. Add `.env` to `.gitignore` before any `.env`
file is introduced.

**Positive note.** `git ls-files src/` returns empty — `src/` is currently **untracked**, so
the pre-fix `const ADMIN_TOKEN = 'admin123'` was **never committed**. No git-history rewrite
or credential-scrubbing exercise is required. Had it been committed, removal from the working
tree alone would not have been sufficient.

---

### SEC-010 — LOW — `month` query parameter is unvalidated; malformed input silently returns `200` with an empty result

**Location:** `src/server.js:65-69`

```js
65    const month = url.searchParams.get('month'); // format: YYYY-MM
66    if (month) {
67      const [y, m] = month.split('-').map(Number);
68      result = filterByMonth(result, y, m);
```

**Description.** `y` and `m` are passed to `filterByMonth` with no schema, range or
`NaN` check. There is no injection risk — both values are coerced to numbers and only ever
used in `===` comparisons against `getUTCFullYear()`/`getUTCMonth()`, and a `__proto__`
value degrades to `NaN` rather than reaching any property write (confirmed). The issue is
weak input validation and its observability cost. Confirmed behaviour:

| Request | Parsed | Result |
|---------|--------|--------|
| `?month=2026-03` | `y=2026 m=3` | 1 match — correct |
| `?month=2026-12` | `y=2026 m=12` | 1 match — correct (Bug #2 fixed) |
| `?month=2026-13` | `y=2026 m=13` | `200` + empty, no error |
| `?month=2026-00` | `y=2026 m=0` | `200` + empty, no error |
| `?month=abc` | `y=NaN m=undefined` | `200` + empty, no error |
| `?month=__proto__` | `y=NaN m=undefined` | `200` + empty, no prototype write |
| `?month=2026-03-99` | `y=2026 m=3` | 1 match — trailing garbage ignored |

**Exploit scenario.** Low direct severity, but a real correctness trap made newly relevant by
Change 2: `filterByMonth` switched from 0-based (`getMonth()`) to **1-based** month
semantics. Any client still sending the old 0-based value now receives `HTTP 200` with
`{"count":0,"total":0}` instead of an error — a silent wrong answer rather than a visible
failure. The same masking lets an attacker or a broken integration make financial data
appear absent ("no expenses in this month") with no server-side signal, and it suppresses
the monitoring evidence that would otherwise reveal client/server disagreement.

**Remediation.** Validate before filtering: require `/^\d{4}-\d{2}$/`, then
`Number.isInteger(y) && y >= 1970 && y <= 9999` and `m >= 1 && m <= 12`; return
`400 { error: 'month must be YYYY-MM' }` otherwise. Document the 1-based contract in a
JSDoc comment on `filterByMonth` (`src/utils.js:11`) so the boundary change is not
re-broken later.

---

### SEC-011 — INFO — No strength or entropy requirement on `ADMIN_TOKEN`

**Location:** `src/auth.js:6-7`

```js
 6    const adminToken = process.env.ADMIN_TOKEN;
 7    if (!adminToken) return false;
```

**Description.** Only emptiness is checked. A one-character token is accepted and works —
confirmed: `ADMIN_TOKEN="a"` with supplied token `"a"` returns `true`. `""` is correctly
rejected by the falsy check.

**Exploit scenario.** An operator sets a weak value in development and it survives to a
shared environment; combined with SEC-003 (no rate limit) and SEC-006 (length disclosure),
guessing is trivial. The code offers no guardrail and no warning.

**Remediation.** Enforce a minimum length (≥ 32 chars) at startup and refuse to serve
`/admin/reset` — or fail fast on boot — when the configured token is shorter, so
misconfiguration surfaces immediately rather than silently degrading security.

---

### SEC-012 — INFO — Fail-closed on unset `ADMIN_TOKEN` is indistinguishable from a wrong token

**Location:** `src/auth.js:7`, response at `src/server.js:78`

**Description.** Failing closed when `ADMIN_TOKEN` is unset is the **correct** security
choice and is confirmed working (`env=undefined`, token `"admin123"` → `false`). The
observability gap is that a *misconfigured server* and an *unauthorised caller* both produce
an identical bare `403 { error: 'forbidden' }`, with nothing logged.

**Exploit scenario.** Not attacker-driven; it is an incident-response cost. During an outage
an operator cannot tell whether `/admin/reset` is failing because the deployment lost its
env var or because someone is attacking it — and the attack case produces no log line at all
(see SEC-003).

**Remediation.** Log a distinct server-side warning (never to the client) when `ADMIN_TOKEN`
is absent — ideally once at startup — while keeping the client-facing `403` opaque so the
distinction is not leaked to callers.

---

### SEC-013 — INFO — Verified-clean checks

Recorded explicitly so future reviews know these were tested, not skipped:

- **Injection (command / code / dynamic require).** A sweep for `exec`, `execSync`, `spawn`,
  `child_process`, `eval(`, `new Function`, `vm.`, and dynamic `require(... + ...)` across
  `src/` and `tests/` returned **no hits**. The only parser reached by user input is
  `JSON.parse` (`src/server.js:23`), correctly wrapped in `try/catch` there and again by the
  caller (`src/server.js:41-45`), which returns `400 invalid JSON body`. No SQL, no
  templating, no filesystem paths built from request data.
- **Header injection.** `sendJson` (`src/server.js:11`) writes only a fixed literal header;
  no request-derived value reaches `writeHead` or a header name/value. The one place a
  request header is consumed — `req.headers.host` at `src/server.js:33` — is used for URL
  parsing and is never reflected into the response (its distinct crash risk is SEC-001).
- **Prototype pollution — tested, not exploitable.** `JSON.parse` creates `__proto__` as a
  plain *own* property rather than invoking the setter, and `addExpense`
  (`src/store.js:10-16`) enumerates the four fields explicitly instead of merging or
  spreading. There is no `Object.assign` / spread / recursive-merge sink anywhere in `src/`.
  Confirmed: posting `{"__proto__":{"description":"x","amount":1,"date":"2026-01-01"}}` is
  **rejected** by `validateExpense` (all three fields reported missing) and
  `Object.prototype.description` remains `undefined` afterwards.
- **CSRF — not applicable.** The app uses no cookies, sessions or any ambient credential;
  authority comes solely from the explicit `x-admin-token` header. That is not a
  CORS-simple header, so a cross-origin browser cannot attach it without a successful
  preflight, and the server sends no `Access-Control-Allow-*` headers at all. State-changing
  requests are therefore not forgeable from a victim's browser.
- **XSS — no direct vector.** No HTML is generated anywhere; all responses are JSON with a
  correct `Content-Type`. The residual hardening gap is tracked as SEC-008.
- **Dependencies — zero-dependency constraint upheld.** `package.json` declares **no**
  `dependencies` and no `devDependencies`; there is no `node_modules/` and no lockfile.
  Change 3's new import is `node:crypto`, a Node core module using the explicit `node:`
  prefix — which also forecloses any same-name npm package shadowing. `crypto.timingSafeEqual`
  is the correct primitive for this job. **No new supply-chain surface introduced.**

---

## Resolved by this fix batch

### Security Concern #1 (`bug-context.md`) — Critical — **RESOLVED**

The seeded concern was two-part: a credential *hardcoded in the repository* and compared
with a *loose, non-constant-time comparison*. Both parts are confirmed fixed.

| Sub-issue | Pre-fix state | Post-fix state | Verdict |
|-----------|---------------|----------------|---------|
| Hardcoded credential | `const ADMIN_TOKEN = 'admin123';` (`src/auth.js:3`) | Constant removed; value read from `process.env.ADMIN_TOKEN` at call time (`src/auth.js:6`) with **no fallback secret** | **RESOLVED** |
| Loose comparison | `token == ADMIN_TOKEN` — type-coercing `==` | `typeof token !== 'string'` guard (`src/auth.js:8`) + strict byte-length check | **RESOLVED** |
| Non-constant-time comparison | Short-circuiting JS string compare | `crypto.timingSafeEqual` (`src/auth.js:14`) | **RESOLVED** (residual length oracle → SEC-006, LOW) |
| Fails open when misconfigured | N/A (secret always present) | Returns `false` when `ADMIN_TOKEN` is unset or empty (`src/auth.js:7`) — **fails closed** | **RESOLVED** |
| Secret in git history | Would persist after removal | `src/` is untracked; literal was never committed | **NOT APPLICABLE** — no scrubbing needed |

**Independently verified `isAdmin` behaviour matrix** (`src/auth.js`, executed against the
real module):

| `ADMIN_TOKEN` | Supplied token | Result | Assessment |
|---------------|----------------|--------|------------|
| unset | `"admin123"` | `false` | Old credential is dead; fails closed |
| `""` | `"admin123"` | `false` | Empty config rejected |
| `"s3cr3t"` | `"s3cr3t"` | `true` | Correct positive |
| `"s3cr3t"` | `"wrong!"` | `false` | Same length, wrong value — reaches `timingSafeEqual` |
| `"s3cr3t"` | `"s3cr3"` | `false` | Prefix rejected (no partial match) |
| `"s3cr3t"` | `undefined` | `false` | Missing header handled |
| `"s3cr3t"` | `["s3cr3t"]` | `false` | Array type-confusion blocked by the `typeof` guard |
| `"s3cr3t"` | `{length:6}` | `false` | Forged-`length` object blocked; **no throw** |
| `"café"` | `"café"` | `true` | Multi-byte UTF-8 handled (byte-length compare is correct) |

Two robustness points worth recording. First, the `typeof` guard is load-bearing, not
decorative: under the old `==` semantics an object with a spoofed `length` or a
single-element array could reach the comparison, and without the guard `Buffer.from` on a
non-string would throw — crashing the process via SEC-001's unhandled-rejection path. It
correctly returns `false` instead. Second, the length check compares **`Buffer` byte
lengths**, not string lengths, so `timingSafeEqual` can never receive mismatched buffers and
its `RangeError` is unreachable — verified with multi-byte input.

### Bug Report #1 — off-by-one in `calculateTotal` (`src/utils.js:5`) — no security impact

Loop start `1` → `0`. Reviewed for security regression: no new sink, no change to types or
trust boundaries. **Note:** the fix closes the *arithmetic* path to a wrong total; SEC-002
shows the *input-validation* path to a wrong total remains open, so the batch's own
correctness goal is not yet fully defended.

### Bug Report #2 — month indexing and timezone in `filterByMonth` (`src/utils.js:14`) — no security impact

`getFullYear`/`getMonth` → `getUTCFullYear`/`getUTCMonth() + 1`. Reviewed for security
regression: no injection surface, no new sink; moving to UTC removes host-timezone
dependence from a security-relevant audit field (dates). Confirmed `?month=2026-12` now
matches December records. The 0-based → 1-based contract change introduces the
silent-wrong-answer risk tracked as SEC-010 (LOW).

### Regression check on the fix batch — **no new vulnerabilities introduced**

All three changes were reviewed specifically for newly-introduced risk. Change 3 removes a
Critical exposure and adds only a LOW residual side channel (SEC-006) plus two INFO
operational gaps (SEC-011, SEC-012) inherent to any env-var secret scheme. Changes 1 and 2
are arithmetic-only. Every HIGH and MEDIUM finding above is **pre-existing** in code this
batch did not modify (`src/server.js`, `src/store.js`) or a **pre-existing gap in an
unmodified function** of a changed file (`validateExpense`, `src/utils.js:18-27`).

---

## Verdict

**Overall risk of the change set: LOW — the batch is a clear net security improvement and is
APPROVED, with required follow-ups on the surrounding code.**

The three changes do what `fix-summary.md` claims and introduce no new vulnerability. The
seeded Critical concern is genuinely closed: the hardcoded credential is gone from all
runtime code, was never committed to git history, the comparison is now type-safe and
constant-time via `crypto.timingSafeEqual`, and the implementation fails closed when
misconfigured. Change 3 is the right fix, implemented correctly — including the two subtle
details (byte-length comparison, `typeof` guard) that make `timingSafeEqual` safe to call.
The zero-dependency constraint holds.

**Risk of the reviewed surface as a whole is HIGH, and that is where the remaining work is.**
Two HIGH findings sit in code this batch deliberately left untouched:

- **SEC-001** — one malformed `Host` header from an unauthenticated client terminates the
  process (verified, exit code 1) *and* wipes the in-memory store, achieving the same data
  destruction that Change 3 was written to gate behind the admin token. The hardened
  `/admin/reset` door is real, but the wall beside it is missing.
- **SEC-002** — `amount` accepts any type, so an unauthenticated attacker can forge the
  `/summary` total via string concatenation (verified: `510` reported where `15` is correct)
  or pin it to `null` forever. This re-opens Bug Report #1's symptom through a different
  path, defeating the batch's own acceptance criterion.

**Recommendation.** Merge this batch. Then, before any deployment beyond a local demo, fix
SEC-001 and SEC-002 — both are small, well-scoped changes (a `try/catch` plus a
host-independent URL base; a real type/range check in `validateExpense`) that eliminate the
only two HIGH findings. Treat SEC-003 through SEC-005 as the next hardening tranche, and fold
SEC-006 (hash-then-compare) into any future touch of `src/auth.js`.

**Handoff to the Unit Test Generator.** `fix-summary.md` notes that `src/auth.js` has no
test coverage. Beyond the `isAdmin` cases, the security-relevant regression tests worth
generating are: the `isAdmin` matrix reproduced above (especially the non-string
type-confusion inputs and the unset/empty `ADMIN_TOKEN` fail-closed cases); `validateExpense`
rejecting non-numeric, non-finite, negative and out-of-range `amount` (SEC-002); and a
`calculateTotal` case asserting that a string `amount` never concatenates.

**Compliance statement.** Report only — no source file was modified by this review. The sole
file written is this report, `context/bugs/001/security-report.md`.
