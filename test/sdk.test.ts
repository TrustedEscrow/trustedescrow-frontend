import { Address, Keypair, StrKey, scValToNative, xdr } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { formatAmount, fromBaseUnits, toBaseUnits } from '@/sdk/amount';
import { EscrowChain, escrowCalls, factoryCalls, orderToScVal, scStruct, scUnitEnum } from '@/sdk/chain';
import { fromHex } from '@/sdk/code';
import { decodeEscrow } from '@/sdk/decode';
import { contractErrorCode, explainSimulationError } from '@/sdk/errors';
import { uriProblem } from '@/sdk/proof';
import { type AgreedTerms, orderFromTerms, termsMismatches } from '@/sdk/terms';
import { payoutOnRelease } from '@/sdk/types';

const buyer = Keypair.random().publicKey();
const seller = Keypair.random().publicKey();
const arbitrator = Keypair.random().publicKey();
const token = StrKey.encodeContract(new Uint8Array(32).fill(7));
const escrowId = StrKey.encodeContract(new Uint8Array(32).fill(9));

describe('amounts', () => {
  it('converts without floats', () => {
    expect(toBaseUnits('25', 7)).toBe(250_000_000n);
    expect(toBaseUnits('12.5', 7)).toBe(125_000_000n);
    expect(toBaseUnits('0.0000001', 7)).toBe(1n);
    expect(() => toBaseUnits('0.00000001', 7)).toThrow();
    expect(() => toBaseUnits('abc', 7)).toThrow();
    expect(fromBaseUnits(12_345_678_900_000n, 7)).toBe('1,234,567.89');
    expect(formatAmount('250000000', 7, 'USDC')).toBe('25 USDC');
  });

  it('takes the fee on release only, rounding down', () => {
    expect(payoutOnRelease(1_000_000n, 150)).toEqual({ payout: 985_000n, fee: 15_000n });
    expect(payoutOnRelease(1n, 150)).toEqual({ payout: 1n, fee: 0n });
  });
});

describe('proof URIs mirror validate_uri', () => {
  it.each([
    ['Tracking', 'https://track.example/ABC123', null],
    ['Content', 'ipfs://bafy', null],
    ['Content', 'ar://tx', null],
    ['Attestation', '', null],
    ['Tracking', '', 'required'],
    ['Tracking', 'http://insecure.example', 'https://'],
    ['Tracking', 'https://', 'https://'],
    ['Tracking', 'https://has space', 'ASCII'],
    ['Tracking', `https://${'a'.repeat(250)}`, 'limit'],
  ] as const)('%s %s', (kind, uri, problem) => {
    const p = uriProblem(kind, uri);
    if (problem === null) expect(p).toBeNull();
    else expect(p).toContain(problem);
  });
});

describe('ABI encoding', () => {
  it('encodes unit enums as a one-element symbol vec', () => {
    const v = scUnitEnum('Tracking');
    expect(scValToNative(v)).toEqual(['Tracking']);
  });

  it('encodes structs as maps with sorted symbol keys', () => {
    const s = scStruct({ b: xdr.ScVal.scvU32(1), a: xdr.ScVal.scvU32(2) });
    expect(s.type).toBe('scvMap');
    const keys = scValToNative(s) as Record<string, number>;
    expect(Object.keys(keys)).toEqual(['a', 'b']);
  });

  it('encodes an Order with every field the contract expects', () => {
    const native = scValToNative(
      orderToScVal({
        buyer,
        seller,
        token,
        amount: 250_000_000n,
        termsHash: 'aa'.repeat(32),
        releaseCodeHash: 'bb'.repeat(32),
        fundingDeadline: 1_900_000_000,
        deliveryWindow: 86400,
        receiptWindow: 86400,
        arbitrationWindow: 604800,
      }),
    ) as Record<string, unknown>;
    expect(Object.keys(native)).toEqual([
      'amount',
      'arbitration_window',
      'buyer',
      'delivery_window',
      'funding_deadline',
      'receipt_window',
      'release_code_hash',
      'seller',
      'terms_hash',
      'token',
    ]);
    expect(native.amount).toBe(250_000_000n);
    expect(native.buyer).toBe(buyer);
  });

  it('passes the code as its 16 canonical ASCII bytes', () => {
    const call = escrowCalls.releaseWithCode('K7M29XQF4TBNR3WD');
    const bytes = scValToNative(call.args[0]!) as Uint8Array;
    expect(new TextDecoder().decode(bytes)).toBe('K7M29XQF4TBNR3WD');
    expect(() => escrowCalls.releaseWithCode('K7M2-9XQF-4TBN-R3WD')).toThrow(/canonical/);
  });


  it('builds extend_delivery and extend_receipt calls with u64 seconds', () => {
    const d = escrowCalls.extendDelivery(86400);
    expect(d.method).toBe('extend_delivery');
    expect(scValToNative(d.args[0]!)).toBe(86400n);

    const r = escrowCalls.extendReceipt(43200);
    expect(r.method).toBe('extend_receipt');
    expect(scValToNative(r.args[0]!)).toBe(43200n);
  });
});

