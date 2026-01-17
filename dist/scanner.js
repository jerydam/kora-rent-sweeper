"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scanHistory = scanHistory;
const ora_1 = __importDefault(require("ora"));
const chalk_1 = __importDefault(require("chalk"));
async function scanHistory(connection, koraWallet, limit) {
    const spinner = (0, ora_1.default)(`Scanning last ${limit} transactions...`).start();
    const accountsToCheck = new Set();
    let before = undefined;
    let fetched = 0;
    while (fetched < limit) {
        const batchSize = Math.min(25, limit - fetched); // Smaller batch for debug
        const options = { limit: batchSize };
        if (before)
            options.before = before;
        // 1. Fetch Signatures
        const signatures = await connection.getSignaturesForAddress(koraWallet, options);
        if (!signatures || signatures.length === 0) {
            // If we found nothing on the first try, it's likely an RPC lag issue
            if (fetched === 0)
                console.log(chalk_1.default.yellow("\n⚠️  RPC returned 0 signatures. Wait 30s and try again."));
            break;
        }
        // 2. Fetch Parsed Transactions
        const txs = await connection.getParsedTransactions(signatures.map(s => s.signature), { maxSupportedTransactionVersion: 0 });
        for (const tx of txs) {
            if (!tx || !tx.meta || tx.meta.err)
                continue;
            if (!tx.transaction || !tx.transaction.message)
                continue;
            const message = tx.transaction.message;
            const accountKeys = message.accountKeys;
            // Safety check
            if (!accountKeys || accountKeys.length === 0)
                continue;
            // Identify Payer
            // Handle both "Parsed" (object) and "Raw" (string/PublicKey) formats safely
            const payerKeyObj = accountKeys[0];
            const payerAddr = payerKeyObj.pubkey ? payerKeyObj.pubkey.toBase58() : payerKeyObj.toBase58();
            // DEBUG: Log what we found
            // console.log(chalk.gray(`\nTx: ${tx.transaction.signatures[0]} | Payer: ${payerAddr}`));
            if (payerAddr === koraWallet.toBase58()) {
                accountKeys.forEach((key) => {
                    const keyAddr = key.pubkey ? key.pubkey.toBase58() : key.toBase58();
                    const isWritable = key.writable; // might be undefined in some parsed responses?
                    // Debug specific candidate
                    // if (keyAddr !== payerAddr) console.log(`   - Candidate: ${keyAddr} | Writable: ${isWritable}`);
                    // Logic: Must be writable, and NOT the payer
                    if (isWritable && keyAddr !== koraWallet.toBase58()) {
                        accountsToCheck.add(keyAddr);
                    }
                });
            }
        }
        const lastSignature = signatures[signatures.length - 1];
        if (lastSignature)
            before = lastSignature.signature;
        fetched += signatures.length;
        spinner.text = `Scanned ${fetched}/${limit} txs. Found ${accountsToCheck.size} candidates...`;
    }
    spinner.succeed(`Scan complete. Found ${accountsToCheck.size} potential accounts.`);
    return Array.from(accountsToCheck);
}
