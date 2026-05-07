import { useCallback, useState } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import { WalletContextState } from "@solana/wallet-adapter-react";
import { makeProgram, makeReadonlyProgram } from "../lib/program";
import { FeedEntry, QVAC_BASE_URL } from "../lib/constants";

export function useFeed(connection: Connection, wallet: WalletContextState, qvacOnline: boolean) {
  const [feed,        setFeed]        = useState<FeedEntry[]>([]);
  const [feedRaw,     setFeedRaw]     = useState<FeedEntry[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError,   setFeedError]   = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searching,   setSearching]   = useState(false);
  const [mineOnly,    setMineOnly]    = useState(false);

  const loadFeed = useCallback(async () => {
    setFeedLoading(true);
    setFeedError("");
    setSearchQuery("");
    try {
      const pk      = wallet.publicKey ?? PublicKey.default;
      const program = wallet.publicKey
        ? makeProgram(connection, wallet as any)
        : makeReadonlyProgram(connection, pk);
      const accounts = await (program.account as any).discoveryRecord.all();
      const entries: FeedEntry[] = accounts
        .map((a: any) => ({
          pda:              a.publicKey.toBase58(),
          researcher:       a.account.researcher.toBase58(),
          owner:            (a.account.owner ?? a.account.researcher).toBase58(),
          fileHash:         Buffer.from(a.account.fileHash).toString("hex"),
          timestamp:        a.account.timestamp.toNumber(),
          metadata:         a.account.metadata,
          endorsementCount: a.account.endorsementCount ?? 0,
        }))
        .sort((a: FeedEntry, b: FeedEntry) => b.timestamp - a.timestamp)
        .slice(0, 50);
      setFeedRaw(entries);
      setFeed(entries);
    } catch (e: any) {
      setFeedError(e?.message ?? "Failed to load.");
    } finally {
      setFeedLoading(false);
    }
  }, [connection, wallet]);

  const runSemanticSearch = useCallback(async () => {
    if (!searchQuery.trim() || !qvacOnline) return;
    setSearching(true);
    try {
      const res = await fetch(`${QVAC_BASE_URL}/api/search`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ query: searchQuery, discoveries: feedRaw }),
      });
      setFeed(await res.json());
    } catch (e: any) {
      setFeedError(`AI search failed: ${e.message}`);
    } finally {
      setSearching(false);
    }
  }, [searchQuery, qvacOnline, feedRaw]);

  const clearSearch = useCallback(() => {
    setSearchQuery("");
    setFeed(feedRaw);
  }, [feedRaw]);

  const toggleMine = useCallback(() => {
    setMineOnly((prev) => {
      const next = !prev;
      if (next && wallet.publicKey) {
        const walletStr = wallet.publicKey.toBase58();
        setFeed(feedRaw.filter((e) => e.researcher === walletStr || e.owner === walletStr));
      } else {
        setFeed(feedRaw);
      }
      setSearchQuery("");
      return next;
    });
  }, [feedRaw, wallet.publicKey]);

  return {
    feed, feedRaw, feedLoading, feedError,
    searchQuery, setSearchQuery, searching,
    mineOnly,
    loadFeed, runSemanticSearch, clearSearch, toggleMine,
  };
}
