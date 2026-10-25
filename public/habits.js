// Uses helpers from script.js: store, notify, notifAllowed, dayKey
const habitList = document.getElementById('habitList');
const habitEmpty = document.getElementById('habitEmpty');
const habitText = document.getElementById('habitText');
const habitTime = document.getElementById('habitTime');
const habitRepeat = document.getElementById('habitRepeat');
const habitWeekday = document.getElementById('habitWeekday');
const habitMonthday = document.getElementById('habitMonthday');
const habitAdd = document.getElementById('habitAdd');

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
let allHabits = [];

/* ---------- Is this habit due today? ---------- */
function isDueToday(h, now = new Date()) {
  if (h.repeat_type === 'daily') return true;
  if (h.repeat_type === 'weekly') return h.weekday === now.getDay();
  if (h.repeat_type === 'monthly') {
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return Math.min(h.monthday, lastDay) === now.getDate();
  }
  return false;
}

function repeatLabel(h) {
  if (h.repeat_type === 'weekly') return 'Every ' + DAY_NAMES[h.weekday];
  if (h.repeat_type === 'monthly') return 'Monthly on day ' + h.monthday;
  return 'Every day';
}

/* ---------- Show / hide the extra pickers ---------- */
function updatePickers() {
  habitWeekday.classList.toggle('hidden', habitRepeat.value !== 'weekly');
  habitMonthday.classList.toggle('hidden', habitRepeat.value !== 'monthly');
}
habitRepeat.onchange = updatePickers;
updatePickers();

/* ---------- Render ---------- */
function renderHabits() {
  habitList.innerHTML = '';
  habitEmpty.classList.toggle('hidden', allHabits.length > 0);

  allHabits.forEach(h => {
    const due = isDueToday(h);
    const li = document.createElement('li');
    if (h.done_today) li.classList.add('done');
    if (!due) li.classList.add('off');

    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = h.done_today;
    check.disabled = !due;
    check.onchange = async () => {
      await fetch('/api/habits/' + h.id + '/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ day: dayKey(new Date()) })
      });
      loadHabits();
    };

    const content = document.createElement('div');
    content.className = 'content';

    const title = document.createElement('span');
    title.textContent = h.text;
    content.appendChild(title);

    const when = document.createElement('span');
    when.className = 'badge';
    when.textContent = `⏰ ${h.remind_time} · ${repeatLabel(h)}` + (due ? '' : ' (not today)');
    content.appendChild(when);

    if (h.streak > 0) {
      const streak = document.createElement('span');
      streak.className = 'badge streak';
      streak.textContent = `🔥 ${h.streak} day${h.streak > 1 ? 's' : ''} in a row`;
      content.appendChild(streak);
    }

    const del = document.createElement('button');
    del.textContent = '✕';
    del.title = 'Delete';
    del.onclick = async () => {
      if (!confirm('Delete "' + h.text + '"?')) return;
      await fetch('/api/habits/' + h.id, { method: 'DELETE' });
      loadHabits();
    };

    li.append(check, content, del);
    habitList.appendChild(li);
  });
}

async function loadHabits() {
  const res = await fetch('/api/habits?day=' + dayKey(new Date()));
  allHabits = await res.json();
  renderHabits();
}

/* ---------- Add ---------- */
async function addHabit() {
  const text = habitText.value.trim();
  if (!text) return;
  await fetch('/api/habits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      remind_time: habitTime.value || '09:00',
      repeat_type: habitRepeat.value,
      weekday: Number(habitWeekday.value),
      monthday: Number(habitMonthday.value) || 1
    })
  });
  habitText.value = '';
  habitText.focus();
  await loadHabits();
  checkHabitReminders();
}
habitAdd.onclick = addHabit;
habitText.addEventListener('keydown', e => { if (e.key === 'Enter') addHabit(); });

/* ---------- Notifications ---------- */
function checkHabitReminders() {
  if (!notifAllowed()) return;

  const now = new Date();
  const today = dayKey(now);
  const notified = store.get('habitNotified', {});
  let changed = false;

  allHabits.forEach(h => {
    if (h.done_today || !isDueToday(h, now)) return;

    const [hh, mm] = h.remind_time.split(':').map(Number);
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm);
    const key = h.id + '-' + today;

    if (now >= at && !notified[key]) {
      notify('🔁 Reminder', h.text);
      notified[key] = true;
      changed = true;
    }
  });

  // Remove old entries from previous days
  Object.keys(notified).forEach(k => {
    if (!k.endsWith(today)) { delete notified[k]; changed = true; }
  });

  if (changed) store.set('habitNotified', notified);
}

loadHabits().then(checkHabitReminders);
setInterval(checkHabitReminders, 30000);  // check every 30 seconds
setInterval(loadHabits, 60000);           // refresh every minute (resets at midnight)