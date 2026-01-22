(() => {
  "use strict";

  const C = window.APP_CONFIG;

  const $ = (id) => document.getElementById(id);
  const setText = (id, text) => { const el = $(id); if (el) el.textContent = (text ?? "-"); };
  const shortAddr = (a) => (a ? a.slice(0, 6) + "..." + a.slice(-4) : "-");

  function toast(msg, type="ok") {
    const el = $("toast");
    if (!el) { alert(msg); return; }
    el.classList.remove("show","ok","err");
    el.textContent = msg;
    el.classList.add(type === "err" ? "err" : "ok");
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 2600);
  }
  const ok = (m) => toast(m, "ok");
  const err = (m) => toast(m, "err");

  const fmtTS = (sec) => {
    if (!sec || Number(sec) === 0) return "-";
    try { return new Date(Number(sec) * 1000).toLocaleString(); } catch { return "-"; }
  };
  const fmt18 = (x) => {
    try { return ethers.utils.formatUnits(x, 18); } catch { return String(x); }
  };
  const countdownText = (endSec) => {
    const now = Math.floor(Date.now() / 1000);
    const diff = Number(endSec) - now;
    if (!endSec || Number(endSec) === 0) return { text:"-", done:false };
    if (diff <= 0) return { text:"00:00:00", done:true };

    const days = Math.floor(diff / 86400);
    const hrs  = Math.floor((diff % 86400) / 3600);
    const mins = Math.floor((diff % 3600) / 60);
    const secs = diff % 60;

    const hh = String(hrs).padStart(2,"0");
    const mm = String(mins).padStart(2,"0");
    const ss = String(secs).padStart(2,"0");
    return { text: `${days}d ${hh}:${mm}:${ss}`, done:false };
  };

  // -------- State --------
  let provider=null, signer=null, user=null;
  let usdt=null, core=null, vault=null, binary=null, staking=null;

  let selectedPkg = 0;
  let selectedSideRight = false;
  let timer = null;

  const PKG_NAME  = ["None","Small","Medium","Large"];
  const RANK_NAME = ["None","Bronze","Silver","Gold"];

  async function ensureBSC() {
    const net = await provider.getNetwork();
    if (net.chainId === 56) return true;

    try {
      await provider.send("wallet_switchEthereumChain", [{ chainId: C.CHAIN_ID_HEX }]);
      return true;
    } catch (e) {
      try {
        await provider.send("wallet_addEthereumChain", [{
          chainId: C.CHAIN_ID_HEX,
          chainName: C.CHAIN_NAME,
          nativeCurrency: { name:"BNB", symbol:"BNB", decimals:18 },
          rpcUrls: [C.RPC_URL],
          blockExplorerUrls: [C.BLOCK_EXPLORER]
        }]);
        return true;
      } catch {
        throw new Error("กรุณาเปลี่ยนเป็น BSC Mainnet ในกระเป๋าก่อน");
      }
    }
  }

  function chooseSide(isRight) {
    selectedSideRight = !!isRight;
    $("btnSideL")?.classList.toggle("primary", !selectedSideRight);
    $("btnSideR")?.classList.toggle("primary",  selectedSideRight);
  }

  function choosePkg(p) {
    selectedPkg = Number(p);
    const name = selectedPkg === 1 ? "Small (100 USDT)"
               : selectedPkg === 2 ? "Medium (1,000 USDT)"
               : selectedPkg === 3 ? "Large (10,000 USDT)" : "-";
    setText("selectedPkg", name);

    document.querySelectorAll(".pkg").forEach(btn => {
      btn.classList.toggle("sel", Number(btn.dataset.pkg) === selectedPkg);
    });
  }

  function buildReferralLinks() {
    if (!user) return;
    const base = location.origin + location.pathname.replace(/index\.html$/i, "");
    setText("leftLink",  `${base}?ref=${user}&side=L`);
    setText("rightLink", `${base}?ref=${user}&side=R`);
  }

  function parseQueryIntoUI() {
    const q = new URLSearchParams(location.search);
    const ref = q.get("ref");
    const side = (q.get("side") || "").toUpperCase();
    if (ref && ethers.utils.isAddress(ref) && $("inpSponsor")) $("inpSponsor").value = ref;
    if (side === "R") chooseSide(true);
    if (side === "L") chooseSide(false);
  }

  async function copyText(t) {
    try {
      await navigator.clipboard.writeText(t);
      ok("คัดลอกแล้ว ✅");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = t; document.body.appendChild(ta);
      ta.select(); document.execCommand("copy");
      document.body.removeChild(ta);
      ok("คัดลอกแล้ว ✅");
    }
  }

  async function approveUSDT() {
    if (!user) return err("กรุณา Connect Wallet ก่อน");
    if (!selectedPkg) return err("กรุณาเลือกแพ็คเกจก่อน");

    const amt = selectedPkg === 1 ? ethers.utils.parseUnits("100", 18)
              : selectedPkg === 2 ? ethers.utils.parseUnits("1000", 18)
              : ethers.utils.parseUnits("10000", 18);

    try {
      setText("status", "Approving USDT...");
      const tx = await usdt.approve(C.CORE, amt);
      await tx.wait();
      setText("status", "Approve สำเร็จ ✅");
      ok("Approve USDT สำเร็จ ✅");
    } catch (e) {
      console.error(e);
      setText("status", "Approve fail: " + (e?.data?.message || e?.message || e));
      err("Approve ไม่สำเร็จ");
    }
  }

  async function buyOrUpgrade() {
    if (!user) return err("กรุณา Connect Wallet ก่อน");
    if (!selectedPkg) return err("กรุณาเลือกแพ็คเกจก่อน");

    let sponsor = ($("inpSponsor")?.value || "").trim();
    if (sponsor && !ethers.utils.isAddress(sponsor)) return err("Sponsor address ไม่ถูกต้อง");
    if (!sponsor) sponsor = ethers.constants.AddressZero;

    try {
      setText("status", "Buying / Upgrading...");
      const tx = await core.buyOrUpgrade(selectedPkg, sponsor, selectedSideRight);
      await tx.wait();
      setText("status", "Buy/Upgrade สำเร็จ ✅");
      ok("Buy/Upgrade สำเร็จ ✅");
      await refreshAll(true);
    } catch (e) {
      console.error(e);
      setText("status", "Buy fail: " + (e?.data?.message || e?.message || e));
      err("Buy/Upgrade ไม่สำเร็จ");
    }
  }

  async function claimVault() {
    if (!user) return err("กรุณา Connect Wallet ก่อน");
    try {
      setText("status", "Claiming Vault...");
      const tx = await vault.claim();
      await tx.wait();
      setText("status", "Claim Vault สำเร็จ ✅");
      ok("Claim Vault สำเร็จ ✅");
      await refreshAll(true);
    } catch (e) {
      console.error(e);
      setText("status", "Claim Vault fail: " + (e?.data?.message || e?.message || e));
      err("Claim Vault ไม่สำเร็จ");
    }
  }

  async function claimStake() {
    if (!user) return err("กรุณา Connect Wallet ก่อน");
    try {
      setText("status", "Claiming Stake...");
      const tx = await staking.claimStake();
      await tx.wait();
      setText("status", "Claim Stake สำเร็จ ✅");
      ok("Claim Stake สำเร็จ ✅");
      await refreshAll(true);
    } catch (e) {
      console.error(e);
      setText("status", "Claim Stake fail: " + (e?.data?.message || e?.message || e));
      err("Claim Stake ไม่สำเร็จ");
    }
  }

  function stopTimer(){ if (timer) clearInterval(timer); timer=null; }

  function renderStakeCountdown(stakeEnd, principal, claimed) {
    const c = countdownText(stakeEnd);
    setText("stakeCountdown", c.text);
    let status = "-";
    if (!principal || principal === "0") status = "No stake";
    else if (claimed) status = "Claimed ✅";
    else status = c.done ? "Matured ✅ (กด Claim Stake ได้)" : "Locked";
    setText("stakeStatus", status);
  }

  async function refreshAll(showOk=false) {
    if (!user) return;
    try {
      setText("status", "Refreshing...");

      // ---- Core user ----
      const u = await core.users(user);
      const sponsor = u.sponsor;
      const pkg = Number(u.pkg);
      const rank = Number(u.rank);
      const sideRight = !!u.sideRight;

      setText("netText", "BSC (56)");
      setText("walletAddr", user);
      setText("mySponsor", sponsor === ethers.constants.AddressZero ? "-" : sponsor);
      setText("mySide", pkg === 0 ? "-" : (sideRight ? "Right" : "Left"));
      setText("myPkg", PKG_NAME[pkg] || "-");
      setText("myRank", RANK_NAME[rank] || "-");

      const l = await core.leftChild(user);
      const r = await core.rightChild(user);
      setText("leftChild",  l === ethers.constants.AddressZero ? "-" : l);
      setText("rightChild", r === ethers.constants.AddressZero ? "-" : r);

      // ---- Binary ----
      const vols = await binary.volumesOf(user);
      setText("volL", fmt18(vols.l));
      setText("volR", fmt18(vols.r));
      setText("volP", fmt18(vols.p));

      // ---- VaultV5 claimable ----
      const cU = await vault.claimableUSDT(user);
      const cD = await vault.claimableDF(user);
      setText("claimUSDT", fmt18(cU));
      setText("claimDF", fmt18(cD));

      // ---- Staking ----
      const pending = await staking.pendingReward(user);
      setText("pendingStake", fmt18(pending));

      const s = await staking.stakes(user);
      const stakeStart = Number(s.start);
      const stakeEnd   = Number(s.end);
      const stakeClaimed = !!s.claimed;
      const stakePrincipal = (s.principal ? s.principal.toString() : "0");

      setText("stakeStart", fmtTS(stakeStart));
      setText("stakeEnd",   fmtTS(stakeEnd));

      stopTimer();
      renderStakeCountdown(stakeEnd, stakePrincipal, stakeClaimed);
      timer = setInterval(() => renderStakeCountdown(stakeEnd, stakePrincipal, stakeClaimed), 1000);

      setText("status", showOk ? "Refreshed ✅" : "Updated ✅");
    } catch (e) {
      console.error(e);
      setText("status", "Refresh error: " + (e?.message || e));
      err("Refresh ไม่สำเร็จ");
    }
  }

  async function connect() {
    try {
      if (!window.ethereum) return alert("ไม่พบ Wallet (MetaMask/Bitget). กรุณาเปิดผ่าน DApp Browser");
      if (typeof window.ethers === "undefined") return alert("ethers ไม่ถูกโหลด (เช็ก index.html ว่ามี ethers ก่อน app.js)");

      provider = new ethers.providers.Web3Provider(window.ethereum, "any");
      await provider.send("eth_requestAccounts", []);
      signer = provider.getSigner();
      user = await signer.getAddress();

      await ensureBSC();

      usdt   = new ethers.Contract(C.USDT,   C.ERC20_ABI, signer);
      core   = new ethers.Contract(C.CORE,   C.CORE_ABI, signer);
      vault  = new ethers.Contract(C.VAULT,  C.VAULT_ABI, signer);
      binary = new ethers.Contract(C.BINARY, C.BINARY_ABI, signer);
      staking= new ethers.Contract(C.STAKING,C.STAKING_ABI, signer);

      // fill static addresses
      setText("coreAddr", C.CORE);
      setText("vaultAddr", C.VAULT);
      setText("binaryAddr", C.BINARY);
      setText("stakingAddr", C.STAKING);
      setText("usdtAddr", C.USDT);
      setText("dfAddr", C.DF);

      $("btnConnect").textContent = "Connected";
      $("btnConnect").disabled = true;

      buildReferralLinks();
      await refreshAll(true);

      window.ethereum.on?.("accountsChanged", () => location.reload());
      window.ethereum.on?.("chainChanged", () => location.reload());

    } catch (e) {
      console.error(e);
      setText("status", "Connect error: " + (e?.message || e));
      err(e?.message || "Connect ไม่สำเร็จ");
    }
  }

  function initStatic() {
    setText("coreAddr", C.CORE);
    setText("vaultAddr", C.VAULT);
    setText("binaryAddr", C.BINARY);
    setText("stakingAddr", C.STAKING);
    setText("usdtAddr", C.USDT);
    setText("dfAddr", C.DF);
    setText("status", "Ready. กรุณา Connect Wallet");
  }

  function bindUI() {
    $("btnConnect")?.addEventListener("click", connect);
    $("btnRefresh")?.addEventListener("click", () => refreshAll(true));

    $("btnSideL")?.addEventListener("click", () => chooseSide(false));
    $("btnSideR")?.addEventListener("click", () => chooseSide(true));
    chooseSide(false);

    document.querySelectorAll(".pkg").forEach(btn => {
      btn.addEventListener("click", () => choosePkg(btn.dataset.pkg));
    });

    $("btnApprove")?.addEventListener("click", approveUSDT);
    $("btnBuy")?.addEventListener("click", async () => { await approveUSDT(); await buyOrUpgrade(); });

    $("btnClaimVault")?.addEventListener("click", claimVault);
    $("btnClaimStake")?.addEventListener("click", claimStake);

    $("btnCopyLeft")?.addEventListener("click", async () => {
      const t = $("leftLink")?.textContent;
      if (t && t !== "-") await copyText(t);
    });
    $("btnCopyRight")?.addEventListener("click", async () => {
      const t = $("rightLink")?.textContent;
      if (t && t !== "-") await copyText(t);
    });
  }

  window.addEventListener("load", () => {
    initStatic();
    bindUI();
    parseQueryIntoUI();
  });

})();
