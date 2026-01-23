(() => {
  "use strict";

  const C = window.APP_CONFIG;

  // ---------- DOM helpers ----------
  const $ = (id) => document.getElementById(id);
  const setText = (id, text) => { const el = $(id); if (el) el.textContent = text; };
  const toast = (msg) => {
    const t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.style.display = "block";
    clearTimeout(toast._tm);
    toast._tm = setTimeout(() => (t.style.display = "none"), 2600);
  };
  const setStatus = (msg) => setText("status", msg);

  const isAddr = (a) => { try { return ethers.utils.isAddress(a); } catch { return false; } };
  const zaddr = ethers.constants.AddressZero;

  const fmtAddr = (a) => a ? (a.slice(0, 6) + "..." + a.slice(-4)) : "-";
  const fmtDate = (sec) => {
    const s = Number(sec || 0);
    if (!s) return "-";
    try { return new Date(s * 1000).toLocaleString(); } catch { return "-"; }
  };
  const fmtDur = (sec) => {
    let s = Math.max(0, Number(sec || 0));
    const d = Math.floor(s / 86400); s -= d * 86400;
    const h = Math.floor(s / 3600); s -= h * 3600;
    const m = Math.floor(s / 60); s -= m * 60;
    const ss = Math.floor(s);
    return `${d}d ${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(ss).padStart(2,"0")}`;
  };

  // ---------- State ----------
  let provider = null;
  let signer = null;
  let user = null;

  let core = null;
  let vault = null;
  let staking = null;

  let usdt = null;
  let df = null;

  let usdtDecimals = 18;
  let dfDecimals = 18;

  // UI state
  let selectedPkg = 1;
  let selectedSideIsLeft = true;

  let timersStarted = false;
  let cache = {
    stakeEnd: 0,
    lockEndUSDT: 0,
  };

  // ---------- Init UI ----------
  function fillStatic() {
    setText("coreAddr", C.CORE_V4);
    setText("vaultAddr", C.VAULT_V5);
    setText("binaryAddr", C.BINARY_V4);
    setText("stakingAddr", C.STAKING_365_V4);
    setText("usdtAddr", C.USDT);
    setText("dfAddr", C.DF);

    // default selection
    setPkg(1);
    setSide(true);

    // parse referral query
    const url = new URL(window.location.href);
    const ref = url.searchParams.get("ref");
    const side = url.searchParams.get("side");
    if (ref && isAddr(ref)) $("inpSponsor").value = ref;
    if (side === "R") setSide(false);
    if (side === "L") setSide(true);
  }

  function buildReferralLinks() {
    const base = `${window.location.origin}${window.location.pathname}`;
    if (!user || !isAddr(user)) {
      setText("leftLink", "-");
      setText("rightLink", "-");
      return;
    }
    const left = `${base}?ref=${user}&side=L`;
    const right = `${base}?ref=${user}&side=R`;
    setText("leftLink", left);
    setText("rightLink", right);
  }

  function setPkg(p) {
    selectedPkg = Number(p);
    for (const id of ["pkg1","pkg2","pkg3"]) $(id)?.classList.remove("active");
    $(`pkg${selectedPkg}`)?.classList.add("active");
    const pk = C.PACKAGES[selectedPkg];
    setText("selectedPkg", pk ? `${pk.name} (${pk.usdtPrice} USDT)` : String(selectedPkg));
  }

  function setSide(isLeft) {
    selectedSideIsLeft = !!isLeft;
    $("btnSideL")?.classList.toggle("primary", selectedSideIsLeft);
    $("btnSideR")?.classList.toggle("primary", !selectedSideIsLeft);
  }

  function bindEvents() {
    $("btnConnect").onclick = connectWallet;
    $("btnRefresh").onclick = refreshAll;

    $("btnCopyLeft").onclick = async () => copyText($("leftLink")?.textContent || "");
    $("btnCopyRight").onclick = async () => copyText($("rightLink")?.textContent || "");

    $("btnSideL").onclick = () => setSide(true);
    $("btnSideR").onclick = () => setSide(false);

    document.querySelectorAll(".pkg").forEach(btn => {
      btn.addEventListener("click", () => setPkg(btn.dataset.pkg));
    });

    $("btnApprove").onclick = () => approveUSDT(false);
    $("btnBuy").onclick = () => approveUSDT(true);

    $("btnClaimVault").onclick = claimVault;
    $("btnClaimVaultTop").onclick = claimVault;
    $("btnClaimStake").onclick = claimStake;
  }

  async function copyText(txt) {
    try {
      await navigator.clipboard.writeText(txt);
      toast("คัดลอกแล้ว ✅");
    } catch {
      toast("คัดลอกไม่สำเร็จ (ลองกดค้างแล้วคัดลอก)");
    }
  }

  // ---------- Wallet ----------
  async function ensureChain() {
    const net = await provider.getNetwork();
    if (Number(net.chainId) === Number(C.CHAIN_ID_DEC)) return true;

    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: C.CHAIN_ID_HEX }]
      });
      return true;
    } catch (e) {
      // try add
      try {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: C.CHAIN_ID_HEX,
            chainName: C.CHAIN_NAME,
            rpcUrls: [C.RPC_URL],
            nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
            blockExplorerUrls: [C.BLOCK_EXPLORER],
          }]
        });
        return true;
      } catch (e2) {
        console.warn(e2);
        toast("กรุณาเปลี่ยนเครือข่ายเป็น BSC (56)");
        return false;
      }
    }
  }

  function showNet(chainId) {
    setText("netText", chainId === 56 ? "BSC (56)" : `Chain ${chainId}`);
  }

  async function connectWallet() {
    try {
      if (!window.ethereum) {
        toast("ไม่พบกระเป๋า (MetaMask/Bitget). เปิดผ่าน DApp Browser");
        return;
      }
      provider = new ethers.providers.Web3Provider(window.ethereum, "any");
      const ok = await ensureChain();
      if (!ok) return;

      await provider.send("eth_requestAccounts", []);
      signer = provider.getSigner();
      user = await signer.getAddress();

      const net = await provider.getNetwork();
      showNet(Number(net.chainId));
      setText("walletAddr", user);

      // contracts
      core = new ethers.Contract(C.CORE_V4, C.CORE_ABI, signer);
      vault = new ethers.Contract(C.VAULT_V5, C.VAULT_ABI, signer);
      staking = new ethers.Contract(C.STAKING_365_V4, C.STAKING_ABI, signer);
      usdt = new ethers.Contract(C.USDT, C.ERC20_ABI, signer);
      df = new ethers.Contract(C.DF, C.ERC20_ABI, signer);

      // decimals
      try { usdtDecimals = await usdt.decimals(); } catch {}
      try { dfDecimals = await df.decimals(); } catch {}

      // referral links
      buildReferralLinks();

      // listen account / chain changes
      window.ethereum.on?.("accountsChanged", () => window.location.reload());
      window.ethereum.on?.("chainChanged", () => window.location.reload());

      setStatus("Connected ✅ กด Refresh เพื่อโหลดข้อมูล");
      toast("เชื่อมต่อสำเร็จ ✅");

      await refreshAll();

      if (!timersStarted) {
        timersStarted = true;
        setInterval(tickCountdowns, 1000);
      }
    } catch (e) {
      console.warn(e);
      toast(e?.message || "เชื่อมต่อไม่สำเร็จ");
    }
  }

  // ---------- Data loaders ----------
  async function refreshAll() {
    try {
      if (!provider || !signer || !user) {
        setStatus("Ready. กรุณา Connect Wallet");
        return;
      }
      setStatus("กำลังโหลดข้อมูล...");
      await Promise.allSettled([
        refreshCore(),
        refreshVault(),
        refreshStaking(),
      ]);
      setStatus("Loaded ✅");
    } catch (e) {
      console.warn(e);
      setStatus("Error: " + (e?.message || e));
    }
  }

  async function refreshCore() {
    try {
      if (!core) return;

      // read users struct
      const u = await core.users(user);
      const sponsor = u.sponsor ?? u[0];
      const sideRight = u.sideRight ?? u[2];
      const pkg = Number(u.pkg ?? u[3] ?? 0);
      const rank = Number(u.rank ?? u[4] ?? 0);

      setText("mySponsor", (sponsor && sponsor !== zaddr) ? sponsor : "-");
      setText("mySide", sideRight ? "Right" : "Left");

      const pk = C.PACKAGES[pkg];
      setText("myPkg", pk ? pk.name : (pkg ? String(pkg) : "-"));
      setText("myRank", rank === 0 ? "None" : String(rank));

      // children
      try {
        const [lc, rc] = await Promise.all([core.leftChild(user), core.rightChild(user)]);
        setText("leftChild", (lc && lc !== zaddr) ? lc : "-");
        setText("rightChild", (rc && rc !== zaddr) ? rc : "-");
      } catch (e) {
        console.warn("child read fail", e?.message || e);
      }

      // Max cap by pkg
      const cap = pk?.capUSDT || 0;
      setText("maxCapUSDT", cap ? `${cap.toLocaleString()} USDT` : "-");
    } catch (e) {
      console.warn(e);
    }
  }

  async function refreshVault() {
    try {
      if (!vault) return;

      // claimable
      const [cU, cD] = await Promise.all([
        vault.claimableUSDT(user),
        vault.claimableDF(user),
      ]);

      setText("vaultClaimUSDT", fmtToken(cU, usdtDecimals, "USDT"));
      setText("vaultClaimDF", fmtToken(cD, dfDecimals, "DF"));

      // earns(u) — คุณยืนยันว่า "คอมอยู่ใน earns(u)" และ "cap นับเฉพาะ USDT"
      const e = await vault.earns(user);

      const unlockedUSDT = e.unlockedUSDT ?? e[0];
      const claimedUSDT  = e.claimedUSDT  ?? e[1];
      const lockedUSDT   = e.lockedUSDT   ?? e[2];
      const lockStartUSDT = Number(e.lockStartUSDT ?? e[3] ?? 0);
      const lockEndUSDT   = Number(e.lockEndUSDT   ?? e[4] ?? 0);
      const expiredUSDT  = e.expiredUSDT  ?? e[5];

      // cache for countdown
      cache.lockEndUSDT = lockEndUSDT;

      // Total commission USDT = unlocked + locked + claimed + expired
      const totalComm = bn(unlockedUSDT).add(bn(lockedUSDT)).add(bn(claimedUSDT)).add(bn(expiredUSDT));

      setText("totalCommUSDT", fmtToken(totalComm, usdtDecimals, "USDT"));
      setText("lockedUSDT", fmtToken(lockedUSDT, usdtDecimals, "USDT"));
      setText("expiredUSDT", fmtToken(expiredUSDT, usdtDecimals, "USDT"));
      setText("claimedUSDT", fmtToken(claimedUSDT, usdtDecimals, "USDT"));

      setText("lockStartUSDT", fmtDate(lockStartUSDT));
      setText("lockEndUSDT", fmtDate(lockEndUSDT));

      // Claimable Now (ภายใต้ CAP): min(claimableUSDT, remainingCap)
      const cap = await getCapByMyPackageUSDT();
      const remainingCap = cap > 0 ? Math.max(0, cap - toFloat(claimedUSDT, usdtDecimals)) : 0;

      const claimableRaw = toFloat(cU, usdtDecimals);
      const claimableNow = (cap > 0) ? Math.max(0, Math.min(claimableRaw, remainingCap)) : claimableRaw;

      setText("claimableNowUSDT", `${claimableNow.toLocaleString(undefined,{maximumFractionDigits:6})} USDT`);

      // status + note
      const now = Math.floor(Date.now()/1000);
      let st = "OK";
      let note = "";
      if (lockEndUSDT && now >= lockEndUSDT) {
        st = "EXPIRED";
        note = "Locked เกินกำหนด → กลายเป็น Expired และเคลมไม่ได้";
      } else if (bn(lockedUSDT).gt(0)) {
        st = "LOCKED";
        note = "มี Locked ต้องอัพเกรดก่อน ไม่งั้นครบ 90 วันจะหมดอายุ";
      } else {
        note = "ปกติ";
      }
      setText("commStatus", st);
      setText("commNote", note);

      // initial countdown text
      tickCountdowns();
    } catch (e) {
      console.warn(e);
    }
  }

  async function refreshStaking() {
    try {
      if (!staking) return;

      const [p, st] = await Promise.allSettled([
        staking.pendingReward(user),
        staking.stakes(user),
      ]);

      if (p.status === "fulfilled") {
        setText("pendingStake", fmtToken(p.value, dfDecimals, "DF"));
      }

      if (st.status === "fulfilled") {
        const s = st.value;
        const pkg = Number(s.pkg ?? s[0] ?? 0);
        const principal = s.principal ?? s[1];
        const start = Number(s.start ?? s[2] ?? 0);
        const end = Number(s.end ?? s[3] ?? 0);
        const claimed = !!(s.claimed ?? s[4]);

        cache.stakeEnd = end;

        setText("stakeStart", fmtDate(start));
        setText("stakeEnd", fmtDate(end));
        setText("stakeClaimed", claimed ? "Yes" : "No");

        const now = Math.floor(Date.now()/1000);
        if (principal && bn(principal).gt(0)) {
          setText("stakeStatus", now < end ? "Locked" : "Matured");
        } else {
          setText("stakeStatus", "No stake");
        }

        // ถ้าคุณอยากโชว์ principal ด้วย:
        // console.log("stake pkg", pkg, "principal", principal.toString());
      } else {
        setText("stakeStatus", "No data");
      }

      tickCountdowns();
    } catch (e) {
      console.warn(e);
    }
  }

  // ---------- Actions ----------
  async function approveUSDT(andBuy) {
    try {
      if (!usdt || !core || !user) { toast("กรุณา Connect Wallet"); return; }

      const pk = C.PACKAGES[selectedPkg];
      if (!pk) { toast("กรุณาเลือกแพ็คเกจ"); return; }

      const need = ethers.utils.parseUnits(String(pk.usdtPrice), usdtDecimals);

      // allowance
      const allowance = await usdt.allowance(user, C.CORE_V4);
      if (bn(allowance).gte(need)) {
        toast("USDT allowance เพียงพอแล้ว ✅");
        if (andBuy) await buyOrUpgrade();
        return;
      }

      setStatus("กำลัง Approve USDT...");
      const tx = await usdt.approve(C.CORE_V4, ethers.constants.MaxUint256);
      toast("ส่งธุรกรรม Approve แล้ว...");
      await tx.wait();

      toast("Approve สำเร็จ ✅");
      if (andBuy) await buyOrUpgrade();
      else setStatus("Approve สำเร็จ ✅");
    } catch (e) {
      console.warn(e);
      setStatus("Approve failed");
      toast(e?.message || "Approve ไม่สำเร็จ");
    }
  }

  async function buyOrUpgrade() {
    try {
      if (!core) return;

      const sponsorIn = ($("inpSponsor")?.value || "").trim();
      let sponsor = sponsorIn;

      // fallback เป็น COMPANY_WALLET ถ้าว่าง
      if (!sponsor) {
        try { sponsor = await core.COMPANY_WALLET(); } catch {}
      }
      if (!sponsor || !isAddr(sponsor)) {
        toast("Sponsor ไม่ถูกต้อง");
        return;
      }

      const sideRight = !selectedSideIsLeft; // ✅ CoreV4 ต้องส่ง sideRight
      const newPkg = Number(selectedPkg);    // 1/2/3

      setStatus("กำลัง Buy/Upgrade...");
      const tx = await core.buyOrUpgrade(newPkg, sponsor, sideRight);
      toast("ส่งธุรกรรม Buy/Upgrade แล้ว...");
      await tx.wait();

      toast("Buy/Upgrade สำเร็จ ✅");
      await refreshAll();
    } catch (e) {
      console.warn(e);
      setStatus("Buy/Upgrade failed");
      toast(e?.data?.message || e?.message || "Buy/Upgrade ไม่สำเร็จ");
    }
  }

  async function claimVault() {
    try {
      if (!vault) return;
      setStatus("กำลัง Claim Vault...");
      const tx = await vault.claim();
      toast("ส่งธุรกรรม Claim แล้ว...");
      await tx.wait();
      toast("Claim สำเร็จ ✅");
      await refreshVault();
      setStatus("Loaded ✅");
    } catch (e) {
      console.warn(e);
      setStatus("Claim failed");
      toast(e?.data?.message || e?.message || "Claim ไม่สำเร็จ");
    }
  }

  async function claimStake() {
    try {
      if (!staking) return;
      setStatus("กำลัง Claim Stake...");
      const tx = await staking.claimStake();
      toast("ส่งธุรกรรม Claim Stake แล้ว...");
      await tx.wait();
      toast("Claim Stake สำเร็จ ✅");
      await refreshStaking();
      setStatus("Loaded ✅");
    } catch (e) {
      console.warn(e);
      setStatus("Claim stake failed");
      toast(e?.data?.message || e?.message || "Claim Stake ไม่สำเร็จ");
    }
  }

  // ---------- Countdown tick ----------
  function tickCountdowns() {
    const now = Math.floor(Date.now()/1000);

    // Stake 365 countdown
    if (cache.stakeEnd && cache.stakeEnd > 0) {
      const rem = cache.stakeEnd - now;
      setText("stakeCountdown", rem > 0 ? fmtDur(rem) : "0d 00:00:00");
    } else {
      setText("stakeCountdown", "-");
    }

    // Vault lock expiry countdown (90 days) — ใช้ lockEndUSDT ที่ contract ให้มา
    if (cache.lockEndUSDT && cache.lockEndUSDT > 0) {
      const rem = cache.lockEndUSDT - now;
      setText("expireCountdownUSDT", rem > 0 ? fmtDur(rem) : "EXPIRED");
    } else {
      setText("expireCountdownUSDT", "-");
    }
  }

  // ---------- Utilities ----------
  function bn(x) { return ethers.BigNumber.from(x || 0); }

  function fmtToken(amountBN, decimals, sym) {
    try {
      const v = Number(ethers.utils.formatUnits(amountBN || 0, decimals));
      return `${v.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${sym}`;
    } catch {
      return `0 ${sym}`;
    }
  }

  function toFloat(amountBN, decimals) {
    try { return Number(ethers.utils.formatUnits(amountBN || 0, decimals)); }
    catch { return 0; }
  }

  async function getCapByMyPackageUSDT() {
    try {
      if (!core) return 0;
      const u = await core.users(user);
      const pkg = Number(u.pkg ?? u[3] ?? 0);
      const pk = C.PACKAGES[pkg];
      return pk?.capUSDT || 0;
    } catch {
      return 0;
    }
  }

  // ---------- Boot ----------
  function boot() {
    fillStatic();
    bindEvents();
    setStatus("Ready. กรุณา Connect Wallet");
  }

  boot();

})();
