/* ===================================================================
   categories.js — shared incident category taxonomy
   =================================================================== */

window.IncidentCategories = (function () {
  const TAXONOMY = {
    bias: {
      label: 'Bias & discrimination',
      color: '#c45c3a',
    },
    autonomy: {
      label: 'Autonomous systems',
      color: '#5a7a8c',
    },
    misinformation: {
      label: 'Misinformation & media',
      color: '#8b6b4a',
    },
    privacy: {
      label: 'Privacy & surveillance',
      color: '#6b5b8a',
    },
    healthcare: {
      label: 'Healthcare & welfare',
      color: '#4a7a5c',
    },
    moderation: {
      label: 'Content moderation & safety',
      color: '#9a6b3a',
    },
    other: {
      label: 'Other',
      color: '#8a877c',
    },
  };

  const ORDER = [
    'bias',
    'autonomy',
    'misinformation',
    'privacy',
    'healthcare',
    'moderation',
    'other',
  ];

  function getCategory(incident) {
    const id = incident && incident.category;
    return ORDER.includes(id) ? id : 'other';
  }

  function getLabel(id) {
    return (TAXONOMY[id] || TAXONOMY.other).label;
  }

  function getColor(id) {
    return (TAXONOMY[id] || TAXONOMY.other).color;
  }

  return {
    TAXONOMY,
    ORDER,
    getCategory,
    getLabel,
    getColor,
  };
})();
