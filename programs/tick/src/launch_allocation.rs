//! Conserved integer systematic rounding. Uniform offsets give exact pro-rata
//! marginals; VRF expansion supplies computational randomness, not a claim of
//! mathematically exact rational probabilities over a finite seed space.
use anchor_lang::prelude::*;
use crate::{errors::TickError, launch::MAX_LAUNCH_BIDDERS};

pub fn offset(seed: &[u8;32], context: &[u8;32], domain: &[u8], bound: u128) -> Result<u128> {
    require!(bound > 0, TickError::AllocationInvariant);
    // Equivalent to 2^128 mod bound without representing 2^128.
    let threshold = ((u128::MAX % bound) + 1) % bound;
    for counter in 0u64..64 {
        let digest = solana_sha256_hasher::hashv(&[b"tick/launch/random/v1", seed, context,
            &(domain.len() as u64).to_le_bytes(), domain, &counter.to_le_bytes()]).to_bytes();
        let mut bytes = [0u8;16]; bytes.copy_from_slice(&digest[..16]);
        let value = u128::from_le_bytes(bytes);
        if value >= threshold { return Ok(value % bound); }
    }
    err!(TickError::RandomnessExhausted)
}

pub fn round_at(weights: &[u64], available: u64, mut point: u128) -> Result<Vec<u64>> {
    require!(weights.len() <= MAX_LAUNCH_BIDDERS, TickError::TooManyBidders);
    let total = weights.iter().try_fold(0u128, |sum, w| sum.checked_add(*w as u128))
        .ok_or(TickError::Overflow)?;
    if total == 0 {
        require!(available == 0, TickError::AllocationInvariant);
        return Ok(vec![0; weights.len()]);
    }
    require!(point < total, TickError::AllocationInvariant);
    let mut end = 0u128;
    let mut output = Vec::with_capacity(weights.len());
    for &weight in weights {
        let numerator = (weight as u128).checked_mul(available as u128).ok_or(TickError::Overflow)?;
        let mut allocation = u64::try_from(numerator / total).map_err(|_| TickError::Overflow)?;
        end = end.checked_add(numerator % total).ok_or(TickError::Overflow)?;
        if point < end {
            allocation = allocation.checked_add(1).ok_or(TickError::Overflow)?;
            point = point.checked_add(total).ok_or(TickError::Overflow)?;
        }
        output.push(allocation);
    }
    require!(output.iter().map(|a| *a as u128).sum::<u128>() == available as u128, TickError::AllocationInvariant);
    Ok(output)
}

pub fn round(weights: &[u64], available: u64, seed: &[u8;32], context: &[u8;32], domain: &[u8]) -> Result<Vec<u64>> {
    require!(weights.len() <= MAX_LAUNCH_BIDDERS, TickError::TooManyBidders);
    let total = weights.iter().map(|w| *w as u128).sum::<u128>();
    if total == 0 { return round_at(weights, available, 0); }
    round_at(weights, available, offset(seed, context, domain, total)?)
}

pub fn minimum_output(min_at_cap: u64, accepted: u64, cap: u64) -> Result<u64> {
    require!(min_at_cap > 0 && accepted > 0 && cap >= accepted, TickError::InvalidAmount);
    let numerator = (min_at_cap as u128).checked_mul(accepted as u128).ok_or(TickError::Overflow)?;
    let ceil=numerator.checked_add(cap as u128 - 1).ok_or(TickError::Overflow)?;
    u64::try_from(ceil / cap as u128).map_err(|_| error!(TickError::Overflow))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn exhaustive_uniform_offsets_conserve_and_have_exact_marginals() {
        for a in 0..6u64 { for b in 0..6u64 { for c in 0..6u64 {
            let weights = [a,b,c]; let total = a+b+c;
            if total == 0 { continue; }
            for available in 0..9u64 {
                let mut sums = [0u128;3];
                for point in 0..total {
                    let out = round_at(&weights, available, point as u128).unwrap();
                    for i in 0..3 {
                        let n = weights[i] as u128 * available as u128;
                        assert!(out[i] as u128 == n / total as u128 || out[i] as u128 == (n + total as u128 - 1) / total as u128);
                        sums[i] += out[i] as u128;
                    }
                }
                for i in 0..3 { assert_eq!(sums[i], weights[i] as u128 * available as u128); }
            }
        } } }
    }
    #[test]
    fn splitting_preserves_aggregate_expectation_but_can_change_variance() {
        let whole = [2,1,1]; let split = [1,1,1,1];
        let mut w = 0; let mut s = 0;
        for p in 0..4 { w += round_at(&whole, 2, p).unwrap()[0];
            let r = round_at(&split, 2, p).unwrap(); s += r[0]+r[2]; }
        assert_eq!(w,s);
        assert_eq!(round_at(&whole,2,0).unwrap()[0],1);
        assert_eq!(round_at(&split,2,0).unwrap()[0]+round_at(&split,2,0).unwrap()[2],2);
    }
    #[test]
    fn handles_max_values_zero_and_capacity_without_float_or_overflow() {
        let weights = [u64::MAX;24];
        let out = round(&weights,u64::MAX,&[5;32],&[8;32],b"base").unwrap();
        assert_eq!(out.iter().map(|n| *n as u128).sum::<u128>(), u64::MAX as u128);
        assert!(round_at(&[1;25],1,0).is_err());
        assert_eq!(round_at(&[0,0],0,0).unwrap(),vec![0,0]);
        assert!(round_at(&[0,0],1,0).is_err());
        assert_eq!(minimum_output(3,1,2).unwrap(),2);
        assert_eq!(minimum_output(u64::MAX,u64::MAX,u64::MAX).unwrap(),u64::MAX);
    }
    #[test]
    fn entire_seed_and_domains_affect_sampler_and_no_modulo_bias_fallback() {
        let mut altered = [0;32]; altered[31]=1;
        assert_ne!(offset(&[0;32],&[1;32],b"quote",u128::MAX).unwrap(),offset(&altered,&[1;32],b"quote",u128::MAX).unwrap());
        assert_ne!(offset(&altered,&[1;32],b"quote",u128::MAX).unwrap(),offset(&altered,&[1;32],b"base",u128::MAX).unwrap());
        assert!(offset(&altered,&[1;32],b"base",0).is_err());
    }
}
