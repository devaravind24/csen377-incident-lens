/* ===================================================================
   main.js — wires up the filter bar to DataLoader
   =================================================================== */

(function () {
  const yearFromEl = document.getElementById('filter-year-from');
  const yearToEl = document.getElementById('filter-year-to');
  const yearFromVal = document.getElementById('year-from-val');
  const yearToVal = document.getElementById('year-to-val');
  const yearResetEl = document.getElementById('filter-year-reset');
  const chipsEl = document.getElementById('filter-categories');

  let yearExtent = { min: 1983, max: 2026 };
  let yearReady = false;
  const DEFAULT_START_YEAR = 2010;

  function paintSlider(el) {
    if (!el) return;
    const min = +el.min;
    const max = +el.max;
    const val = +el.value;
    const pct = max === min ? 0 : ((val - min) / (max - min)) * 100;
    el.style.setProperty('--pct', pct + '%');
  }

  function readYears() {
    return {
      from: +yearFromEl.value,
      to: +yearToEl.value,
    };
  }

  function updateDisplay() {
    if (yearFromVal) yearFromVal.textContent = yearFromEl.value;
    if (yearToVal) yearToVal.textContent = yearToEl.value;
    paintSlider(yearFromEl);
    paintSlider(yearToEl);
    if (yearResetEl) {
      yearResetEl.classList.toggle('is-active', window.DataLoader.isFullYearRange());
    }
  }

  function pushFilter() {
    const { from, to } = readYears();
    window.DataLoader.setYearRange(from, to);
    updateDisplay();
  }

  function onFromInput() {
    let { from, to } = readYears();
    if (from > to) {
      yearToEl.value = String(from);
      to = from;
    }
    pushFilter();
  }

  function onToInput() {
    let { from, to } = readYears();
    if (to < from) {
      yearFromEl.value = String(to);
      from = to;
    }
    pushFilter();
  }

  function resetYears() {
    yearFromEl.value = String(yearExtent.min);
    yearToEl.value = String(yearExtent.max);
    window.DataLoader.setYearRange(yearExtent.min, yearExtent.max);
    updateDisplay();
  }

  function initYearSliders(extent) {
    if (!yearFromEl || !yearToEl) return;
    yearExtent = extent;
    yearFromEl.min = yearToEl.min = String(extent.min);
    yearFromEl.max = yearToEl.max = String(extent.max);
    const defaultStart = Math.max(DEFAULT_START_YEAR, extent.min);
    yearFromEl.value = String(defaultStart);
    yearToEl.value = String(extent.max);

    if (!yearReady) {
      yearFromEl.addEventListener('input', onFromInput);
      yearFromEl.addEventListener('change', onFromInput);
      yearToEl.addEventListener('input', onToInput);
      yearToEl.addEventListener('change', onToInput);
      if (yearResetEl) yearResetEl.addEventListener('click', resetYears);
      yearReady = true;
    }

    window.DataLoader.setYearRange(defaultStart, extent.max);
    updateDisplay();
  }

  function syncChipUI() {
    const selected = window.DataLoader.filters.categories;
    const allActive = selected.length === 0;
    chipsEl.querySelectorAll('.category-chip').forEach(el => {
      const cat = el.dataset.category;
      if (cat === '') {
        el.classList.toggle('is-active', allActive);
      } else {
        el.classList.toggle('is-active', selected.includes(cat));
      }
    });
  }

  function selectAllCategories() {
    window.DataLoader.setCategories([]);
    syncChipUI();
  }

  function toggleCategory(id) {
    const selected = new Set(window.DataLoader.filters.categories);
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    window.DataLoader.setCategories([...selected]);
    syncChipUI();
  }

  function buildChips() {
    if (!chipsEl || !window.IncidentCategories) return;

    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = 'category-chip is-active';
    allBtn.dataset.category = '';
    allBtn.textContent = 'All';
    allBtn.addEventListener('click', selectAllCategories);
    chipsEl.appendChild(allBtn);

    window.IncidentCategories.ORDER.forEach(id => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'category-chip';
      btn.dataset.category = id;
      btn.style.setProperty('--chip-color', window.IncidentCategories.getColor(id));

      const swatch = document.createElement('span');
      swatch.className = 'category-chip__swatch';
      swatch.style.background = window.IncidentCategories.getColor(id);
      swatch.setAttribute('aria-hidden', 'true');

      const label = document.createElement('span');
      label.className = 'category-chip__label';
      label.textContent = window.IncidentCategories.getLabel(id);

      btn.append(swatch, label);
      btn.addEventListener('click', () => toggleCategory(id));
      chipsEl.appendChild(btn);
    });
  }

  buildChips();

  window.DataLoader.onReady(() => {
    initYearSliders(window.DataLoader.getYearExtent());
  });
  window.DataLoader.load();
})();
