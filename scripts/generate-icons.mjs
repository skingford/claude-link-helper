// Small original vector mark, rasterized with antialiasing. No graphics dependency.
import { writeFile, mkdir } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
const dir = new URL('../extension/icons/', import.meta.url);
await mkdir(dir, { recursive: true });
const paths = [ [[72,38],[82,38],[90,46],[90,60],[73,77],[59,77],[51,69]], [[56,51],[46,51],[38,59],[38,82],[46,90],[60,90],[70,80]], [[54,73],[75,52]] ];
const distance = (x,y,a,b) => { const dx=b[0]-a[0],dy=b[1]-a[1]; const t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy))); return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy); };
function pixel(x,y) {
  const dx=Math.max(Math.abs(x-64)-35,0),dy=Math.max(Math.abs(y-64)-35,0);
  if (Math.hypot(dx,dy)>25) return [0,0,0,0];
  for (const path of paths) for(let i=1;i<path.length;i++) if(distance(x,y,path[i-1],path[i])<4.5) return [168,79,52,255];
  return [247,239,226,255];
}
function crc32(buffer) { let crc=0xffffffff; for (const byte of buffer) { crc^=byte; for(let i=0;i<8;i++) crc=(crc>>>1)^((crc&1)?0xedb88320:0); } return (crc^0xffffffff)>>>0; }
function chunk(type,data) { const name=Buffer.from(type),size=Buffer.alloc(4),crc=Buffer.alloc(4); size.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([name,data]))); return Buffer.concat([size,name,data,crc]); }
for (const size of [16,32,48,128]) {
  const bytes=Buffer.alloc((size*4+1)*size);
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) { const sum=[0,0,0,0]; for(let a=0;a<4;a++) for(let b=0;b<4;b++) { const rgba=pixel((x+(a+.5)/4)*128/size,(y+(b+.5)/4)*128/size); rgba.forEach((v,i)=>sum[i]+=v); } for(let c=0;c<4;c++) bytes[y*(size*4+1)+1+x*4+c]=Math.round(sum[c]/16); }
  const head=Buffer.alloc(13); head.writeUInt32BE(size,0); head.writeUInt32BE(size,4); head[8]=8; head[9]=6;
  await writeFile(new URL(`${size}.png`,dir),Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',head),chunk('IDAT',deflateSync(bytes)),chunk('IEND',Buffer.alloc(0))]));
}
console.log('Generated four extension icons.');
