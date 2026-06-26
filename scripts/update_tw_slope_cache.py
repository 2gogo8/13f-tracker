#!/usr/bin/env python3
"""
台股斜率選股資料更新腳本 (v2)
- TAIEX：FMP ^TWII
- 台股價格：yfinance（TWSE + TPEx）[temporary source]
- 輸出：data/tw_price_cache.json

修正記錄 (2026-06-26):
  - 延長歷史至 400 天（約 250 個交易日）
  - 加入 merge 保護：新資料若比現有舊，保留現有資料
  - 加入 failed / skipped 記錄
  - 加入 backup 機制（.bak）
  - 加入 --force flag（強制全量更新）
"""

import json
import os
import sys
import time
import requests
import warnings

warnings.filterwarnings('ignore')

try:
    import yfinance as yf
    import pandas as pd
except ImportError:
    print("缺少相依套件。請執行：pip install yfinance pandas")
    sys.exit(1)

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")

# ─────────────────────────────────────────────────────────
# TAIEX — FMP ^TWII（共用 FMP API key）
# ─────────────────────────────────────────────────────────
FMP_KEY = os.environ.get("FMP_API_KEY", "3c03eZvjdPpKONYydbgoAT9chCaQDnsp")

def fetch_taiex_fmp(from_date: str = "2024-01-01") -> list[dict]:
    """TAIEX 收盤指數，來自 FMP ^TWII"""
    url = f"https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=^TWII&from={from_date}&apikey={FMP_KEY}"
    try:
        r = requests.get(url, timeout=20)
        data = r.json()
        if isinstance(data, list) and data:
            frames = sorted(
                [{"date": d["date"], "close": d["close"]} for d in data if "date" in d and "close" in d],
                key=lambda x: x["date"]
            )
            print(f"  TAIEX (FMP ^TWII): {len(frames)} 個交易日，最新={frames[-1]['date']}")
            return frames
    except Exception as e:
        print(f"  TAIEX FMP 失敗: {e}")
    return []


def fetch_taiex(months: list[str]) -> list[dict]:
    """Legacy TWSE fallback — now calls FMP instead."""
    return fetch_taiex_fmp()


# ─────────────────────────────────────────────────────────
# 台股清單 — TWSE + TPEx
# ─────────────────────────────────────────────────────────
def fetch_stock_list() -> list[dict]:
    stocks = []

    # TWSE 上市
    try:
        r = requests.get(
            "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL", timeout=20
        )
        for item in r.json():
            code = item.get("Code", "")
            if code.isdigit() and len(code) == 4:
                stocks.append({
                    "symbol": f"{code}.TW",
                    "name": item.get("Name", code),
                    "sector": "",
                    "exchange": "TWSE",
                })
    except Exception as e:
        print(f"  TWSE 清單失敗: {e}")

    # TPEx 上櫃
    try:
        r = requests.get(
            "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes",
            timeout=20, verify=False,
        )
        for item in r.json():
            code = item.get("SecuritiesCompanyCode", "")
            if code.isdigit() and len(code) == 4:
                stocks.append({
                    "symbol": f"{code}.TWO",
                    "name": item.get("CompanyName", code),
                    "sector": "",
                    "exchange": "TPEx",
                })
    except Exception as e:
        print(f"  TPEx 清單失敗: {e}")

    print(f"  股票清單: {len(stocks)} 支 (TWSE+TPEx)")
    return stocks


# ─────────────────────────────────────────────────────────
# 批量下載價格 — yfinance
# ─────────────────────────────────────────────────────────
def batch_download_prices(
    tickers: list[str],
    start: str,
    end: str,
    batch_size: int = 100,
) -> dict[str, list[dict]]:
    all_prices: dict[str, list[dict]] = {}
    total = len(tickers)

    for i in range(0, total, batch_size):
        batch = tickers[i : i + batch_size]
        pct = (i + len(batch)) / total * 100
        print(f"  下載 {i+1}-{i+len(batch)}/{total} ({pct:.0f}%)...", end="\r")

        try:
            data = yf.download(batch, start=start, end=end, auto_adjust=True, progress=False)
            if data.empty:
                continue
            if isinstance(data.columns, pd.MultiIndex):
                close_df = data["Close"]
            elif "Close" in data.columns:
                close_df = data[["Close"]]
                close_df.columns = batch[:1]
            else:
                continue

            for ticker in batch:
                if ticker in close_df.columns:
                    series = close_df[ticker].dropna()
                    if len(series) > 0:
                        if hasattr(series.index, "tz") and series.index.tz is not None:
                            series.index = series.index.tz_localize(None)
                        records = [
                            {"date": d.strftime("%Y-%m-%d"), "close": round(float(v), 2)}
                            for d, v in zip(series.index, series.values)
                        ]
                        if records:
                            all_prices[ticker] = records
        except Exception as e:
            pass  # skip failed batch silently

        time.sleep(0.3)

    print()
    return all_prices


