(() => {
  "use strict";

  // ====== CONFIG ======
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

  // ====== Minimal ABIs (เฉพาะที่ DApp ใช้) ======
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
    "function sponsorOf(address u) view returns (address)",
    "function rankOf(address u) view returns (uint8)",
    "function USDT() view returns (address)",
    "function DF() view returns (address)",
    "function VAULT() view returns (address)",
    "function STAKING() view returns (address)",
    "function BINARY() view returns (address)",
    "function treasury() view returns (address)",
    "function COMPANY_WALLET() view returns (address)",
  ];

  const STAKING_ABI = [
    "function pendingReward(address user) view returns (uint256)",
    "function stakes(address) view returns (uint8 pkg,uint256 principal,uint64 start,uint64 end,bool claimed)",
    "function claimStake() external",
    "function DF() view returns (address)",
    "function STAKE_DAYS() view returns (uint64)",
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
    "function LOCK_DAYS() view returns (uint64)",
  ];

  // ====== DOM helpers ======
  const $ = (id) => document.getElementById(id);
  const setText = (id, text) => { const el = $(id); if (el) el.textContent = text; };
  const setHref = (id, href, text) => { const el = $(id); if (!el) return; el.href = href; el.textContent = text ?? href; };

  const shortAddr = (a) => (a ? a.slice(0, 6) + "..." + a.slice(-4) : "-");
  const isAddr = (a) => /^0x[a-fA-F0-9]{40}$/.test(String(a || ""));

  // ====== Toast ======
  let toastTimer = null;
  function toast(msg, type = "") {
    const el = $("toast");
    if (!el) return;
    el.className = "toast show" + (type ? " " + type : "");
    el.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = "toast"; }, 2800);
  }

  // ====== State ======
  let provider = null;        // BrowserProvider
  let signer = null;
  let userAddr = null;

  let usdt = null, df = null;
  let core = null, staking = null, binary = null, vault5 = null;

  let USDT_DEC = 18;
  let DF_DEC = 18;
  let selectedPkg = 1;        // 1=Small,2=Medium,3=Large
  let sideRight = false;      // false=LEFT, true=RIGHT

  // ====== Utils ======
  const fmt = (bn, dec = 18, dp = 4) => {
    try {
      const s = ethers.formatUnits(bn ?? 0n, dec);
      const [a, b = ""] = s.split(".");
      return b.length ? `${a}.${b.slice(0, dp)}` : a;
    } catch { return "-"; }
  };

  const nowSec = () => Math.floor(Date.now() / 1000);

  function humanLeft(secLeft) {
    if (secLeft <= 0) return "0d 0h";
    const d = Math.floor(secLeft / 86400);
    const h = Math.floor((secLeft % 86400) / 3600);
    return `${d}d ${h}h`;
  }

  // ====== Init static text ======
  function fillStatic() {
    setText("usdtAddr", CFG.USDT);
    setText("dfAddr", CFG.DF);

    setText("coreAddr", CFG.CORE);
    setText("vaultAddr", CFG.VAULT5);
    setText("stakingAddr", CFG.STAKING);
    setText("binaryAddr", CFG.BINARY);
  }

  // ====== Package selector ======
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
      toast("เลือกฝั่ง LEFT", "ok");
    });
    $("btnRight")?.addEventListener("click", () => {
      sideRight = true;
      toast("เลือกฝั่ง RIGHT", "ok");
    });
  }

  // ====== Network / connect ======
  async function ensureBSC() {
    if (!provider) return false;
    const net = await provider.getNetwork();
    const chainId = Number(net.chainId);
    setText("netText", `${net.name || "-"} (${chainId})`);

    if (chainId === CFG.CHAIN_ID_DEC) return true;

    // try switch
    try {
      await provider.send("wallet_switchEthereumChain", [{ chainId: CFG.CHAIN_ID_HEX }]);
      return true;
    } catch (e) {
      // try add chain (some wallets)
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
        toast("กรุณาสลับเครือข่ายไป BSC Mainnet", "err");
        return false;
      }
    }
  }

  async function connect() {
    if (!window.ethereum) {
      toast("ไม่พบกระเป๋า (MetaMask/Bitget)", "err");
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

    // contracts
    usdt = new ethers.Contract(CFG.USDT, ERC20_ABI, signer);
    df   = new ethers.Contract(CFG.DF, ERC20_ABI, signer);
    core = new ethers.Contract(CFG.CORE, CORE_ABI, signer);
    staking = new ethers.Contract(CFG.STAKING, STAKING_ABI, signer);
    binary  = new ethers.Contract(CFG.BINARY, BINARY_ABI, signer);
    vault5  = new ethers.Contract(CFG.VAULT5, VAULT5_ABI, signer);

    // decimals
    try { USDT_DEC = await usdt.decimals(); } catch {}
    try { DF_DEC = await df.decimals(); } catch {}

    toast("เชื่อมต่อกระเป๋าแล้ว", "ok");
    await refreshAll();
  }

  // ====== Add tokens to wallet ======
  async function addTokens() {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: "wallet_watchAsset",
        params: {
          type: "ERC20",
          options: { address: CFG.DF, symbol: "365DF", decimals: DF_DEC || 18 },
        },
      });
      await window.ethereum.request({
        method: "wallet_watchAsset",
        params: {
          type: "ERC20",
          options: { address: CFG.USDT, symbol: "USDT", decimals: USDT_DEC || 18 },
        },
      });
      toast("เพิ่ม Token เข้า Wallet แล้ว", "ok");
    } catch {
      toast("เพิ่ม Token ไม่สำเร็จ", "err");
    }
  }

  // ====== Approve & Buy/Upgrade ======
  async function approveUSDT() {
    if (!usdt || !core) return toast("ยังไม่เชื่อมต่อ", "err");
    try {
      setText("buyStatus", "กำลังตรวจ allowance...");
      const need = await core.priceUSDT(selectedPkg); // uint256 (ตามสัญญา)
      const alw = await usdt.allowance(userAddr, CFG.CORE);
      if (alw >= need) {
        setText("buyStatus", "Approve เพียงพอแล้ว ✅");
        toast("Approve เพียงพอแล้ว", "ok");
        return;
      }
      setText("buyStatus", "กำลังส่งธุรกรรม Approve...");
      const tx = await usdt.approve(CFG.CORE, need);
      setText("buyStatus", `Approve tx: ${tx.hash}`);
      toast("ส่ง Approve แล้ว", "ok");
      await tx.wait();
      setText("buyStatus", "Approve สำเร็จ ✅");
      toast("Approve สำเร็จ", "ok");
    } catch (e) {
      setText("buyStatus", `Approve error: ${shortErr(e)}`);
      toast("Approve ไม่สำเร็จ", "err");
    }
  }

  function shortErr(e) {
    const m = (e?.shortMessage || e?.reason || e?.message || String(e));
    return m.length > 140 ? m.slice(0, 140) + "..." : m;
  }

  async function buyOrUpgrade() {
    if (!core) return toast("ยังไม่เชื่อมต่อ", "err");

    const sponsor = ($("inpSponsor")?.value || "").trim();
    if (!isAddr(sponsor)) return toast("กรอก Sponsor address ให้ถูกต้อง", "err");

    try {
      setText("buyStatus", "กำลังส่ง buyOrUpgrade...");
      const tx = await core.buyOrUpgrade(selectedPkg, sponsor, sideRight);
      setText("buyStatus", `tx: ${tx.hash}`);
      toast("ส่งธุรกรรมแล้ว", "ok");
      await tx.wait();
      setText("buyStatus", "สำเร็จ ✅ กำลังอัปเดตข้อมูล...");
      toast("ซื้อ/อัปเกรดสำเร็จ", "ok");
      await refreshAll();
    } catch (e) {
      setText("buyStatus", `Buy error: ${shortErr(e)}`);
      toast("ซื้อ/อัปเกรดไม่สำเร็จ", "err");
    }
  }

  // ====== Claim ======
  async function claimVault() {
    if (!vault5) return toast("ยังไม่เชื่อมต่อ", "err");
    try {
      setText("dataStatus", "กำลัง claim Vault...");
      const tx = await vault5.claim();
      toast("ส่ง claim แล้ว", "ok");
      await tx.wait();
      setText("dataStatus", "Claim Vault สำเร็จ ✅");
      toast("Claim Vault สำเร็จ", "ok");
      await refreshAll();
    } catch (e) {
      setText("dataStatus", `Claim Vault error: ${shortErr(e)}`);
      toast("Claim Vault ไม่สำเร็จ", "err");
    }
  }

  async function claimStake() {
    if (!staking) return toast("ยังไม่เชื่อมต่อ", "err");
    try {
      setText("dataStatus", "กำลัง claim Stake...");
      const tx = await staking.claimStake();
      toast("ส่ง claimStake แล้ว", "ok");
      await tx.wait();
      setText("dataStatus", "Claim Stake สำเร็จ ✅");
      toast("Claim Stake สำเร็จ", "ok");
      await refreshAll();
    } catch (e) {
      setText("dataStatus", `Claim Stake error: ${shortErr(e)}`);
      toast("Claim Stake ไม่สำเร็จ", "err");
    }
  }

  // ====== Read user data ======
  async function refreshAll() {
    if (!core || !staking || !vault5 || !binary) return;

    try {
      setText("dataStatus", "กำลังโหลดข้อมูล...");
      // Core user
      const u = await core.users(userAddr);
      // u: sponsor,parent,sideRight,pkg,rank,directSmallOrMore
      const pkg = Number(u.pkg);
      const rank = Number(u.rank);
      setText("uPkg", pkgName(pkg));
      setText("uRank", rankName(rank));
      setText("uSponsor", shortAddr(u.sponsor));

      // Staking
      const st = await staking.stakes(userAddr);
      const end = Number(st.end);
      setText("stakeEnd", end ? new Date(end * 1000).toLocaleString() : "-");
      setText("stakeClaimed", st.claimed ? "YES" : "NO");

      const pend = await staking.pendingReward(userAddr);
      setText("pendingDF", fmt(pend, DF_DEC, 4));

      // Vault (claimable)
      const cU = await vault5.claimableUSDT(userAddr);
      const cD = await vault5.claimableDF(userAddr);
      setText("vClaimUSDT", fmt(cU, USDT_DEC, 4));
      setText("vClaimDF", fmt(cD, DF_DEC, 4));

      // Vault earns/lock/expire
      let lockUSDT = 0n, lockDF = 0n, endU = 0, endD = 0, expU = 0n, expD = 0n;
      try {
        const e = await vault5.earns(userAddr);
        // e: unlockedUSDT, claimedUSDT, lockedUSDT, lockStartUSDT, lockEndUSDT, expiredUSDT, unlockedDF, claimedDF, lockedDF, lockStartDF, lockEndDF, expiredDF
        lockUSDT = e.lockedUSDT;
        lockDF   = e.lockedDF;
        endU = Number(e.lockEndUSDT);
        endD = Number(e.lockEndDF);
        expU = e.expiredUSDT;
        expD = e.expiredDF;
      } catch {
        // fallback read locked
        try {
          const lu = await vault5.lockedUSDT(userAddr);
          const ld = await vault5.lockedDF(userAddr);
          lockUSDT = lu.amt; endU = Number(lu.end); expU = lu.expired;
          lockDF = ld.amt; endD = Number(ld.end); expD = ld.expired;
        } catch {}
      }
      setText("vLocked", `${fmt(lockUSDT, USDT_DEC, 4)} USDT / ${fmt(lockDF, DF_DEC, 4)} DF`);

      const endAny = Math.max(endU || 0, endD || 0);
      const left = endAny ? (endAny - nowSec()) : 0;
      setText("vExpires", endAny ? `${humanLeft(left)} (${new Date(endAny * 1000).toLocaleDateString()})` : "-");

      // Binary volumes
      const v = await binary.volumesOf(userAddr);
      setText("binLRP", `${fmt(v.l, 0, 0)} / ${fmt(v.r, 0, 0)} / ${fmt(v.p, 0, 0)}`);

      // Cap remaining (ตาม concept: cap = 365 * principal multipliers)
      // เรา "ประมาณ" โดยใช้ cap = principal DF (365/3650/36500) เป็น USDT cap ตามแพ็ค
      const cap = capOfPkg(pkg);
      // earnedEst = claimed + claimable + locked (USDT) + DF(ตีเป็น USDT 1:1)
      const earnedEst = (cU + lockUSDT) + (cD + lockDF); // 1 DF = 1 USDT (ตามสเปก)
      const remain = cap > earnedEst ? (cap - earnedEst) : 0n;

      setText("earnedEst", fmt(earnedEst, USDT_DEC, 4));
      setText("capRemain", fmt(remain, USDT_DEC, 4));

      setText("dataStatus", "อัปเดตล่าสุด ✅");
    } catch (e) {
      setText("dataStatus", `โหลดข้อมูลไม่สำเร็จ: ${shortErr(e)}`);
      toast("โหลดข้อมูลไม่สำเร็จ", "err");
    }
  }

  function pkgName(p) {
    if (p === 1) return "Small";
    if (p === 2) return "Medium";
    if (p === 3) return "Large";
    return String(p || "-");
  }

  function rankName(r) {
    // หมายเหตุ: ในสัญญาเป็น enum CoreV4.Rank (เลขจริงอาจต่าง) — แสดงแบบปลอดภัย
    // ถ้าคุณบอก mapping เลข ↔ Bronze/Silver/Gold ผมปรับให้ตรงเป๊ะได้ทันที
    if (r === 0) return "None/Default";
    if (r === 1) return "Bronze";
    if (r === 2) return "Silver";
    if (r === 3) return "Gold";
    return `Rank#${r}`;
  }

  function capOfPkg(p) {
    // cap เป็น USDT ตาม concept
    // Small 365, Medium 3650, Large 36500
    if (p === 1) return ethers.parseUnits("365", USDT_DEC);
    if (p === 2) return ethers.parseUnits("3650", USDT_DEC);
    if (p === 3) return ethers.parseUnits("36500", USDT_DEC);
    return 0n;
  }

  // ====== Bind UI ======
  function bindUI() {
    $("btnConnect")?.addEventListener("click", connect);
    $("btnAddTokens")?.addEventListener("click", addTokens);

    $("btnApprove")?.addEventListener("click", approveUSDT);
    $("btnBuy")?.addEventListener("click", buyOrUpgrade);

    $("btnClaimVault")?.addEventListener("click", claimVault);
    $("btnClaimStake")?.addEventListener("click", claimStake);
    $("btnRefresh")?.addEventListener("click", refreshAll);

    // react to account / chain change
    if (window.ethereum?.on) {
      window.ethereum.on("accountsChanged", () => window.location.reload());
      window.ethereum.on("chainChanged", () => window.location.reload());
    }
  }

  // ====== Boot ======
  fillStatic();
  bindPkgUI();
  bindUI();
})();