describe('decodeEscrow', () => {
  const native = {
    buyer,
    seller,
    arbitrator,
    token,
    amount: 250_000_000n,
    fee_bps: 150,
    fee_recipient: arbitrator,
    unswept_fee: 0n,
    terms_hash: fromHex('aa'.repeat(32)),
    salt: fromHex('11'.repeat(32)),
    release_code_hash: fromHex('bb'.repeat(32)),
    state: ['Disputed'],
    created_at: 10n,
    funding_deadline: 20n,
    delivery_window: 3600n,
    receipt_window: 3600n,
    arbitration_window: 3600n,
    funded_at: 11n,
    delivery_deadline: 3611n,
    receipt_deadline: 3700n,
    proof: ['Submitted', { kind: ['Tracking'], uri: 'https://t.example', hash: fromHex('cc'.repeat(32)), submitted_at: 100n }],
    dispute: ['Opened', { opened_by: ['ReceiptTimeout'], opened_at: 3700n, from_state: ['Delivered'], deadline: 7300n }],
    settlement: ['Open'],
  };

  it('decodes the enum-wrapped optional parts', () => {
    const e = decodeEscrow(escrowId, native, 123);
    expect(e.state).toBe('Disputed');
    expect(e.amount).toBe(250_000_000n);
    expect(e.unsweptFee).toBe(0n);
    expect(e.salt).toBe('11'.repeat(32));
    expect(e.proof).toEqual({ kind: 'Tracking', uri: 'https://t.example', hash: 'cc'.repeat(32), submittedAt: 100 });
    expect(e.dispute).toEqual({ openedBy: 'ReceiptTimeout', openedAt: 3700, fromState: 'Delivered', deadline: 7300, statementHash: null, rulingHash: null });
    expect(e.settlement).toEqual({ status: 'Open' });
    expect(e.ledger).toBe(123);
  });

  it('decodes settlement paths and pending records', () => {
    const e = decodeEscrow(escrowId, { ...native, state: ['Released'], proof: ['Pending'], dispute: ['NotOpened'], settlement: ['Released', ['Code']] }, 1);
    expect(e.proof).toBeNull();
    expect(e.dispute).toBeNull();
    expect(e.settlement).toEqual({ status: 'Released', path: 'Code' });
  });

  it('rejects unknown states', () => {
    expect(() => decodeEscrow(escrowId, { ...native, state: ['Exploded'] }, 1)).toThrow();
  });
});

describe('terms and order', () => {
  const terms: AgreedTerms = {
    version: 1,
    ref: 'draft',
    buyer,
    seller,
    rail: 'usdc-stellar',
    token,
    amount: '250000000',
    item: { title: 'Phone', description: '' },
    delivery: { method: 'shipped', proofKind: 'Tracking', carrier: 'GIG' },
    windows: { delivery: 86400, receipt: 172800, arbitration: 604800 },
    fundingDeadline: 1_900_000_000,
  };

  it('builds the order that commits the terms', () => {
    const o = orderFromTerms(terms, 'AA'.repeat(32), 'bb'.repeat(32));
    expect(o).toMatchObject({ buyer, seller, token, amount: 250_000_000n, termsHash: 'aa'.repeat(32), receiptWindow: 172800 });
  });

  it('flags every field a deployed escrow gets wrong', () => {
    const base = decodeEscrow(
      escrowId,
      {
        buyer,
        seller,
        arbitrator,
        token,
        amount: 250_000_000n,
        fee_bps: 0,
        fee_recipient: arbitrator,
        unswept_fee: 0n,
        terms_hash: fromHex('aa'.repeat(32)),
        salt: fromHex('00'.repeat(32)),
        release_code_hash: fromHex('bb'.repeat(32)),
        state: ['Created'],
        created_at: 0n,
        funding_deadline: 1_900_000_000n,
        delivery_window: 86400n,
        receipt_window: 172800n,
        arbitration_window: 604800n,
        funded_at: 0n,
        delivery_deadline: 0n,
        receipt_deadline: 0n,
        proof: ['Pending'],
        dispute: ['NotOpened'],
        settlement: ['Open'],
      },
      1,
    );
    expect(termsMismatches(terms, 'aa'.repeat(32), base)).toEqual([]);
    expect(termsMismatches(terms, 'aa'.repeat(32), { ...base, amount: 1n, seller: buyer })).toEqual(['seller', 'amount']);
  });
});

describe('errors', () => {
  it('explains contract errors from simulation', () => {
    const raw = 'HostError: Error(Contract, #3)\n...';
    expect(contractErrorCode(raw)).toBe(3);
    expect(explainSimulationError(raw, 'escrow').message).toMatch(/delivery code does not match/);
    expect(explainSimulationError('Error(Contract, #1)', 'factory').message).toMatch(/allowlist/);
  });

  it('keeps addresses stable', () => {
    expect(Address.fromString(escrowId).toString()).toBe(escrowId);
  });

  it('validates assertFactoryProvenance checks expected escrow address', async () => {
    const chain = new EscrowChain({
      rpcUrl: 'http://localhost:8000',
      networkPassphrase: 'Test Network',
      factoryId: token,
      escrowWasmHash: '00'.repeat(32),
    });
    const salt = new Uint8Array(32);
    // Mock escrowAddress method
    chain.escrowAddress = async () => escrowId;
    await expect(chain.assertFactoryProvenance(escrowId, buyer, salt)).resolves.toBeUndefined();
    await expect(chain.assertFactoryProvenance('C123', buyer, salt)).rejects.toThrow(/does not match factory provenance/);
  });
});
