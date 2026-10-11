/** Mirrors the pinned v1.5.13 acceptance profile in programs/teek/src/dbc_wire.rs.
 * Named account decoding is still done by the SDK; this guard prevents the
 * Studio advertising options the deployed program deliberately rejects. */
export function assertSupportedDbcProfile(data: Uint8Array) {
  const discriminator=[26,108,14,123,116,230,129,43];
  if(data.length!==1048||!discriminator.every((v,i)=>data[i]===v))throw Error('Unsupported DBC configuration layout.');
  const b=data.subarray(8);
  if(b[225]!==1||b[229]!==0||b[230]!==0||b[238]!==1||b[227]<6||b[227]>9||b[224]>1||b[226]>1)throw Error('This launch needs standard SPL assets, immutable token metadata and DAMM v2 migration.');
  if(Array.from(b.subarray(104,122)).some(v=>v!==0)||b[122]!==0||b[128]!==0||b[357]!==0)throw Error('This launch supports flat fees without dynamic fees or first-swap fee inspection.');
}
export async function configDigest(data: Uint8Array): Promise<string> {
  const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',Uint8Array.from(data)));
  return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}
