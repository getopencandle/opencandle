import type {Bar} from '../../src/domain/types';
/** Original piecewise-linear vector: an interior minor low has exactly five non-exceeding neighbors each side. */
export function syntheticTrendBars(large=false):Bar[]{
 const scale=large?5:1,knots=[[0,110],[20,90],[32,125],[44,109],[47,115],[50,110],[53,116],[56,108],[65,125],[80,95],[100,130],[120,120],[139,135]].map(([at,value])=>[at*scale,value]);
 if(large){knots[3][0]=224;knots[4][0]=225;knots[6][0]=275;knots[7][0]=276;}
 const out:Bar[]=[];let next=1;for(let i=0;i<=139*scale;i++){while(next<knots.length-1&&i>knots[next][0])next++;const [a,y]=knots[next-1],[b,z]=knots[next],close=y+(z-y)*(i-a)/(b-a);out.push({time:1700000000+i*60+(i>70*scale?172800:0),open:close,high:close+.25,low:close-.25,close,volume:100});}return out;
}
