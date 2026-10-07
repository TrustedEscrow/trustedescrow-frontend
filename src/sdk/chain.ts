import {
  Account,
  Address,
  Asset,
  BASE_FEE,
  Contract,
  Keypair,
  Operation,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';
import { codeBytes, fromHex, toHex } from './code';
import { decodeEscrow, decodeFactoryConfig } from './decode';
import { ChainError, type ContractKind, explainSimulationError } from './errors';
import type { EscrowSnapshot, FactoryConfig, Order, Outcome, ProofKind } from './types';

/**
 * Escrow SDK: contract ABI, transaction building, WASM hash pinning and the restore
 * step for archived entries (ARCHITECTURE §3, §4 "TTL and archival"). No React, no
 * backend: everything here works against Soroban RPC alone, which is what makes the
 * web app a convenience layer rather than a dependency.
 */

export interface ChainConfig {
  rpcUrl: string;
  networkPassphrase: string;
  factoryId: string;
  /** Audited escrow WASM hash, hex. Funding any other binary is refused. */
  escrowWasmHash: string;
}

/** Signs a transaction envelope (base64 XDR) and returns the signed envelope. */
export type SignTransaction = (xdr: string) => Promise<string>;

export type Step = 'simulating' | 'restoring' | 'signing' | 'submitting' | 'confirming';

export interface InvokeResult {
  hash: string;
  ledger: number;
  returnValue: unknown;
}

export interface Call {
  method: string;
  args: xdr.ScVal[];
}

// --- ScVal builders ----------------------------------------------------------------

export const scAddress = (a: string) => new Address(a).toScVal();
export const scU32 = (n: number) => nativeToScVal(n, { type: 'u32' });
export const scU64 = (n: number | bigint) => nativeToScVal(BigInt(n), { type: 'u64' });
export const scI128 = (n: bigint) => nativeToScVal(n, { type: 'i128' });
export const scBytes = (b: Uint8Array) => xdr.ScVal.scvBytes(b);
export const scBytesN32 = (hex: string) => {
  const b = fromHex(hex);
  if (b.length !== 32) throw new Error('expected 32 bytes');
  return scBytes(b);
};
export const scString = (s: string) => nativeToScVal(s, { type: 'string' });
/** A unit enum variant: `#[contracttype] enum` encodes as a one-element vec of the variant symbol. */
export const scUnitEnum = (variant: string) => xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(variant)]);

/** A `#[contracttype]` struct: a map keyed by field-name symbols, sorted as the host requires. */
export function scStruct(fields: Record<string, xdr.ScVal>): xdr.ScVal {
  return xdr.ScVal.scvMap(
    Object.keys(fields)
      .sort()
      .map((k) => new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(k), val: fields[k]! })),
  );
}

export function orderToScVal(o: Order): xdr.ScVal {
  return scStruct({
    buyer: scAddress(o.buyer),
    seller: scAddress(o.seller),
    token: scAddress(o.token),
    amount: scI128(o.amount),
    terms_hash: scBytesN32(o.termsHash),
    release_code_hash: scBytesN32(o.releaseCodeHash),
    funding_deadline: scU64(o.fundingDeadline),
    delivery_window: scU64(o.deliveryWindow),
    receipt_window: scU64(o.receiptWindow),
    arbitration_window: scU64(o.arbitrationWindow),
  });
}

// --- escrow ABI --------------------------------------------------------------------

export const escrowCalls = {
  fund: (): Call => ({ method: 'fund', args: [] }),
  cancel: (caller: string): Call => ({ method: 'cancel', args: [scAddress(caller)] }),
  submitProof: (kind: ProofKind, uri: string, hashHex: string): Call => ({
    method: 'submit_proof',
    args: [scUnitEnum(kind), scString(uri), scBytesN32(hashHex)],
  }),
  /** `code` must be canonical; its 16 ASCII bytes are what the contract hashes. */
  submitProofWithCode: (kind: ProofKind, uri: string, hashHex: string, code: string): Call => ({
    method: 'submit_proof_with_code',
    args: [scUnitEnum(kind), scString(uri), scBytesN32(hashHex), scBytes(codeBytes(code))],
  }),
  releaseWithCode: (code: string): Call => ({ method: 'release_with_code', args: [scBytes(codeBytes(code))] }),
  confirm: (): Call => ({ method: 'confirm', args: [] }),
  dispute: (caller: string): Call => ({ method: 'dispute', args: [scAddress(caller)] }),
  escalate: (): Call => ({ method: 'escalate', args: [] }),
  resolve: (outcome: Outcome): Call => ({ method: 'resolve', args: [scUnitEnum(outcome)] }),
  refundAfterDeliveryTimeout: (): Call => ({ method: 'refund_after_delivery_timeout', args: [] }),
  refundAfterArbitrationTimeout: (): Call => ({ method: 'refund_after_arbitration_timeout', args: [] }),
  sellerRefund: (): Call => ({ method: 'seller_refund', args: [] }),
  extendDelivery: (seconds: number): Call => ({ method: 'extend_delivery', args: [scU64(seconds)] }),
  extendReceipt: (seconds: number): Call => ({ method: 'extend_receipt', args: [scU64(seconds)] }),
  bump: (): Call => ({ method: 'bump', args: [] }),
};

