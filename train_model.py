"""
Optional starter for a small ML transaction categorizer.
Run: python train_model.py
This trains on example labels only; replace/add verified examples before relying on it.
"""
from pathlib import Path
import joblib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.pipeline import Pipeline
from sklearn.linear_model import LogisticRegression

BASE_DIR = Path(__file__).resolve().parent
MODEL_FILE = BASE_DIR / "transaction_model.joblib"

descriptions = [
    "Swiggy food order", "Zomato restaurant", "grocery store",
    "Amazon shopping", "Flipkart order", "Myntra clothes",
    "Uber ride", "Ola cab", "metro card recharge",
    "electricity bill", "mobile recharge", "broadband bill",
    "college tuition fee", "online course", "textbook purchase",
    "pharmacy medicine", "doctor consultation", "hospital bill",
    "monthly salary", "internship stipend", "freelance payment",
]
labels = [
    "Food", "Food", "Food",
    "Shopping", "Shopping", "Shopping",
    "Travel", "Travel", "Travel",
    "Bills", "Bills", "Bills",
    "Education", "Education", "Education",
    "Health", "Health", "Health",
    "Income", "Income", "Income",
]

model = Pipeline([
    ("tfidf", TfidfVectorizer(ngram_range=(1, 2), lowercase=True)),
    ("classifier", LogisticRegression(max_iter=1000)),
])
model.fit(descriptions, labels)
joblib.dump(model, MODEL_FILE)
print(f"Model saved to: {MODEL_FILE}")
print("Demo model trained on tiny sample data; improve training data before real use.")
