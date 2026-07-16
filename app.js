const CATEGORY_COLORS = ["#4F46E5", "#0EA5E9", "#D97706", "#DB2777", "#059669", "#7C3AED", "#DC2626", "#0891B2"];

function tagColor(tag) {
  let hash = 0;
  for (let c = 0; c < tag.length; c++) hash = (hash * 31 + tag.charCodeAt(c)) >>> 0;
  return CATEGORY_COLORS[hash % CATEGORY_COLORS.length];
}

function getDependencyTasks(t) {
  const ids = t.dependsOn || [];
  return ids.map(id => tasks.find(x => x.id === id)).filter(Boolean);
}

function isBlocked(t) {
  return getDependencyTasks(t).some(dep => dep.status !== 'Done');
}

// Progress is never set by hand — it's always derived:
//   - has subtasks: % of subtasks checked off (e.g. 2 of 5 = 40%)
//   - no subtasks: 0% for Not started/In progress/Blocked, 100% for Done
function syncProgress(t) {
  const subtasks = t.subtasks || [];
  if (subtasks.length) {
    const doneCount = subtasks.filter(s => s.done).length;
    t.progress = Math.round((doneCount / subtasks.length) * 100);
  } else {
    t.progress = t.status === 'Done' ? 100 : 0;
  }
}

// --- Multi-project support -------------------------------------------------
// Each project gets its own tasks/categories/activity log, stored under keys
// suffixed with the project's id. A separate "projects" list (not scoped to
// any project) tracks which projects exist and which one is active.

function loadProjects() {
  try {
    const saved = localStorage.getItem('project-tracker-projects-list');
    if (saved) return JSON.parse(saved);
  } catch (e) {}
  return [];
}

function saveProjects() {
  try {
    localStorage.setItem('project-tracker-projects-list', JSON.stringify(projects));
  } catch (e) {}
}

