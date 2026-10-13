import { put } from '@vercel/blob';
import { createHash } from 'node:crypto';
import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';

type UploadRequest = { method?: string; headers: { origin?: string; 'x-forwarded-for'?: string }; body?: Record<string, unknown> };
type UploadResponse = { setHeader(name: string, value: string): void; status(code: number): { json(body: Record<string, unknown>): unknown } };
const recentUploads=new Map<string,number[]>();

const MAX_BYTES = 512 * 1024;
const allowedOrigins = new Set([
  'https://useteek.xyz',
  'https://teek-navy.vercel.app',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
]);

function imageType(bytes: Buffer): 'image/png' | 'image/jpeg' | 'image/webp' | undefined {
  if (bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes.length > 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.length > 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
}

export default async function handler(req: UploadRequest, res: UploadResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  if (!allowedOrigins.has(String(req.headers.origin || ''))) return res.status(403).json({ error: 'Upload from the Teek app.' });
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.VERCEL_OIDC_TOKEN) return res.status(503).json({ error: 'Logo upload is not configured yet. You can use your own hosted metadata URL.' });
  try {
    const { wallet, name, symbol, timestamp, image, signature } = req.body ?? {};
    if (![wallet, name, symbol, image, signature].every(x => typeof x === 'string') || !Number.isSafeInteger(timestamp)) throw Error('Upload details are incomplete.');
    const input = { wallet: wallet as string, name: name as string, symbol: symbol as string, timestamp: timestamp as number, image: image as string, signature: signature as string };
    if (!input.name.trim() || !input.symbol.trim() || Buffer.byteLength(input.name) > 32 || Buffer.byteLength(input.symbol) > 10) throw Error('Check the token name and symbol.');
    if (Math.abs(Date.now() - input.timestamp) > 120_000) throw Error('Upload request expired. Try again.');
    if (input.image.length > Math.ceil(MAX_BYTES * 4 / 3) + 8 || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.image)) throw Error('Choose a PNG, JPEG or WebP image under 512 KB.');
    const bytes = Buffer.from(input.image, 'base64');
    const contentType = imageType(bytes);
    if (!contentType || bytes.length > MAX_BYTES) throw Error('Choose a PNG, JPEG or WebP image under 512 KB.');
    const key = new PublicKey(input.wallet);
    const digest = createHash('sha256').update(bytes).digest('hex');
    const message = `Teek token artwork\n${input.wallet}\n${input.timestamp}\n${input.name}\n${input.symbol}\n${digest}`;
    const sig = Buffer.from(input.signature, 'base64');
    if (sig.length !== 64 || !nacl.sign.detached.verify(new TextEncoder().encode(message), sig, key.toBytes())) throw Error('Wallet signature did not match this artwork.');
    const ip=String(req.headers['x-forwarded-for']||'unknown').split(',')[0].trim();
    const throttleKey=`${ip}:${input.wallet}`;
    const recent=(recentUploads.get(throttleKey)||[]).filter(time=>Date.now()-time<3_600_000);
    if(recent.length>=6)return res.status(429).json({error:'Too many logo uploads from this wallet. Try again later.'});
    recent.push(Date.now());recentUploads.set(throttleKey,recent);
    if(recentUploads.size>1000)for(const [key,times] of recentUploads)if(times.every(time=>Date.now()-time>=3_600_000))recentUploads.delete(key);
    const ext = contentType === 'image/png' ? 'png' : contentType === 'image/jpeg' ? 'jpg' : 'webp';
    const art = await put(`teek/tokens/${input.wallet}/${digest}.${ext}`, bytes, { access: 'public', addRandomSuffix: true, contentType });
    const metadata = { name: input.name.trim(), symbol: input.symbol.trim(), description: 'Token launched through Teek on Solana.', image: art.url };
    const manifest = await put(`teek/tokens/${input.wallet}/${digest}.json`, JSON.stringify(metadata), { access: 'public', addRandomSuffix: true, contentType: 'application/json' });
    if (Buffer.byteLength(manifest.url) > 200) throw Error('The metadata URL is too long for this launch.');
    return res.status(200).json({ uri: manifest.url, image: art.url });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Logo upload failed.' });
  }
}
