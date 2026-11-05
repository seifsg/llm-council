// One line-icon set, so marks stay crisp and identical on every OS. Generic shapes, not vendor logos.
const svg = (body) => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const NATURE_ICONS = {
  contrarian: '<circle cx="8" cy="8" r="4.8"/><path d="M8 1v3.4M8 11.6V15M1 8h3.4M11.6 8H15"/>',
  believer: '<path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z"/>',
  neutral: '<path d="M8 2v12M4.5 14h7M3 4.5h10M3 4.5L1.5 9h3zM13 4.5L11.5 9h3z"/>',
  confused: '<circle cx="8" cy="8" r="6.2"/><path d="M6.2 6.3a1.9 1.9 0 1 1 2.9 1.6c-.7.5-1.1.9-1.1 1.6"/><path d="M8 11.7v.01"/>',
  "first-principles": '<circle cx="7" cy="7" r="4.7"/><path d="M10.5 10.5l4 4"/>',
  executor: '<path d="M9 1.5L3 9h4.5L7 14.5 13 7H8.5z"/>',
};
const KNOWN = Object.keys(NATURE_ICONS);
const icon = (nature) => svg(NATURE_ICONS[nature] || '<circle cx="8" cy="8" r="4"/>');

const UI = {
  chev: svg('<path d="M6 3.5L10.5 8 6 12.5"/>'),
  flag: svg('<path d="M3.5 14.5v-13M3.5 2.5h9.5L10.8 5.8 13 9H3.5"/>'),
  info: svg('<circle cx="8" cy="8" r="6.2"/><path d="M8 7.4v3.6M8 5v.01"/>'),
  close: svg('<path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/>'),
  filter: svg('<path d="M2 3h12L9.5 8.5V13l-3-1.5v-3z"/>'),
  theme: svg('<circle cx="8" cy="8" r="6.2"/><path d="M8 1.8a6.2 6.2 0 0 1 0 12.4z" fill="currentColor"/>'),
  fork: svg('<circle cx="4" cy="3" r="1.5"/><circle cx="12" cy="3" r="1.5"/><circle cx="8" cy="13" r="1.5"/><path d="M4 4.5c0 3 4 3 4 7M12 4.5c0 3-4 3-4 7"/>'),
  diamond: svg('<path d="M8 2l6 6-6 6-6-6z"/>'),
  pain: svg('<path d="M8 1.5c.5 3-3.5 4.5-3.5 8a3.5 3.5 0 0 0 7 0c0-1.5-.8-2.5-1.5-3.3C10 7.5 9 8 8.5 7.5 8 7 8.8 4 8 1.5z"/>'),
  leave: svg('<path d="M9.5 2.5h-6v11h6M7 8h7.5M12 5.5L14.5 8 12 10.5"/>'),
  spark: svg('<path d="M8 1.5l1.6 4.9L14.5 8l-4.9 1.6L8 14.5l-1.6-4.9L1.5 8l4.9-1.6z"/>'),
  globe: svg('<circle cx="8" cy="8" r="6.2"/><path d="M1.8 8h12.4M8 1.8c2 2 2.8 4 2.8 6.2S10 12.2 8 14.2C6 12.2 5.2 10.2 5.2 8S6 3.8 8 1.8z"/>'),
  alert: svg('<path d="M8 2L1.5 13.5h13zM8 6.5v3.5M8 12v.01"/>'),
};

const LLM_SHAPES = {
  claude: '<path d="M8 1.5v13M1.5 8h13M3.4 3.4l9.2 9.2M12.6 3.4l-9.2 9.2"/>',
  codex: '<circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="2"/>',
  gemini: '<path d="M8 1.5c.6 3.8 2.7 5.9 6.5 6.5-3.8.6-5.9 2.7-6.5 6.5-.6-3.8-2.7-5.9-6.5-6.5 3.8-.6 5.9-2.7 6.5-6.5z"/>',
  grok: '<path d="M3 3l10 10M13 3L3 13"/>',
  mistral: '<path d="M8 2.5l6 11H2z"/>',
  deepseek: '<path d="M8 2l6 6-6 6-6-6z"/>',
  qwen: '<rect x="3" y="3" width="10" height="10" rx="2"/>',
  llama: '<path d="M5 14V6l-1.5-4M11 14V6l1.5-4M5 6h6"/>',
};
