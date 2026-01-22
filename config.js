// ===== USER CONFIG =====
window.APP_CONFIG = {
  CHAIN_ID: 56,
  CHAIN_NAME: "BSC Mainnet",

  VAULT_ADDRESS: "0x12537D70BC4F7F9dAc1c65116B78Ecd89682A4d3",

  VAULT_ABI: [
    "function claim()",
    "function claimableUSDT(address) view returns(uint256)",
    "function claimableDF(address) view returns(uint256)",
    "function lockedUSDT(address) view returns(uint256,uint64,uint64,uint256)",
    "function lockedDF(address) view returns(uint256,uint64,uint64,uint256)",
    "function earns(address) view returns(uint256,uint256,uint256,uint64,uint64,uint256,uint256,uint256,uint256,uint64,uint64,uint256)"
  ]
};
