#!/usr/bin/env python3
"""
Slope Scanner Data Updater (incremental, FMP-only, daily-refresh mode)

Universe: S&P 500 + NASDAQ clean common stocks (market cap >$500M, US, non-ETF/fund)
+ QQQ/SPY/IWM benchmarks

Daily refresh behaviour:
  - NEW symbols: fetch full 550-day history
  - STALE symbols (latest date older than 3 days): fetch only recent data from last date
  - FRESH symbols (latest date within 3 days): skip (already up to date)

Checkpoint: saves to price_cache.json every SAVE_EVERY symbols to survive SIGKILL.
NO yfinance. FMP-only.
"""

import json
import os
import time
from datetime import datetime, timedelta, date

import requests

API_KEY = os.environ.get("FMP_API_KEY", "3c03eZvjdPpKONYydbgoAT9chCaQDnsp")
BASE_URL = "https://financialmodelingprep.com"
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
RATE_LIMIT_SLEEP = 0.07
SAVE_EVERY = 100          # checkpoint every N symbols
FRESH_DAYS = 3            # skip if latest date is within this many days of today


def fetch_json(url: str) -> list | dict:
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    return resp.json()


def save_cache(cache: dict, path: str) -> None:
    """Atomic write: temp file → rename."""
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(cache, f)
    os.replace(tmp, path)


def get_universe() -> tuple[set, set, set]:
    """Returns (sp500, nasdaq_clean, all_with_benchmarks)."""
    print("  Fetching S&P 500...", flush=True)
    sp500_raw = fetch_json(f"{BASE_URL}/stable/sp500-constituent?apikey={API_KEY}")
    sp500 = {x["symbol"] for x in sp500_raw if x.get("symbol")}
    time.sleep(RATE_LIMIT_SLEEP)
    print(f"    SP500: {len(sp500)}", flush=True)

    print("  Fetching NASDAQ screener...", flush=True)
    screener_url = (
        f"{BASE_URL}/stable/company-screener"
        f"?exchange=NASDAQ&isEtf=false&isFund=false"
        f"&isActivelyTrading=true&marketCapMoreThan=500000000&limit=5000"
        f"&apikey={API_KEY}"
    )
    raw = fetch_json(screener_url)
    time.sleep(RATE_LIMIT_SLEEP)

    nasdaq: set = set()
    for x in raw:
        sym = x.get("symbol", "")
        if (
            x.get("country") == "US"
            and "." not in sym
            and x.get("sector")
            and not x.get("isEtf", False)
            and not x.get("isFund", False)
        ):
            nasdaq.add(sym)
    print(f"    NASDAQ clean: {len(nasdaq)} (from {len(raw)} raw)", flush=True)

    all_syms = sp500 | nasdaq | {"QQQ", "SPY", "IWM"}
    print(f"  Universe total: {len(all_syms)}", flush=True)
    return sp500, nasdaq, all_syms


def get_fetch_mode(sym: str, existing_prices: dict[str, list]) -> tuple[str, str]:
    """
    Returns (mode, from_date):
      ('skip', '')           - data is fresh, no fetch needed
      ('full', '2024-xx-xx') - new symbol, fetch full history
      ('update', '2026-xx-xx') - stale symbol, fetch from last date + 1
    """
    records = existing_prices.get(sym)
    if not records:
        from_date = (datetime.now() - timedelta(days=550)).strftime("%Y-%m-%d")
        return "full", from_date

    latest_str = max(r["date"] for r in records)
    latest = date.fromisoformat(latest_str)
    days_old = (date.today() - latest).days

    if days_old <= FRESH_DAYS:
        return "skip", ""
    else:
        # Fetch only from the day after latest known date
        next_day = (latest + timedelta(days=1)).strftime("%Y-%m-%d")
        return "update", next_day


def fetch_symbol(sym: str, from_date: str) -> list:
    url = (
        f"{BASE_URL}/stable/historical-price-eod/full"
        f"?symbol={sym}&from={from_date}&apikey={API_KEY}"
    )
    data = fetch_json(url)
    if isinstance(data, list):
        return [
            {"date": r["date"], "close": r["close"]}
            for r in data
            if "date" in r and "close" in r
        ]
    return []


