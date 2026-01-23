;(() => {
  "use strict";
  const C = window.APP_CONFIG;
  const $ = (id) => document.getElementById(id);

  const setText = (id, t) => { const el = $(id); if (el) el.textContent = t; };
  const setStatus = (t) => setText("status", t);

  let provider, signer, user;
  let usdt, core, vault, binary, staking;

  let selectedPkg = null;
  let selectedSideRight = false;

  let countdownTimer = null;
  let stakeEndSec = 0;
  let stakeClaimed = false;
  let stakePrincipal = "0";

  let vaultEndSec = 0;
  let vaultExpired = false;

  let USDT_DEC = 18;

  // -------- Toast --------
  function toast(msg, type = "ok") {
    const el = $("toast");
    if (!el) return;
    el.classList.remove("show", "ok", "err");
    el.textContent = msg;
    el.classList.add(type === "err" ? "err" : "ok");
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 2600);
  }
  const notifyOk = (m) => toast(m, "ok");
  const notifyErr = (m) => toast(m, "err");

  // -------- Helpers --------
  function parseQuery() {
    const q = new URLSearchParams(location.search);
    const ref = q.get("ref");
    const side = (q.get("side") || "").toUpperCase();
    if (ref && ethers.utils.isAddress(ref)) $("inpSponsor").value = ref;
    if (side === "R") chooseSide(true);
    if (side === "L") chooseSide(false);
  }

  function buildLinks() {
    if (!user) return;
    const base = location.origin + location.pathname; // stable on github pages
    setText("leftLink",  `${base}?ref=${user}&side=L`);
    setText("rightLink", `${base}?ref=${user}&side=R`);
  }

  function chooseSide(isRight) {
    selectedSideRight = !!isRight;
    $("btnSideL")?.classList.toggle("primary", !selectedSideRight);
    $("btnSideR")?.classList.toggle("primary", selectedSideRight);
  }

  function choosePkg(p) {
    selectedPkg = Number(p);
    const name = selectedPkg === 1 ? "Small (100 USDT)"
      : selectedPkg === 2 ? "Medium (1,000 USDT)"
      : selectedPkg === 3 ? "Large (10,000 USDT)"
      : "-";
    setText("selectedPkg", name);

    document.querySelectorAll(".pkg").forEach(btn => {
      btn.classList.toggle("sel", Number(btn.dataset.pkg) === selectedPkg);
    });
  }

  async function ensureBSC() {
    const net = await provider.getNetwork();
    if (net.chainId === C.CHAIN_ID_DEC) return true;

    try {
      await provider.send("wallet_switchEthereumChain", [{ chainId: C.CHAIN_ID_HEX }]);
      return true;
    } catch {
      try {
        await provider.send("wallet_addEthereumChain", [{
          chainId: C.CHAIN_ID_HEX,
          chainName: C.CHAIN_NAME,
          nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
          rpcUrls: [C.RPC_URL],
          blockExplorerUrls: [C.BLOCK_EXPLORER]
        }]);
        return true;
      } catch {
        throw new Error("Please switch to BSC Mainnet (ChainId 56).");
      }
    }
  }

  function fmt(x, dec, dp = 6) {
    try {
      const s = ethers.utils.formatUnits(x, dec);
      const [a,b=""] = s.split(".");
      return b ? `${a}.${b.slice(0, dp)}` : a;
    } catch { return String(x); }
  }

  const PKG_NAME = ["None", "Small", "Medium", "Large"];
  const RANK_NAME = ["None", "Bronze", "Silver", "Gold"];

  function fmtTS(sec) {
    if (!sec || sec === 0) return "-";
    const d = new Date(Number(sec) * 1000);
    return d.toLocaleString();
  }

  function stopCountdown() {
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = null;
  }

  function toDHMS(diff) {
    const s = Math.max(0, Number(diff) || 0);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    return { d, h, m, sec };
  }
  const pad2 = (n) => String(n).padStart(2, "0");

  function startCountdown() {
    stopCountdown();

    const tick = () => {
      const now = Math.floor(Date.now() / 1000);

      // ----- Stake countdown -----
      if (!stakeEndSec || stakeEndSec === 0) {
        setText("stakeCountdown", "-");
        setText("stakeStatus", "-");
      } else if (stakeClaimed) {
        setText("stakeCountdown", "-");
        setText("stakeStatus", "Claimed ✅");
      } else if (stakePrincipal === "0") {
        setText("stakeCountdown", "-");
        setText("stakeStatus", "No stake");
      } else {
        const diff = stakeEndSec - now;
        if (diff <= 0) {
          setText("stakeCountdown", "00d 00:00:00");
          setText("stakeStatus", "Matured ✅ (Claim Stake available)");
        } else {
          const t = toDHMS(diff);
          setText("stakeCountdown", `${t.d}d ${pad2(t.h)}:${pad2(t.m)}:${pad2(t.sec)}`);
          setText("stakeStatus", "Locked");
        }
      }

      // ----- Vault countdown -----
      if (!vaultEndSec || vaultEndSec === 0) {
        setText("vaultCountdown", "-");
        setText("vaultStatus", "-");
      } else {
        const diffV = vaultEndSec - now;
        if (vaultExpired || diffV <= 0) {
          setText("vaultCountdown", "00d 00:00:00");
          setText("vaultStatus", "Expired ✅");
        } else {
          const t = toDHMS(diffV);
          setText("vaultCountdown", `${t.d}d ${pad2(t.h)}:${pad2(t.m)}:${pad2(t.sec)}`);
          setText("vaultStatus", "Locked");
        }
      }
    };

    tick();
    countdownTimer = setInterval(tick, 1000);
  }

  function capLimitByPkg(pkg) {
    if (pkg === 1) return 365;
    if (pkg === 2) return 3650;
    if (pkg === 3) return 36500;
    return 0;
  }

  // -------- Connect --------
  async function connect() {
    try {
      if (!window.ethereum) {
        alert("Wallet not found. Open in Bitget/MetaMask DApp browser.");
        return;
      }

      provider = new ethers.providers.Web3Provider(window.ethereum, "any");

      // request accounts first (stable on mobile)
      await provider.send("eth_requestAccounts", []);
      signer = provider.getSigner();
      user = await signer.getAddress();

      await ensureBSC();

      // contracts
      usdt    = new ethers.Contract(C.USDT,    C.ERC20_ABI, signer);
      core    = new ethers.Contract(C.CORE,    C.CORE_ABI, signer);
      vault   = new ethers.Contract(C.VAULT,   C.VAULT_ABI, signer);
      binary  = new ethers.Contract(C.BINARY,  C.BINARY_ABI, signer);
      staking = new ethers.Contract(C.STAKING, C.STAKING_ABI, signer);

      try { USDT_DEC = await usdt.decimals(); } catch { USDT_DEC = 18; }

      setText("walletAddr", user);
      setText("netText", "BSC (56)");
      setText("coreAddr", C.CORE);
      setText("vaultAddr", C.VAULT);
      setText("binaryAddr", C.BINARY);
      setText("stakingAddr", C.STAKING);
      setText("usdtAddr", C.USDT);
      setText("dfAddr", C.DF);

      $("btnConnect").textContent = "Connected";
      $("btnConnect").disabled = true;

      buildLinks();
      await refreshAll(true);

      // ✅ avoid hard reload (Bitget friendly)
      window.ethereum.on?.("accountsChanged", async () => {
        try {
          await provider.send("eth_requestAccounts", []);
          signer = provider.getSigner();
          user = await signer.getAddress();
          setText("walletAddr", user);
          buildLinks();
          await refreshAll(true);
        } catch {}
      });

      window.ethereum.on?.("chainChanged", async () => {
        try {
          await ensureBSC();
          await refreshAll(true);
        } catch {}
      });
    } catch (e) {
      console.error(e);
      setStatus("Connect error: " + (e?.message || e));
      notifyErr("Connect failed");
    }
  }

  // -------- Refresh --------
  async function refreshAll(showOk = false) {
    if (!user) return;

    try {
      setStatus("Refreshing...");

      // Core user data
      const u = await core.users(user);
      const sponsor = u.sponsor;
      const sideRight = u.sideRight;
      const pkg = Number(u.pkg);
      const rank = Number(u.rank);

      setText("mySponsor", sponsor === ethers.constants.AddressZero ? "-" : sponsor);
      setText("mySide", pkg === 0 ? "-" : (sideRight ? "Right" : "Left"));
      setText("myPkg", PKG_NAME[pkg] || "-");
      setText("myRank", RANK_NAME[rank] || "-");

      // children
      const l = await core.leftChild(user);
      const r = await core.rightChild(user);
      setText("leftChild", l === ethers.constants.AddressZero ? "-" : l);
      setText("rightChild", r === ethers.constants.AddressZero ? "-" : r);

      // Vault claimables
      const cu = await vault.claimableUSDT(user);
      const cd = await vault.claimableDF(user);
      setText("claimUSDT", fmt(cu, USDT_DEC, 6));
      setText("claimDF", fmt(cd, 18, 6));

      // Binary volumes (format 18 decimals because volEq is 1e18)
      const vols = await binary.volumesOf(user);
      setText("volL", fmt(vols.l, 18, 6));
      setText("volR", fmt(vols.r, 18, 6));
      setText("volP", fmt(vols.p, 18, 6));

      // Staking
      const pending = await staking.pendingReward(user);
      setText("pendingStake", fmt(pending, 18, 8)); // show more decimals
      const s = await staking.stakes(user);

      const start = Number(s.start);
      const end = Number(s.end);
      stakeClaimed = !!s.claimed;
      stakeEndSec = end || 0;
      stakePrincipal = (s.principal ? s.principal.toString() : "0");

      setText("stakeStart", fmtTS(start));
      setText("stakeEnd", fmtTS(end));

      // ✅ Vault earns (Cap + Countdown)
      let capLimit = capLimitByPkg(pkg);
      setText("capLimit", capLimit ? `${capLimit.toFixed(0)} USDT` : "-");

      try {
        const e = await vault.earns(user);

        // earned USDT = claimed+unlocked+locked (Vault-based)
        const earnedUSDT = e.claimedUSDT.add(e.unlockedUSDT).add(e.lockedUSDT);
        const earnedHuman = Number(ethers.utils.formatUnits(earnedUSDT, USDT_DEC));

        setText("earnedTotal", `${earnedHuman.toFixed(2)} USDT`);

        if (capLimit > 0) {
          const remain = Math.max(0, capLimit - earnedHuman);
          setText("capRemain", `${remain.toFixed(2)} / ${capLimit.toFixed(0)} USDT`);
        } else {
          setText("capRemain", "-");
        }

        // lock end: choose USDT lock end (or DF if needed)
        const endU = Number(e.lockEndUSDT || 0);
        const endD = Number(e.lockEndDF || 0);
        vaultEndSec = Math.max(endU, endD);

        const expiredU = e.expiredUSDT || ethers.constants.Zero;
        const expiredD = e.expiredDF || ethers.constants.Zero;
        vaultExpired = expiredU.gt(0) || expiredD.gt(0);

        setText("vaultEnd", vaultEndSec ? fmtTS(vaultEndSec) : "-");
      } catch {
        // if earns not available, keep UI safe
        setText("earnedTotal", "-");
        setText("capRemain", "-");
        setText("vaultEnd", "-");
        vaultEndSec = 0;
        vaultExpired = false;
      }

      startCountdown();
      setStatus(showOk ? "Refreshed ✅" : "Updated ✅");
    } catch (e) {
      console.error(e);
      setStatus("Refresh error: " + (e?.message || e));
      notifyErr("Refresh failed");
    }
  }

  // -------- Actions --------
  async function approveUSDT() {
    if (!user) return alert("Please connect wallet first");
    if (!selectedPkg) return alert("Please select a package first");

    const amt = selectedPkg === 1 ? ethers.utils.parseUnits("100", USDT_DEC)
      : selectedPkg === 2 ? ethers.utils.parseUnits("1000", USDT_DEC)
      : ethers.utils.parseUnits("10000", USDT_DEC);

    try {
      setStatus("Approving USDT...");
      const tx = await usdt.approve(C.CORE, amt);
      await tx.wait();
      setStatus("Approve success ✅");
      notifyOk("Approve USDT success ✅");
    } catch (e) {
      console.error(e);
      const msg = (e?.data?.message || e?.message || e);
      setStatus("Approve fail: " + msg);
      notifyErr("Approve failed");
    }
  }

  async function buy() {
    if (!user) return alert("Please connect wallet first");
    if (!selectedPkg) return alert("Please select a package first");

    let sponsor = ($("inpSponsor").value || "").trim();
    if (sponsor && !ethers.utils.isAddress(sponsor)) return alert("Invalid sponsor address");
    if (!sponsor) sponsor = ethers.constants.AddressZero; // Core fallback (if supported)

    try {
      setStatus("Buying / Upgrading...");
      const tx = await core.buyOrUpgrade(selectedPkg, sponsor, selectedSideRight);
      await tx.wait();

      // wait a moment for state to be readable on mobile
      await new Promise(r => setTimeout(r, 1200));

      setStatus("Buy/Upgrade success ✅");
      notifyOk("Buy/Upgrade success ✅");
      await refreshAll(true);
    } catch (e) {
      console.error(e);
      const msg = (e?.data?.message || e?.message || e);
      setStatus("Buy fail: " + msg);
      notifyErr("Buy/Upgrade failed");
    }
  }

  async function claimVault() {
    if (!user) return alert("Please connect wallet first");
    try {
      setStatus("Claiming (Vault)...");
      const tx = await vault.claim();
      await tx.wait();
      setStatus("Claim Vault success ✅");
      notifyOk("Claim Vault success ✅");
      await refreshAll(true);
    } catch (e) {
      console.error(e);
      const msg = (e?.data?.message || e?.message || e);
      setStatus("Claim Vault fail: " + msg);
      notifyErr("Claim Vault failed");
    }
  }

  async function claimStake() {
    if (!user) return alert("Please connect wallet first");
    try {
      setStatus("Claiming (Staking)...");
      const tx = await staking.claimStake();
      await tx.wait();
      setStatus("Claim Stake success ✅");
      notifyOk("Claim Stake success ✅");
      await refreshAll(true);
    } catch (e) {
      console.error(e);
      const msg = (e?.data?.message || e?.message || e);
      setStatus("Claim Stake fail: " + msg);
      notifyErr("Claim Stake failed");
    }
  }

  async function copyText(t) {
    try {
      await navigator.clipboard.writeText(t);
      notifyOk("Copied ✅");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = t; document.body.appendChild(ta);
      ta.select(); document.execCommand("copy");
      document.body.removeChild(ta);
      notifyOk("Copied ✅");
    }
  }

  // -------- Bind UI --------
  function bindUI() {
    $("btnConnect").onclick = connect;
    $("btnRefresh").onclick = () => refreshAll(true);

    $("btnSideL").onclick = () => chooseSide(false);
    $("btnSideR").onclick = () => chooseSide(true);
    chooseSide(false);

    document.querySelectorAll(".pkg").forEach(btn => {
      btn.onclick = () => choosePkg(btn.dataset.pkg);
    });

    $("btnApprove").onclick = approveUSDT;
    $("btnBuy").onclick = async () => {
      await approveUSDT();
      await buy();
    };

    $("btnClaimVault").onclick = claimVault;
    $("btnClaimStake").onclick = claimStake;

    $("btnCopyLeft").onclick = async () => {
      const t = $("leftLink").textContent;
      if (t && t !== "-") await copyText(t);
    };
    $("btnCopyRight").onclick = async () => {
      const t = $("rightLink").textContent;
      if (t && t !== "-") await copyText(t);
    };
  }

  function initStatic() {
    setText("coreAddr", C.CORE);
    setText("vaultAddr", C.VAULT);
    setText("binaryAddr", C.BINARY);
    setText("stakingAddr", C.STAKING);
    setText("usdtAddr", C.USDT);
    setText("dfAddr", C.DF);

    setText("stakeStart", "-");
    setText("stakeEnd", "-");
    setText("stakeCountdown", "-");
    setText("stakeStatus", "-");

    setText("capLimit", "-");
    setText("capRemain", "-");
    setText("earnedTotal", "-");
    setText("vaultEnd", "-");
    setText("vaultCountdown", "-");
    setText("vaultStatus", "-");

    setStatus("Ready. Please connect wallet.");
  }

  window.addEventListener("load", () => {
    initStatic();
    bindUI();
    parseQuery();
  });
})();
