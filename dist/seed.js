"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const fs = __importStar(require("fs"));
// Setup
const connection = new web3_js_1.Connection("https://api.devnet.solana.com", "confirmed");
const keypairData = JSON.parse(fs.readFileSync('kora-wallet.json', 'utf-8'));
const wallet = web3_js_1.Keypair.fromSecretKey(new Uint8Array(keypairData));
async function createJunk() {
    console.log("🌱 Planting junk accounts to test the Sweeper...");
    // 1. Create a random new account keypair
    const newAccount = web3_js_1.Keypair.generate();
    // 2. Calculate rent needed for a Token Account (165 bytes)
    const rent = await connection.getMinimumBalanceForRentExemption(spl_token_1.ACCOUNT_SIZE);
    // 3. Build transaction
    // We use NATIVE_MINT (Wrapped SOL) which is valid on all networks.
    const tx = new web3_js_1.Transaction().add(web3_js_1.SystemProgram.createAccount({
        fromPubkey: wallet.publicKey,
        newAccountPubkey: newAccount.publicKey,
        lamports: rent,
        space: spl_token_1.ACCOUNT_SIZE,
        programId: spl_token_1.TOKEN_PROGRAM_ID,
    }), (0, spl_token_1.createInitializeAccountInstruction)(newAccount.publicKey, spl_token_1.NATIVE_MINT, // <--- FIXED: Using a real mint (Wrapped SOL)
    wallet.publicKey // owner
    ));
    // 4. Send
    console.log(`Creating junk account: ${newAccount.publicKey.toBase58()}...`);
    const sig = await connection.sendTransaction(tx, [wallet, newAccount]);
    await connection.confirmTransaction(sig);
    console.log(`✅ Success! Leaked ${(rent / 1000000000).toFixed(4)} SOL into account: ${newAccount.publicKey.toBase58()}`);
    console.log("Run the sweeper now to reclaim it!");
}
createJunk().catch(console.error);
