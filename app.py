from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Dict, List

from flask import Flask, jsonify, render_template, request
import yfinance as yf


APP_ROOT = Path(__file__).parent
DB_PATH = APP_ROOT / "trades.db"

app = Flask(__name__)


def init_db() -> None:
    """Create the trades table if it does not already exist."""
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS trades (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ticker TEXT NOT NULL,
                buy_date TEXT NOT NULL,
                buy_price REAL NOT NULL,
                quantity REAL NOT NULL
            )
            """
        )


def get_db_connection() -> sqlite3.Connection:
    """Return a SQLite connection with row factory set for dictionaries."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/trades", methods=["POST"])
def add_trade():
    data = request.get_json(force=True, silent=True) or {}

    ticker = str(data.get("ticker", "")).strip().upper()
    buy_date = str(data.get("buy_date", "")).strip()
    buy_price = data.get("buy_price")
    quantity = data.get("quantity")

    errors = []
    if not ticker:
        errors.append("Ticker is required.")
    if not buy_date:
        errors.append("Buy date is required.")

    try:
        buy_price = float(buy_price)
        if buy_price <= 0:
            errors.append("Buy price must be greater than zero.")
    except (TypeError, ValueError):
        errors.append("Buy price must be a number.")

    try:
        quantity = float(quantity)
        if quantity <= 0:
            errors.append("Quantity must be greater than zero.")
    except (TypeError, ValueError):
        errors.append("Quantity must be a number.")

    if errors:
        return jsonify({"errors": errors}), 400

    with get_db_connection() as conn:
        conn.execute(
            "INSERT INTO trades (ticker, buy_date, buy_price, quantity) VALUES (?, ?, ?, ?)",
            (ticker, buy_date, buy_price, quantity),
        )

    return jsonify({"message": "Trade added."}), 201


@app.route("/api/trades/<ticker>")
def trades_for_ticker(ticker: str):
    normalized = ticker.strip().upper()
    if not normalized:
        return jsonify({"error": "Ticker is required."}), 400

    with get_db_connection() as conn:
        rows = conn.execute(
            "SELECT id, ticker, buy_date, buy_price, quantity FROM trades WHERE ticker = ? ORDER BY buy_date ASC",
            (normalized,),
        ).fetchall()

    trades = [
        {
            "id": row["id"],
            "ticker": row["ticker"],
            "buy_date": row["buy_date"],
            "buy_price": row["buy_price"],
            "quantity": row["quantity"],
        }
        for row in rows
    ]
    return jsonify({"trades": trades})


@app.route("/api/tickers")
def tickers():
    with get_db_connection() as conn:
        rows = conn.execute("SELECT DISTINCT ticker FROM trades ORDER BY ticker").fetchall()
    return jsonify({"tickers": [row["ticker"] for row in rows]})


@app.route("/api/prices/<ticker>")
def price_history(ticker: str):
    normalized = ticker.strip().upper()
    if not normalized:
        return jsonify({"error": "Ticker is required."}), 400

    # Fetch the last year's worth of daily data.
    history = yf.Ticker(normalized).history(period="1y", interval="1d")
    if history.empty:
        return jsonify({"prices": []})

    prices: List[Dict[str, str | float]] = [
        {"date": index.strftime("%Y-%m-%d"), "close": float(row["Close"])}
        for index, row in history.iterrows()
    ]

    return jsonify({"prices": prices})


init_db()

if __name__ == "__main__":
    app.run(debug=True)
