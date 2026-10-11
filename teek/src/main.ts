import "./polyfills";
import "./style.css";
import "./brand.css";
import "./market-brand.css";
import { brandHeader } from './brand';
import { generateFairValuePath } from "./sim/fairValue";
import { runClobSim, type ClobSnipeEvent } from "./sim/clobEngine";
import { runBatchSim, type BatchEvent } from "./sim/batchEngine";
import * as chain from "./chain";

// --- Simulation setup -------------------------------------------------
// One shared fair-value path drives both venues, so any difference in
// outcome comes only from market structure, never from lucky randomness.
const PERIOD_SUBTICKS = 20; // sub-ticks per batch — the "100ms" conceptually
const NUM_PERIODS = 4000; // long enough to run for a long demo session
const SUBTICKS = PERIOD_SUBTICKS * NUM_PERIODS;
const SPREAD = 1.0;
const MM_QTY = 20;
const SNIPER_QTY = 10;
const SEED = Math.floor(Math.random() * 1_000_000);

const fairValue = generateFairValuePath(SUBTICKS, SEED);
const clob = runClobSim(fairValue, PERIOD_SUBTICKS, SPREAD, MM_QTY, SNIPER_QTY);
const batch = runBatchSim(fairValue, PERIOD_SUBTICKS, SPREAD, MM_QTY, SNIPER_QTY, 6, SEED ^ 0x2545f5);

// Index snipes by sub-tick for quick lookup during playback.
const snipeBySubTick = new Map<number, ClobSnipeEvent>();
for (const s of clob.snipes) snipeBySubTick.set(s.subTick, s);

