# Project Tracker

A lightweight, client-side project tracker with tasks, subtasks, categories, an Activity Feed, and an SVG Gantt chart. No server required — data is stored in the browser's localStorage.

Website Demo: https://dandelionflower.github.io/Project-tracker/

## Features

- Dashboard: overall progress, overdue count, status breakdown  
- Task management: create, edit, delete tasks and subtasks  
- Inline editing for task fields (name, owner, status, priority, dates)  
- Progress tracking with slider and percentage display  
- Categories with per-category progress and delete/move-to-uncategorized behavior  
- Activity Feed: timestamped action log (create/edit/delete/status/progress)  
- SVG Gantt chart: task timelines with progress overlays  
- Export to Excel (XLSX) for backup and reporting  
- Light/Dark theme toggle  
- Data persisted locally via localStorage

## Quick Start

1. Clone the repository:
   git clone https://github.com/dandelionflower/project-tracker.git
   cd project-tracker

2. Serve locally (recommended) or open `index.html` directly:
   - Python:
     python -m http.server 8000
   - Node:
     npx http-server
   - PHP:
     php -S localhost:8000

3. Open http://localhost:8000 in your browser.

## Usage

- Add a category first (categories are used to group tasks).  
- Click "+ Add task" to create a new task (requires at least one category).  
- Edit fields inline; changes are auto-saved.  
- Use the progress slider to update percentage; Gantt chart updates accordingly.  
- Export current data to Excel using the Export button.

## Data & Storage

Data is stored in browser localStorage under these keys:
- project-tracker-tasks  
- project-tracker-categories  
- project-tracker-activities

Data persists per browser/profile. Use "Export to Excel" to back up data.

## File Structure

```
project-tracker/
├── index.html         # Main UI and layout (includes gantt & activity containers)
├── app.js             # Application logic: tasks, categories, activity logging, Gantt rendering
├── README.md          # This file
└── LICENSE            # MIT license
```

(Experimental files may include: app.features.js, index.features.html — review before replacing app.js/index.html.)

## Technologies

- HTML5, CSS3 (CSS variables)  
- Vanilla JavaScript (ES6+)  
- XLSX.js for Excel export  
- SVG for Gantt chart rendering  
- LocalStorage API for persistence

## Browser Support

Modern browsers:
- Chrome, Edge, Firefox, Safari (recent versions)  
- Mobile browsers supported, layout optimized for desktop

## Troubleshooting

- If "Add task" does nothing: ensure at least one category exists.  
- If UI appears broken after editing files: clear browser cache and the localStorage keys listed above.  
- Open browser DevTools (F12) → Console to inspect JavaScript errors; share console output for troubleshooting.

## Contributing

Contributions welcome. Fork the repo, open an issue, or submit a pull request. Include screenshots for UI changes and keep changes focused.

## Roadmap

- Cloud sync and account-backed storage  
- Team collaboration and permissions  
- Notifications for overdue tasks  
- Recurring tasks and templates  
- Virtualized activity feed for large logs

## License

MIT — see LICENSE file for details.
