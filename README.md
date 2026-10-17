# AI Financial Analyzer (Streamlit)

## Features
- Separate account for each user (registration/login)
- Passwords stored as salted PBKDF2 hashes, not plaintext
- SQLite persistence for transactions and budgets
- Preset expense categories and common items
- Daily, monthly, yearly reports
- Category charts, CSV download, transaction filters and delete
- Monthly budget tracking

## Run on Windows PowerShell

Open this folder in VS Code and run:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m streamlit run main.py
```

If PowerShell blocks activation, you can skip activation and run:
```powershell
python -m pip install -r requirements.txt
python -m streamlit run main.py
```

## Important notes
- Data is saved in `finance.db` beside `main.py`; keep a backup of this file.
- This is a student/demo project, not a production-grade financial service.
- For public deployment, use HTTPS, secrets management, stronger authentication/session controls, database backups, and a hosted database such as PostgreSQL.
- Bank/UPI automatic sync is not included. Users still need to confirm actual amounts and dates.
- Categories and common items are presets, not automatic records of purchases.
