/**
 * Message templates, Lagos Life / Àrokò style: pre-written phrases grouped
 * by intent. Keeps first contact safe, fast, and free of explicit content.
 * Clients pick a template instead of typing; providers can also quick-reply.
 */

export interface TemplateGroup {
  id: string;
  label: string;
  phrases: string[];
}

export const CHAT_TEMPLATES: TemplateGroup[] = [
  {
    id: 'greet',
    label: 'Greetings',
    phrases: [
      'Hi there',
      'Hello, how are you?',
      'Good evening, are you free to chat?',
    ],
  },
  {
    id: 'booking',
    label: 'Booking',
    phrases: [
      'Are you available tonight?',
      'Can we meet tomorrow?',
      'What is your rate for short time?',
      'What is your overnight rate?',
      'Are your rates negotiable?',
    ],
  },
  {
    id: 'logistics',
    label: 'Logistics',
    phrases: [
      'Where are you located?',
      'Do you do outcalls?',
      'Do you host (incall)?',
      'How long are you available today?',
      'Can we do a video call first?',
    ],
  },
  {
    id: 'confirm',
    label: 'Confirming',
    phrases: [
      'I have paid the connection fee',
      'I am on my way',
      'I have arrived',
      'Thank you, see you soon',
    ],
  },
];

export const PROVIDER_QUICK_REPLIES: string[] = [
  'Yes, I am available',
  'Sorry, I am booked right now',
  'My rates are on my profile',
  'Yes, my rates are negotiable',
  'Please send your location',
  'Give me 10 minutes',
];
