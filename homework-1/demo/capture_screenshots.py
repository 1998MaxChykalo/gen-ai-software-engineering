"""Capture screenshots of the running API for homework documentation.

Drives the Swagger UI ("Try it out" -> Execute) with Playwright so each image
shows a real request and a real server response, then saves task-labeled PNGs
into docs/screenshots/. Requires the API running on http://localhost:8000.

Usage (from homework-1/, venv active, server running):
    pip install playwright && playwright install chromium   # one-off
    python demo/capture_screenshots.py
"""
from __future__ import annotations

import pathlib

from playwright.sync_api import sync_playwright

BASE = "http://localhost:8000"
OUT = pathlib.Path(__file__).resolve().parent.parent / "docs" / "screenshots"
OUT.mkdir(parents=True, exist_ok=True)


def _shot(block_or_page, name: str) -> None:
    path = OUT / name
    block_or_page.screenshot(path=str(path))
    print(f"  saved docs/screenshots/{name}")


def _block(page, method: str, path: str):
    """Locate a Swagger operation block by HTTP method + exact path."""
    return page.locator(f".opblock-{method.lower()}").filter(
        has=page.locator(f'[data-path="{path}"]')
    ).first


def try_it_out(page, method, path, shot_name, *, body=None, inputs=None, selects=None):
    """Expand an operation, click Try it out, fill params, Execute, screenshot.

    body    : JSON string for the request-body editor (POST).
    inputs  : {param_name: value} for text inputs (path/query params).
    selects : {param_name: value} for enum dropdown params.
    """
    page.goto(f"{BASE}/docs", wait_until="networkidle")
    page.wait_for_selector(".opblock", timeout=10000)
    block = _block(page, method, path)
    block.locator(".opblock-summary").click()
    page.wait_for_timeout(300)
    block.get_by_role("button", name="Try it out").click()
    page.wait_for_timeout(300)
    if body is not None:
        block.locator("textarea.body-param__text").fill(body)
    for name, value in (inputs or {}).items():
        block.locator("tr", has_text=name).first.locator("input").first.fill(value)
    for name, value in (selects or {}).items():
        block.locator("tr", has_text=name).first.locator("select").first.select_option(value)
    page.wait_for_timeout(200)
    block.get_by_role("button", name="Execute").click()
    block.locator(".live-responses-table, .responses-table .response").first.wait_for(timeout=8000)
    page.wait_for_timeout(500)
    block.scroll_into_view_if_needed()
    _shot(block, shot_name)


VALID_BODY = (
    '{\n  "fromAccount": "ACC-12345",\n  "toAccount": "ACC-67890",\n'
    '  "amount": 250.75,\n  "currency": "USD",\n  "type": "transfer"\n}'
)
INVALID_BODY = (
    '{\n  "fromAccount": "BAD-ACCOUNT",\n  "toAccount": "ACC-67890",\n'
    '  "amount": -10.999,\n  "currency": "ZZZ",\n  "type": "transfer"\n}'
)


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 1000})

        # Overview (full page).
        print("Swagger UI overview")
        page.goto(f"{BASE}/docs", wait_until="networkidle")
        page.wait_for_selector(".opblock", timeout=10000)
        _shot(page, "01-swagger-overview.png")

        # --- Task 1: Core API ---
        print("Task 1: create (201)")
        try_it_out(page, "POST", "/transactions", "02-task1-create-transaction-201.png", body=VALID_BODY)

        print("Task 1: list")
        try_it_out(page, "GET", "/transactions", "03-task1-list-transactions.png")

        print("Task 1: get by id")
        created = page.request.post(f"{BASE}/transactions", data={
            "fromAccount": "ACC-12345", "toAccount": "ACC-67890",
            "amount": 42.00, "currency": "USD", "type": "transfer",
        })
        txn_id = created.json()["id"]
        try_it_out(page, "GET", "/transactions/{transaction_id}",
                   "04-task1-get-transaction-by-id.png", inputs={"transaction_id": txn_id})

        print("Task 1: balance")
        try_it_out(page, "GET", "/accounts/{account_id}/balance",
                   "05-task1-account-balance.png", inputs={"account_id": "ACC-12345"})

        # --- Task 2: Validation ---
        print("Task 2: validation error (400)")
        try_it_out(page, "POST", "/transactions",
                   "06-task2-validation-error-400.png", body=INVALID_BODY)

        # --- Task 3: History filtering ---
        print("Task 3: filtered list (by accountId)")
        try_it_out(page, "GET", "/transactions", "07-task3-filter-transactions.png",
                   inputs={"accountId": "ACC-12345"})

        # --- Task 4A: Summary / 4C: CSV export ---
        print("Task 4A: account summary")
        try_it_out(page, "GET", "/accounts/{account_id}/summary",
                   "08-task4a-account-summary.png", inputs={"account_id": "ACC-12345"})

        print("Task 4C: CSV export")
        try_it_out(page, "GET", "/transactions/export", "09-task4c-csv-export.png")

        # --- Task 4D: Rate limiting (429) ---
        # Load the UI first, then flood requests from the same IP to exhaust the
        # 100/min budget, then Execute so the response shows HTTP 429.
        print("Task 4D: rate limit (429)")
        try:
            page.goto(f"{BASE}/docs", wait_until="networkidle")
            block = _block(page, "GET", "/")
            block.locator(".opblock-summary").click()
            page.wait_for_timeout(300)
            block.get_by_role("button", name="Try it out").click()
            for _ in range(130):
                page.request.get(f"{BASE}/")
            block.get_by_role("button", name="Execute").click()
            block.locator(".live-responses-table, .responses-table .response").first.wait_for(timeout=8000)
            page.wait_for_timeout(500)
            block.scroll_into_view_if_needed()
            _shot(block, "10-task4d-rate-limit-429.png")
        except Exception as e:  # noqa: BLE001
            print(f"  skipped rate-limit shot: {e}")

        browser.close()
    print("Done.")


if __name__ == "__main__":
    main()
