//! Events for path-payment contract. Soroban symbols are max 9 characters.

use soroban_sdk::{symbol_short, Address, Env, String, Symbol, Vec};

use crate::types::Asset;

pub fn emit_initialized(env: &Env, admin: &Address) {
    env.events()
        .publish((symbol_short!("init"),), (admin.clone(),));
}

pub fn emit_path_found(env: &Env, source: &Address, dest: &Address, path: &Vec<Asset>) {
    env.events().publish(
        (symbol_short!("path_fnd"),),
        (source.clone(), dest.clone(), path.clone()),
    );
}

pub fn emit_path_payment_executed(
    env: &Env,
    split_id: &String,
    source: &Address,
    dest: &Address,
    amount_received: i128,
    path_len: u32,
) {
    env.events().publish(
        (symbol_short!("pay_exec"),),
        (
            split_id.clone(),
            source.clone(),
            dest.clone(),
            amount_received,
            path_len,
        ),
    );
}

pub fn emit_pair_registered(env: &Env, from: &Address, to: &Address) {
    env.events()
        .publish((symbol_short!("pair_reg"),), (from.clone(), to.clone()));
}

/// Emits when a swap fails during path payment execution.
pub fn emit_swap_failed(
    env: &Env,
    from: &Address,
    to_asset_code: &Symbol,
    amount: i128,
    reason: &Symbol,
) {
    env.events().publish(
        (symbol_short!("swap_fail"), from),
        (to_asset_code, amount, reason),
    );
}

/// Emits when no payment path can be found between two assets.
pub fn emit_path_not_found(
    env: &Env,
    from_asset: &Symbol,
    to_asset: &Symbol,
) {
    env.events().publish(
        (symbol_short!("no_path"), from_asset),
        to_asset,
    );
}