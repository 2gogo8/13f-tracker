#!/usr/bin/env python3
"""
Slope Scanner Data Updater (incremental, FMP-only, no yfinance)
- Builds universe: S&P 500 + NASDAQ clean common stocks (market cap >$500M, US, non-ETF/fund)
- Loads existing price_cache.json and only fetches MISSING symbols
- Saves incrementally every 200 symbols to avoid memory/kill issues
- Benchmarks QQQ/SPY/IWM always preserved
"""

import json
import os
import sys
import time
from datetime import datetime, timedelta

import requests

API_KEY = os.environ.get("FMP_API_KEY", "3c03eZvjdPpKONYydbgoAT9chCaQDnsp")
BASE_URL = "https://financialmodelingprep.com"
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
RATE_LIMIT_SLEEP = 0.07
SAVE_EVERY = 200  # write price_cache every N new symbols


def fetch_json(url: str) -> list | dict:
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    return resp.json()


def save_cache(cache: dict, path: str) -> None:
    with open(path + ".tmp", "w") as f:
        json.dump(cache, f)
    os.replace(path + ".tmp", path)


def get_universe() -> tuple[set[str], set[str], set[str]]:
    """
    Returns (sp500_syms, nasdaq_clean_syms, all_syms_with_benchmarks).
    NASDAQ clean: market cap >$500M, US, isEtf=false, isFund=false,
    isActivelyTrading=true, must have sector, no dot in ticker.
    """
    # S&P 500
    print("  Fetching S&P 500...", flush=True)
    sp500_data = fetch_json(f"{BASE_URL}/stable/sp500-constituent?apikey={API_KEY}")
    sp500 = {x["symbol"] for x in sp500_data if x.get("symbol")}
    time.sleep(RATE_LIMIT_SLEEP)
    print(f"    SP500: {len(sp500)} symbols", flush=True)

    # NASDAQ screener
    print("  Fetching NASDAQ screener...", flush=True)
    screener_url = (
        f"{BASE_URL}/stable/company-screener"
        f"?exchange=NASDAQ&isEtf=false&isFund=false"
        f"&isActivelyTrading=true&marketCapMoreThan=500000000&limit=5000"
        f"&apikey={API_KEY}"
    )
    raw = fetch_json(screener_url)
    time.sleep(RATE_LIMIT_SLEEP)

    nasdaq: set[str] = set()
    skipped = 0
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
        else:
            skipped += 1

    print(f"    NASDAQ raw: {len(raw)}, clean: {len(nasdaq)}, skipped: {skipped}", flush=True)

    all_syms = sp500 | nasdaq | {"QQQ", "SPY", "IWM"}
    print(f"  Total universe: {len(all_syms)} (SP500={len(sp500)}, NASDAQ-clean={len(nasdaq)}, overlap={len(sp500 & nasdaq)})", flush=True)
    return sp500, nasdaq, all_syms


def fetch_symbol_prices(sym: str, from_date: str) -> list:
    url = (
        f"{BASE_URL}/stable/historical-price-eod/full"
        f"?symbol={sym}&from={from_date}&apikey={API_KEY}"
    )
    data = fetch_json(url)
    if isinstance(data, list) and data:
        return [
            {"date": r["date"], "close": r["close"]}
            for r in data
            if "date" in r and "close" in r
        ]
    return []


def main():
    os.makedirs(DATA_DIR, exist_ok=True)
    price_path = os.path.join(DATA_DIR, "price_cache.json")
    from_date = (datetime.now() - timedelta(days=550)).strftime("%Y-%m-%d")

    print("=== Slope Scanner Updater (incremental, FMP-only) ===", flush=True)
    print(f"Output: {price_path}", flush=True)

    # 1. Build universe
    print("\n[1/2] Building universe...", flush=True)
    sp500, nasdaq, all_syms = get_universe()

    # 2. Load existing cache
    print("\n[2/2] Loading existing cache...", flush=True)
    cache: dict = {"prices": {}, "symbols": [], "updated_at": ""}
    if os.path.exists(price_path):
        try:
            cache = json.load(open(price_path))
            print(f"  Loaded existing: {len(cache.get('symbols', []))} symbols", flush=True)
        except Exception as e:
            print(f"  WARN: could not load existing cache: {e}", flush=True)

    existing_syms = set(cache.get("symbols", []))
    to_fetch = sorted(all_syms - existing_syms)
    print(f"  Already have: {len(existing_syms)}", flush=True)
    print(f"  Need to fetch: {len(to_fetch)} new symbols", flush=True)

    # 3. Fetch missing symbols incrementally
    failed: list[str] = []
    empty: list[str] = []
    total = len(to_fetch)

    for i, sym in enumerate(to_fetch):
        try:
            records = fetch_symbol_prices(sym, from_date)
            if records:
                cache["prices"][sym] = records
            else:
                empty.append(sym)
            time.sleep(RATE_LIMIT_SLEEP)
        except Exception as e:
            print(f"  WARN: {sym}: {e}", flush=True)
            failed.append(sym)
            time.sleep(RATE_LIMIT_SLEEP)

        if (i + 1) % 100 == 0:
            print(f"  [{i+1}/{total}] fetched... (failed={len(failed)}, empty={len(empty)})", flush=True)

        # Incremental save every SAVE_EVERY symbols
        if (i + 1) % SAVE_EVERY == 0:
            cache["symbols"] = sorted(cache["prices"].keys())
            cache["updated_at"] = datetime.now().isoformat()
            cache["universe_source"] = "SP500 + NASDAQ screener (FMP, cap>500M, US, no ETF/fund)"
            save_cache(cache, price_path)
            print(f"  [checkpoint] saved {len(cache['symbols'])} symbols", flush=True)

    # Final metadata and save
    cache["symbols"] = sorted(cache["prices"].keys())
    cache["updated_at"] = datetime.now().isoformat()
    cache["universe_source"] = "SP500 + NASDAQ screener (FMP, cap>500M, US, no ETF/fund)"
    cache["universe_sp500"] = len(sp500)
    cache["universe_nasdaq_clean"] = len(nasdaq)
    cache["universe_total"] = len(all_syms)
    cache["failed_symbols"] = failed
    cache["empty_symbols"] = empty
    save_cache(cache, price_path)

    print(f"\n=== Done ===", flush=True)
    print(f"  Total symbols in cache: {len(cache['symbols'])}", flush=True)
    print(f"  Failed: {len(failed)} — {failed[:10]}", flush=True)
    print(f"  Empty (no FMP data): {len(empty)}", flush=True)
    print(f"  NOTE: short_interest.json NOT updated (yfinance excluded)", flush=True)


if __name__ == "__main__":
    main()
