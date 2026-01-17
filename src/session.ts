import Low from 'lowdb';
import FileSync from 'lowdb/adapters/FileSync';
import CryptoJS from 'crypto-js';
import { config } from 'dotenv';

config();

const SECRET = process.env.ENCRYPTION_KEY || "default_secret";

// Database Schema
type Session = {
  chatId: number;
  encryptedKey: string;
  network: 'mainnet' | 'devnet';
  isActive: boolean;
};

type Schema = {
  sessions: Session[];
};

// Setup JSON DB
const adapter = new FileSync<Schema>('sessions.json');
const db = Low(adapter);

// Initialize DB if empty
db.defaults({ sessions: [] }).write();

export const SessionManager = {
  // Save a user's session
  saveSession: (chatId: number, privateKeyArray: number[], network: 'mainnet' | 'devnet') => {
    // 1. Encrypt the key
    const keyString = JSON.stringify(privateKeyArray);
    const encrypted = CryptoJS.AES.encrypt(keyString, SECRET).toString();

    // 2. Save or Update DB
    const existing = db.get('sessions').find({ chatId }).value();
    
    if (existing) {
      db.get('sessions').find({ chatId }).assign({ encryptedKey: encrypted, network, isActive: true }).write();
    } else {
      db.get('sessions').push({ chatId, encryptedKey: encrypted, network, isActive: true }).write();
    }
  },

  // Get and Decrypt Session
  getSession: (chatId: number) => {
    const session = db.get('sessions').find({ chatId }).value();
    if (!session || !session.isActive) return null;

    try {
      // Decrypt
      const bytes = CryptoJS.AES.decrypt(session.encryptedKey, SECRET);
      const decryptedData = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
      
      return {
        secretKey: Uint8Array.from(decryptedData),
        network: session.network
      };
    } catch (e) {
      console.error("Decryption failed", e);
      return null;
    }
  },

  // Deactivate (Logout)
  deactivate: (chatId: number) => {
    db.get('sessions').find({ chatId }).assign({ isActive: false }).write();
  }
};