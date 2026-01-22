window.APP_CONFIG = {
  CHAIN_ID_DEC: 56,
  CHAIN_ID_HEX: "0x38",
  CHAIN_NAME: "BSC Mainnet",
  RPC_URL: "https://bsc-dataseed.binance.org/",
  BLOCK_EXPLORER: "https://bscscan.com",

  // ===== Addresses =====
  CORE:   "0xcE4FFd6AfD8C10c533AEc7455E2e83750b8D1659",
  VAULT:  "0x12537D70BC4F7F9dAc1c65116B78Ecd89682A4d3", // VaultV5
  BINARY: "0xD78043E993D0F6cC95F5f81eE927883BbFc41Ac6",
  STAKING:"0x4Dfa9EFEAc6069D139CF7ffEe406FAB78d7410A7",

  USDT: "0x55d398326f99059fF775485246999027B3197955",
  DF:   "0x36579d7eC4b29e875E3eC21A55F71C822E03A992",

  // ===== ABIs =====
  ERC20_ABI: [
    "function decimals() view returns (uint8)",
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)"
  ],

  CORE_ABI: [
    "function buyOrUpgrade(uint8 pkg, address sponsor, bool sideRight)",
    "function users(address) view returns (address sponsor,address parent,bool sideRight,uint8 pkg,uint8 rank,uint32 directSmallOrMore)",
    "function leftChild(address) view returns (address)",
    "function rightChild(address) view returns (address)"
  ],

  // VaultV5 (จาก ABI ที่คุณส่งมา)
  VAULT_ABI: [
    "function claim()",
    "function claimableUSDT(address) view returns (uint256)",
    "function claimableDF(address) view returns (uint256)",
    "function earns(address) view returns (uint256 unlockedUSDT,uint256 claimedUSDT,uint256 lockedUSDT,uint64 lockStartUSDT,uint64 lockEndUSDT,uint256 expiredUSDT,uint256 unlockedDF,uint256 claimedDF,uint256 lockedDF,uint64 lockStartDF,uint64 lockEndDF,uint256 expiredDF)"
  ],

  BINARY_ABI: [
    "function volumesOf(address) view returns (uint256 l,uint256 r,uint256 p)"
  ],

  STAKING_ABI: [
    "function pendingReward(address) view returns (uint256)",
    "function stakes(address) view returns (uint8 pkg,uint256 principal,uint64 start,uint64 end,bool claimed)",
    "function claimStake()"
  ]
};
