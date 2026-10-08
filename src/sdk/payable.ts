import type { EscrowSnapshot } from './types';

/**
 * Whether an account can hold a token at all. What `chain.canReceive` reads off
 * the ledger, separated from it so the decision below can be tested without RPC.
 */
export interface PayeeStatus {
  accountExists: boolean;
  hasTrustline: boolean;
}

export type PayoutProblem = 'no_account' | 'no_trustline';

export interface PayoutBlock {
  /** The account this settlement would pay. */
  payee: string;
  problem: PayoutProblem;
  /** The viewer is the payee, so they can fix it with the wallet already connected. */
  selfFixable: boolean;
}

/** Who a settlement pays. Every release path pays the seller; a refund pays the buyer. */
export function payeeOf(e: Pick<EscrowSnapshot, 'buyer' | 'seller'>, outcome: 'Release' | 'Refund'): string {
  return outcome === 'Release' ? e.seller : e.buyer;
}

/**
 * Settlement pays with a plain `transfer`, which panics when the recipient cannot
 * hold the asset — so the call reverts and the escrow does not move. Nothing in
 * `contracts/escrow/src/lib.rs` softens that: only the platform fee goes out
 * through `try_transfer`, deliberately, because the seller must be paid in full
 * or nothing should change. The check therefore has to happen up here, before a
 * signature, or the person just sees a reverted transaction.
 *
 * Returns what to say, or null when the payout can land. A status that has not
 * been read yet is also null: a check we could not make must not block a call
 * that simulation will judge on its own.
 */
export function payoutBlock(
  payee: string,
  viewerAddress: string | null | undefined,
  status: PayeeStatus | undefined,
): PayoutBlock | null {
  if (!status) return null;
  const selfFixable = !!viewerAddress && viewerAddress === payee;
  if (!status.accountExists) return { payee, problem: 'no_account', selfFixable };
  if (!status.hasTrustline) return { payee, problem: 'no_trustline', selfFixable };
  return null;
}

/**
 * One wording for every call site, so the buyer's "ask them" and the seller's
 * "here is the button" never drift apart.
 *
 * `when` is whether the call on screen is the one that pays. 'now' blocks it.
 * 'later' is for a call that works regardless — submitting proof of delivery —
 * where the trustline is still worth fixing before it holds up the payout.
 */
export function payoutBlockText(
  block: PayoutBlock,
  payeeRole: 'seller' | 'buyer',
  symbol: string,
  when: 'now' | 'later' = 'now',
): { title: string; body: string } {
  const them = payeeRole === 'seller' ? 'The seller' : 'The buyer';
  const ask = payeeRole === 'seller' ? 'Ask the seller to' : 'Ask the buyer to';
  const settle = payeeRole === 'seller' ? 'release' : 'refund';

  if (block.problem === 'no_account') {
    if (block.selfFixable) {
      return {
        title: 'Your account is not funded on this network',
        body: `This payout would go to an account that does not exist yet. Fund it with XLM, then add a ${symbol} trustline.`,
      };
    }
    return {
      title: `${them}'s account is not funded`,
      body: `${them} has no account on this network, so nothing can be paid to them. ${ask} fund it with XLM and add a ${symbol} trustline. Until then the ${settle} fails and the escrow stays where it is.`,
    };
  }

  if (block.selfFixable) {
    return when === 'later'
      ? {
          title: `You will need a ${symbol} trustline to be paid`,
          body: `On Stellar an account has to opt in to an asset before it can receive it. Submitting proof works without one, but the payout reverts until your account can hold ${symbol}. Add it now and nothing is held up later.`,
        }
      : {
          title: `You need a ${symbol} trustline to be paid`,
          body: `On Stellar an account has to opt in to an asset before it can receive it. Add the trustline below and this goes through; without it the payment reverts and you are not paid.`,
        };
  }

  const theyHave = payeeRole === 'seller' ? 'the seller has' : 'the buyer has';
  return when === 'later'
    ? {
        title: `${them} cannot receive ${symbol} yet`,
        body: `${them} has not added a ${symbol} trustline, and on Stellar an account has to opt in to an asset before it can receive it. The ${settle} will revert until they do. ${ask} add one in their wallet.`,
      }
    : {
        title: `${them} cannot receive ${symbol} yet`,
        body: `On Stellar an account has to opt in to an asset before it can receive it, and ${theyHave} not added a ${symbol} trustline. ${ask} add one in their wallet. Signing now would revert: the funds stay in the escrow, so nothing is lost, but nothing settles either.`,
      };
}