// --- DOM scaffold -------------------------------------------------------
const app = document.getElementById("app")!;
app.innerHTML = `
  ${brandHeader('market')}
  <main id="main-content">
  <div class="hero">
    <p class="eyebrow">MARKET SIMULATOR</p>
    <h1>Speed changes<br>the trade.</h1>
    <p>See how the same price moves play out when trades happen one by one or clear together.</p>
  </div>

  <div class="metronome-bar">
    <span class="label">Next batch</span>
    <div class="metronome-track"><div class="metronome-fill" id="metronome-fill"></div></div>
    <span class="batch-counter" id="batch-counter">batch #0</span>
  </div>

  <div class="columns">
    <div class="panel">
      <div class="panel-title">
        <h2>Continuous order book</h2>
        <span class="tag clob">First in line</span>
      </div>
      <div class="state-row">
        <span>Market value</span>
        <span class="value" id="clob-value">—</span>
      </div>
      <div class="clob-tape" id="clob-tape"></div>
      <div class="chart-wrap"><canvas id="clob-chart" width="520" height="120" role="img" aria-label="Continuous order book simulated bot profit; current value shown below"></canvas></div>
    </div>

    <div class="panel teek-panel">
      <div class="panel-title">
        <h2>Batch market</h2>
        <span class="tag teek">Shared price</span>
      </div>
      <div class="state-row">
        <span>Trade price</span>
        <span class="value" id="teek-price">—</span>
      </div>
      <div class="seal-visual sealed" id="teek-seal"></div>
      <div class="fills-line" id="teek-fills">&nbsp;</div>
      <div class="chart-wrap"><canvas id="teek-chart" width="520" height="120" role="img" aria-label="Batch market simulated bot profit; current value shown below"></canvas></div>
    </div>
  </div>

  <div class="scoreboard" style="margin-top: 18px;">
    <div class="score-cell clob">
      <div class="num" id="clob-pnl">$0</div>
      <div class="cap">Fast trader's profit · order book</div>
    </div>
    <div class="score-cell teek">
      <div class="num" id="teek-pnl">$0</div>
      <div class="cap">Fast trader's profit · batches</div>
    </div>
  </div>

  <div class="verdict">
    In the order book, the fast trader can reach an old price before anyone updates it.
    In a batch, everyone matched in that round trades at the same price.
    This is a model, not a forecast. Simulation seed: ${SEED}.
  </div>

  <div class="controls">
    <button class="primary" id="speed-btn">Speed: 1×</button>
    <button id="pause-btn">Pause</button>
  </div>

  <div class="onchain-panel">
    <div class="panel-title">
      <h2>Try it on devnet</h2>
      <span class="tag teek">Test tokens</span>
    </div>
    <p class="onchain-blurb">
      The charts above are a simulation. The controls below use program <code id="onchain-program"></code>
      on Solana devnet and MagicBlock's hosted ER. These orders use test tokens and are public.
      <a href="/launch.html">Launch bids</a> use a separate private flow.
    </p>
    <div class="onchain-grid">
      <div class="onchain-col">
        <div class="onchain-row"><span>Demo wallet</span><span class="mono" id="onchain-wallet">—</span></div>
        <div class="onchain-row"><span>ER validator</span><span class="mono" id="onchain-er-validator">—</span></div>
        <div class="onchain-row"><span>delegation</span><span class="mono" id="onchain-delegation">—</span></div>
        <div class="onchain-row"><span>SOL balance</span><span class="mono" id="onchain-sol">—</span></div>
        <div class="onchain-row"><span>base balance (deposited)</span><span class="mono" id="onchain-base-bal">—</span></div>
        <div class="onchain-row"><span>quote balance (deposited)</span><span class="mono" id="onchain-quote-bal">—</span></div>
        <div class="onchain-row"><span>base in wallet</span><span class="mono" id="onchain-base-wallet">—</span></div>
        <div class="onchain-row"><span>quote in wallet</span><span class="mono" id="onchain-quote-wallet">—</span></div>
        <button id="onchain-refresh">Refresh balances</button>
        <button id="onchain-deposit-base">Deposit 100 base</button>
        <button id="onchain-deposit-quote">Deposit 1,000 quote</button>
        <button id="onchain-delegate">Move accounts to ER</button>
        <button id="onchain-open-er">Open batch</button>
        <button class="primary run-demo" id="onchain-run-demo">Run devnet demo</button>
      </div>
      <div class="onchain-col">
        <div class="onchain-row"><span>batch</span><span class="mono" id="onchain-batch">—</span></div>
        <div class="onchain-row"><span>orders in current batch</span><span class="mono" id="onchain-order-count">—</span></div>
        <div class="order-form">
          <label for="onchain-price">Price<input id="onchain-price" type="text" inputmode="numeric" autocomplete="off" value="100" /></label>
          <label for="onchain-qty">Quantity<input id="onchain-qty" type="text" inputmode="numeric" autocomplete="off" value="10" /></label>
          <button id="onchain-buy">Place buy order</button>
          <button id="onchain-sell">Place sell order</button>
        </div>
        <button id="onchain-clear">Clear batch</button>
        <button id="onchain-commit">Save to Solana</button>
        <div id="onchain-status" class="onchain-status">Ready</div>
        <ol id="onchain-demo-log" class="onchain-demo-log">
          <li>Ready when you are.</li>
        </ol>
        <div id="onchain-reveal" class="onchain-reveal">No trades yet</div>
      </div>
    </div>
  </div>
  <footer class="page-footer"><span>Simulation above · devnet market below</span><a href="/launch.html">Browse launches ↗</a></footer>
  </main>
`;

// --- Playback state -------------------------------------------------
let running = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let speedMultiplier = 1;
let subTick = 0; // how far through fairValue/clob we've revealed
let lastPeriodShown = -1;

const clobValueEl = document.getElementById("clob-value")!;
const clobTapeEl = document.getElementById("clob-tape")!;
const tickPriceEl = document.getElementById("teek-price")!;
const tickSealEl = document.getElementById("teek-seal")!;
const tickFillsEl = document.getElementById("teek-fills")!;
const metronomeFillEl = document.getElementById("metronome-fill")!;
const batchCounterEl = document.getElementById("batch-counter")!;
const clobPnlEl = document.getElementById("clob-pnl")!;
const tickPnlEl = document.getElementById("teek-pnl")!;
const speedBtn = document.getElementById("speed-btn")!;
const pauseBtn = document.getElementById("pause-btn")!;
pauseBtn.textContent = running ? 'Pause' : 'Resume';

speedBtn.addEventListener("click", () => {
  speedMultiplier = speedMultiplier >= 4 ? 1 : speedMultiplier * 2;
  speedBtn.textContent = `Speed: ${speedMultiplier}×`;
});
pauseBtn.addEventListener("click", () => {
  running = !running;
  pauseBtn.textContent = running ? "Pause" : "Resume";
});

