/* ===================================================================
   categories.js — Incident Lens harm taxonomy (7 categories)
   =================================================================== */

window.IncidentCategories = (function () {
  /* Hues spread for stacked-chart legibility on --paper (#f4efe4) */
  const TAXONOMY = {
    discrimination: {
      label: 'Discrimination & fairness',
      tooltipLabel: 'Discrimination',
      color: '#c94a36',
    },
    privacy: {
      label: 'Privacy & surveillance',
      tooltipLabel: 'Privacy',
      color: '#6a5c9e',
    },
    misinformation: {
      label: 'Misinformation & media',
      tooltipLabel: 'Misinformation',
      color: '#b8922a',
    },
    safety: {
      label: 'Safety & autonomous systems',
      tooltipLabel: 'Safety & autonomy',
      color: '#2f7d7d',
    },
    economic: {
      label: 'Economic & social systems',
      tooltipLabel: 'Economic & social',
      color: '#4a8c58',
    },
    harmful_content: {
      label: 'Harmful content & platforms',
      tooltipLabel: 'Harmful content',
      color: '#d47b2c',
    },
    malicious: {
      label: 'Malicious & intentional misuse',
      tooltipLabel: 'Malicious misuse',
      color: '#5c3548',
    },
  };

  const ORDER = [
    'discrimination',
    'privacy',
    'misinformation',
    'safety',
    'economic',
    'harmful_content',
    'malicious',
  ];

  const DEFAULT_ID = 'economic';

  function getCategory(incident) {
    const id = incident && incident.category;
    return ORDER.includes(id) ? id : DEFAULT_ID;
  }

  function getLabel(id) {
    return (TAXONOMY[id] || TAXONOMY[DEFAULT_ID]).label;
  }

  function getTooltipLabel(id) {
    const t = TAXONOMY[id] || TAXONOMY[DEFAULT_ID];
    return t.tooltipLabel || t.label;
  }

  function getColor(id) {
    return (TAXONOMY[id] || TAXONOMY[DEFAULT_ID]).color;
  }

  return {
    TAXONOMY,
    ORDER,
    DEFAULT_ID,
    getCategory,
    getLabel,
    getTooltipLabel,
    getColor,
  };
})();
