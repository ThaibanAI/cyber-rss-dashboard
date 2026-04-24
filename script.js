/* ============================================================
   Cyber RSS Dashboard - Application Logic
   ============================================================ */

// --- Configuration ---
const RSS_API = 'https://api.rss2json.com/v1/api.json';
const DEFAULT_CATEGORY = 'All Feeds';
const STORAGE_KEYS = {
  THEME: 'cyber-rss-theme',
  BOOKMARKS: 'cyber-rss-bookmarks',
  READ_LATER: 'cyber-rss-readlater',
  CACHE: 'cyber-rss-cache',
};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const AUTO_REFRESH_MS = 10 * 60 * 1000; // 10 minutes

// --- State ---
let feedsConfig = { feeds: [], categories: [] };
let allArticles = [];
let filteredArticles = [];
let activeCategory = DEFAULT_CATEGORY;
let activeSource = 'all';
let searchQuery = '';
let isLoading = false;
let autoRefreshTimer = null;

// --- DOM References ---
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const els = {
  articlesContainer: $('#articlesContainer'),
  loadingState: $('#loadingState'),
  errorState: $('#errorState'),
  emptyState: $('#emptyState'),
  categoryFilters: $('#categoryFilters'),
  sourceSelect: $('#sourceSelect'),
  searchInput: $('#searchInput'),
  clearSearch: $('#clearSearch'),
  refreshBtn: $('#refreshBtn'),
  themeToggle: $('#themeToggle'),
  articleCount: $('#articleCount'),
  activeSources: $('#activeSources'),
  lastUpdated: $('#lastUpdated'),
  feedAlerts: $('#feedAlerts'),
  footerYear: $('#footerYear'),
};

// ============================================================
// INIT
// ============================================================

async function init() {
  // Theme
  initTheme();

  // Footer year
  els.footerYear.textContent = new Date().getFullYear();

  // Load feed config
  await loadFeedConfig();

  // Build UI
  renderCategoryFilters();
  renderSourceOptions();

  // Load feeds
  await loadFeeds();

  // Setup auto-refresh
  startAutoRefresh();

  // Event listeners
  attachEventListeners();
}

// ============================================================
// THEME
// ============================================================

