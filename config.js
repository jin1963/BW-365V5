window.APP_CONFIG = {
  // ===== Network =====
  CHAIN_ID: 56, // BSC Mainnet

  // ===== Contracts =====
  CORE: "0xcE4FFd6AfD8C10c533AEc7455E2e83750b8D1659",
  VAULT: "0x12537D70BC4F7F9dAc1c65116B78Ecd89682A4d3",

  USDT_DECIMALS: 18,

  // ===== Commission CAP by Package (USDT only) =====
  CAP_BY_PKG: {
    1: 365,     // Small
    2: 3650,    // Medium
    3: 36500    // Large
  },

  // ===== VaultV5 ABI =====
  VAULT_ABI: [
    {
      "inputs":[
        {"internalType":"address","name":"usdt","type":"address"},
        {"internalType":"address","name":"df","type":"address"}
      ],
      "stateMutability":"nonpayable",
      "type":"constructor"
    },

    // ===== EVENTS =====
    {
      "anonymous":false,
      "inputs":[
        {"indexed":true,"internalType":"address","name":"user","type":"address"},
        {"indexed":false,"internalType":"uint256","name":"usdtAmt","type":"uint256"},
        {"indexed":false,"internalType":"uint256","name":"dfAmt","type":"uint256"}
      ],
      "name":"Claimed",
      "type":"event"
    },
    {
      "anonymous":false,
      "inputs":[
        {"indexed":true,"internalType":"address","name":"to","type":"address"},
        {"indexed":false,"internalType":"uint256","name":"usdtAmt","type":"uint256"},
        {"indexed":false,"internalType":"uint256","name":"dfAmt","type":"uint256"}
      ],
      "name":"Credited",
      "type":"event"
    },
    {
      "anonymous":false,
      "inputs":[
        {"indexed":true,"internalType":"address","name":"user","type":"address"},
        {"indexed":false,"internalType":"uint256","name":"usdtExpired","type":"uint256"}
      ],
      "name":"ExpiredLocked",
      "type":"event"
    },
    {
      "anonymous":false,
      "inputs":[
        {"indexed":true,"internalType":"address","name":"user","type":"address"},
        {"indexed":false,"internalType":"uint256","name":"dfExpired","type":"uint256"}
      ],
      "name":"ExpiredLockedDF",
      "type":"event"
    },

    // ===== READ =====
    {
      "inputs":[{"internalType":"address","name":"u","type":"address"}],
      "name":"claimableUSDT",
      "outputs":[{"internalType":"uint256","name":"","type":"uint256"}],
      "stateMutability":"view",
      "type":"function"
    },
    {
      "inputs":[{"internalType":"address","name":"u","type":"address"}],
      "name":"claimableDF",
      "outputs":[{"internalType":"uint256","name":"","type":"uint256"}],
      "stateMutability":"view",
      "type":"function"
    },
    {
      "inputs":[{"internalType":"address","name":"","type":"address"}],
      "name":"earns",
      "outputs":[
        {"internalType":"uint256","name":"unlockedUSDT","type":"uint256"},
        {"internalType":"uint256","name":"claimedUSDT","type":"uint256"},
        {"internalType":"uint256","name":"lockedUSDT","type":"uint256"},
        {"internalType":"uint64","name":"lockStartUSDT","type":"uint64"},
        {"internalType":"uint64","name":"lockEndUSDT","type":"uint64"},
        {"internalType":"uint256","name":"expiredUSDT","type":"uint256"},
        {"internalType":"uint256","name":"unlockedDF","type":"uint256"},
        {"internalType":"uint256","name":"claimedDF","type":"uint256"},
        {"internalType":"uint256","name":"lockedDF","type":"uint256"},
        {"internalType":"uint64","name":"lockStartDF","type":"uint64"},
        {"internalType":"uint64","name":"lockEndDF","type":"uint64"},
        {"internalType":"uint256","name":"expiredDF","type":"uint256"}
      ],
      "stateMutability":"view",
      "type":"function"
    },

    // ===== ACTION =====
    {
      "inputs":[],
      "name":"claim",
      "outputs":[],
      "stateMutability":"nonpayable",
      "type":"function"
    }
  ]
};
