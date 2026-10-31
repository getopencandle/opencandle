/** Short interval text for the header badge and the favorites toolbar: whole hours show as Nh (60m is 1h, 120m is 2h).
 * Interval ids, menu rows and saved state are unchanged; this is display only. */
export function shortIntervalText(id:string):string{
 const match=/^(\d+)m$/.exec(id);if(!match)return id;
 const minutes=Number(match[1]);return minutes>0&&minutes%60===0?minutes/60+'h':id;
}
