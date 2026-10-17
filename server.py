
from flask import Flask, request, jsonify, send_from_directory
from pathlib import Path
import pandas as pd
from analytics import categorize_transactions, summarize_transactions

app = Flask(__name__)
FRONTEND = Path(__file__).parent / "frontend"

@app.route("/")
def home():
    return send_from_directory(FRONTEND, "index.html")

@app.route("/script.js")
def script():
    return send_from_directory(FRONTEND, "script.js")

@app.route("/api/analyze", methods=["POST"])
def analyze():
    try:
        file = request.files.get("file")

        if not file:
            return jsonify({"error": "CSV file select karo"}), 400

        df = pd.read_csv(file)
        df.columns = df.columns.str.strip().str.lower()

        required = {"description", "amount", "type"}
        if not required.issubset(df.columns):
            return jsonify({
                "error": "CSV mein description, amount, type columns chahiye"
            }), 400

        df["amount"] = pd.to_numeric(df["amount"], errors="coerce")
        df = df.dropna(subset=["amount", "description", "type"])
        df["type"] = df["type"].astype(str).str.lower().str.strip()

        df = categorize_transactions(df)
        summary = summarize_transactions(df)

        categories = [
            {"category": str(name), "amount": float(amount)}
            for name, amount in summary["category_expenses"].items()
        ]

        return jsonify({
            "income": summary["income"],
            "expenses": summary["expenses"],
            "savings": summary["savings"],
            "category_expenses": categories
        })

    except Exception as e:
        app.logger.exception("Analysis failed")
        return jsonify({"error": str(e)}), 50

if __name__ == "__main__":
    app.run(debug=True)