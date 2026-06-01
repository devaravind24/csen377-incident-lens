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
  let DATA_REF = null;                       // cached incidents array

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
    // Build country → count
    const counts = new Map();
    filtered.forEach(d => {
      const code = MAP_MODE === 'affected'
        ? AFFECTED_BY_ID.get(String(d.incident_id))
        : pickDeveloperCountry(d);
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
        if (m !== MAP_MODE) { MAP_MODE = m; window._harmBreaks = null; render(); }
      });
    });

    // ---- Projection + color scale ----------------------------------
    const projection = d3.geoNaturalEarth1().fitSize([W - 20, H - 60], WORLD_GJ);
    const path = d3.geoPath(projection);
    const ramp = RAMP[MAP_MODE];
    if (!window._harmBreaks) {
      const allCounts = new Map();
      DATA_REF.forEach(d => {
        const code = MAP_MODE === 'affected'
          ? AFFECTED_BY_ID.get(String(d.incident_id))
          : pickDeveloperCountry(d);
        if (code) allCounts.set(code, (allCounts.get(code) || 0) + 1);
      });
      const vals = [...allCounts.values()];
      window._harmBreaks = vals.length >= 4 ? jenks(vals, 4) : [1, 2, 3, 4];
    }
    const breaks = window._harmBreaks;
    const color = d3.scaleThreshold()
      .domain(breaks)
      .range(['#ebe5d4', ramp[1], ramp[2], ramp[3], '#2a0a06']);

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
        return color(c);
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

    const binColors = ['#ebe5d4', ramp[1], ramp[2], ramp[3], '#2a0a06'];
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

    // ---- Global incidents counter ------------------------------------
    if (MAP_MODE === 'affected') {
      const worldwideCount = filtered.filter(d => {
        const val = AFFECTED_BY_ID.get(String(d.incident_id));
        return val === undefined; // unmapped = worldwide or unknown
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
  ])
    .then(([world, classifications]) => {
      WORLD_GJ = world;
      classifications.forEach(row => {
        const id = row['incident_id'];
        const val = (row['victim_country'] || '').trim();
        if (!val || val === 'worldwide' || val === 'other') return;
        const countries = val.split(',').filter(Boolean);
        if (countries.length) AFFECTED_BY_ID.set(String(id), countries[0]);
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
