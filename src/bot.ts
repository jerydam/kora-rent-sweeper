import TelegramBot from 'node-telegram-bot-api';
import { 
  Connection, 
  Keypair, 
  SystemProgram, 
  Transaction, 
  PublicKey 
} from '@solana/web3.js';
import { 
  TOKEN_PROGRAM_ID, 
  createInitializeAccountInstruction, 
  ACCOUNT_SIZE, 
  NATIVE_MINT 
} from '@solana/spl-token';
import bs58 from 'bs58';
import { config } from 'dotenv';
import { analyzeAccounts } from './analyzer';
import { sweepAccounts } from './sweeper';
import { SessionManager } from './session';
import * as http from 'http';

config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const rpcDevnet = process.env.RPC_DEVNET || 'https://api.devnet.solana.com';
const rpcMainnet = process.env.RPC_MAINNET || 'https://api.mainnet-beta.solana.com';

if (!token) {
  console.error("❌ Missing TELEGRAM_BOT_TOKEN in .env");
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

console.log("🤖 Kora Bot (Persistent) is ONLINE...");

// --- HELPER: Get Connection based on Network ---
const getConnection = (network: string) => {
  const url = network === 'mainnet' ? rpcMainnet : rpcDevnet;
  return new Connection(url, "confirmed");
};

// --- COMMANDS ---

// 1. /start - Show Connection Menu
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const existing = SessionManager.getSession(chatId);

  if (existing) {
    const wallet = Keypair.fromSecretKey(existing.secretKey);
    return bot.sendMessage(chatId, 
      `✅ *You are connected on ${existing.network.toUpperCase()}*\n` +
      `Wallet: \`${wallet.publicKey.toBase58()}\`\n\n` +
      `Commands:\n` +
      `/balance - 💰 Check funds\n` +
      `/target <addr> - Check account\n` +
      `/claim <addr> - Sweep funds\n` +
      `/logout - Disconnect wallet`, 
      { parse_mode: 'Markdown' }
    );
  }

  // Show "Connect" Buttons
  bot.sendMessage(chatId, 
    `👋 *Welcome to Kora Rent Sweeper*\n\n` +
    `Select a network to connect your Operator Wallet.\n` +
    `Your key will be encrypted and stored securely so you don't have to paste it again.`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🌐 Connect Mainnet", callback_data: "setup_mainnet" }],
          [{ text: "🧪 Connect Devnet", callback_data: "setup_devnet" }]
        ]
      }
    }
  );
});

// 2. Handle Button Clicks
bot.on('callback_query', (query) => {
  const chatId = query.message!.chat.id;
  const data = query.data;

  if (data === "setup_mainnet" || data === "setup_devnet") {
    const network = data === "setup_mainnet" ? "mainnet" : "devnet";
    
    bot.sendMessage(chatId, 
      `🔐 *Setup ${network.toUpperCase()}*\n\n` +
      `Please reply with your **Private Key** to link your wallet.\n` +
      `(Accepts JSON Array \`[...]\` or Base58 String).\n\n` +
      `*Security Note:* This message will be auto-deleted immediately.`, 
      { parse_mode: 'Markdown' }
    ).then(() => {
      userPendingNetwork.set(chatId, network as 'mainnet' | 'devnet');
    });
  }
});

// Temporary map to track who is setting up which network
const userPendingNetwork = new Map<number, 'mainnet' | 'devnet'>();

// 3. Handle Key Input (The "Once" Step)
bot.on('message', (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return; // Ignore commands
  const chatId = msg.chat.id;
  
  if (userPendingNetwork.has(chatId)) {
    const network = userPendingNetwork.get(chatId)!;
    
    try {
      const keyString = msg.text.trim();
      let secretKey: Uint8Array;

      // Decode Key
      if (keyString.startsWith('[') && keyString.endsWith(']')) {
        secretKey = Uint8Array.from(JSON.parse(keyString));
      } else {
        secretKey = bs58.decode(keyString);
      }
      if (secretKey.length !== 64) throw new Error("Invalid Key");

      // SAVE TO DB (Persistent!)
      SessionManager.saveSession(chatId, Array.from(secretKey), network);
      userPendingNetwork.delete(chatId);

      // Delete user's message for safety
      bot.deleteMessage(chatId, msg.message_id).catch(() => {});

      const wallet = Keypair.fromSecretKey(secretKey);
      bot.sendMessage(chatId, 
        `✅ *Success! Wallet Linked.*\n` +
        `Network: ${network.toUpperCase()}\n` +
        `Address: \`${wallet.publicKey.toBase58()}\`\n\n` +
        `I will remember this wallet until you type \`/logout\`.`, 
        { parse_mode: 'Markdown' }
      );

    } catch (e) {
      bot.sendMessage(chatId, "❌ Invalid Key. Please try again.");
    }
  }
});

