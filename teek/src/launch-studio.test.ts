import { describe, expect, it } from 'vitest';
import { restoreDraftFields, studioReviewHtml } from './launch-studio';
import { assertSupportedDbcProfile } from '../../clients/dbc-policy';

describe('Launch Studio',()=>{
  it('restores only bounded string draft values and rejects unknown versions',()=>{
    expect(restoreDraftFields(JSON.stringify({version:1,fields:{name:'Example',amount:9,huge:'a'.repeat(3000)}}))).toEqual({name:'Example'});
    expect(()=>restoreDraftFields('{"version":2,"fields":{}}')).toThrow();
    expect(()=>restoreDraftFields('{"version":1,"fields":[]}')).toThrow();
  });
  it('escapes preview metadata and discloses the actual lifecycle',()=>{
    const html=studioReviewHtml({name:'<script>x</script>',symbol:'TEST',supply:'1,000,000,000',minimum:'0.1',cap:'0.6',minBid:'0.001',minOutput:'1',opens:'future',closes:'later',deadline:'latest',creatorFee:10,baseFeeBps:100,creatorLp:0,creatorLockedLp:0,partnerLp:100,partnerLockedLp:100,feeClaimer:'partner',leftoverReceiver:'recipient',quote:'quote',config:'config',threshold:'1,000'});
    expect(html).not.toContain('<script>');expect(html).toContain('&lt;script&gt;');expect(html).toContain('only if settlement succeeds');expect(html).toContain('Up to 24 wallets');
    expect(html).toContain('100 basis points');expect(html).toContain('0% / 100%');expect(html).toContain('Leftover token recipient: recipient');expect(html).toContain('Total token supply');expect(html).toContain('1,000,000,000');
  });
  it('blocks SDK-supported configurations outside the program’s pinned profile',()=>{
    const data=new Uint8Array(1048);data.set([26,108,14,123,116,230,129,43]);data[8+225]=1;data[8+238]=1;data[8+227]=6;
    expect(()=>assertSupportedDbcProfile(data)).not.toThrow();
    data[8+128]=1;expect(()=>assertSupportedDbcProfile(data)).toThrow('flat fees');data[8+128]=0;
    data[8+238]=0;expect(()=>assertSupportedDbcProfile(data)).toThrow('immutable');
    expect(()=>assertSupportedDbcProfile(data.subarray(0,100))).toThrow('layout');
  });
});
