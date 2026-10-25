const list = document.getElementById('todoList');
const input = document.getElementById('todoInput');
const dueInput = document.getElementById('dueInput');
const addBtn = document.getElementById('addBtn');
const counter = document.getElementById('counter');
const empty = document.getElementById('empty');
const tabs = document.getElementById('tabs');

let allTodos = [];
let currentFilter = 'all';

/* ---------- small helpers ---------- */
const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }
};

const pad = n => String(n).padStart(2, '0');
const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const sameDay = (a, b) => a.toDateString() === b.toDateString();
const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/* ---------- filters ---------- */
function matchesFilter(t) {
  if (currentFilter === 'all') return true;
  if (!t.due_date) return false;
  const due = new Date(t.due_date);
  const now = new Date();

  if (currentFilter === 'overdue') return t.done !== 1 && due < now;
  if (currentFilter === 'today') return sameDay(due, now);
  if (currentFilter === 'week') {
    const start = startOfDay(now);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return due >= start && due < end;
  }
  if (currentFilter === 'month') {
    return due.getFullYear() === now.getFullYear() && due.getMonth() === now.getMonth();
  }
  return true;
}

tabs.addEventListener('click', e => {
  const btn = e.target.closest('.tab');
  if (!btn) return;
  currentFilter = btn.dataset.filter;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === btn));
  render();
});

/* ---------- deadline badge ---------- */
function dueInfo(t) {
  if (!t.due_date) return null;
  const due = new Date(t.due_date);
  const now = new Date();
  let cls = '';
  if (t.done !== 1) {
    if (due < now) cls = 'overdue';
    else if (sameDay(due, now)) cls = 'today';
  }
  const text = due.toLocaleString([], {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
  return { text: (cls === 'overdue' ? 'Overdue: ' : '📅 ') + text, cls };
}

/* ---------- render ---------- */
function render() {
  list.innerHTML = '';
  const visible = allTodos.filter(matchesFilter);
  empty.classList.toggle('hidden', visible.length > 0);

  const remaining = allTodos.filter(t => t.done !== 1).length;
  counter.textContent = allTodos.length === 0
    ? 'Nothing to do'
    : `${remaining} of ${allTodos.length} tasks left`;

  visible.forEach(t => {
    const li = document.createElement('li');
    if (t.done === 1) li.classList.add('done');

    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = t.done === 1;
    check.onchange = async () => {
      await fetch('/api/todos/' + t.id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done: check.checked })
      });
      loadTodos();
    };

    const content = document.createElement('div');
    content.className = 'content';

    const span = document.createElement('span');
    span.textContent = t.text;
    content.appendChild(span);

    const info = dueInfo(t);
    if (info) {
      const badge = document.createElement('span');
      badge.className = 'badge ' + info.cls;
      badge.textContent = info.text;
      content.appendChild(badge);
    }

    const del = document.createElement('button');
    del.textContent = '✕';
    del.title = 'Delete';
    del.onclick = async () => {
      await fetch('/api/todos/' + t.id, { method: 'DELETE' });
      loadTodos();
    };

    li.append(check, content, del);
    list.appendChild(li);
  });
}

async function loadTodos() {
  const res = await fetch('/api/todos');
  allTodos = await res.json();
  render();
}

async function addTodo() {
  const text = input.value.trim();
  if (!text) return;
  await fetch('/api/todos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, due_date: dueInput.value || null })
  });
  input.value = '';
  dueInput.value = '';
  input.focus();
  loadTodos();
}

addBtn.onclick = addTodo;
input.addEventListener('keydown', e => { if (e.key === 'Enter') addTodo(); });

/* ---------- notifications ---------- */
const enableBtn = document.getElementById('enableNotif');
const notifStatus = document.getElementById('notifStatus');
const dailyOn = document.getElementById('dailyOn');
const dailyTime = document.getElementById('dailyTime');
const monthlyOn = document.getElementById('monthlyOn');
const dueOn = document.getElementById('dueOn');

