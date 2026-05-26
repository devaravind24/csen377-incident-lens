/* ===================================================================
   categories.js — Incident Lens harm taxonomy (7 categories)
   =================================================================== */

window.IncidentCategories = (function () {
  const TAXONOMY = {
    discrimination: {
      label: 'Discrimination & fairness',
      color: '#c45c3a',
    },
    privacy: {
      label: 'Privacy & surveillance',
      color: '#6b5b8a',
    },
    misinformation: {
      label: 'Misinformation & media',
      color: '#8b6b4a',
    },
    safety: {
      label: 'Safety & autonomous systems',
      color: '#5a7a8c',
    },
    economic: {
      label: 'Economic & social systems',
      color: '#7a6b4a',
    },
    harmful_content: {
      label: 'Harmful content & platforms',
      color: '#9a6b3a',
    },
    malicious: {
      label: 'Malicious & intentional misuse',
      color: '#8a2e1c',
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

  function getColor(id) {
    return (TAXONOMY[id] || TAXONOMY[DEFAULT_ID]).color;
  }

  return {
    TAXONOMY,
    ORDER,
    DEFAULT_ID,
    getCategory,
    getLabel,
    getColor,
  };
})();