def merge_records(existing: list, new_records: list) -> list:
    """Merge new records into existing, overwriting on date collision."""
    date_map = {r["date"]: r for r in existing}
    for r in new_records:
        date_map[r["date"]] = r
    return sorted(date_map.values(), key=lambda x: x["date"])


def main():
    os.makedirs(DATA_DIR, exist_ok=True)
    price_path = os.path.join(DATA_DIR, "price_cache.json")

    print("=== Slope Cache Updater (daily-refresh, FMP-only) ===", flush=True)
    print(f"Output: {price_path}", flush=True)

    # 1. Build universe
    print("\n[1/2] Building universe...", flush=True)
    sp500, nasdaq, all_syms = get_universe()

    # 2. Load existing cache
    print("\n[2/2] Loading existing cache...", flush=True)
    cache: dict = {"prices": {}, "symbols": []}
    if os.path.exists(price_path):
        try:
            cache = json.load(open(price_path))
            existing_count = len(cache.get("symbols", []))
            print(f"  Existing: {existing_count} symbols", flush=True)
        except Exception as e:
            print(f"  WARN: could not load existing cache: {e}", flush=True)

    existing_prices: dict = cache.get("prices", {})

    # 3. Determine what to fetch for each symbol
    full_list, update_list, skip_list = [], [], []
    for sym in sorted(all_syms):
        mode, from_date = get_fetch_mode(sym, existing_prices)
        if mode == "full":
            full_list.append((sym, from_date))
        elif mode == "update":
            update_list.append((sym, from_date))
        else:
            skip_list.append(sym)

    print(f"  NEW symbols (full fetch): {len(full_list)}", flush=True)
    print(f"  STALE symbols (update): {len(update_list)}", flush=True)
    print(f"  FRESH symbols (skip): {len(skip_list)}", flush=True)

    # 4. Fetch
    to_process = full_list + update_list  # process new first, then updates
    failed: list = []
    empty: list = []
    processed = 0
    total = len(to_process)

    for i, (sym, from_date) in enumerate(to_process):
        mode = "full" if (sym, from_date) in full_list else "update"
        try:
            new_records = fetch_symbol(sym, from_date)
            if new_records:
                if mode == "update" and existing_prices.get(sym):
                    # Merge new records with existing
                    existing_prices[sym] = merge_records(existing_prices[sym], new_records)
                else:
                    existing_prices[sym] = new_records
                processed += 1
            else:
                empty.append(sym)
            time.sleep(RATE_LIMIT_SLEEP)
        except Exception as e:
            print(f"  WARN: {sym}: {e}", flush=True)
            failed.append(sym)
            time.sleep(RATE_LIMIT_SLEEP)

        if (i + 1) % 100 == 0:
            pct = round((i + 1) / total * 100)
            print(f"  [{i+1}/{total}] {pct}% done (ok={processed} fail={len(failed)} empty={len(empty)})", flush=True)

        # Checkpoint
        if (i + 1) % SAVE_EVERY == 0:
            cache["prices"] = existing_prices
            cache["symbols"] = sorted(existing_prices.keys())
            cache["updated_at"] = datetime.now().isoformat()
            save_cache(cache, price_path)
            print(f"  [checkpoint] saved {len(cache['symbols'])} symbols", flush=True)

    # 5. Final save
    cache["prices"] = existing_prices
    cache["symbols"] = sorted(existing_prices.keys())
    cache["updated_at"] = datetime.now().isoformat()
    cache["universe_source"] = "SP500 + NASDAQ screener (FMP, cap>500M, US, no ETF/fund)"
    cache["universe_sp500"] = len(sp500)
    cache["universe_nasdaq_clean"] = len(nasdaq)
    cache["universe_total"] = len(all_syms)
    cache["failed_symbols"] = failed
    cache["empty_symbols"] = empty
    save_cache(cache, price_path)

    print(f"\n=== Done ===", flush=True)
    print(f"  Total in cache: {len(cache['symbols'])}", flush=True)
    print(f"  New: {len(full_list)}, Updated: {len(update_list)}, Skipped: {len(skip_list)}", flush=True)
    print(f"  Failed: {len(failed)} — {failed[:10]}", flush=True)
    print(f"  Empty: {len(empty)}", flush=True)
    print(f"  NOTE: short_interest.json NOT updated (yfinance excluded per policy)", flush=True)


if __name__ == "__main__":
    main()
