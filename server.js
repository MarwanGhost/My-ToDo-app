const express = require('express');
const { DatabaseSync } = require('node:sqlite');

const app = express();
const db = new DatabaseSync('todos.db');

app.use(express.json());
app.use(express.static('public'));

db.exec(`CREATE TABLE IF NOT EXISTS todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  done INTEGER DEFAULT 0
)`);

// Add the deadline column (the error is ignored if it already exists)
try { db.exec('ALTER TABLE todos ADD COLUMN due_date TEXT'); } catch (e) {}

// GET all todos (unfinished first, nearest deadline first)
app.get('/api/todos', (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM todos ORDER BY done ASC, due_date IS NULL, due_date ASC, id DESC'
  ).all();
  res.json(rows);
});

// POST a new todo
app.post('/api/todos', (req, res) => {
  const { text, due_date } = req.body;
  if (!text) return res.status(400).json({ error: 'Text required' });
  const result = db
    .prepare('INSERT INTO todos (text, due_date) VALUES (?, ?)')
    .run(text, due_date || null);
  res.json({ id: Number(result.lastInsertRowid), text, done: 0, due_date: due_date || null });
});

// PUT: update done and/or deadline
app.put('/api/todos/:id', (req, res) => {
  if ('done' in req.body) {
    db.prepare('UPDATE todos SET done = ? WHERE id = ?').run(req.body.done ? 1 : 0, req.params.id);
  }
  if ('due_date' in req.body) {
    db.prepare('UPDATE todos SET due_date = ? WHERE id = ?').run(req.body.due_date || null, req.params.id);
  }
  res.json({ success: true });
});

// DELETE a todo
app.delete('/api/todos/:id', (req, res) => {
  db.prepare('DELETE FROM todos WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ---------- Repeating reminders (habits) ----------
db.exec(`CREATE TABLE IF NOT EXISTS habits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  remind_time TEXT NOT NULL DEFAULT '09:00',
  repeat_type TEXT NOT NULL DEFAULT 'daily',
  weekday INTEGER,
  monthday INTEGER
)`);

db.exec(`CREATE TABLE IF NOT EXISTS habit_log (
  habit_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  PRIMARY KEY (habit_id, day)
)`);

const isDay = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);

function prevDay(day) {
  const d = new Date(day + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function calcStreak(habitId, today) {
  const days = new Set(
    db.prepare('SELECT day FROM habit_log WHERE habit_id = ?').all(habitId).map(r => r.day)
  );
  let cursor = days.has(today) ? today : prevDay(today);
  let streak = 0;
  while (days.has(cursor)) {
    streak++;
    cursor = prevDay(cursor);
  }
  return streak;
}

// GET all habits (with "done today" and streak)
app.get('/api/habits', (req, res) => {
  const today = req.query.day;
  if (!isDay(today)) return res.status(400).json({ error: 'day required' });

  const habits = db.prepare('SELECT * FROM habits ORDER BY remind_time ASC, id ASC').all();
  const result = habits.map(h => ({
    ...h,
    done_today: !!db.prepare('SELECT 1 AS x FROM habit_log WHERE habit_id = ? AND day = ?').get(h.id, today),
    streak: h.repeat_type === 'daily' ? calcStreak(h.id, today) : 0
  }));
  res.json(result);
});

// POST a new habit
app.post('/api/habits', (req, res) => {
  const { text, remind_time, repeat_type, weekday, monthday } = req.body;
  if (!text) return res.status(400).json({ error: 'Text required' });
  const type = ['daily', 'weekly', 'monthly'].includes(repeat_type) ? repeat_type : 'daily';
  const result = db.prepare(
    'INSERT INTO habits (text, remind_time, repeat_type, weekday, monthday) VALUES (?, ?, ?, ?, ?)'
  ).run(text, remind_time || '09:00', type, weekday ?? null, monthday ?? null);
  res.json({ id: Number(result.lastInsertRowid) });
});

// Toggle "done" for one day
app.post('/api/habits/:id/toggle', (req, res) => {
  const { day } = req.body;
  if (!isDay(day)) return res.status(400).json({ error: 'day required' });
  const id = Number(req.params.id);
  const exists = db.prepare('SELECT 1 AS x FROM habit_log WHERE habit_id = ? AND day = ?').get(id, day);
  if (exists) {
    db.prepare('DELETE FROM habit_log WHERE habit_id = ? AND day = ?').run(id, day);
  } else {
    db.prepare('INSERT INTO habit_log (habit_id, day) VALUES (?, ?)').run(id, day);
  }
  res.json({ done: !exists });
});

// DELETE a habit
app.delete('/api/habits/:id', (req, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM habit_log WHERE habit_id = ?').run(id);
  db.prepare('DELETE FROM habits WHERE id = ?').run(id);
  res.json({ success: true });
});

app.listen(3000, () => console.log('Running on http://localhost:3000'));