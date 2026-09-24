// Site-wide settings. After deploying the AI relay (see relay/README.md), paste its URL below so
// every visitor gets AI writing without needing their own key. Leave it empty to turn that off.
window.REVIEW_SPRINT_CONFIG = {
  relayUrl: 'https://review-sprint-ai.skaterdav21.workers.dev',
  // Which provider the relay has a key for: 'gemini' (recommended, also enables link lookup) or 'groq'.
  relayProvider: 'gemini'
};
