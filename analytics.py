import pandas as pd

CATEGORY_KEYWORDS = {
    "Food": ["swiggy", "zomato", "restaurant", "cafe", "food", "grocery", "zepto", "blinkit"],
    "Shopping": ["amazon", "flipkart", "myntra", "shopping", "mall"],
    "Travel": ["uber", "ola", "rapido", "metro", "bus", "train", "petrol", "fuel"],
    "Bills": ["electricity", "water bill", "recharge", "broadband", "wifi", "mobile bill", "gas bill"],
    "Education": ["college", "course", "book", "udemy", "coursera", "exam", "tuition"],
    "Health": ["hospital", "doctor", "pharmacy", "medical", "medicine", "clinic"],
    "Income": ["salary", "stipend", "refund", "interest", "freelance"],
}

def categorize_description(description: str, transaction_type: str) -> str:
    text = str(description).lower()
    for category, keywords in CATEGORY_KEYWORDS.items():
        if any(keyword in text for keyword in keywords):
            return category
    if str(transaction_type).lower() in {"income", "credit", "cr"}:
        return "Other Income"
    return "Other Expense"

def categorize_transactions(df: pd.DataFrame) -> pd.DataFrame:
    result = df.copy()
    result["category"] = result.apply(
        lambda row: categorize_description(row["description"], row["type"]), axis=1
    )
    return result

def summarize_transactions(df: pd.DataFrame) -> dict:
    result = df.copy()
    result["amount"] = pd.to_numeric(result["amount"], errors="coerce").fillna(0)

    income_types = {"income", "credit", "cr"}
    expense_types = {"expense", "debit", "dr"}
    normalized_types = result["type"].astype(str).str.lower().str.strip()

    income = result.loc[normalized_types.isin(income_types), "amount"].clip(lower=0).sum()
    expenses = result.loc[normalized_types.isin(expense_types), "amount"].abs().sum()

    expense_rows = result.loc[normalized_types.isin(expense_types)].copy()
    expense_rows["amount"] = expense_rows["amount"].abs()
    category_expenses = expense_rows.groupby("category")["amount"].sum().sort_values(ascending=False)

    return {
        "income": float(income),
        "expenses": float(expenses),
        "savings": float(income - expenses),
        "category_expenses": category_expenses,
    }