const clobChart = (document.getElementById("clob-chart") as HTMLCanvasElement).getContext("2d")!;
const tickChart = (document.getElementById("teek-chart") as HTMLCanvasElement).getContext("2d")!;

function drawPnlLine(
  ctx: CanvasRenderingContext2D,
  series: number[],
  color: string
) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (series.length < 2) return;

  const windowSize = 300;
  const start = Math.max(0, series.length - windowSize);
  const slice = series.slice(start);
  const min = Math.min(0, ...slice);
  const max = Math.max(0, ...slice);
  const range = max - min || 1;

  // zero line
  const zeroY = h - ((0 - min) / range) * h;
  ctx.strokeStyle = "#2a3140";
  ctx.beginPath();
  ctx.moveTo(0, zeroY);
  ctx.lineTo(w, zeroY);
  ctx.stroke();

  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  slice.forEach((v, i) => {
    const x = (i / (windowSize - 1)) * w;
    const y = h - ((v - min) / range) * h;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

const clobTapeLines: string[] = [];

function renderClobUpTo(newSubTick: number) {
  for (let i = subTick; i < newSubTick && i < fairValue.length; i++) {
    const snipe = snipeBySubTick.get(i);
    if (snipe) {
      const dir = snipe.side === "buy" ? "bought at" : "sold at";
      clobTapeLines.push(
        `Fast trader ${dir} ${snipe.price.toFixed(2)} before the price moved to ${snipe.trueValue.toFixed(2)} · +$${snipe.pnl.toFixed(0)}`
      );
      if (clobTapeLines.length > 5) clobTapeLines.shift();
    }
  }
  clobTapeEl.innerHTML = clobTapeLines
    .map((l) => `<div class="snipe-line">${l}</div>`)
    .join("") || `<div>Waiting for a price move…</div>`;

  clobValueEl.textContent = fairValue[Math.min(newSubTick, fairValue.length - 1)].toFixed(2);
  clobPnlEl.textContent = `$${Math.round(clob.pnlSeries[Math.min(newSubTick, clob.pnlSeries.length - 1)]).toLocaleString()}`;
  drawPnlLine(clobChart, clob.pnlSeries.slice(0, newSubTick + 1), "#ff5d6c");
}

function renderBatchReveal(period: number, e: BatchEvent) {
  batchCounterEl.textContent = `batch #${period}`;
  tickSealEl.className = "seal-visual revealed";
  tickSealEl.dataset.state = "revealed";
  const priceStr = e.clearingPrice !== null ? e.clearingPrice.toFixed(2) : "No match";
  tickSealEl.innerHTML = `<div class="price-big">${priceStr}</div><div class="fills-line">${e.matchedQty} units traded</div>`;
  tickPriceEl.textContent = priceStr;
  tickFillsEl.textContent = e.sniperFillQty > 0
    ? `Fast trader ${e.sniperSide==='buy'?'bought':'sold'} ${e.sniperFillQty} units at this price.`
    : e.jumpMissedBySeal
      ? "Price moved after the batch closed. It will affect the next one."
      : "No trade for the fast trader this round.";

  const pnl = batch.pnlSeries[Math.min(period, batch.pnlSeries.length - 1)];
  tickPnlEl.textContent = `$${Math.round(pnl).toLocaleString()}`;
  drawPnlLine(tickChart, batch.pnlSeries.slice(0, period + 1), "#35d488");
}

let lastFrame = performance.now();
const MS_PER_SUBTICK = 40; // base pace: 20 sub-ticks * 40ms = 800ms per batch

function frame(now: number) {
  requestAnimationFrame(frame);
  if (!running) {
    lastFrame = now;
    return;
  }
  const elapsed = (now - lastFrame) * speedMultiplier;
  lastFrame = now;

  const subTicksToAdvance = elapsed / MS_PER_SUBTICK;
  const newSubTickFloat = Math.min(
    subTick + subTicksToAdvance,
    fairValue.length - 1
  );
  const newSubTick = Math.floor(newSubTickFloat);

  if (newSubTick > subTick) {
    renderClobUpTo(newSubTick);
    subTick = newSubTick;
  }

  const currentPeriod = Math.floor(subTick / PERIOD_SUBTICKS);
  const posInPeriod = subTick % PERIOD_SUBTICKS;
  const pct = (posInPeriod / PERIOD_SUBTICKS) * 100;
  metronomeFillEl.style.width = `${pct}%`;

  // Hold the previous batch's reveal on screen for a few sub-ticks into the
  // new period so it's actually readable, then lock back to "sealed" for
  // the rest of the collecting window. Track state explicitly so we only
  // touch the DOM on a transition, never redundantly every frame.
  const REVEAL_HOLD_SUBTICKS = 6;
  const state = tickSealEl.dataset.state;
  if (posInPeriod < PERIOD_SUBTICKS - 2) {
    if (posInPeriod >= REVEAL_HOLD_SUBTICKS && state !== "sealed") {
      tickSealEl.className = "seal-visual sealed";
      tickSealEl.innerHTML = "";
      tickSealEl.dataset.state = "sealed";
    }
  } else if (posInPeriod === PERIOD_SUBTICKS - 2 && state !== "clearing") {
    tickSealEl.className = "seal-visual clearing";
    tickSealEl.innerHTML = "";
    tickSealEl.dataset.state = "clearing";
  }

  if (currentPeriod > lastPeriodShown && currentPeriod < batch.events.length) {
    renderBatchReveal(currentPeriod, batch.events[currentPeriod]);
    lastPeriodShown = currentPeriod;
  }
}

requestAnimationFrame(frame);

// --- Live on-chain panel -------------------------------------------------
// Real devnet reads/writes via teek/src/chain.ts — no simulation below
// this line. See teek/scripts/seed-demo-market.mjs for how the market
// this trades against was created, and how the demo wallet gets funded.
const onchainProgramEl = document.getElementById("onchain-program")!;
const onchainWalletEl = document.getElementById("onchain-wallet")!;
const onchainErValidatorEl = document.getElementById("onchain-er-validator")!;
const onchainDelegationEl = document.getElementById("onchain-delegation")!;
const onchainSolEl = document.getElementById("onchain-sol")!;
const onchainBaseBalEl = document.getElementById("onchain-base-bal")!;
const onchainQuoteBalEl = document.getElementById("onchain-quote-bal")!;
const onchainBaseWalletEl = document.getElementById("onchain-base-wallet")!;
const onchainQuoteWalletEl = document.getElementById("onchain-quote-wallet")!;
const onchainBatchEl = document.getElementById("onchain-batch")!;
const onchainOrderCountEl = document.getElementById("onchain-order-count")!;
const onchainStatusEl = document.getElementById("onchain-status")!;
const onchainRevealEl = document.getElementById("onchain-reveal")!;
const onchainDemoLogEl = document.getElementById("onchain-demo-log")!;
const onchainPriceInput = document.getElementById("onchain-price") as HTMLInputElement;
const onchainQtyInput = document.getElementById("onchain-qty") as HTMLInputElement;
let preferHostedErReads = localStorage.getItem("teek-prefer-hosted-er") === "1";

const liveActionButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>(
    "#onchain-refresh, #onchain-deposit-base, #onchain-deposit-quote, #onchain-delegate, #onchain-open-er, #onchain-buy, #onchain-sell, #onchain-clear, #onchain-commit, #onchain-run-demo"
  )
);

onchainProgramEl.textContent = chain.PROGRAM_ID.toBase58();
onchainWalletEl.textContent = chain.wallet.publicKey.toBase58();
onchainErValidatorEl.textContent = chain.ER_VALIDATOR.toBase58();

function setOnchainStatus(msg: string, isError = false) {
  onchainStatusEl.textContent = msg;
  onchainStatusEl.classList.toggle("error", isError);
}

function setLiveControlsDisabled(disabled: boolean) {
  liveActionButtons.forEach((button) => {
    button.disabled = disabled;
    button.setAttribute("aria-busy", disabled ? "true" : "false");
  });
}

function resetDemoLog() {
  onchainDemoLogEl.innerHTML = "";
}

function addDemoLog(msg: string, state: "pending" | "done" | "error" = "pending") {
  const item = document.createElement("li");
  item.textContent = msg;
  item.dataset.state = state;
  onchainDemoLogEl.appendChild(item);
  item.scrollIntoView({ block: "nearest" });
}

function markLastDemoLog(state: "done" | "error") {
  const item = onchainDemoLogEl.lastElementChild as HTMLElement | null;
  if (item) item.dataset.state = state;
}

async function canReadHostedErState(): Promise<boolean> {
  try {
    const [, , traderAccount] = await Promise.all([
      chain.fetchErMarket(),
      chain.fetchErOrderBook(),
      chain.fetchErTraderAccount(),
    ]);
    return Boolean(traderAccount);
  } catch {
    return false;
  }
}

async function waitFor<T>(
  label: string,
  read: () => Promise<T>,
  done: (value: T) => boolean,
  attempts: number,
  intervalMs: number
): Promise<T> {
  let value = await read();
  for (let attempt = 0; attempt < attempts && !done(value); attempt++) {
    setOnchainStatus(`waiting for ${label}… (${attempt + 1}/${attempts})`);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    value = await read();
    await refreshOnchainState();
  }
  if (!done(value)) throw new Error(`timed out waiting for ${label}`);
  return value;
}

async function refreshOnchainState() {
  try {
    const [sol, tokens, statuses] = await Promise.all([
      chain.getSolBalance(),
      chain.getTokenBalances(),
      chain.getDelegationStatuses().catch(() => null),
    ]);
    const isDelegated = statuses ? Object.values(statuses).some(Boolean) : preferHostedErReads;
    onchainDelegationEl.textContent = statuses
      ? Object.values(statuses).every(Boolean)
        ? "On ER"
        : Object.values(statuses).some(Boolean)
          ? "partial"
          : "On Solana"
      : preferHostedErReads ? "On ER" : "Unavailable";

    const [traderAccount, market, orderBook] = await Promise.all([
      isDelegated ? chain.fetchErTraderAccount() : chain.fetchTraderAccount(),
      isDelegated ? chain.fetchErMarket() : chain.fetchMarket(),
      isDelegated ? chain.fetchErOrderBook() : chain.fetchOrderBook(),
    ]);
    onchainSolEl.textContent = (sol / 1e9).toFixed(4);
    onchainBaseWalletEl.textContent = tokens.base.toLocaleString();
    onchainQuoteWalletEl.textContent = tokens.quote.toLocaleString();
    onchainBaseBalEl.textContent = traderAccount
      ? `${traderAccount.baseBalance.toLocaleString()} (${traderAccount.baseLocked.toLocaleString()} locked)`
      : "No account yet";
    onchainQuoteBalEl.textContent = traderAccount
      ? `${traderAccount.quoteBalance.toLocaleString()} (${traderAccount.quoteLocked.toLocaleString()} locked)`
      : "No account yet";
    onchainBatchEl.textContent = String(market.currentBatchId);
    onchainOrderCountEl.textContent = String(orderBook.orderCount);

    try {
      const reveal = isDelegated ? await chain.fetchErReveal() : await chain.fetchReveal();
      onchainRevealEl.textContent = reveal.hadTrade
        ? `Batch ${reveal.batchId}: ${reveal.matchedQty} units traded at ${reveal.clearingPrice} (${reveal.fillCount} fills)`
        : `Batch ${reveal.batchId}: no matching orders`;
    } catch {
      onchainRevealEl.textContent = "No trades yet";
    }
  } catch (err: any) {
    setOnchainStatus(`Could not refresh: ${err.message ?? err}`, true);
  }
}

document.getElementById("onchain-refresh")!.addEventListener("click", () => {
  setOnchainStatus("Refreshing…");
  refreshOnchainState().then(() => { if (!onchainStatusEl.classList.contains('error')) setOnchainStatus("Balances updated"); });
});

document.getElementById("onchain-deposit-base")!.addEventListener("click", async () => {
  setOnchainStatus("Depositing base tokens…");
  try {
    await chain.ensureTraderAccount();
    await chain.depositBase(100);
    setOnchainStatus("100 base tokens deposited");
  } catch (err: any) {
    setOnchainStatus(`Deposit failed: ${err.message ?? err}`, true);
  }
  refreshOnchainState();
});

document.getElementById("onchain-deposit-quote")!.addEventListener("click", async () => {
  setOnchainStatus("Depositing quote tokens…");
  try {
    await chain.ensureTraderAccount();
    await chain.depositQuote(1000);
    setOnchainStatus("1,000 quote tokens deposited");
  } catch (err: any) {
    setOnchainStatus(`Deposit failed: ${err.message ?? err}`, true);
  }
  refreshOnchainState();
});

document.getElementById("onchain-delegate")!.addEventListener("click", async () => {
  setOnchainStatus("Moving market accounts to ER…");
  try {
    await chain.ensureTraderAccount();
    await chain.delegateToHostedEr();
    preferHostedErReads = true;
    localStorage.setItem("teek-prefer-hosted-er", "1");
    setOnchainStatus("Market accounts are on ER");
  } catch (err: any) {
    setOnchainStatus(`Could not move accounts: ${err.message ?? err}`, true);
  }
  refreshOnchainState();
});

document.getElementById("onchain-open-er")!.addEventListener("click", async () => {
  setOnchainStatus("Opening a batch…");
  try {
    await chain.openErSubmitWindow();
    preferHostedErReads = true;
    localStorage.setItem("teek-prefer-hosted-er", "1");
    setOnchainStatus("Batch requested. Wait for it to open, then place orders.");
  } catch (err: any) {
    setOnchainStatus(`Could not open batch: ${err.message ?? err}`, true);
  }
  refreshOnchainState();
});

async function submitOnchainOrder(side: "buy" | "sell") {
  const price = Number(onchainPriceInput.value);
  const qty = Number(onchainQtyInput.value);
  setOnchainStatus(`Placing ${side} order…`);
  try {
    await chain.submitOrderOnEr(side, price, qty);
    preferHostedErReads = true;
    localStorage.setItem("teek-prefer-hosted-er", "1");
    setOnchainStatus(`${side === 'buy' ? 'Buy' : 'Sell'} order sent to ER`);
  } catch (err: any) {
    setOnchainStatus(`Order failed: ${err.message ?? err}`, true);
  }
  refreshOnchainState();
}

document.getElementById("onchain-buy")!.addEventListener("click", () => submitOnchainOrder("buy"));
document.getElementById("onchain-sell")!.addEventListener("click", () => submitOnchainOrder("sell"));

document.getElementById("onchain-clear")!.addEventListener("click", async () => {
  setOnchainStatus("Clearing batch…");
  try {
    await chain.clearBatchOnEr();
    setOnchainStatus("Waiting for the result…");
    // The oracle invokes clear_batch_callback asynchronously; poll for it
    // rather than assuming it's landed by the time this call returns.
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      await refreshOnchainState();
    }
    setOnchainStatus("Check the batch result above");
  } catch (err: any) {
    setOnchainStatus(`Could not clear batch: ${err.message ?? err}`, true);
  }
});

