import { PublicKey } from '@solana/web3.js';

/** Serializes localStorage identity generation and both spend-bearing sends
 * across tabs. Fail closed on browsers without cross-tab Web Locks. */
export async function withPublicationLock<T>(creator:PublicKey,locks:LockManager|undefined,task:()=>Promise<T>):Promise<T> {
  if(!locks?.request)throw Error('This browser cannot safely coordinate launch creation across tabs. Open Teek in a current browser.');
  return locks.request(`teek-publish-${creator.toBase58()}`,{mode:'exclusive'},task);
}
