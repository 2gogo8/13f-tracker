#!/usr/bin/env python3
"""
Slope Scanner Data Updater
Fetches historical prices from FMP and short interest from yfinance.
Outputs: data/price_cache.json + data/short_interest.json
"""

import json
import os
import sys
import time
from datetime import datetime, timedelta

import requests

try:
    import yfinance as yf
except ImportError:
    print("yfinance not installed. Run: pip install yfinance")
    sys.exit(1)

API_KEY = os.environ.get("FMP_API_KEY", "3c03eZvjdPpKONYydbgoAT9chCaQDnsp")
BASE_URL = "https://financialmodelingprep.com"
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
RATE_LIMIT_SLEEP = 0.07


def fetch_json(url: str) -> list | dict:
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    return resp.json()


def get_constituents() -> list[str]:
    """Get S&P500 + NASDAQ100 constituents from FMP."""
    symbols: set[str] = set()

    sp500 = fetch_json(f"{BASE_URL}/stable/sp500-constituent?apikey={API_KEY}")
    time.sleep(RATE_LIMIT_SLEEP)
    for item in sp500:
        symbols.add(item["symbol"])

    nasdaq = fetch_json(f"{BASE_URL}/stable/nasdaq-constituent?apikey={API_KEY}")
    time.sleep(RATE_LIMIT_SLEEP)
    for item in nasdaq:
        symbols.add(item["symbol"])

    # Always include benchmarks
    symbols.update(["QQQ", "SPY", "IWM"])
    return sorted(symbols)


def fetch_prices(symbols: list[str]) -> dict:
    """Fetch 18 months of historical prices for all symbols."""
    prices: dict[str, list] = {}
    from_date = (datetime.now() - timedelta(days=550)).strftime("%Y-%m-%d")

    total = len(symbols)
    for i, sym in enumerate(symbols):
        try:
            url = (
                f"{BASE_URL}/stable/historical-price-eod/full"
                f"?symbol={sym}&from={from_date}&apikey={API_KEY}"
            )
            data = fetch_json(url)
            if isinstance(data, list) and len(data) > 0:
                prices[sym] = [
                    {"date": row["date"], "close": row["close"]}
                    for row in data
                    if "date" in row and "close" in row
                ]
            if (i + 1) % 50 == 0:
                print(f"  [{i+1}/{total}] fetched prices...")
            time.sleep(RATE_LIMIT_SLEEP)
        except Exception as e:
            print(f"  WARN: {sym} price fetch failed: {e}")
            time.sleep(RATE_LIMIT_SLEEP)

    return prices


def fetch_short_interest(symbols: list[str]) -> dict:
    """Fetch short interest data from yfinance."""
    short_data: dict[str, dict] = {}
    batch_size = 50
    total = len(symbols)

    for i in range(0, total, batch_size):
        batch = symbols[i : i + batch_size]
        for sym in batch:
            try:
                ticker = yf.Ticker(sym)
                info = ticker.info
                short_pct = info.get("shortPercentOfFloat", 0) or 0
                short_ratio = info.get("shortRatio", 0) or 0
                if short_pct > 0 or short_ratio > 0:
                    short_data[sym] = {
                        "shortPct": round(short_pct * 100, 2) if short_pct < 1 else round(short_pct, 2),
                        "shortRatio": round(short_ratio, 2),
                    }
            except Exception as e:
                print(f"  WARN: {sym} short interest failed: {e}")

        if (i + batch_size) < total:
            print(f"  [{min(i + batch_size, total)}/{total}] fetched short interest...")

    return short_data


def main():
    os.makedirs(DATA_DIR, exist_ok=True)

    print("=== Slope Scanner Data Updater ===")
    print(f"Output dir: {DATA_DIR}")

    # 1. Get constituents
    print("\n[1/3] Fetching constituents...")
    symbols = get_constituents()
    print(f"  Found {len(symbols)} symbols")

    # 2. Fetch prices
    print("\n[2/3] Fetching historical prices (this takes ~5 min)...")
    prices = fetch_prices(symbols)
    print(f"  Got prices for {len(prices)} symbols")

    price_cache = {
        "updated_at": datetime.now().isoformat(),
        "symbols": sorted(prices.keys()),
        "prices": prices,
    }
    price_path = os.path.join(DATA_DIR, "price_cache.json")
    with open(price_path, "w") as f:
        json.dump(price_cache, f)
    print(f"  Saved: {price_path}")

    # 3. Fetch short interest
    print("\n[3/3] Fetching short interest...")
    short_data = fetch_short_interest(symbols)
    print(f"  Got short interest for {len(short_data)} symbols")

    short_interest = {
        "updated_at": datetime.now().isoformat(),
        "data": short_data,
    }
    si_path = os.path.join(DATA_DIR, "short_interest.json")
    with open(si_path, "w") as f:
        json.dump(short_interest, f)
    print(f"  Saved: {si_path}")

    print("\n=== Done ===")


if __name__ == "__main__":
    main()
