# The Teek program

This folder is the part of Teek that lives on the Solana blockchain. It is written in Rust using Anchor, a popular framework that takes care of a lot of Solana boilerplate. Once deployed, nobody can quietly change how it handles money, and that is the whole point of putting the rules on chain.

It is deployed on devnet at `B6eqSCBhokuZLKqBrzwhquUho183P3Fvu8pgC4a9PFkY`.

## The files, one by one

`lib.rs` is the front door. Every action a wallet can take, like funding a launch or claiming tokens, is listed here and handed to the right file.

`launch.rs` handles a launch from creation through bidding. It stores the creator's fixed rules, keeps track of who funded, moves each bid into MagicBlock's private rollup so it stays hidden, and handles refunds when a launch fails or runs out of time.

`launch_settlement.rs` handles the end of a launch. It asks MagicBlock's VRF for one random number, creates the Meteora pool and makes the single opening purchase in the same transaction, then records how many tokens and how much refund each person can claim.

`launch_allocation.rs` does the sharing out. It splits the bought tokens and accepted money between bidders using whole-number maths, so no fraction of a token is ever lost or created by rounding. Splitting one bid into several cannot win you a bigger expected share.

`dbc_wire.rs` is a small, careful translator for talking to Meteora's Dynamic Bonding Curve program. It only accepts the exact setups Teek has tested.

`clearing.rs` is the original batch market engine from when the project was called Tick. Orders in a batch all fill at one price, so speed gives no advantage.

`state.rs` describes the shape of the data the original market stores, and `errors.rs` lists every error the program can return, with a readable message for each.

## Building and testing

Run the program's tests from the repository root.

```bash
cargo test -p teek
```

Build it the same way the deployed copy was built. The tools version matters, because newer default versions produce files devnet rejects.

```bash
cd programs/teek
cargo build-sbf --tools-version v1.57
```
