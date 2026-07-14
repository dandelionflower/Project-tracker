const CATEGORY_COLORS = ["#4F46E5", "#0EA5E9", "#D97706", "#DB2777", "#059669", "#7C3AED", "#DC2626", "#0891B2"];
let categories = loadCategories();
let activities = loadActivities();
function loadCategories() {
  try {
    const saved = localStorage.getItem('project-tracker-categories');
    if (saved) return JSON.parse(saved);
  } catch (e) {}
  return [];
}
function saveCategories() {
  try {
    localStorage.setItem('project-tracker-categories', JSON.stringify(categories));
  } catch (e) {}
}
function loadActivities() {
  try {
    const saved = localStorage.getItem('project-tracker-activities');
    if (saved) return JSON.parse(saved);
  } catch (e) {}
  return [];
}
function saveActivities() {
  try {
    localStorage.setItem('project-tracker-activities', JSON.stringify(activities));
  } catch (e) {}
}
function logActivity(message) {
  const now = new Date();
  const timestamp = now.toISOString();
  const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  activities.unshift({ timestamp, time, message });
  if (activities.length > 100) activities.pop();
  saveActivities();
  renderActivityFeed();
}
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
let searchQuery = '';
let sortMode = 'none';
let overdueOnly = false;
const expandedTasks = new Set();
function taskMatchesFilters(t) {
  const q = searchQuery.trim().toLowerCase();
  const matchesSearch = !q || t.task.toLowerCase().includes(q) || (t.owner || '').toLowerCase().includes(q);
  const isOverdue = t.due && t.due < todayStr() && t.status !== 'Done';
  const matchesOverdue = !overdueOnly || isOverdue;
  return matchesSearch && matchesOverdue;
}
function sortIndices(indices) {
  const arr = [...indices];
  const priorityRank = { High: 0, Medium: 1, Low: 2 };
  if (sortMode === 'due') {
    arr.sort((a, b) => (tasks[a].due || '9999').localeCompare(tasks[b].due || '9999'));
  } else if (sortMode === 'priority') {
    arr.sort((a, b) => priorityRank[tasks[a].priority] - priorityRank[tasks[b].priority]);
  } else if (sortMode === 'progress') {
    arr.sort((a, b) => tasks[a].progress - tasks[b].progress);
  }
  return arr;
}
function renderGanttChart() {
  const ganttEl = document.getElementById('gantt-chart');
  if (!ganttEl) return;
  ganttEl.innerHTML = '';
  const tasksWithDates = tasks.filter(t => t.start && t.due);
  if (!tasksWithDates.length) {
    ganttEl.innerHTML = '<p style="padding: 12px; color: var(--ink-faint); font-size: 12px;">No tasks with dates to display.</p>';
    return;
  }
  const allDates = tasksWithDates.flatMap(t => [t.start, t.due]);
  const minDate = new Date(Math.min(...allDates.map(d => new Date(d))));
  const maxDate = new Date(Math.max(...allDates.map(d => new Date(d))));
  const dayCount = Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24)) + 1;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', tasksWithDates.length * 30 + 60);
  svg.setAttribute('style', 'font-family: Inter, sans-serif;');
  const labelWidth = 200;
  const chartLeft = labelWidth + 20;
  const chartWidth = Math.max(800, dayCount * 8);
  const totalWidth = chartLeft + chartWidth + 20;
  svg.setAttribute('viewBox', `0 0 ${totalWidth} ${tasksWithDates.length * 30 + 60}`);
  // Header
  const headerBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  headerBg.setAttribute('width', totalWidth);
  headerBg.setAttribute('height', 30);
  headerBg.setAttribute('fill', 'var(--bg)');
  svg.appendChild(headerBg);
  const headerText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  headerText.setAttribute('x', chartLeft + 10);
  headerText.setAttribute('y', 20);
  headerText.setAttribute('font-size', '12');
  headerText.setAttribute('font-weight', '600');
  headerText.setAttribute('fill', 'var(--ink-soft)');
  headerText.textContent = minDate.toLocaleDateString() + ' to ' + maxDate.toLocaleDateString();
  svg.appendChild(headerText);
  // Bars
  tasksWithDates.forEach((t, idx) => {
    const y = 40 + idx * 30;
    const startDate = new Date(t.start);
    const dueDate = new Date(t.due);
    const startOffset = Math.ceil((startDate - minDate) / (1000 * 60 * 60 * 24));
    const duration = Math.ceil((dueDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
    const barX = chartLeft + startOffset * 8;
    const barWidth = Math.max(duration * 8, 20);
    // Label
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', 10);
    label.setAttribute('y', y + 18);
    label.setAttribute('font-size', '11');
    label.setAttribute('fill', 'var(--ink)');
    label.textContent = t.task.substring(0, 25);
    svg.appendChild(label);
    // Bar
    const bar = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bar.setAttribute('x', barX);
    bar.setAttribute('y', y + 6);
    bar.setAttribute('width', barWidth);
    bar.setAttribute('height', 16);
    bar.setAttribute('fill', STATUS[t.status]);
    bar.setAttribute('opacity', t.status === 'Done' ? '0.6' : '1');
    bar.setAttribute('rx', '4');
    svg.appendChild(bar);
    // Progress indicator
    if (t.progress > 0 && t.progress < 100) {
      const progressBar = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      progressBar.setAttribute('x', barX);
      progressBar.setAttribute('y', y + 6);
      progressBar.setAttribute('width', (barWidth * t.progress) / 100);
      progressBar.setAttribute('height', 16);
      progressBar.setAttribute('fill', STATUS[t.status]);
      progressBar.setAttribute('opacity', '0.3');
      progressBar.setAttribute('rx', '4');
      svg.appendChild(progressBar);
    }
  });
  ganttEl.appendChild(svg);
}
function renderActivityFeed() {
  const feedEl = document.getElementById('activity-feed');
  if (!feedEl) return;
  feedEl.innerHTML = '';
  if (!activities.length) {
    feedEl.innerHTML = '<p style="padding: 12px; color: var(--ink-faint); font-size: 12px;">No activity yet.</p>';
    return;
  }
  activities.slice(0, 30).forEach(act => {
    const item = document.createElement('div');
    item.style.cssText = 'padding: 10px 12px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; gap: 12px;';
    
    const msg = document.createElement('span');
    msg.style.cssText = 'font-size: 12px; color: var(--ink-soft); flex: 1;';
    msg.textContent = act.message;
    
    const time = document.createElement('span');
    time.style.cssText = 'font-family: JetBrains Mono, monospace; font-size: 11px; color: var(--ink-faint); white-space: nowrap;';
    time.textContent = act.time;
    
    item.appendChild(msg);
    item.appendChild(time);
    feedEl.appendChild(item);
  });
}
function render() {
  const rowsEl = document.getElementById('rows');
  rowsEl.innerHTML = '';
  const groups = categories.map(c => ({ name: c, indices: [], deletable: true }));
  const other = { name: "Uncategorized", indices: [], deletable: false };
  tasks.forEach((t, i) => {
    const group = groups.find(g => g.name === t.category);
    if (group) group.indices.push(i); else other.indices.push(i);
  });
  const allGroups = other.indices.length ? [...groups, other] : groups;
  allGroups.forEach(group => {
    const header = document.createElement('tr');
    header.className = 'group-header';
    const y = group.indices.length;
    const x = group.indices.filter(i => tasks[i].status === 'Done').length;
    const pct = y ? Math.round((x / y) * 100) : 0;
    header.innerHTML = `
      <td colspan="9">
        <div class="group-header-inner">
          <span class="group-name">${group.name}</span>
          <span class="group-meta">
            ${y ? `[${x}/${y}] ${pct}%` : 'No tasks'}
            ${group.deletable ? `<button class="del-category-btn" data-category="${group.name}" aria-label="Delete category ${group.name}">&times;</button>` : ''}
          </span>
        </div>
      </td>
    `;
    rowsEl.appendChild(header);
    const visibleIndices = sortIndices(group.indices.filter(i => taskMatchesFilters(tasks[i])));
    if (!visibleIndices.length) {
      const empty = document.createElement('tr');
      empty.innerHTML = `<td colspan="9" class="no-matches">No matching tasks</td>`;
      rowsEl.appendChild(empty);
    }
    visibleIndices.forEach(i => {
      const t = tasks[i];
      const tr = document.createElement('tr');
      tr.className = 'rail';
      tr.style.setProperty('--row-color', STATUS[t.status]);
      const isOverdue = t.due && t.due < todayStr() && t.status !== 'Done';
      const subtasks = t.subtasks || [];
      const doneCount = subtasks.filter(s => s.done).length;
      const isExpanded = expandedTasks.has(i);
      tr.innerHTML = `
        <td>
          <div class="task-cell">
            <input type="text" value="${t.task}" data-i="${i}" data-f="task" />
            <button class="subtask-toggle ${isExpanded ? 'open' : ''}" data-i="${i}" data-action="toggle-subtasks">
              ${subtasks.length ? `${doneCount}/${subtasks.length} subtasks` : '+ subtasks'}
            </button>
          </div>
        </td>
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
        <td>
          <select class="category-tag" data-i="${i}" data-f="category">
            ${categories.map(c => `<option value="${c}" ${c === t.category ? 'selected' : ''}>${c}</option>`).join('')}
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
      if (isExpanded) {
        const panel = document.createElement('tr');
        panel.className = 'subtask-panel-row';
        panel.innerHTML = `
          <td colspan="9">
            <div class="subtask-panel">
              ${subtasks.map((s, si) => `
                <div class="subtask-item">
                  <input type="checkbox" data-i="${i}" data-si="${si}" data-action="toggle-subtask" ${s.done ? 'checked' : ''} />
                  <span class="${s.done ? 'subtask-done' : ''}">${s.text}</span>
                  <button data-i="${i}" data-si="${si}" data-action="delete-subtask" aria-label="Delete subtask">&times;</button>
                </div>
              `).join('')}
              <div class="subtask-add">
                <input type="text" placeholder="Add a subtask…" data-i="${i}" class="subtask-input" />
                <button data-i="${i}" data-action="add-subtask">Add</button>
              </div>
            </div>
          </td>
        `;
        rowsEl.appendChild(panel);
      }
    });
  });
  updateSummary();
  rowsEl.querySelectorAll('input, select').forEach(el => {
    if (!el.dataset.f) return;
    el.addEventListener('input', e => {
      const i = Number(e.target.dataset.i), f = e.target.dataset.f;
      const oldValue = tasks[i][f];
      tasks[i][f] = f === 'progress' ? Number(e.target.value) : e.target.value;
      
      // Log activity
      if (f === 'status') {
        logActivity(`Task "${tasks[i].task}" status changed to ${tasks[i][f]}`);
      } else if (f === 'progress') {
        logActivity(`Task "${tasks[i].task}" progress updated to ${tasks[i][f]}%`);
      }
      
      saveTasks();
      if (f === 'category') {
        render();
        return;
      }
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
        renderGanttChart();
      }
      if (f === 'priority') {
        e.target.className = `priority priority-${t.priority}`;
      }
      if (f === 'due') {
        const isOverdue = t.due && t.due < todayStr() && t.status !== 'Done';
        e.target.classList.toggle('overdue-date', isOverdue);
        updateSummary();
        renderGanttChart();
      }
      if (f === 'progress') {
        const cell = tr.querySelector('.progress-cell');
        cell.querySelector('.bar-fill').style.width = t.progress + '%';
        cell.querySelector('.progress-pct').textContent = t.progress + '%';
        updateSummary();
        renderGanttChart();
      }
    });
  });
  rowsEl.querySelectorAll('.del-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      const taskName = tasks[Number(e.currentTarget.dataset.i)].task;
      tasks.splice(Number(e.currentTarget.dataset.i), 1);
      logActivity(`Task "${taskName}" deleted`);
      render();
      saveTasks();
    });
  });
  rowsEl.querySelectorAll('.del-category-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      const name = e.currentTarget.dataset.category;
      const affected = tasks.filter(t => t.category === name).length;
      const msg = affected
        ? `Delete "${name}"? ${affected} task${affected === 1 ? '' : 's'} will move to Uncategorized.`
        : `Delete "${name}"?`;
      if (!confirm(msg)) return;
      tasks.forEach(t => { if (t.category === name) t.category = undefined; });
      categories = categories.filter(c => c !== name);
      logActivity(`Category "${name}" deleted`);
      saveCategories();
      saveTasks();
      render();
    });
  });
  rowsEl.querySelectorAll('[data-action="toggle-subtasks"]').forEach(btn => {
    btn.addEventListener('click', e => {
      const i = Number(e.currentTarget.dataset.i);
      if (expandedTasks.has(i)) expandedTasks.delete(i); else expandedTasks.add(i);
      render();
    });
  });
  rowsEl.querySelectorAll('[data-action="toggle-subtask"]').forEach(cb => {
    cb.addEventListener('change', e => {
      const i = Number(e.target.dataset.i), si = Number(e.target.dataset.si);
      tasks[i].subtasks[si].done = e.target.checked;
      logActivity(`Subtask "${tasks[i].subtasks[si].text}" ${e.target.checked ? 'completed' : 'unchecked'}`);
      saveTasks();
      render();
    });
  });
  rowsEl.querySelectorAll('[data-action="delete-subtask"]').forEach(btn => {
    btn.addEventListener('click', e => {
      const i = Number(e.currentTarget.dataset.i), si = Number(e.currentTarget.dataset.si);
      const subtaskText = tasks[i].subtasks[si].text;
      tasks[i].subtasks.splice(si, 1);
      logActivity(`Subtask "${subtaskText}" deleted`);
      saveTasks();
      render();
    });
  });
  function submitSubtask(i, inputEl) {
    const text = inputEl.value.trim();
    if (!text) return;
    if (!tasks[i].subtasks) tasks[i].subtasks = [];
    tasks[i].subtasks.push({ text, done: false });
    logActivity(`Subtask added to "${tasks[i].task}"`);
    saveTasks();
    render();
  }
  rowsEl.querySelectorAll('[data-action="add-subtask"]').forEach(btn => {
    btn.addEventListener('click', e => {
      const i = Number(e.currentTarget.dataset.i);
      const input = e.currentTarget.parentElement.querySelector('.subtask-input');
      submitSubtask(i, input);
    });
  });
  rowsEl.querySelectorAll('.subtask-input').forEach(input => {
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        submitSubtask(Number(e.target.dataset.i), e.target);
      }
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
  const statusList = document.getElementById('status-progress-list');
  statusList.innerHTML = '';
  Object.keys(STATUS).forEach(s => {
    const count = tasks.filter(t => t.status === s).length;
    const pct = total ? Math.round((count / total) * 100) : 0;
    const row = document.createElement('div');
    row.className = 'cat-progress-row';
    row.style.setProperty('--cat-color', STATUS[s]);
    row.innerHTML = `
      <div class="cat-progress-fill" style="width:${count ? pct : 0}%;"></div>
      <div class="cat-progress-label">
        <span>${s}</span>
        <span>${count ? `[${count}/${total}] ${pct}%` : 'No tasks'}</span>
      </div>
    `;
    statusList.appendChild(row);
  });
  const progressList = document.getElementById('category-progress-list');
  progressList.innerHTML = '';
  const catNames = [...categories];
  const uncategorizedCount = tasks.filter(t => !categories.includes(t.category)).length;
  if (uncategorizedCount) catNames.push('Uncategorized');
  catNames.forEach((name, idx) => {
    const inCategory = name === 'Uncategorized'
      ? tasks.filter(t => !categories.includes(t.category))
      : tasks.filter(t => t.category === name);
    const y = inCategory.length;
    const x = inCategory.filter(t => t.status === 'Done').length;
    const pct = y ? Math.round((x / y) * 100) : 0;
    const color = CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
    const row = document.createElement('div');
    row.className = 'cat-progress-row';
    row.style.setProperty('--cat-color', color);
    row.innerHTML = `
      <div class="cat-progress-fill" style="width:${y ? pct : 0}%;"></div>
      <div class="cat-progress-label">
        <span>${name}</span>
        <span>${y ? `[${x}/${y}] ${pct}%` : 'No tasks'}</span>
      </div>
    `;
    progressList.appendChild(row);
  });
  if (!catNames.length) {
    progressList.innerHTML = '<p class="cat-empty">No categories yet — add one to see progress here.</p>';
  }
}
document.getElementById('search-input').addEventListener('input', e => {
  searchQuery = e.target.value;
  render();
});
document.getElementById('sort-select').addEventListener('change', e => {
  sortMode = e.target.value;
  render();
});
document.getElementById('overdue-only').addEventListener('change', e => {
  overdueOnly = e.target.checked;
  render();
});
document.getElementById('add-category').addEventListener('click', () => {
  const name = window.prompt('New category name:');
  if (!name) return;
  const trimmed = name.trim();
  if (!trimmed) return;
  if (categories.includes(trimmed)) {
    alert('That category already exists.');
    return;
  }
  categories.push(trimmed);
  logActivity(`Category "${trimmed}" created`);
  saveCategories();
  render();
});
document.getElementById('add-row').addEventListener('click', () => {
  if (!categories.length) {
    alert('Please create a category first.');
    return;
  }
  tasks.push({ task: 'New task', owner: '', status: 'Not started', priority: 'Medium', category: categories[0], start: todayStr(), due: todayStr(), progress: 0, subtasks: [] });
  logActivity('New task created');
  render();
  saveTasks();
});
document.getElementById('export-btn').addEventListener('click', () => {
  const data = tasks.map(t => ({
    Task: t.task,
    Category: t.category || '',
    Owner: t.owner,
    Status: t.status,
    Priority: t.priority,
    Start: t.start || '',
    Due: t.due,
    "% complete": t.progress / 100
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [{ wch: 30 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let r = 1; r <= range.e.r; r++) {
    const cell = ws[XLSX.utils.encode_cell({ r, c: 7 })];
    if (cell) cell.z = '0%';
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Tracker');
  const stamp = todayStr();
  XLSX.writeFile(wb, `project_tracker_backup_${stamp}.xlsx`);
  logActivity('Project data exported to Excel');
});
render();
renderGanttChart();
renderActivityFeed();
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
