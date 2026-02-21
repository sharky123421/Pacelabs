/**
 * Onboarding questionnaire steps 1–11
 */
export const QUESTIONS = [
  {
    id: 'running_experience',
    question: 'How long have you been running?',
    skippable: false,
    type: 'cards',
    options: [
      'Less than 6 months',
      '6–12 months',
      '1–3 years',
      '3+ years',
    ],
  },
  {
    id: 'days_per_week',
    question: "How many days a week do you run?",
    skippable: false,
    type: 'cards',
    options: [
      '1–2 days',
      '3–4 days',
      '5–6 days',
      'Every day',
    ],
  },
  {
    id: 'weekly_distance',
    question: "What's your average weekly distance?",
    skippable: false,
    type: 'slider',
    min: 0,
    max: 150,
    unit: 'km',
    unitToggle: true,
  },
  {
    id: 'longest_run',
    question: "What's your longest run ever?",
    skippable: false,
    type: 'slider',
    min: 0,
    max: 100,
    unit: 'km',
    unitToggle: true,
  },
  {
    id: 'easy_pace',
    question: 'Do you know your easy pace?',
    subtitle: 'The pace where you can hold a full conversation',
    skippable: true,
    type: 'pace',
    unitToggle: true,
  },
  {
    id: 'race_times',
    question: 'Any race times we should know about?',
    skippable: true,
    type: 'race_times',
    rows: ['5K', '10K', 'Half Marathon', 'Marathon'],
  },
  {
    id: 'recent_training',
    question: "How's your recent training been?",
    skippable: false,
    type: 'cards',
    options: [
      'Very consistent',
      'Somewhat consistent',
      'Inconsistent',
      'Just getting back into it',
    ],
  },
  {
    id: 'injuries',
    question: 'Any injuries in the last 12 months?',
    skippable: false,
    type: 'cards',
    options: [
      'None',
      'Minor (didn\'t miss training)',
      'Moderate (missed some weeks)',
      'Major (long time off)',
    ],
  },
  {
    id: 'goal',
    question: "What's your current goal?",
    skippable: false,
    type: 'grid',
    options: [
      '5K', '10K', 'Half Marathon',
      'Marathon', 'Ultra', 'General fitness',
    ],
  },
  {
    id: 'target_race_date',
    question: 'Do you have a target race date?',
    skippable: false,
    type: 'date',
    showIf: (answers) => answers.goal && !['General fitness'].includes(answers.goal),
    noDateOption: true,
  },
  {
    id: 'goal_time',
    question: 'Do you have a goal time?',
    skippable: false,
    type: 'goal_time',
    showIf: (answers) => answers.goal && !['General fitness'].includes(answers.goal),
    justFinish: true,
    showGetPR: (answers) => !!answers.race_times && Object.values(answers.race_times).some(Boolean),
  },
];

export const TOTAL_QUESTIONS = 11;
