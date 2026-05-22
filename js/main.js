/* ===================================================================
   main.js — wires up the filter bar to DataLoader
   =================================================================== */

(function () {
  const yearEl = document.getElementById('filter-year');
  const searchEl = document.getElementById('filter-search');
  const sortEl = document.getElementById('filter-sort');

  if (yearEl) {
    yearEl.addEventListener('change', e => {
      const v = e.target.value;
      window.DataLoader.setFilter('yearMin', v === 'all' ? null : +v);
    });
  }

  if (searchEl) {
    let timer;
    searchEl.addEventListener('input', e => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        window.DataLoader.setFilter('search', e.target.value.trim());
      }, 200);
    });
  }

  if (sortEl) {
    sortEl.addEventListener('change', e => {
      window.DataLoader.setFilter('sortBy', e.target.value);
    });
  }
})();
