# 🛡️ Vulnerability Radar

A lightweight, static vulnerability dashboard that pulls RSS feeds from NVD, CISA, PortSwigger, and trusted security news sources into a clean triage view. Runs entirely in the browser — no backend required.

![Dark Mode Preview](./assets/images/preview-dark.png)

## Features

- **Multi-source RSS aggregation** — Krebs, Hacker News, BleepingComputer, CISA, and more
- **Categorized dashboard** — Filter by Threat Intelligence, Malware, Vulnerabilities, Government Alerts, or General Cyber News
- **Dark & Light mode** — System-aware default with persistent preference toggle
- **Instant search** — Full-text search across titles, descriptions, and source names (Ctrl+K to focus)
- **Responsive design** — Desktop, tablet, mobile, and **wide-screen / landscape-optimised** with fluid grid columns that adapt to screen width in landscape mode
- **Keyboard-aware push-up** — When the virtual keyboard opens on mobile, content is pushed up above it using the Visual Viewport API; the search input stays visible and usable
- **Wide-screen (landscape) optimised** — Column count adjusts from 1 → 2 → 3 → 4 based on available width, with compact card layouts for landscape phones
- **Bookmarks & Read Later** — LocalStorage-based, persists across sessions
- **Feed health indicators** — See which sources loaded successfully
- **Auto-refresh** — Refreshes feeds every 10 minutes
- **Cache-friendly** — Caches feed results in localStorage (5 min TTL)
- **Zero dependencies** — Vanilla JS, no frameworks, no build step

## Live Demo

[View on GitHub Pages](https://thaibanai.github.io/cyber-rss-dashboard/)

## Tech Stack

- HTML5
- CSS3 (Custom Properties, Grid, Flexbox)
- JavaScript (Vanilla)
- [rss2json.com](https://rss2json.com) API for RSS-to-JSON conversion
- Font Awesome 6 (icons)
- Google Fonts (Inter + JetBrains Mono)

## Getting Started

### Local Development

```bash
# Clone or download the repo
git clone https://github.com/ThaibanAI/cyber-rss-dashboard.git
cd cyber-rss-dashboard

# Serve locally (any static server works)
python3 -m http.server 8000
# or
npx serve .
```

Open `http://localhost:8000` in your browser.

> **Note:** Some browsers block RSS-to-JSON API calls when opening `index.html` directly via `file://`. Use a simple HTTP server to avoid CORS issues.

### Deploy to GitHub Pages

1. Push this repo to GitHub
2. Go to **Settings → Pages**
3. Under **Source**, select **Deploy from a branch**
4. Choose `main` branch and `/ (root)` folder
5. Click **Save**

Your dashboard will be live at `https://<your-username>.github.io/cyber-rss-dashboard/` within a few minutes.

## Customization

### Add / Remove Feeds

Edit `data/feeds.json`:

```json
{
  "feeds": [
    {
      "id": "myfeed",
      "name": "My Cyber Feed",
      "url": "https://example.com/rss",
      "category": "Threat Intelligence",
      "enabled": true
    }
  ],
  "categories": [
    "All Feeds",
    "Threat Intelligence",
    "Malware",
    "Vulnerabilities",
    "Government Alerts",
    "General Cyber News"
  ]
}
```

Set `"enabled": false` to disable a feed without removing it.

### Styling

The color scheme is controlled by CSS custom properties in `:root` and `[data-theme="light"]`. Edit `style.css` to customize:

- Cyber blue accent: `--accent`
- Teal secondary: `--accent-teal`
- Background colors: `--bg-primary`, `--bg-secondary`, `--bg-card`

## Folder Structure

```
cyber-rss-dashboard/
├── index.html          # Main HTML
├── style.css           # All styles
├── script.js           # Application logic
├── data/
│   └── feeds.json      # Feed configuration
├── assets/
│   ├── icons/
│   ├── logos/
│   └── images/
└── README.md           # This file
```

## Performance

- **No build step** — just HTML, CSS, and JS
- **Lazy loading** — images load lazily
- **Instant search** — filtering is done client-side, no API calls
- **Local caching** — 5-minute localStorage cache to reduce API usage
- **Visual Viewport API** — uses the browser's native viewport API for reliable keyboard detection (no hacks or polling)
- **Minimal external requests** — only Font Awesome, Google Fonts, and the RSS API

## Future Ideas

- AI-powered article summaries
- CVE extraction and trending
- Threat tagging & keyword clustering
- Personalized feed prioritization
- Offline support via Service Worker
- Export bookmarks/read-later as JSON

## License

MIT
