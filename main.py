import hashlib
import hmac
import secrets
import sqlite3
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Request, Response, Depends
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
DB_PATH = BASE_DIR / "finance.db"
SESSION_COOKIE = "finance_session"
SESSION_DAYS = 7

app = FastAPI(title="AI Financial Analyzer API")
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

CATEGORIES = {
    "Food": ["Breakfast", "Lunch", "Dinner", "Snacks", "Groceries", "Restaurant"],
    "Medicine": ["Medicines", "Doctor", "Medical Tests", "Hospital"],
    "Education": ["College Fees", "Books", "Stationery", "Course", "Exam Fees"],
    "Transport": ["Bus", "Train", "Auto/Cab", "Petrol", "Parking"],
    "Shopping": ["Clothes", "Shoes", "Online Shopping", "Electronics"],
    "Home": ["Rent", "Electricity", "Water", "Gas", "Household"],
    "Bills & Recharge": ["Mobile Recharge", "Internet", "Subscriptions", "Other Bills"],
    "Entertainment": ["Movies", "Games", "Outings", "Hobbies"],
    "Personal Care": ["Salon", "Toiletries", "Fitness"],
    "Income": ["Salary", "Business", "Freelancing", "Gift", "Other Income"],
    "Other": ["Miscellaneous", "Other"],
}

def db():
    conn = sqlite3.connect(DB_PATH, timeout=20)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def init_db():
    with db() as conn:
        conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE COLLATE NOCASE,
            password_hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            created_at TEXT NOT NULL
        )""")
        conn.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            token_hash TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            expires_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )""")
        conn.execute("""
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            tx_date TEXT NOT NULL,
            description TEXT NOT NULL,
            amount REAL NOT NULL CHECK(amount > 0),
            tx_type TEXT NOT NULL CHECK(tx_type IN ('Expense', 'Income')),
            category TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )""")
        conn.execute("""
        CREATE TABLE IF NOT EXISTS budgets (
            user_id INTEGER NOT NULL,
            month TEXT NOT NULL,
            amount REAL NOT NULL DEFAULT 0,
            PRIMARY KEY(user_id, month),
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )""")

init_db()

def pw_hash(password: str, salt: bytes) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 250_000).hex()

def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()

class RegisterInput(BaseModel):
    username: str = Field(min_length=3, max_length=30)
    password: str = Field(min_length=8, max_length=128)

class LoginInput(BaseModel):
    username: str
    password: str

class TransactionInput(BaseModel):
    tx_date: date
    description: str = Field(min_length=1, max_length=200)
    amount: float = Field(gt=0, le=1_000_000_000_000)
    tx_type: str
    category: str

class BudgetInput(BaseModel):
    month: str = Field(pattern=r"^\d{4}-\d{2}$")
    amount: float = Field(ge=0, le=1_000_000_000_000)

def create_session(response: Response, user_id: int):
    token = secrets.token_urlsafe(32)
    expires = datetime.utcnow() + timedelta(days=SESSION_DAYS)
    with db() as conn:
        conn.execute("INSERT INTO sessions(token_hash, user_id, expires_at) VALUES (?, ?, ?)",
                     (token_hash(token), user_id, expires.isoformat(timespec="seconds")))
    response.set_cookie(
        SESSION_COOKIE, token, httponly=True, samesite="lax",
        secure=False, max_age=SESSION_DAYS * 24 * 60 * 60, path="/"
    )

def current_user(request: Request):
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise HTTPException(status_code=401, detail="Please login first.")
    with db() as conn:
        row = conn.execute("""
            SELECT u.id, u.username FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token_hash = ? AND s.expires_at > ?
        """, (token_hash(token), datetime.utcnow().isoformat(timespec="seconds"))).fetchone()
    if not row:
        raise HTTPException(status_code=401, detail="Session expired. Please login again.")
    return {"id": row["id"], "username": row["username"]}

@app.get("/")
def index():
    return FileResponse(STATIC_DIR / "index.html")

@app.get("/api/categories")
def categories():
    return CATEGORIES