document.getElementById("onchain-commit")!.addEventListener("click", async () => {
  setOnchainStatus("Saving the result to Solana…");
  try {
    const result = await chain.commitAndUndelegateFromEr();
    preferHostedErReads = false;
    localStorage.removeItem("teek-prefer-hosted-er");
    setOnchainStatus(`Save requested: ${result.commitmentSignature.slice(0, 8)}…`);
  } catch (err: any) {
    setOnchainStatus(`Could not save result: ${err.message ?? err}`, true);
  }
  refreshOnchainState();
});

document.getElementById("onchain-run-demo")!.addEventListener("click", async () => {
  setLiveControlsDisabled(true);
  resetDemoLog();
  try {
    const alreadyDelegated = await canReadHostedErState();
    if (alreadyDelegated) {
      preferHostedErReads = true;
      localStorage.setItem("teek-prefer-hosted-er", "1");
      addDemoLog("Market accounts are already on ER.", "done");
    } else {
      addDemoLog("Checking the demo account…");
      setOnchainStatus("Checking demo account…");
      await chain.ensureTraderAccount();
      markLastDemoLog("done");

      addDemoLog("Checking demo balances…");
      let trader = await chain.fetchTraderAccount();
      if (!trader || trader.baseBalance < 100) {
        setOnchainStatus("Depositing 100 base tokens…");
        await chain.depositBase(100);
        trader = await chain.fetchTraderAccount();
      }
      if (!trader || trader.quoteBalance < 1000) {
        setOnchainStatus("Depositing 1,000 quote tokens…");
        await chain.depositQuote(1000);
        trader = await chain.fetchTraderAccount();
      }
      markLastDemoLog("done");

      addDemoLog("Moving market accounts to ER…");
      setOnchainStatus("Moving accounts to ER…");
      await chain.delegateToHostedEr();
      preferHostedErReads = true;
      localStorage.setItem("teek-prefer-hosted-er", "1");
      await waitFor(
        "hosted ER reads",
        () => canReadHostedErState(),
        (ok) => ok,
        30,
        2000
      );
      markLastDemoLog("done");
    }

    // The hosted ER runs ~10 ms/slot, so a batch window is only seconds long;
    // if a slow network lets it close mid-submission, open a fresh batch and resubmit.
    const batchSealed = /BatchSealed|"Custom":6002|0x1772/;
    const maxAttempts = 3;
    for (let attempt = 1; ; attempt++) {
      addDemoLog(
        attempt === 1
          ? "Opening a batch…"
          : `Batch closed before both orders arrived. Trying again (${attempt}/${maxAttempts})…`
      );
      const beforeOpen = await chain.fetchErMarket();
      setOnchainStatus("Opening batch…");
      await chain.openErSubmitWindow();
      await waitFor(
        "ER VRF callback to open a fresh batch",
        () => chain.fetchErMarket(),
        (market) => market.currentBatchId > beforeOpen.currentBatchId,
        180,
        500
      );
      markLastDemoLog("done");

      addDemoLog("Placing one buy and one sell order…");
      try {
        setOnchainStatus("Placing buy order…");
        await chain.submitOrderOnEr("buy", 100, 10);
        setOnchainStatus("Placing sell order…");
        await chain.submitOrderOnEr("sell", 100, 10);
        await waitFor(
          "both ER orders",
          () => chain.fetchErOrderBook(),
          (book) => book.orderCount >= 2,
          10,
          1000
        );
        markLastDemoLog("done");
        break;
      } catch (err) {
        if (attempt >= maxAttempts || !batchSealed.test(String((err as any)?.message ?? err))) throw err;
        markLastDemoLog("done");
      }
    }

    addDemoLog("Waiting for the batch to close…");
    const marketWithOrders = await chain.fetchErMarket();
    const closeSlot = marketWithOrders.batchOpenSlot + marketWithOrders.batchPeriodSlots;
    await waitFor(
      "batch close slot",
      () => chain.getErSlot(),
      (slot) => slot >= closeSlot,
      90,
      1000
    );
    markLastDemoLog("done");

    addDemoLog("Clearing the batch…");
    setOnchainStatus("Clearing batch…");
    await chain.clearBatchOnEr();
    await waitFor(
      "oracle callback and uniform-price reveal",
      () => chain.fetchErReveal(),
      (reveal) => reveal.fillCount >= 2 && reveal.matchedQty > 0,
      40,
      2000
    );
    markLastDemoLog("done");

    addDemoLog("Saving the result to Solana…");
    setOnchainStatus("Saving result…");
    const result = await chain.commitAndUndelegateFromEr();
    preferHostedErReads = false;
    localStorage.removeItem("teek-prefer-hosted-er");
    try {
      await waitFor(
        "undelegation",
        () => chain.getDelegationStatuses().catch(() => null),
        (statuses) => Boolean(statuses && Object.values(statuses).every((value) => !value)),
        12,
        2000
      );
    } catch {
      // The commitment signature is the authoritative user-facing proof that
      // the commit was scheduled. MagicBlock's status endpoint can lag or
      // timeout after the commitment is already in flight, so a slow status
      // response should not turn a successful demo into a red failure state.
      addDemoLog("Save accepted. The ER status may take a little longer to update.", "done");
    }
    markLastDemoLog("done");

    await refreshOnchainState();
    setOnchainStatus(`Demo complete · save ${result.commitmentSignature.slice(0, 8)}…`);
    addDemoLog("Done. The orders cleared at one price and the result was sent to devnet.", "done");
  } catch (err: any) {
    markLastDemoLog("error");
    setOnchainStatus(`Demo stopped: ${err.message ?? err}`, true);
    addDemoLog("Something went wrong. Refresh balances before trying again.", "error");
  } finally {
    setLiveControlsDisabled(false);
    refreshOnchainState();
  }
});

refreshOnchainState();
setInterval(refreshOnchainState, 15000);
