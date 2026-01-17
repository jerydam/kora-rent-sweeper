import TelegramBot from 'node-telegram-bot-api';
import { Connection, Keypair, SystemProgram, Transaction, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { 
  TOKEN_PROGRAM_ID, 
  createInitializeAccountInstruction, 
  ACCOUNT_SIZE, 
  NATIVE_MINT 
} from '@solana/spl-token';
import { config } from 'dotenv';
import { analyzeAccounts } from './analyzer';
import { sweepAccounts } from './sweeper';

config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const rpcUrl = process.env.KORA_RPC_URL || 'https://api.devnet.solana.com';

if (!token) {
  console.error("❌ Missing TELEGRAM_BOT_TOKEN in .env");
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });
const connection = new Connection(rpcUrl, "confirmed");

// --- 🔐 SESSION MANAGER ---
// We store user wallets in memory. Map<ChatID, Keypair>
const userSessions = new Map<number, Keypair>();

console.log("🤖 Public Kora Bot is ONLINE...");

// --- HELPER: Get User Wallet ---
const getWallet = (chatId: number): Keypair | undefined => {
  return userSessions.get(chatId);
};

// --- HELPER: Error Handler ---
const handleError = (chatId: number, e: any) => {
  let msg = `❌ Error: ${e.message}`;
  if (e.message.includes("429")) {
    msg = "⚠️ <b>RPC Rate Limit Hit</b>\nSystem is busy. Please try again in a minute.";
  }
  bot.sendMessage(chatId, msg, { parse_mode: 'HTML' });
  console.error(msg);
};

// --- COMMANDS ---

// 1. /start (Public Welcome)
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, 
    `👋 *Welcome to Kora Rent Sweeper*\n\n` +
    `I can help you recover idle rent SOL from your Kora Operator node.\n\n` +
    `⚠️ *Safety Warning:* This is a demo tool. Please use a *Burner Wallet* (Devnet) for testing.\n\n` +
    `*Step 1:* Login with your Private Key to start session.\n` +
    `Command: \`/login [YOUR_PRIVATE_KEY_ARRAY]\`\n\n` +
    `*Example:* \`/login [123, 45, ...]\``,
    { parse_mode: 'Markdown' }
  );
});

// 2. /login (Smart Version: Accepts Array OR Base58)
bot.onText(/\/login (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  try {
    const keyString = match ? match[1].trim() : "";
    let secretKey: Uint8Array;

    // DETECT FORMAT
    if (keyString.startsWith('[') && keyString.endsWith(']')) {
      // Format A: JSON Array (e.g. [12, 214, ...])
      secretKey = Uint8Array.from(JSON.parse(keyString));
    } else {
      // Format B: Base58 String (e.g. 2387hS...)
      secretKey = bs58.decode(keyString);
    }

    // Verify it's a valid key
    if (secretKey.length !== 64) {
      throw new Error("Invalid Key Length");
    }

    const wallet = Keypair.fromSecretKey(secretKey);

    // Save to session
    userSessions.set(chatId, wallet);

    bot.sendMessage(chatId, 
      `✅ *Login Successful!*\n` +
      `Connected Wallet: \`${wallet.publicKey.toBase58()}\`\n\n` +
      `You can now use commands like:\n` +
      `• \`/seed\` - Create test leak\n` +
      `• \`/target <addr>\` - Check specific account\n` +
      `• \`/claim <addr>\` - Reclaim rent`,
      { parse_mode: 'Markdown' }
    );
    
    // Auto-delete the unsafe message
    bot.deleteMessage(chatId, msg.message_id).catch(() => {}); 

  } catch (e) {
    bot.sendMessage(chatId, "❌ Invalid Private Key. Please paste either the **Base58 String** (from Phantom) or the **JSON Array**.", { parse_mode: 'Markdown' });
  }
});

// 3. /logout
bot.onText(/\/logout/, (msg) => {
  userSessions.delete(msg.chat.id);
  bot.sendMessage(msg.chat.id, "🔒 *Logged out.* Your session has been cleared.", { parse_mode: 'Markdown' });
});

// 4. /seed (User Specific)
bot.onText(/\/seed/, async (msg) => {
  const chatId = msg.chat.id;
  const wallet = getWallet(chatId);
  if (!wallet) return bot.sendMessage(chatId, "⛔ Please `/login` first.");

  bot.sendMessage(chatId, "🌱 Planting junk account...");

  try {
    const newAccount = Keypair.generate();
    const rent = await connection.getMinimumBalanceForRentExemption(ACCOUNT_SIZE);

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
        NATIVE_MINT, 
        wallet.publicKey 
      )
    );

    const sig = await connection.sendTransaction(tx, [wallet, newAccount]);
    await connection.confirmTransaction(sig);

    const addr = newAccount.publicKey.toBase58();
    bot.sendMessage(chatId, 
      `✅ *Leak Created!*\nAddress: \`${addr}\`\n\nUse \`/claim ${addr}\` to fix it.`, 
      { parse_mode: 'Markdown' }
    );
  } catch (e: any) {
    handleError(chatId, e);
  }
});

// 5. /target
bot.onText(/\/target (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const wallet = getWallet(chatId);
  if (!wallet) return bot.sendMessage(chatId, "⛔ Please `/login` first.");

  const address = match ? match[1].trim() : null;
  if (!address) return bot.sendMessage(chatId, "⚠️ Usage: `/target <address>`");

  bot.sendMessage(chatId, `🎯 Checking: \`${address}\`...`);

  try {
    const targets = await analyzeAccounts(connection, wallet.publicKey, [address]);
    if (targets.length === 0) return bot.sendMessage(chatId, "✨ Clean or not eligible.");

    const result = await sweepAccounts(connection, wallet, targets, true);
    bot.sendMessage(chatId, `<b>Found:</b>\n<pre>${result.report}</pre>`, { parse_mode: 'HTML' });
  } catch (e: any) {
    handleError(chatId, e);
  }
});

// 6. /claim
bot.onText(/\/claim (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const wallet = getWallet(chatId);
  if (!wallet) return bot.sendMessage(chatId, "⛔ Please `/login` first.");

  const address = match ? match[1].trim() : null;
  if (!address) return bot.sendMessage(chatId, "⚠️ Usage: `/claim <address>`");

  bot.sendMessage(chatId, `💰 Reclaiming...`);

  try {
    const targets = await analyzeAccounts(connection, wallet.publicKey, [address]);
    if (targets.length === 0) return bot.sendMessage(chatId, "❌ Not eligible.");

    const result = await sweepAccounts(connection, wallet, targets, false);
    if (result.successCount > 0) {
      bot.sendMessage(chatId, `✅ <b>RECLAIMED!</b>\n<pre>${result.report}</pre>`, { parse_mode: 'HTML' });
    } else {
      bot.sendMessage(chatId, `⚠️ Transaction failed.`);
    }
  } catch (e: any) {
    handleError(chatId, e);
  }
});

// 7. /help
bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id, 
    `🤖 *Public Kora Bot Commands*\n\n` +
    `1. \`/login [KEY]\` - Start Session\n` +
    `2. \`/seed\` - Create Demo Leak\n` +
    `3. \`/target <addr>\` - Check Account\n` +
    `4. \`/claim <addr>\` - Reclaim Rent\n` +
    `5. \`/logout\` - End Session`,
    { parse_mode: 'Markdown' }
  );
});

bot.on("polling_error", (msg) => console.log("⚠️ Polling Error:", msg.message));