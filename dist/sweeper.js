"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sweepAccounts = sweepAccounts;
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const cli_table3_1 = __importDefault(require("cli-table3"));
const chalk_1 = __importDefault(require("chalk"));
async function sweepAccounts(connection, wallet, targets, dryRun) {
    // Fix 1: Add a safety check for empty targets to avoid "undefined" table issues
    if (!targets || targets.length === 0) {
        console.log(chalk_1.default.yellow("No accounts to sweep."));
        return;
    }
    const table = new cli_table3_1.default({
        head: ['Type', 'Address', 'Rent (SOL)', 'Status'],
        style: { head: ['cyan'] }
    });
    let totalReclaimed = 0;
    let successCount = 0;
    console.log(`\nProcessing ${targets.length} accounts...`);
    for (const target of targets) {
        let tx = new web3_js_1.Transaction();
        // Build Instruction
        if (target.type === 'TOKEN') {
            // Close Token Account
            tx.add((0, spl_token_1.createCloseAccountInstruction)(target.pubkey, wallet.publicKey, wallet.publicKey));
        }
        else if (target.type === 'NONCE') {
            // Fix 2: Use the correct method name 'nonceWithdraw'
            tx.add(web3_js_1.SystemProgram.nonceWithdraw({
                noncePubkey: target.pubkey,
                authorizedPubkey: wallet.publicKey,
                toPubkey: wallet.publicKey,
                lamports: target.balance
            }));
        }
        // SIMULATION
        try {
            tx.feePayer = wallet.publicKey;
            // Fix 3: Handle potential undefined blockhash
            const latestBlockhash = await connection.getLatestBlockhash();
            tx.recentBlockhash = latestBlockhash.blockhash;
            const simulation = await connection.simulateTransaction(tx);
            // Fix 4: strict check on simulation error
            if (simulation.value.err) {
                continue; // Skip if we can't close it (auth fail or not empty)
            }
            // EXECUTION
            if (dryRun) {
                table.push([target.type, target.pubkey.toBase58(), (target.balance / web3_js_1.LAMPORTS_PER_SOL).toFixed(4), chalk_1.default.yellow('DRY RUN')]);
                totalReclaimed += target.balance;
            }
            else {
                const sig = await connection.sendTransaction(tx, [wallet]);
                await connection.confirmTransaction(sig);
                table.push([target.type, target.pubkey.toBase58(), (target.balance / web3_js_1.LAMPORTS_PER_SOL).toFixed(4), chalk_1.default.green('RECLAIMED')]);
                totalReclaimed += target.balance;
                successCount++;
            }
        }
        catch (e) {
            // console.log(chalk.red(`Failed to process ${target.pubkey.toBase58()}`));
        }
    }
    console.log(table.toString());
    const statusColor = dryRun ? chalk_1.default.yellow : chalk_1.default.green;
    console.log(statusColor(`\n💰 Total Recoverable Rent: ${(totalReclaimed / web3_js_1.LAMPORTS_PER_SOL).toFixed(4)} SOL`));
    if (!dryRun)
        console.log(chalk_1.default.gray(`Successfully swept ${successCount} accounts.`));
}
