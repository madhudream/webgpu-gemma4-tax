// ─────────────────────────────────────────────────────────────────────────────
// datasets.js — pre-seeded mock datasets the agent can request via tools
// ─────────────────────────────────────────────────────────────────────────────

export const DATASETS = {
  'monthly-sales-2024': {
    description: 'Monthly product sales for FY2024 in USD thousands.',
    schema: { labels: 'month name', values: 'sales in $k' },
    data: {
      labels: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
      values: [42, 51, 48, 63, 70, 82, 79, 88, 95, 110, 124, 138]
    }
  },

  'weekly-signups': {
    description: 'New user signups per week for the last 8 weeks.',
    schema: { labels: 'week label', values: 'signups count' },
    data: {
      labels: ['W1','W2','W3','W4','W5','W6','W7','W8'],
      values: [120, 145, 132, 168, 190, 175, 220, 245]
    }
  },

  'expense-categories': {
    description: 'Q1 2024 expense breakdown by category.',
    schema: { labels: 'category', values: 'amount in $k' },
    data: {
      labels: ['Salaries','Cloud','Marketing','Travel','Other'],
      values: [320, 78, 45, 22, 18]
    }
  },

  'kpi-mrr': {
    description: 'Headline MRR figure with month-over-month delta.',
    schema: { value: 'MRR in dollars', delta: 'mom change' },
    data: {
      label: 'Monthly Recurring Revenue',
      value: '$184,250',
      delta: '+12.4% vs last month',
      tone:  'good'
    }
  }
};

export function listDatasets() {
  return Object.entries(DATASETS).map(([id, meta]) => ({
    id,
    description: meta.description,
    schema: meta.schema
  }));
}

export function getDataset(id) {
  if (!(id in DATASETS)) throw new Error(`unknown dataset: ${id}`);
  return DATASETS[id].data;
}
