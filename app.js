const STATUS = {
  "Not started": "var(--not-started)",
  "In progress": "var(--in-progress)",
  "Blocked":     "var(--blocked)",
  "Done":        "var(--done)"
};
const STATUS_BG = {
  "Not started": "var(--not-started-bg)",
  "In progress": "var(--in-progress-bg)",
  "Blocked":     "var(--blocked-bg)",
  "Done":        "var(--done-bg)"
};

let tasks = loadTasks();

function loadTasks() {
  try {
    const saved = localStorage.getItem('project-tracker-tasks');
    if (saved) return JSON.parse(saved);
  } catch (e) {}
  return [
    { task: "Kickoff meeting", owner: "Mia", status: "Done", priority: "Medium", start: "2026-06-28", due: "2026-07-01", progress: 100 },
    { task: "Draft requirements doc", owner: "Sam", status: "In progress", priority: "High", start: "2026-07-02", due: "2026-07-16", progress: 60 },
    { task: "Design review", owner: "Priya", status: "Not started", priority: "Medium", start: "2026-07-17", due: "2026-07-22", progress: 0 },
    { task: "Vendor contract sign-off", owner: "Leo", status: "Blocked", priority: "High", start: "2026-07-05", due: "2026-07-10", progress: 20 }
  ];
}

function saveTasks() {
  try {
    localStorage.setItem('project-tracker-tasks', JSON.stringify(tasks));
    const el = document.getElementById('save-status');
    if (el) {
      el.textContent = 'saved';
      clearTimeout(saveTasks._t);
      saveTasks._t = setTimeout(() => { el.textContent = ''; }, 1500);
    }
  } catch (e) {}
}

function todayStr() { return new Date().toISOString().slice(0, 10); }

