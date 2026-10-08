'use client';

import { payoutBlock, payoutBlockText } from '@/sdk/payable';
import { useAuth } from '@/lib/auth';
import { tokenDisplay } from '@/lib/config';
import { useCanReceive } from '@/lib/queries';
import { chain, useTx } from '@/lib/tx';
import { Alert, Button } from './ui';

/**
 * Guards a settlement against a recipient who cannot hold the token. The escrow
 * pays with a plain `transfer`, so a missing trustline reverts the whole call —
 * see `payoutBlock`. The payee's own wallet gets a button, because they can fix
 * it here; anyone else is told whom to chase, because they cannot add a
 * trustline for someone else.
 *
 * `when: 'later'` is for a call that succeeds either way, where this is a
 * warning rather than a gate.
 */
export function usePayoutGate(token: string, payee: string, payeeRole: 'seller' | 'buyer', when: 'now' | 'later' = 'now') {
  const { walletAddress } = useAuth();
  const tx = useTx();
  const q = useCanReceive(token, payee);
  const t = tokenDisplay(token);
  const block = payoutBlock(payee, walletAddress, q.data);
  const asset = q.data?.asset ?? null;

  if (!block) return { blocked: false, gate: null };
  const { title, body } = payoutBlockText(block, payeeRole, t.symbol, when);

  return {
    // A warning never blocks; only a payout that would revert does.
    blocked: when === 'now',
    gate: (
      <Alert tone="warning" title={title}>
        <p>{body}</p>
        {block.selfFixable && block.problem === 'no_trustline' && asset && (
          <Button
            variant="secondary"
            className="mt-2"
            onClick={() =>
              void tx
                .run(`Add ${t.symbol} trustline`, ({ sign, address, onStep }) => chain.addTrustline(address, asset, sign, onStep))
                .then(() => q.refetch())
                .catch(() => undefined)
            }
          >
            Add {t.symbol} trustline
          </Button>
        )}
      </Alert>
    ),
  };
}
