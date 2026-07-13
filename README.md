# Project Tracker

A lightweight, modern project tracking dashboard with local storage persistence. Track tasks, monitor progress, and manage project statuses with an intuitive interface.

## Features

-  **Real-time Dashboard**: View overall progress, overdue tasks, and status breakdown
-  **Task Management**: Create, edit, and delete tasks with ease
-  **Progress Tracking**: Visual progress bars with percentage indicators
-  **Status Management**: Track tasks as Not started, In progress, Blocked, or Done
-  **Priority Levels**: Assign High, Medium, or Low priority to each task
-  **Date Management**: Set start and due dates with overdue detection
-  **Dark Mode**: Toggle between light and dark themes
-  **Auto-save**: Changes are automatically saved to browser's local storage
-  **Excel Export**: Export your project data to Excel with formatting

## Getting Started

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/project-tracker.git
cd project-tracker
```

2. Open `index.html` in your web browser or serve with a local server:
```bash
# Using Python 3
python -m http.server 8000

# Using Node.js
npx http-server

# Using PHP
php -S localhost:8000
```

3. Visit `http://localhost:8000` in your browser

## Usage

### Adding Tasks
1. Click the **"+ Add task"** button at the bottom of the table
2. Fill in task details (name, owner, status, priority, dates)
3. Track progress with the visual progress bar

### Managing Tasks
- **Edit**: Click any field to edit inline
- **Delete**: Click the × button to remove a task
- **Export**: Click "Export to Excel" to download your project data
- **Theme**: Toggle dark mode with the moon/sun button

### Data Persistence
All your data is stored in the browser's local storage. Data persists across browser sessions but is local to that browser.

## File Structure

```
project-tracker/
├── index.html      # Main HTML file with styles
├── app.js          # Application logic and state management
├── README.md       # This file
└── LICENSE         # License information
```

## Technologies

- **HTML5** - Semantic markup
- **CSS3** - Modern styling with CSS variables for theming
- **JavaScript** - Pure vanilla JS, no dependencies
- **XLSX.js** - For Excel export functionality
- **Local Storage API** - For data persistence

## Color Scheme

The app features a beautiful, accessible color scheme:
- **Light Theme**: Clean white surfaces with soft grays
- **Dark Theme**: Deep blues and grays for comfortable viewing

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Mobile)

## License

MIT License - see LICENSE file for details

## Contributing

Contributions are welcome! Feel free to fork, submit issues, and create pull requests.

## Roadmap

- [ ] Cloud sync with user accounts
- [ ] Team collaboration features
- [ ] Recurring tasks
- [ ] Advanced filtering and search
- [ ] Custom status workflows
- [ ] Gantt chart view
- [ ] Notifications for overdue tasks