function initTheme() {
  const saved = localStorage.getItem(STORAGE_KEYS.THEME);
  let theme;

  if (saved) {
    theme = saved;
  } else {
    theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  document.documentElement.setAttribute('data-theme', theme);
  updateThemeIcon(theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem(STORAGE_KEYS.THEME, next);
  updateThemeIcon(next);
}

function updateThemeIcon(theme) {
  const icon = els.themeToggle.querySelector('i');
  icon.className = theme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
}

// ============================================================
// FEED CONFIG
// ============================================================

async function loadFeedConfig() {
  try {
    const res = await fetch('data/feeds.json');
    feedsConfig = await res.json();
  } catch (err) {
    console.warn('Failed to load feeds.json, using defaults:', err);
    feedsConfig = getDefaultFeeds();
  }
}

function getDefaultFeeds() {
  return {
    feeds: [
      { id: 'krebs', name: 'Krebs on Security', url: 'https://krebsonsecurity.com/feed/', category: 'Threat Intelligence', logo: '', enabled: true },
      { id: 'hackernews', name: 'The Hacker News', url: 'https://feeds.feedburner.com/TheHackersNews', category: 'Threat Intelligence', logo: '', enabled: true },
      { id: 'darkreading', name: 'Dark Reading', url: 'https://www.darkreading.com/rss.xml', category: 'General Cyber News', logo: '', enabled: true },
      { id: 'bleeping', name: 'BleepingComputer', url: 'https://www.bleepingcomputer.com/feed/', category: 'General Cyber News', logo: '', enabled: true },
      { id: 'cisa', name: 'CISA Alerts', url: 'https://www.cisa.gov/cybersecurity-advisories/cybersecurity-advisories.xml', category: 'Government Alerts', logo: '', enabled: true },
    ],
    categories: ['All Feeds', 'Threat Intelligence', 'Malware', 'Vulnerabilities', 'Government Alerts', 'General Cyber News'],
  };
}

// ============================================================
// RENDER UI CONTROLS
// ============================================================

function renderCategoryFilters() {
  const cats = feedsConfig.categories || getDefaultFeeds().categories;
  els.categoryFilters.innerHTML = cats.map(cat =>
    `<button class="category-btn${cat === activeCategory ? ' active' : ''}" data-category="${cat}">${cat}</button>`
  ).join('');
}

function renderSourceOptions() {
  const feeds = feedsConfig.feeds.filter(f => f.enabled);
  els.sourceSelect.innerHTML = '<option value="all">All Sources</option>' +
    feeds.map(f => `<option value="${f.id}">${f.name}</option>`).join('');
}

// ============================================================
// RSS FEED LOADING
// ============================================================

function startAutoRefresh() {
  if (autoRefreshTimer) clearInterval(autoRefreshTimer);
  autoRefreshTimer = setInterval(loadFeeds, AUTO_REFRESH_MS);
}

async function loadFeeds() {
  if (isLoading) return;
  isLoading = true;

  els.loadingState.style.display = 'flex';
  els.errorState.style.display = 'none';
  els.emptyState.style.display = 'none';
  els.articlesContainer.innerHTML = '';
  els.refreshBtn.classList.add('spinning');

  try {
    // Try cache first
    const cached = getCachedData();
    if (cached) {
      allArticles = cached;
      applyFilters();
      updateStats();
      els.loadingState.style.display = 'none';
    }

    // Try fetching fresh data
    const enabled = feedsConfig.feeds.filter(f => f.enabled);
    const feedPromises = enabled.map(feed => fetchFeed(feed));

    const results = await Promise.allSettled(feedPromises);

    const freshArticles = [];
    const alerts = [];

    results.forEach((result, i) => {
      const feed = enabled[i];
      if (result.status === 'fulfilled' && result.value.length > 0) {
        freshArticles.push(...result.value.map(a => ({ ...a, _sourceId: feed.id, _sourceName: feed.name, _sourceCategory: feed.category })));
        alerts.push({ id: feed.id, name: feed.name, status: 'success' });
      } else {
        alerts.push({ id: feed.id, name: feed.name, status: 'error' });
      }
    });

    // Merge and sort
    freshArticles.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
    allArticles = freshArticles;
    cacheData(freshArticles);

    renderFeedAlerts(alerts);
    applyFilters();
    updateStats();
    updateLastUpdated();

    els.loadingState.style.display = 'none';

    if (allArticles.length === 0) {
      els.emptyState.style.display = 'flex';
    }
  } catch (err) {
    console.error('Feed loading error:', err);

    if (allArticles.length === 0) {
      els.loadingState.style.display = 'none';
      els.errorState.style.display = 'flex';
    }
  } finally {
    isLoading = false;
    els.refreshBtn.classList.remove('spinning');
  }
}

async function fetchFeed(feed) {
  const params = new URLSearchParams({ rss_url: feed.url, count: 20 });
  const url = `${RSS_API}?${params}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = await res.json();
  if (data.status !== 'ok') throw new Error('API error: ' + (data.message || 'unknown'));

  return (data.items || []).map(item => ({
    title: item.title || 'Untitled',
    link: item.link || '#',
    pubDate: item.pubDate || new Date().toISOString(),
    description: stripHtml(item.description || item.content || ''),
    thumbnail: item.enclosure?.link || item.thumbnail || item.media?.thumbnail?.[0]?.url || '',
    author: item.author || '',
    categories: item.categories || [],
  }));
}

function stripHtml(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
}

// ============================================================
// CACHE
// ============================================================

function cacheData(articles) {
  const cache = { timestamp: Date.now(), articles };
  try {
    localStorage.setItem(STORAGE_KEYS.CACHE, JSON.stringify(cache));
  } catch (e) { /* quota exceeded, ignore */ }
}

function getCachedData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CACHE);
    if (!raw) return null;
    const cache = JSON.parse(raw);
    if (Date.now() - cache.timestamp > CACHE_TTL) return null;
    return cache.articles || null;
  } catch (e) {
    return null;
  }
}

// ============================================================
// FILTERING & SEARCH
// ============================================================

function applyFilters() {
  let result = [...allArticles];

  // Category filter
  if (activeCategory !== DEFAULT_CATEGORY) {
    result = result.filter(a => a._sourceCategory === activeCategory);
  }

  // Source filter
  if (activeSource !== 'all') {
    result = result.filter(a => a._sourceId === activeSource);
  }

  // Search
  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    result = result.filter(a =>
      a.title.toLowerCase().includes(q) ||
      a.description.toLowerCase().includes(q) ||
      a._sourceName.toLowerCase().includes(q)
    );
  }

  filteredArticles = result;

  // Clear search button
  els.clearSearch.style.display = searchQuery ? 'flex' : 'none';

  renderArticles();
}

function renderArticles() {
  if (filteredArticles.length === 0) {
    els.emptyState.style.display = 'flex';
    els.articlesContainer.innerHTML = '';
    return;
  }

  els.emptyState.style.display = 'none';

  const bookmarks = getBookmarks();
  const readLater = getReadLater();

  els.articlesContainer.innerHTML = filteredArticles.map((article, idx) => {
    const thumbHtml = article.thumbnail
      ? `<img class="article-thumb" src="${article.thumbnail}" alt="" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'article-thumb-placeholder\\'><i class=\\'fas fa-shield\\'></i></div>'">`
      : `<div class="article-thumb-placeholder"><i class="fas fa-shield"></i></div>`;

    const isBookmarked = bookmarks.includes(article.link);
    const isReadLater = readLater.includes(article.link);
    const dateStr = formatDate(article.pubDate);

    return `
      <article class="article-card" style="animation-delay:${Math.min(idx * 30, 300)}ms">
        <div class="article-thumb-wrapper">
          ${thumbHtml}
        </div>
        <div class="article-body">
          <div class="article-meta">
            <span class="article-source-badge">
              <i class="fas fa-rss"></i> ${escapeHtml(article._sourceName)}
            </span>
            <span class="article-date">${dateStr}</span>
          </div>
          <h3 class="article-title">${escapeHtml(article.title)}</h3>
          <p class="article-desc">${escapeHtml(truncate(article.description, 200))}</p>
          <div class="article-footer">
            <a href="${article.link}" target="_blank" rel="noopener noreferrer" class="article-read-more">
              Read More <i class="fas fa-arrow-right"></i>
            </a>
            <div class="article-actions">
              <button class="article-action-btn${isBookmarked ? ' saved' : ''}" data-action="bookmark" data-url="${article.link}" title="Bookmark">
                <i class="fa${isBookmarked ? 's' : 'r'} fa-bookmark"></i>
              </button>
              <button class="article-action-btn${isReadLater ? ' saved' : ''}" data-action="readlater" data-url="${article.link}" title="Read later">
                <i class="fa${isReadLater ? 's' : 'r'} fa-clock"></i>
              </button>
            </div>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

// ============================================================
// FEED ALERTS
// ============================================================

function renderFeedAlerts(alerts) {
  els.feedAlerts.innerHTML = alerts.map(a =>
    `<span class="feed-alert ${a.status}">
      <i class="fas fa-${a.status === 'success' ? 'check-circle' : 'exclamation-circle'}"></i>
      ${escapeHtml(a.name)}
    </span>`
  ).join('');
}

// ============================================================
// STATS
// ============================================================

function updateStats() {
  const enabled = feedsConfig.feeds.filter(f => f.enabled);
  els.articleCount.textContent = `${allArticles.length} article${allArticles.length !== 1 ? 's' : ''}`;
  els.activeSources.textContent = `${enabled.length} source${enabled.length !== 1 ? 's' : ''}`;
}

function updateLastUpdated() {
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  els.lastUpdated.textContent = `Updated ${time}`;
}

// ============================================================
// BOOKMARKS & READ LATER
// ============================================================

function getBookmarks() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.BOOKMARKS) || '[]');
  } catch { return []; }
}

function getReadLater() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.READ_LATER) || '[]');
  } catch { return []; }
}

function toggleBookmark(url) {
  let list = getBookmarks();
  const idx = list.indexOf(url);
  if (idx === -1) list.push(url);
  else list.splice(idx, 1);
  localStorage.setItem(STORAGE_KEYS.BOOKMARKS, JSON.stringify(list));
  renderArticles();
}

function toggleReadLater(url) {
  let list = getReadLater();
  const idx = list.indexOf(url);
  if (idx === -1) list.push(url);
  else list.splice(idx, 1);
  localStorage.setItem(STORAGE_KEYS.READ_LATER, JSON.stringify(list));
  renderArticles();
}

// ============================================================
// EVENT LISTENERS
// ============================================================

function attachEventListeners() {
  // Theme toggle
  els.themeToggle.addEventListener('click', toggleTheme);

  // Refresh
  els.refreshBtn.addEventListener('click', loadFeeds);

  // Category filters (event delegation)
  els.categoryFilters.addEventListener('click', (e) => {
    const btn = e.target.closest('.category-btn');
    if (!btn) return;

    $$('.category-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeCategory = btn.dataset.category;
    applyFilters();
  });

  // Source select
  els.sourceSelect.addEventListener('change', (e) => {
    activeSource = e.target.value;
    applyFilters();
  });

  // Search
  els.searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    applyFilters();
  });

  els.clearSearch.addEventListener('click', () => {
    els.searchInput.value = '';
    searchQuery = '';
    applyFilters();
    els.searchInput.focus();
  });

  // Article actions (event delegation)
  els.articlesContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('.article-action-btn');
    if (!btn) return;

    const action = btn.dataset.action;
    const url = btn.dataset.url;
    if (!url) return;

    e.preventDefault();
    if (action === 'bookmark') toggleBookmark(url);
    else if (action === 'readlater') toggleReadLater(url);
  });

  // Keyboard shortcut
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      els.searchInput.focus();
    }
  });

  // System theme change listener
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem(STORAGE_KEYS.THEME)) {
      document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
      updateThemeIcon(e.matches ? 'dark' : 'light');
    }
  });
}

// ============================================================
// HELPERS
// ============================================================

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;

  const now = new Date();
  const diff = now - d;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function truncate(str, len) {
  if (!str || str.length <= len) return str || '';
  return str.substring(0, len).replace(/\s+\S*$/, '') + '…';
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ============================================================
// START
// ============================================================

document.addEventListener('DOMContentLoaded', init);
