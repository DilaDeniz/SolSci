import { Connection, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program, Idl } from "@coral-xyz/anchor";
import idl from "../idl/solsci.json";
import { readonlyWallet } from "./utils";

export function makeProgram(connection: Connection, wallet: any): Program {
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  return new Program(idl as Idl, provider);
}

export function makeReadonlyProgram(connection: Connection, fallbackKey: PublicKey): Program {
  const provider = new AnchorProvider(
    connection,
    readonlyWallet(fallbackKey) as any,
    { commitment: "confirmed" },
  );
  return new Program(idl as Idl, provider);
}