function makeProjectId() {
  return 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

function scopedKey(base) {
  return `project-tracker-${base}-${activeProjectId}`;
}

// One-time migration: if this is the first time the new multi-project
// system has run, wrap any existing (pre-multi-project) data in a default
// project instead of silently losing it.
function migrateToProjectsIfNeeded() {
  const existingProjects = loadProjects();
  if (existingProjects.length) return existingProjects;

  const defaultId = makeProjectId();
  const legacyTasks = localStorage.getItem('project-tracker-tasks');
  const legacyCategories = localStorage.getItem('project-tracker-categories');
  const legacyActivities = localStorage.getItem('project-tracker-activities');

  if (legacyTasks) {
    localStorage.setItem(`project-tracker-tasks-${defaultId}`, legacyTasks);
  } else {
    // Truly fresh install (never used the tracker before) — seed a friendly
    // example project. Projects created later via "+ New project" start empty.
    const sampleTasks = [
      { task: "Kickoff meeting", owner: "Mia", status: "Done", priority: "Medium", category: "📋 Requirements", start: "2026-06-28", due: "2026-07-01", progress: 100 },
      { task: "Draft requirements doc", owner: "Sam", status: "In progress", priority: "High", category: "📋 Requirements", start: "2026-07-02", due: "2026-07-16", progress: 60 },
      { task: "Design review", owner: "Priya", status: "Not started", priority: "Medium", category: "🎨 Design", start: "2026-07-17", due: "2026-07-22", progress: 0 },
      { task: "Vendor contract sign-off", owner: "Leo", status: "Blocked", priority: "High", category: "🚀 Deployment", start: "2026-07-05", due: "2026-07-10", progress: 20 }
    ];
    localStorage.setItem(`project-tracker-tasks-${defaultId}`, JSON.stringify(sampleTasks));
  }
  if (legacyCategories) localStorage.setItem(`project-tracker-categories-${defaultId}`, legacyCategories);
  if (legacyActivities) localStorage.setItem(`project-tracker-activities-${defaultId}`, legacyActivities);
  // Clean up the old unscoped keys now that they've been copied forward.
  localStorage.removeItem('project-tracker-tasks');
  localStorage.removeItem('project-tracker-categories');
  localStorage.removeItem('project-tracker-activities');

  const initial = [{ id: defaultId, name: 'My Project' }];
  localStorage.setItem('project-tracker-projects-list', JSON.stringify(initial));
  localStorage.setItem('project-tracker-active-project', defaultId);
  return initial;
}

let projects = migrateToProjectsIfNeeded();
let activeProjectId = localStorage.getItem('project-tracker-active-project') || projects[0].id;
if (!projects.some(p => p.id === activeProjectId)) activeProjectId = projects[0].id;

function getActiveProject() {
  return projects.find(p => p.id === activeProjectId) || projects[0];
}

function resetTransientViewState() {
  searchQuery = '';
  sortMode = 'none';
  overdueOnly = false;
  starredOnly = false;
  tagFilter = '';
  expandedTasks.clear();
  expandedDeps.clear();
  expandedNotes.clear();
  selectedTaskIds.clear();
  dismissedAlertIds = new Set();
  document.getElementById('search-input').value = '';
  document.getElementById('sort-select').value = 'none';
  document.getElementById('overdue-only').checked = false;
  document.getElementById('starred-only').checked = false;
}

function refreshProjectHeader() {
  const project = getActiveProject();
  document.getElementById('project-name-input').value = project.name;
  const switcher = document.getElementById('project-switcher');
  switcher.innerHTML = activeProjects().map(p => `<option value="${p.id}" ${p.id === activeProjectId ? 'selected' : ''}>${p.name}</option>`).join('');
  updateArchivedBtn();
}

function switchToProject(id) {
  if (id === activeProjectId) return;
  activeProjectId = id;
  localStorage.setItem('project-tracker-active-project', activeProjectId);

  tasks = loadTasks();
  categories = loadCategories();
  activities = loadActivities();
  resetTransientViewState();

  refreshProjectHeader();
  render();
  renderGanttChart();
  renderActivityFeed();
  if (typeof checkDueSoon === 'function') checkDueSoon();
}

function createNewProject() {
  const name = window.prompt('New project name:', 'Untitled Project');
  if (!name || !name.trim()) return;
  const project = { id: makeProjectId(), name: name.trim() };
  projects.push(project);
  saveProjects();
  switchToProject(project.id);
}

function renameActiveProject(newName) {
  const trimmed = newName.trim();
  if (!trimmed) { refreshProjectHeader(); return; } // revert to current name if cleared
  const project = getActiveProject();
  if (trimmed === project.name) return; // no actual change
  const oldName = project.name;
  project.name = trimmed;
  saveProjects();
  logActivity(`Project renamed from "${oldName}" to "${trimmed}"`);
  refreshProjectHeader();
}

function activeProjects() {
  return projects.filter(p => !p.archived);
}

function archivedProjects() {
  return projects.filter(p => p.archived);
}

// "Delete" a project no longer erases its data. It archives the project
// instead — the task/category/activity data stays in localStorage under the
// project's id, the project just drops out of the switcher and the active
// list, and can be restored (or truly deleted) later from the Archived list.
function deleteActiveProject() {
  if (activeProjects().length <= 1) {
    alert("You can't archive your only active project. Create another one first.");
    return;
  }
  const project = getActiveProject();
  if (!confirm(`Archive project "${project.name}"? Its data will be kept, and you can restore it anytime from the 🗃 Archived list.`)) return;

  project.archived = true;
  logActivity(`Project "${project.name}" archived`);
  saveProjects();

  const nextProject = activeProjects()[0];
  switchToProject(nextProject.id);
  updateArchivedBtn();
}

// Prompt-based flow: pick an archived project by number, then choose to
// restore it (bring it back to the active list) or permanently delete it
// (the only way its data actually gets erased).
function openArchivedProjects() {
  const archived = archivedProjects();
  if (!archived.length) {
    alert('No archived projects yet. Use 🗑 Delete on a project to archive it.');
    return;
  }

  const list = archived.map((p, idx) => `${idx + 1}. ${p.name}`).join('\n');
  const choice = window.prompt(`Archived projects:\n${list}\n\nEnter a number to choose one:`);
  if (!choice) return;
  const idx = parseInt(choice, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= archived.length) {
    alert('Not a valid number.');
    return;
  }

  const project = archived[idx];
  const action = window.prompt(`"${project.name}":\n\n1 = Restore\n2 = Permanently delete`);
  if (action === '1') {
    project.archived = false;
    saveProjects();
    logActivity(`Project "${project.name}" restored`);
    switchToProject(project.id);
    updateArchivedBtn();
  } else if (action === '2') {
    if (!confirm(`Permanently erase all data for "${project.name}"? This can't be undone.`)) return;
    projects = projects.filter(p => p.id !== project.id);
    localStorage.removeItem(`project-tracker-tasks-${project.id}`);
    localStorage.removeItem(`project-tracker-categories-${project.id}`);
    localStorage.removeItem(`project-tracker-activities-${project.id}`);
    saveProjects();
    logActivity(`Project "${project.name}" deleted`);
    switchToProject(activeProjects()[0].id);
    updateArchivedBtn();
  }
}

function updateArchivedBtn() {
  const badge = document.getElementById('archived-badge');
  const count = archivedProjects().length;
  if (count) {
    badge.textContent = count;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

document.getElementById('project-name-input').addEventListener('blur', e => {
  renameActiveProject(e.target.value);
});

document.getElementById('project-switcher').addEventListener('change', e => {
  switchToProject(e.target.value);
});

document.getElementById('new-project-btn').addEventListener('click', createNewProject);
document.getElementById('delete-project-btn').addEventListener('click', deleteActiveProject);
document.getElementById('archived-projects-btn').addEventListener('click', openArchivedProjects);

// --- Activity logging -------------------------------------------------------
let activities = [];

function loadActivities() {
  try {
    const saved = localStorage.getItem(scopedKey('activities'));
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];

    // Repair entries that don't match the current {time, msg} shape —
    // e.g. leftovers from an older version of the tracker that used
    // different field names, or stored the log as plain strings. Anything
    // with no usable message is dropped rather than kept around forever
    // as "Invalid Date undefined".
    const repaired = parsed.map(a => {
      if (typeof a === 'string' && a.trim()) {
        return { time: new Date().toISOString(), msg: a };
      }
      if (a && typeof a === 'object') {
        const msg = [a.msg, a.text, a.message, a.action, a.description]
          .find(v => typeof v === 'string' && v.trim());
        if (!msg) return null;
        const rawTime = a.time || a.timestamp || a.date || a.at;
        const time = rawTime && !isNaN(new Date(rawTime).getTime()) ? rawTime : new Date().toISOString();
        return { time, msg };
      }
      return null;
    }).filter(Boolean);

    if (repaired.length !== parsed.length || JSON.stringify(repaired) !== JSON.stringify(parsed)) {
      try { localStorage.setItem(scopedKey('activities'), JSON.stringify(repaired)); } catch (e) {}
    }

    return repaired;
  } catch (e) {}
  return [];
}

function saveActivities() {
  try {
    localStorage.setItem(scopedKey('activities'), JSON.stringify(activities));
  } catch (e) {}
}

function logActivity(msg) {
  activities.push({ time: new Date().toISOString(), msg });
  if (activities.length > 50) activities = activities.slice(-50);
  saveActivities();
  renderActivityFeed();
}

function renderActivityFeed() {
  const container = document.getElementById('activity-feed');
  if (!container) return;
  const feed = container.querySelector('div') || container;
  feed.innerHTML = activities.slice().reverse().filter(a => a && a.msg).map((a, idx) => {
    const date = new Date(a.time);
    const time = isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `<div class="activity-item"><span class="activity-time">${time}</span> ${a.msg}</div>`;
  }).join('');
}

// --- Gantt chart rendering --------------------------------------------------
function renderGanttChart() {
  const container = document.getElementById('gantt-chart');
  if (!container) return;

  const activeTasks = tasks.filter(t => !t.archived);
  if (!activeTasks.length) {
    container.innerHTML = '<p style="text-align:center;color:var(--ink-faint);padding:20px;">No tasks to display</p>';
    return;
  }

  // Find the date range across all tasks
  const starts = activeTasks.map(t => t.start).filter(d => d);
  const dues = activeTasks.map(t => t.due).filter(d => d);
  const allDates = [...starts, ...dues];
  if (!allDates.length) {
    container.innerHTML = '<p style="text-align:center;color:var(--ink-faint);padding:20px;">Add start/due dates to see the Gantt chart</p>';
    return;
  }

  const minDate = new Date(Math.min(...allDates.map(d => new Date(d).getTime())));
  const maxDate = new Date(Math.max(...allDates.map(d => new Date(d).getTime())));
  minDate.setDate(minDate.getDate() - 1);
  maxDate.setDate(maxDate.getDate() + 1);

  const chartWidth = 800;
  const barHeight = 24;
  const rowHeight = 32;
  const labelWidth = 200;
  const totalWidth = labelWidth + chartWidth + 40;
  const totalHeight = activeTasks.length * rowHeight + 60;

  let svg = `<svg viewBox="0 0 ${totalWidth} ${totalHeight}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;">`;

  // Background
  svg += `<rect width="${totalWidth}" height="${totalHeight}" fill="transparent" />`;

  // Timeline
  const dayCount = Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24));
  const pixelsPerDay = chartWidth / dayCount;
  const headerY = 20;

  svg += `<g fill="var(--ink-faint)" font-size="12">`;
  for (let i = 0; i <= dayCount; i += Math.ceil(dayCount / 10)) {
    const date = new Date(minDate);
    date.setDate(date.getDate() + i);
    const x = labelWidth + i * pixelsPerDay;
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    svg += `<text x="${x}" y="${headerY}" text-anchor="middle">${dateStr}</text>`;
    svg += `<line x1="${x}" y1="${headerY + 5}" x2="${x}" y2="${totalHeight}" stroke="var(--border)" stroke-width="0.5" opacity="0.3" />`;
  }
  svg += `</g>`;

  // Bars for each task
  activeTasks.forEach((t, idx) => {
    const y = 50 + idx * rowHeight;
    const isBlocked = getDependencyTasks(t).some(dep => dep.status !== 'Done');
    const fillColor = isBlocked ? 'var(--blocked)' : STATUS[t.status] || '#999';
    const opacity = isBlocked ? '0.4' : '0.8';

    // Task label
    const taskLabel = t.task.length > 25 ? t.task.substring(0, 22) + '...' : t.task;
    svg += `<text x="8" y="${y + 18}" font-size="13" fill="var(--ink)" text-anchor="start">${taskLabel}</text>`;

    // Determine bar span
    if (t.start && t.due) {
      const startDate = new Date(t.start);
      const dueDate = new Date(t.due);
      const startOffset = (startDate - minDate) / (1000 * 60 * 60 * 24);
      const duration = (dueDate - startDate) / (1000 * 60 * 60 * 24);
      const barX = labelWidth + startOffset * pixelsPerDay;
      const barWidth = Math.max(duration * pixelsPerDay, 4);

      svg += `<rect x="${barX}" y="${y + 5}" width="${barWidth}" height="${barHeight}" fill="${fillColor}" opacity="${opacity}" rx="3" />`;

      // Draw dependency arrows if this task depends on others
      const deps = getDependencyTasks(t);
      if (deps.length) {
        deps.forEach(dep => {
          const depIdx = activeTasks.indexOf(dep);
          if (depIdx !== -1) {
            const depY = 50 + depIdx * rowHeight + barHeight / 2;
            const depEndX = labelWidth + ((new Date(dep.due || dep.start) - minDate) / (1000 * 60 * 60 * 24)) * pixelsPerDay;
            const fromY = depY;
            const toY = y + 5 + barHeight / 2;
            const midX = (depEndX + barX) / 2;

            // Elbow arrow: horizontal → vertical → horizontal
            svg += `<path d="M ${depEndX} ${fromY} L ${midX} ${fromY} L ${midX} ${toY} L ${barX} ${toY}" stroke="var(--ink-faint)" stroke-width="1" fill="none" opacity="0.4" />`;
            svg += `<polygon points="${barX},${toY} ${barX - 4},${toY - 3} ${barX - 4},${toY + 3}" fill="var(--ink-faint)" opacity="0.4" />`;
          }
        });
      }
    }
  });

  svg += '</svg>';
  container.innerHTML = svg;
}

