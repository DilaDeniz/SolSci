import { useCallback, useMemo, useRef, useState } from "react";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import { WalletContextState } from "@solana/wallet-adapter-react";
import { makeProgram } from "../lib/program";
import {
  byteLen, bytesToHex, fileToBase64, hashFile,
  isImageFile, readTextSample,
} from "../lib/utils";
import { Certificate, META_LIMIT, PROGRAM_ID, QVAC_BASE_URL } from "../lib/constants";

export function useRegister(
  connection: Connection,
  wallet: WalletContextState,
  qvacOnline: boolean,
) {
  const [file, setFile]               = useState<File | null>(null);
  const [fileHash, setFileHash]       = useState("");
  const [hashBytes, setHashBytes]     = useState<Uint8Array | null>(null);
  const [analysisType, setAnalysisType] = useState("experiment");
  const [toolName, setToolName]       = useState("");
  const [toolVersion, setToolVersion] = useState("");
  const [description, setDescription] = useState("");
  const [publicUrl, setPublicUrl]     = useState("");
  const [orcidId, setOrcidId]         = useState("");
  const [authorEmail, setAuthorEmail] = useState("");
  const [status, setStatus]           = useState("");
  const [error, setError]             = useState("");
  const [certificate, setCertificate] = useState<Certificate | null>(null);
  const [registering, setRegistering] = useState(false);
  const [dragging, setDragging]       = useState(false);
  const [suggesting, setSuggesting]   = useState(false);
  const [recording, setRecording]     = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [ocrRunning, setOcrRunning]   = useState(false);
  const [ocrText, setOcrText]         = useState("");
  const [translating, setTranslating] = useState(false);
  const [ipfsUploading, setIpfsUploading] = useState(false);
  const [ipfsCid, setIpfsCid]         = useState("");
  const [citeInput, setCiteInput]     = useState("");
  const [citedPdas, setCitedPdas]     = useState<string[]>([]);

  const inputRef         = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef   = useRef<BlobPart[]>([]);

  const metadataBytes = useMemo(() => {
    const obj = {
      analysis_type: analysisType,
      ...(toolName    ? { tool: toolName }       : {}),
      ...(toolVersion ? { version: toolVersion } : {}),
      ...(description ? { description }          : {}),
      ...(publicUrl   ? { url: publicUrl }       : {}),
      ...(orcidId     ? { orcid: orcidId }       : {}),
      ...(authorEmail ? { email: authorEmail }   : {}),
      ...(citedPdas.length > 0 ? { cites: citedPdas } : {}),
      ...(file ? { file_name: file.name, file_size_bytes: file.size } : {}),
    };
    return byteLen(JSON.stringify(obj));
  }, [analysisType, toolName, toolVersion, description, publicUrl, orcidId, authorEmail, citedPdas, file]);

  const fileIsImg = file ? isImageFile(file) : false;

  // ── QVAC: AI suggest ──────────────────────────────────────────────────────

  const suggestWithAI = useCallback(async (overrideSample?: string) => {
    if (!file || !qvacOnline) return;
    setSuggesting(true);
    setError("");
    try {
      const fileSample = overrideSample ?? await readTextSample(file);
      const res = await fetch(`${QVAC_BASE_URL}/api/suggest`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ fileName: file.name, fileSample }),
      });
      const s = await res.json();
      if (s.analysis_type) setAnalysisType(s.analysis_type);
      if (s.tool)          setToolName(s.tool);
      if (s.version)       setToolVersion(s.version);
      if (s.description)   setDescription(s.description);
    } catch (e: any) {
      setError(`AI suggest failed: ${e.message}`);
    } finally {
      setSuggesting(false);
    }
  }, [file, qvacOnline]);

  // ── QVAC: Speech-to-text ─────────────────────────────────────────────────

  const toggleRecording = useCallback(async () => {
    if (recording) {
      mediaRecorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr     = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        setTranscribing(true);
        try {
          const blob = new Blob(audioChunksRef.current, { type: mr.mimeType });
          const ab   = await blob.arrayBuffer();
          const b64  = btoa(String.fromCharCode(...new Uint8Array(ab)));
          const res  = await fetch(`${QVAC_BASE_URL}/api/transcribe`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ audio: b64 }),
          });
          const { text } = await res.json();
          if (text) setDescription((prev) => prev ? `${prev} ${text}` : text);
        } catch (e: any) {
          setError(`Transcription failed: ${e.message}`);
        } finally {
          setTranscribing(false);
        }
      };

      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
    } catch (e: any) {
      setError(`Microphone access denied: ${e.message}`);
    }
  }, [recording]);

  // ── QVAC: OCR ────────────────────────────────────────────────────────────

  const runOcrAndSuggest = useCallback(async () => {
    if (!file || !qvacOnline) return;
    setOcrRunning(true);
    setError("");
    try {
      const b64 = await fileToBase64(file);
      const res = await fetch(`${QVAC_BASE_URL}/api/ocr`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ image: b64 }),
      });
      const { text, error: ocrErr } = await res.json();
      if (ocrErr) throw new Error(ocrErr);
      setOcrText(text ?? "");
      await suggestWithAI(text ?? "");
    } catch (e: any) {
      setError(`OCR failed: ${e.message}`);
    } finally {
      setOcrRunning(false);
    }
  }, [file, qvacOnline, suggestWithAI]);

  // ── QVAC: Translate ──────────────────────────────────────────────────────

  const translateDescription = useCallback(async () => {
    if (!description.trim() || !qvacOnline) return;
    setTranslating(true);
    setError("");
    try {
      const res = await fetch(`${QVAC_BASE_URL}/api/translate`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ text: description }),
      });
      const { text, error: tErr } = await res.json();
      if (tErr) throw new Error(tErr);
      if (text) setDescription(text);
    } catch (e: any) {
      setError(`Translation failed: ${e.message}`);
    } finally {
      setTranslating(false);
    }
  }, [description, qvacOnline]);

  // ── QVAC: IPFS ───────────────────────────────────────────────────────────

  const uploadFileToIpfs = useCallback(async () => {
    if (!file || !qvacOnline) return;
    setIpfsUploading(true);
    setError("");
    try {
      const b64 = await fileToBase64(file);
      const res = await fetch(`${QVAC_BASE_URL}/api/ipfs`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ file: b64, fileName: file.name }),
      });
      const { cid, url, error: ipfsErr } = await res.json();
      if (ipfsErr) throw new Error(ipfsErr);
      setIpfsCid(cid);
      setPublicUrl(url);
    } catch (e: any) {
      setError(`IPFS upload failed: ${e.message}`);
    } finally {
      setIpfsUploading(false);
    }
  }, [file, qvacOnline]);

  // ── File select ───────────────────────────────────────────────────────────

  const handleFileSelect = useCallback(async (f: File) => {
    setFile(f);
    setFileHash("");
    setHashBytes(null);
    setCertificate(null);
    setError("");
    setOcrText("");
    setPublicUrl("");
    setIpfsCid("");
    setCitedPdas([]);
    setStatus("Hashing…");
    try {
      const bytes = await hashFile(f);
      setHashBytes(bytes);
      setFileHash(bytesToHex(bytes));
      setStatus("");
    } catch {
      setError("Failed to hash file.");
      setStatus("");
    }
  }, []);

  // ── Register ──────────────────────────────────────────────────────────────

  const registerDiscovery = useCallback(async () => {
    if (!wallet.publicKey || !hashBytes || !file) return;
    setError("");
    setRegistering(true);
    setStatus("Building transaction…");
    try {
      const program  = makeProgram(connection, wallet as any);
      const metadata = JSON.stringify({
        analysis_type: analysisType,
        ...(toolName    ? { tool: toolName }       : {}),
        ...(toolVersion ? { version: toolVersion } : {}),
        ...(description ? { description }          : {}),
        ...(publicUrl   ? { url: publicUrl }       : {}),
        ...(orcidId     ? { orcid: orcidId }       : {}),
        ...(authorEmail ? { email: authorEmail }   : {}),
        ...(citedPdas.length > 0 ? { cites: citedPdas } : {}),
        file_name:       file.name,
        file_size_bytes: file.size,
      });

      if (byteLen(metadata) > META_LIMIT) {
        setError("Metadata too long (> 512 bytes). Shorten description or file name.");
        return;
      }

      const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from("discovery"), wallet.publicKey.toBuffer(), Buffer.from(hashBytes)],
        PROGRAM_ID,
      );

      setStatus("Waiting for wallet approval…");
      const txSig = await (program.methods as any)
        .registerDiscovery(Array.from(hashBytes), metadata)
        .accounts({ researcher: wallet.publicKey, discoveryRecord: pda, systemProgram: SystemProgram.programId })
        .rpc({ commitment: "confirmed" });

      setStatus("Confirming…");
      const record = await (program.account as any).discoveryRecord.fetch(pda);
      setCertificate({ pda: pda.toBase58(), txSig, fileHash, timestamp: record.timestamp.toNumber(), metadata });
      setStatus("");
    } catch (e: any) {
      setError(e?.message ?? "Transaction failed.");
      setStatus("");
    } finally {
      setRegistering(false);
    }
  }, [wallet, hashBytes, file, analysisType, toolName, toolVersion, description, publicUrl, orcidId, authorEmail, citedPdas, fileHash, connection]);

  return {
    // state
    file, fileHash, hashBytes, analysisType, setAnalysisType,
    toolName, setToolName, toolVersion, setToolVersion,
    description, setDescription, publicUrl, setPublicUrl,
    orcidId, setOrcidId, authorEmail, setAuthorEmail,
    status, error, certificate, registering, dragging, setDragging,
    suggesting, recording, transcribing, ocrRunning, ocrText,
    translating, ipfsUploading, ipfsCid,
    citeInput, setCiteInput, citedPdas, setCitedPdas,
    metadataBytes, fileIsImg,
    // refs
    inputRef,
    // actions
    handleFileSelect, registerDiscovery, suggestWithAI,
    toggleRecording, runOcrAndSuggest, translateDescription, uploadFileToIpfs,
  };
}
