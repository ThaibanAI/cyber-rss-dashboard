/* ============================================================
   Cyber RSS Dashboard - Application Logic
   ============================================================ */

// --- Configuration ---
const RSS_API = 'https://api.rss2json.com/v1/api.json';
const DEFAULT_CATEGORY = 'All Radar';
const RADAR_LENSES = ['All Radar', 'Critical', 'High', 'Medium', 'Low', 'Exploited', 'Advisory', 'Research', 'News'];
const STORAGE_KEYS = {
  THEME: 'cyber-rss-theme',
  BOOKMARKS: 'cyber-rss-bookmarks',
  READ_LATER: 'cyber-rss-readlater',
  CACHE: 'cyber-rss-cache',
  API_KEY: 'cyber-rss-apikey',
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
  criticalCount: $('#criticalCount'),
  exploitedCount: $('#exploitedCount'),
  cveCount: $('#cveCount'),
  feedAlerts: $('#feedAlerts'),
  footerYear: $('#footerYear'),
  apiKeyToggle: $('#apiKeyToggle'),
  apiKeyPanel: $('#apiKeyPanel'),
  apiKeyInput: $('#apiKeyInput'),
  apiKeyVis: $('#apiKeyVis'),
  apiKeySave: $('#apiKeySave'),
  apiKeyClear: $('#apiKeyClear'),
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

  // Load API key from storage
  initApiKey();

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
// API KEY CONFIG
// ============================================================

function initApiKey() {
  const savedKey = getApiKey();
  if (els.apiKeyInput) {
    els.apiKeyInput.value = savedKey || '';
  }
}

function getApiKey() {
  try {
    return localStorage.getItem(STORAGE_KEYS.API_KEY) || '';
  } catch (e) {
    return '';
  }
}

function saveApiKey(key) {
  try {
    if (key && key.trim()) {
      localStorage.setItem(STORAGE_KEYS.API_KEY, key.trim());
    } else {
      localStorage.removeItem(STORAGE_KEYS.API_KEY);
    }
  } catch (e) {
    // ignore
  }
  clearCache();
}

function clearApiKey() {
  try {
    localStorage.removeItem(STORAGE_KEYS.API_KEY);
  } catch (e) {
    // ignore
  }
  if (els.apiKeyInput) els.apiKeyInput.value = '';
  clearCache();
}

function clearCache() {
  try {
    localStorage.removeItem(STORAGE_KEYS.CACHE);
  } catch (e) {
    // ignore
  }
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
      { id: 'nvd', name: 'NVD - CVEs', url: 'https://nvd.nist.gov/feeds/xml/cve/misc/nvd-rss.xml', category: 'Advisory', logo: 'https://nvd.nist.gov/favicon.ico', enabled: true },
      { id: 'cisa', name: 'CISA Alerts', url: 'https://www.cisa.gov/cybersecurity-advisories/cybersecurity-advisories.xml', category: 'Advisory', logo: 'https://www.cisa.gov/favicon.ico', enabled: true },
      { id: 'portswigger', name: 'PortSwigger Research', url: 'https://portswigger.net/research/rss', category: 'Research', logo: 'https://portswigger.net/favicon.ico', enabled: true },
      { id: 'bleeping', name: 'BleepingComputer', url: 'https://www.bleepingcomputer.com/feed/', category: 'News', logo: 'https://www.bleepingcomputer.com/favicon.ico', enabled: true },
      { id: 'hackernews', name: 'The Hacker News', url: 'https://feeds.feedburner.com/TheHackersNews', category: 'News', logo: 'https://thehackernews.com/favicon.ico', enabled: true },
      { id: 'krebs', name: 'Krebs on Security', url: 'https://krebsonsecurity.com/feed/', category: 'News', logo: 'https://krebsonsecurity.com/favicon.ico', enabled: true },
      { id: 'schneier', name: 'Schneier on Security', url: 'https://www.schneier.com/feed/atom', category: 'Research', logo: 'https://www.schneier.com/favicon.ico', enabled: true },
    ],
    categories: RADAR_LENSES,
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
  const savedKey = getApiKey();
  const params = new URLSearchParams({ rss_url: feed.url });
  if (savedKey) {
    params.set('api_key', savedKey);
    params.set('count', '20');
  }
  const url = `${RSS_API}?${params}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    if (data.status !== 'ok') throw new Error('API error: ' + (data.message || 'unknown'));

    return (data.items || []).map(item => {
      const article = {
        title: item.title || 'Untitled',
        link: item.link || '#',
        pubDate: item.pubDate || new Date().toISOString(),
        description: stripHtml(item.description || item.content || ''),
        thumbnail: item.enclosure?.link || item.thumbnail || '',
        author: item.author || '',
        categories: item.categories || [],
      };

      return { ...article, ...deriveRadarSignals(article) };
    }).filter(item => item.title !== 'Untitled' || item.link !== '#');
  } finally {
    clearTimeout(timeout);
  }
}

function stripHtml(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
}

function deriveRadarSignals(article) {
  const text = `${article.title} ${article.description} ${article.author || ''}`.toLowerCase();
  const cveIds = [...new Set((text.match(/cve-\d{4}-\d{4,7}/gi) || []).map(id => id.toUpperCase()))];
  const exploited = /(known exploited|exploited|in the wild|zero[- ]day|active exploitation|weaponized|kev)/i.test(text);
  const research = /(research|analysis|poc|proof of concept|exploit demo|project zero|portswigger|reverse engineering)/i.test(text);
  const advisory = /(advisory|security update|patch Tuesday|patch tuesday|bulletin|release notes|vendor advisory|cve)/i.test(text);
  const severity = detectSeverity(text);

  const radarTags = new Set(['News']);
  if (advisory) radarTags.add('Advisory');
  if (research) radarTags.add('Research');
  if (exploited) radarTags.add('Exploited');
  if (severity !== 'Unknown') radarTags.add(severity);
  if (cveIds.length) radarTags.add('Advisory');
  if (/(critical|high|medium|low)/i.test(text)) radarTags.add('Advisory');

  return {
    _cveIds: cveIds,
    _isExploited: exploited,
    _severity: severity,
    _radarTags: [...radarTags],
  };
}

function detectSeverity(text) {
  if (/\bcritical\b/i.test(text)) return 'Critical';
  if (/\bhigh\b/i.test(text)) return 'High';
  if (/\bmedium\b/i.test(text)) return 'Medium';
  if (/\blow\b/i.test(text)) return 'Low';
  return 'Unknown';
}

function buildRadarBadges(article) {
  const badges = [];
  if (article._severity && article._severity !== 'Unknown') {
    badges.push(`<span class="badge severity ${article._severity.toLowerCase()}">${escapeHtml(article._severity)}</span>`);
  }
  if (article._isExploited) {
    badges.push('<span class="badge exploit">Exploited</span>');
  }
  if (article._cveIds && article._cveIds.length) {
    badges.push(`<span class="badge cve">${escapeHtml(article._cveIds[0])}</span>`);
    if (article._cveIds.length > 1) {
      badges.push(`<span class="badge cve-more">+${article._cveIds.length - 1} more</span>`);
    }
  }
  if (article._radarTags.includes('Research')) {
    badges.push('<span class="badge research">Research</span>');
  }
  if (article._radarTags.includes('Advisory')) {
    badges.push('<span class="badge advisory">Advisory</span>');
  }
  return badges.join('');
}

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

  // Radar lens filter
  if (activeCategory !== DEFAULT_CATEGORY) {
    result = result.filter(article => article._radarTags.includes(activeCategory));
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
      a._sourceName.toLowerCase().includes(q) ||
      a._cveIds.join(' ').toLowerCase().includes(q)
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
    const badgeHtml = buildRadarBadges(article);

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
          <div class="article-badges">${badgeHtml}</div>
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
  const criticalHigh = allArticles.filter(a => ['Critical', 'High'].includes(a._severity)).length;
  const exploited = allArticles.filter(a => a._isExploited).length;
  const cves = allArticles.filter(a => a._cveIds && a._cveIds.length > 0).length;

  els.articleCount.textContent = `${allArticles.length} alert${allArticles.length !== 1 ? 's' : ''}`;
  els.activeSources.textContent = `${enabled.length} source${enabled.length !== 1 ? 's' : ''}`;
  if (els.criticalCount) els.criticalCount.textContent = String(criticalHigh);
  if (els.exploitedCount) els.exploitedCount.textContent = String(exploited);
  if (els.cveCount) els.cveCount.textContent = String(cves);
}

function updateLastUpdated() {
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  els.lastUpdated.textContent = `Radar refreshed ${time}`;
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
  // --- Virtual keyboard detection & push-up (mobile) ---
  // Uses the Visual Viewport API to detect when the virtual keyboard
  // opens and pushes the page content up by resizing a spacer element.
  // This is far more reliable than CSS-based approaches on iOS/Safari.

  const keyboardSpacer = document.getElementById('keyboardSpacer');
  let lastKeyboardHeight = 0;
  let initialViewportHeight = window.innerHeight;

  function updateKeyboardState() {
    if (!keyboardSpacer) return;

    const vv = window.visualViewport;
    const isMobile = window.innerWidth < 769;

    // How much of the screen is the keyboard covering?
    // visualViewport.offsetTop tells us how far from the top
    // of the layout viewport the visual viewport is scrolled.
    // On iOS, when keyboard opens, offsetTop grows as the visible
    // area is pushed up, and height shrinks.
    if (vv && isMobile) {
      // The keyboard height = screen.height - visualViewport.height
      // But also account for the URL bar offset on mobile Safari.
      const visibleArea = vv.height;
      const totalScreen = window.screen ? window.screen.height : window.innerHeight;
      const keyboardHeight = Math.max(0, totalScreen - visibleArea - (vv.offsetTop || 0));

      if (keyboardHeight > 80) {
        // Keyboard is open
        document.body.classList.add('keyboard-open');
        keyboardSpacer.style.height = keyboardHeight + 'px';
        lastKeyboardHeight = keyboardHeight;

        // Force scroll to keep the focused element visible
        if (document.activeElement &&
            (document.activeElement.tagName === 'INPUT' ||
             document.activeElement.tagName === 'TEXTAREA' ||
             document.activeElement.tagName === 'SELECT')) {
          // iOS Safari will already handle this if the input isn't
          // hidden behind a fixed element. The spacer ensures
          // page content stays accessible.
        }
      } else if (lastKeyboardHeight > 0) {
        // Keyboard dismissed
        document.body.classList.remove('keyboard-open');
        keyboardSpacer.style.height = '0px';
        lastKeyboardHeight = 0;
      }
    } else if (!isMobile) {
      document.body.classList.remove('keyboard-open');
      if (keyboardSpacer) keyboardSpacer.style.height = '0px';
      lastKeyboardHeight = 0;
    }
  }

  // Use visualViewport API where available (iOS Safari + modern browsers)
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateKeyboardState);
    window.visualViewport.addEventListener('scroll', updateKeyboardState);
  }

  // Also fallback: detect via focus/blur on the search input
  els.searchInput.addEventListener('focus', () => {
    if (window.innerWidth < 769) {
      // Give browser a tick to update the viewport before measuring
      requestAnimationFrame(() => {
        updateKeyboardState();
      });
    }
  });

  els.searchInput.addEventListener('blur', () => {
    // Short delay to let keyboard dismiss fully
    setTimeout(() => {
      updateKeyboardState();
    }, 300);
  });

  // Handle window resize too (orientation change, split screen, etc.)
  window.addEventListener('resize', () => {
    updateKeyboardState();
  });

  // Initial measurement
  initialViewportHeight = window.innerHeight;

  // Theme toggle
  els.themeToggle.addEventListener('click', toggleTheme);

  // Refresh
  els.refreshBtn.addEventListener('click', loadFeeds);

  // API Key panel toggle
  els.apiKeyToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = els.apiKeyPanel.style.display !== 'none';
    els.apiKeyPanel.style.display = isOpen ? 'none' : 'flex';
    els.apiKeyToggle.classList.toggle('active');
    if (!isOpen) els.apiKeyInput.focus();
  });

  // Close API key panel when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.api-key-wrapper')) {
      els.apiKeyPanel.style.display = 'none';
      els.apiKeyToggle.classList.remove('active');
    }
  });

  // API key visibility toggle
  els.apiKeyVis.addEventListener('click', () => {
    const input = els.apiKeyInput;
    const icon = els.apiKeyVis.querySelector('i');
    if (input.type === 'password') {
      input.type = 'text';
      icon.className = 'fas fa-eye-slash';
    } else {
      input.type = 'password';
      icon.className = 'fas fa-eye';
    }
  });

  // API key save
  els.apiKeySave.addEventListener('click', () => {
    saveApiKey(els.apiKeyInput.value);
    els.apiKeyPanel.style.display = 'none';
    els.apiKeyToggle.classList.remove('active');
    loadFeeds();
  });

  // API key clear
  els.apiKeyClear.addEventListener('click', () => {
    clearApiKey();
    els.apiKeyPanel.style.display = 'none';
    els.apiKeyToggle.classList.remove('active');
    loadFeeds();
  });

  // Enter key saves API key
  els.apiKeyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      els.apiKeySave.click();
    }
  });

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
