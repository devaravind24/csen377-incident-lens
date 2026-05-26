/* ===================================================================
   main.js — wires up the filter bar to DataLoader
   =================================================================== */

(function () {
  const yearEl = document.getElementById('filter-year');
  const chipsEl = document.getElementById('filter-categories');
  const legendEl = document.getElementById('category-legend');

  if (yearEl) {
    yearEl.addEventListener('change', e => {
      const v = e.target.value;
      window.DataLoader.setFilter('yearMin', v === 'all' ? null : +v);
    });
  }

  function buildChips() {
    if (!chipsEl || !window.IncidentCategories) return;

    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = 'category-chip is-active';
    allBtn.dataset.category = '';
    allBtn.textContent = 'All';
    allBtn.addEventListener('click', () => selectCategory(null, allBtn));
    chipsEl.appendChild(allBtn);

    window.IncidentCategories.ORDER.forEach(id => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'category-chip';
      btn.dataset.category = id;
      btn.textContent = window.IncidentCategories.getLabel(id);
      btn.style.setProperty('--chip-color', window.IncidentCategories.getColor(id));
      btn.addEventListener('click', () => {
        const active = chipsEl.querySelector('.category-chip.is-active');
        if (active === btn) {
          selectCategory(null, allBtn);
        } else {
          selectCategory(id, btn);
        }
      });
      chipsEl.appendChild(btn);
    });
  }

  function selectCategory(id, activeBtn) {
    window.DataLoader.setFilter('category', id || null);
    chipsEl.querySelectorAll('.category-chip').forEach(el => {
      el.classList.toggle('is-active', el === activeBtn);
    });
    if (legendEl) {
      legendEl.classList.toggle('is-hidden', Boolean(id));
    }
  }

  function buildLegend() {
    if (!legendEl || !window.IncidentCategories) return;
    legendEl.innerHTML = '';
    window.IncidentCategories.ORDER.forEach(id => {
      const item = document.createElement('span');
      item.className = 'category-legend__item';
      item.innerHTML =
        `<span class="category-legend__swatch" style="background:${window.IncidentCategories.getColor(id)}"></span>` +
        window.IncidentCategories.getLabel(id);
      legendEl.appendChild(item);
    });
  }

  buildChips();
  buildLegend();
})();
