
import crypto from 'crypto';
import { getServerEnv } from '@/lib/env';

const ALGORITHM = 'aes-256-gcm';

// Cached key buffer
let keyBuffer: Buffer | null = null;

function getKey(): Buffer {
    if (keyBuffer) return keyBuffer;

    const env = getServerEnv();
    const hexKey = env.DATA_ENCRYPTION_KEY;

    if (!hexKey) {
        throw new Error("DATA_ENCRYPTION_KEY is required but missing.");
    }

    // Ensure 32 bytes (64 hex characters)
    if (hexKey.length !== 64) {
        throw new Error(`DATA_ENCRYPTION_KEY must be a 64-character hex string (got ${hexKey.length})`);
    }

    keyBuffer = Buffer.from(hexKey, 'hex');
    return keyBuffer;
}

export function encrypt(text: string): string {
    if (!text) return text;

    const iv = crypto.randomBytes(12); // 96 bits for GCM
    const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Format: iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decrypt(text: string): string {
    if (!text) return text;

    const parts = text.split(':');
    if (parts.length !== 3) {
        throw new Error("Invalid encrypted text format");
    }

    const [ivHex, authTagHex, encryptedHex] = parts;

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);

    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
}
