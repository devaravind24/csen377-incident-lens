/* ===================================================================
   viz-deployers.js — Top organizations named in the record
   Horizontal stacked bar chart by category.
   =================================================================== */

(function () {
  const container = document.getElementById('chart-deployers');
  if (!container) return;
  const tooltip = document.getElementById('tooltip');
  const Cat = window.IncidentCategories;

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

  function collectDeployerRows(filtered) {
    const rows = [];
    filtered.forEach(inc => {
      const category = Cat.getCategory(inc);
      (inc['Alleged deployer of AI system'] || []).forEach(raw => {
        if (!raw || String(raw).startsWith('unknown')) return;
        rows.push({
          deployerKey: raw,
          deployer: prettify(raw),
          category,
        });
      });
    });
    return rows;
  }

  function render(data) {
    container.innerHTML = '';
    const filtered = window.DataLoader.applyFilters(data);
    const categoryFilter = window.DataLoader.filters.category;
    const keys = categoryFilter ? [categoryFilter] : Cat.ORDER;

    const deployerRows = collectDeployerRows(filtered);
    if (deployerRows.length === 0) {
      container.innerHTML = '<div class="loading">No deployers match current filters.</div>';
      return;
    }

    const totals = d3.rollup(
      deployerRows,
      v => v.length,
      d => d.deployer
    );
    const topNames = [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([name]) => name);

    const byDeployerCat = d3.rollup(
      deployerRows.filter(d => topNames.includes(d.deployer)),
      v => v.length,
      d => d.deployer,
      d => d.category
    );

    const chartData = topNames.map(name => {
      const row = { name, total: totals.get(name) || 0 };
      keys.forEach(k => {
        row[k] = (byDeployerCat.get(name) && byDeployerCat.get(name).get(k)) || 0;
      });
      return row;
    });

    const margin = { top: 20, right: 56, bottom: 30, left: 130 };
    const W = container.clientWidth;
    const rowH = 28;
    const height = chartData.length * rowH;
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
      .domain([0, d3.max(chartData, d => d.total)])
      .range([0, width]);

    const y = d3.scaleBand()
      .domain(chartData.map(d => d.name))
      .range([0, height])
      .padding(0.28);

    const stack = d3.stack().keys(keys);
    const layers = stack(chartData);

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

    g.selectAll('.bar-bg')
      .data(chartData)
      .enter()
      .append('rect')
      .attr('class', 'bar-bg')
      .attr('x', 0).attr('y', d => y(d.name))
      .attr('width', width).attr('height', y.bandwidth())
      .attr('fill', '#ebe5d4').attr('opacity', 0.5);

    const layerGroups = g.selectAll('.stack-row')
      .data(layers)
      .enter()
      .append('g')
      .attr('class', 'stack-row')
      .attr('fill', d => Cat.getColor(d.key));

    layerGroups.selectAll('rect')
      .data(d => d)
      .enter()
      .append('rect')
      .attr('y', d => y(d.data.name))
      .attr('x', d => x(d[0]))
      .attr('width', d => Math.max(0, x(d[1]) - x(d[0])))
      .attr('height', y.bandwidth())
      .attr('opacity', 0.88)
      .on('mousemove', function (event, d) {
        const cat = d3.select(this.parentNode).datum().key;
        const count = d.data[cat];
        if (!count) return;
        tooltip.classList.add('is-visible');
        const pct = ((count / d.data.total) * 100).toFixed(1);
        tooltip.innerHTML =
          `<strong>${d.data.name}</strong><br>` +
          `${Cat.getLabel(cat)}: ${count}<br>` +
          `${pct}% of bar · ${d.data.total} total`;
        tooltip.style.left = (event.pageX + 14) + 'px';
        tooltip.style.top = (event.pageY - 28) + 'px';
      })
      .on('mouseleave', () => tooltip.classList.remove('is-visible'));

    g.selectAll('.row-hit')
      .data(chartData)
      .enter()
      .append('rect')
      .attr('x', -margin.left).attr('y', d => y(d.name))
      .attr('width', W).attr('height', y.bandwidth())
      .attr('fill', 'transparent')
      .style('pointer-events', 'none');

    g.selectAll('.name')
      .data(chartData)
      .enter()
      .append('text')
      .attr('x', -10).attr('y', d => y(d.name) + y.bandwidth() / 2)
      .attr('dy', '0.32em')
      .attr('text-anchor', 'end')
      .style('font-family', 'Fraunces, serif')
      .style('font-size', '13px')
      .style('fill', '#1c1b18')
      .text(d => d.name);

    g.selectAll('.count')
      .data(chartData)
      .enter()
      .append('text')
      .attr('x', d => x(d.total) + 8)
      .attr('y', d => y(d.name) + y.bandwidth() / 2)
      .attr('dy', '0.32em')
      .style('font-family', 'JetBrains Mono, monospace')
      .style('font-size', '11px')
      .style('fill', '#5a574e')
      .text(d => d.total);
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
