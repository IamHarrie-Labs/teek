# Tick Demo Video Script — under 3 minutes

## 0:00–0:20 — Hook

“Continuous order books reward speed. If a sniper bot is a few milliseconds faster, it can pick off stale quotes before normal users react. Tick shows the same market with one change: orders are grouped into batches that clear at one price, so speed stops being the edge.”

Show the top split-screen simulation. Point at the CLOB side where sniper PnL rises, then the Tick side where the sniper is flat or negative.

## 0:20–0:40 — Product overview

“Tick is a real-time uniform-price batch auction on Solana using MagicBlock Ephemeral Rollups. A batch opens, orders go into the ER, nobody gets priority from being faster, MagicBlock VRF clears the batch, and the final state commits back to Solana.”

Show the architecture diagram for a few seconds.

## 0:40–2:15 — Live demo

“Now this lower panel is the real devnet demo. It is using program `B6eq...PFkY` and the hosted MagicBlock ER validator.”

Click **Run Live Demo**.

Narrate the progress log:

- “First it creates or loads a trader account.”
- “Then it deposits demo base and quote tokens.”
- “Now it delegates market, order book, reveal, and trader state to the hosted ER.”
- “This opens a fresh ER-clock batch with MagicBlock VRF.”
- “The browser submits one buy and one sell through the hosted ER router.”
- “When the batch closes, clear requests ephemeral VRF.”
- “The callback reveals the result: both fills clear at the same price.”

Cut out dead waiting time if needed. Keep the progress log and reveal visible.

## 2:15–2:45 — Technical highlight

“Under the hood, the program uses zero-copy Anchor accounts for the order book and reveal, delegates them to MagicBlock ERs, and splits clearing into an async VRF request and callback. The important part is that the clearing rule lives on-chain: every fill in a batch receives one uniform price.”

Show `programs/tick/src/lib.rs` briefly at `clear_batch` and `clear_batch_callback`, or show the architecture diagram again.

## 2:45–3:00 — Close

“Tick is not another order book. It is a market structure demo that makes MagicBlock’s real-time state obvious in one click: the sniper is faster, but speed is worthless.”