const notifSupported = 'Notification' in window;
const notifAllowed = () => notifSupported && Notification.permission === 'granted';

function notify(title, body) {
  if (notifAllowed()) new Notification(title, { body });
}

function updateNotifUI() {
  if (!notifSupported) {
    notifStatus.textContent = 'This browser does not support notifications.';
    enableBtn.disabled = true;
  } else if (Notification.permission === 'granted') {
    notifStatus.textContent = '✅ Notifications are on. Keep this tab open to receive them.';
    enableBtn.disabled = true;
  } else if (Notification.permission === 'denied') {
    notifStatus.textContent = '❌ Blocked. Click the lock icon next to the address bar and allow notifications.';
  } else {
    notifStatus.textContent = 'Click the button to allow notifications.';
  }
}

enableBtn.onclick = async () => {
  if (!notifSupported) return;
  await Notification.requestPermission();
  updateNotifUI();
  notify('Notifications enabled', 'You will get task reminders here.');
};

// Load and save settings
dailyOn.checked = store.get('dailyOn', true);
monthlyOn.checked = store.get('monthlyOn', true);
dueOn.checked = store.get('dueOn', true);
dailyTime.value = store.get('dailyTime', '09:00');
dailyOn.onchange = () => store.set('dailyOn', dailyOn.checked);
monthlyOn.onchange = () => store.set('monthlyOn', monthlyOn.checked);
dueOn.onchange = () => store.set('dueOn', dueOn.checked);
dailyTime.onchange = () => store.set('dailyTime', dailyTime.value);

function checkReminders() {
  if (!notifAllowed()) return;
  const now = new Date();

  // 1) Deadline reminders: 1 hour before, and when overdue
  if (dueOn.checked) {
    const notified = store.get('notified', {});
    let changed = false;

    allTodos.forEach(t => {
      if (t.done === 1 || !t.due_date) return;
      const diff = new Date(t.due_date) - now;

      if (diff <= 0 && !notified[t.id + '-overdue']) {
        notify('⏰ Task overdue', t.text);
        notified[t.id + '-overdue'] = true;
        changed = true;
      } else if (diff > 0 && diff <= 3600000 && !notified[t.id + '-soon']) {
        notify('Due within 1 hour', t.text);
        notified[t.id + '-soon'] = true;
        changed = true;
      }
    });
    if (changed) store.set('notified', notified);
  }

  // Time for the daily / monthly summaries
  const [h, m] = (dailyTime.value || '09:00').split(':').map(Number);
  const summaryTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
  if (now < summaryTime) return;

  const open = allTodos.filter(t => t.done !== 1);

  // 2) Daily summary
  if (dailyOn.checked && store.get('lastDaily', '') !== dayKey(now)) {
    const dueToday = open.filter(t => t.due_date && sameDay(new Date(t.due_date), now)).length;
    const overdue = open.filter(t => t.due_date && new Date(t.due_date) < now && !sameDay(new Date(t.due_date), now)).length;
    notify('📋 Daily summary', `${dueToday} due today, ${overdue} overdue, ${open.length} tasks left in total.`);
    store.set('lastDaily', dayKey(now));
  }

  // 3) Monthly summary
  if (monthlyOn.checked && store.get('lastMonthly', '') !== monthKey(now)) {
    const dueMonth = open.filter(t => {
      if (!t.due_date) return false;
      const d = new Date(t.due_date);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
    const done = allTodos.filter(t => t.done === 1).length;
    notify('🗓️ Monthly summary', `${dueMonth} tasks due this month, ${done} completed so far.`);
    store.set('lastMonthly', monthKey(now));
  }
}

updateNotifUI();
loadTodos().then(checkReminders);
setInterval(checkReminders, 30000);   // check every 30 seconds
setInterval(render, 60000);           // refresh "overdue" colors every minute