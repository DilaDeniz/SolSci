/**
 * QVAC IPFS upload — pin files to IPFS entirely locally.
 *
 * Strategy (in priority order):
 *   1. Local Kubo node on 127.0.0.1:5001  (no auth, free, works offline)
 *   2. Pinata API if PINATA_JWT env var is set
 *
 * Returns { cid, url } where url is a public IPFS gateway URL.
 */

import FormData from "form-data";
import fetch    from "node-fetch";

const KUBO_API     = "http://127.0.0.1:5001/api/v0";
const PINATA_API   = "https://api.pinata.cloud/pinning/pinFileToIPFS";
const IPFS_GATEWAY = "https://ipfs.io/ipfs";

async function tryKubo(fileBuffer, fileName) {
  const form = new FormData();
  form.append("file", fileBuffer, { filename: fileName });

  const res = await fetch(`${KUBO_API}/add?pin=true&quieter=true`, {
    method:  "POST",
    body:    form,
    headers: form.getHeaders(),
    signal:  AbortSignal.timeout(10_000),
  });

  if (!res.ok) throw new Error(`Kubo responded ${res.status}`);
  const { Hash } = await res.json();
  return Hash;
}

async function tryPinata(fileBuffer, fileName) {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) throw new Error("PINATA_JWT not set");

  const form = new FormData();
  form.append("file", fileBuffer, { filename: fileName });

  const res = await fetch(PINATA_API, {
    method:  "POST",
    body:    form,
    headers: { ...form.getHeaders(), Authorization: `Bearer ${jwt}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pinata error ${res.status}: ${text}`);
  }
  const { IpfsHash } = await res.json();
  return IpfsHash;
}

/**
 * Upload a file buffer to IPFS.
 * @param {Buffer} fileBuffer  Raw file bytes.
 * @param {string} fileName    Original file name (used as IPFS filename hint).
 * @returns {Promise<{cid: string, url: string}>}
 */
export async function uploadToIpfs(fileBuffer, fileName) {
  let cid;

  // 1. Try local Kubo
  try {
    cid = await tryKubo(fileBuffer, fileName);
  } catch (kuboErr) {
    // 2. Fall back to Pinata
    try {
      cid = await tryPinata(fileBuffer, fileName);
    } catch (pinataErr) {
      throw new Error(
        `IPFS upload failed.\n  Local node: ${kuboErr.message}\n  Pinata: ${pinataErr.message}`
      );
    }
  }

  return { cid, url: `${IPFS_GATEWAY}/${cid}` };
}
