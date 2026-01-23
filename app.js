/* app.js - 365DF MLM (CoreV4 + VaultV5) User DApp
   Requires:
   - ethers v5 loaded
   - window.APP_CONFIG in config.js
*/

(() => {
  "use strict";

  const C = window.APP_CONFIG || {};
  const $ = (id) => document.getElementById(id);

  // ---------- UI helpers ----------
  function setText(id, text) {
    const el = $(id);
    if (el) el.textContent = text;
  }
  function setHTML(id, html) {
    const el = $(id);
    if (el) el.innerHTML = html;
  }
  function toast(msg, ms = 2200) {
    const t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), ms);
  }
  function setStatus(msg) {
    const el = $("status");
    if (el) el.textContent = msg;
  }
  function shortAddr(a) {
    if (!a) return "-";
    return a.slice(0, 6) + "..." + a.slice(-4);
  }
  function isAddr(a) {
    try { return ethers.utils.isAddress(a); } catch { return false; }
  }

  // ---------- parse query (ref + side) ----------
  function parseQuery() {
    const q = new URLSearchParams(window.location.search);
    const ref = (q.get("ref") || "").trim();
    const side = (q.get("side") || "").trim().toUpperCase(); // L/R
    return { ref, side };
  }

  // ---------- formatting ----------
  function fmtNum(v, decimals = 18, dp = 4) {
    try {
      const n = ethers.utils.formatUnits(v || 0, decimals);
      const x = Number(n);
      if (!isFinite(x)) return n;
      return x.toLocaleString(undefined, { maximumFractionDigits: dp });
    } catch {
      return String(v ?? "0");
    }
  }
  function fmtDate(sec) {
    try {
      const s = Number(sec || 0);
      if (!s) return "-";
      const d = new Date(s * 1000);
      return d.toLocaleString();
    } catch {
      return "-";
    }
  }
  function fmtCountdown(secLeft) {
    const s = Math.max(0, Number(secLeft || 0));
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = Math.floor(s % 60);
    return `${d}d ${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(ss).padStart(2,"0")}`;
  }

  // ---------- Ethers state ----------
  let provider = null;
  let signer = null;
  let user = null;

  let core = null;
  let vault = null;
  let staking = null;

  // token addresses/decimals
  let usdtAddr = C.USDT || null;
  let dfAddr = C.DF || null;
  let usdtDecimals = 18; // BSC USDT (0x55d3...) = 18
  let dfDecimals = 18;

  // UI selections
  let selectedPkg = 0; // 1/2/3
  let selectedSideIsLeft = true;

  // countdown timers
  let stakeTimer = null;
  let lock90Timer = null;

  // ---------- ABIs (from config.js) ----------
  const CORE_ABI = C.CORE_ABI || [];
  const VAULT_ABI = C.VAULT_ABI || [];
  const STAKING_ABI = C.STAKING_ABI || [];
  const ERC20_ABI = C.ERC20_ABI || [
    "function decimals() view returns(uint8)",
    "function symbol() view returns(string)",
    "function allowance(address owner,address spender) view returns(uint256)",
    "function approve(address spender,uint256 amount) returns(bool)",
    "function balanceOf(address a) view returns(uint256)"
  ];

  // ---------- error helpers ----------
  function pickRevertMsg(e) {
    const msg =
      e?.error?.message ||
      e?.reason ||
      e?.data?.message ||
      e?.message ||
      "";
    return String(msg);
  }
  function humanizeRevert(msg) {
    if (!msg) return "Transaction reverted";
    if (msg.includes("SIDE_TAKEN")) return "ฝั่งนี้เต็มแล้ว (SIDE_TAKEN) → ลองเปลี่ยน Left/Right";
    if (msg.includes("NOT_REGISTERED")) return "ยังไม่ได้สมัครในระบบ (NOT_REGISTERED)";
    if (msg.includes("UPGRADE")) return "ต้องอัพเกรดแพ็คเกจก่อนถึงจะเคลม/ปลดล็อกได้";
    if (msg.includes("CAP")) return "ติด CAP ของแพ็คเกจ → ต้องอัพเกรดแพ็คเกจ";
    if (msg.includes("EXPIRE") || msg.includes("Expired")) return "ยอดหมดอายุแล้ว/ใกล้หมดอายุ";
    if (msg.includes("insufficient funds")) return "BNB ไม่พอจ่ายค่า Gas";
    return msg;
  }
  async function safeSend(txPromise, label = "Tx") {
    const tx = await txPromise;
    toast(`${label}: ส่งธุรกรรมแล้ว...`);
    const rc = await tx.wait();
    return rc;
  }

  // ---------- init static labels ----------
  function fillStatic() {
    setText("coreAddr", C.CORE || "-");
    setText("vaultAddr", C.VAULT || "-");
    setText("binaryAddr", C.BINARY || "-");
    setText("stakingAddr", C.STAKING || "-");
    setText("usdtAddr", C.USDT || "-");
    setText("dfAddr", C.DF || "-");
  }

  // ---------- build referral links ----------
  function setReferralLinks() {
    const base = (location.origin + location.pathname).replace(/\/index\.html$/i, "/");
    if (!user) {
      setText("leftLink", "-");
      setText("rightLink", "-");
      return;
    }
    const left = `${base}?ref=${user}&side=L`;
    const right = `${base}?ref=${user}&side=R`;
    setText("leftLink", left);
    setText("rightLink", right);
  }

  async function copyText(id) {
    const t = $(id)?.textContent || "";
    if (!t || t === "-") return toast("ไม่มีลิงก์ให้คัดลอก");
    try {
      await navigator.clipboard.writeText(t);
      toast("คัดลอกแล้ว ✅");
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = t;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      toast("คัดลอกแล้ว ✅");
    }
  }

  // ---------- connect wallet ----------
  async function connectWallet() {
    try {
      if (!window.ethereum) {
        toast("ไม่พบกระเป๋า (MetaMask/Bitget)");
        setStatus("No wallet detected");
        return;
      }

      provider = new ethers.providers.Web3Provider(window.ethereum, "any");
      await provider.send("eth_requestAccounts", []);
      signer = provider.getSigner();
      user = await signer.getAddress();

      // network check
      const net = await provider.getNetwork();
      setText("netText", `${net.name || "network"} (${net.chainId})`);

      if (C.CHAIN_ID_DEC && Number(net.chainId) !== Number(C.CHAIN_ID_DEC)) {
        toast("กรุณาเปลี่ยนไป BSC Mainnet");
        setStatus("Wrong network: please switch to BSC");
        // ไม่ auto switch เพื่อกันบางกระเป๋าค้าง
      }

      setText("walletAddr", shortAddr(user));

      // create contracts
      if (!C.CORE || !C.VAULT || !C.STAKING) {
        toast("config.js ยังไม่ครบ (CORE/VAULT/STAKING)");
        setStatus("Missing addresses in config.js");
      }

      core = new ethers.Contract(C.CORE, CORE_ABI, signer);
      vault = new ethers.Contract(C.VAULT, VAULT_ABI, signer);
      staking = new ethers.Contract(C.STAKING, STAKING_ABI, signer);

      // resolve token addrs if not set
      try {
        if (!usdtAddr) usdtAddr = await core.USDT();
        if (!dfAddr) dfAddr = await core.DF();
      } catch {}

      setText("coreAddr", C.CORE);
      setText("vaultAddr", C.VAULT);
      setText("stakingAddr", C.STAKING);
      setText("usdtAddr", usdtAddr || C.USDT || "-");
      setText("dfAddr", dfAddr || C.DF || "-");

      // decimals
      await loadTokenDecimals();

      // apply query sponsor/side
      applySponsorFromQuery();

      // referral links
      setReferralLinks();

      // refresh
      await refreshAll();

      setStatus("Connected ✅");
      toast("เชื่อมต่อแล้ว ✅");

      // watch changes
      window.ethereum.on?.("accountsChanged", () => location.reload());
      window.ethereum.on?.("chainChanged", () => location.reload());
    } catch (e) {
      console.warn(e);
      toast("เชื่อมต่อไม่สำเร็จ");
      setStatus("Connect failed");
    }
  }

  async function loadTokenDecimals() {
    try {
      if (usdtAddr) {
        const usdt = new ethers.Contract(usdtAddr, ERC20_ABI, provider || signer);
        usdtDecimals = await usdt.decimals();
      }
    } catch { usdtDecimals = 18; }

    try {
      if (dfAddr) {
        const df = new ethers.Contract(dfAddr, ERC20_ABI, provider || signer);
        dfDecimals = await df.decimals();
      }
    } catch { dfDecimals = 18; }
  }

  function applySponsorFromQuery() {
    const { ref, side } = parseQuery();
    if (ref && isAddr(ref)) {
      const inp = $("inpSponsor");
      if (inp) inp.value = ref;
    }
    if (side === "R") setSide(false);
    if (side === "L") setSide(true);
  }

  // ---------- package selection ----------
  function setSide(isLeft) {
    selectedSideIsLeft = !!isLeft;
    const bL = $("btnSideL"), bR = $("btnSideR");
    if (bL && bR) {
      if (selectedSideIsLeft) {
        bL.classList.add("primary"); bR.classList.remove("primary");
      } else {
        bR.classList.add("primary"); bL.classList.remove("primary");
      }
    }
  }

  function bindPkgButtons() {
    document.querySelectorAll(".pkg").forEach((btn) => {
      btn.addEventListener("click", () => {
        const p = Number(btn.dataset.pkg || 0);
        selectedPkg = p;
        // highlight
        document.querySelectorAll(".pkg").forEach((x) => x.classList.remove("active"));
        btn.classList.add("active");

        const name = p === 1 ? "Small" : p === 2 ? "Medium" : p === 3 ? "Large" : "-";
        setText("selectedPkg", name);
      });
    });
  }

  // ---------- Approve USDT ----------
  async function approveUSDT() {
    try {
      if (!usdtAddr) return toast("ไม่พบ USDT address");
      if (!core) return toast("ยังไม่เชื่อมต่อ");

      const usdt = new ethers.Contract(usdtAddr, ERC20_ABI, signer);

      // approve unlimited
      const MAX = ethers.constants.MaxUint256;

      // callStatic approve ไม่ค่อยมี revert แต่ใส่ gas เผื่อ
      let gasLimit;
      try {
        const g = await usdt.estimateGas.approve(C.CORE, MAX);
        gasLimit = g.mul(125).div(100);
      } catch {
        gasLimit = ethers.BigNumber.from("120000");
      }

      setStatus("กำลัง Approve USDT...");
      await safeSend(usdt.approve(C.CORE, MAX, { gasLimit }), "Approve USDT");
      toast("Approve สำเร็จ ✅");
      setStatus("Loaded ✅");
    } catch (e) {
      const raw = pickRevertMsg(e);
      toast(humanizeRevert(raw));
      setStatus("Approve failed");
      console.warn(e);
    }
  }

  // ---------- Buy/Upgrade (Fix UNPREDICTABLE_GAS_LIMIT) ----------
  async function buyOrUpgrade() {
    try {
      if (!core) return toast("ยังไม่เชื่อมต่อ");

      if (!selectedPkg) {
        toast("กรุณาเลือกแพ็คเกจ");
        return;
      }

      const sponsorIn = ($("inpSponsor")?.value || "").trim();
      let sponsor = sponsorIn;

      if (!sponsor) {
        try { sponsor = await core.COMPANY_WALLET(); } catch {}
      }
      if (!sponsor || !isAddr(sponsor)) {
        toast("Sponsor ไม่ถูกต้อง");
        return;
      }

      const sideRight = !selectedSideIsLeft;
      const newPkg = Number(selectedPkg);

      // 1) callStatic - get revert reason
      try {
        await core.callStatic.buyOrUpgrade(newPkg, sponsor, sideRight);
      } catch (e) {
        const raw = pickRevertMsg(e);
        const nice = humanizeRevert(raw);
        console.warn("callStatic revert:", raw, e);
        setStatus("Buy/Upgrade reverted: " + nice);
        toast(nice);
        return;
      }

      // 2) estimateGas + gasLimit
      let gasLimit;
      try {
        const g = await core.estimateGas.buyOrUpgrade(newPkg, sponsor, sideRight);
        gasLimit = g.mul(125).div(100);
      } catch {
        gasLimit = ethers.BigNumber.from("800000");
      }

      setStatus("กำลัง Buy/Upgrade...");
      await safeSend(core.buyOrUpgrade(newPkg, sponsor, sideRight, { gasLimit }), "Buy/Upgrade");

      toast("Buy/Upgrade สำเร็จ ✅");
      await refreshAll();
      setStatus("Loaded ✅");
    } catch (e) {
      const raw = pickRevertMsg(e);
      const nice = humanizeRevert(raw);
      console.warn(e);
      setStatus("Buy/Upgrade failed: " + nice);
      toast(nice);
    }
  }

  // ---------- Vault claim (Fix gas) ----------
  async function claimVault() {
    try {
      if (!vault) return toast("ยังไม่เชื่อมต่อ");

      try {
        await vault.callStatic.claim();
      } catch (e) {
        const raw = pickRevertMsg(e);
        const nice = humanizeRevert(raw);
        setStatus("Claim vault reverted: " + nice);
        toast(nice);
        return;
      }

      let gasLimit;
      try {
        const g = await vault.estimateGas.claim();
        gasLimit = g.mul(125).div(100);
      } catch {
        gasLimit = ethers.BigNumber.from("600000");
      }

      setStatus("กำลัง Claim Vault...");
      await safeSend(vault.claim({ gasLimit }), "Claim Vault");
      toast("Claim Vault สำเร็จ ✅");
      await refreshVault();
      setStatus("Loaded ✅");
    } catch (e) {
      const raw = pickRevertMsg(e);
      const nice = humanizeRevert(raw);
      console.warn(e);
      setStatus("Claim failed: " + nice);
      toast(nice);
    }
  }

  // ---------- Stake claim (Fix gas) ----------
  async function claimStake() {
    try {
      if (!staking) return toast("ยังไม่เชื่อมต่อ");

      try {
        await staking.callStatic.claimStake();
      } catch (e) {
        const raw = pickRevertMsg(e);
        const nice = humanizeRevert(raw);
        setStatus("Claim stake reverted: " + nice);
        toast(nice);
        return;
      }

      let gasLimit;
      try {
        const g = await staking.estimateGas.claimStake();
        gasLimit = g.mul(125).div(100);
      } catch {
        gasLimit = ethers.BigNumber.from("700000");
      }

      setStatus("กำลัง Claim Stake...");
      await safeSend(staking.claimStake({ gasLimit }), "Claim Stake");
      toast("Claim Stake สำเร็จ ✅");
      await refreshStaking();
      setStatus("Loaded ✅");
    } catch (e) {
      const raw = pickRevertMsg(e);
      const nice = humanizeRevert(raw);
      console.warn(e);
      setStatus("Claim stake failed: " + nice);
      toast(nice);
    }
  }

  // ---------- Refresh all ----------
  async function refreshAll() {
    await Promise.allSettled([
      refreshCore(),
      refreshStaking(),
      refreshVault(),
      refreshCommissionUSDTCap()
    ]);
  }

  // ---------- Core dashboard ----------
  async function refreshCore() {
    try {
      if (!core || !user) return;

      // users(u): sponsor,parent,sideRight,pkg,rank,directSmallOrMore
      const u = await core.users(user);

      const sponsor = u.sponsor;
      const sideRight = u.sideRight;
      const pkg = Number(u.pkg);
      const rank = Number(u.rank);

      setText("mySponsor", sponsor && sponsor !== ethers.constants.AddressZero ? shortAddr(sponsor) : "-");
      setText("mySide", sideRight ? "Right" : "Left");

      setText("myPkg", pkgName(pkg));
      setText("myRank", rankName(rank));

      // children
      try {
        const l = await core.leftChild(user);
        const r = await core.rightChild(user);
        setText("leftChild", (l && l !== ethers.constants.AddressZero) ? shortAddr(l) : "-");
        setText("rightChild", (r && r !== ethers.constants.AddressZero) ? shortAddr(r) : "-");
      } catch {}

      // volumes (ถ้า CoreV4 ไม่มีฟังก์ชัน volume ใน ABI ก็จะไม่แสดง)
      // ถ้าคุณมีฟังก์ชันใน ABI เพิ่ม เช่น binaryVolumeL/R/P ให้ใส่ใน config แล้วผมจะดึงให้ได้
      // ที่นี่ขอ set เป็น "-" ถ้าไม่มี
      if ($("volL")) setText("volL", "-");
      if ($("volR")) setText("volR", "-");
      if ($("volP")) setText("volP", "-");
    } catch (e) {
      console.warn("refreshCore error", e);
    }
  }

  // ---------- Staking dashboard ----------
  async function refreshStaking() {
    try {
      if (!staking || !user) return;

      // stakes(user): (pkg, principal, start, end, claimed)
      const s = await staking.stakes(user);
      const pkg = Number(s.pkg);
      const principal = s.principal;
      const start = Number(s.start);
      const end = Number(s.end);
      const claimed = Boolean(s.claimed);

      setText("stakeStart", fmtDate(start));
      setText("stakeEnd", fmtDate(end));

      // pendingReward(user)
      try {
        const pending = await staking.pendingReward(user);
        setText("pendingStake", `${fmtNum(pending, dfDecimals, 4)} DF`);
      } catch {
        setText("pendingStake", "-");
      }

      // status + countdown
      const now = Math.floor(Date.now() / 1000);
      const left = end ? Math.max(0, end - now) : 0;

      if (stakeTimer) clearInterval(stakeTimer);
      stakeTimer = setInterval(() => {
        const n = Math.floor(Date.now() / 1000);
        const l = end ? Math.max(0, end - n) : 0;
        setText("stakeCountdown", end ? fmtCountdown(l) : "-");
      }, 1000);

      setText("stakeCountdown", end ? fmtCountdown(left) : "-");

      let st = "-";
      if (!start || !end || pkg === 0) st = "No Stake";
      else if (claimed) st = "Claimed";
      else if (now < end) st = "Locked";
      else st = "Matured (claimable)";

      setText("stakeStatus", st);
    } catch (e) {
      console.warn("refreshStaking error", e);
    }
  }

  // ---------- Vault dashboard ----------
  async function refreshVault() {
    try {
      if (!vault || !user) return;

      // claimableUSDT/DF(u)
      try {
        const cu = await vault.claimableUSDT(user);
        setText("claimUSDT", `${fmtNum(cu, usdtDecimals, 4)} USDT`);
      } catch { setText("claimUSDT", "-"); }

      try {
        const cd = await vault.claimableDF(user);
        setText("claimDF", `${fmtNum(cd, dfDecimals, 4)} DF`);
      } catch { setText("claimDF", "-"); }
    } catch (e) {
      console.warn("refreshVault error", e);
    }
  }

  // ---------- Commission (USDT Cap) from earns(u) ----------
  // You confirmed:
  // - cap counts only USDT
  // - commission is inside earns(u)
  async function refreshCommissionUSDTCap() {
    // optional: ถ้าหน้าไม่มี section นี้ก็ไม่ทำ
    if (!$("comTotal") && !$("comMax") && !$("comClaimNow")) return;

    try {
      if (!vault || !user) return;

      // earns(u):
      // unlockedUSDT, claimedUSDT, lockedUSDT, lockStartUSDT, lockEndUSDT, expiredUSDT,
      // unlockedDF, claimedDF, lockedDF, lockStartDF, lockEndDF, expiredDF
      const e = await vault.earns(user);

      const unlockedUSDT = e.unlockedUSDT;
      const claimedUSDT = e.claimedUSDT;
      const lockedUSDT = e.lockedUSDT;
      const lockStartUSDT = Number(e.lockStartUSDT);
      const lockEndUSDT = Number(e.lockEndUSDT);
      const expiredUSDT = e.expiredUSDT;

      // Total commission (USDT only)
      const total = unlockedUSDT.add(lockedUSDT).add(claimedUSDT).add(expiredUSDT);

      // Max claimable by package: Small=365 / Medium=3650 / Large=36500
      const pkgText = ($("myPkg")?.textContent || "").toLowerCase();
      let cap = 0;
      // ถ้าอยากแม่น 100% ให้ config ใส่ CAP_BY_PKG หรือดึงจาก CoreV4 pkg
      // ที่นี่ใช้ pkg จาก core.users(u).pkg จะชัวร์กว่า
      try {
        const u = await core.users(user);
        const pkg = Number(u.pkg);
        cap = (pkg === 1) ? 365 : (pkg === 2) ? 3650 : (pkg === 3) ? 36500 : 0;
      } catch {
        // fallback จาก text
        if (pkgText.includes("small")) cap = 365;
        else if (pkgText.includes("medium")) cap = 3650;
        else if (pkgText.includes("large")) cap = 36500;
        else cap = 0;
      }

      // Claimable now "ภายใต้ CAP":
      // หลักคิด (ปลอดภัย): สิ่งที่เคลมได้ทันที = claimableUSDT(u) (VaultV5 คำนวณให้แล้ว)
      // แต่คุณอยากโชว์ "คอมทั้งหมด" vs "เคลมได้แค่นี้" + "locked ต้องอัพเกรด"
      // เราจะให้:
      // - claimNow = claimableUSDT(u)
      // - lockedNeedUpgrade = max(0, total - claimed - claimNow - expired?) (ตีความ: ส่วนที่ถูกล็อก)
      const claimNowRaw = await vault.claimableUSDT(user);

      // lockedUSDT ใน earns คือส่วนที่ "ล็อกเพราะ cap/เงื่อนไข" ให้โชว์ตรงๆ
      const lockedNeedUpgrade = lockedUSDT;

      // 90 days countdown จาก lockStart/lockEnd (ถ้า contract ใช้ LOCK_DAYS = 90)
      // lockEndUSDT คือ end lock (expire) จาก vault
      const now = Math.floor(Date.now() / 1000);
      const left = lockEndUSDT ? Math.max(0, lockEndUSDT - now) : 0;

      // render
      setText("comTotal", `${fmtNum(total, usdtDecimals, 4)} USDT`);
      setText("comMax", `${cap.toLocaleString()} USDT`);
      setText("comClaimNow", `${fmtNum(claimNowRaw, usdtDecimals, 4)} USDT`);
      setText("comLocked", `${fmtNum(lockedNeedUpgrade, usdtDecimals, 4)} USDT`);

      setText("comLockStart", fmtDate(lockStartUSDT));
      setText("comLockEnd", fmtDate(lockEndUSDT));
      setText("comExpired", `${fmtNum(expiredUSDT, usdtDecimals, 4)} USDT`);

      // status
      let st = "OK";
      if (lockedNeedUpgrade.gt(0)) st = "LOCKED (Upgrade required)";
      if (expiredUSDT.gt(0)) st = "EXPIRED (Lost)";
      setText("comStatus", st);

      // countdown timer
      if (lock90Timer) clearInterval(lock90Timer);
      lock90Timer = setInterval(() => {
        const n = Math.floor(Date.now() / 1000);
        const l = lockEndUSDT ? Math.max(0, lockEndUSDT - n) : 0;
        setText("comCountdown", lockEndUSDT ? fmtCountdown(l) : "-");
      }, 1000);
      setText("comCountdown", lockEndUSDT ? fmtCountdown(left) : "-");

    } catch (e) {
      console.warn("refreshCommissionUSDTCap error", e);
    }
  }

  // ---------- names ----------
  function pkgName(p) {
    if (p === 1) return "Small";
    if (p === 2) return "Medium";
    if (p === 3) return "Large";
    return "-";
  }
  function rankName(r) {
    // ปรับ mapping ตาม CoreV4 ของคุณได้
    const map = {
      0: "None",
      1: "Rank 1",
      2: "Rank 2",
      3: "Rank 3",
      4: "Rank 4",
      5: "Rank 5"
    };
    return map[r] || String(r ?? "-");
  }

  // ---------- bind events ----------
  function bindUI() {
    $("btnConnect")?.addEventListener("click", connectWallet);
    $("btnRefresh")?.addEventListener("click", refreshAll);

    $("btnCopyLeft")?.addEventListener("click", () => copyText("leftLink"));
    $("btnCopyRight")?.addEventListener("click", () => copyText("rightLink"));

    $("btnSideL")?.addEventListener("click", () => setSide(true));
    $("btnSideR")?.addEventListener("click", () => setSide(false));

    $("btnApprove")?.addEventListener("click", approveUSDT);
    $("btnBuy")?.addEventListener("click", async () => {
      // approve + buy
      await approveUSDT();
      await buyOrUpgrade();
    });

    $("btnClaimVault")?.addEventListener("click", claimVault);
    $("btnClaimStake")?.addEventListener("click", claimStake);

    bindPkgButtons();
  }

  // ---------- boot ----------
  function boot() {
    fillStatic();
    bindUI();
    setStatus("Ready. กรุณา Connect Wallet");
    // preselect side from query
    applySponsorFromQuery();
  }

  window.addEventListener("load", boot);
})();
