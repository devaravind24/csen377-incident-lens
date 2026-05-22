/* ===================================================================
   viz-timeline.js — Incidents reported per year
   Area chart with gradient fill, annotations, and interactive crosshair.
   =================================================================== */

(function () {
  const container = document.getElementById('chart-timeline');
  if (!container) return;
  const tooltip = document.getElementById('tooltip');

  // Annotations: hand-picked inflection points in the historical record.
  const ANNOTATIONS = [
    { year: 1983, label: 'Soviet nuclear false alarm', align: 'right' },
    { year: 2022, label: 'ChatGPT released', align: 'left' },
    { year: 2025, label: 'Peak: 399 incidents', align: 'left' },
  ];

  function render(data) {
    container.innerHTML = '';
    const filtered = window.DataLoader.applyFilters(data);

    const byYear = d3.rollups(
      filtered.filter(d => d.year),
      v => v.length,
      d => d.year
    )
      .map(([year, count]) => ({ year, count }))
      .sort((a, b) => a.year - b.year);

    if (byYear.length === 0) {
      container.innerHTML = '<div class="loading">No incidents match current filters.</div>';
      return;
    }

    // Fill in missing years with zero so the area doesn't have visual gaps
    const minYear = byYear[0].year;
    const maxYear = byYear[byYear.length - 1].year;
    const yearMap = new Map(byYear.map(d => [d.year, d.count]));
    const series = [];
    for (let y = minYear; y <= maxYear; y++) {
      series.push({ year: y, count: yearMap.get(y) || 0 });
    }

    const margin = { top: 30, right: 28, bottom: 50, left: 50 };
    const W = container.clientWidth;
    const width = W - margin.left - margin.right;
    const height = 420 - margin.top - margin.bottom;

    const svg = d3.select(container)
      .append('svg')
      .attr('width', W)
      .attr('height', 420)
      .attr('viewBox', `0 0 ${W} 420`);

    const defs = svg.append('defs');
    const grad = defs.append('linearGradient')
      .attr('id', 'timeline-gradient')
      .attr('x1', '0%').attr('y1', '0%')
      .attr('x2', '0%').attr('y2', '100%');
    grad.append('stop').attr('offset', '0%')
      .attr('stop-color', '#b8442b').attr('stop-opacity', 0.55);
    grad.append('stop').attr('offset', '100%')
      .attr('stop-color', '#b8442b').attr('stop-opacity', 0.04);

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3.scaleLinear()
      .domain([minYear, maxYear])
      .range([0, width]);

    const y = d3.scaleLinear()
      .domain([0, d3.max(series, d => d.count) * 1.15])
      .nice()
      .range([height, 0]);

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

    const area = d3.area()
      .x(d => x(d.year))
      .y0(height)
      .y1(d => y(d.count))
      .curve(d3.curveMonotoneX);

    const line = d3.line()
      .x(d => x(d.year))
      .y(d => y(d.count))
      .curve(d3.curveMonotoneX);

    const clipId = 'timeline-clip-' + Math.random().toString(36).slice(2, 8);
    defs.append('clipPath')
      .attr('id', clipId)
      .append('rect')
      .attr('width', 0)
      .attr('height', height)
      .transition()
      .duration(900)
      .ease(d3.easeCubicOut)
      .attr('width', width);

    g.append('path')
      .datum(series)
      .attr('clip-path', `url(#${clipId})`)
      .attr('fill', 'url(#timeline-gradient)')
      .attr('d', area);

    g.append('path')
      .datum(series)
      .attr('clip-path', `url(#${clipId})`)
      .attr('fill', 'none')
      .attr('stroke', '#8a2e1c')
      .attr('stroke-width', 1.5)
      .attr('d', line);

    g.append('g')
      .attr('class', 'axis-x')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).tickFormat(d3.format('d')).ticks(Math.min(12, series.length)));

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

    const annotLayer = g.append('g').attr('class', 'annotations').style('opacity', 0);
    annotLayer.transition().delay(900).duration(400).style('opacity', 1);

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

    const focus = g.append('g').style('display', 'none');
    focus.append('line')
      .attr('y1', 0).attr('y2', height)
      .attr('stroke', '#1c1b18').attr('stroke-width', 0.6)
      .attr('stroke-dasharray', '2,3');
    const focusDot = focus.append('circle')
      .attr('r', 4).attr('fill', '#1c1b18');

    g.append('rect')
      .attr('width', width).attr('height', height)
      .attr('fill', 'transparent')
      .on('mouseover', () => focus.style('display', null))
      .on('mouseout', () => {
        focus.style('display', 'none');
        tooltip.classList.remove('is-visible');
      })
      .on('mousemove', function (event) {
        const [mx] = d3.pointer(event, this);
        const year = Math.round(x.invert(mx));
        const point = series.find(d => d.year === year);
        if (!point) return;
        const cx = x(point.year);
        const cy = y(point.count);
        focus.select('line').attr('x1', cx).attr('x2', cx);
        focusDot.attr('cx', cx).attr('cy', cy);
        tooltip.classList.add('is-visible');
        tooltip.innerHTML = `<strong>${point.year}</strong><br>${point.count} incident${point.count === 1 ? '' : 's'}`;
        tooltip.style.left = (event.pageX + 14) + 'px';
        tooltip.style.top = (event.pageY - 28) + 'px';
      });
  }

  window.DataLoader.load()
    .then(data => {
      render(data);
      window.DataLoader.onFilterChange(() => render(data));
      let resizeTimer;
      window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => render(data), 150);
      });
    })
    .catch(() => {
      container.innerHTML = `
        <div class="loading">
          Could not load data. Please run a local server
          (<code>python3 -m http.server 8000</code>).
        </div>`;
    });
})();
