# Homework 2 — Implementation Plan

> **Model attribution (Context–Model–Prompt):** this plan was produced by **Claude Fable 5**
> (planning/architecture). Implementation (source code + tests) is delegated to
> **Claude Sonnet 5**. Documentation is split between models per Task 4's
> "different AI models for different doc types" requirement — see [Documentation](#6-documentation).

## 1. Decisions of record

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Tech stack | Python 3.11+ / FastAPI / Pydantic v2 | Consistent with homework-1; mature validation + test tooling |
| Storage | Thread-safe in-memory store | Zero setup, deterministic tests; persistence out of scope |
| Classifier | Rule-based keyword scoring | Deterministic, offline, fully unit-testable; no API keys |
| Tests | pytest + httpx `TestClient` + pytest-cov | Coverage gate `--cov-fail-under=85` |

## 2. Project layout

```
homework-2/
├── PLAN.md                     # this file
├── README.md                   # developer docs (Task 4)
├── HOWTORUN.md                 # run & test guide (repo requirement)
├── API_REFERENCE.md            # API consumer docs (Task 4)
├── ARCHITECTURE.md             # tech-lead docs (Task 4)
├── TESTING_GUIDE.md            # QA docs (Task 4)
├── requirements.txt
├── src/
│   ├── __init__.py
│   ├── main.py                 # FastAPI app factory, router wiring, error handlers
│   ├── models.py               # Pydantic models, enums, create/update schemas
│   ├── store.py                # thread-safe in-memory TicketStore (RLock)
│   ├── classifier.py           # rule-based categorization + priority engine
│   ├── importers/
│   │   ├── __init__.py         # dispatch by extension/content-type
│   │   ├── csv_importer.py
│   │   ├── json_importer.py
│   │   └── xml_importer.py
│   └── routes/
│       ├── __init__.py
│       └── tickets.py          # all /tickets endpoints
├── tests/
│   ├── conftest.py             # app/client/store fixtures, fixture-file helpers
│   ├── test_ticket_api.py      # 11 tests — endpoints & status codes
│   ├── test_ticket_model.py    # 9 tests — validation rules
│   ├── test_import_csv.py      # 6 tests
│   ├── test_import_json.py     # 5 tests
│   ├── test_import_xml.py      # 5 tests
│   ├── test_categorization.py  # 10 tests
│   ├── test_integration.py     # 5 tests — end-to-end workflows
│   ├── test_performance.py     # 5 tests — benchmarks
│   └── fixtures/
│       ├── sample_tickets.csv          # 50 valid tickets
│       ├── sample_tickets.json         # 20 valid tickets
│       ├── sample_tickets.xml          # 30 valid tickets
│       ├── invalid_tickets.csv         # mixed valid/invalid rows
│       ├── invalid_tickets.json        # schema violations
│       ├── invalid_tickets.xml         # bad structure/values
│       └── malformed.{csv,json,xml}    # unparseable files
├── demo/
│   └── run_demo.sh             # start server, seed via import, sample calls
└── docs/screenshots/
    └── test_coverage.png       # coverage report evidence
```

## 3. Data model (`models.py`)

- Enums: `Category` (account_access, technical_issue, billing_question,
  feature_request, bug_report, other), `Priority` (urgent, high, medium, low),
  `Status` (new, in_progress, waiting_customer, resolved, closed),
  `Source` (web_form, email, api, chat, phone), `DeviceType` (desktop, mobile, tablet).
- `TicketMetadata`: `source` (required within metadata), `browser`, `device_type`.
- `TicketCreate`: `customer_id`, `customer_email` (`EmailStr`), `customer_name`,
  `subject` (1–200 chars), `description` (10–2000 chars); optional `category`,
  `priority`, `status`, `assigned_to`, `tags`, `metadata`.
- `TicketUpdate`: all fields optional; server manages timestamps.
- `Ticket` (response): adds `id` (UUID4), `created_at`, `updated_at`,
  `resolved_at` (set when status → resolved, cleared if reopened),
  `classification` (nullable — last auto-classify result).
- Defaults: `status=new`, `priority=medium`, `category=other`, `tags=[]`.

## 4. API behavior

| Endpoint | Notes |
|---|---|
| `POST /tickets` | 201 + ticket. Query flag `auto_classify=true` runs classifier on create. 400/422 on validation error. |
| `POST /tickets/import` | Multipart file upload; format from extension with content sniffing fallback. Per-record validation; valid rows import, invalid rows collected. Returns `{total_records, successful, failed, errors: [{record, reason}]}` with 200 (or 400 if the file itself is unparseable). |
| `GET /tickets` | Filters: `category`, `priority`, `status`, `assigned_to`, `tag`, free-text `q` (subject/description); combinable. Pagination `limit`/`offset`. |
| `GET /tickets/{id}` | 404 with JSON error body if missing; 422 on non-UUID. |
| `PUT /tickets/{id}` | Partial update; bumps `updated_at`; manages `resolved_at`. Manual `category`/`priority` set here counts as override (logged). |
| `DELETE /tickets/{id}` | 204 on success, 404 if missing. |
| `POST /tickets/{id}/auto-classify` | Runs classifier, stores result on ticket, returns `{category, priority, confidence, reasoning, keywords_found}`. |

Error envelope for all handled errors: `{"error": {"code", "message", "details"}}`.

## 5. Classifier design (`classifier.py`)

- Keyword tables per category and per priority (from TASKS.md, expanded with
  synonyms), matched case-insensitively on `subject + description` with word
  boundaries; subject hits weighted 2×.
- Category = highest-scoring table; `other` if no hits.
- Priority: first match in order urgent → high → low; default `medium`.
- Confidence = normalized score share of the winning category
  (winner score / total score), clamped to [0, 1]; 0.3 baseline for `other`.
- Response carries human-readable `reasoning` and the matched `keywords_found`.
- Every decision (auto or manual override) appended to an in-memory decision log
  and emitted via `logging` — exposes `classification_log` for tests.

## 6. Documentation

| File | Audience | Authoring model |
|---|---|---|
| PLAN.md | maintainers | **Fable 5** (this file) |
| README.md | developers | **Fable 5** — overview, features, Mermaid architecture diagram, setup, tests, structure |
| ARCHITECTURE.md | tech leads | **Fable 5** — component + Mermaid sequence diagrams (import flow, classify flow), trade-offs, security/perf notes |
| API_REFERENCE.md | API consumers | **Sonnet 5** — every endpoint with request/response JSON + cURL, schemas, error formats |
| TESTING_GUIDE.md | QA | **Sonnet 5** — Mermaid test pyramid, run instructions, fixture locations, manual checklist, benchmark table |
| HOWTORUN.md | graders | **Sonnet 5** — env setup + run + test walkthrough |

≥3 Mermaid diagrams total: architecture (README), sequence ×2 (ARCHITECTURE), test pyramid (TESTING_GUIDE).

## 7. Test plan (≥56 tests, coverage >85%)

- **test_ticket_api (11):** create ok / create invalid (bad email, short description) /
  create with auto_classify flag / list all / list with filter / get by id / get 404 /
  put update / put 404 / delete 204 / delete 404.
- **test_ticket_model (9):** subject length bounds ×2, description bounds ×2,
  email format, enum rejection (category/priority/status), metadata enums, defaults.
- **test_import_csv (6):** 50-row happy path / mixed valid+invalid summary /
  missing required column / malformed file 400 / empty file / error details shape.
- **test_import_json (5):** 20-record happy path / partial failures / not-an-array /
  malformed JSON 400 / wrong types.
- **test_import_xml (5):** 30-record happy path / partial failures / bad root element /
  malformed XML 400 / missing fields per record.
- **test_categorization (10):** one per category ×6 / urgent / high / low /
  default-medium + confidence & keywords asserted throughout.
- **test_integration (5):** full lifecycle (create → classify → assign → resolve → close) /
  bulk import + auto-classification verification / 20+ concurrent creates via threads /
  combined category+priority filter / override after auto-classify persists + logged.
- **test_performance (5):** single create < 50 ms / 50-record CSV import < 2 s /
  list of 1000 < 500 ms / classification < 10 ms / 100 sequential requests throughput.
  Generous thresholds to avoid CI flakiness.
- Coverage: `pytest --cov=src --cov-report=term --cov-report=html --cov-fail-under=85`.

## 8. Execution phases

1. **Scaffold + core** (Sonnet): requirements.txt, models, store, routes, main.
2. **Importers + classifier** (Sonnet): CSV/JSON/XML importers, classification engine, logging.
3. **Fixtures + sample data** (Sonnet): generator-written realistic sample files, invalid & malformed variants.
4. **Tests** (Sonnet): all 8 files; iterate until green with coverage >85%.
5. **Docs** (split per §6) + coverage screenshot + demo script (Fable orchestrates).
6. **PR prep** (Fable): PR_DESCRIPTION.md with AI-usage narrative, screenshots checklist.

## 9. Definition of done

- [ ] All 7 endpoints behave per §4 with correct status codes
- [ ] Import summary reports total/successful/failed with per-record errors
- [ ] Classifier returns category, priority, confidence, reasoning, keywords
- [ ] ≥56 tests pass; coverage >85% enforced by `--cov-fail-under`
- [ ] Sample data: 50 CSV / 20 JSON / 30 XML + invalid + malformed files
- [ ] 6 docs written per §6 with ≥3 Mermaid diagrams
- [ ] `docs/screenshots/test_coverage.png` captured
- [ ] Demo script runs end-to-end
