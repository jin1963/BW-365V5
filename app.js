(() => {
  "use strict";

  const C = window.APP_CONFIG;

  let provider, signer, vault, user;

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const fmt = (v) =>
    Number(ethers.utils.formatUnits(v || 0, 18)).toLocaleString();
  const fmtTime = (t) =>
    t === 0 ? "-" : new Date(Number(t) * 1000).toLocaleString();

  // ---------- CONNECT ----------
  async function connectWallet() {
    if (!window.ethereum) {
      alert("กรุณาเปิดผ่าน MetaMask หรือ Bitget Wallet");
      return;
    }

    provider = new ethers.providers.Web3Provider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    signer = provider.getSigner();
    user = await signer.getAddress();

    vault = new ethers.Contract(
      C.VAULT_ADDRESS,
      C.VAULT_ABI,
      signer
    );

    $("wallet").textContent = user;
    $("btnConnect").disabled = true;
    $("btnConnect").classList.add("disabled");

    await refresh();
  }

  // ---------- REFRESH ----------
  async function refresh() {
    try {
      setStatus("Loading...", false);

      const cUSDT = await vault.claimableUSDT(user);
      const cDF = await vault.claimableDF(user);

      $("claimUSDT").textContent = fmt(cUSDT);
      $("claimDF").textContent = fmt(cDF);

      const [uAmt, uStart, uEnd, uExp] = await vault.lockedUSDT(user);
      $("lockedUSDT").textContent = fmt(uAmt);
      $("lockUSDTStart").textContent = fmtTime(uStart);
      $("lockUSDTEnd").textContent = fmtTime(uEnd);
      $("expiredUSDT").textContent = fmt(uExp);

      const [dAmt, dStart, dEnd, dExp] = await vault.lockedDF(user);
      $("lockedDF").textContent = fmt(dAmt);
      $("lockDFStart").textContent = fmtTime(dStart);
      $("lockDFEnd").textContent = fmtTime(dEnd);
      $("expiredDF").textContent = fmt(dExp);

      setStatus("Updated ✓", true);
    } catch (e) {
      console.error(e);
      setStatus("Load failed", false);
    }
  }

  // ---------- CLAIM ----------
  async function claim() {
    try {
      setStatus("Claiming...", false);
      const tx = await vault.claim();
      await tx.wait();
      setStatus("Claim success ✓", true);
      await refresh();
    } catch (e) {
      console.error(e);
      setStatus("Claim failed", false);
    }
  }

  // ---------- STATUS ----------
  function setStatus(msg, ok) {
    const el = $("status");
    el.textContent = msg;
    el.className = ok ? "status ok" : "status err";
  }

  // ---------- BIND ----------
  window.addEventListener("load", () => {
    $("btnConnect").onclick = connectWallet;
    $("btnClaim").onclick = claim;
  });

})();
