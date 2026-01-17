import { Connection, PublicKey, SystemProgram } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import * as fs from 'fs';
import ora from 'ora';

export interface SweepTarget {
  pubkey: PublicKey;
  type: 'NONCE' | 'TOKEN' | 'BUFFER';
  balance: number;
  reason: string;
}

// Load whitelist if exists
const WHITELIST = fs.existsSync('whitelist.json') 
  ? JSON.parse(fs.readFileSync('whitelist.json', 'utf-8')) 
  : [];

export async function analyzeAccounts(
  connection: Connection,
  authority: PublicKey,
  candidates: string[]
): Promise<SweepTarget[]> {
  const targets: SweepTarget[] = [];
  const spinner = ora('Analyzing on-chain account state...').start();

  // Batch process to avoid rate limits (chunks of 100)
  for (let i = 0; i < candidates.length; i += 100) {
    const chunk = candidates.slice(i, i + 100).map(c => new PublicKey(c));
    const infos = await connection.getMultipleAccountsInfo(chunk);

    for (let j = 0; j < infos.length; j++) {
      const info = infos[j];
      const pubkey = chunk[j];
      if (!info || !pubkey) continue; 
      if (WHITELIST.includes(pubkey.toBase58())) continue;

      // Check Token Accounts
      if (info.owner.toBase58() === TOKEN_PROGRAM_ID.toBase58()) {
        if (info.data.length === 165) { 
           targets.push({
             pubkey,
             type: 'TOKEN',
             balance: info.lamports,
             reason: 'Idle Token Account'
           });
        }
      }
      
      // Check Nonce Accounts
      if (info.owner.toBase58() === SystemProgram.programId.toBase58() && info.data.length === 80) {
        targets.push({
          pubkey,
          type: 'NONCE',
          balance: info.lamports,
          reason: 'Durable Nonce'
        });
      }
    }
  }

  spinner.succeed(`Analysis complete. Identified ${targets.length} reclaimable accounts.`);
  return targets;
}
export const scanHistory = async (connection: any, pubkey: any, limit: number) => {
  // Fetch transaction history
  const signatures = await connection.getSignaturesForAddress(pubkey, { limit });
  const accountsToCheck = new Set<string>();

  // Extract all writable accounts from history
  for (const sigInfo of signatures) {
    const tx = await connection.getParsedTransaction(sigInfo.signature, { maxSupportedTransactionVersion: 0 });
    if (!tx || !tx.meta) continue;

    // Look for accounts created or modified
    tx.transaction.message.accountKeys.forEach((key: any) => {
        // If it's a writable account and NOT the owner itself, add to check list
        if (key.writable && key.pubkey.toBase58() !== pubkey.toBase58()) {
            accountsToCheck.add(key.pubkey.toBase58());
        }
    });
  }
  
  return Array.from(accountsToCheck);
};