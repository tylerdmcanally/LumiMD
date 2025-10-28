export const APP_CONFIG = {
  APP_NAME: 'LumiMD',
  VERSION: '1.0.0',
  SUPPORT_EMAIL: 'support@lumimd.app',
  PRIVACY_POLICY_URL: 'https://lumimd.app/privacy',
  TERMS_OF_SERVICE_URL: 'https://lumimd.app/terms',

  API: {
    OPENAI_MODEL: 'gpt-4o-mini', // GPT-4 mini - better reasoning, still fast and affordable
    MAX_TOKENS: 1000, // Increased for better responses
    TEMPERATURE: 0.4, // Balanced temperature for medical accuracy with some variety
    TIMEOUT: 60000, // 60 seconds - allow time for API response
  },

  TRIAGE: {
    EMERGENCY_KEYWORDS: [
      'chest pain', 'difficulty breathing', 'severe bleeding', 'unconscious',
      'severe head injury', 'stroke symptoms', 'seizure', 'allergic reaction',
      'severe burns', 'poisoning', 'overdose', 'suicidal thoughts'
    ],
    HIGH_RISK_SYMPTOMS: [
      'severe pain', 'high fever', 'persistent vomiting', 'severe diarrhea',
      'severe headache', 'vision changes', 'difficulty swallowing'
    ],
    CONFIDENCE_THRESHOLD: 0.7, // Minimum confidence for recommendations
  },

  RECORDING: {
    MAX_DURATION: 7200, // 2 hours in seconds
    AUDIO_QUALITY: 'high',
    COMPRESSION_ENABLED: true,
    AUTO_STOP_SILENCE: 300, // 5 minutes of silence
  },

  INSURANCE: {
    VERIFICATION_CACHE_DURATION: 24 * 60 * 60 * 1000, // 24 hours
    SUPPORTED_PROVIDERS: [
      'Aetna', 'Anthem', 'BlueCross BlueShield', 'Cigna', 'Humana',
      'Kaiser Permanente', 'UnitedHealthcare', 'Medicare', 'Medicaid'
    ],
  },
};

export const COLORS = {
  PRIMARY: '#1B1E2E', // Deep ink
  SECONDARY: '#445066', // Modern slate
  ACCENT: '#F5C542', // Vibrant highlight
  SUCCESS: '#2E9C6A',
  WARNING: '#F1A355',
  DANGER: '#E45C5C',
  INFO: '#3A86FF',

  ERROR: '#E45C5C',
  EMERGENCY: '#C14953',
  URGENT: '#F5C542',
  ROUTINE: '#4A7A7C',

  WHITE: '#FFFFFF',
  BLACK: '#171717',
  GRAY: {
    50: '#F8F4EA',
    100: '#F1E9D7',
    200: '#E3D9C1',
    300: '#CEC2A5',
    400: '#AFA287',
    500: '#8C8068',
    600: '#5F5844',
    700: '#403B2F',
    800: '#2C281F',
    900: '#1C1A16',
  },

  BACKGROUND: '#F6F1E5',
  CARD_BACKGROUND: '#FFFFFF',
  SECTION_BACKGROUND: '#ECE4D4',

  HEALTH: {
    SOFT_GOLD: '#F8D46A',
    PALE_MINT: '#E1F2E7',
    BLUSH: '#F9E0DA',
    WARM_SAND: '#EFE4CE',
  },
};

export const FONTS = {
  THIN: 'Manrope_300Light',
  LIGHT: 'Manrope_300Light',
  REGULAR: 'Manrope_400Regular',
  MEDIUM: 'Manrope_500Medium',
  SEMIBOLD: 'Manrope_600SemiBold',
  BOLD: 'Manrope_700Bold',
  EXTRABOLD: 'Manrope_700Bold',
};

export const SIZES = {
  // Modern Spacing Scale
  XS: 6,
  SM: 10,
  MD: 18,
  LG: 26,
  XL: 36,
  XXL: 52,
  XXXL: 72,

  // Component Sizes
  PADDING: 24,
  CARD_PADDING: 26,
  SECTION_PADDING: 36,
  MARGIN: 18,
  BORDER_RADIUS: 18,
  CARD_BORDER_RADIUS: 24,
  BUTTON_HEIGHT: 58,
  INPUT_HEIGHT: 54,
  HEADER_HEIGHT: 88,
  TAB_HEIGHT: 80,

  // Modern Typography Scale
  FONT: {
    XS: 12,
    SM: 14,
    MD: 16,
    LG: 18,
    XL: 20,
    XXL: 24,
    TITLE: 32,               // Larger titles
    HEADING: 40,             // More prominent headings
    DISPLAY: 48,             // For hero text
  },

  // Modern shadows and elevation
  SHADOW: {
    LIGHT: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 2,
    },
    MEDIUM: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 12,
      elevation: 4,
    },
    STRONG: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.15,
      shadowRadius: 20,
      elevation: 8,
    }
  }
};

