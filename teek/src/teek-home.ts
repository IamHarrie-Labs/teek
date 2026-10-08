import './teek-home.css';
import { teekMark } from './brand';

const successLaunch = '4orftfqsHc92GJVrFSuvqZKab3LsL4txyNm7BjUYWuwY';
const refundLaunch = 'B2PstiXkcw81SDafJrzQ8eB4YbcG3eYS33hH1Jjq1Y4X';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header class="site-header" aria-label="Primary navigation">
    <a class="brand" href="#top" aria-label="Teek home">
      ${teekMark}<span>TEEK</span>
    </a>
    <nav class="nav-links" aria-label="Main navigation">
      <a href="#product">Product</a><a href="#launches">Launches</a><a href="#how">How it works</a><a href="/evidence.html">Evidence</a>
    </nav>
    <div class="nav-actions"><span class="network"><i aria-hidden="true"></i>Solana Devnet</span><a class="nav-cta" href="/launch.html">Open app</a></div>
    <button class="menu-button" type="button" aria-label="Open menu" aria-expanded="false"><span></span><span></span></button>
  </header>

  <main id="top">
    <section class="hero" aria-labelledby="hero-title">
      <div class="hero-shade" aria-hidden="true"></div>
      <div class="hero-copy">
        <p class="kicker"><span></span> Powered by MagicBlock</p>
        <h1 id="hero-title">Private bids.<br>One opening.</h1>
        <p class="hero-subtitle">Launch on Solana with terms everyone can verify.</p>
        <a class="primary-cta" href="#launches">Explore launches <span aria-hidden="true">↘</span></a>
      </div>
      <div class="scroll-note" aria-hidden="true"><span>Scroll to discover</span><i></i></div>
    </section>

    <section class="product" id="product" aria-labelledby="product-title">
      <div class="sun" aria-hidden="true"></div>
      <div class="product-heading">
        <p class="live-pill"><span></span> Live on devnet</p>
        <h2 id="product-title">Launch terms that<br>execute themselves</h2>
      </div>
      <article class="browser-shell" aria-label="Teek launch dashboard preview">
        <div class="browser-bar"><div class="traffic" aria-hidden="true"><i></i><i></i><i></i></div><div class="address"><span aria-hidden="true">◇</span> teek.app</div><span class="window-icon" aria-hidden="true">□</span></div>
        <div class="dashboard">
          <div class="dash-nav"><strong>TEEK</strong><span class="active">Overview</span><span>Private bids</span><span>Settlement</span><span>Evidence</span></div>
          <div class="dash-title"><div><p>OPEN · SETTLED</p><h3>Tick Opening</h3></div><a href="/launch.html?launch=${successLaunch}">View launch <span aria-hidden="true">↗</span></a></div>
          <div class="metric-grid">
            <section class="metric"><p>Quote spent</p><strong>0.600000</strong><small>Raise cap filled</small><svg viewBox="0 0 300 82" role="img" aria-label="Opening purchase progression"><path class="gridline" d="M0 65H300M0 40H300M0 15H300"/><path class="chart-fill" d="M0 70 L42 62 L84 55 L126 50 L168 40 L210 35 L252 20 L300 8 L300 82 L0 82Z"/><path class="chart-line" d="M0 70 L42 62 L84 55 L126 50 L168 40 L210 35 L252 20 L300 8"/></svg></section>
            <section class="metric"><p>OPEN received</p><strong>1,897,418</strong><small>Shared pro rata</small><div class="dot-matrix" aria-label="Allocation matrix">${Array.from({length:48},(_,i)=>`<i class="${[8,17,20,27,34,43].includes(i)?'hot':''}"></i>`).join('')}</div></section>
            <section class="metric"><p>Claims complete</p><strong>2 / 2</strong><small>Allocations + refunds</small><div class="bars" aria-label="Launch settlement stages"><i style="--h:42%"></i><i style="--h:58%"></i><i style="--h:72%"></i><i style="--h:88%"></i></div></section>
          </div>
          <div class="proof-grid">
            <section class="proof"><span class="proof-icon" aria-hidden="true">⌁</span><div><p>Privacy proof</p><strong>Unauthorized read denied</strong><small>Bid amounts stayed confidential during the window.</small></div></section>
            <section class="proof"><span class="proof-icon" aria-hidden="true">∞</span><div><p>Settlement proof</p><strong>Atomic pool + purchase</strong><small>The pool and opening purchase completed together.</small></div></section>
          </div>
        </div>
      </article>
    </section>

    <section class="launch-section" id="launches" aria-labelledby="launches-title">
      <div class="section-intro"><p class="overline">Two outcomes. One contract.</p><h2 id="launches-title">The launch either executes<br>on your terms—or refunds.</h2><p>Teek keeps the promise visible from private bidding through public settlement.</p></div>
      <div class="launch-cards">
        <a class="launch-card success" href="/launch.html?launch=${successLaunch}"><span class="card-index">01</span><span class="status"><i></i> Settled</span><div><p>Tick Opening</p><strong>0.6 quote</strong><small>1,897,418.306355 OPEN received</small></div><span class="card-arrow" aria-hidden="true">↗</span></a>
        <a class="launch-card refund" href="/launch.html?launch=${refundLaunch}"><span class="card-index">02</span><span class="status"><i></i> Refunded</span><div><p>Tick Refund</p><strong>0 quote spent</strong><small>Both deposits returned in full</small></div><span class="card-arrow" aria-hidden="true">↗</span></a>
      </div>
    </section>

    <section class="how" id="how" aria-labelledby="how-title">
      <div class="how-heading"><p class="overline">The flight plan</p><h2 id="how-title">From hidden demand<br>to public liquidity.</h2></div>
      <ol>
        <li><span>01</span><div><h3>Lock the terms</h3><p>The creator fixes the curve, raise limits, output floor and timing before funding.</p></div></li>
        <li><span>02</span><div><h3>Bid in private</h3><p>MagicBlock keeps bid amounts confidential while public escrow proves funding.</p></div></li>
        <li><span>03</span><div><h3>Settle or refund</h3><p>One atomic opening purchase creates the Meteora pool—or every bidder can exit.</p></div></li>
      </ol>
    </section>
  </main>

  <footer><a class="brand footer-brand" href="#top">${teekMark}<span>TEEK</span></a><p>Private bids. One opening. Public proof.</p><div><a href="/launch.html">Launch app</a><a href="/market.html">Market simulator</a></div></footer>
`;

const header = document.querySelector<HTMLElement>('.site-header')!;
const menu = document.querySelector<HTMLButtonElement>('.menu-button')!;
menu.addEventListener('click', () => {
  const open = header.classList.toggle('menu-open');
  menu.setAttribute('aria-expanded', String(open));
  menu.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
});
document.querySelectorAll<HTMLAnchorElement>('.nav-links a').forEach(link => link.addEventListener('click', () => {
  header.classList.remove('menu-open');
  menu.setAttribute('aria-expanded', 'false');
  menu.setAttribute('aria-label', 'Open menu');
}));
addEventListener('keydown', event => {
  if (event.key !== 'Escape' || !header.classList.contains('menu-open')) return;
  header.classList.remove('menu-open');
  menu.setAttribute('aria-expanded', 'false');
  menu.setAttribute('aria-label', 'Open menu');
  menu.focus();
});

const product = document.querySelector<HTMLElement>('.product')!;
const updateScroll = () => {
  const progress = Math.max(0, Math.min(1, (scrollY - innerHeight * .45) / (innerHeight * .75)));
  product.style.setProperty('--reveal', String(progress));
};
updateScroll(); addEventListener('scroll', updateScroll, {passive:true});
