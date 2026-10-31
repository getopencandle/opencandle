import {expect,it} from 'vitest';
import {captureNativeRegistryLookup} from '../../src/chart/native-registry-lookup';

// Pure method-observation tests, not registry/native/source permission. The
// actual replay proof still needs its genuine constructor/model/source tests.
it('reads a genuine own data method without invoking it or changing its descriptor',()=>{
 let calls=0;const registry={get(id:string){calls++;return id==='SYNTHETIC'?17:null;}},lookup=captureNativeRegistryLookup(registry)!,read=lookup.read(registry)!;
 expect(calls).toBe(0);expect(read.owner).toBe(registry);expect(read.descriptor).toEqual(Object.getOwnPropertyDescriptor(registry,'get'));expect(Reflect.apply(read.descriptor.value,registry,['SYNTHETIC'])).toBe(17);expect(calls).toBe(1);
});
it('reads an immediate class prototype method with its exact owner',()=>{
 class Registry{get(id:string){return id==='SYNTHETIC'?17:null;}}
 const registry=new Registry(),read=captureNativeRegistryLookup(registry)!.read(registry)!;
 expect(read.owner).toBe(Registry.prototype);expect(read.descriptor.value).toBe(Registry.prototype.get);expect(Reflect.apply(read.descriptor.value,registry,['SYNTHETIC'])).toBe(17);
});
it('refuses a farther method without visiting the deeper prototype',()=>{
 let reads=0;const far=new Proxy({get(){return 17;}},{getOwnPropertyDescriptor(target,key){reads++;return Reflect.getOwnPropertyDescriptor(target,key);},getPrototypeOf(target){reads++;return Reflect.getPrototypeOf(target);}}),middle=Object.create(far),registry=Object.create(middle);
 expect(captureNativeRegistryLookup(registry)).toBeNull();expect(reads).toBe(0);
});
it('refuses an own accessor without invoking its getter',()=>{
 let reads=0;const registry=Object.defineProperty({},'get',{get(){reads++;return()=>17;}});
 expect(captureNativeRegistryLookup(registry)).toBeNull();expect(reads).toBe(0);
});
it('refuses an inherited accessor without invoking its getter',()=>{
 let reads=0;const parent=Object.defineProperty({},'get',{get(){reads++;return()=>17;}}),registry=Object.create(parent);
 expect(captureNativeRegistryLookup(registry)).toBeNull();expect(reads).toBe(0);
});
it('refuses a deep inserted chain even though the original get owner and function remain reachable',()=>{
 class Registry{get(){return 17;}}
 const registry=new Registry(),lookup=captureNativeRegistryLookup(registry)!;let chain:object=Registry.prototype;
 for(let i=0;i<4096;i++)chain=Object.create(chain);Object.setPrototypeOf(registry,chain);
 expect(registry.get()).toBe(17);expect(lookup.read(registry)).toBeNull();Object.setPrototypeOf(registry,Registry.prototype);expect(lookup.read(registry)).toBeNull();
});
it('the actual get callback can insert a chain but the post-callback bounded read never visits it',()=>{
 let deeperReads=0;const registry=Object.create(null) as {get:()=>number},original={get(){const foreign=new Proxy(original,{getPrototypeOf(target){deeperReads++;return Reflect.getPrototypeOf(target);},getOwnPropertyDescriptor(target,key){deeperReads++;return Reflect.getOwnPropertyDescriptor(target,key);}});Object.setPrototypeOf(registry,foreign);return 17;}};
 Object.setPrototypeOf(registry,original);const lookup=captureNativeRegistryLookup(registry)!,before=lookup.read(registry)!;
 expect(Reflect.apply(before.descriptor.value,registry,[])).toBe(17);expect(lookup.read(registry)).toBeNull();expect(deeperReads).toBe(0);
});
it('refuses callback-time same-function descriptor changes',()=>{
 const registry={get(){Object.defineProperty(registry,'get',{writable:false});return 17;}},lookup=captureNativeRegistryLookup(registry)!,before=lookup.read(registry)!;
 expect(Reflect.apply(before.descriptor.value,registry,[])).toBe(17);expect(lookup.read(registry)).toBeNull();
});
it('refuses a new shadowing getter without invoking it',()=>{
 let reads=0;const parent={get(){return 17;}},registry=Object.create(parent),lookup=captureNativeRegistryLookup(registry)!;
 Object.defineProperty(registry,'get',{get(){reads++;return parent.get;}});expect(lookup.read(registry)).toBeNull();expect(reads).toBe(0);
});
it('a foreign receiver cannot borrow or retire another receiver observation',()=>{
 const registry={get(){return 17;}},lookup=captureNativeRegistryLookup(registry)!;
 expect(lookup.read({get:registry.get})).toBeNull();expect(lookup.read(registry)!.descriptor.value).toBe(registry.get);
});
it('changing a returned descriptor does not change the captured future method pins',()=>{
 const registry={get(){return 17;}},lookup=captureNativeRegistryLookup(registry)!,read=lookup.read(registry)!;
 read.descriptor.value=()=>999;expect(lookup.read(registry)!.descriptor.value).toBe(registry.get);expect(registry.get()).toBe(17);
});
it('supports an own data get on a null-prototype registry',()=>{
 const method=()=>17,registry=Object.assign(Object.create(null),{get:method}),lookup=captureNativeRegistryLookup(registry)!;
 expect(lookup.read(registry)!.owner).toBe(registry);expect(lookup.read(registry)!.descriptor.value).toBe(method);
});
