const $ = (id) => document.getElementById(id);
const currency = (n) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(n || 0));
const todayISO = () => new Date().toLocaleDateString("en-CA");
const currentMonth = () => todayISO().slice(0, 7);
const currentYear = () => todayISO().slice(0, 4);
let categories = {};
let transactions = [];
let user = null;
let categoryChart = null;
let monthlyChart = null;
let yearChart = null;
let monthlyRows = [];
let yearlyRows = [];

async function api(path, options = {}) {
  const config = { credentials: "same-origin", ...options, headers: { ...(options.headers || {}) } };
  if (options.body && typeof options.body !== "string") {
    config.headers["Content-Type"] = "application/json";
    config.body = JSON.stringify(options.body);
  }
  const response = await fetch(path, config);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data.detail || data.message || "Something went wrong.";
    throw new Error(Array.isArray(detail) ? detail.map(x => x.msg).join(", ") : detail);
  }
  return data;
}

function toast(message, isError = false) {
  const el = $("toast");
  el.textContent = message;
  el.className = `toast show${isError ? " error" : ""}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.className = "toast", 3200);
}

function switchAuth(mode) {
  const login = mode === "login";
  $("login-form").classList.toggle("hidden", !login);
  $("register-form").classList.toggle("hidden", login);
  $("show-login").classList.toggle("active", login);
  $("show-register").classList.toggle("active", !login);
}

function showApp(name) {
  $("auth-screen").classList.toggle("hidden", !!name);
  $("app-screen").classList.toggle("hidden", !name);
  if (!name) return;
  $("top-username").textContent = name;
  $("welcome-name").textContent = name;
  $("avatar").textContent = name.slice(0, 1).toUpperCase();
  $("today-chip").textContent = new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  $("quick-date").value = todayISO();
  $("tx-date").value = todayISO();
  $("daily-date").value = todayISO();
  $("monthly-date").value = currentMonth();
  $("budget-month").value = currentMonth();
  fillYearSelect();
}

function fillYearSelect() {
  const select = $("year-select");
  const selected = select.value || currentYear();
  select.innerHTML = "";
  for (let y = Number(currentYear()) + 1; y >= Number(currentYear()) - 5; y--) {
    const opt = document.createElement("option");
    opt.value = String(y); opt.textContent = String(y);
    select.appendChild(opt);
  }
  select.value = selected;
}

function fillCategorySelect(selectId, includeAll = false) {
  const select = $(selectId);
  if (!select) return;
  select.innerHTML = "";
  if (includeAll) {
    const opt = document.createElement("option"); opt.value = "All"; opt.textContent = "All categories"; select.appendChild(opt);
  }
  Object.keys(categories).forEach(cat => {
    const opt = document.createElement("option"); opt.value = cat; opt.textContent = cat; select.appendChild(opt);
  });
}

function fillItemSelect(categoryId, itemId) {
  const cat = $(categoryId).value;
  const item = $(itemId);
  item.innerHTML = "";
  (categories[cat] || ["Other"]).forEach(label => {
    const opt = document.createElement("option"); opt.value = label; opt.textContent = label; item.appendChild(opt);
  });
}

async function refreshTransactions() {
  transactions = await api("/api/transactions");
  renderDashboard();
  renderHistory();
}

function inRange(tx, start, end) {
  return tx.tx_date >= start && tx.tx_date <= end;
}
function monthRows(month) {
  return transactions.filter(tx => tx.tx_date.startsWith(month));
}
function yearRows(year) {
  return transactions.filter(tx => tx.tx_date.startsWith(String(year) + "-"));
}
function totals(rows) {
  const income = rows.filter(x => x.tx_type === "Income").reduce((s, x) => s + Number(x.amount), 0);
  const expenses = rows.filter(x => x.tx_type === "Expense").reduce((s, x) => s + Number(x.amount), 0);
  return { income, expenses, balance: income - expenses };
}
function setText(id, value) { $(id).textContent = value; }

function renderDashboard() {
  const rows = monthRows(currentMonth());
  const t = totals(rows);
  setText("dash-income", currency(t.income));
  setText("dash-expenses", currency(t.expenses));
  setText("dash-balance", currency(t.balance));
  renderCategoryChart(rows, "category-chart", "chart-empty", "category");
  renderTransactionTable("recent-list", transactions.slice(0, 6), false);
  updateBudgetCard(rows);
}
async function updateBudgetCard(rows) {
  try {
    const b = await api(`/api/budget/${currentMonth()}`);
    const spent = totals(rows).expenses;
    if (b.amount > 0) {
      setText("dash-budget-left", currency(b.amount - spent));
      setText("dash-budget-caption", `${currency(spent)} of ${currency(b.amount)} spent`);
    } else {
      setText("dash-budget-left", "Not set");
      setText("dash-budget-caption", "Set a monthly budget");
    }
  } catch {}
}

function renderCategoryChart(rows, canvasId, emptyId, chartType) {
  const expenseRows = rows.filter(x => x.tx_type === "Expense");
  const summary = {};
  expenseRows.forEach(x => summary[x.category] = (summary[x.category] || 0) + Number(x.amount));
  const labels = Object.keys(summary);
  const values = labels.map(k => summary[k]);
  $(emptyId).style.display = labels.length ? "none" : "block";
  let chart;
  if (chartType === "category") chart = categoryChart;
  if (chartType === "monthly") chart = monthlyChart;
  if (chart) chart.destroy();
  const ctx = $(canvasId).getContext("2d");
  const instance = new Chart(ctx, {
    type: "doughnut",
    data: { labels, datasets: [{ data: values, backgroundColor: ["#6664dc","#40b995","#f1b95a","#ed7886","#66a6df","#9d83d9","#71c8ce","#e59b68","#93bd72","#c4a3c9"], borderWidth: 2, borderColor: "#fff", hoverOffset: 5 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: "66%", plugins: { legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 7, padding: 16, font: { family: "DM Sans", size: 10 } } } } }
  });
  if (chartType === "category") categoryChart = instance;
  if (chartType === "monthly") monthlyChart = instance;
}

function renderTransactionTable(targetId, rows, deletable = true) {
  const target = $(targetId);
  if (!rows.length) {
    target.innerHTML = `<div class="empty-state">No transactions to show yet.</div>`;
    return;
  }
  const table = document.createElement("div");
  table.className = "table-wrap";
  table.innerHTML = `<table><thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Type</th><th>Amount</th>${deletable ? "<th></th>" : ""}</tr></thead><tbody></tbody></table>`;
  const tbody = table.querySelector("tbody");
  rows.forEach(tx => {
    const tr = document.createElement("tr");
    const typeClass = tx.tx_type.toLowerCase();
    tr.innerHTML = `<td>${escapeHtml(tx.tx_date)}</td><td>${escapeHtml(tx.description)}</td><td><span class="category-badge">${escapeHtml(tx.category)}</span></td><td><span class="type-badge ${typeClass}">${escapeHtml(tx.tx_type)}</span></td><td><b>${currency(tx.amount)}</b></td>${deletable ? `<td><button class="delete-btn" data-delete="${tx.id}">Delete</button></td>` : ""}`;
    tbody.appendChild(tr);
  });
  target.replaceChildren(table);
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function setMetric(prefix, rows) {
  const t = totals(rows);
  setText(`${prefix}-income`, currency(t.income));
  setText(`${prefix}-expenses`, currency(t.expenses));
  setText(`${prefix}-balance`, currency(t.balance));
}

function renderDaily() {
  const d = $("daily-date").value || todayISO();
  const rows = transactions.filter(tx => tx.tx_date === d);
  setMetric("daily", rows);
  renderTransactionTable("daily-table", rows);
}
async function renderMonthly() {
  const month = $("monthly-date").value || currentMonth();
  monthlyRows = monthRows(month);
  setMetric("monthly", monthlyRows);
  renderCategoryChart(monthlyRows, "monthly-chart", "monthly-chart-empty", "monthly");
  renderTransactionTable("monthly-table", monthlyRows);
  try {
    const b = await api(`/api/budget/${month}`);
    const spent = totals(monthlyRows).expenses;
    $("monthly-budget-summary").innerHTML = b.amount > 0
      ? `Budget: <b>${currency(b.amount)}</b><br>Expenses: <b>${currency(spent)}</b><br>Remaining: <b>${currency(b.amount - spent)}</b><br><div class="budget-track"><span style="width:${Math.min(100, spent / b.amount * 100)}%"></span></div>${spent > b.amount ? `<p style="color:#d65362">Budget exceeded by ${currency(spent - b.amount)}.</p>` : `<p>${Math.round(spent / b.amount * 100)}% of budget used.</p>`}`
      : "No budget set for this month. You can set one in Budget settings.";
  } catch { $("monthly-budget-summary").textContent = "Could not load budget."; }
}
function renderYearly() {
  const year = $("year-select").value || currentYear();
  yearlyRows = yearRows(year);
  setMetric("year", yearlyRows);
  const monthlyIncome = Array(12).fill(0), monthlyExpenses = Array(12).fill(0);
  yearlyRows.forEach(tx => {
    const month = Number(tx.tx_date.slice(5, 7)) - 1;
    if (tx.tx_type === "Income") monthlyIncome[month] += Number(tx.amount);
    else monthlyExpenses[month] += Number(tx.amount);
  });
  $("year-chart-empty").style.display = yearlyRows.length ? "none" : "block";
  if (yearChart) yearChart.destroy();
  yearChart = new Chart($("year-chart").getContext("2d"), {
    type: "bar",
    data: { labels: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"], datasets: [
      { label: "Income", data: monthlyIncome, backgroundColor: "#40b995", borderRadius: 5 },
      { label: "Expenses", data: monthlyExpenses, backgroundColor: "#7774e5", borderRadius: 5 }
    ] },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, grid: { color: "#eff1f6" } }, x: { grid: { display: false } } }, plugins: { legend: { position: "bottom" } } }
  });
  const cats = {};
  yearlyRows.filter(x => x.tx_type === "Expense").forEach(tx => cats[tx.category] = (cats[tx.category] || 0) + Number(tx.amount));
  const sorted = Object.entries(cats).sort((a,b) => b[1]-a[1]);
  $("year-category-table").innerHTML = sorted.length
    ? `<div class="table-wrap"><table><thead><tr><th>Category</th><th>Total expenses</th></tr></thead><tbody>${sorted.map(([c,v])=>`<tr><td><span class="category-badge">${escapeHtml(c)}</span></td><td><b>${currency(v)}</b></td></tr>`).join("")}</tbody></table></div>`
    : `<div class="empty-state">No expenses recorded this year.</div>`;
}
function renderHistory() {
  const type = $("history-type").value;
  const category = $("history-category").value;
  const search = $("history-search").value.trim().toLowerCase();
  const rows = transactions.filter(tx =>
    (type === "All" || tx.tx_type === type) &&
    (category === "All" || tx.category === category) &&
    (!search || tx.description.toLowerCase().includes(search) || tx.category.toLowerCase().includes(search))
  );
  renderTransactionTable("history-table", rows);
}
function downloadCSV(rows, filename) {
  if (!rows.length) { toast("No records to export.", true); return; }
  const headers = ["Date", "Description", "Amount", "Type", "Category"];
  const lines = [headers.join(","), ...rows.map(tx => [tx.tx_date, tx.description, tx.amount, tx.tx_type, tx.category].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))];
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}

async function loadCategories() {
  categories = await api("/api/categories");
  ["quick-category", "tx-category"].forEach(id => fillCategorySelect(id));
  fillCategorySelect("history-category", true);
  fillItemSelect("quick-category", "quick-item");
  fillItemSelect("tx-category", "tx-item");
}
function showPage(page) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  $(`page-${page}`).classList.add("active");
  document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.page === page));
  const titles = { dashboard: "Overview", transactions: "Add transaction", daily: "Daily report", monthly: "Monthly report", yearly: "Yearly report", history: "Transactions", settings: "Budget settings" };
  setText("page-heading", titles[page] || "Overview");
  $("sidebar").classList.remove("open");
  if (page === "daily") renderDaily();
  if (page === "monthly") renderMonthly();
  if (page === "yearly") renderYearly();
  if (page === "history") renderHistory();
  if (page === "settings") loadBudgetForm();
}

async function loadBudgetForm() {
  const month = $("budget-month").value || currentMonth();
  try {
    const b = await api(`/api/budget/${month}`);
    $("budget-amount").value = b.amount || "";
  } catch {}
}

async function afterAuth() {
  await loadCategories();
  const result = await api("/api/me");
  user = result.user;
  showApp(user.username);
  await refreshTransactions();
}

$("show-login").addEventListener("click", () => switchAuth("login"));
$("show-register").addEventListener("click", () => switchAuth("register"));

$("login-form").addEventListener("submit", async e => {
  e.preventDefault();
  try {
    await api("/api/login", { method: "POST", body: { username: $("login-username").value, password: $("login-password").value } });
    await afterAuth(); toast("Welcome back!");
  } catch (err) { toast(err.message, true); }
});
$("register-form").addEventListener("submit", async e => {
  e.preventDefault();
  const password = $("register-password").value;
  if (password !== $("register-confirm").value) return toast("Passwords do not match.", true);
  try {
    await api("/api/register", { method: "POST", body: { username: $("register-username").value, password } });
    await afterAuth(); toast("Account created successfully!");
  } catch (err) { toast(err.message, true); }
});
$("logout-btn").addEventListener("click", async () => {
  try { await api("/api/logout", { method: "POST" }); } catch {}
  user = null; transactions = []; showApp(null); switchAuth("login"); toast("Signed out.");
});
$("quick-category").addEventListener("change", () => fillItemSelect("quick-category", "quick-item"));
$("tx-category").addEventListener("change", () => fillItemSelect("tx-category", "tx-item"));
$("quick-form").addEventListener("submit", async e => {
  e.preventDefault();
  const payload = { tx_date: $("quick-date").value, description: $("quick-item").value, amount: Number($("quick-amount").value), tx_type: $("quick-type").value, category: $("quick-category").value };
  try { await api("/api/transactions", { method: "POST", body: payload }); $("quick-amount").value = ""; await refreshTransactions(); toast("Transaction saved."); }
  catch (err) { toast(err.message, true); }
});
$("transaction-form").addEventListener("submit", async e => {
  e.preventDefault();
  const payload = { tx_date: $("tx-date").value, description: $("tx-description").value.trim() || $("tx-item").value, amount: Number($("tx-amount").value), tx_type: $("tx-type").value, category: $("tx-category").value };
  try { await api("/api/transactions", { method: "POST", body: payload }); e.target.reset(); $("tx-date").value = todayISO(); await refreshTransactions(); toast("Transaction saved."); }
  catch (err) { toast(err.message, true); }
});
document.addEventListener("click", async e => {
  const btn = e.target.closest("[data-delete]");
  if (btn) {
    if (!confirm("Delete this transaction permanently?")) return;
    try { await api(`/api/transactions/${btn.dataset.delete}`, { method: "DELETE" }); await refreshTransactions(); renderDaily(); renderMonthly(); renderYearly(); toast("Transaction deleted."); }
    catch (err) { toast(err.message, true); }
  }
  const goto = e.target.closest("[data-goto]");
  if (goto) showPage(goto.dataset.goto);
});
document.querySelectorAll(".nav-item").forEach(btn => btn.addEventListener("click", () => showPage(btn.dataset.page)));
$("menu-btn").addEventListener("click", () => $("sidebar").classList.toggle("open"));
$("daily-load").addEventListener("click", renderDaily);
$("monthly-load").addEventListener("click", renderMonthly);
$("year-load").addEventListener("click", renderYearly);
$("history-type").addEventListener("change", renderHistory);
$("history-category").addEventListener("change", renderHistory);
$("history-search").addEventListener("input", renderHistory);
$("monthly-csv").addEventListener("click", () => downloadCSV(monthlyRows, `monthly-report-${$("monthly-date").value}.csv`));
$("year-csv").addEventListener("click", () => downloadCSV(yearlyRows, `yearly-report-${$("year-select").value}.csv`));
$("history-csv").addEventListener("click", () => {
  const type = $("history-type").value, category = $("history-category").value, search = $("history-search").value.trim().toLowerCase();
  const rows = transactions.filter(tx => (type === "All" || tx.tx_type === type) && (category === "All" || tx.category === category) && (!search || tx.description.toLowerCase().includes(search) || tx.category.toLowerCase().includes(search)));
  downloadCSV(rows, "my-transactions.csv");
});
$("budget-month").addEventListener("change", loadBudgetForm);
$("budget-form").addEventListener("submit", async e => {
  e.preventDefault();
  try {
    await api("/api/budget", { method: "PUT", body: { month: $("budget-month").value, amount: Number($("budget-amount").value) } });
    toast("Budget saved."); renderDashboard();
    if ($("page-monthly").classList.contains("active")) renderMonthly();
  } catch (err) { toast(err.message, true); }
});

(async function init() {
  try {
    await loadCategories();
    const result = await api("/api/me");
    user = result.user;
    showApp(user.username);
    await refreshTransactions();
  } catch {
    showApp(null);
    switchAuth("login");
  }
})();
