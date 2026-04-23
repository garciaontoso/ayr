#!/usr/bin/env python3
"""
Convert IB Flex CSV (CLAUDE_FULL-*.csv) to the XML shape expected by
/api/ib-flex-import, then POST it so trades + dividends land in D1.

The Cloudflare endpoint parses `<Trade .../>` and `<CashTransaction .../>`
tags via regex. We don't need a full Flex XML — just the two relevant
section types wrapped in <FlexQueryResponse>.

Usage:  python3 scripts/flex_csv_to_d1.py /path/to/CLAUDE_FULL-3.csv
"""
import csv
import html
import sys
import subprocess

API_URL = "https://api.onto-so.com/api/ib-flex-import"

# CSV column → XML attribute name (matches what worker.js regex looks for)
TRADE_MAP = {
    "Symbol":         "symbol",
    "TradeDate":      "tradeDate",
    "Quantity":       "quantity",
    "TradePrice":     "tradePrice",
    "IBCommission":   "ibCommission",
    "NetCash":        "netCash",
    "AssetClass":     "assetCategory",   # STK or OPT
    "Expiry":         "expiry",
    "Strike":         "strike",
    "Put/Call":       "putCall",
    "Notes/Codes":    "notes",
    "IBOrderID":      "ibOrderID",
}
CTRN_MAP = {
    "Type":             "type",
    "Symbol":           "symbol",
    "SettleDate":       "settleDate",
    "ReportDate":       "reportDate",
    "Amount":           "amount",
    "Description":      "description",
    "CurrencyPrimary":  "currency",
    "FXRateToBase":     "fxRateToBase",
}


def esc(v: str) -> str:
    # Double-quotes are our delimiter — strip them to avoid breaking the regex
    return html.escape(v.replace('"', ''), quote=False)


def row_to_tag(tag_name: str, row: dict, mapping: dict) -> str:
    attrs = []
    for src, dst in mapping.items():
        v = row.get(src, "") or ""
        attrs.append(f'{dst}="{esc(v)}"')
    return f"<{tag_name} {' '.join(attrs)}/>"


def parse_csv(path: str):
    trades, cash = [], []
    trnt_hdr, ctrn_hdr = None, None
    with open(path) as f:
        for row in csv.reader(f):
            if not row:
                continue
            kind, section = row[0], (row[1] if len(row) > 1 else "")
            if kind == "HEADER" and section == "TRNT":
                trnt_hdr = row[2:]
            elif kind == "HEADER" and section == "CTRN":
                ctrn_hdr = row[2:]
            elif kind == "DATA" and section == "TRNT" and trnt_hdr:
                trades.append(dict(zip(trnt_hdr, row[2:])))
            elif kind == "DATA" and section == "CTRN" and ctrn_hdr:
                cash.append(dict(zip(ctrn_hdr, row[2:])))
    return trades, cash


def main():
    if len(sys.argv) < 2:
        print("usage: flex_csv_to_d1.py <path-to-flex.csv>")
        sys.exit(1)
    path = sys.argv[1]
    trades, cash = parse_csv(path)
    print(f"Parsed {len(trades)} trades, {len(cash)} cash txns from {path}")

    trade_tags = [row_to_tag("Trade", t, TRADE_MAP) for t in trades]
    cash_tags = [row_to_tag("CashTransaction", c, CTRN_MAP) for c in cash]
    xml = (
        "<FlexQueryResponse>"
        + "".join(trade_tags)
        + "".join(cash_tags)
        + "</FlexQueryResponse>"
    )

    # POST via curl (CF worker blocks Python default UA)
    print(f"POSTing {len(xml)} bytes to {API_URL} …")
    out_path = "/tmp/flex_payload.xml"
    with open(out_path, "w") as f:
        f.write(xml)
    result = subprocess.run(
        [
            "curl", "-sS", "-X", "POST",
            "-H", "Content-Type: application/xml",
            "--data-binary", f"@{out_path}",
            API_URL,
        ],
        capture_output=True, text=True,
    )
    print("status:", result.returncode)
    print("stdout:", result.stdout)
    if result.stderr:
        print("stderr:", result.stderr)


if __name__ == "__main__":
    main()
