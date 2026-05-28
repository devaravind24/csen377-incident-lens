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
  const CLASSIFICATIONS_PATH = '../data/classifications_CSETv1.csv';
  const COUNTRIES_PATH = '../data/incident-countries.json';

  // ---- ISO-2 → ISO-3 (covers everything in CSETv1) -------------------
  const ISO2_TO_ISO3 = {
    AR:'ARG', AU:'AUS', BR:'BRA', CA:'CAN', CH:'CHE', CN:'CHN',
    DE:'DEU', ES:'ESP', FR:'FRA', GB:'GBR', GR:'GRC', ID:'IDN',
    IE:'IRL', IL:'ISR', IN:'IND', IT:'ITA', JP:'JPN', KR:'KOR',
    LY:'LBY', MX:'MEX', NL:'NLD', NZ:'NZL', PS:'PSE', RS:'SRB',
    RU:'RUS', SE:'SWE', US:'USA', VN:'VNM', UA:'UKR', PL:'POL',
    TR:'TUR', SA:'SAU', AE:'ARE', EG:'EGY', NG:'NGA', ZA:'ZAF',
    KE:'KEN', ET:'ETH', GH:'GHA', PH:'PHL', TH:'THA', MY:'MYS',
    SG:'SGP', PK:'PAK', BD:'BGD', LK:'LKA', NP:'NPL', IR:'IRN',
    AT:'AUT', BE:'BEL', BG:'BGR', HR:'HRV', CZ:'CZE', DK:'DNK',
    FI:'FIN', HU:'HUN', NO:'NOR', PT:'PRT', RO:'ROU', SK:'SVK',
    SI:'SVN', TW:'TWN', HK:'HKG', VE:'VEN', CO:'COL', CL:'CHL',
    PE:'PER', EC:'ECU', BO:'BOL', UY:'URY', CR:'CRI', CU:'CUB',
    GT:'GTM', JM:'JAM', HT:'HTI', PR:'PRI',
  };
  const iso2to3 = code => (code ? ISO2_TO_ISO3[code.toUpperCase()] : null) || null;

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

  // ---- Module state -------------------------------------------------
  let MAP_MODE = 'affected';                 // local, not on DataLoader
  let WORLD_GJ = null;                       // GeoJSON FeatureCollection
  let AFFECTED_BY_ID = new Map();            // incident_id → ISO3 (affected)
  let DEVELOPER_BY_ID = new Map();           // incident_id → ISO3 (developer)
  let DATA_REF = null;                       // cached incidents array

  // ---- Color ramps per mode ----------------------------------------
  const RAMP = {
    affected:  ['#f4efe4', '#e89c84', '#b8442b', '#5a1e0e'],
    developer: ['#f4efe4', '#a4c0d8', '#3d6b8a', '#1a3a52'],
  };

  // ---- Render -------------------------------------------------------
  function render() {
    if (!DATA_REF || !WORLD_GJ) return;
    container.innerHTML = '';

    const filtered = window.DataLoader.applyFilters(DATA_REF);

    // Build country → count
    const counts = new Map();
    filtered.forEach(d => {
      const code = MAP_MODE === 'affected'
        ? AFFECTED_BY_ID.get(String(d.incident_id))
        : DEVELOPER_BY_ID.get(String(d.incident_id));
      if (code) counts.set(code, (counts.get(code) || 0) + 1);
    });

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
        if (m !== MAP_MODE) { MAP_MODE = m; render(); }
      });
    });

    // ---- Projection + color scale ----------------------------------
    const projection = d3.geoNaturalEarth1().fitSize([W - 20, H - 60], WORLD_GJ);
    const path = d3.geoPath(projection);
    const ramp = RAMP[MAP_MODE];
    const color = d3.scaleSqrt().domain([0, maxCount]).range([ramp[0], ramp[3]]);

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
        return c === 0 ? '#ebe5d4' : color(c);
      })
      .attr('stroke', '#cbc4ad')
      .attr('stroke-width', 0.45)
      .style('cursor', 'pointer')
      .on('mousemove', function (event, d) {
        const c = counts.get(d.id) || 0;
        const label = (d.properties && d.properties.name) || d.id;
        tooltip.classList.add('is-visible');
        tooltip.innerHTML = `<strong>${label}</strong>` +
          (c === 0
            ? `<em>No incidents recorded</em>`
            : `<div class="tooltip__row"><span>Incidents</span><span>${c}</span></div>` +
              (totalCoded > 0 ? `<em>${((c / totalCoded) * 100).toFixed(1)}% of mapped</em>` : ''));
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
    const gradId = 'map-grad-' + MAP_MODE;
    const defs = svg.append('defs');
    const grad = defs.append('linearGradient').attr('id', gradId);
    [0, 0.33, 0.66, 1].forEach((t, i) => {
      grad.append('stop')
        .attr('offset', `${t * 100}%`)
        .attr('stop-color', ramp[i]);
    });
    legend.append('rect')
      .attr('width', legendW).attr('height', legendH)
      .attr('fill', `url(#${gradId})`)
      .attr('stroke', '#cbc4ad').attr('stroke-width', 0.5);
    legend.append('text')
      .attr('x', 0).attr('y', -6)
      .style('font-family', 'JetBrains Mono, monospace')
      .style('font-size', '10px').style('text-transform', 'uppercase')
      .style('letter-spacing', '0.08em').style('fill', '#5a574e')
      .text(MAP_MODE === 'affected' ? 'Incidents — affected' : 'Incidents — developer');
    legend.append('text')
      .attr('x', 0).attr('y', legendH + 14)
      .style('font-family', 'JetBrains Mono, monospace')
      .style('font-size', '10px').style('fill', '#8a877c').text('0');
    legend.append('text')
      .attr('x', legendW).attr('y', legendH + 14)
      .style('font-family', 'JetBrains Mono, monospace')
      .style('font-size', '10px').style('fill', '#8a877c')
      .style('text-anchor', 'end').text(maxCount);

    if (totalCoded === 0) {
      svg.append('text')
        .attr('x', W / 2).attr('y', H / 2)
        .attr('text-anchor', 'middle')
        .style('font-family', 'Fraunces, serif').style('font-style', 'italic')
        .style('font-size', '14px').style('fill', '#8a877c')
        .text('No country data for the current filter selection.');
    }
  }

  function pickDeveloperCountry(d) {
    const list = (d['Alleged deployer of AI system'] || [])
      .concat(d['Alleged developer of AI system'] || []);
    for (const name of list) {
      const c = companyToCountry(name);
      if (c) return c;
    }
    return null;
  }

  // ---- Bootstrap: world geometry + country labels, then hook up ------
  // Preferred source: data/incident-countries.json (richer, ~55% affected
  // coverage from scripts/geo-label-incidents.py). Falls back to the CSET
  // CSV + in-JS company map if that file is missing, so the map never
  // breaks regardless of which data is committed.
  Promise.all([
    d3.json(WORLD_PATH),
    d3.json(COUNTRIES_PATH).catch(() => null),
    d3.csv(CLASSIFICATIONS_PATH).catch(() => []),
  ])
    .then(([world, countries, classifications]) => {
      WORLD_GJ = world;

      if (countries) {
        // Rich pre-computed labels: { incident_id: {affected, developer} }
        Object.keys(countries).forEach(id => {
          const rec = countries[id] || {};
          if (rec.affected)  AFFECTED_BY_ID.set(String(id), rec.affected);
          if (rec.developer) DEVELOPER_BY_ID.set(String(id), rec.developer);
        });
        console.log(`[viz-harms] loaded country labels: ` +
          `${AFFECTED_BY_ID.size} affected · ${DEVELOPER_BY_ID.size} developer`);
      } else {
        // Fallback path — CSET CSV for affected, company map for developer.
        classifications.forEach(row => {
          const id = row['Incident ID'];
          const iso2 = (row['Location Country (two letters)'] || '').trim();
          if (id && iso2 && iso2.length === 2) {
            const iso3 = iso2to3(iso2);
            if (iso3) AFFECTED_BY_ID.set(String(id), iso3);
          }
        });
        // developer fallback is computed per-incident in render via the map
        DEVELOPER_BY_ID = null;
        console.warn('[viz-harms] incident-countries.json missing — using CSET fallback');
      }

      window.DataLoader.onReady(data => {
        DATA_REF = data;
        // If developer labels weren't pre-computed, derive them now.
        if (DEVELOPER_BY_ID === null) {
          DEVELOPER_BY_ID = new Map();
          data.forEach(d => {
            const c = pickDeveloperCountry(d);
            if (c) DEVELOPER_BY_ID.set(String(d.incident_id), c);
          });
        }
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
