/* ===================================================================
   viz-deployers.js — Top organizations named in the record
   Horizontal animated bar chart, filter-reactive.
   =================================================================== */

(function () {
  const container = document.getElementById('chart-deployers');
  if (!container) return;
  const tooltip = document.getElementById('tooltip');

  // Pretty-print deployer keys: "openai" -> "OpenAI", "x-ai" -> "xAI"
  const NAME_OVERRIDES = {
    'openai': 'OpenAI',
    'xai': 'xAI',
    'youtube': 'YouTube',
    'tiktok': 'TikTok',
    'us-government': 'U.S. Government',
    'uk-government': 'U.K. Government',
  };
  function prettify(key) {
    if (NAME_OVERRIDES[key]) return NAME_OVERRIDES[key];
    return key.split('-')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  function render(data) {
    container.innerHTML = '';
    const filtered = window.DataLoader.applyFilters(data);

    // Aggregate counts, filtering out "unknown-*" buckets to surface real organizations.
    const all = filtered.flatMap(d => d['Alleged deployer of AI system'] || []);
    const counts = d3.rollups(
      all.filter(name => name && !name.startsWith('unknown')),
      v => v.length,
      d => d
    )
      .map(([name, count]) => ({ name: prettify(name), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);

    if (counts.length === 0) {
      container.innerHTML = '<div class="loading">No deployers match current filters.</div>';
      return;
    }

    const margin = { top: 20, right: 56, bottom: 30, left: 130 };
    const W = container.clientWidth;
    const rowH = 28;
    const height = counts.length * rowH;
    const width = W - margin.left - margin.right;
    const totalH = height + margin.top + margin.bottom;

    const svg = d3.select(container)
      .append('svg')
      .attr('width', W)
      .attr('height', totalH)
      .attr('viewBox', `0 0 ${W} ${totalH}`);

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3.scaleLinear()
      .domain([0, d3.max(counts, d => d.count)])
      .range([0, width]);

    const y = d3.scaleBand()
      .domain(counts.map(d => d.name))
      .range([0, height])
      .padding(0.28);

    // Vertical gridlines (subtle, behind bars)
    const ticks = x.ticks(4).slice(1);
    g.append('g')
      .selectAll('line')
      .data(ticks)
      .enter()
      .append('line')
      .attr('x1', d => x(d)).attr('x2', d => x(d))
      .attr('y1', 0).attr('y2', height)
      .attr('stroke', '#ddd6c1')
      .attr('stroke-width', 0.5);

    // Tick labels at top
    g.append('g')
      .attr('class', 'tick-labels')
      .selectAll('text')
      .data(ticks)
      .enter()
      .append('text')
      .attr('x', d => x(d)).attr('y', -8)
      .attr('text-anchor', 'middle')
      .style('font-family', 'JetBrains Mono, monospace')
      .style('font-size', '10px')
      .style('fill', '#8a877c')
      .text(d => d);

    // Bar background (light track so empty space is intentional)
    g.selectAll('.bar-bg')
      .data(counts)
      .enter()
      .append('rect')
      .attr('class', 'bar-bg')
      .attr('x', 0).attr('y', d => y(d.name))
      .attr('width', width).attr('height', y.bandwidth())
      .attr('fill', '#ebe5d4').attr('opacity', 0.5);

    // Bars
    const bars = g.selectAll('.bar')
      .data(counts)
      .enter()
      .append('rect')
      .attr('class', 'bar-deployer')
      .attr('x', 0).attr('y', d => y(d.name))
      .attr('height', y.bandwidth())
      .attr('width', 0)
      .attr('fill', '#b8442b');

    bars.transition()
      .duration(900)
      .delay((d, i) => i * 50)
      .ease(d3.easeCubicOut)
      .attr('width', d => x(d.count));

    // Hover handlers on full row (so the user can mouse over the label too)
    g.selectAll('.row-hit')
      .data(counts)
      .enter()
      .append('rect')
      .attr('x', -margin.left).attr('y', d => y(d.name))
      .attr('width', W).attr('height', y.bandwidth())
      .attr('fill', 'transparent')
      .style('cursor', 'default')
      .on('mousemove', function (event, d) {
        tooltip.classList.add('is-visible');
        const pct = ((d.count / counts.reduce((s, x) => s + x.count, 0)) * 100).toFixed(1);
        tooltip.innerHTML = `<strong>${d.name}</strong><br>${d.count} incidents · ${pct}% of top 12`;
        tooltip.style.left = (event.pageX + 14) + 'px';
        tooltip.style.top = (event.pageY - 28) + 'px';
      })
      .on('mouseleave', () => tooltip.classList.remove('is-visible'));

    // Deployer name labels (left)
    g.selectAll('.name')
      .data(counts)
      .enter()
      .append('text')
      .attr('x', -10).attr('y', d => y(d.name) + y.bandwidth() / 2)
      .attr('dy', '0.32em')
      .attr('text-anchor', 'end')
      .style('font-family', 'Fraunces, serif')
      .style('font-size', '13px')
      .style('fill', '#1c1b18')
      .text(d => d.name);

    // Count labels (right of bar)
    g.selectAll('.count')
      .data(counts)
      .enter()
      .append('text')
      .attr('x', d => x(d.count) + 8)
      .attr('y', d => y(d.name) + y.bandwidth() / 2)
      .attr('dy', '0.32em')
      .style('font-family', 'JetBrains Mono, monospace')
      .style('font-size', '11px')
      .style('fill', '#5a574e')
      .style('opacity', 0)
      .text(d => d.count)
      .transition()
      .delay((d, i) => 600 + i * 50)
      .duration(300)
      .style('opacity', 1);
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
        <div class="loading">Could not load data.</div>`;
    });
})();
