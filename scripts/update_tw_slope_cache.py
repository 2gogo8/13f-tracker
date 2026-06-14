#!/usr/bin/env python3
"""
台股斜率選股資料更新腳本
- TAIEX：TWSE 官方 API
- 台股價格：yfinance（TWSE + TPEx）
- 輸出：data/tw_price_cache.json
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
# TAIEX — 從 TWSE 官方 API 抓取月份資料
# ─────────────────────────────────────────────────────────
def fetch_taiex(months: list[str]) -> list[dict]:
    """抓取 TAIEX 收盤指數，months 格式如 ['20260501', '20260601']"""
    frames = []
    for m in months:
        url = f"https://www.twse.com.tw/rwd/zh/TAIEX/MI_5MINS_HIST?date={m}&response=json"
        try:
            r = requests.get(url, timeout=15)
            data = r.json()
            if data.get("stat") == "OK" and "data" in data:
                for row in data["data"]:
                    # row[0] = 民國日期 (114/05/20), row[-1] = 收盤指數
                    roc_str = row[0].strip()
                    parts = roc_str.split("/")
                    if len(parts) == 3:
                        year = int(parts[0]) + 1911
                        date_str = f"{year}-{parts[1]}-{parts[2]}"
                        close_str = row[-1].replace(",", "")
                        try:
                            close = float(close_str)
                            frames.append({"date": date_str, "close": close})
                        except ValueError:
                            pass
        except Exception as e:
            print(f"  TAIEX {m} 失敗: {e}")
        time.sleep(0.3)

    frames.sort(key=lambda x: x["date"])
    print(f"  TAIEX: {len(frames)} 個交易日")
    return frames


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

    # 抓最近 6 個月的資料（足夠任意日期查詢）
    today = datetime.now()
    start_date = (today - timedelta(days=200)).strftime("%Y-%m-%d")
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

    print(f"\n[3/3] 批量下載價格 ({len(tickers)} 支，約需 5-8 分鐘)...")
    prices = batch_download_prices(tickers, start_date, end_date)
    print(f"  成功下載: {len(prices)}/{len(tickers)} 支")

    # 組合輸出
    cache = {
        "updated_at": datetime.now().isoformat(),
        "taiex": taiex_data,
        "symbols": sorted(prices.keys()),
        "prices": prices,
        "metadata": metadata,
    }

    out_path = os.path.join(DATA_DIR, "tw_price_cache.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False)

    size_mb = os.path.getsize(out_path) / 1024 / 1024
    print(f"\n✅ 儲存完成：{out_path} ({size_mb:.1f} MB)")
    print(f"   TAIEX: {len(taiex_data)} 交易日")
    print(f"   股票: {len(prices)} 支")
    print("\n=== 完成 ===")


if __name__ == "__main__":
    main()