export const TRIAGE_LEVELS = {
  EMERGENCY: {
    level: 'emergency',
    color: COLORS.EMERGENCY,
    icon: '!!',
    title: 'Emergency Care',
    subtitle: 'Go to ER immediately or call 911',
    timeframe: 'Immediate',
  },
  URGENT_CARE: {
    level: 'urgent_care',
    color: COLORS.URGENT,
    icon: '!',
    title: 'Urgent Care',
    subtitle: 'Seek care within 24 hours',
    timeframe: 'Within 24 hours',
  },
  PRIMARY_CARE: {
    level: 'primary_care',
    color: COLORS.PRIMARY,
    icon: '+',
    title: 'Primary Care',
    subtitle: 'Schedule with your doctor',
    timeframe: 'Within 1-3 days',
  },
  TELEHEALTH: {
    level: 'telehealth',
    color: COLORS.INFO,
    icon: '○',
    title: 'Telehealth',
    subtitle: 'Virtual consultation available',
    timeframe: 'Within 24 hours',
  },
  SELF_CARE: {
    level: 'self_care',
    color: COLORS.SUCCESS,
    icon: '◯',
    title: 'Self Care',
    subtitle: 'Monitor at home',
    timeframe: 'As needed',
  },
};

export const MEDICAL_DISCLAIMERS = {
  MAIN_DISCLAIMER: `
IMPORTANT MEDICAL DISCLAIMER

This application provides educational information and decision support tools only. It is NOT intended to:

• Replace professional medical advice, diagnosis, or treatment
• Provide emergency medical services
• Create a doctor-patient relationship
• Guarantee the accuracy of health assessments

EMERGENCY SITUATIONS:
If you are experiencing a medical emergency, call 911 immediately or go to your nearest emergency room. Do not use this app for emergency situations.

ACCURACY LIMITATIONS:
AI-powered health assessments are tools to help guide your healthcare decisions but may not be 100% accurate. Always consult with qualified healthcare professionals for proper medical evaluation.

YOUR RESPONSIBILITY:
You are responsible for seeking appropriate medical care and following up with healthcare providers as recommended. Use this information to supplement, not replace, discussions with your doctor.

By using this app, you acknowledge these limitations and agree to use the information responsibly.
  `,

  TRIAGE_DISCLAIMER: `
This symptom assessment is for informational purposes only and should not replace professional medical evaluation. The recommendations provided are based on general medical guidelines and your responses, but may not account for all individual factors affecting your health.

Please seek professional medical attention if:
• You have any concerns about your symptoms
• Your condition worsens or doesn't improve
• You develop new or concerning symptoms
• You feel this assessment doesn't accurately reflect your situation
  `,

  RECORDING_DISCLAIMER: `
MEDICAL VISIT RECORDING CONSENT

By enabling visit recording, you understand and consent to:

• Audio recording of your medical appointments
• Secure, encrypted storage of recordings
• AI-powered transcription and summarization
• Automatic deletion after legal retention period

Your recordings are:
✓ Encrypted and HIPAA-compliant
✓ Only accessible to you and authorized providers
✓ Used solely for your healthcare documentation
✓ Never shared without your explicit consent

You may disable recording at any time in your settings.
  `,

  AI_DISCLAIMER: `
AI-POWERED FEATURES NOTICE

This app uses artificial intelligence to:
• Assess symptoms and provide care recommendations
• Generate appointment summaries and transcripts
• Suggest questions for your healthcare visits
• Provide health information and guidance

AI Limitations:
• May not capture all nuances of your condition
• Recommendations are based on general medical knowledge
• Cannot replace clinical judgment and examination
• May have biases or inaccuracies

Always verify AI-generated information with your healthcare provider.
  `
};

export const EMERGENCY_CONTACTS = {
  EMERGENCY: '911',
  POISON_CONTROL: '1-800-222-1222',
  SUICIDE_PREVENTION: '988',
  CRISIS_TEXT: 'Text HOME to 741741',
};

export const PROVIDER_SPECIALTIES = [
  'Family Medicine',
  'Internal Medicine',
  'Pediatrics',
  'Cardiology',
  'Dermatology',
  'Endocrinology',
  'Gastroenterology',
  'Neurology',
  'Orthopedics',
  'Psychiatry',
  'Pulmonology',
  'Rheumatology',
  'Urology',
  'Gynecology',
  'Oncology',
  'Ophthalmology',
  'ENT',
  'Emergency Medicine',
  'Urgent Care',
];

export const APPOINTMENT_TYPES = [
  { type: 'annual_physical', label: 'Annual Physical', duration: 60 },
  { type: 'follow_up', label: 'Follow-up Visit', duration: 30 },
  { type: 'new_patient', label: 'New Patient', duration: 60 },
  { type: 'consultation', label: 'Consultation', duration: 45 },
  { type: 'procedure', label: 'Procedure', duration: 90 },
  { type: 'telehealth', label: 'Telehealth', duration: 30 },
  { type: 'urgent', label: 'Urgent Visit', duration: 30 },
];