export const factoryCalls = {
  create: (order: Order, salt: Uint8Array): Call => ({ method: 'create', args: [orderToScVal(order), scBytes(salt)] }),
  createAndFund: (order: Order, salt: Uint8Array): Call => ({ method: 'create_and_fund', args: [orderToScVal(order), scBytes(salt)] }),
};

// --- client ------------------------------------------------------------------------

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 90_000;
const TX_TIMEOUT_SECONDS = 300;

export class EscrowChain {
  readonly server: rpc.Server;

  constructor(readonly cfg: ChainConfig) {
    this.server = new rpc.Server(cfg.rpcUrl, { allowHttp: cfg.rpcUrl.startsWith('http://') });
  }

  /** Simulates a read-only call from a throwaway source that never signs. */
  async read(contractId: string, call: Call, kind: ContractKind): Promise<{ native: unknown; ledger: number }> {
    const source = new Account(Keypair.random().publicKey(), '0');
    const tx = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: this.cfg.networkPassphrase })
      .addOperation(new Contract(contractId).call(call.method, ...call.args))
      .setTimeout(30)
      .build();
    let sim: rpc.Api.SimulateTransactionResponse;
    try {
      sim = await this.server.simulateTransaction(tx);
    } catch (e) {
      throw new ChainError(`Could not reach Soroban RPC: ${String(e)}`, 'rpc');
    }
    if (rpc.Api.isSimulationError(sim)) {
      if (/MissingValue|not found|non-existent|does not exist/i.test(sim.error)) throw new ChainError('No such contract on this network', 'not_found');
      throw explainSimulationError(sim.error, kind);
    }
    // A restore response still carries the read result; the restore is needed only to act.
    if (!sim.result) throw new ChainError(`${call.method} returned no result`, 'simulation');
    return { native: scValToNative(sim.result.retval), ledger: sim.latestLedger };
  }

  async getEscrow(contractId: string): Promise<EscrowSnapshot> {
    const { native, ledger } = await this.read(contractId, { method: 'get', args: [] }, 'escrow');
    return decodeEscrow(contractId, native, ledger);
  }

  async version(contractId: string): Promise<string> {
    const { native } = await this.read(contractId, { method: 'version', args: [] }, 'escrow');
    return String(native);
  }

  async factoryConfig(): Promise<FactoryConfig> {
    const { native } = await this.read(this.cfg.factoryId, { method: 'config', args: [] }, 'factory');
    return decodeFactoryConfig(native);
  }

  async escrowAddress(buyer: string, salt: Uint8Array): Promise<string> {
    const { native } = await this.read(this.cfg.factoryId, { method: 'escrow_address', args: [scAddress(buyer), scBytes(salt)] }, 'factory');
    return String(native);
  }

  async isTokenAllowed(token: string): Promise<boolean> {
    const { native } = await this.read(this.cfg.factoryId, { method: 'is_token_allowed', args: [scAddress(token)] }, 'factory');
    return native === true;
  }

  /** The WASM hash a deployed contract instance runs, or null for a built-in (e.g. a token SAC). */
  async wasmHashOf(contractId: string): Promise<string | null> {
    const key = xdr.LedgerKey.contractData(
      new xdr.LedgerKeyContractData({
        contract: new Address(contractId).toScAddress(),
        key: xdr.ScVal.scvLedgerKeyContractInstance(),
        durability: xdr.ContractDataDurability.persistent,
      }),
    );
    const res = await this.server.getLedgerEntries(key);
    const entry = res.entries[0];
    if (!entry) throw new ChainError('No such contract on this network', 'not_found');
    const data = entry.val;
    if (data.type !== 'contractData') throw new ChainError('Unexpected ledger entry for contract instance', 'rpc');
    const val = data.contractData.val;
    if (val.type !== 'scvContractInstance') throw new ChainError('Unexpected contract instance value', 'rpc');
    const executable = val.instance.executable;
    return executable.type === 'contractExecutableWasm' ? toHex(executable.wasmHash.value) : null;
  }

  /** Refuses any escrow not running the audited binary. Call before funding. */
  async assertPinnedEscrow(contractId: string): Promise<void> {
    const actual = await this.wasmHashOf(contractId);
    if (actual !== this.cfg.escrowWasmHash.toLowerCase()) {
      throw new ChainError(
        `This escrow runs code this app has not audited (WASM ${actual ?? 'none'}). Do not fund it.`,
        'pin',
      );
    }
  }

  /** Refuses to create through a factory whose config points at an unaudited escrow binary. */
  async assertPinnedFactory(): Promise<FactoryConfig> {
    const cfg = await this.factoryConfig();
    if (cfg.escrowWasmHash !== this.cfg.escrowWasmHash.toLowerCase()) {
      throw new ChainError(
        `The factory now deploys escrow code this app has not audited (WASM ${cfg.escrowWasmHash}). Creating an escrow is blocked until the app is updated.`,
        'pin',
      );
    }
    return cfg;
  }

  /** Refuses any escrow whose contract ID was not derived from the factory contract for (buyer, salt). */
  async assertFactoryProvenance(contractId: string, buyer: string, salt: Uint8Array): Promise<void> {
    const expected = await this.escrowAddress(buyer, salt);
    if (contractId !== expected) {
      throw new ChainError(
        `Escrow address ${contractId} does not match factory provenance for buyer ${buyer}`,
        'provenance',
      );
    }
  }

  // --- settlement rail readiness (UsdcRail.ensureReady, ARCHITECTURE §5) -------------

  /** The classic asset behind a Stellar Asset Contract, from its `name()` ("CODE:ISSUER"). */
  async classicAsset(token: string): Promise<Asset | null> {
    const { native } = await this.read(token, { method: 'name', args: [] }, 'token');
    const name = String(native);
    if (name === 'native') return Asset.native();
    const [code, issuer] = name.split(':');
    return code && issuer ? new Asset(code, issuer) : null;
  }

  async accountExists(address: string): Promise<boolean> {
    try {
      await this.server.getAccount(address);
      return true;
    } catch {
      return false;
    }
  }

  async hasTrustline(address: string, asset: Asset): Promise<boolean> {
    if (asset.isNative()) return true;
    const key = xdr.LedgerKey.trustline(
      new xdr.LedgerKeyTrustLine({ accountId: Keypair.fromPublicKey(address).xdrPublicKey(), asset: asset.toTrustLineXDRObject() }),
    );
    const res = await this.server.getLedgerEntries(key);
    return res.entries.length > 0;
  }

  async tokenBalance(token: string, address: string): Promise<bigint> {
    try {
      const { native } = await this.read(token, { method: 'balance', args: [scAddress(address)] }, 'token');
      return typeof native === 'bigint' ? native : BigInt(String(native));
    } catch {
      return 0n;
    }
  }

  async readiness(token: string, address: string, amount: bigint) {
    const accountExists = await this.accountExists(address);
    if (!accountExists) return { accountExists, asset: null, hasTrustline: false, balance: 0n, enough: false };
    const asset = await this.classicAsset(token);
    const hasTrustline = asset ? await this.hasTrustline(address, asset) : true;
    const balance = hasTrustline ? await this.tokenBalance(token, address) : 0n;
    return { accountExists, asset, hasTrustline, balance, enough: balance >= amount };
  }

  /** A `changeTrust` for the rail's asset. Paid by the user in v1; sponsorship is roadmap. */
  async addTrustline(address: string, asset: Asset, sign: SignTransaction, onStep?: (s: Step) => void): Promise<InvokeResult> {
    const account = await this.server.getAccount(address);
    const tx = new TransactionBuilder(new Account(address, account.sequenceNumber()), {
      fee: BASE_FEE,
      networkPassphrase: this.cfg.networkPassphrase,
    })
      .addOperation(Operation.changeTrust({ asset }))
      .setTimeout(TX_TIMEOUT_SECONDS)
      .build();
    onStep?.('signing');
    const signed = await sign(tx.toXDR());
    return this.submit(signed, onStep);
  }

  // --- writes ----------------------------------------------------------------------

  /**
   * Simulate, restore archived state if needed, then sign and submit one contract call.
   * Simulation runs before any signature, so a call that would fail is explained
   * without the user paying for it.
   */
  async invoke(params: {
    source: string;
    contractId: string;
    call: Call;
    kind: ContractKind;
    sign: SignTransaction;
    onStep?: (s: Step) => void;
  }): Promise<InvokeResult> {
    const { source, contractId, call, kind, sign, onStep } = params;
    const load = async () => {
      try {
        return (await this.server.getAccount(source)).sequenceNumber();
      } catch {
        throw new ChainError('Your account does not exist on this network yet. Fund it with some XLM first.', 'not_found');
      }
    };
    const build = (seq: string, fee = BASE_FEE) =>
      new TransactionBuilder(new Account(source, seq), { fee, networkPassphrase: this.cfg.networkPassphrase })
        .addOperation(new Contract(contractId).call(call.method, ...call.args))
        .setTimeout(TX_TIMEOUT_SECONDS)
        .build();

    onStep?.('simulating');
    let seq = await load();
    let tx = build(seq);
    let sim = await this.simulate(tx);
    if (rpc.Api.isSimulationError(sim)) throw explainSimulationError(sim.error, kind);

    if (rpc.Api.isSimulationRestore(sim)) {
      onStep?.('restoring');
      const restore = new TransactionBuilder(new Account(source, seq), {
        fee: (BigInt(BASE_FEE) + BigInt(sim.restorePreamble.minResourceFee)).toString(),
        networkPassphrase: this.cfg.networkPassphrase,
      })
        .setSorobanData(sim.restorePreamble.transactionData.build())
        .addOperation(Operation.restoreFootprint({}))
        .setTimeout(TX_TIMEOUT_SECONDS)
        .build();
      await this.submit(await sign(restore.toXDR()), onStep);
      onStep?.('simulating');
      seq = await load();
      tx = build(seq);
      sim = await this.simulate(tx);
      if (rpc.Api.isSimulationError(sim)) throw explainSimulationError(sim.error, kind);
    }

    const prepared = rpc.assembleTransaction(tx, sim).build();
    onStep?.('signing');
    const signed = await sign(prepared.toXDR());
    return this.submit(signed, onStep);
  }

  private async simulate(tx: ReturnType<TransactionBuilder['build']>) {
    try {
      return await this.server.simulateTransaction(tx);
    } catch (e) {
      throw new ChainError(`Could not reach Soroban RPC: ${String(e)}`, 'rpc');
    }
  }

  async submit(signedXdr: string, onStep?: (s: Step) => void): Promise<InvokeResult> {
    onStep?.('submitting');
    const tx = TransactionBuilder.fromXDR(signedXdr, this.cfg.networkPassphrase);
    let sent: rpc.Api.SendTransactionResponse;
    try {
      sent = await this.server.sendTransaction(tx);
    } catch (e) {
      throw new ChainError(`Could not submit the transaction: ${String(e)}`, 'rpc');
    }
    if (sent.status === 'ERROR') throw new ChainError('The network rejected the transaction.', 'rejected');
    if (sent.status === 'TRY_AGAIN_LATER') throw new ChainError('The network is busy. Try again in a moment.', 'rejected');

    onStep?.('confirming');
    const started = Date.now();
    while (Date.now() - started < POLL_TIMEOUT_MS) {
      const res = await this.server.getTransaction(sent.hash);
      if (res.status === rpc.Api.GetTransactionStatus.SUCCESS) {
        return {
          hash: sent.hash,
          ledger: res.ledger,
          returnValue: res.returnValue ? scValToNative(res.returnValue) : undefined,
        };
      }
      if (res.status === rpc.Api.GetTransactionStatus.FAILED) {
        throw new ChainError(`The transaction failed on-chain (${sent.hash}).`, 'submission');
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    throw new ChainError(`Still waiting for confirmation of ${sent.hash}. Check an explorer before retrying.`, 'timeout');
  }

  /** Deploys an escrow through the factory. Returns the new escrow address. */
  async createEscrow(params: { order: Order; salt: Uint8Array; sign: SignTransaction; onStep?: (s: Step) => void }): Promise<InvokeResult & { escrow: string }> {
    const res = await this.invoke({
      source: params.order.buyer,
      contractId: this.cfg.factoryId,
      call: factoryCalls.create(params.order, params.salt),
      kind: 'factory',
      sign: params.sign,
      onStep: params.onStep,
    });
    return { ...res, escrow: String(res.returnValue) };
  }

  escrow(contractId: string, source: string, sign: SignTransaction, onStep?: (s: Step) => void) {
    return (call: Call) => this.invoke({ source, contractId, call, kind: 'escrow', sign, onStep });
  }
}