// 4. /seed (Robust Version)
bot.onText(/\/seed/, async (msg) => {
  const chatId = msg.chat.id;
  const session = SessionManager.getSession(chatId);
  
  if (!session) return bot.sendMessage(chatId, "⛔ Please connect a wallet first using /start");

  bot.sendMessage(chatId, "🌱 Planting junk account (this takes ~10s)...");

  try {
    const wallet = Keypair.fromSecretKey(session.secretKey);
    const connection = getConnection(session.network);

    // 1. Check Balance First
    const bal = await connection.getBalance(wallet.publicKey);
    if (bal < 0.003 * 1e9) {
      throw new Error("Insufficient SOL. You need at least 0.003 SOL to seed.");
    }

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

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = wallet.publicKey;

    const sig = await connection.sendTransaction(tx, [wallet, newAccount], {
      skipPreflight: false,
      preflightCommitment: 'confirmed'
    });

    console.log(`Seed Tx Sent: ${sig}`);
    await connection.confirmTransaction({
      signature: sig,
      blockhash,
      lastValidBlockHeight
    }, 'confirmed');

    const addr = newAccount.publicKey.toBase58();
    bot.sendMessage(chatId, 
      `✅ *Leak Created!*\n` +
      `Address: \`${addr}\`\n\n` +
      `Wait 10 seconds, then tap:\n` +
      `/claim ${addr}`, 
      { parse_mode: 'Markdown' }
    );
  } catch (e: any) {
    console.error("Seed Error:", e);
    bot.sendMessage(chatId, `❌ Seed Failed: ${e.message}`);
  }
});

// 5. /balance
bot.onText(/\/balance/, async (msg) => {
  const chatId = msg.chat.id;
  const session = SessionManager.getSession(chatId);

  if (!session) {
    return bot.sendMessage(chatId, "⛔ Please connect a wallet first using /start");
  }

  const wallet = Keypair.fromSecretKey(session.secretKey);
  const pubKey = wallet.publicKey;
  
  bot.sendMessage(chatId, "⏳ Checking balances across networks...");

  try {
    const connDev = new Connection(rpcDevnet, "confirmed");
    const connMain = new Connection(rpcMainnet, "confirmed");

    const [balDev, balMain] = await Promise.all([
      connDev.getBalance(pubKey),
      connMain.getBalance(pubKey)
    ]);

    const solDev = (balDev / 1e9).toFixed(4);
    const solMain = (balMain / 1e9).toFixed(4);

    bot.sendMessage(chatId, 
      `💰 <b>Wallet Balance</b>\n` +
      `Address: <code>${pubKey.toBase58()}</code>\n\n` +
      `<b>🧪 Devnet:</b> ${solDev} SOL\n` +
      `<b>🌐 Mainnet:</b> ${solMain} SOL`, 
      { parse_mode: 'HTML' }
    );

  } catch (e: any) {
    bot.sendMessage(chatId, `❌ Error fetching balance: ${e.message}`);
  }
});

// 6. /help
bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id, 
    `🤖 *Kora Bot Commands*\n\n` +
    `• \`/start\` - Connect Wallet\n` +
    `• \`/balance\` - 💰 Check funds\n` +
    `• \`/seed\` - 🌱 Create Leak (Test)\n` +
    `• \`/target <addr>\` - 🎯 Check account\n` +
    `• \`/claim <addr>\` - 🧹 Reclaim rent\n` +
    `• \`/logout\` - 🔒 Disconnect`,
    { parse_mode: 'Markdown' }
  );
});

// 7. /logout
bot.onText(/\/logout/, (msg) => {
  SessionManager.deactivate(msg.chat.id);
  bot.sendMessage(msg.chat.id, "🔒 *Wallet disconnected.* Use /start to reconnect.");
});

// 8. /target & /claim
const handleCommand = async (msg: any, type: 'target' | 'claim', address: string | null) => {
  const chatId = msg.chat.id;
  const session = SessionManager.getSession(chatId);
  if (!session) return bot.sendMessage(chatId, "⛔ Please connect a wallet first using /start");

  if (!address) return bot.sendMessage(chatId, `⚠️ Usage: /${type} <address>`);

  const wallet = Keypair.fromSecretKey(session.secretKey);
  const connection = getConnection(session.network);

  bot.sendMessage(chatId, `Running ${type} on ${session.network.toUpperCase()}...`);

  try {
    const targets = await analyzeAccounts(connection, wallet.publicKey, [address]);
    if (targets.length === 0) return bot.sendMessage(chatId, "✨ Clean or not eligible.");

    const isDryRun = (type === 'target');
    const result = await sweepAccounts(connection, wallet, targets, isDryRun);
    
    bot.sendMessage(chatId, `<pre>${result.report}</pre>`, { parse_mode: 'HTML' });
  } catch (e: any) {
    bot.sendMessage(chatId, `❌ Error: ${e.message}`);
  }
};

bot.onText(/\/target (.+)/, (msg, match) => handleCommand(msg, 'target', match ? match[1].trim() : null));
bot.onText(/\/claim (.+)/, (msg, match) => handleCommand(msg, 'claim', match ? match[1].trim() : null));

// --- 🌍 RENDER KEEPER ---
const PORT = Number(process.env.PORT) || 3000;
http.createServer((req, res) => { res.end('🤖 Kora Bot Online'); }).listen(PORT, '0.0.0.0', () => {
    console.log(`✅ HTTP Server is listening on port ${PORT}`);
});