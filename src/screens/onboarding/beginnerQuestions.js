export const BEGINNER_QUESTIONS = [
  {
    id: 'beginner_experience',
    question: 'Have you run before?',
    skippable: false,
    type: 'cards',
    options: [
      'Never \u2014 complete beginner',
      'A little, but very casual',
      'I used to run but stopped',
      'I walk a lot but want to start running',
    ],
  },
  {
    id: 'beginner_motivation',
    question: "What's your main reason for starting?",
    skippable: false,
    type: 'grid',
    options: [
      'Get healthier',
      'Lose weight',
      'Reduce stress',
      'Build a new habit',
      'Run my first 5K',
      'Just try something new',
    ],
  },
  {
    id: 'beginner_fitness',
    question: 'How would you describe your current fitness?',
    skippable: false,
    type: 'cards',
    options: [
      'Very low \u2014 I get tired walking up stairs',
      'Low \u2014 I\u2019m not very active',
      'Moderate \u2014 I walk regularly',
      'Decent \u2014 I do some exercise',
    ],
  },
  {
    id: 'beginner_days',
    question: 'How many days per week can you commit?',
    subtitle: '3 days is perfect for beginners',
    skippable: false,
    type: 'cards',
    options: [
      '2 days',
      '3 days',
      '4 days',
    ],
  },
  {
    id: 'beginner_limitations',
    question: 'Do you have any physical limitations?',
    skippable: false,
    type: 'grid',
    options: [
      'None \u2014 I\u2019m fine',
      'Bad knees',
      'Bad back',
      'Overweight',
      'Asthma',
      'Other',
    ],
  },
  {
    id: 'beginner_goal',
    question: "What's your first goal?",
    skippable: false,
    type: 'cards',
    options: [
      'Run for 5 minutes without stopping',
      'Run my first 5K',
      'Build a running habit',
      'Just get moving and see what happens',
    ],
  },
];

export const TOTAL_BEGINNER_QUESTIONS = 6;
