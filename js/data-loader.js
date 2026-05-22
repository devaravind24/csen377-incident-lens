/* ===================================================================
   data-loader.js — shared CSV loader and filter state
   =================================================================== */

window.DataLoader = (function () {
  let cache = null;
  let pending = null;

  const INCIDENTS_PATH = '../data/incidents.csv';

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

  function load() {
    if (cache) return Promise.resolve(cache);
    if (pending) return pending;

    pending = d3.csv(INCIDENTS_PATH, parseIncident)
      .then(data => {
        cache = data.filter(d => d.date && !isNaN(d.date));
        console.log(`[Incident Lens] Loaded ${cache.length} incidents`);
        return cache;
      });

    return pending;
  }

  const filters = { yearMin: null, search: '', sortBy: 'date' };
  const listeners = [];

  function setFilter(key, value) {
    filters[key] = value;
    listeners.forEach(fn => fn(filters));
  }

  function onFilterChange(fn) { listeners.push(fn); }

  function applyFilters(data) {
    let out = data;
    if (filters.yearMin) out = out.filter(d => d.year >= filters.yearMin);
    if (filters.search) {
      const q = filters.search.toLowerCase();
      out = out.filter(d =>
        (d.title || '').toLowerCase().includes(q) ||
        (d.description || '').toLowerCase().includes(q)
      );
    }
    return out;
  }

  return { load, filters, setFilter, onFilterChange, applyFilters };
})();
