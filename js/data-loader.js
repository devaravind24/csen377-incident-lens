/* ===================================================================
   data-loader.js — shared CSV loader and filter state
   =================================================================== */

window.DataLoader = (function () {
  let cache = null;
  let pending = null;

  const INCIDENTS_PATH = '../data/incidents.csv';
  const CATEGORIES_PATH = '../data/incident-categories.json';

  function parseIncident(d) {
    d.date = d.date ? new Date(d.date) : null;
    d.year = d.date ? d.date.getFullYear() : null;

    ['reports', 'Alleged deployer of AI system', 'Alleged developer of AI system', 'Alleged harmed or nearly harmed parties'].forEach(key => {
      if (d[key]) {
        try {
          d[key] = JSON.parse(d[key].replace(/'/g, '"'));
        } catch (e) {
          d[key] = [];
        }
      } else {
        d[key] = [];
      }
    });

    d.reportCount = Array.isArray(d.reports) ? d.reports.length : 0;
    return d;
  }

  function mergeCategories(data, categoryMap) {
    const map = categoryMap || {};
    let warned = false;
    data.forEach(d => {
      const id = String(d.incident_id || '');
      const cat = map[id];
      if (cat && window.IncidentCategories.ORDER.includes(cat)) {
        d.category = cat;
      } else {
        if (!warned && Object.keys(map).length === 0) {
          console.warn('[Incident Lens] incident-categories.json missing or empty; defaulting to "other".');
          warned = true;
        }
        d.category = 'other';
      }
    });
    return data;
  }

  function load() {
    if (cache) return Promise.resolve(cache);
    if (pending) return pending;

    pending = Promise.all([
      d3.csv(INCIDENTS_PATH, parseIncident),
      fetch(CATEGORIES_PATH)
        .then(r => (r.ok ? r.json() : {}))
        .catch(() => ({})),
    ])
      .then(([data, categoryMap]) => {
        cache = data.filter(d => d.date && !isNaN(d.date));
        mergeCategories(cache, categoryMap);
        console.log(`[Incident Lens] Loaded ${cache.length} incidents`);
        return cache;
      });

    return pending;
  }

  const filters = { yearMin: null, category: null };
  const listeners = [];

  function setFilter(key, value) {
    filters[key] = value;
    listeners.forEach(fn => fn(filters));
  }

  function onFilterChange(fn) { listeners.push(fn); }

  function applyFilters(data) {
    let out = data;
    if (filters.yearMin) out = out.filter(d => d.year >= filters.yearMin);
    if (filters.category) {
      out = out.filter(d => d.category === filters.category);
    }
    return out;
  }

  function isCategoryFiltered() {
    return Boolean(filters.category);
  }

  return {
    load,
    filters,
    setFilter,
    onFilterChange,
    applyFilters,
    isCategoryFiltered,
  };
})();
