/* ===================================================================
   viz-harms.js — VIZ 03 (template for teammate)

   Categories of harm — recommended as a treemap or donut.
   Uses ../data/classifications_CSETv1.csv (not incidents.csv).

   When ready, uncomment the <section id="harms"> block AND the
   <script> tag in pages/dashboard.html.
   =================================================================== */

(function () {
  const container = document.getElementById('chart-harms');
  if (!container) return;
  const tooltip = document.getElementById('tooltip');

  // STEP 1 — Load the classifications CSV.
  // d3.csv('../data/classifications_CSETv1.csv').then(rows => {
  //   ...
  // });

  // STEP 2 — Pick a harm-related column (inspect the CSV headers first).
  //   Common candidates: "Harm Type", "Sector of Deployment", "AI Tangible Harm Level Notes".

  // STEP 3 — Group, count, and render as a treemap (d3.treemap) or
  //   donut (d3.pie + d3.arc).

  // STEP 4 — Add hover tooltips using the shared #tooltip element.
})();
