import {expect,it,vi} from 'vitest';

it('all consumers share one lazy service and final disposal cannot reset its budget or quarantine',async()=>{
 vi.resetModules();let made=0,closed=0;
 vi.doMock('../../src/vwap/client',()=>({createVwapClient:()=>{made++;return{request(){},dispose(){closed++;}};}}));
 try{const service=await import('../../src/vwap/application-client');expect(made).toBe(0);const chartA=service.applicationVwapClient(),chartB=service.applicationVwapClient(),alert=service.applicationVwapClient();expect(chartA).toBe(chartB);expect(chartB).toBe(alert);expect(made).toBe(1);service.disposeApplicationVwapClient();service.disposeApplicationVwapClient();expect(closed).toBe(1);expect(()=>service.applicationVwapClient()).toThrow('retired');expect(made).toBe(1);}finally{vi.doUnmock('../../src/vwap/client');vi.resetModules();}
});
it('disposing before first use constructs no worker client',async()=>{
 vi.resetModules();let made=0;vi.doMock('../../src/vwap/client',()=>({createVwapClient:()=>{made++;throw Error('Must stay lazy');}}));
 try{const service=await import('../../src/vwap/application-client');service.disposeApplicationVwapClient();expect(()=>service.applicationVwapClient()).toThrow('retired');expect(made).toBe(0);}finally{vi.doUnmock('../../src/vwap/client');vi.resetModules();}
});
