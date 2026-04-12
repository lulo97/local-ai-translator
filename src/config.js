// ─────────────────────────────────────────────
//  LOCAL AI TRANSLATOR — CONFIG
//  Edit these values to match your llama.cpp setup
// ─────────────────────────────────────────────

const CONFIG = {
  // Port your llama-server is running on
  PORT: 8080,

  // Full endpoint (change port above, or override here)
  get ENDPOINT() {
    return `http://localhost:${this.PORT}/v1/chat/completions`;
  },

  // Model name sent to llama.cpp — "auto" omits the field (recommended for local)
  MODEL: "auto",

  // Target language for all translations
  TARGET_LANGUAGE: "Vietnamese",

  // Debounce delay (ms) before the floating icon appears
  DEBOUNCE_MS: 300,

  // Max tokens for word explain vs paragraph translate
  MAX_TOKENS_TRANSLATE: 300,
  MAX_TOKENS_SUMMARIZE: 600,
};
