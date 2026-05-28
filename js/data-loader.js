/* ===================================================================
   data-loader.js — shared CSV loader and filter state
   =================================================================== */

window.DataLoader = (function () {
  let cache = null;
  let pending = null;
  let yearExtent = { min: 1983, max: 2026 };

  const INCIDENTS_PATH = '../data/incidents.csv';
  const CATEGORIES_PATH = '../data/incident-categories.json';

  function parseIncident(d) {
    d.date = d.date ? new Date(d.date + 'T12:00:00') : null;
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
          console.warn('[Incident Lens] incident-categories.json missing or empty; using default category.');
          warned = true;
        }
        d.category = window.IncidentCategories.DEFAULT_ID;
      }
    });
    return data;
  }

  function computeYearExtent(data) {
    const years = data.map(d => d.year).filter(y => y != null);
    if (!years.length) return { min: 1983, max: 2026 };
    return { min: Math.min(...years), max: Math.max(...years) };
  }

  function notify() {
    listeners.forEach(fn => fn(filters));
  }

  const filters = { yearStart: 1983, yearEnd: 2026, categories: [] };
  const listeners = [];
  const readyQueue = [];

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
        yearExtent = computeYearExtent(cache);
        filters.yearStart = Math.max(2010, yearExtent.min);
        filters.yearEnd = yearExtent.max;
        console.log(`[Incident Lens] Loaded ${cache.length} incidents (${yearExtent.min}–${yearExtent.max})`);
        readyQueue.splice(0).forEach(fn => fn(cache));
        return cache;
      });

    return pending;
  }

  function onReady(fn) {
    if (cache) fn(cache);
    else readyQueue.push(fn);
  }

  function getYearExtent() {
    return yearExtent;
  }

  function setYearRange(start, end) {
    const lo = Math.min(Number(start), Number(end));
    const hi = Math.max(Number(start), Number(end));
    filters.yearStart = lo;
    filters.yearEnd = hi;
    notify();
  }

  function setCategories(ids) {
    const allowed = window.IncidentCategories.ORDER;
    filters.categories = ids.filter(id => allowed.includes(id));
    notify();
  }

  function getStackCategories() {
    if (!filters.categories.length) {
      return window.IncidentCategories.ORDER.slice();
    }
    return window.IncidentCategories.ORDER.filter(id => filters.categories.includes(id));
  }

  function onFilterChange(fn) { listeners.push(fn); }

  function applyFilters(data) {
    let out = data.filter(
      d => d.year != null && d.year >= filters.yearStart && d.year <= filters.yearEnd
    );
    if (filters.categories.length) {
      out = out.filter(d => filters.categories.includes(d.category));
    }
    return out;
  }

  function isFullYearRange() {
    return filters.yearStart <= yearExtent.min && filters.yearEnd >= yearExtent.max;
  }

  return {
    load,
    onReady,
    filters,
    setCategories,
    setYearRange,
    getYearExtent,
    getStackCategories,
    onFilterChange,
    applyFilters,
    isFullYearRange,
  };
})();
