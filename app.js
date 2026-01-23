let provider, signer, user, vault;

const $ = id => document.getElementById(id);
const fmt = v => Number(v).toFixed(2);

async function connect() {
  provider = new ethers.providers.Web3Provider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  signer = provider.getSigner();
  user = await signer.getAddress();

  vault = new ethers.Contract(
    APP_CONFIG.VAULT,
    APP_CONFIG.VAULT_ABI,
    signer
  );

  loadData();
}

async function loadData() {
  const e = await vault.earns(user);

  const unlocked = e.unlockedUSDT;
  const claimed  = e.claimedUSDT;
  const locked   = e.lockedUSDT;
  const expired  = e.expiredUSDT;

  const total =
    unlocked.add(locked).add(claimed).add(expired);

  const pkg = await getUserPackage(); // จาก CoreV4
  const cap = ethers.utils.parseUnits(
    String(APP_CONFIG.CAP_BY_PKG[pkg] || 0),
    APP_CONFIG.USDT_DECIMALS
  );

  const claimable = unlocked.gt(cap) ? cap : unlocked;
  const lockedNeed = unlocked.gt(cap) ? unlocked.sub(cap) : 0;

  $("totalCommission").innerText = fmt(
    ethers.utils.formatUnits(total, 18)
  );

  $("claimableNow").innerText = fmt(
    ethers.utils.formatUnits(claimable, 18)
  );

  $("lockedNeedUpgrade").innerText = fmt(
    ethers.utils.formatUnits(lockedNeed, 18)
  );

  $("expiredUSDT").innerText = fmt(
    ethers.utils.formatUnits(expired, 18)
  );

  // ===== countdown =====
  const start = e.lockStartUSDT;
  const end   = e.lockEndUSDT;

  if (end > 0) {
    const now = Math.floor(Date.now() / 1000);
    const left = end - now;

    $("lockStart").innerText = new Date(start * 1000).toLocaleString();
    $("lockEnd").innerText = new Date(end * 1000).toLocaleString();

    if (left <= 0) {
      $("countdown").innerText = "Expired";
      $("statusText").innerText = "EXPIRED";
    } else {
      const d = Math.floor(left / 86400);
      const h = Math.floor((left % 86400) / 3600);
      $("countdown").innerText = `${d}d ${h}h`;
      $("statusText").innerText =
        lockedNeed > 0 ? "NEED UPGRADE" : "OK";
    }
  }
}

async function claim() {
  const c = await vault.claimableUSDT(user);
  if (c.eq(0)) {
    alert("ไม่มี USDT ให้เคลม");
    return;
  }
  await vault.claim();
}

$("btnConnect").onclick = connect;
$("btnClaim").onclick = claim;
