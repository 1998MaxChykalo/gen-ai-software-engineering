<!-- Generated with Claude Sonnet 5 as part of the multi-model documentation workflow (see PLAN.md §6) -->

# API Reference — Intelligent Customer Support System

Audience: **API consumers** integrating with the ticket API.

Base URL used throughout this document: `http://localhost:8000`. Interactive OpenAPI docs are served at `/docs` (Swagger UI) once the server is running.

All request/response bodies are JSON (`application/json`) except `POST /tickets/import`, which accepts `multipart/form-data`. All timestamps are timezone-aware UTC ISO-8601 strings (e.g. `2026-07-16T16:23:22.837204Z`).

## Table of contents

- [Endpoints](#endpoints)
  - [POST /tickets](#post-tickets)
  - [POST /tickets/import](#post-ticketsimport)
  - [GET /tickets](#get-tickets)
  - [GET /tickets/{id}](#get-ticketsid)
  - [PUT /tickets/{id}](#put-ticketsid)
  - [DELETE /tickets/{id}](#delete-ticketsid)
  - [POST /tickets/{id}/auto-classify](#post-ticketsidauto-classify)
  - [GET /](#get-)
- [Data model](#data-model)
- [Error response format](#error-response-format)

---

## Endpoints

### POST /tickets

Create a new support ticket.

**Query parameters**

| Name | Type | Default | Description |
|---|---|---|---|
| `auto_classify` | boolean | `false` | If `true`, runs the rule-based classifier against `subject` + `description` immediately after creation and stores the result (`category`, `priority`, `classification`) on the ticket. |

**Request body** (`TicketCreate`)

```json
{
  "customer_id": "CUST-1000",
  "customer_email": "alice.nguyen@example.com",
  "customer_name": "Alice Nguyen",
  "subject": "Cannot log in to my account",
  "description": "I forgot my password and cannot access my account, this is critical.",
  "category": null,
  "priority": null,
  "status": null,
  "assigned_to": null,
  "tags": ["vip"],
  "metadata": {
    "source": "web_form",
    "browser": "Chrome",
    "device_type": "desktop"
  }
}
```

Only `customer_id`, `customer_email`, `customer_name`, `subject`, and `description` are required. See [Data model](#data-model) for field constraints and enum values.

**Response — `201 Created`**

```json
{
  "id": "ef398e67-d557-4935-b054-bbfce6182d2a",
  "customer_id": "CUST-1000",
  "customer_email": "alice.nguyen@example.com",
  "customer_name": "Alice Nguyen",
  "subject": "Cannot log in to my account",
  "description": "I forgot my password and cannot access my account, this is critical.",
  "category": "other",
  "priority": "medium",
  "status": "new",
  "created_at": "2026-07-16T16:23:22.837204Z",
  "updated_at": "2026-07-16T16:23:22.837204Z",
  "resolved_at": null,
  "assigned_to": null,
  "tags": ["vip"],
  "metadata": {
    "source": "web_form",
    "browser": "Chrome",
    "device_type": "desktop"
  },
  "classification": null
}
```

If `auto_classify=true`, `category`, `priority`, and `classification` reflect the classifier's output instead of the defaults, for example:

```json
{
  "category": "account_access",
  "priority": "urgent",
  "classification": {
    "category": "account_access",
    "priority": "urgent",
    "confidence": 1.0,
    "reasoning": "Category 'account_access' matched keywords: log in, password, cannot log in. Priority 'urgent' triggered by: cannot access, critical.",
    "keywords_found": ["log in", "password", "cannot log in", "cannot access", "critical"]
  }
}
```

**Status codes**

| Code | Meaning |
|---|---|
| `201` | Ticket created. |
| `422` | Request body failed validation (bad email, subject/description length, invalid enum value). |

**cURL**

```bash
curl -X POST http://localhost:8000/tickets \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "CUST-1000",
    "customer_email": "alice.nguyen@example.com",
    "customer_name": "Alice Nguyen",
    "subject": "Cannot log in to my account",
    "description": "I forgot my password and cannot access my account, this is critical.",
    "tags": ["vip"],
    "metadata": {"source": "web_form", "browser": "Chrome", "device_type": "desktop"}
  }'
```

With auto-classification on create:

```bash
curl -X POST "http://localhost:8000/tickets?auto_classify=true" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "CUST-1000",
    "customer_email": "alice.nguyen@example.com",
    "customer_name": "Alice Nguyen",
    "subject": "Cannot log in to my account",
    "description": "I forgot my password and cannot access my account, this is critical."
  }'
```

---

### POST /tickets/import

Bulk-import tickets from a CSV, JSON, or XML file. The format is detected from the filename extension first, then the `Content-Type` header, then by sniffing the first bytes of the file content (`{`/`[` → JSON, `<` → XML, otherwise CSV).

Invalid *individual records* never abort the import — they are collected into `errors` and the rest of the file is still processed. Only a structurally unparseable *file* (bad encoding, malformed JSON/XML, wrong XML root element, missing required CSV columns) returns an error for the whole request.

**Query parameters**

| Name | Type | Default | Description |
|---|---|---|---|
| `auto_classify` | boolean | `false` | If `true`, runs the classifier on every successfully imported record. |

**Request body**: `multipart/form-data` with a single field `file` containing the upload.

**Response — `200 OK`** (`ImportSummary`)

```json
{
  "total_records": 50,
  "successful": 50,
  "failed": 0,
  "errors": []
}
```

With partial failures:

```json
{
  "total_records": 7,
  "successful": 3,
  "failed": 4,
  "errors": [
    {
      "record": {
        "customer_id": "CUST-2001",
        "customer_email": "not-an-email",
        "customer_name": "Bad Email User",
        "subject": "App crashes on startup",
        "description": "The mobile app crashes immediately every time I open it after the splash screen.",
        "tags": []
      },
      "reason": "customer_email: value is not a valid email address: An email address must have an @-sign."
    }
  ]
}
```

**Status codes**

| Code | Meaning |
|---|---|
| `200` | File parsed; see `successful`/`failed` for per-record outcomes (even an empty file returns `200` with all counts at `0`). |
| `400` | The file itself could not be parsed — undecodable bytes, malformed CSV/JSON/XML, wrong XML root element (`<tickets>` expected), missing required CSV column, JSON payload not an array (or `{"tickets": [...]}`) of objects. |
| `422` | Multipart body missing the `file` field entirely. |

**Error body example (`400`)**

```json
{
  "error": {
    "code": "import_parse_error",
    "message": "CSV file is missing required column(s): description",
    "details": null
  }
}
```

**cURL — CSV import**

```bash
curl -X POST http://localhost:8000/tickets/import \
  -F "file=@tests/fixtures/sample_tickets.csv;type=text/csv"
```

**cURL — CSV import with auto-classification**

```bash
curl -X POST "http://localhost:8000/tickets/import?auto_classify=true" \
  -F "file=@tests/fixtures/sample_tickets.csv;type=text/csv"
```

**cURL — JSON / XML import**

```bash
curl -X POST http://localhost:8000/tickets/import \
  -F "file=@tests/fixtures/sample_tickets.json;type=application/json"

curl -X POST http://localhost:8000/tickets/import \
  -F "file=@tests/fixtures/sample_tickets.xml;type=application/xml"
```

**Supported CSV columns**: `customer_id, customer_email, customer_name, subject, description` (required); `category, priority, status, assigned_to` (optional, must match enum values); `tags` (optional, `;`-separated, e.g. `vip;follow-up`); `source, browser, device_type` (optional — flattened into the `metadata` object; `source` must be present for `metadata` to be built).

**Supported JSON shape**: a top-level array of ticket objects, or `{"tickets": [...]}`. Each object's keys mirror `TicketCreate` (nested `metadata`, array `tags`).

**Supported XML shape**: root `<tickets>` containing repeated `<ticket>` elements with child elements matching `TicketCreate` field names, `<tags><tag>...</tag></tags>` for tags, and a nested `<metadata>` element for `source`/`browser`/`device_type`.

---

### GET /tickets

List tickets with optional filters and pagination. All filters combine with AND.

**Query parameters**

| Name | Type | Description |
|---|---|---|
| `category` | enum (`Category`) | Exact match on category. |
| `priority` | enum (`Priority`) | Exact match on priority. |
| `status` | enum (`Status`) | Exact match on status. |
| `assigned_to` | string | Exact match on assignee. |
| `tag` | string | Ticket must have this exact tag in its `tags` list. |
| `q` | string | Case-insensitive substring match against `subject` OR `description`. |
| `limit` | integer, 1–10000 | Max number of results returned. |
| `offset` | integer, ≥0, default `0` | Number of (sorted-by-`created_at`) results to skip before applying `limit`. |

Results are always sorted by `created_at` ascending before filters/pagination are applied.

**Response — `200 OK`**

```json
[
  {
    "id": "3ebd8a5b-c27d-4d24-b37a-d0c8af777ad3",
    "customer_id": "CUST-1000",
    "customer_email": "alice.nguyen0@example.com",
    "customer_name": "Alice Nguyen",
    "subject": "Password reset link is broken",
    "description": "The password reset email link takes me to an error page...",
    "category": "other",
    "priority": "medium",
    "status": "new",
    "created_at": "2026-07-16T16:24:12.405163Z",
    "updated_at": "2026-07-16T16:24:12.405163Z",
    "resolved_at": null,
    "assigned_to": null,
    "tags": ["follow-up", "vip"],
    "metadata": {"source": "email", "browser": "Firefox", "device_type": "tablet"},
    "classification": null
  }
]
```

**Status codes**

| Code | Meaning |
|---|---|
| `200` | Always returned (empty array `[]` if no tickets match). |
| `422` | An enum query param (`category`/`priority`/`status`) has an invalid value, or `limit`/`offset` are out of range. |

**cURL**

```bash
curl "http://localhost:8000/tickets"

curl "http://localhost:8000/tickets?category=billing_question&priority=urgent"

curl "http://localhost:8000/tickets?tag=vip&q=refund&limit=10&offset=0"
```

---

### GET /tickets/{id}

Fetch a single ticket by id.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `ticket_id` | UUID | Ticket identifier. |

**Response — `200 OK`**: a `Ticket` object (same shape as [POST /tickets](#post-tickets) response).

**Status codes**

| Code | Meaning |
|---|---|
| `200` | Ticket found. |
| `404` | No ticket with that id exists. |
| `422` | `ticket_id` path segment is not a valid UUID. |

**cURL**

```bash
curl "http://localhost:8000/tickets/ef398e67-d557-4935-b054-bbfce6182d2a"
```

---

### PUT /tickets/{id}

Partially update a ticket. Only fields present in the request body are changed (`TicketUpdate` — all fields optional). Server always bumps `updated_at`.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `ticket_id` | UUID | Ticket identifier. |

**Request body** (`TicketUpdate`, all fields optional)

```json
{
  "status": "resolved",
  "assigned_to": "agent-7"
}
```

**Status-transition side effects**

- Setting `status` to `resolved` sets/refreshes `resolved_at` to the current time.
- Setting `status` to `closed` leaves `resolved_at` unchanged (keeps the original resolution time if the ticket was previously resolved; stays `null` if it was closed directly).
- Setting `status` to any other value (`new`, `in_progress`, `waiting_customer`) — i.e. reopening — clears `resolved_at` back to `null`.
- Including `category` and/or `priority` in the body counts as a **manual override**: the ticket's `classification` field is replaced with a synthetic result (`confidence: 1.0`, `reasoning: "Manual override applied via PUT /tickets/{id}."`, `keywords_found: []`), and the override is appended to the server's in-memory classification log.

**Response — `200 OK`**

```json
{
  "id": "ef398e67-d557-4935-b054-bbfce6182d2a",
  "customer_id": "CUST-1000",
  "customer_email": "alice.nguyen@example.com",
  "customer_name": "Alice Nguyen",
  "subject": "Cannot log in to my account",
  "description": "I forgot my password and cannot access my account, this is critical.",
  "category": "other",
  "priority": "medium",
  "status": "resolved",
  "created_at": "2026-07-16T16:23:22.837204Z",
  "updated_at": "2026-07-16T16:25:01.112009Z",
  "resolved_at": "2026-07-16T16:25:01.112009Z",
  "assigned_to": "agent-7",
  "tags": [],
  "metadata": null,
  "classification": null
}
```

**Status codes**

| Code | Meaning |
|---|---|
| `200` | Ticket updated. |
| `404` | No ticket with that id exists. |
| `422` | Body failed validation, or `ticket_id` is not a valid UUID. |

**cURL**

```bash
curl -X PUT http://localhost:8000/tickets/ef398e67-d557-4935-b054-bbfce6182d2a \
  -H "Content-Type: application/json" \
  -d '{"status": "resolved", "assigned_to": "agent-7"}'
```

Manual category/priority override:

```bash
curl -X PUT http://localhost:8000/tickets/ef398e67-d557-4935-b054-bbfce6182d2a \
  -H "Content-Type: application/json" \
  -d '{"category": "technical_issue", "priority": "high"}'
```

---

### DELETE /tickets/{id}

Delete a ticket.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `ticket_id` | UUID | Ticket identifier. |

**Response — `204 No Content`**: empty body.

**Status codes**

| Code | Meaning |
|---|---|
| `204` | Ticket deleted. |
| `404` | No ticket with that id exists. |
| `422` | `ticket_id` is not a valid UUID. |

**cURL**

```bash
curl -X DELETE http://localhost:8000/tickets/ef398e67-d557-4935-b054-bbfce6182d2a -i
```

---

### POST /tickets/{id}/auto-classify

Run the rule-based classifier against the ticket's current `subject` + `description`, persist the result on the ticket (`category`, `priority`, `classification`, `updated_at`), and log the decision.

**Path parameters**

| Name | Type | Description |
|---|---|---|
| `ticket_id` | UUID | Ticket identifier. |

**Response — `200 OK`**

```json
{
  "category": "billing_question",
  "priority": "medium",
  "confidence": 0.833,
  "reasoning": "Category 'billing_question' matched keywords: refund, charged, subscription. No priority keywords matched; defaulted to 'medium'.",
  "keywords_found": ["refund", "charged", "subscription"]
}
```

**Status codes**

| Code | Meaning |
|---|---|
| `200` | Classification computed and stored. |
| `404` | No ticket with that id exists. |
| `422` | `ticket_id` is not a valid UUID. |

**cURL**

```bash
curl -X POST http://localhost:8000/tickets/ef398e67-d557-4935-b054-bbfce6182d2a/auto-classify
```

---

### GET /

Service metadata / liveness check.

**Response — `200 OK`**

```json
{
  "name": "Intelligent Customer Support System",
  "docs": "/docs",
  "version": "1.0.0"
}
```

**cURL**

```bash
curl http://localhost:8000/
```

---

## Data model

### Ticket (response body)

| Field | Type | Constraints |
|---|---|---|
| `id` | string (UUID4) | Server-generated. |
| `customer_id` | string | Min length 1. |
| `customer_email` | string (email) | Validated via `EmailStr` (RFC-style address, must contain `@`). |
| `customer_name` | string | Min length 1. |
| `subject` | string | 1–200 characters. |
| `description` | string | 10–2000 characters. |
| `category` | enum `Category` | Default `other`. |
| `priority` | enum `Priority` | Default `medium`. |
| `status` | enum `Status` | Default `new`. |
| `created_at` | datetime (UTC, ISO-8601) | Server-set at creation, immutable. |
| `updated_at` | datetime (UTC, ISO-8601) | Server-set; bumped on every `PUT`. |
| `resolved_at` | datetime (UTC, ISO-8601) or `null` | Set when status transitions to `resolved`; cleared on reopen (see [PUT /tickets/{id}](#put-ticketsid)). |
| `assigned_to` | string or `null` | Free text (e.g. agent id). |
| `tags` | array of string | Default `[]`. |
| `metadata` | object (`TicketMetadata`) or `null` | See below. |
| `classification` | object (`ClassificationResult`) or `null` | Populated after auto-classify (on create with `auto_classify=true`, via `POST /tickets/{id}/auto-classify`, or a manual override via `PUT`). |

### TicketMetadata

| Field | Type | Constraints |
|---|---|---|
| `source` | enum `Source` | **Required** if `metadata` is present. |
| `browser` | string or `null` | Optional free text. |
| `device_type` | enum `DeviceType` | Optional. |

### ClassificationResult

| Field | Type | Constraints |
|---|---|---|
| `category` | enum `Category` | Winning category. |
| `priority` | enum `Priority` | Detected priority. |
| `confidence` | float | `0.0`–`1.0`. `0.3` baseline when category is `other`. |
| `reasoning` | string | Human-readable explanation of which keywords drove the decision. |
| `keywords_found` | array of string | Matched keywords (category keywords, then priority keywords, de-duplicated, order preserved). |

### ImportSummary (response of `POST /tickets/import`)

| Field | Type | Description |
|---|---|---|
| `total_records` | integer | Records found in the file. |
| `successful` | integer | Records that passed validation and were stored. |
| `failed` | integer | Records that failed validation. |
| `errors` | array of `{record, reason}` | `record` is the raw (unvalidated) parsed dict; `reason` is a human-readable validation message. |

### Enums — allowed values

| Enum | Values |
|---|---|
| `Category` | `account_access`, `technical_issue`, `billing_question`, `feature_request`, `bug_report`, `other` |
| `Priority` | `urgent`, `high`, `medium`, `low` |
| `Status` | `new`, `in_progress`, `waiting_customer`, `resolved`, `closed` |
| `Source` | `web_form`, `email`, `api`, `chat`, `phone` |
| `DeviceType` | `desktop`, `mobile`, `tablet` |

### Field constraints summary

| Field | Rule |
|---|---|
| `customer_id`, `customer_name` | Non-empty string (min length 1). |
| `customer_email` | Must be a syntactically valid email address (Pydantic `EmailStr`). |
| `subject` | 1–200 characters. |
| `description` | 10–2000 characters. |
| `tags` | Array of strings; defaults to `[]`. |

---

## Error response format

Every handled error (validation failures, 404s, unmatched routes, import parse errors) uses the same envelope:

```json
{
  "error": {
    "code": "string",
    "message": "string",
    "details": null
  }
}
```

`details` is either `null`, or (for validation errors) an array of `{"field", "message"}` objects.

### Validation error (422)

```json
{
  "error": {
    "code": "validation_error",
    "message": "Request validation failed",
    "details": [
      {
        "field": "customer_email",
        "message": "value is not a valid email address: An email address must have an @-sign."
      },
      {
        "field": "description",
        "message": "String should have at least 10 characters"
      }
    ]
  }
}
```

### Not found (404)

```json
{
  "error": {
    "code": "ticket_not_found",
    "message": "Ticket '00000000-0000-0000-0000-000000000000' not found",
    "details": null
  }
}
```

### Unmatched route (404)

Any path that doesn't match a defined route also returns the same envelope, with code `http_error`:

```json
{
  "error": {
    "code": "http_error",
    "message": "Not Found",
    "details": null
  }
}
```

### Unparseable import file (400)

```json
{
  "error": {
    "code": "import_parse_error",
    "message": "Could not decode CSV file as UTF-8: 'utf-8' codec can't decode byte 0xff in position 118: invalid start byte",
    "details": null
  }
}
```

Other `import_parse_error` messages you may encounter:

- `"CSV file is missing required column(s): description"`
- `"Malformed CSV file: <csv module error>"`
- `"Malformed JSON file: <json module error>"`
- `"JSON file must contain an array of ticket records"`
- `"Each ticket record must be a JSON object"`
- `"Malformed XML file: <ElementTree error>"`
- `"Expected root element '<tickets>', found '<notes>'"`
