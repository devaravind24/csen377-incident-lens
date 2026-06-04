/* ===================================================================
   viz-harms.js — VIZ 03: Where harm lands on the map.

   Choropleth of the world with a toggle:
     · Affected   — country of the harmed parties (CSETv1 location field)
     · Developer  — country of the alleged developer / deployer
                    (mapped from company name to HQ country)

   Uses Josephine's APIs without modifying them:
     · window.IncidentCategories.getColor / getLabel
     · window.DataLoader.onReady / onFilterChange / applyFilters

   All map-specific state (mode, country joins, world geometry) lives in
   this file so DataLoader stays untouched.
   =================================================================== */

(function () {
  const container = document.getElementById('chart-harms');
  if (!container) return;
  const tooltip = document.getElementById('tooltip');

  const WORLD_PATH = '../data/world-countries.geojson';
  const CLASSIFICATIONS_PATH = '../data/victim_locations.csv';
  const DEV_DEPLOY_COUNTRIES_PATH = '../data/deployer_developer_locations.csv';


  // ---- Company → ISO-3 country --------------------------------------
  // Hand-curated for the most frequently named deployers/developers.
  const COMPANY_COUNTRY = {
    // United States
    'openai':'USA','google':'USA','facebook':'USA','meta':'USA','tesla':'USA',
    'microsoft':'USA','amazon':'USA','apple':'USA','youtube':'USA',
    'instagram':'USA','whatsapp':'USA','twitter':'USA','x':'USA','xai':'USA',
    'anthropic':'USA','nvidia':'USA','palantir':'USA','ibm':'USA','uber':'USA',
    'lyft':'USA','cruise':'USA','waymo':'USA','snap':'USA','snapchat':'USA',
    'pinterest':'USA','linkedin':'USA','netflix':'USA','paypal':'USA',
    'salesforce':'USA','oracle':'USA','us-government':'USA','reddit':'USA',
    'github':'USA','adobe':'USA','intel':'USA','amd':'USA','dell':'USA',
    'zoom':'USA','airbnb':'USA','doordash':'USA','walmart':'USA',
    'figma':'USA','character-ai':'USA','replika':'USA','roblox':'USA',
    'tinder':'USA','clearview-ai':'USA','compas':'USA',
    'amazon-rekognition':'USA','northpointe':'USA','equivant':'USA',

    // China
    'tiktok':'CHN','bytedance':'CHN','baidu':'CHN','tencent':'CHN',
    'alibaba':'CHN','sensetime':'CHN','huawei':'CHN','didi':'CHN',
    'weibo':'CHN','wechat':'CHN','xiaomi':'CHN','iflytek':'CHN',
    'china-government':'CHN','megvii':'CHN',

    // United Kingdom
    'deepmind':'GBR','stability-ai':'GBR','uk-government':'GBR',
    'bbc':'GBR','darktrace':'GBR',

    // France
    'mistral':'FRA','mistral-ai':'FRA','navya':'FRA','criteo':'FRA',
    'france-government':'FRA','idemia':'FRA',

    // Israel
    'mobileye':'ISR','nso':'ISR','nso-group':'ISR','anyvision':'ISR',
    'israeli-government':'ISR',

    // South Korea
    'samsung':'KOR','naver':'KOR','kakao':'KOR','lg':'KOR',
    'hyundai':'KOR','kia':'KOR',

    // Japan
    'sony':'JPN','softbank':'JPN','rakuten':'JPN','toyota':'JPN',
    'honda':'JPN','nissan':'JPN','nintendo':'JPN',

    // Germany
    'sap':'DEU','bmw':'DEU','mercedes':'DEU','volkswagen':'DEU',
    'aleph-alpha':'DEU','siemens':'DEU','bosch':'DEU',
    'germany-government':'DEU',

    // Canada
    'cohere':'CAN','shopify':'CAN','blackberry':'CAN',

    // India
    'infosys':'IND','tcs':'IND','wipro':'IND','flipkart':'IND',
    'india-government':'IND',

    // Russia
    'yandex':'RUS','sberbank':'RUS','russian-government':'RUS',

    // Australia / Sweden / Netherlands / Finland / Switzerland / etc.
    'atlassian':'AUS','canva':'AUS','spotify':'SWE','ericsson':'SWE',
    'klarna':'SWE','asml':'NLD','booking':'NLD','philips':'NLD',
    'nokia':'FIN','nestle':'CHE','ubs':'CHE',
    'grab':'SGP','sea-group':'SGP',
  };
  const companyToCountry = name =>
    (name ? COMPANY_COUNTRY[name.toLowerCase()] : null) || null;

  // ---- Harmed-party slug → ISO-3 country ---------------------------
  const SLUG_COUNTRY_KEYWORDS = {
    'american':'USA','us-':'USA','united-states':'USA','u.s.':'USA',
    'british':'GBR','uk-':'GBR','united-kingdom':'GBR',
    'chinese':'CHN','china-':'CHN',
    'french':'FRA','france-':'FRA',
    'german':'DEU','germany-':'DEU',
    'australian':'AUS','australia-':'AUS',
    'canadian':'CAN','canada-':'CAN',
    'indian':'IND','india-':'IND',
    'korean':'KOR','korea-':'KOR',
    'japanese':'JPN','japan-':'JPN',
    'russian':'RUS','russia-':'RUS',
    'dutch':'NLD','netherlands-':'NLD',
    'italian':'ITA','italy-':'ITA',
    'spanish':'ESP','spain-':'ESP',
    'swedish':'SWE','sweden-':'SWE',
    'israeli':'ISR','israel-':'ISR',
    'iranian':'IRN','iran-':'IRN',
    'brazilian':'BRA','brazil-':'BRA',
    'mexican':'MEX','mexico-':'MEX',
    'argentinian':'ARG','argentina-':'ARG',
    'nigerian':'NGA','nigeria-':'NGA',
    'south-african':'ZAF',
    'kenyan':'KEN','kenya-':'KEN',
    'new-zealand':'NZL',
    'saudi':'SAU','saudi-arabia':'SAU',
    'emirati':'ARE','uae-':'ARE',
    'pakistani':'PAK','pakistan-':'PAK',
    'turkish':'TUR','turkey-':'TUR',
    'ukrainian':'UKR','ukraine-':'UKR',
    'polish':'POL','poland-':'POL',
    'swiss':'CHE','switzerland-':'CHE',
    'belgian':'BEL','belgium-':'BEL',
    'norwegian':'NOR','norway-':'NOR',
    'danish':'DNK','denmark-':'DNK',
    'finnish':'FIN','finland-':'FIN',
    'greek':'GRC','greece-':'GRC',
    'portuguese':'PRT','portugal-':'PRT',
    'czech':'CZE',
    'hungarian':'HUN','hungary-':'HUN',
    'romanian':'ROU','romania-':'ROU',
    'vietnamese':'VNM','vietnam-':'VNM',
    'thai':'THA','thailand-':'THA',
    'philippine':'PHL','filipino':'PHL',
    'indonesian':'IDN','indonesia-':'IDN',
    'singaporean':'SGP','singapore-':'SGP',
    'malaysian':'MYS','malaysia-':'MYS',
    'bangladeshi':'BGD','bangladesh-':'BGD',
    'sri-lankan':'LKA',
    'nepalese':'NPL','nepal-':'NPL',
    'taiwanese':'TWN','taiwan-':'TWN',
    'hong-kong':'HKG',
    'colombian':'COL','colombia-':'COL',
    'peruvian':'PER','peru-':'PER',
    'chilean':'CHL','chile-':'CHL',
    'venezuelan':'VEN','venezuela-':'VEN',
    'cuban':'CUB','cuba-':'CUB',
  };

  const slugToCountry = slug => {
    if (!slug) return null;
    const s = slug.toLowerCase();
    for (const [keyword, iso3] of Object.entries(SLUG_COUNTRY_KEYWORDS)) {
      if (s.includes(keyword)) return iso3;
    }
    return null;
  };

  // ---- Module state -------------------------------------------------
  let MAP_MODE = 'affected';                 // local, not on DataLoader
  let WORLD_GJ = null;                       // GeoJSON FeatureCollection
  let AFFECTED_BY_ID = new Map();            // incident_id → ISO3
  let DEV_BY_ID = new Map();                 // incident_id → ISO3 (developer/deployer)
  let DATA_REF = null;                       // cached incidents array

  // Robust map lookup: try string and numeric keys
  function getMappedCountries(map, d) {
    if (!d) return null;
    const keysToTry = [String(d.incident_id), d.incident_id, Number(d.incident_id)];
    for (const k of keysToTry) {
      if (k === undefined || k === null || Number.isNaN(k)) continue;
      const v = map.get(String(k));
      if (v) return v;
    }
    return null;
  }

  // ---- Color ramps per mode ----------------------------------------
  const RAMP = {
    affected:  ['#f4efe4', '#e89c84', '#b8442b', '#5a1e0e'],
    developer: ['#f4efe4', '#a4c0d8', '#3d6b8a', '#1a3a52'],
  };

  // Jenks helper function
  function jenks(data, nClasses) {
    const sorted = [...data].sort((a, b) => a - b);
    const mat1 = Array.from({length: sorted.length + 1}, () => new Array(nClasses + 1).fill(0));
    const mat2 = Array.from({length: sorted.length + 1}, () => new Array(nClasses + 1).fill(Infinity));
    for (let i = 1; i <= nClasses; i++) { mat1[1][i] = 1; mat2[1][i] = 0; }
    for (let l = 2; l <= sorted.length; l++) {
      let s1 = 0, s2 = 0, w = 0;
      for (let m = 1; m <= l; m++) {
        const i3 = l - m + 1;
        const val = sorted[i3 - 1];
        s2 += val * val; s1 += val; w++;
        const v = s2 - (s1 * s1) / w;
        if (i3 !== 1) {
          for (let j = 2; j <= nClasses; j++) {
            if (mat2[l][j] >= v + mat2[i3 - 1][j - 1]) {
              mat1[l][j] = i3; mat2[l][j] = v + mat2[i3 - 1][j - 1];
            }
          }
        }
      }
      mat1[l][1] = 1; mat2[l][1] = s2 - (s1 * s1) / w;
    }
    const n = sorted.length;
    const breaks = new Array(nClasses);
    breaks[nClasses - 1] = sorted[n - 1];
    let k = n;
    for (let j = nClasses; j >= 2; j--) {
      k = mat1[k][j] - 2;
      breaks[j - 2] = sorted[k];
    }
    return breaks;
  }

  // ---- Render -------------------------------------------------------
  function render() {
    if (!DATA_REF || !WORLD_GJ) return;
    container.innerHTML = '';

    const filtered = window.DataLoader.applyFilters(DATA_REF);
    if (!filtered.length) {
      container.innerHTML = '';
      return;
    }
    // Build country → count (merge multiple countries per incident)
    const counts = new Map();
    filtered.forEach(d => {
      const codes = MAP_MODE === 'affected'
        ? (getMappedCountries(AFFECTED_BY_ID, d) || [])
        : (getMappedCountries(DEV_BY_ID, d) || []);
      if (!codes || !codes.length) {
        // fallback to per-row company heuristics for developer mode
        if (MAP_MODE === 'developer') {
          const c = pickDeveloperCountry(d);
          if (c) counts.set(c, (counts.get(c) || 0) + 1);
        }
        return;
      }
      codes.forEach(code => counts.set(code, (counts.get(code) || 0) + 1));
    });

    // Build country → category → count mapping for tooltip breakdowns.
    const countryCategoryCounts = new Map();
    filtered.forEach(d => {
      const codes = MAP_MODE === 'affected'
        ? (getMappedCountries(AFFECTED_BY_ID, d) || [])
        : (getMappedCountries(DEV_BY_ID, d) || []);
      if (!codes || !codes.length) {
        if (MAP_MODE === 'developer') {
          const c = pickDeveloperCountry(d);
          if (c) {
            if (!countryCategoryCounts.has(c)) countryCategoryCounts.set(c, new Map());
            const m = countryCategoryCounts.get(c);
            m.set(d.category, (m.get(d.category) || 0) + 1);
          }
        }
        return;
      }
      codes.forEach(code => {
        if (!countryCategoryCounts.has(code)) countryCategoryCounts.set(code, new Map());
        const m = countryCategoryCounts.get(code);
        m.set(d.category, (m.get(d.category) || 0) + 1);
      });
    });
    
      // Diagnostics: print jenks breaks and a couple of country counts so we can
      // debug mismatch between tooltip counts and choropleth fill. These logs are
      // intentionally minimal and non-invasive; remove when debugging is complete.
      try {
        const valsDiag = [...counts.values()];
        // Only call jenks when there are at least 4 values (jenks requires
        // enough data to compute meaningful breaks). Use a small fallback
        // otherwise to keep diagnostics stable.
        const breaksDiag = valsDiag.length >= 4 ? jenks(valsDiag, 4) : [0, 0, 0, 0];
        console.log('[viz-harms] jenks breaks:', breaksDiag);
        console.log('[viz-harms] count USA:', counts.get('USA') || 0);
        console.log('[viz-harms] count RUS:', counts.get('RUS') || 0);
      
        // For a known incident (27 = Nuclear False Alarm, 1983) show mapped
        // countries and picked developer country so we can trace why it may be
        // missing from the choropleth.
        const sampleId = '27';
        const sampleAffected = getMappedCountries(AFFECTED_BY_ID, {incident_id: sampleId});
        const sampleDev = getMappedCountries(DEV_BY_ID, {incident_id: sampleId});
        const samplePick = (function(){
          try { return pickDeveloperCountry({incident_id: sampleId}); } catch(e){ return 'error:'+e.message }
        })();
        console.log('[viz-harms] incident 27 affected countries ->', sampleAffected);
        console.log('[viz-harms] incident 27 dev countries ->', sampleDev);
        console.log('[viz-harms] incident 27 pickDeveloperCountry ->', samplePick);
      } catch (e) {
        console.warn('[viz-harms] diagnostics failed', e);
      }

    const totalCoded = d3.sum(counts.values());
    const maxCount = d3.max(counts.values()) || 1;

    // ---- Layout -----------------------------------------------------
    const W = container.clientWidth;
    const H = 460;
    const svg = d3.select(container)
      .append('svg')
      .attr('width', W).attr('height', H)
      .attr('viewBox', `0 0 ${W} ${H}`)
      .style('display', 'block');

    // ocean
    svg.append('rect').attr('width', W).attr('height', H).attr('fill', '#f4efe4');

    // ---- Toggle pill (HTML overlay) --------------------------------
    const toggle = document.createElement('div');
    toggle.className = 'map-toggle';
    toggle.innerHTML = `
      <button type="button" class="map-toggle__btn ${MAP_MODE === 'affected'  ? 'is-active' : ''}" data-mode="affected">People affected</button>
      <button type="button" class="map-toggle__btn ${MAP_MODE === 'developer' ? 'is-active' : ''}" data-mode="developer">Developer / deployer</button>
    `;
    container.appendChild(toggle);
    toggle.querySelectorAll('.map-toggle__btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const m = btn.dataset.mode;
        if (m !== MAP_MODE) { MAP_MODE = m; window._harmBreaks = null; render(); }
      });
    });

    // ---- Projection + color scale ----------------------------------
    const projection = d3.geoNaturalEarth1().fitSize([W - 20, H - 60], WORLD_GJ);
    const path = d3.geoPath(projection);
    const ramp = RAMP[MAP_MODE];
    // Compute classification breaks from the currently filtered counts so
    // legend and colors reflect the active timeline/filters. Use Jenks for
    // 'affected' since it's typically spatially distributed; use a
    // quantile-based classifier for 'developer' which tends to be sparse and
    // skewed (this avoids odd undefined ranges).
    const vals = [...counts.values()];
    let breaks;
    if (MAP_MODE === 'developer') {
      // Hybrid: transform counts with log1p, run Jenks on transformed values,
      // then map thresholds back to original scale. This preserves Jenks'
      // clustering behavior while stabilizing heavy tails.
      const posVals = vals.filter(v => v >= 0);
      if (posVals.length >= 4) {
        const transformed = posVals.map(v => Math.log1p(v));
        const tBreaks = jenks(transformed, 4);
        // map back and round
        breaks = tBreaks.map(b => Math.max(1, Math.floor(Math.expm1(b))));
      } else if (posVals.length > 0) {
        // Fallback: small sample deterministic buckets
        const m = d3.max(posVals) || 1;
        breaks = [1, Math.max(1, Math.floor(m / 3) || 1), Math.max(2, Math.floor((2 * m) / 3) || 2), Math.max(3, m)];
      } else {
        breaks = [1, 1, 1, 1];
      }
    } else {
      // 'affected' mode: use Jenks when there are enough values, otherwise
      // fall back to simple buckets.
      breaks = vals.length >= 4 ? jenks(vals, 4) : [1, 2, 3, Math.max(4, d3.max(vals) || 4)];
    }

    // Ensure breaks are integers and strictly increasing to avoid legend
    // label glitches like "2-1". This enforces breaks[i] >= breaks[i-1]+1.
    (function normalizeBreaks(b) {
      for (let i = 0; i < b.length; i++) {
        // coerce to integer and at least 1
        b[i] = Math.max(1, Math.floor(Number(b[i]) || 0));
        if (i > 0) b[i] = Math.max(b[i], b[i - 1] + 1);
      }
    })(breaks);

    // Focused diagnostics for 'affected' mode: log the breaks used for the
    // color scale and the specific count/color decision for the Philippines
    // so we can debug why a positive count might still render neutral.
    try {
      console.log('[viz-harms] render mode:', MAP_MODE, 'render breaks:', breaks);
      console.log('[viz-harms] render count PHL:', counts.get('PHL') || 0);
    } catch (e) {
      /* ignore */
    }
    // Build a threshold domain that matches the legend's inclusive labels.
    // We want bins: 0, 1..breaks[0], (breaks[0]+1)..breaks[1], etc. d3.scaleThreshold
    // treats domain values as exclusive upper bounds (x < domain[i]). To make
    // the inclusive ranges match, we set domain to [1, breaks[0]+1, breaks[1]+1, breaks[2]+1].
    const domainForScale = [1, (breaks[0] || 1) + 1, (breaks[1] || 1) + 1, (breaks[2] || 1) + 1];
    const topColor = MAP_MODE === 'affected' ? '#2a0a06' : '#061a2b';
    const color = d3.scaleThreshold()
      .domain(domainForScale)
      .range(['#ebe5d4', ramp[1], ramp[2], ramp[3], topColor]);

    // ---- Draw countries --------------------------------------------
    const g = svg.append('g').attr('transform', 'translate(10,15)');
    g.append('g')
      .selectAll('path')
      .data(WORLD_GJ.features)
      .enter()
      .append('path')
      .attr('d', path)
      .attr('fill', d => {
        const c = counts.get(d.id) || 0;
        const col = color(c);
        // Focused log for Philippines only to keep console output small.
        if (d.id === 'PHL') {
          try {
            console.log('[viz-harms] PHL debug -> count:', c, 'colorFromScale:', col);
          } catch (e) {}
        }

        // Sanity check: ensure the color returned by the scale matches the
        // legend bin we compute from `breaks`. If not, log a concise warning
        // to help trace misalignments (only when a positive count exists).
        try {
          if (c > 0) {
            const ranges = ['#ebe5d4', ramp[1], ramp[2], ramp[3], '#2a0a06'];
            const actualIndex = ranges.indexOf(col);
            let expectedIndex = 0;
            if (c === 0) expectedIndex = 0;
            else if (c <= (breaks[0] || 1)) expectedIndex = 1;
            else if (c <= (breaks[1] || 1)) expectedIndex = 2;
            else if (c <= (breaks[2] || 1)) expectedIndex = 3;
            else expectedIndex = 4;
            if (actualIndex !== expectedIndex) {
              console.warn('[viz-harms] color/bin mismatch', {
                id: d.id, count: c, breaks: breaks.slice(), domainForScale, colorFromScale: col,
                expectedIndex, actualIndex
              });
            }
          }
        } catch (e) {
          /* ignore */
        }

        // keep zero mapped to the neutral color, but ensure any positive count
        // is visually distinct: if jenks produced thresholds that leave small
        // positive counts in the neutral bin, bump them up to ramp[1].
        if (c > 0 && col === '#ebe5d4') {
          if (d.id === 'PHL') console.log('[viz-harms] PHL override applied ->', ramp[1]);
          return ramp[1];
        }
        return col;
      })
      .attr('stroke', '#cbc4ad')
      .attr('stroke-width', 0.45)
      .style('cursor', 'pointer')
      .on('mousemove', function (event, d) {
        const c = counts.get(d.id) || 0;
        const label = (d.properties && d.properties.name) || d.id;
        tooltip.classList.add('is-visible');

        if (c === 0) {
          tooltip.innerHTML = `<strong>${label}</strong><div><em>No incidents recorded</em></div>`;
        } else {
          // Build per-category rows for this country using the selected
          // categories (DataLoader.getStackCategories respects filters).
          const catOrder = window.DataLoader.getStackCategories();
          const catMap = countryCategoryCounts.get(d.id) || new Map();
          const total = Array.from(catMap.values()).reduce((s, v) => s + v, 0) || c;
          // Header
          let html = `<strong>${label}</strong>`;
          // Per-category lines
          catOrder.forEach(catId => {
            const cnt = catMap.get(catId) || 0;
            const pct = total > 0 ? ((cnt / total) * 100).toFixed(1) : '0.0';
            const color = window.IncidentCategories.getColor(catId) || '#999';
            // show only categories with a nonzero count to keep tooltip compact
            if (cnt > 0) {
              html += `<div class="tooltip__row" style="display:flex;align-items:center;gap:8px;">` +
                `<span style="width:10px;height:10px;border-radius:50%;display:inline-block;background:${color}"></span>` +
                `<span style="flex:1">${window.IncidentCategories.getTooltipLabel(catId)}</span>` +
                `<span style="width:48px;text-align:right">${cnt}</span>` +
                `<span style="width:56px;text-align:right;color:#8a877c">${pct}%</span>` +
                `</div>`;
            }
          });
          // Total at bottom
          html += `<div style="border-top:1px solid #e6e2d6;margin-top:6px;padding-top:6px;display:flex;justify-content:space-between;font-weight:600">` +
            `<span>Total</span><span>${total}</span></div>`;
          tooltip.innerHTML = html;
        }

        tooltip.style.left = (event.pageX + 14) + 'px';
        tooltip.style.top = (event.pageY - 28) + 'px';
        d3.select(this).attr('stroke', '#1c1b18').attr('stroke-width', 0.9);
      })
      .on('mouseleave', function () {
        tooltip.classList.remove('is-visible');
        d3.select(this).attr('stroke', '#cbc4ad').attr('stroke-width', 0.45);
      });

    // ---- Legend ----------------------------------------------------
    const legendW = 180, legendH = 8;
    const legend = svg.append('g')
      .attr('transform', `translate(${W - legendW - 20},${H - 32})`);

  const binColors = ['#ebe5d4', ramp[1], ramp[2], ramp[3], topColor];
    const binLabels = [
      '0',
      `1–${breaks[0]}`,
      `${breaks[0]+1}–${breaks[1]}`,
      `${breaks[1]+1}–${breaks[2]}`,
      `${breaks[2]+1}+`
    ];
    const binW = legendW / binColors.length;

    binColors.forEach((col, i) => {
      legend.append('rect')
        .attr('x', i * binW).attr('y', 0)
        .attr('width', binW).attr('height', legendH)
        .attr('fill', col)
        .attr('stroke', '#cbc4ad').attr('stroke-width', 0.3);
      legend.append('text')
        .attr('x', i * binW).attr('y', legendH + 10)
        .style('font-family', 'JetBrains Mono, monospace')
        .style('font-size', '9px').style('fill', '#8a877c')
        .text(binLabels[i]);
    });

    legend.append('text')
      .attr('x', 0).attr('y', -6)
      .style('font-family', 'JetBrains Mono, monospace')
      .style('font-size', '10px').style('text-transform', 'uppercase')
      .style('letter-spacing', '0.08em').style('fill', '#5a574e')
      .text(MAP_MODE === 'affected' ? 'Incidents — affected' : 'Incidents — developer');

    // ---- Debug panel (diagnostic) ---------------------------------
    // Render a small table listing top countries by count and their color
    // assignments so we can visually inspect mismatches when they occur.
    // This is a non-invasive DOM node we can remove later.
    // try {
    //   const debugContainerId = 'viz-harms-debug';
    //   let debugEl = document.getElementById(debugContainerId);
    //   if (!debugEl) {
    //     debugEl = document.createElement('div');
    //     debugEl.id = debugContainerId;
    //     debugEl.style.fontFamily = 'JetBrains Mono, monospace';
    //     debugEl.style.fontSize = '11px';
    //     debugEl.style.color = '#333';
    //     debugEl.style.marginTop = '8px';
    //     debugEl.style.maxHeight = '140px';
    //     debugEl.style.overflow = 'auto';
    //     container.appendChild(debugEl);
    //   }
    //   // build top list
    //   const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
    //   const rows = entries.map(([id, c]) => {
    //     const col = color(c);
    //     let expected = '0';
    //     if (c === 0) expected = '0';
    //     else if (c <= breaks[0]) expected = `1–${breaks[0]}`;
    //     else if (c <= breaks[1]) expected = `${breaks[0]+1}–${breaks[1]}`;
    //     else if (c <= breaks[2]) expected = `${breaks[1]+1}–${breaks[2]}`;
    //     else expected = `${breaks[2]+1}+`;
    //     const actual = (col === '#ebe5d4') ? '0' : (col === ramp[1] ? '1' : (col === ramp[2] ? '2' : (col === ramp[3] ? '3' : '4')));
    //     const mismatch = (actual !== expected ? 'background:#ffe6e6;border-left:3px solid #d9534f;padding:2px 6px' : '');
    //     return `<div style="display:flex;justify-content:space-between;align-items:center;${mismatch}"><span style="width:70px">${id}</span><span style="width:40px;text-align:right">${c}</span><span style="width:90px;text-align:center;background:${col};color:#fff;border-radius:3px;padding:2px 6px">${col}</span><span style="width:110px;text-align:right">${expected}</span></div>`;
    //   }).join('');
    //   debugEl.innerHTML = `<div style="display:flex;justify-content:space-between;font-weight:600;padding-bottom:4px"><span style="width:70px">Country</span><span style="width:40px;text-align:right">Cnt</span><span style="width:90px;text-align:center">Color</span><span style="width:110px;text-align:right">Expected</span></div>${rows}`;
    // } catch (e) {
    //   /* ignore */
    // }

    // ---- Global incidents counter ------------------------------------
    if (MAP_MODE === 'affected') {
      const worldwideCount = filtered.filter(d => {
        const val = AFFECTED_BY_ID.get(String(d.incident_id));
        return !val || (Array.isArray(val) && val.length === 0);
      }).length;

      const box = svg.append('g')
        .attr('transform', `translate(${W - 220}, 10)`)
      box.append('rect')
        .attr('width', 200).attr('height', 36)
        .attr('rx', 4)
        .attr('fill', '#f4efe4')
        .attr('stroke', '#cbc4ad')
        .attr('stroke-width', 0.5);
      box.append('text')
        .attr('x', 10).attr('y', 13)
        .style('font-family', 'JetBrains Mono, monospace')
        .style('font-size', '9px').style('text-transform', 'uppercase')
        .style('letter-spacing', '0.08em').style('fill', '#8a877c')
        .text('Incidents impacting everyone');
      box.append('text')
        .attr('x', 10).attr('y', 28)
        .style('font-family', 'Fraunces, serif')
        .style('font-size', '14px').style('fill', '#1c1b18')
        .text(worldwideCount);
    }

    if (filtered.length === 0) {
      svg.append('text')
        .attr('x', W / 2).attr('y', H / 2)
        .attr('text-anchor', 'middle')
        .style('font-family', 'Fraunces, serif').style('font-style', 'italic')
        .style('font-size', '14px').style('fill', '#8a877c')
        .text('No country data for the current filter selection.');
    }
  }

  function pickDeveloperCountry(d) {
    // Prefer explicit mapping from deployer_developer_locations.csv
    const mapped = getMappedCountries(DEV_BY_ID, d);
    if (mapped && mapped.length) return mapped[0];
    // Fallback to company name heuristics from incident row
    const list = (d['Alleged deployer of AI system'] || [])
      .concat(d['Alleged developer of AI system'] || []);
    for (const name of list) {
      const c = companyToCountry(name);
      if (c) return c;
    }
    return null;
  }

  // ---- Bootstrap: world + classifications, then hook up --------------
  Promise.all([
    d3.json(WORLD_PATH),
    d3.csv(CLASSIFICATIONS_PATH).catch(() => []),
    d3.csv(DEV_DEPLOY_COUNTRIES_PATH).catch(() => []),
  ])
    .then(([world, classifications, devmap]) => {
      WORLD_GJ = world;
      classifications.forEach(row => {
        const id = row['incident_id'];
        const val = (row['victim_country'] || '').trim();
        if (!val || val === 'worldwide' || val === 'other') return;
        const countries = val.split(',').map(s => s.trim()).filter(Boolean);
        if (countries.length) AFFECTED_BY_ID.set(String(id), countries);
      });
      // build incident -> developer/deployer country map from CSV
      devmap.forEach(row => {
        const id = row['incident_id'];
        const val = (row['deployer_developer_countries'] || '').trim();
        if (!val || val === 'Unknown' || val === 'unknown' || val === 'Other') return;
        const countries = val.split(',').map(s => s.trim()).filter(Boolean);
        if (countries.length) DEV_BY_ID.set(String(id), countries);
      });
      window.DataLoader.onReady(data => {
        DATA_REF = data;
        render();
      });
      window.DataLoader.onFilterChange(() => render());
      let resizeTimer;
      window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => render(), 150);
      });
    })
    .catch(err => {
      console.error('[viz-harms] init failed:', err);
      container.innerHTML = '<div class="loading">Could not load map data.</div>';
    });
})();
