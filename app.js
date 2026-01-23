(() => {
  "use strict";

  // ===================== CONFIG =====================
  const CFG = {
    CHAIN_ID_DEC: 56,
    CHAIN_ID_HEX: "0x38",
    CHAIN_NAME: "BSC Mainnet",
    RPC_FALLBACK: "https://bsc-dataseed.binance.org/",
    EXPLORER: "https://bscscan.com",

    USDT: "0x55d398326f99059fF775485246999027B3197955",
    DF:   "0x36579d7eC4b29e875E3eC21A55F71C822E03A992",

    CORE:   "0xcE4FFd6AfD8C10c533AEc7455E2e83750b8D1659",
    STAKING:"0x4Dfa9EFEAc6069D139CF7ffEe406FAB78d7410A7",
    BINARY: "0xD78043E993D0F6cC95F5f81eE927883BbFc41Ac6",
    VAULT5: "0x12537D70BC4F7F9dAc1c65116B78Ecd89682A4d3",
    VAULT4: "0xF394c73Af94f39f660041802915f3421DE8f1a46",
  };

  // ===================== ABIs (minimal) =====================
  const ERC20_ABI = [
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
  ];

  const CORE_ABI = [
    "function buyOrUpgrade(uint8 newPkg, address sponsor, bool sideRight) external",
    "function priceUSDT(uint8 p) pure returns (uint256)",
    "function users(address) view returns (address sponsor,address parent,bool sideRight,uint8 pkg,uint8 rank,uint32 directSmallOrMore)",
  ];

  const STAKING_ABI = [
    "function pendingReward(address user) view returns (uint256)",
    "function stakes(address) view returns (uint8 pkg,uint256 principal,uint64 start,uint64 end,bool claimed)",
    "function claimStake() external",
  ];

  const BINARY_ABI = [
    "function volumesOf(address u) view returns (uint256 l,uint256 r,uint256 p)",
  ];

  const VAULT5_ABI = [
    "function claim() external",
    "function claimableUSDT(address u) view returns (uint256)",
    "function claimableDF(address u) view returns (uint256)",
    "function earns(address) view returns (uint256 unlockedUSDT,uint256 claimedUSDT,uint256 lockedUSDT,uint64 lockStartUSDT,uint64 lockEndUSDT,uint256 expiredUSDT,uint256 unlockedDF,uint256 claimedDF,uint256 lockedDF,uint64 lockStartDF,uint64 lockEndDF,uint256 expiredDF)",
    "function lockedUSDT(address u) view returns (uint256 amt,uint64 start,uint64 end,uint256 expired)",
    "function lockedDF(address u) view returns (uint256 amt,uint64 start,uint64 end,uint256 expired)",
  ];

  // ===================== DOM helpers =====================
  const $ = (id) => document.getElementById(id);
  const setText = (id, text) => { const el = $(id); if (el) el.textContent = text; };
  const setHref = (id, href, text) => { const el = $(id); if (!el) return; el.href = href; el.textContent = text ?? href; };

  const shortAddr = (a) => (a ? a.slice(0, 6) + "..." + a.slice(-4) : "-");
  const isAddr = (a) => /^0x[a-fA-F0-9]{40}$/.test(String(a || ""));

  // ===================== Toast =====================
  let toastTimer = null;
  function toast(msg, type = "") {
    const el = $("toast");
    if (!el) return;
    el.className = "toast show" + (type ? " " + type : "");
    el.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = "toast"; }, 2800);
  }

  // ===================== State =====================
  let provider = null;
  let signer = null;
  let userAddr = null;

  let usdt = null, df = null;
  let core = null, staking = null, binary = null, vault5 = null;

  let USDT_DEC = 18;
  let DF_DEC = 18;

  let selectedPkg = 1;     // 1=Small,2=Medium,3=Large
  let sideRight = false;   // false=LEFT, true=RIGHT

  // countdown state
  let stakeEndTs = 0;      // unix seconds
  let vaultEndTs = 0;      // unix seconds
  let tickTimer = null;

  // ===================== Utils =====================
  const nowSec = () => Math.floor(Date.now() / 1000);

  const fmt = (bn, dec = 18, dp = 4) => {
    try {
      const s = ethers.formatUnits(bn ?? 0n, dec);
      const [a, b = ""] = s.split(".");
      return b.length ? `${a}.${b.slice(0, dp)}` : a;
    } catch { return "-"; }
  };

  function shortErr(e) {
    const m = (e?.shortMessage || e?.reason || e?.message || String(e));
    return m.length > 180 ? m.slice(0, 180) + "..." : m;
  }

  function pkgName(p) {
    if (p === 1) return "Small";
    if (p === 2) return "Medium";
    if (p === 3) return "Large";
    return String(p || "-");
  }

  function rankName(r) {
    // Safe default mapping (adjust if your enum differs)
    if (r === 0) return "None/Default";
    if (r === 1) return "Bronze";
    if (r === 2) return "Silver";
    if (r === 3) return "Gold";
    return `Rank#${r}`;
  }

  function capOfPkg(p) {
    // concept cap: Small 365, Medium 3650, Large 36500 (USDT units)
    if (p === 1) return ethers.parseUnits("365", USDT_DEC);
    if (p === 2) return ethers.parseUnits("3650", USDT_DEC);
    if (p === 3) return ethers.parseUnits("36500", USDT_DEC);
    return 0n;
  }

  function splitDHMS(totalSeconds) {
    const s = Math.max(0, Number(totalSeconds) || 0);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    return { d, h, m, sec };
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function setCountdown(prefix, secondsLeft) {
    const t = splitDHMS(secondsLeft);
    setText(prefix + "D", String(t.d));
    setText(prefix + "H", pad2(t.h));
    setText(prefix + "M", pad2(t.m));
    setText(prefix + "S", pad2(t.sec));
  }

  function startTick() {
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = setInterval(() => {
      const t = nowSec();

      // stake countdown
      if (stakeEndTs && stakeEndTs > 0) {
        const left = stakeEndTs - t;
        setCountdown("stake", left);
        const when = new Date(stakeEndTs * 1000).toLocaleString();
        if (left > 0) {
          setText("stakeCdText", `Stake ends at: ${when}`);
        } else {
          setText("stakeCdText", `Stake matured ✅ You can claim now (Stake end: ${when})`);
        }
      } else {
        setCountdown("stake", 0);
        setText("stakeCdText", "No stake data.");
      }

      // vault expiry countdown
      if (vaultEndTs && vaultEndTs > 0) {
        const left = vaultEndTs - t;
        setCountdown("vault", left);
        const when = new Date(vaultEndTs * 1000).toLocaleString();
        if (left > 0) {
          setText("vaultCdText", `Vault expiry at: ${when}`);
        } else {
          setText("vaultCdText", `Expired ❌ (Expiry time: ${when})`);
        }
      } else {
        setCountdown("vault", 0);
        setText("vaultCdText", "No vault lock data.");
      }
    }, 1000);
  }

  // ===================== Static UI =====================
  function fillStatic() {
    setText("usdtAddr", CFG.USDT);
    setText("dfAddr", CFG.DF);

    setText("coreAddr", CFG.CORE);
    setText("vaultAddr", CFG.VAULT5);
    setText("stakingAddr", CFG.STAKING);
    setText("binaryAddr", CFG.BINARY);
  }

  function bindPkgUI() {
    const pkgs = document.querySelectorAll(".pkg");
    pkgs.forEach(btn => {
      btn.addEventListener("click", () => {
        pkgs.forEach(x => x.classList.remove("sel"));
        btn.classList.add("sel");
        selectedPkg = Number(btn.getAttribute("data-pkg") || "1");
      });
    });

    $("btnLeft")?.addEventListener("click", () => {
      sideRight = false;
      toast("Binary side set: LEFT", "ok");
    });
    $("btnRight")?.addEventListener("click", () => {
      sideRight = true;
      toast("Binary side set: RIGHT", "ok");
    });
  }

  // ===================== Network =====================
  async function ensureBSC() {
    if (!provider) return false;

    const net = await provider.getNetwork();
    const chainId = Number(net.chainId);
    setText("netText", `${net.name || "-"} (${chainId})`);

    if (chainId === CFG.CHAIN_ID_DEC) return true;

    try {
      await provider.send("wallet_switchEthereumChain", [{ chainId: CFG.CHAIN_ID_HEX }]);
      return true;
    } catch (e) {
      try {
        await provider.send("wallet_addEthereumChain", [{
          chainId: CFG.CHAIN_ID_HEX,
          chainName: CFG.CHAIN_NAME,
          nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
          rpcUrls: [CFG.RPC_FALLBACK],
          blockExplorerUrls: [CFG.EXPLORER],
        }]);
        return true;
      } catch (e2) {
        toast("Please switch to BSC Mainnet (ChainId 56).", "err");
        return false;
      }
    }
  }

  // ===================== Connect =====================
  async function connect() {
    if (!window.ethereum) {
      toast("Wallet not found (MetaMask / Bitget).", "err");
      return;
    }

    provider = new ethers.BrowserProvider(window.ethereum);
    const ok = await ensureBSC();
    if (!ok) return;

    await provider.send("eth_requestAccounts", []);
    signer = await provider.getSigner();
    userAddr = await signer.getAddress();

    setText("walletStatus", "✅ Connected");
    setHref("walletLink", `${CFG.EXPLORER}/address/${userAddr}`, shortAddr(userAddr));

    // Contracts
    usdt = new ethers.Contract(CFG.USDT, ERC20_ABI, signer);
    df   = new ethers.Contract(CFG.DF, ERC20_ABI, signer);
    core = new ethers.Contract(CFG.CORE, CORE_ABI, signer);
    staking = new ethers.Contract(CFG.STAKING, STAKING_ABI, signer);
    binary  = new ethers.Contract(CFG.BINARY, BINARY_ABI, signer);
    vault5  = new ethers.Contract(CFG.VAULT5, VAULT5_ABI, signer);

    // Decimals
    try { USDT_DEC = await usdt.decimals(); } catch {}
    try { DF_DEC = await df.decimals(); } catch {}

    toast("Wallet connected.", "ok");
    await refreshAll();
  }

  // ===================== Add tokens =====================
  async function addTokens() {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: "wallet_watchAsset",
        params: { type: "ERC20", options: { address: CFG.DF, symbol: "365DF", decimals: DF_DEC || 18 } },
      });
      await window.ethereum.request({
        method: "wallet_watchAsset",
        params: { type: "ERC20", options: { address: CFG.USDT, symbol: "USDT", decimals: USDT_DEC || 18 } },
      });
      toast("Tokens added to wallet.", "ok");
    } catch {
      toast("Failed to add token.", "err");
    }
  }

  // ===================== Approve =====================
  async function approveUSDT() {
    if (!usdt || !core) return toast("Not connected.", "err");
    try {
      setText("buyStatus", "Checking allowance...");
      const need = await core.priceUSDT(selectedPkg);
      const alw = await usdt.allowance(userAddr, CFG.CORE);

      if (alw >= need) {
        setText("buyStatus", "Allowance is sufficient ✅");
        toast("Allowance is sufficient.", "ok");
        return;
      }

      setText("buyStatus", "Sending approve transaction...");
      const tx = await usdt.approve(CFG.CORE, need);
      setText("buyStatus", `Approve tx: ${tx.hash}`);
      toast("Approve sent.", "ok");
      await tx.wait();
      setText("buyStatus", "Approve success ✅");
      toast("Approve success.", "ok");
    } catch (e) {
      setText("buyStatus", `Approve error: ${shortErr(e)}`);
      toast("Approve failed.", "err");
    }
  }

  // ===================== Buy / Upgrade =====================
  async function buyOrUpgrade() {
    if (!core || !staking) return toast("Not connected.", "err");

    const sponsor = ($("inpSponsor")?.value || "").trim();
    if (!isAddr(sponsor)) {
      toast("Invalid sponsor address.", "err");
      return;
    }

    // Pre-check ACTIVE_STAKE_EXISTS
    try {
      const u = await core.users(userAddr);
      const currentPkg = Number(u.pkg || 0);

      const st = await staking.stakes(userAddr);
      const endTs = Number(st.end || 0);
      const activeStake = (!st.claimed) && endTs > nowSec();

      if (activeStake && selectedPkg <= currentPkg) {
        setText("buyStatus", "Blocked: ACTIVE_STAKE_EXISTS. Select a higher package to upgrade, or wait until stake matures and claim.");
        toast("Active stake exists. Choose a higher package to upgrade.", "err");
        return;
      }
    } catch {
      // If precheck fails, still allow tx attempt (some wallets/providers)
    }

    try {
      setText("buyStatus", "Sending buyOrUpgrade transaction...");
      const tx = await core.buyOrUpgrade(selectedPkg, sponsor, sideRight);
      setText("buyStatus", `Tx: ${tx.hash}`);
      toast("Transaction sent.", "ok");
      await tx.wait();
      setText("buyStatus", "Success ✅ Refreshing data...");
      toast("Buy/Upgrade success.", "ok");
      await refreshAll();
    } catch (e) {
      const msg = shortErr(e);
      if (String(msg).includes("ACTIVE_STAKE_EXISTS")) {
        setText("buyStatus", "Reverted: ACTIVE_STAKE_EXISTS. You already have an active stake. Upgrade with a higher package, or wait until maturity and claim.");
        toast("ACTIVE_STAKE_EXISTS: upgrade with a higher package.", "err");
      } else {
        setText("buyStatus", `Buy error: ${msg}`);
        toast("Buy/Upgrade failed.", "err");
      }
    }
  }

  // ===================== Claim =====================
  async function claimVault() {
    if (!vault5) return toast("Not connected.", "err");
    try {
      setText("dataStatus", "Claiming vault...");
      const tx = await vault5.claim();
      toast("Claim sent.", "ok");
      await tx.wait();
      setText("dataStatus", "Vault claim success ✅");
      toast("Vault claim success.", "ok");
      await refreshAll();
    } catch (e) {
      setText("dataStatus", `Vault claim error: ${shortErr(e)}`);
      toast("Vault claim failed.", "err");
    }
  }

  async function claimStake() {
    if (!staking) return toast("Not connected.", "err");
    try {
      setText("dataStatus", "Claiming stake...");
      const tx = await staking.claimStake();
      toast("Claim sent.", "ok");
      await tx.wait();
      setText("dataStatus", "Stake claim success ✅");
      toast("Stake claim success.", "ok");
      await refreshAll();
    } catch (e) {
      setText("dataStatus", `Stake claim error: ${shortErr(e)}`);
      toast("Stake claim failed.", "err");
    }
  }

  // ===================== Refresh =====================
  async function refreshAll() {
    if (!core || !staking || !vault5 || !binary) return;

    try {
      setText("dataStatus", "Loading...");

      // Core user
      const u = await core.users(userAddr);
      const pkg = Number(u.pkg);
      const rank = Number(u.rank);

      setText("uPkg", pkgName(pkg));
      setText("uRank", rankName(rank));
      setText("uSponsor", shortAddr(u.sponsor));

      // Staking
      const st = await staking.stakes(userAddr);
      stakeEndTs = Number(st.end) || 0;
      setText("stakeEnd", stakeEndTs ? new Date(stakeEndTs * 1000).toLocaleString() : "-");
      setText("stakeClaimed", st.claimed ? "YES" : "NO");

      const pend = await staking.pendingReward(userAddr);
      setText("pendingDF", fmt(pend, DF_DEC, 4));

      // Vault claimable
      const cU = await vault5.claimableUSDT(userAddr);
      const cD = await vault5.claimableDF(userAddr);
      setText("vClaimUSDT", fmt(cU, USDT_DEC, 4));
      setText("vClaimDF", fmt(cD, DF_DEC, 4));

      // Vault lock/expiry
      let lockUSDT = 0n, lockDF = 0n;
      let endU = 0, endD = 0;

      try {
        const e = await vault5.earns(userAddr);
        lockUSDT = e.lockedUSDT;
        lockDF   = e.lockedDF;
        endU = Number(e.lockEndUSDT);
        endD = Number(e.lockEndDF);
      } catch {
        // fallback
        try {
          const lu = await vault5.lockedUSDT(userAddr);
          const ld = await vault5.lockedDF(userAddr);
          lockUSDT = lu.amt; endU = Number(lu.end);
          lockDF = ld.amt; endD = Number(ld.end);
        } catch {}
      }

      setText("vLocked", `${fmt(lockUSDT, USDT_DEC, 4)} USDT / ${fmt(lockDF, DF_DEC, 4)} DF`);

      const endAny = Math.max(endU || 0, endD || 0);
      vaultEndTs = endAny || 0;
      setText("vExpires", vaultEndTs ? new Date(vaultEndTs * 1000).toLocaleString() : "-");

      // Binary volumes
      const v = await binary.volumesOf(userAddr);
      setText("binLRP", `${fmt(v.l, 0, 0)} / ${fmt(v.r, 0, 0)} / ${fmt(v.p, 0, 0)}`);

      // Cap remaining estimate (DF treated 1:1 as USDT per spec)
      const cap = capOfPkg(pkg);
      const earnedEst = (cU + lockUSDT) + (cD + lockDF);
      const remain = cap > earnedEst ? (cap - earnedEst) : 0n;
      setText("earnedEst", fmt(earnedEst, USDT_DEC, 4));
      setText("capRemain", fmt(remain, USDT_DEC, 4));

      setText("dataStatus", "Updated ✅");

      // Start countdown loop
      startTick();
    } catch (e) {
      setText("dataStatus", `Load failed: ${shortErr(e)}`);
      toast("Failed to load data.", "err");
    }
  }

  // ===================== Bind UI =====================
  function bindUI() {
    $("btnConnect")?.addEventListener("click", connect);
    $("btnAddTokens")?.addEventListener("click", addTokens);

    $("btnApprove")?.addEventListener("click", approveUSDT);
    $("btnBuy")?.addEventListener("click", buyOrUpgrade);

    $("btnClaimVault")?.addEventListener("click", claimVault);
    $("btnClaimStake")?.addEventListener("click", claimStake);
    $("btnRefresh")?.addEventListener("click", refreshAll);

    if (window.ethereum?.on) {
      window.ethereum.on("accountsChanged", () => window.location.reload());
      window.ethereum.on("chainChanged", () => window.location.reload());
    }
  }

  // ===================== Boot =====================
  fillStatic();
  bindPkgUI();
  bindUI();

  // Initialize countdown cards
  setCountdown("stake", 0);
  setCountdown("vault", 0);
  setText("stakeCdText", "Connect wallet to load stake data.");
  setText("vaultCdText", "Connect wallet to load vault lock data.");
})();
