'use client';

import { useQuery } from '@tanstack/react-query';
import { verifyCanonicalTerms } from '@/sdk/canonical-json';
import type { AgreedTerms } from '@/sdk/terms';
import { api, draftIdForEscrow } from './api';
import { useAuth } from './auth';
import { chain } from './tx';

/** Live contract state. This, not the backend cache, is what every action is decided on. */
export function useEscrow(contractId: string | null | undefined) {
  return useQuery({
    queryKey: ['escrow', contractId],
    queryFn: () => chain.getEscrow(contractId!),
    enabled: !!contractId,
    refetchInterval: 15_000,
  });
}

export function useEscrowWasm(contractId: string | null | undefined) {
  return useQuery({
    queryKey: ['wasm', contractId],
    queryFn: () => chain.wasmHashOf(contractId!),
    enabled: !!contractId,
    staleTime: Infinity,
  });
}

export function useEscrowVersion(contractId: string | null | undefined) {
  return useQuery({
    queryKey: ['version', contractId],
    queryFn: () => chain.version(contractId!),
    enabled: !!contractId,
    staleTime: Infinity,
  });
}

export function useEscrowProvenance(contractId: string | null | undefined, buyer?: string, saltHex?: string) {
  return useQuery({
    queryKey: ['provenance', contractId, buyer, saltHex],
    queryFn: async () => {
      if (!buyer || !saltHex) return true;
      const { fromHex } = await import('@/sdk/code');
      const expected = await chain.escrowAddress(buyer, fromHex(saltHex));
      return contractId === expected;
    },
    enabled: !!contractId && !!buyer && !!saltHex,
    staleTime: Infinity,
  });
}

export function useSignedIn() {
  const { status } = useAuth();
  return status === 'signed_in';
}

export function useDraft(id: string | null | undefined) {
  const signedIn = useSignedIn();
  return useQuery({ queryKey: ['draft', id], queryFn: () => api.draft(id!), enabled: signedIn && !!id, refetchInterval: 15_000 });
}

/**
 * The agreed terms, verified locally: the bytes must be canonical, and the hash is
 * computed on this device. The server's own `termsHash` is not used.
 */
export function useAgreedTerms(draftId: string | null | undefined, enabled = true) {
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: ['terms', draftId],
    queryFn: async () => {
      const res = await api.agreedTerms(draftId!);
      const { terms, termsHash } = await verifyCanonicalTerms<AgreedTerms>(res.canonical);
      return { revision: res.revision, terms, termsHash, canonical: res.canonical };
    },
    enabled: signedIn && !!draftId && enabled,
    staleTime: Infinity,
  });
}

export function useDrafts() {
  const signedIn = useSignedIn();
  return useQuery({ queryKey: ['drafts'], queryFn: () => api.drafts(), enabled: signedIn, refetchInterval: 30_000 });
}

export function useEscrowList() {
  const signedIn = useSignedIn();
  return useQuery({ queryKey: ['escrows'], queryFn: () => api.escrows(), enabled: signedIn, refetchInterval: 30_000 });
}

/** Which draft an escrow belongs to, from the backend. Optional: the escrow works without it. */
export function useEscrowDraftId(contractId: string | null | undefined) {
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: ['escrow-draft', contractId],
    queryFn: () => draftIdForEscrow(contractId!),
    enabled: signedIn && !!contractId,
    staleTime: 60_000,
  });
}

export function useNotifications(unreadOnly = false) {
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: ['notifications', unreadOnly],
    queryFn: () => api.notifications(unreadOnly),
    enabled: signedIn,
    refetchInterval: 60_000,
  });
}

export function useMessages(draftId: string | null | undefined) {
  const signedIn = useSignedIn();
  return useQuery({
    queryKey: ['messages', draftId],
    queryFn: () => api.messages(draftId!),
    enabled: signedIn && !!draftId,
    refetchInterval: 5_000,
  });
}
