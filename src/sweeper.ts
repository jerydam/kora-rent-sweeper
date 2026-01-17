import { Connection, Keypair, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createCloseAccountInstruction } from '@solana/spl-token';
import Table from 'cli-table3';
import { SweepTarget } from './analyzer';

// Define a Result interface
export interface SweepResult {
  report: string;         // The formatted table/text to show user
  totalReclaimed: number; // Raw number for logic
  successCount: number;
}

export async function sweepAccounts(
  connection: Connection,
  wallet: Keypair,
  targets: SweepTarget[],
  dryRun: boolean
): Promise<SweepResult> {
  
  // Create a table (we will convert this to string later)
  const table = new Table({
    head: ['Type', 'Address', 'Rent (SOL)', 'Status'],
    style: { head: [], border: [] } // Minimal style for better compatibility
  });

  let totalReclaimed = 0;
  let successCount = 0;
  
  // We use this array to build a text-friendly report for Telegram too
  let textReport = "🧹 *Sweep Report*\n\n";

  for (const target of targets) {
    let tx = new Transaction();
    let status = "FAILED";

    // Build Instruction
    if (target.type === 'TOKEN') {
      tx.add(createCloseAccountInstruction(target.pubkey, wallet.publicKey, wallet.publicKey));
    } else if (target.type === 'NONCE') {
      tx.add(SystemProgram.nonceWithdraw({
        noncePubkey: target.pubkey,
        authorizedPubkey: wallet.publicKey,
        toPubkey: wallet.publicKey,
        lamports: target.balance
      }));
    }

    try {
      tx.feePayer = wallet.publicKey;
      const latestBlockhash = await connection.getLatestBlockhash();
      tx.recentBlockhash = latestBlockhash.blockhash;
      
      const simulation = await connection.simulateTransaction(tx);
      
      if (!simulation.value.err) {
        if (dryRun) {
          status = "DRY RUN";
          totalReclaimed += target.balance;
        } else {
          const sig = await connection.sendTransaction(tx, [wallet]);
          await connection.confirmTransaction(sig);
          status = "RECLAIMED";
          totalReclaimed += target.balance;
          successCount++;
        }
      } else {
        status = "SKIP (Auth)";
      }
    } catch (e) {
      status = "ERROR";
    }

    // Add to Table (For CLI)
    table.push([target.type, target.pubkey.toBase58().slice(0,8)+'...', (target.balance / LAMPORTS_PER_SOL).toFixed(4), status]);
    
    // Add to Text Report (For Telegram)
    textReport += `• \`${target.pubkey.toBase58().slice(0,6)}...\` | ${status} | ${(target.balance / LAMPORTS_PER_SOL).toFixed(4)} SOL\n`;
  }

  const totalSOL = (totalReclaimed / LAMPORTS_PER_SOL).toFixed(4);
  textReport += `\n💰 *Total:* ${totalSOL} SOL`;

  // For CLI, we prefer the nice table. For Bot, we might prefer the textReport.
  // We return both or let the caller decide.
  // Here, we return the CLI table string as the default 'report'.
  
  return {
    report: table.toString() + `\n\n💰 Total: ${totalSOL} SOL`,
    totalReclaimed,
    successCount
  };
}