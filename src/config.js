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

  // Model name sent to llama.cpp (any string is fine for local)
  MODEL: "auto",  // "auto" = omit field (recommended for local llama.cpp)

  // Target language for all translations
  TARGET_LANGUAGE: "Vietnamese",

  // Words threshold: selections BELOW this go to "translate" mode,
  // selections AT or ABOVE go to "summarize + vocab" mode
  DUAL_MODE_THRESHOLD: 30,

  // Debounce delay (ms) before the floating icon appears
  DEBOUNCE_MS: 300,

  // Max tokens for short translate vs long summarize
  MAX_TOKENS_TRANSLATE: 300,
  MAX_TOKENS_SUMMARIZE: 600,
};
