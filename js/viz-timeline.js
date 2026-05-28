/* ===================================================================
   viz-timeline.js — Incidents reported per year
   Stacked area by category (always uses category colors).
   =================================================================== */

(function () {
  const container = document.getElementById('chart-timeline');
  if (!container) return;
  const tooltip = document.getElementById('tooltip');
  const Cat = window.IncidentCategories;

  const ANNOTATIONS = [
    { year: 2022, label: 'ChatGPT released', align: 'left' },
    { year: 2025, label: 'Peak: 399 incidents', align: 'left' },
  ];

  function buildYearSeries(filtered, keys) {
    const years = filtered.filter(d => d.year).map(d => d.year);
    if (years.length === 0 || !keys.length) return null;

    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);
    const byYearCat = d3.rollup(
      filtered,
      v => v.length,
      d => d.year,
      d => Cat.getCategory(d)
    );

    const rows = [];
    for (let y = minYear; y <= maxYear; y++) {
      const row = { year: y };
      keys.forEach(k => {
        row[k] = (byYearCat.get(y) && byYearCat.get(y).get(k)) || 0;
      });
      row.total = keys.reduce((s, k) => s + row[k], 0);
      rows.push(row);
    }

    return { minYear, maxYear, rows, keys };
  }

  function renderStacked(meta) {
    const { minYear, maxYear, rows, keys } = meta;
    const margin = { top: 30, right: 28, bottom: 50, left: 50 };
    const W = container.clientWidth;
    const width = W - margin.left - margin.right;
    const height = 420 - margin.top - margin.bottom;

    const svg = d3.select(container)
      .append('svg')
      .attr('width', W)
      .attr('height', 420)
      .attr('viewBox', `0 0 ${W} 420`);

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    g.insert('rect', ':first-child')
      .attr('class', 'chart-hit')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', 'transparent');

    const x = d3.scaleLinear().domain([minYear, maxYear]).range([0, width]);
    const y = d3.scaleLinear()
      .domain([0, d3.max(rows, d => d.total) * 1.15])
      .nice()
      .range([height, 0]);

    const stack = d3.stack().keys(keys);
    const layers = stack(rows);

    drawGrid(g, x, y, width, height);

    const area = d3.area()
      .x(d => x(d.data.year))
      .y0(d => y(d[0]))
      .y1(d => y(d[1]))
      .curve(d3.curveMonotoneX);

    const stackLayer = g.selectAll('.stack-layer')
      .data(layers)
      .enter()
      .append('path')
      .attr('class', 'stack-layer')
      .attr('fill', d => Cat.getColor(d.key))
      .attr('fill-opacity', 0.88)
      .attr('stroke', '#f4efe4')
      .attr('stroke-width', 0.75)
      .attr('cursor', 'pointer')
      .attr('d', area);

    const totalSeries = rows.map(d => ({ year: d.year, count: d.total }));
    const line = d3.line()
      .x(d => x(d.year))
      .y(d => y(d.count))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(totalSeries)
      .attr('fill', 'none')
      .attr('stroke', '#1c1b18')
      .attr('stroke-width', 1)
      .attr('opacity', 0.35)
      .attr('d', line);

    drawAxes(g, x, y, width, height, rows.length);
    if (window.DataLoader.filters.categories.length === 0) {
      drawAnnotations(g, totalSeries, x, y);
    }

    attachStackedInteraction(g, stackLayer, totalSeries, rows, keys, x, y, width, height);
  }

  function positionTooltip(event) {
    tooltip.style.left = (event.pageX + 14) + 'px';
    tooltip.style.top = (event.pageY - 28) + 'px';
  }

  function layerTooltipHtml(key, seg) {
    return (
      `<div class="tooltip__cat">` +
      `<span class="tooltip__swatch" style="background:${Cat.getColor(key)}"></span>` +
      `<strong>${Cat.getLabel(key)}</strong>` +
      `<em>${seg.year} · ${seg.count} incident${seg.count === 1 ? '' : 's'}</em></div>`
    );
  }

  function setLayerHighlight(g, activeKey) {
    g.selectAll('.stack-layer').attr('fill-opacity', function () {
      return d3.select(this).datum().key === activeKey ? 0.95 : 0.4;
    });
  }

  function clearLayerHighlight(g) {
    g.selectAll('.stack-layer').attr('fill-opacity', 0.88);
  }

  function segmentForYear(layerData, year) {
    const pt = layerData.find(p => p.data.year === year);
    if (!pt || pt[1] <= pt[0]) return null;
    return { year, count: Math.round(pt[1] - pt[0]) };
  }

  function attachStackedInteraction(g, stackLayer, totalSeries, rows, keys, x, y, width, height) {
    const focus = g.append('g').attr('class', 'crosshair').style('display', 'none');
    focus.append('line')
      .attr('y1', 0).attr('y2', height)
      .attr('stroke', '#1c1b18').attr('stroke-width', 0.6)
      .attr('stroke-dasharray', '2,3');
    const focusDot = focus.append('circle')
      .attr('r', 4).attr('fill', '#1c1b18');

    stackLayer
      .on('mouseenter', function (event, layerData) {
        const key = layerData.key;
        setLayerHighlight(g, key);
        const year = Math.round(x.invert(d3.pointer(event, g.node())[0]));
        const seg = segmentForYear(layerData, year);
        if (!seg) return;
        tooltip.classList.add('is-visible');
        tooltip.innerHTML = layerTooltipHtml(key, seg);
        positionTooltip(event);
      })
      .on('mousemove', function (event, layerData) {
        const key = layerData.key;
        const year = Math.round(x.invert(d3.pointer(event, g.node())[0]));
        const seg = segmentForYear(layerData, year);
        if (!seg) return;
        focus.style('display', 'none');
        tooltip.classList.add('is-visible');
        tooltip.innerHTML = layerTooltipHtml(key, seg);
        positionTooltip(event);
      })
      .on('mouseleave', () => {
        clearLayerHighlight(g);
      });

    g.on('mousemove', function (event) {
      if (event.target.classList.contains('stack-layer')) return;

      clearLayerHighlight(g);
      const [mx] = d3.pointer(event, this);
      const year = Math.round(x.invert(mx));
      const point = totalSeries.find(d => d.year === year);
      if (!point) return;

      const cx = x(point.year);
      const cy = y(point.count);
      focus.style('display', null);
      focus.select('line').attr('x1', cx).attr('x2', cx);
      focusDot.attr('cx', cx).attr('cy', cy);

      const row = rows.find(r => r.year === year);
      if (!row) return;
      const parts = keys
        .filter(k => row[k] > 0)
        .map(
          k =>
            `<div class="tooltip__row">` +
            `<span>${Cat.getTooltipLabel(k)}</span>` +
            `<span>${row[k]}</span></div>`
        )
        .join('');
      tooltip.classList.add('is-visible');
      tooltip.innerHTML = `<strong>${row.year}</strong>${parts}<em>Total: ${row.total}</em>`;
      positionTooltip(event);
    })
    .on('mouseleave', () => {
      focus.style('display', 'none');
      tooltip.classList.remove('is-visible');
      clearLayerHighlight(g);
    });
  }

  function drawGrid(g, x, y, width, height) {
    g.append('g')
      .attr('class', 'gridlines')
      .selectAll('line')
      .data(y.ticks(5))
      .enter()
      .append('line')
      .attr('x1', 0).attr('x2', width)
      .attr('y1', d => y(d)).attr('y2', d => y(d))
      .attr('stroke', '#ddd6c1')
      .attr('stroke-width', 0.5);
  }

  function drawAxes(g, x, y, width, height, tickCount) {
    g.append('g')
      .attr('class', 'axis-x')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).tickFormat(d3.format('d')).ticks(Math.min(12, tickCount)));

    g.append('g')
      .attr('class', 'axis-y')
      .call(d3.axisLeft(y).ticks(5));

    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('x', width / 2).attr('y', height + 42)
      .style('font-family', 'JetBrains Mono, monospace')
      .style('font-size', '10px').style('text-transform', 'uppercase')
      .style('letter-spacing', '0.08em').style('fill', '#8a877c')
      .text('Year of incident');

    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('transform', `translate(-36,${height / 2})rotate(-90)`)
      .style('font-family', 'JetBrains Mono, monospace')
      .style('font-size', '10px').style('text-transform', 'uppercase')
      .style('letter-spacing', '0.08em').style('fill', '#8a877c')
      .text('Incidents');
  }

  function drawAnnotations(g, series, x, y) {
    const annotLayer = g.append('g').attr('class', 'annotations').style('opacity', 0);
    annotLayer.transition().delay(400).duration(400).style('opacity', 1);

    ANNOTATIONS.forEach(a => {
      const point = series.find(d => d.year === a.year);
      if (!point) return;
      const cx = x(a.year);
      const cy = y(point.count);

      annotLayer.append('circle')
        .attr('cx', cx).attr('cy', cy)
        .attr('r', 5)
        .attr('fill', 'none').attr('stroke', '#8a2e1c').attr('stroke-width', 1);
      annotLayer.append('circle')
        .attr('cx', cx).attr('cy', cy)
        .attr('r', 2.5)
        .attr('fill', '#8a2e1c');

      const labelDX = a.align === 'right' ? 14 : -14;
      const labelDY = -18;
      const anchor = a.align === 'right' ? 'start' : 'end';

      annotLayer.append('line')
        .attr('x1', cx).attr('y1', cy - 6)
        .attr('x2', cx + (labelDX > 0 ? labelDX - 4 : labelDX + 4))
        .attr('y2', cy + labelDY + 4)
        .attr('stroke', '#8a2e1c').attr('stroke-width', 0.7);

      annotLayer.append('text')
        .attr('x', cx + labelDX).attr('y', cy + labelDY)
        .attr('text-anchor', anchor)
        .style('font-family', 'Fraunces, serif')
        .style('font-style', 'italic')
        .style('font-size', '12px')
        .style('fill', '#1c1b18')
        .text(a.label);
    });
  }

  function render(data) {
    container.innerHTML = '';
    const filtered = window.DataLoader.applyFilters(data);
    const keys = window.DataLoader.getStackCategories();
    const meta = buildYearSeries(filtered, keys);

    if (!meta) {
      container.innerHTML = '<div class="loading">No incidents match current filters.</div>';
      return;
    }

    renderStacked(meta);
  }

  let chartData = null;
  window.DataLoader.onFilterChange(() => {
    if (chartData) render(chartData);
  });
  window.DataLoader.onReady(data => {
    chartData = data;
    render(data);
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => render(chartData), 150);
    });
  });
  window.DataLoader.load().catch(() => {
      container.innerHTML = `
        <div class="loading">
          Could not load data. Please run a local server
          (<code>python3 -m http.server 8000</code>).
        </div>`;
    });
})();