function render() {
  const rowsEl = document.getElementById('rows');
  rowsEl.innerHTML = '';

  tasks.forEach((t, i) => {
    const tr = document.createElement('tr');
    tr.className = 'rail';
    tr.style.setProperty('--row-color', STATUS[t.status]);
    const isOverdue = t.due && t.due < todayStr() && t.status !== 'Done';

    tr.innerHTML = `
      <td><input type="text" value="${t.task}" data-i="${i}" data-f="task" /></td>
      <td><input type="text" value="${t.owner}" data-i="${i}" data-f="owner" /></td>
      <td>
        <select class="status-pill" data-i="${i}" data-f="status" style="background:${STATUS_BG[t.status]}; color:${STATUS[t.status]};">
          ${Object.keys(STATUS).map(s => `<option value="${s}" style="color:${STATUS[s]}; background:${STATUS_BG[s]};" ${s === t.status ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </td>
      <td>
        <select class="priority priority-${t.priority}" data-i="${i}" data-f="priority">
          <option value="Low" style="color:#228B22;" ${t.priority === 'Low' ? 'selected' : ''}>Low</option>
          <option value="Medium" style="color:#B45309;" ${t.priority === 'Medium' ? 'selected' : ''}>Medium</option>
          <option value="High" style="color:#8B0000;" ${t.priority === 'High' ? 'selected' : ''}>High</option>
        </select>
      </td>
      <td><input type="date" value="${t.start || ''}" data-i="${i}" data-f="start" /></td>
      <td><input type="date" value="${t.due}" data-i="${i}" data-f="due" class="${isOverdue ? 'overdue-date' : ''}" /></td>
      <td>
        <div class="progress-cell">
          <div class="bar-track">
            <div class="bar-fill" style="width:${t.progress}%;"></div>
            <input type="range" min="0" max="100" step="5" value="${t.progress}" data-i="${i}" data-f="progress" />
          </div>
          <span class="progress-pct">${t.progress}%</span>
        </div>
      </td>
      <td><button class="del-btn" data-i="${i}" aria-label="Delete task">&times;</button></td>
    `;
    rowsEl.appendChild(tr);
  });

  updateSummary();

  rowsEl.querySelectorAll('input, select').forEach(el => {
    el.addEventListener('input', e => {
      const i = Number(e.target.dataset.i), f = e.target.dataset.f;
      tasks[i][f] = f === 'progress' ? Number(e.target.value) : e.target.value;
      saveTasks();

      const tr = e.target.closest('tr');
      const t = tasks[i];

      if (f === 'task' || f === 'owner') {
        return;
      }

      if (f === 'status') {
        tr.style.setProperty('--row-color', STATUS[t.status]);
        e.target.style.background = STATUS_BG[t.status];
        e.target.style.color = STATUS[t.status];
        updateSummary();
      }

      if (f === 'priority') {
        e.target.className = `priority priority-${t.priority}`;
      }

      if (f === 'due') {
        const isOverdue = t.due && t.due < todayStr() && t.status !== 'Done';
        e.target.classList.toggle('overdue-date', isOverdue);
        updateSummary();
      }

      if (f === 'progress') {
        const cell = tr.querySelector('.progress-cell');
        cell.querySelector('.bar-fill').style.width = t.progress + '%';
        cell.querySelector('.progress-pct').textContent = t.progress + '%';
        updateSummary();
      }
    });
  });

  rowsEl.querySelectorAll('.del-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      tasks.splice(Number(e.currentTarget.dataset.i), 1);
      render();
      saveTasks();
    });
  });
}

function updateSummary() {
  const total = tasks.length;
  const overall = total ? Math.round(tasks.reduce((s, t) => s + Number(t.progress), 0) / total) : 0;
  const overdue = tasks.filter(t => t.due && t.due < todayStr() && t.status !== 'Done').length;

  document.getElementById('overall-progress').textContent = overall + '%';
  document.getElementById('overdue-count').textContent = overdue;
  document.getElementById('task-count').textContent = total;
  document.getElementById('updated').textContent = 'as of ' + todayStr();

  const distBar = document.getElementById('dist-bar');
  const distLegend = document.getElementById('dist-legend');
  distBar.innerHTML = '';
  distLegend.innerHTML = '';
  Object.keys(STATUS).forEach(s => {
    const count = tasks.filter(t => t.status === s).length;
    const pct = total ? (count / total) * 100 : 0;
    const seg = document.createElement('div');
    seg.style.width = pct + '%';
    seg.style.background = STATUS[s];
    distBar.appendChild(seg);

    const item = document.createElement('span');
    item.innerHTML = `<span class="dot" style="background:${STATUS[s]}"></span>${s} (${count})`;
    distLegend.appendChild(item);
  });
}

document.getElementById('add-row').addEventListener('click', () => {
  tasks.push({ task: 'New task', owner: '', status: 'Not started', priority: 'Medium', start: todayStr(), due: todayStr(), progress: 0 });
  render();
  saveTasks();
});

document.getElementById('export-btn').addEventListener('click', () => {
  const data = tasks.map(t => ({
    Task: t.task,
    Owner: t.owner,
    Status: t.status,
    Priority: t.priority,
    Start: t.start || '',
    Due: t.due,
    "% complete": t.progress / 100
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [{ wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let r = 1; r <= range.e.r; r++) {
    const cell = ws[XLSX.utils.encode_cell({ r, c: 6 })];
    if (cell) cell.z = '0%';
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Tracker');
  const stamp = todayStr();
  XLSX.writeFile(wb, `project_tracker_backup_${stamp}.xlsx`);
});

render();

const toggleBtn = document.getElementById('theme-toggle');
function currentIsDark() {
  const explicit = document.documentElement.getAttribute('data-theme');
  if (explicit === 'dark') return true;
  if (explicit === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}
function updateToggleIcon() {
  toggleBtn.textContent = currentIsDark() ? '☀️' : '🌙';
}
toggleBtn.addEventListener('click', () => {
  document.documentElement.setAttribute('data-theme', currentIsDark() ? 'light' : 'dark');
  updateToggleIcon();
});
updateToggleIcon();
