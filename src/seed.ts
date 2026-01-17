import { Connection, Keypair, SystemProgram, Transaction, PublicKey } from '@solana/web3.js';
import { 
  TOKEN_PROGRAM_ID, 
  createInitializeAccountInstruction, 
  ACCOUNT_SIZE, 
  NATIVE_MINT 
} from '@solana/spl-token';
import * as fs from 'fs';

// Setup
const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const keypairData = JSON.parse(fs.readFileSync('kora-wallet.json', 'utf-8'));
const wallet = Keypair.fromSecretKey(new Uint8Array(keypairData));

async function createJunk() {
  console.log("🌱 Planting junk accounts to test the Sweeper...");

  // 1. Create a random new account keypair
  const newAccount = Keypair.generate();
  
  // 2. Calculate rent needed for a Token Account (165 bytes)
  const rent = await connection.getMinimumBalanceForRentExemption(ACCOUNT_SIZE);

  // 3. Build transaction
  // We use NATIVE_MINT (Wrapped SOL) which is valid on all networks.
  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: wallet.publicKey,
      newAccountPubkey: newAccount.publicKey,
      lamports: rent,
      space: ACCOUNT_SIZE,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeAccountInstruction(
      newAccount.publicKey,
      NATIVE_MINT,      // <--- FIXED: Using a real mint (Wrapped SOL)
      wallet.publicKey  // owner
    )
  );

  // 4. Send
  console.log(`Creating junk account: ${newAccount.publicKey.toBase58()}...`);
  const sig = await connection.sendTransaction(tx, [wallet, newAccount]);
  await connection.confirmTransaction(sig);
  
  console.log(`✅ Success! Leaked ${(rent/1000000000).toFixed(4)} SOL into account: ${newAccount.publicKey.toBase58()}`);
  console.log("Run the sweeper now to reclaim it!");
}

createJunk().catch(console.error);