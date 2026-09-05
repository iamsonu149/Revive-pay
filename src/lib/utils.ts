export const cn = (...v:(string|false|undefined)[]) => v.filter(Boolean).join(' ');
export const label = (value:string) => value.replaceAll('_',' ').replace(/\b\w/g,x=>x.toUpperCase());
