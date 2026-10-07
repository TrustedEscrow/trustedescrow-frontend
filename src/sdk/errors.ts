/** Contract errors, mapped to what a person should be told. Codes match `#[contracterror]` in each contract. */

const ESCROW_ERRORS: Record<number, string> = {
  1: 'The escrow is not in a state that allows this.',
  2: 'Only the buyer or seller can do this.',
  3: 'That delivery code does not match this escrow.',
  4: 'Proof of delivery has already been submitted and cannot be changed.',
  5: 'The seller must submit proof of delivery first.',
  6: 'The deadline for this has passed.',
  7: 'The deadline for this has not been reached yet.',
  8: 'Buyer, seller and arbitrator must be three different accounts.',
  9: 'The amount must be greater than zero.',
  10: 'The platform fee is above the contract limit.',
  11: 'A deadline or window is out of range (1 hour to 365 days).',
  12: 'The proof link is invalid. Use https://, ipfs:// or ar://, at most 256 characters, no spaces.',
  13: 'A number overflowed.',
};

const FACTORY_ERRORS: Record<number, string> = {
  1: 'This token is not on the factory allowlist.',
  2: 'The platform fee is above the contract limit.',
  3: 'The admin can only be changed with a two-step transfer.',
  4: 'There is no pending admin transfer.',
};

export type ContractKind = 'escrow' | 'factory' | 'token';

export class ContractCallError extends Error {
  constructor(
    message: string,
    readonly contract: ContractKind,
    readonly code: number | null,
    readonly raw: string,
  ) {
    super(message);
  }
}

export class ChainError extends Error {
  constructor(
    message: string,
    readonly kind: 'not_found' | 'rpc' | 'simulation' | 'submission' | 'timeout' | 'rejected' | 'pin' | 'provenance',
  ) {
    super(message);
  }
}

export function contractErrorCode(raw: string): number | null {
  const m = /Error\(Contract, #(\d+)\)/.exec(raw);
  return m ? Number(m[1]) : null;
}

export function explainSimulationError(raw: string, contract: ContractKind): ContractCallError {
  const code = contractErrorCode(raw);
  const table = contract === 'escrow' ? ESCROW_ERRORS : contract === 'factory' ? FACTORY_ERRORS : {};
  let message = code !== null ? table[code] : undefined;
  if (!message && /trustline entry is missing|TrustlineMissing/i.test(raw)) message = 'Your account has no trustline for this token.';
  if (!message && /balance is not sufficient|BalanceError|resulting balance is not within/i.test(raw)) message = 'Your balance is too low for this.';
  if (!message && /Error\(Auth, InvalidAction\)|require_auth/i.test(raw)) message = 'The connected wallet is not allowed to do this.';
  return new ContractCallError(message ?? 'The transaction would fail. Nothing was submitted.', contract, code, raw);
}
