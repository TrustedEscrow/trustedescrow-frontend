import { describe, expect, it } from 'vitest';
import { payeeOf, payoutBlock, payoutBlockText, type PayeeStatus } from '@/sdk/payable';

const SELLER = 'GSELLER';
const BUYER = 'GBUYER';
const SOMEONE = 'GARB';

const payable: PayeeStatus = { accountExists: true, hasTrustline: true };
const noTrustline: PayeeStatus = { accountExists: true, hasTrustline: false };
const noAccount: PayeeStatus = { accountExists: false, hasTrustline: false };

describe('payeeOf', () => {
  it('pays the seller on release and the buyer on refund', () => {
    expect(payeeOf({ buyer: BUYER, seller: SELLER }, 'Release')).toBe(SELLER);
    expect(payeeOf({ buyer: BUYER, seller: SELLER }, 'Refund')).toBe(BUYER);
  });
});

describe('payoutBlock', () => {
  it('does not block a payee who can hold the asset', () => {
    expect(payoutBlock(SELLER, BUYER, payable)).toBeNull();
  });

  // The alternative is a spinner that blocks release whenever RPC is slow. Let
  // the call through and let simulation judge it.
  it('does not block while the status is still unread', () => {
    expect(payoutBlock(SELLER, BUYER, undefined)).toBeNull();
  });

  it('blocks a payee with no trustline', () => {
    expect(payoutBlock(SELLER, BUYER, noTrustline)).toEqual({
      payee: SELLER,
      problem: 'no_trustline',
      selfFixable: false,
    });
  });

  it('reports a missing account ahead of the missing trustline it implies', () => {
    expect(payoutBlock(SELLER, BUYER, noAccount)?.problem).toBe('no_account');
  });

  it('is self-fixable only for the payee themselves', () => {
    expect(payoutBlock(SELLER, SELLER, noTrustline)?.selfFixable).toBe(true);
    expect(payoutBlock(SELLER, BUYER, noTrustline)?.selfFixable).toBe(false);
    expect(payoutBlock(SELLER, SOMEONE, noTrustline)?.selfFixable).toBe(false);
  });

  it('is not self-fixable with no wallet connected', () => {
    expect(payoutBlock(SELLER, null, noTrustline)?.selfFixable).toBe(false);
    expect(payoutBlock(SELLER, undefined, noTrustline)?.selfFixable).toBe(false);
  });
});

describe('payoutBlockText', () => {
  const block = (over: Partial<ReturnType<typeof payoutBlock>> = {}) => ({
    payee: SELLER,
    problem: 'no_trustline' as const,
    selfFixable: false,
    ...over,
  });

  it('tells the seller to add their own trustline', () => {
    const { title, body } = payoutBlockText(block({ selfFixable: true }), 'seller', 'USDC');
    expect(title).toContain('USDC trustline');
    expect(body).not.toContain('Ask the seller');
  });

  it('tells the buyer to chase the seller, and that the deposit is safe', () => {
    const { title, body } = payoutBlockText(block(), 'seller', 'USDC');
    expect(title).toBe('The seller cannot receive USDC yet');
    expect(body).toContain('Ask the seller to');
    expect(body).toContain('nothing is lost');
  });

  // Submitting proof succeeds without a trustline; only the payout after it fails.
  it('softens the wording for a call that is not the one paying', () => {
    const now = payoutBlockText(block({ selfFixable: true }), 'seller', 'USDC', 'now').title;
    const later = payoutBlockText(block({ selfFixable: true }), 'seller', 'USDC', 'later');
    expect(later.title).toBe('You will need a USDC trustline to be paid');
    expect(later.title).not.toBe(now);
    expect(later.body).toContain('Submitting proof works without one');
  });

  it('speaks about the buyer and the refund when a refund is what would pay', () => {
    const { title, body } = payoutBlockText(block({ payee: BUYER }), 'buyer', 'USDC', 'later');
    expect(title).toBe('The buyer cannot receive USDC yet');
    expect(body).toContain('refund will revert');
    expect(body).toContain('Ask the buyer to');
  });

  it('asks for XLM first when the account does not exist at all', () => {
    const theirs = payoutBlockText(block({ problem: 'no_account' }), 'seller', 'USDC');
    expect(theirs.title).toBe("The seller's account is not funded");
    expect(theirs.body).toContain('XLM');
    const mine = payoutBlockText(block({ problem: 'no_account', selfFixable: true }), 'seller', 'USDC');
    expect(mine.title).toContain('Your account');
    expect(mine.body).toContain('XLM');
  });

  it('uses whatever symbol the rail reports', () => {
    expect(payoutBlockText(block(), 'seller', 'EURC').title).toContain('EURC');
  });
});
