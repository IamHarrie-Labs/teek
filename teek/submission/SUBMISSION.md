# Teek submission texts

Everything here is written to be pasted into the submission forms. Each form asks slightly different questions, so take the parts that fit and check the form's own wording before you send it. Anything in square brackets is something only you can fill in.

Links you'll need again and again

- Live site https://useteek.xyz
- Source code https://github.com/IamHarrie-Labs/teek
- X https://x.com/useteekapp
- Proof of the devnet runs https://useteek.xyz/evidence.html
- Program on devnet `B6eqSCBhokuZLKqBrzwhquUho183P3Fvu8pgC4a9PFkY`
- Demo video [paste the link once it's uploaded]

## Name

Teek

## One line

Private bids, one opening. A group buys into a new Meteora token together at one shared price, so bots can't win the first second.

## Short description

When a token launches on Solana, bots usually buy in the very first second and everyone after them pays more. Teek flips the order. The creator publishes fixed rules, buyers deposit into an escrow and bid privately inside MagicBlock's Private Ephemeral Rollup, and when bidding closes one transaction creates the Meteora pool and makes the opening purchase with everyone's money at once. Everyone pays the same average price. If the launch doesn't raise its minimum, everyone gets their deposit back.

## Full description

The problem is simple to see if you've ever watched a launch. A token goes live, a bot buys the cheapest part of the curve within a second, and real people buy a few seconds later at a worse price, often from that same bot. Being fast is the whole game, and humans lose it.

Teek doesn't try to make people faster. It removes the race. Here's how a launch goes.

1. The creator publishes the rules. That covers the token, the curve, the smallest and largest amount the launch will raise, the fewest tokens buyers must get, and the dates. Once published, the rules are locked.
2. Buyers deposit test funds into an escrow owned by the launch, not by the creator.
3. During the bidding window each buyer decides how much of their deposit to actually spend. The bid sits inside MagicBlock's Private Ephemeral Rollup, where only that buyer can read it. Other buyers and the creator can't.
4. When bidding closes, every bid goes back to Solana and Teek adds them up. If the total is under the minimum, the launch switches to refunds and nobody loses anything.
5. If the minimum is met, a single transaction creates the Meteora Dynamic Bonding Curve pool and buys from it with all the accepted money. Since the pool didn't exist a moment earlier, nobody could trade before the group.
6. A random number from MagicBlock VRF settles the leftover token units that can't be split evenly. Splitting one bid into several doesn't raise what you expect to get.
7. Each buyer claims their tokens plus any part of their deposit that wasn't spent. From then on the token trades normally on Meteora.

We tested this on devnet in a few ways. Two recorded launches show both endings. One opened, spent 0.6 test tokens on the curve and paid both buyers. The other missed its minimum, never created a pool and returned all 1.5 in deposits. A separate live test confirmed that bids really are unreadable to other people while bidding is open. On October 11 we also ran the whole flow twice through the public website using only the built-in demo wallet, from publishing to claiming, and fixed the problems those runs turned up.

We want to be upfront about the limits. Deposits are public, so the amount each wallet puts in is visible. Bids are only hidden while bidding is open, and they become public afterwards. A launch can take 24 buyers right now. It's one shared purchase on a fixed curve, not an auction where each person names a price. It runs on devnet only, and the code has had a development review but not an outside audit.

## Where the project came from

Please include this in every form that asks about prior work.

Teek started in September 2026 as Tick, a batch trading market for MagicBlock's Solana Blitz v8. We didn't submit it. In October we built the launch product on top of it, which added private bids in the Private Ephemeral Rollup, settlement into Meteora DBC, claims, refunds, the launch website, the Launch Studio and the public receipts. The first commit in the repository is the September version, so anyone can see exactly what was built during the event.

## How it uses MagicBlock (for Blitz v9 and the main form)

Teek uses two MagicBlock products, and the app wouldn't work without either.

The Private Ephemeral Rollup holds the bids. Each bid account is delegated to MagicBlock's TEE validator with a permission that lets only the bidder read and edit it. When bidding closes, the permission is removed and the bid is committed back to Solana, where the program counts it. Our live test checked that a second bidder and the creator couldn't read someone else's bid while the owner could.

VRF provides the random number used to share out leftover token units fairly after the opening purchase. The program requests it and MagicBlock's oracle calls back with the result.

## How it uses Meteora (for the Meteora DBC sidetrack)

Teek is a way to open a Dynamic Bonding Curve launch fairly. The settle transaction calls DBC to create the pool and then swaps the group's accepted money into it, all in one go. The tokens land in a vault owned by the launch and are shared out exactly by each person's accepted amount.

The creator chooses the curve in the Launch Studio, either a standard one or a custom one with their own supply, fee and migration settings. Before anyone deposits, the Studio uses the Meteora SDK to rehearse what the opening would look like at different demand levels, including fees and whether the minimum token amount would be met. The rules Teek publishes include a hash of the exact DBC config, and settlement checks it, so the curve can't be swapped after people deposit.

What we think this adds for Meteora is a fair first buy for DBC launches. The first trade on a new curve is usually the most valuable one, and right now it goes to whoever is fastest.

## For CertiK and Adevar (audit credit tracks)

Teek holds other people's money in escrow, so an outside audit is the most important step before it can ever touch mainnet. The program is written in Rust with Anchor. It handles deposits, private bids, a settlement that calls into Meteora, randomness callbacks, and claims and refunds with exact integer maths. It has a development review and adversarial tests, and the review notes are in the repository, but it hasn't had a professional audit. Credits would go straight into auditing the settlement and refund paths, which are where the money moves.

[Adevar asks for a tweet. A draft is at the bottom of this file.]

## For Akca

[Check what Akca's form asks. If it's about how you'd use their credits, say what you'd actually use them for. Don't stretch the project to fit.]

## For the regional Superteam track

[Add who you are, where you're based and why this matters to people launching or buying tokens in your region. Only include things that are true. A couple of real conversations with local creators or buyers would make this section much stronger than anything we could write here.]

## Team

[Your name, role, links and a sentence on your background. Add anyone else who worked on it.]

## Draft tweet for Adevar

Token launches on Solana are a speed race, and bots win it. Teek lets a group bid privately and buy the opening together at one shared price, in the same transaction that creates the Meteora pool. If the minimum isn't met, everyone gets refunded. Live on devnet https://useteek.xyz

[Tag the accounts the Adevar brief asks for.]