@app.post("/api/register")
def register(payload: RegisterInput, response: Response):
    username = payload.username.strip()
    if not all(ch.isalnum() or ch in "._-" for ch in username):
        raise HTTPException(status_code=400, detail="Username may contain letters, numbers, dot, underscore, and hyphen only.")
    salt = secrets.token_bytes(16)
    digest = pw_hash(payload.password, salt)
    try:
        with db() as conn:
            cur = conn.execute(
                "INSERT INTO users(username, password_hash, salt, created_at) VALUES (?, ?, ?, ?)",
                (username, digest, salt.hex(), datetime.utcnow().isoformat(timespec="seconds"))
            )
            user_id = cur.lastrowid
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="That username is already taken.")
    create_session(response, user_id)
    return {"message": "Account created.", "user": {"id": user_id, "username": username}}

@app.post("/api/login")
def login(payload: LoginInput, response: Response):
    with db() as conn:
        user = conn.execute("SELECT * FROM users WHERE username = ? COLLATE NOCASE",
                            (payload.username.strip(),)).fetchone()
    if not user or not hmac.compare_digest(pw_hash(payload.password, bytes.fromhex(user["salt"])), user["password_hash"]):
        raise HTTPException(status_code=401, detail="Incorrect username or password.")
    create_session(response, user["id"])
    return {"message": "Logged in.", "user": {"id": user["id"], "username": user["username"]}}

@app.post("/api/logout")
def logout(request: Request, response: Response):
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        with db() as conn:
            conn.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash(token),))
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"message": "Logged out."}

@app.get("/api/me")
def me(user=Depends(current_user)):
    return {"user": user}

@app.get("/api/transactions")
def get_transactions(user=Depends(current_user), start: Optional[date] = None, end: Optional[date] = None):
    query = """SELECT id, tx_date, description, amount, tx_type, category
               FROM transactions WHERE user_id = ?"""
    params = [user["id"]]
    if start:
        query += " AND tx_date >= ?"
        params.append(start.isoformat())
    if end:
        query += " AND tx_date <= ?"
        params.append(end.isoformat())
    query += " ORDER BY tx_date DESC, id DESC"
    with db() as conn:
        rows = conn.execute(query, params).fetchall()
    return [dict(r) for r in rows]

@app.post("/api/transactions")
def add_transaction(payload: TransactionInput, user=Depends(current_user)):
    if payload.tx_type not in ("Expense", "Income"):
        raise HTTPException(status_code=400, detail="Transaction type must be Expense or Income.")
    if payload.category not in CATEGORIES:
        raise HTTPException(status_code=400, detail="Choose a valid category.")
    with db() as conn:
        cur = conn.execute("""
            INSERT INTO transactions(user_id, tx_date, description, amount, tx_type, category, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (user["id"], payload.tx_date.isoformat(), payload.description.strip(), payload.amount,
              payload.tx_type, payload.category, datetime.utcnow().isoformat(timespec="seconds")))
        transaction_id = cur.lastrowid
    return {"message": "Transaction saved.", "id": transaction_id}

@app.delete("/api/transactions/{transaction_id}")
def delete_transaction(transaction_id: int, user=Depends(current_user)):
    with db() as conn:
        cur = conn.execute("DELETE FROM transactions WHERE id = ? AND user_id = ?",
                           (transaction_id, user["id"]))
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Transaction not found.")
    return {"message": "Transaction deleted."}

@app.get("/api/budget/{month}")
def get_budget(month: str, user=Depends(current_user)):
    if len(month) != 7 or month[4] != "-":
        raise HTTPException(status_code=400, detail="Month must be YYYY-MM.")
    with db() as conn:
        row = conn.execute("SELECT amount FROM budgets WHERE user_id = ? AND month = ?",
                           (user["id"], month)).fetchone()
    return {"month": month, "amount": float(row["amount"]) if row else 0}

@app.put("/api/budget")
def save_budget(payload: BudgetInput, user=Depends(current_user)):
    with db() as conn:
        conn.execute("""
            INSERT INTO budgets(user_id, month, amount) VALUES (?, ?, ?)
            ON CONFLICT(user_id, month) DO UPDATE SET amount = excluded.amount
        """, (user["id"], payload.month, payload.amount))
    return {"message": "Budget saved."}
