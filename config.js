// config.js
window.APP_CONFIG = {
  CHAIN_ID_DEC: 56,
  CHAIN_ID_HEX: "0x38",
  CHAIN_NAME: "BSC Mainnet",
  RPC_URL: "https://bsc-dataseed.binance.org/",
  BLOCK_EXPLORER: "https://bscscan.com",

  // Contracts (CoreV4 + VaultV5)
  CORE:  "0xcE4FFd6AfD8C10c533AEc7455E2e83750b8D1659",
  VAULT: "0x12537D70BC4F7F9dAc1c65116B78Ecd89682A4d3",

  // Tokens
  USDT: "0x55d398326f99059fF775485246999027B3197955",
  DF:   "0x36579d7eC4b29e875E3eC21A55F71C822E03A992",

  // UI base url (ใช้ทำ referral link)
  BASE_URL: "https://jin1963.github.io/BW-365V5/",

  // Commission caps (USDT) by packageId (1..3)
  CAPS_USDT: {
    1: "365",
    2: "3650",
    3: "36500",
  },

  // seconds
  DAY: 86400,
};