// --- Calendar rendering -----------------------------------------------------
function renderCalendar() {
  const container = document.getElementById('calendar-grid');
  if (!container) return;

  const [year, month, day] = (calendarMonth || todayStr()).split('-').map(Number);
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const startDate = new Date(firstDay);
  startDate.setDate(startDate.getDate() - firstDay.getDay());

  // Month label
  document.getElementById('cal-month-label').textContent = firstDay.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const days = [];
  let current = new Date(startDate);
  for (let i = 0; i < 42; i++) {
    days.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  const today = todayStr();
  const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let html = '';

  weekdayLabels.forEach(label => {
    html += `<div class="cal-weekday">${label}</div>`;
  });

  days.forEach(d => {
    const dateStr = d.toISOString().slice(0, 10);
    const isToday = dateStr === today;
    const isOtherMonth = d.getMonth() !== firstDay.getMonth();
    const dayNum = d.getDate();
    const dayTasks = tasks.filter(t => t.due === dateStr && t.status !== 'Done');
    const overdueCount = dayTasks.filter(t => t.due < today && t.status !== 'Done').length;
    const classStr = `cal-day ${isOtherMonth ? 'other-month' : ''} ${isToday ? 'today' : ''}`;

    html += `<div class="${classStr}"><div class="cal-day-num">${dayNum}</div>`;
    dayTasks.slice(0, 3).forEach(t => {
      const chipClass = `cal-task-chip ${overdueCount ? 'overdue-chip' : 'projected-chip'}`;
      const title = t.task.length > 20 ? t.task.substring(0, 17) + '…' : t.task;
      html += `<div class="${chipClass}" style="background:${STATUS[t.status] || '#999'}" title="${t.task}">${title}</div>`;
    });
    if (dayTasks.length > 3) {
      html += `<div class="cal-more">+${dayTasks.length - 3} more</div>`;
    }
    html += '</div>';
  });

  container.innerHTML = html;
}

let calendarMonth = todayStr();
document.getElementById('cal-prev')?.addEventListener('click', () => {
  const [y, m, d] = calendarMonth.split('-').map(Number);
  const date = new Date(y, m - 2, 1);
  calendarMonth = date.toISOString().slice(0, 7) + '-01';
  renderCalendar();
});
document.getElementById('cal-next')?.addEventListener('click', () => {
  const [y, m, d] = calendarMonth.split('-').map(Number);
  const date = new Date(y, m, 1);
  calendarMonth = date.toISOString().slice(0, 7) + '-01';
  renderCalendar();
});

// --- Task management -------------------------------------------------------
const STATUS = { 'Not started': '#9CA3AF', 'In progress': '#2563EB', 'Blocked': '#DC2626', 'Done': '#059669' };
const STATUS_BG = { 'Not started': '#F1F2F4', 'In progress': '#E9EFFE', 'Blocked': '#FDECEC', 'Done': '#E6F5EE' };

let tasks = [];
let categories = [];

function makeId() {
  return 'task_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 5);
}

function loadTasks() {
  try {
    const saved = localStorage.getItem(scopedKey('tasks'));
    if (saved) return JSON.parse(saved);
  } catch (e) {}
  return [];
}

function saveTasks() {
  try {
    localStorage.setItem(scopedKey('tasks'), JSON.stringify(tasks));
    const el = document.getElementById('save-status');
    if (el) {
      el.textContent = 'saved';
      clearTimeout(saveTasks._t);
      saveTasks._t = setTimeout(() => { el.textContent = ''; }, 1500);
    }
  } catch (e) {}
  if (typeof checkDueSoon === 'function') checkDueSoon();
  const calView = document.getElementById('calendar-view');
  if (calView && calView.style.display !== 'none' && typeof renderCalendar === 'function') {
    renderCalendar();
  }
}

function todayStr() { return new Date().toISOString().slice(0, 10); }

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function updateBulkActionBar() {
  const bar = document.getElementById('bulk-action-bar');
  const count = selectedTaskIds.size;
  document.getElementById('bulk-count').textContent = `${count} selected`;
  bar.style.display = count > 0 ? 'flex' : 'none';

  const catSelect = document.getElementById('bulk-category-select');
  const current = catSelect.value;
  catSelect.innerHTML = '<option value="">Move to category…</option>' +
    categories.map(c => `<option value="${c}" ${c === current ? 'selected' : ''}>${c}</option>`).join('');
}

function updateSelectAllCheckbox() {
  const selectAll = document.getElementById('select-all');
  const visibleCheckboxes = document.querySelectorAll('#rows .row-select:not(:disabled)');
  const allCheckboxes = document.querySelectorAll('#rows .row-select');
  if (!allCheckboxes.length) { selectAll.checked = false; selectAll.indeterminate = false; return; }
  const checkedCount = [...visibleCheckboxes].filter(cb => cb.checked).length;
  selectAll.checked = checkedCount === visibleCheckboxes.length && visibleCheckboxes.length > 0;
  selectAll.indeterminate = checkedCount > 0 && checkedCount < visibleCheckboxes.length;
}

function refreshTagFilterOptions() {
  const select = document.getElementById('tag-filter');
  const allTags = [...new Set(tasks.flatMap(t => t.tags || []))].sort();
  const current = select.value;
  select.innerHTML = '<option value="">All tags</option>' +
    allTags.map(tag => `<option value="${tag}" ${tag === current ? 'selected' : ''}>${tag}</option>`).join('');
  // If the previously selected tag no longer exists, fall back to "All tags".
  if (current && !allTags.includes(current)) {
    tagFilter = '';
    select.value = '';
  }
}

let searchQuery = '';
let sortMode = 'none';
let overdueOnly = false;
let starredOnly = false;
let tagFilter = '';
const expandedTasks = new Set();
const expandedDeps = new Set();
const expandedNotes = new Set();
let dragSrcTaskId = null;
const selectedTaskIds = new Set();

function taskMatchesFilters(t) {
  const q = searchQuery.trim().toLowerCase();
  const tags = t.tags || [];
  const matchesSearch = !q
    || t.task.toLowerCase().includes(q)
    || (t.owner || '').toLowerCase().includes(q)
    || tags.some(tag => tag.toLowerCase().includes(q));
  const isOverdue = t.due && t.due < todayStr() && t.status !== 'Done';
  const matchesOverdue = !overdueOnly || isOverdue;
  const matchesTag = !tagFilter || tags.includes(tagFilter);
  const matchesStarred = !starredOnly || t.starred;
  return matchesSearch && matchesOverdue && matchesTag && matchesStarred;
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
  // Starred tasks always float to the top of their group, regardless of
  // which secondary sort is active — quick access to what matters most.
  arr.sort((a, b) => (tasks[b].starred ? 1 : 0) - (tasks[a].starred ? 1 : 0));
  return arr;
}

function ganttLightFill(colorVar) {
  const hex = getComputedStyle(document.documentElement).getPropertyValue(colorVar).trim();
  const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, 0.1)`;
}

function loadCategories() {
  try {
    const saved = localStorage.getItem(scopedKey('categories'));
    if (saved) return JSON.parse(saved);
  } catch (e) {}
  return ['📋 Requirements', '🎨 Design', '💻 Development', '🧪 Testing', '🚀 Deployment', '🔧 Maintenance'];
}

function saveCategories() {
  try {
    localStorage.setItem(scopedKey('categories'), JSON.stringify(categories));
  } catch (e) {}
}

function createRecurringClone(original) {
  // Clone the task and add the date tag to its name
  const clone = JSON.parse(JSON.stringify(original));
  clone.id = makeId();
  
  // Strip any old date tag before adding a new one
  // Old format: "Task name (Mon DD)" or similar
  clone.task = clone.task.replace(/\s*\([A-Za-z]{3}\s+\d{1,2}\)\s*$/, '');
  
  // Add new date tag
  const nextCycle = addDays(clone.due, 7);
  const date = new Date(nextCycle + 'T00:00:00Z');
  const dateTag = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  clone.task += ` (${dateTag})`;
  
  clone.status = 'Not started';
  clone.progress = 0;
  clone.start = addDays(clone.start, 7);
  clone.due = nextCycle;
  clone.subtasks = (clone.subtasks || []).map(s => ({ ...s, done: false }));
  if (clone.dependsOn) delete clone.dependsOn;
  return clone;
}

tasks = loadTasks();
categories = loadCategories();
activities = loadActivities();

if (!tasks.length) {
  tasks = [
    { id: makeId(), task: 'Setup & welcome', owner: 'You', status: 'Done', priority: 'High', category: '📋 Requirements', start: todayStr(), due: todayStr(), progress: 100, subtasks: [{ text: 'Try creating a task', done: true }, { text: 'Explore the Gantt chart', done: false }] }
  ];
  saveTasks();
}

refreshProjectHeader();
renderActivityFeed();

// --- Search and filtering ---------------------------------------------------
document.getElementById('search-input').addEventListener('input', e => {
  searchQuery = e.target.value;
  render();
});
document.getElementById('sort-select').addEventListener('change', e => {
  sortMode = e.target.value;
  render();
});
document.getElementById('tag-filter').addEventListener('change', e => {
  tagFilter = e.target.value;
  render();
});
document.getElementById('overdue-only').addEventListener('change', e => {
  overdueOnly = e.target.checked;
  render();
});
document.getElementById('starred-only').addEventListener('change', e => {
  starredOnly = e.target.checked;
  render();
});

// --- Rendering functions ---------------------------------------------------
function captureRowRects() {
  const rows = document.querySelectorAll('#rows tr.rail');
  const rects = new Map();
  rows.forEach(row => {
    const id = row.dataset.taskId;
    if (id) rects.set(id, row.getBoundingClientRect());
  });
  return rects;
}

function playFlipAnimation(oldRects) {
  const rows = document.querySelectorAll('#rows tr.rail');
  rows.forEach(row => {
    const id = row.dataset.taskId;
    if (!id || !oldRects.has(id)) return;
    const oldRect = oldRects.get(id);
    const newRect = row.getBoundingClientRect();
    const deltaY = oldRect.top - newRect.top;
    if (Math.abs(deltaY) < 1) return;
    row.animate([
      { transform: `translateY(${deltaY}px)`, opacity: 1 },
      { transform: 'translateY(0)', opacity: 1 }
    ], { duration: 300, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' });
  });
}

function render() {
  const rowsEl = document.getElementById('rows');
  rowsEl.innerHTML = '';

  tasks.forEach(syncProgress);

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
      <td colspan="10">
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
      empty.innerHTML = `<td colspan="10" class="no-matches">No matching tasks</td>`;
      rowsEl.appendChild(empty);
    }

    visibleIndices.forEach(i => {
      const t = tasks[i];
      const blocked = isBlocked(t);

      // Keep status truthful to the lock: if something makes this task
      // blocked again later (e.g. a completed dependency gets reopened),
      // status snaps back to "Blocked" rather than showing a stale value.
      if (blocked && t.status !== 'Blocked') {
        t.status = 'Blocked';
        saveTasks();
      }

      const tr = document.createElement('tr');
      tr.className = 'rail' + (blocked ? ' is-blocked' : '');
      tr.dataset.taskId = t.id;
      tr.style.setProperty('--row-color', STATUS[t.status]);
      const isOverdue = t.due && t.due < todayStr() && t.status !== 'Done';
      const subtasks = t.subtasks || [];
      const doneCount = subtasks.filter(s => s.done).length;
      const isExpanded = expandedTasks.has(i);

      tr.innerHTML = `
        <td><input type="checkbox" class="row-select" data-task-id="${t.id}" ${selectedTaskIds.has(t.id) ? 'checked' : ''} ${blocked ? 'disabled title="Locked until its dependency is done"' : ''} aria-label="Select task" /></td>
        <td>
          <div class="task-cell">
            <div class="task-cell-row">
              <button class="star-toggle ${t.starred ? 'starred' : ''}" data-i="${i}" data-action="toggle-star" title="${t.starred ? 'Unstar' : 'Star'} this task" aria-label="Toggle star" ${blocked ? 'disabled' : ''}>${t.starred ? '★' : '☆'}</button>
              <span class="drag-handle" draggable="${!blocked}" data-i="${i}" title="${blocked ? 'Locked until its dependency is done' : 'Drag to reorder'}">⠿</span>
              <input type="text" value="${t.task}" data-i="${i}" data-f="task" ${blocked ? 'disabled title="Locked until its dependency is done"' : ''} />
              ${blocked ? '<span class="blocked-badge" title="Waiting on incomplete dependencies">🔒 Blocked</span>' : ''}
            </div>
            <div class="task-cell-tags">
              <button class="subtask-toggle ${isExpanded ? 'open' : ''}" data-i="${i}" data-action="toggle-subtasks" ${blocked ? 'disabled' : ''}>
                ${subtasks.length ? `${doneCount}/${subtasks.length} subtasks` : '+ subtasks'}
              </button>
              <button class="recurring-toggle ${t.recurring ? 'on' : ''}" data-i="${i}" data-action="toggle-recurring" title="Repeat weekly after completion" ${blocked ? 'disabled' : ''}>
                🔁 ${t.recurring ? 'Repeats weekly' : 'Make recurring'}
              </button>
              <button class="deps-toggle ${expandedDeps.has(i) ? 'open' : ''}" data-i="${i}" data-action="toggle-deps">
                🔗 ${(t.dependsOn || []).length ? `${(t.dependsOn || []).length} dependenc${(t.dependsOn || []).length === 1 ? 'y' : 'ies'}` : '+ dependency'}
              </button>
              <button class="notes-toggle ${(t.notes || '').trim() ? 'has-notes' : ''}" data-i="${i}" data-action="toggle-notes" ${blocked ? 'disabled' : ''}>
                📝 ${(t.notes || '').trim() ? 'Notes' : '+ notes'}
              </button>
            </div>
            <div class="task-tags-row">
              ${(t.tags || []).map(tag => `
                <span class="tag-chip" style="--tag-color:${tagColor(tag)}">
                  ${tag}
                  <button data-i="${i}" data-tag="${tag}" data-action="remove-tag" aria-label="Remove tag ${tag}" ${blocked ? 'disabled' : ''}>&times;</button>
                </span>
              `).join('')}
              <button class="tag-add-btn" data-i="${i}" data-action="add-tag" ${blocked ? 'disabled' : ''}>+ tag</button>
            </div>
          </div>
        </td>
        <td><input type="text" value="${t.owner}" data-i="${i}" data-f="owner" ${blocked ? 'disabled' : ''} /></td>
        <td>
          <select class="status-pill" data-i="${i}" data-f="status" style="background:${STATUS_BG[t.status]}; color:${STATUS[t.status]};" ${blocked ? 'disabled title="Locked until its dependency is done"' : ''}>
            ${Object.keys(STATUS).map(s => `<option value="${s}" style="color:${STATUS[s]}; background:${STATUS_BG[s]};" ${s === t.status ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </td>
        <td>
          <select class="priority priority-${t.priority}" data-i="${i}" data-f="priority" ${blocked ? 'disabled' : ''}>
            <option value="Low" style="color:#228B22;" ${t.priority === 'Low' ? 'selected' : ''}>Low</option>
            <option value="Medium" style="color:#B45309;" ${t.priority === 'Medium' ? 'selected' : ''}>Medium</option>
            <option value="High" style="color:#8B0000;" ${t.priority === 'High' ? 'selected' : ''}>High</option>
          </select>
        </td>
        <td>
          <select class="category-tag" data-i="${i}" data-f="category" ${blocked ? 'disabled' : ''}>
            ${categories.map(c => `<option value="${c}" ${c === t.category ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </td>
        <td><input type="date" value="${t.start || ''}" data-i="${i}" data-f="start" ${blocked ? 'disabled' : ''} /></td>
        <td><input type="date" value="${t.due}" data-i="${i}" data-f="due" class="${isOverdue ? 'overdue-date' : ''}" ${blocked ? 'disabled' : ''} /></td>
        <td>
          <div class="progress-cell">
            <div class="bar-track">
              <div class="bar-fill" style="width:${t.progress}%;"></div>
              <input type="range" min="0" max="100" step="5" value="${t.progress}" data-i="${i}" data-f="progress" disabled title="${subtasks.length ? 'Auto-calculated from subtasks' : 'Set automatically when marked Done'}" />
            </div>
            <span class="progress-pct">${t.progress}%</span>
          </div>
        </td>
        <td><button class="del-btn" data-i="${i}" aria-label="Delete task">&times;</button></td>
      `;
      rowsEl.appendChild(tr);

      if (isExpanded && !blocked) {
        const panel = document.createElement('tr');
        panel.className = 'subtask-panel-row';
        panel.innerHTML = `
          <td colspan="10">
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

      if (expandedDeps.has(i)) {
        const deps = getDependencyTasks(t);
        const otherTasks = tasks.filter(x => x.id !== t.id && !(t.dependsOn || []).includes(x.id));
        const panel = document.createElement('tr');
        panel.className = 'subtask-panel-row';
        panel.innerHTML = `
          <td colspan="10">
            <div class="subtask-panel">
              ${deps.length ? deps.map(dep => `
                <div class="subtask-item">
                  <span class="dep-status-dot" style="background:${STATUS[dep.status]};"></span>
                  <span class="${dep.status === 'Done' ? 'subtask-done' : ''}">${dep.task} <span class="dep-status-label">(${dep.status})</span></span>
                  <button data-i="${i}" data-dep-id="${dep.id}" data-action="remove-dependency" aria-label="Remove dependency">&times;</button>
                </div>
              `).join('') : '<span class="no-deps-msg">No dependencies — this task is not blocked by anything.</span>'}
              <div class="subtask-add">
                <select class="dependency-select" data-i="${i}">
                  <option value="">Add a dependency…</option>
                  ${otherTasks.map(x => `<option value="${x.id}">${x.task}</option>`).join('')}
                </select>
                <button data-i="${i}" data-action="add-dependency">Add</button>
              </div>
            </div>
          </td>
        `;
        rowsEl.appendChild(panel);
      }

      if (expandedNotes.has(i) && !blocked) {
        const panel = document.createElement('tr');
        panel.className = 'subtask-panel-row';
        panel.innerHTML = `
          <td colspan="10">
            <div class="subtask-panel">
              <textarea class="notes-textarea" data-i="${i}" data-f="notes" placeholder="Add notes, context, or a running log for this task…">${t.notes || ''}</textarea>
            </div>
          </td>
        `;
        rowsEl.appendChild(panel);
      }
    });
  });

  updateSummary();
  refreshTagFilterOptions();
  updateBulkActionBar();

  rowsEl.querySelectorAll('.row-select').forEach(cb => {
    cb.addEventListener('change', e => {
      const id = e.target.dataset.taskId;
      if (e.target.checked) selectedTaskIds.add(id); else selectedTaskIds.delete(id);
      updateBulkActionBar();
      updateSelectAllCheckbox();
    });
  });

  rowsEl.querySelectorAll('input, select, textarea').forEach(el => {
    if (!el.dataset.f) return;
    el.addEventListener('input', e => {
      const i = Number(e.target.dataset.i), f = e.target.dataset.f;
      const oldValue = tasks[i][f];

      // Hard block: a blocked task's fields are rendered disabled, so this
      // is a last line of defense in case an event slips through.
      if (isBlocked(tasks[i])) {
        e.target.value = oldValue;
        return;
      }

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

      if (f === 'task' || f === 'owner' || f === 'notes') {
        return;
      }

      if (f === 'status') {
        if (t.status === 'Done' && oldValue !== 'Done' && t.recurring) {
          const clone = createRecurringClone(t);
          tasks.push(clone);
          logActivity(`Recurring task "${clone.task}" scheduled for next cycle`);
          saveTasks();
        }
        updateSummary();
        renderGanttChart();
        render(); // full re-render: other rows may depend on this task's status
        return;
      }

      if (f === 'priority') {
        e.target.className = `priority priority-${t.priority}`;
      }

      if (f === 'start') {
        renderGanttChart();
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

  rowsEl.querySelectorAll('.drag-handle').forEach(handle => {
    handle.addEventListener('dragstart', e => {
      const i = Number(e.currentTarget.dataset.i);
      dragSrcTaskId = tasks[i] ? tasks[i].id : null;
      e.dataTransfer.effectAllowed = 'move';
      const tr = e.currentTarget.closest('tr');
      // Let the browser paint the native drag image before dimming the row —
      // dimming immediately would make the drag ghost look dim too.
      requestAnimationFrame(() => tr.classList.add('dragging'));
    });
    handle.addEventListener('dragend', e => {
      e.currentTarget.closest('tr').classList.remove('dragging');
    });
  });

  rowsEl.querySelectorAll('tr.rail').forEach(row => {
    row.addEventListener('dragover', e => {
      if (!dragSrcTaskId) return;
      e.preventDefault();
      row.classList.add('drag-over');
    });
    row.addEventListener('dragleave', () => {
      row.classList.remove('drag-over');
    });
    row.addEventListener('drop', e => {
      e.preventDefault();
      row.classList.remove('drag-over');
      const targetTaskId = row.dataset.taskId;
      if (!dragSrcTaskId || dragSrcTaskId === targetTaskId) return;

      const srcIdx = tasks.findIndex(x => x.id === dragSrcTaskId);
      const targetIdx = tasks.findIndex(x => x.id === targetTaskId);
      if (srcIdx === -1 || targetIdx === -1) return;

      const [moved] = tasks.splice(srcIdx, 1);
      const newTargetIdx = tasks.findIndex(x => x.id === targetTaskId);
      moved.category = tasks[newTargetIdx].category; // dropping into another group's row adopts that category
      tasks.splice(newTargetIdx, 0, moved);

      dragSrcTaskId = null;
      logActivity(`Reordered "${moved.task}"`);

      const oldRects = captureRowRects();
      saveTasks();
      render();
      playFlipAnimation(oldRects);
    });
  });

  rowsEl.querySelectorAll('.del-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      const deletedTask = tasks[Number(e.currentTarget.dataset.i)];
      const taskName = deletedTask.task;
      tasks.splice(Number(e.currentTarget.dataset.i), 1);
      tasks.forEach(t => { if (t.dependsOn) t.dependsOn = t.dependsOn.filter(id => id !== deletedTask.id); });
      logActivity(`Task "${taskName}" deleted`);
      render();
      saveTasks();
      renderGanttChart();
    });
  });

  rowsEl.querySelectorAll('.del-category-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      const cat = e.currentTarget.dataset.category;
      if (!confirm(`Delete category "${cat}" and move all tasks to Uncategorized?`)) return;
      tasks.forEach(t => { if (t.category === cat) t.category = ''; });
      categories = categories.filter(c => c !== cat);
      logActivity(`Category "${cat}" deleted`);
      saveCategories();
      saveTasks();
      render();
    });
  });

  rowsEl.querySelectorAll('[data-action="toggle-star"]').forEach(btn => {
    btn.addEventListener('click', e => {
      const i = Number(e.currentTarget.dataset.i);
      if (isBlocked(tasks[i])) return;
      tasks[i].starred = !tasks[i].starred;
      logActivity(`Task "${tasks[i].task}" ${tasks[i].starred ? 'starred' : 'unstarred'}`);
      saveTasks();
      render();
    });
  });

  rowsEl.querySelectorAll('[data-action="toggle-recurring"]').forEach(btn => {
    btn.addEventListener('click', e => {
      const i = Number(e.currentTarget.dataset.i);
      if (isBlocked(tasks[i])) return;
      tasks[i].recurring = !tasks[i].recurring;
      logActivity(`Task "${tasks[i].task}" recurring set to ${tasks[i].recurring}`);
      saveTasks();
      render();
    });
  });

  rowsEl.querySelectorAll('[data-action="toggle-subtasks"]').forEach(btn => {
    btn.addEventListener('click', e => {
      const i = Number(e.currentTarget.dataset.i);
      if (isBlocked(tasks[i])) return;
      if (expandedTasks.has(i)) expandedTasks.delete(i); else expandedTasks.add(i);
      render();
    });
  });

  rowsEl.querySelectorAll('[data-action="toggle-deps"]').forEach(btn => {
    btn.addEventListener('click', e => {
      const i = Number(e.currentTarget.dataset.i);
      if (expandedDeps.has(i)) expandedDeps.delete(i); else expandedDeps.add(i);
      render();
    });
  });

  rowsEl.querySelectorAll('[data-action="toggle-notes"]').forEach(btn => {
    btn.addEventListener('click', e => {
      const i = Number(e.currentTarget.dataset.i);
      if (isBlocked(tasks[i])) return;
      if (expandedNotes.has(i)) expandedNotes.delete(i); else expandedNotes.add(i);
      render();
    });
  });

  rowsEl.querySelectorAll('[data-action="add-dependency"]').forEach(btn => {
    btn.addEventListener('click', e => {
      const i = Number(e.currentTarget.dataset.i);
      const select = e.currentTarget.parentElement.querySelector('.dependency-select');
      const depId = select.value;
      if (!depId) return;
      if (!tasks[i].dependsOn) tasks[i].dependsOn = [];
      if (tasks[i].dependsOn.includes(depId)) return;

      // Block direct circular dependencies (A depends on B, B depends on A).
      const depTask = tasks.find(x => x.id === depId);
      if (depTask && (depTask.dependsOn || []).includes(tasks[i].id)) {
        alert(`"${depTask.task}" already depends on this task — that would create a circular dependency.`);
        return;
      }

      tasks[i].dependsOn.push(depId);
      logActivity(`"${tasks[i].task}" now depends on "${depTask ? depTask.task : 'a task'}"`);

      // A daughter task depending on an unfinished mother task is blocked
      // right away — don't wait for the next status edit to reflect that.
      if (depTask && depTask.status !== 'Done' && tasks[i].status !== 'Blocked') {
        tasks[i].status = 'Blocked';
        logActivity(`"${tasks[i].task}" automatically set to Blocked (waiting on "${depTask.task}")`);
      }

      saveTasks();
      render();
      renderGanttChart();
    });
  });

  rowsEl.querySelectorAll('[data-action="remove-dependency"]').forEach(btn => {
    btn.addEventListener('click', e => {
      const i = Number(e.currentTarget.dataset.i);
      const depId = e.currentTarget.dataset.depId;
      tasks[i].dependsOn = (tasks[i].dependsOn || []).filter(id => id !== depId);
      saveTasks();
      render();
    });
  });

  rowsEl.querySelectorAll('[data-action="add-tag"]').forEach(btn => {
    btn.addEventListener('click', e => {
      const i = Number(e.currentTarget.dataset.i);
      if (isBlocked(tasks[i])) return;
      const raw = window.prompt('Add tag:');
      if (!raw) return;
      const tag = raw.trim();
      if (!tag) return;
      if (!tasks[i].tags) tasks[i].tags = [];
      if (tasks[i].tags.some(x => x.toLowerCase() === tag.toLowerCase())) return;
      tasks[i].tags.push(tag);
      logActivity(`Tag "${tag}" added to "${tasks[i].task}"`);
      saveTasks();
      render();
    });
  });

  rowsEl.querySelectorAll('[data-action="remove-tag"]').forEach(btn => {
    btn.addEventListener('click', e => {
      const i = Number(e.currentTarget.dataset.i);
      if (isBlocked(tasks[i])) return;
      const tag = e.currentTarget.dataset.tag;
      tasks[i].tags = (tasks[i].tags || []).filter(x => x !== tag);
      logActivity(`Tag "${tag}" removed from "${tasks[i].task}"`);
      saveTasks();
      render();
    });
  });

  rowsEl.querySelectorAll('[data-action="toggle-subtask"]').forEach(cb => {
    cb.addEventListener('change', e => {
      const i = Number(e.target.dataset.i), si = Number(e.target.dataset.si);
      tasks[i].subtasks[si].done = e.target.checked;
      logActivity(`Subtask "${tasks[i].subtasks[si].text}" ${e.target.checked ? 'completed' : 'unchecked'}`);
      syncProgress(tasks[i]);
      saveTasks();
      render();
      renderGanttChart();
    });
  });

  rowsEl.querySelectorAll('[data-action="delete-subtask"]').forEach(btn => {
    btn.addEventListener('click', e => {
      const i = Number(e.currentTarget.dataset.i), si = Number(e.currentTarget.dataset.si);
      const subtaskText = tasks[i].subtasks[si].text;
      tasks[i].subtasks.splice(si, 1);
      logActivity(`Subtask "${subtaskText}" deleted`);
      syncProgress(tasks[i]);
      saveTasks();
      render();
      renderGanttChart();
    });
  });

  function submitSubtask(i, inputEl) {
    const text = inputEl.value.trim();
    if (!text) return;
    if (!tasks[i].subtasks) tasks[i].subtasks = [];
    tasks[i].subtasks.push({ text, done: false });
    logActivity(`Subtask added to "${tasks[i].task}"`);
    syncProgress(tasks[i]);
    saveTasks();
    render();
    renderGanttChart();
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

  rowsEl.querySelectorAll('.notes-textarea').forEach(ta => {
    ta.addEventListener('input', e => {
      const i = Number(e.target.dataset.i);
      tasks[i].notes = e.target.value;
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

  const statusList = document.getElementById('status-progress-list');
  if (statusList) {
    const statuses = ['Done', 'In progress', 'Not started', 'Blocked'];
    statusList.innerHTML = statuses.map(s => {
      const count = tasks.filter(t => t.status === s).length;
      const pct = total ? Math.round((count / total) * 100) : 0;
      return `
        <div class="progress-bar-row">
          <div class="progress-bar-label">${s}</div>
          <div class="progress-bar">
            <div class="progress-bar-fill" style="width:${pct}%; background:${STATUS[s]};"></div>
          </div>
          <div class="progress-bar-text">${count} (${pct}%)</div>
        </div>
      `;
    }).join('');
  }

  const categoryList = document.getElementById('category-progress-list');
  if (categoryList) {
    categoryList.innerHTML = categories.map(cat => {
      const catTasks = tasks.filter(t => t.category === cat);
      const catCount = catTasks.length;
      const done = catTasks.filter(t => t.status === 'Done').length;
      const pct = catCount ? Math.round((done / catCount) * 100) : 0;
      return `
        <div class="progress-bar-row">
          <div class="progress-bar-label">${cat}</div>
          <div class="progress-bar">
            <div class="progress-bar-fill" style="width:${pct}%;"></div>
          </div>
          <div class="progress-bar-text">${done}/${catCount} (${pct}%)</div>
        </div>
      `;
    }).join('');
  }
}

// --- View switching ---------------------------------------------------------
document.getElementById('view-table-btn').addEventListener('click', () => {
  document.getElementById('table-view').style.display = 'block';
  document.getElementById('calendar-view').style.display = 'none';
  document.getElementById('view-table-btn').classList.add('active');
  document.getElementById('view-calendar-btn').classList.remove('active');
});
document.getElementById('view-calendar-btn').addEventListener('click', () => {
  document.getElementById('table-view').style.display = 'none';
  document.getElementById('calendar-view').style.display = 'block';
  document.getElementById('view-calendar-btn').classList.add('active');
  document.getElementById('view-table-btn').classList.remove('active');
  renderCalendar();
});

// --- Due-soon alerts -----------------------------------------------------
// The in-page banner always works (no permissions needed) and is the
// primary alert. A real OS notification fires too, but only as a bonus,
// since browsers heavily restrict Notification on file:// pages.
let notificationsEnabled = localStorage.getItem('project-tracker-notify') === 'on';
let dismissedAlertIds = new Set();

const notifyBtn = document.getElementById('notify-btn');
function updateNotifyBtn() {
  notifyBtn.classList.toggle('alarm-on', notificationsEnabled);
}
updateNotifyBtn();

function getDueSoonTasks() {
  const soonCutoff = addDays(todayStr(), 1); // due today or tomorrow counts as "soon"
  return tasks.filter(t => {
    if (!t.due || t.status === 'Done' || dismissedAlertIds.has(t.id)) return false;
    return t.due <= soonCutoff; // covers overdue and due-soon in one check
  });
}

function renderAlertBanner() {
  const container = document.getElementById('alert-banner-container');
  if (!notificationsEnabled) { container.innerHTML = ''; return; }

  const due = getDueSoonTasks();
  if (!due.length) { container.innerHTML = ''; return; }

  const overdueCount = due.filter(t => t.due < todayStr()).length;
  const soonCount = due.length - overdueCount;
  const parts = [];
  if (overdueCount) parts.push(`${overdueCount} overdue`);
  if (soonCount) parts.push(`${soonCount} due soon`);

  container.innerHTML = `
    <div class="alert-banner">
      <span class="alert-banner-text">
        <strong>${due.length} task${due.length === 1 ? '' : 's'} need attention</strong> — ${parts.join(', ')}: ${due.map(t => t.task).join(', ')}
      </span>
      <button class="alert-banner-dismiss" id="dismiss-alert-banner" aria-label="Dismiss">&times;</button>
    </div>
  `;
  document.getElementById('dismiss-alert-banner').addEventListener('click', () => {
    due.forEach(t => dismissedAlertIds.add(t.id));
    renderAlertBanner();
  });
}

function checkDueSoon() {
  renderAlertBanner();

  // Bonus: try a real OS notification too, but never rely on it alone.
  if (!notificationsEnabled || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    getDueSoonTasks().forEach(t => {
      new Notification('Project tracker', {
        body: `"${t.task}" ${t.due < todayStr() ? 'is overdue' : 'is due soon'} (${t.due})`
      });
    });
  } catch (e) {
    // OS notification failed silently (common on file:// pages) — the
    // in-page banner above already covers this, so nothing else to do.
  }
}

notifyBtn.addEventListener('click', () => {
  if (!notificationsEnabled) {
    notificationsEnabled = true;
    localStorage.setItem('project-tracker-notify', 'on');
    updateNotifyBtn();
    dismissedAlertIds = new Set();
    checkDueSoon();

    // Try to also enable OS notifications, but this is optional —
    // the in-page banner works regardless of whether this succeeds.
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  } else {
    notificationsEnabled = false;
    localStorage.setItem('project-tracker-notify', 'off');
    updateNotifyBtn();
    document.getElementById('alert-banner-container').innerHTML = '';
  }
});

checkDueSoon();

// --- Print report --------------------------------------------------------
document.getElementById('print-btn').addEventListener('click', () => {
  window.print();
});

// --- JSON backup / restore ------------------------------------------------
document.getElementById('json-export-btn').addEventListener('click', () => {
  const backup = {
    exportedAt: new Date().toISOString(),
    version: 1,
    tasks,
    categories
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `project_tracker_backup_${todayStr()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  logActivity('Project data exported to JSON');
});

document.getElementById('json-import-btn').addEventListener('click', () => {
  document.getElementById('json-import-input').click();
});

document.getElementById('json-import-input').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    let parsed;
    try {
      parsed = JSON.parse(reader.result);
    } catch (err) {
      alert('That file is not valid JSON.');
      e.target.value = '';
      return;
    }

    if (!parsed || !Array.isArray(parsed.tasks)) {
      alert('This JSON file doesn\'t look like a project tracker backup (missing a "tasks" array).');
      e.target.value = '';
      return;
    }

    const taskCount = parsed.tasks.length;
    const categoryCount = Array.isArray(parsed.categories) ? parsed.categories.length : 0;
    const proceed = confirm(
      `Import ${taskCount} task${taskCount === 1 ? '' : 's'} and ${categoryCount} categor${categoryCount === 1 ? 'y' : 'ies'}?\n\n` +
      `This will REPLACE all current data in this tracker. This can't be undone.`
    );
    if (!proceed) { e.target.value = ''; return; }

    // Backfill IDs in case the imported file predates the ID system.
    tasks = parsed.tasks.map(t => ({ ...t, id: t.id || makeId() }));
    categories = Array.isArray(parsed.categories) ? parsed.categories : [];

    saveTasks();
    saveCategories();
    dismissedAlertIds = new Set();
    render();
    renderGanttChart();
    logActivity(`Restored from backup (${taskCount} tasks)`);
    e.target.value = '';
  };
  reader.onerror = () => {
    alert('Could not read that file.');
    e.target.value = '';
  };
  reader.readAsText(file);
});

// --- Excel export --------------------------------------------------------
document.getElementById('export-btn').addEventListener('click', () => {
  const data = tasks.map(t => ({
    Task: t.task,
    Category: t.category || '',
    Owner: t.owner,
    Status: t.status,
    Priority: t.priority,
    Tags: (t.tags || []).join(', '),
    Start: t.start || '',
    Due: t.due || '',
    Progress: t.progress + '%',
    Notes: t.notes || ''
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Tasks');
  XLSX.writeFile(wb, `project_tracker_${todayStr()}.xlsx`);
  logActivity('Tasks exported to Excel');
});

// --- Keyboard shortcuts ---------------------------------------------------
document.addEventListener('keydown', e => {
  const tag = (document.activeElement.tagName || '').toLowerCase();
  const isTyping = tag === 'input' || tag === 'select' || tag === 'textarea';

  if (e.key === 'Escape' && isTyping) {
    document.activeElement.blur();
    return;
  }
  if (isTyping) return; // don't hijack shortcuts while typing anywhere else

  if (e.key === '/' || (e.key.toLowerCase() === 'f' && (e.metaKey || e.ctrlKey))) {
    e.preventDefault();
    document.getElementById('search-input').focus();
  } else if (e.key.toLowerCase() === 'n') {
    e.preventDefault();
    document.getElementById('add-row').click();
  }
});

// --- Select all functionality -----------------------------------------------
document.getElementById('select-all').addEventListener('change', e => {
  // Only select non-blocked visible tasks
  const visibleCheckboxes = document.querySelectorAll('#rows .row-select:not(:disabled)');
  const visibleIds = Array.from(visibleCheckboxes).map(cb => cb.dataset.taskId);
  
  if (e.target.checked) {
    visibleIds.forEach(id => selectedTaskIds.add(id));
  } else {
    visibleIds.forEach(id => selectedTaskIds.delete(id));
  }
  render();
});

// --- Bulk actions -----------------------------------------------------------
document.getElementById('bulk-done-btn').addEventListener('click', () => {
  const affected = tasks.filter(t => selectedTaskIds.has(t.id) && !isBlocked(t));
  const skipped = tasks.filter(t => selectedTaskIds.has(t.id) && isBlocked(t));
  const clones = [];
  affected.forEach(t => {
    const wasNotDone = t.status !== 'Done';
    t.status = 'Done';
    t.progress = 100;
    if (wasNotDone && t.recurring) {
      clones.push(createRecurringClone(t));
    }
  });
  if (clones.length) tasks.push(...clones);
  if (affected.length) logActivity(`Marked ${affected.length} task${affected.length === 1 ? '' : 's'} as Done`);
  if (skipped.length) logActivity(`Skipped ${skipped.length} blocked task${skipped.length === 1 ? '' : 's'} waiting on a dependency`);
  clones.forEach(clone => logActivity(`Recurring task "${clone.task}" scheduled for next cycle`));
  selectedTaskIds.clear();
  saveTasks();
  render();
  renderGanttChart();
});

document.getElementById('bulk-delete-btn').addEventListener('click', () => {
  const count = selectedTaskIds.size;
  if (!count) return;
  if (!confirm(`Delete ${count} task${count === 1 ? '' : 's'}? This can't be undone.`)) return;
  tasks = tasks.filter(t => !selectedTaskIds.has(t.id));
  tasks.forEach(t => { if (t.dependsOn) t.dependsOn = t.dependsOn.filter(id => !selectedTaskIds.has(id)); });
  logActivity(`Deleted ${count} task${count === 1 ? '' : 's'} (bulk action)`);
  selectedTaskIds.clear();
  saveTasks();
  render();
  renderGanttChart();
});

document.getElementById('bulk-category-select').addEventListener('change', e => {
  const category = e.target.value;
  if (!category) return;
  const affected = tasks.filter(t => selectedTaskIds.has(t.id) && !isBlocked(t));
  affected.forEach(t => { t.category = category; });
  logActivity(`Moved ${affected.length} task${affected.length === 1 ? '' : 's'} to "${category}"`);
  selectedTaskIds.clear();
  e.target.value = '';
  saveTasks();
  render();
});

document.getElementById('bulk-clear-btn').addEventListener('click', () => {
  selectedTaskIds.clear();
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
  tasks.push({ id: makeId(), task: 'New task', owner: '', status: 'Not started', priority: 'Medium', category: categories.length ? categories[0] : '📋 Requirements', start: todayStr(), due: todayStr(), progress: 0, subtasks: [] });
  logActivity('New task created');
  render();
  saveTasks();
  renderGanttChart();
});

// --- Toolbar overflow menu --------------------------------------------------
const toolbarMenuBtn = document.getElementById('toolbar-menu-btn');
const toolbarMenuDropdown = document.getElementById('toolbar-menu-dropdown');

function closeToolbarMenu() {
  toolbarMenuDropdown.classList.remove('open');
  toolbarMenuBtn.classList.remove('open');
  toolbarMenuBtn.setAttribute('aria-expanded', 'false');
}

toolbarMenuBtn.addEventListener('click', e => {
  e.stopPropagation();
  const isOpen = toolbarMenuDropdown.classList.toggle('open');
  toolbarMenuBtn.classList.toggle('open', isOpen);
  toolbarMenuBtn.setAttribute('aria-expanded', String(isOpen));
});

// Picking any action inside the menu closes it right after.
toolbarMenuDropdown.addEventListener('click', e => {
  if (e.target.tagName === 'BUTTON') closeToolbarMenu();
});

document.addEventListener('click', e => {
  if (!toolbarMenuDropdown.contains(e.target) && e.target !== toolbarMenuBtn) closeToolbarMenu();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeToolbarMenu();
});

// --- Theme toggle -----------------------------------------------------------
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

// Initial render
render();
renderGanttChart();
