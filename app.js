// app.js (VaultV5 User DApp)
(() => {
  "use strict";

  const C = window.APP_CONFIG;

  // ---------- Guard: ethers must exist ----------
  if (!window.ethers) {
    console.error("ethers is not defined. Make sure ethers v5 is loaded before app.js");
    alert("ethers ไม่พร้อมใช้งาน (ethers is not defined) — ตรวจสอบว่าโหลด ethers v5 ก่อน app.js");
    return;
  }

  const { ethers } = window;

  // ---------- DOM helpers ----------
  const $ = (id) => document.getElementById(id);
  const setText = (id, text) => { const el = $(id); if (el) el.textContent = text; };
  const setHTML = (id, html) => { const el = $(id); if (el) el.innerHTML = html; };
  const shortAddr = (a) => (a ? a.slice(0, 6) + "..." + a.slice(-4) : "-");

  const toast = (msg, ms = 2500) => {
    const t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), ms);
  };

  const setStatus = (msg) => setText("status", msg);

  // ---------- ABIs ----------
  // VaultV5 ABI (จากที่คุณส่งมา)
  const VAULT_ABI = [{"inputs":[{"internalType":"address","name":"usdt","type":"address"},{"internalType":"address","name":"df","type":"address"}],"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"user","type":"address"},{"indexed":false,"internalType":"uint256","name":"usdtAmt","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"dfAmt","type":"uint256"}],"name":"Claimed","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"core","type":"address"}],"name":"CoreSet","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"to","type":"address"},{"indexed":false,"internalType":"uint256","name":"usdtAmt","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"dfAmt","type":"uint256"}],"name":"Credited","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"user","type":"address"},{"indexed":false,"internalType":"uint256","name":"usdtExpired","type":"uint256"}],"name":"ExpiredLocked","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"user","type":"address"},{"indexed":false,"internalType":"uint256","name":"dfExpired","type":"uint256"}],"name":"ExpiredLockedDF","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"user","type":"address"},{"indexed":false,"internalType":"uint256","name":"usdtAmt","type":"uint256"},{"indexed":false,"internalType":"uint64","name":"start","type":"uint64"},{"indexed":false,"internalType":"uint64","name":"end","type":"uint64"}],"name":"Locked","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"user","type":"address"},{"indexed":false,"internalType":"uint256","name":"dfAmt","type":"uint256"},{"indexed":false,"internalType":"uint64","name":"start","type":"uint64"},{"indexed":false,"internalType":"uint64","name":"end","type":"uint64"}],"name":"LockedDF","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"prev","type":"address"},{"indexed":true,"internalType":"address","name":"next","type":"address"}],"name":"OwnershipTransferred","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"user","type":"address"},{"indexed":false,"internalType":"uint256","name":"usdtMoved","type":"uint256"}],"name":"UnlockedByUpgrade","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"user","type":"address"},{"indexed":false,"internalType":"uint256","name":"dfMoved","type":"uint256"}],"name":"UnlockedByUpgradeDF","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"to","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"WithdrawSurplusDF","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"to","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"WithdrawSurplusUSDT","type":"event"},{"inputs":[],"name":"DF","outputs":[{"internalType":"contract IERC20","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"LOCK_DAYS","outputs":[{"internalType":"uint64","name":"","type":"uint64"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"USDT","outputs":[{"internalType":"contract IERC20","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"claim","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"u","type":"address"}],"name":"claimableDF","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"u","type":"address"}],"name":"claimableUSDT","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"core","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"dfAmt","type":"uint256"}],"name":"creditDF","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"usdtAmt","type":"uint256"}],"name":"creditUSDT","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"earns","outputs":[{"internalType":"uint256","name":"unlockedUSDT","type":"uint256"},{"internalType":"uint256","name":"claimedUSDT","type":"uint256"},{"internalType":"uint256","name":"lockedUSDT","type":"uint256"},{"internalType":"uint64","name":"lockStartUSDT","type":"uint64"},{"internalType":"uint64","name":"lockEndUSDT","type":"uint64"},{"internalType":"uint256","name":"expiredUSDT","type":"uint256"},{"internalType":"uint256","name":"unlockedDF","type":"uint256"},{"internalType":"uint256","name":"claimedDF","type":"uint256"},{"internalType":"uint256","name":"lockedDF","type":"uint256"},{"internalType":"uint64","name":"lockStartDF","type":"uint64"},{"internalType":"uint64","name":"lockEndDF","type":"uint64"},{"internalType":"uint256","name":"expiredDF","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"u","type":"address"}],"name":"lockedDF","outputs":[{"internalType":"uint256","name":"amt","type":"uint256"},{"internalType":"uint64","name":"start","type":"uint64"},{"internalType":"uint64","name":"end","type":"uint64"},{"internalType":"uint256","name":"expired","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"u","type":"address"}],"name":"lockedUSDT","outputs":[{"internalType":"uint256","name":"amt","type":"uint256"},{"internalType":"uint64","name":"start","type":"uint64"},{"internalType":"uint64","name":"end","type":"uint64"},{"internalType":"uint256","name":"expired","type":"uint256"}],"stateMutability":"view","type":"function"}];

  // CoreV4 ABI (ต้องมีฟังก์ชันอ่านแพ็คเกจของ user)
  // ถ้า CoreV4 ของคุณชื่อฟังก์ชันไม่เหมือนนี้ ให้บอกชื่อจริง เดี๋ยวผมแก้ให้ตรง
  const CORE_ABI_MIN = [
    // ตัวอย่างที่พบบ่อย: users(address) returns (pkg,...)
    "function users(address) view returns (address sponsor,uint8 side,uint8 pkg,uint8 rank,address left,address right,uint256 volL,uint256 volR,uint256 volP,uint256 pendingDF,uint64 stakeStart,uint64 stakeEnd)",
    // ถ้ามีฟังก์ชันเฉพาะ: packageOf(address) -> uint8
    "function packageOf(address) view returns (uint8)",
  ];

  // ---------- State ----------
  let provider, signer, user;
  let vault, core;
  let refreshTimer = null;

  // ---------- Formatting ----------
  const fmtUnits = (bn, decimals = 18, dp = 4) => {
    try {
      const s = ethers.utils.formatUnits(bn || 0, decimals);
      const n = Number(s);
      if (!isFinite(n)) return s;
      return n.toLocaleString(undefined, { maximumFractionDigits: dp });
    } catch {
      return "0";
    }
  };

  const fmtDate = (sec) => {
    const n = Number(sec || 0);
    if (!n) return "-";
    const d = new Date(n * 1000);
    return d.toLocaleString();
  };

  const fmtCountdown = (endSec) => {
    const now = Math.floor(Date.now() / 1000);
    let diff = Number(endSec || 0) - now;
    if (diff <= 0) return "0d 00:00:00";
    const d = Math.floor(diff / 86400); diff -= d * 86400;
    const h = Math.floor(diff / 3600); diff -= h * 3600;
    const m = Math.floor(diff / 60); diff -= m * 60;
    const s = diff;
    const pad = (x) => String(x).padStart(2, "0");
    return `${d}d ${pad(h)}:${pad(m)}:${pad(s)}`;
  };

  // ---------- Read package (cap) ----------
  async function getUserPkgId() {
    // ลองอ่าน users(u).pkg ก่อน ถ้า fail ค่อยลอง packageOf(u)
    try {
      const u = await core.users(user);
      // u.pkg is BigNumber? / number? ethers v5 returns tuple both index+name
      const pkg = Number(u.pkg ?? u[2] ?? 0);
      return pkg;
    } catch (_) {
      try {
        const pkg = await core.packageOf(user);
        return Number(pkg);
      } catch (_) {
        return 0;
      }
    }
  }

  function capOfPkg(pkgId) {
    const s = (C.CAPS_USDT && C.CAPS_USDT[pkgId]) ? C.CAPS_USDT[pkgId] : "0";
    return ethers.utils.parseUnits(String(s), 18);
  }

  // ---------- UI fill static ----------
  function fillStatic() {
    setText("coreAddr", C.CORE);
    setText("vaultAddr", C.VAULT);
    setText("usdtAddr", C.USDT);
    setText("dfAddr", C.DF);

    // referral links base
    if ($("leftLink")) setText("leftLink", `${C.BASE_URL}?ref=...&side=L`);
    if ($("rightLink")) setText("rightLink", `${C.BASE_URL}?ref=...&side=R`);
  }

  // ---------- Connect ----------
  async function connect() {
    try {
      if (!window.ethereum) {
        toast("ไม่พบกระเป๋า (window.ethereum)");
        setStatus("❌ ไม่พบกระเป๋า (แนะนำเปิดผ่าน Bitget/MetaMask DApp Browser)");
        return;
      }

      provider = new ethers.providers.Web3Provider(window.ethereum, "any");
      await provider.send("eth_requestAccounts", []);
      signer = provider.getSigner();
      user = await signer.getAddress();

      // ensure chain
      const net = await provider.getNetwork();
      if (Number(net.chainId) !== Number(C.CHAIN_ID_DEC)) {
        try {
          await provider.send("wallet_switchEthereumChain", [{ chainId: C.CHAIN_ID_HEX }]);
        } catch (e) {
          toast("กรุณาสลับเครือข่ายเป็น BSC Mainnet");
          setStatus("⚠️ กรุณาสลับเครือข่ายเป็น BSC Mainnet");
          return;
        }
      }

      vault = new ethers.Contract(C.VAULT, VAULT_ABI, signer);
      core  = new ethers.Contract(C.CORE, CORE_ABI_MIN, signer);

      // UI
      setText("walletAddr", shortAddr(user));
      const net2 = await provider.getNetwork();
      setText("netText", `${net2.name || "BSC"} (${net2.chainId})`);

      // referral links now real
      setText("leftLink", `${C.BASE_URL}?ref=${user}&side=L`);
      setText("rightLink", `${C.BASE_URL}?ref=${user}&side=R`);

      setStatus("✅ Connected");
      toast("Connected");

      await refresh();

      // auto refresh countdown
      if (refreshTimer) clearInterval(refreshTimer);
      refreshTimer = setInterval(() => {
        // update countdown only (cheap)
        try {
          const endText = $("lock90Countdown")?.dataset?.end;
          if (endText) setText("lock90Countdown", fmtCountdown(Number(endText)));
        } catch {}
      }, 1000);

      // listen changes
      window.ethereum.on?.("accountsChanged", () => location.reload());
      window.ethereum.on?.("chainChanged", () => location.reload());

    } catch (e) {
      console.error(e);
      toast("เชื่อมต่อไม่สำเร็จ");
      setStatus("❌ Connect failed");
    }
  }

  // ---------- Refresh dashboard ----------
  async function refresh() {
    if (!vault || !core || !user) {
      setStatus("Ready. กรุณา Connect Wallet");
      return;
    }
    try {
      setStatus("⏳ Loading...");

      const pkgId = await getUserPkgId();
      const cap = capOfPkg(pkgId);

      // vault earns
      const e = await vault.earns(user);

      const unlockedUSDT = e.unlockedUSDT ?? e[0];
      const claimedUSDT  = e.claimedUSDT  ?? e[1];
      const lockedUSDT   = e.lockedUSDT   ?? e[2];
      const lockStartU   = e.lockStartUSDT?? e[3];
      const lockEndU     = e.lockEndUSDT  ?? e[4];
      const expiredUSDT  = e.expiredUSDT  ?? e[5];

      // totals
      const totalEarned = unlockedUSDT.add(claimedUSDT).add(lockedUSDT).add(expiredUSDT);

      // claimable under cap:
      // earnedWithinCap = min(totalEarned, cap)
      const earnedWithinCap = totalEarned.gt(cap) ? cap : totalEarned;
      const claimableNow = earnedWithinCap.gt(claimedUSDT) ? earnedWithinCap.sub(claimedUSDT) : ethers.constants.Zero;

      // locked over cap (ตาม logic “โชว์แต่เคลมไม่ได้”)
      const lockedOverCap = totalEarned.gt(cap) ? totalEarned.sub(cap) : ethers.constants.Zero;

      // UI existing ids (V4 style)
      setText("myPkg", pkgId === 1 ? "Small" : pkgId === 2 ? "Medium" : pkgId === 3 ? "Large" : "-");

      // claimable in vault box (เอาตาม claimableNow)
      setText("claimUSDT", fmtUnits(claimableNow, 18, 4));
      // DF side (คุณยืนยัน cap นับเฉพาะ USDT — ดังนั้น DF ยังโชว์ตาม vault.claimableDF)
      try {
        const cdf = await vault.claimableDF(user);
        setText("claimDF", fmtUnits(cdf, 18, 4));
      } catch {
        setText("claimDF", "-");
      }

      // --- Commission Section (เพิ่มได้ด้วย id ใหม่ หรือเอาไปแสดงใน status ก็ได้) ---
      // ถ้า HTML ยังไม่มีช่องนี้ ผมจะโชว์ผ่าน status แบบสรุปให้ก่อน
      const capHuman = fmtUnits(cap, 18, 0);
      const totalHuman = fmtUnits(totalEarned, 18, 4);
      const claimHuman = fmtUnits(claimableNow, 18, 4);
      const lockedHuman = fmtUnits(lockedOverCap, 18, 4);
      const expHuman = fmtUnits(expiredUSDT, 18, 4);

      // ถ้ามี element เพิ่มตาม id ด้านล่างก็จะใส่ให้
      if ($("commTotal")) setText("commTotal", totalHuman);
      if ($("commCap")) setText("commCap", capHuman);
      if ($("commClaimable")) setText("commClaimable", claimHuman);
      if ($("commLocked")) setText("commLocked", lockedHuman);
      if ($("commExpired")) setText("commExpired", expHuman);

      // countdown 90 วัน (อิง lockEndUSDT)
      const lockEndSec = Number(lockEndU?.toString?.() ?? lockEndU ?? 0);
      const lockStartSec = Number(lockStartU?.toString?.() ?? lockStartU ?? 0);

      // โชว์นับถอยหลังเฉพาะเมื่อมี lockedUSDT/lockedOverCap > 0
      let countdown = "-";
      if (lockedUSDT.gt(0) || lockedOverCap.gt(0)) {
        countdown = lockEndSec ? fmtCountdown(lockEndSec) : "-";
      }

      if ($("lock90Start")) setText("lock90Start", fmtDate(lockStartSec));
      if ($("lock90End")) setText("lock90End", fmtDate(lockEndSec));
      if ($("lock90Countdown")) {
        setText("lock90Countdown", countdown);
        $("lock90Countdown").dataset.end = String(lockEndSec || "");
      }
      if ($("lock90Status")) {
        const now = Math.floor(Date.now()/1000);
        const st = (lockEndSec && now >= lockEndSec) ? "Expired" : (lockedOverCap.gt(0) ? "Locked (Upgrade required)" : "OK");
        setText("lock90Status", st);
      }

      // ถ้าไม่มี section commission ใน HTML: สรุปใน status ให้เลย
      if (!$("commTotal")) {
        setHTML("status",
          `✅ Loaded | Package: <b>${pkgId || "-"}</b> | Cap: <b>${capHuman} USDT</b><br/>
           Total: <b>${totalHuman}</b> | Claimable: <b>${claimHuman}</b> | Locked: <b>${lockedHuman}</b> | Expired: <b>${expHuman}</b><br/>
           Locked countdown: <b>${countdown}</b>`
        );
      } else {
        setStatus("✅ Loaded");
      }

    } catch (e) {
      console.error(e);
      toast("โหลดข้อมูลไม่สำเร็จ");
      setStatus("❌ Load failed (ดู console)");
    }
  }

  // ---------- Actions ----------
  async function claimVault() {
    if (!vault) return;
    try {
      setStatus("⏳ Claiming vault...");
      const tx = await vault.claim();
      toast("ส่งธุรกรรมแล้ว");
      await tx.wait();
      toast("✅ Claim สำเร็จ");
      await refresh();
    } catch (e) {
      console.error(e);
      toast("Claim ไม่สำเร็จ");
      setStatus("❌ Claim failed");
    }
  }

  // ---------- Copy links ----------
  async function copyText(id) {
    const txt = $(id)?.textContent || "";
    if (!txt || txt === "-") return toast("ไม่มีลิงก์ให้คัดลอก");
    try {
      await navigator.clipboard.writeText(txt);
      toast("คัดลอกแล้ว");
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = txt; document.body.appendChild(ta);
      ta.select(); document.execCommand("copy");
      document.body.removeChild(ta);
      toast("คัดลอกแล้ว");
    }
  }

  // ---------- Wire buttons ----------
  function wire() {
    $("btnConnect")?.addEventListener("click", connect);
    $("btnRefresh")?.addEventListener("click", refresh);
    $("btnClaimVault")?.addEventListener("click", claimVault);

    $("btnCopyLeft")?.addEventListener("click", () => copyText("leftLink"));
    $("btnCopyRight")?.addEventListener("click", () => copyText("rightLink"));
  }

  // ---------- Boot ----------
  fillStatic();
  wire();
  setStatus("Ready. กรุณา Connect Wallet");
})();
