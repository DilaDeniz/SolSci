import { useCallback, useEffect, useState } from "react";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import { WalletContextState } from "@solana/wallet-adapter-react";
import { makeProgram, makeReadonlyProgram } from "../lib/program";
import { bytesToHex, metaField, readonlyWallet, resolveOrcid } from "../lib/utils";
import { PROGRAM_ID } from "../lib/constants";
import type { VerifyResult } from "../lib/constants";

export function useVerify(connection: Connection, wallet: WalletContextState) {
  const [verifyHash,    setVerifyHash]    = useState("");
  const [verifyWallet,  setVerifyWallet]  = useState("");
  const [verifyResult,  setVerifyResult]  = useState<VerifyResult | null>(null);
  const [verifyError,   setVerifyError]   = useState("");
  const [verifying,     setVerifying]     = useState(false);
  const [fetchVerifying, setFetchVerifying] = useState(false);
  const [transferTo,    setTransferTo]    = useState("");
  const [transferring,  setTransferring]  = useState(false);
  const [transferError, setTransferError] = useState("");
  const [transferDone,  setTransferDone]  = useState(false);
  const [endorsing,     setEndorsing]     = useState(false);
  const [endorseError,  setEndorseError]  = useState("");
  const [endorseDone,   setEndorseDone]   = useState(false);
  const [orcidName,     setOrcidName]     = useState("");

  // Resolve ORCID name when verify result arrives
  useEffect(() => {
    setOrcidName("");
    if (!verifyResult?.metadata) return;
    const orcid = metaField(verifyResult.metadata, "orcid");
    if (!orcid) return;
    resolveOrcid(orcid).then(setOrcidName);
  }, [verifyResult]);

  const handleVerifyFileSelect = useCallback(async (f: File) => {
    const buf   = await f.arrayBuffer();
    const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", buf));
    setVerifyHash(bytesToHex(bytes));
  }, []);

  const runVerify = useCallback(async () => {
    setVerifyError("");
    setVerifyResult(null);
    const hashHex = verifyHash.trim().toLowerCase();
    if (hashHex.length !== 64 || !/^[0-9a-f]+$/.test(hashHex)) {
      setVerifyError("Paste a valid 64-character hex hash.");
      return;
    }
    let researcherKey: PublicKey;
    try { researcherKey = new PublicKey(verifyWallet.trim()); }
    catch { setVerifyError("Invalid wallet address."); return; }

    setVerifying(true);
    try {
      const program = wallet.publicKey
        ? makeProgram(connection, wallet as any)
        : makeReadonlyProgram(connection, researcherKey);
      const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from("discovery"), researcherKey.toBuffer(), Buffer.from(hashHex, "hex")],
        PROGRAM_ID,
      );
      const record = await (program.account as any).discoveryRecord.fetch(pda);
      setVerifyResult({
        found: true,
        pda:              pda.toBase58(),
        researcher:       record.researcher.toBase58(),
        owner:            (record.owner ?? record.researcher).toBase58(),
        timestamp:        record.timestamp.toNumber(),
        metadata:         record.metadata,
        endorsementCount: record.endorsementCount ?? 0,
        fileHashHex:      hashHex,
      });
      setTransferTo("");
      setTransferError("");
      setTransferDone(false);
      setEndorseDone(false);
      setEndorseError("");
    } catch (e: any) {
      if (e?.message?.includes("Account does not exist")) setVerifyResult({ found: false });
      else setVerifyError(e?.message ?? "Verification failed.");
    } finally {
      setVerifying(false);
    }
  }, [verifyHash, verifyWallet, connection, wallet]);

  const fetchAndVerify = useCallback(async (recordUrl: string, storedHash: string, researcherAddr: string) => {
    setFetchVerifying(true);
    setVerifyError("");
    try {
      const res  = await fetch(recordUrl);
      if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
      const buf  = await res.arrayBuffer();
      const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", buf));
      const hex  = Array.from(hash).map((x) => x.toString(16).padStart(2, "0")).join("");
      if (hex !== storedHash) {
        setVerifyError(`Hash mismatch — file at URL does not match on-chain record.\nExpected: ${storedHash}\nGot: ${hex}`);
      } else {
        setVerifyHash(hex);
        setVerifyWallet(researcherAddr);
      }
    } catch (e: any) {
      setVerifyError(`Could not fetch file: ${e.message}`);
    } finally {
      setFetchVerifying(false);
    }
  }, []);

  const transferDiscovery = useCallback(async () => {
    if (!wallet.publicKey || !verifyResult?.pda || !verifyResult.researcher) return;
    let newOwnerKey: PublicKey;
    try { newOwnerKey = new PublicKey(transferTo.trim()); }
    catch { setTransferError("Invalid wallet address."); return; }

    setTransferring(true);
    setTransferError("");
    try {
      const program       = makeProgram(connection, wallet as any);
      const hashHex       = verifyHash.trim().toLowerCase();
      const researcherKey = new PublicKey(verifyResult.researcher);
      const [pda]         = PublicKey.findProgramAddressSync(
        [Buffer.from("discovery"), researcherKey.toBuffer(), Buffer.from(hashHex, "hex")],
        PROGRAM_ID,
      );
      await (program.methods as any)
        .transferDiscovery(Array.from(Buffer.from(hashHex, "hex")))
        .accounts({ owner: wallet.publicKey, newOwner: newOwnerKey, researcher: researcherKey, discoveryRecord: pda })
        .rpc({ commitment: "confirmed" });

      setTransferDone(true);
      setVerifyResult((prev) => prev ? { ...prev, owner: newOwnerKey.toBase58() } : prev);
    } catch (e: any) {
      setTransferError(e?.message ?? "Transfer failed.");
    } finally {
      setTransferring(false);
    }
  }, [wallet, verifyResult, verifyHash, transferTo, connection]);

  const endorseDiscovery = useCallback(async () => {
    if (!wallet.publicKey || !verifyResult?.researcher || !verifyResult.fileHashHex) return;
    setEndorsing(true);
    setEndorseError("");
    try {
      const program       = makeProgram(connection, wallet as any);
      const hashHex       = verifyResult.fileHashHex;
      const researcherKey = new PublicKey(verifyResult.researcher);
      const [pda]         = PublicKey.findProgramAddressSync(
        [Buffer.from("discovery"), researcherKey.toBuffer(), Buffer.from(hashHex, "hex")],
        PROGRAM_ID,
      );
      const [endorsementPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("endorsement"), wallet.publicKey.toBuffer(), pda.toBuffer()],
        PROGRAM_ID,
      );
      await (program.methods as any)
        .endorseDiscovery(Array.from(Buffer.from(hashHex, "hex")))
        .accounts({
          endorser: wallet.publicKey, researcher: researcherKey,
          discoveryRecord: pda, endorsementRecord: endorsementPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc({ commitment: "confirmed" });

      setEndorseDone(true);
      setVerifyResult((prev) => prev ? { ...prev, endorsementCount: (prev.endorsementCount ?? 0) + 1 } : prev);
    } catch (e: any) {
      setEndorseError(e?.message ?? "Endorsement failed.");
    } finally {
      setEndorsing(false);
    }
  }, [wallet, verifyResult, connection]);

  return {
    verifyHash, setVerifyHash, verifyWallet, setVerifyWallet,
    verifyResult, verifyError, verifying, fetchVerifying,
    transferTo, setTransferTo, transferring, transferError, transferDone,
    endorsing, endorseError, endorseDone,
    orcidName,
    handleVerifyFileSelect, runVerify, fetchAndVerify,
    transferDiscovery, endorseDiscovery,
  };
}