# ─────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────
def main():
    from datetime import datetime, timedelta

    print("=== 台股斜率快取更新 ===")
    os.makedirs(DATA_DIR, exist_ok=True)

    import shutil
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument('--force', action='store_true', help='強制全量更新，忽略現有 cache')
    args = parser.parse_args()

    # 抓最近 400 天（約 250 個交易日）
    today = datetime.now()
    start_date = (today - timedelta(days=400)).strftime("%Y-%m-%d")
    end_date = (today + timedelta(days=1)).strftime("%Y-%m-%d")

    # 產生需要的月份（TWSE API 按月抓）
    months = []
    d = today - timedelta(days=200)
    while d <= today:
        months.append(d.strftime("%Y%m01"))
        # 往後推一個月
        if d.month == 12:
            d = d.replace(year=d.year + 1, month=1)
        else:
            d = d.replace(month=d.month + 1)
    months = list(dict.fromkeys(months))  # 去重
    # 確保當月一定包含（月份跳躍邏輯可能跳過當月）
    current_month = today.strftime("%Y%m01")
    if current_month not in months:
        months.append(current_month)
    months.sort()

    print(f"\n[1/3] 抓取 TAIEX ({len(months)} 個月)...")
    taiex_data = fetch_taiex(months)

    print("\n[2/3] 抓取台股清單...")
    stocks = fetch_stock_list()

    # 建立 metadata
    metadata: dict[str, dict] = {}
    for s in stocks:
        metadata[s["symbol"]] = {
            "name": s["name"],
            "sector": s["sector"],
            "exchange": s["exchange"],
        }

    tickers = [s["symbol"] for s in stocks]

    # 載入既有 cache（用於 merge 保護）
    out_path = os.path.join(DATA_DIR, "tw_price_cache.json")
    existing_prices: dict[str, list] = {}
    if os.path.exists(out_path) and not args.force:
        try:
            with open(out_path, "r", encoding="utf-8") as f:
                old = json.load(f)
            existing_prices = old.get("prices", {})
            old_latest = max(
                (max(r["date"] for r in v) for v in existing_prices.values() if v),
                default="N/A"
            )
            print(f"  既有 cache 最新個股日期: {old_latest}")
            # Backup before overwrite
            bak_path = out_path + ".bak"
            shutil.copy2(out_path, bak_path)
            print(f"  備份至 {bak_path}")
        except Exception as e:
            print(f"  載入既有 cache 失敗，全量更新: {e}")
            existing_prices = {}

    print(f"\n[3/3] 批量下載價格 ({len(tickers)} 支，約需 5-8 分鐘)...")
    print(f"  [temporary source: yfinance]")
    new_prices = batch_download_prices(tickers, start_date, end_date)
    print(f"  成功下載: {len(new_prices)}/{len(tickers)} 支")

    # Merge 保護：若 yfinance 回傳日期 < 現有，保留現有
    merged_prices: dict[str, list] = {}
    updated_count = 0
    kept_old_count = 0
    failed_symbols = []
    skipped_symbols = []

    all_tickers = set(tickers)
    fetched_tickers = set(new_prices.keys())
    missing_tickers = all_tickers - fetched_tickers

    for sym in tickers:
        new_data = new_prices.get(sym, [])
        old_data = existing_prices.get(sym, [])

        if not new_data and not old_data:
            failed_symbols.append(sym)
            continue

        if not new_data:
            # yfinance 沒抓到，保留舊資料
            merged_prices[sym] = old_data
            skipped_symbols.append(sym)
            kept_old_count += 1
            continue

        new_latest = max(r["date"] for r in new_data)
        old_latest = max(r["date"] for r in old_data) if old_data else "0000-00-00"

        if new_latest >= old_latest:
            merged_prices[sym] = new_data
            updated_count += 1
        else:
            # 新資料比舊資料舊，保留舊資料（防止意外倒退）
            merged_prices[sym] = old_data
            kept_old_count += 1
            skipped_symbols.append(sym)

    # 合併新 metadata（保留既有）
    if existing_prices:
        old_meta = old.get("metadata", {}) if 'old' in dir() else {}
        for sym, meta in old_meta.items():
            if sym not in metadata:
                metadata[sym] = meta

    # 組合輸出
    cache = {
        "updated_at": datetime.now().isoformat(),
        "data_source": "yfinance [temporary]",
        "taiex": taiex_data,
        "symbols": sorted(merged_prices.keys()),
        "prices": merged_prices,
        "metadata": metadata,
    }

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False)

    size_mb = os.path.getsize(out_path) / 1024 / 1024

    # 回報最新個股日期
    if merged_prices:
        latest_stock_date = max(
            (max(r["date"] for r in v) for v in merged_prices.values() if v),
            default="N/A"
        )
    else:
        latest_stock_date = "N/A"

    print(f"\n✅ 儲存完成：{out_path} ({size_mb:.1f} MB)")
    print(f"   TAIEX: {len(taiex_data)} 交易日，最新={taiex_data[-1]['date'] if taiex_data else 'N/A'}")
    print(f"   台股個股最新日期: {latest_stock_date}")
    print(f"   更新: {updated_count} 支 | 保留舊資料: {kept_old_count} 支 | 失敗: {len(failed_symbols)} 支")
    if failed_symbols:
        print(f"   Failed ({len(failed_symbols)}): {failed_symbols[:20]}{'...' if len(failed_symbols)>20 else ''}")
    if skipped_symbols[:5]:
        print(f"   Skipped sample: {skipped_symbols[:5]}")
    print("\n=== 完成 ===")


if __name__ == "__main__":
    main()
