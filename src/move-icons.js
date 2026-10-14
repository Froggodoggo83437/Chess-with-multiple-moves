const types={book:['#cda575','Book'],great:['#6f9fc4','Great'],excellent:['#81b64c','Excellent'],best:['#96bc7b','Best'],inaccuracy:['#f7a64b','Inaccuracy'],mistake:['#f16e64','Mistake'],miss:['#f16e64','Missed win'],blunder:['#fa4934','Blunder'],unrated:['#6c7885','Not evaluated']};
const paths={book:'<path d="M7 7q5-2 9 1v18q-4-3-9-1zm18 0q-5-2-9 1v18q4-3 9-1z" fill="white"/>',excellent:'<path d="M10 15h-4v12h4zm3 12h10q2 0 3-3l2-9q0-2-3-2h-6l1-6q0-3-3-2l-4 10z" fill="white"/>',best:'<path d="m8 17 5 5 11-13" stroke="white" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',mistake:'<path d="m10 10 12 12m0-12L10 22" stroke="white" stroke-width="4" stroke-linecap="round"/>'};
export function moveIcon(type='unrated'){
 const [color,label]=types[type]||types.unrated;
 const badge=document.createElement('span');badge.className='move-icon';badge.dataset.quality=type;badge.title=label;badge.setAttribute('aria-label',label);
 let shape=paths[type]||(type==='miss'?paths.mistake:`<text x="16" y="23" text-anchor="middle" fill="white" font-family="system-ui,sans-serif" font-size="${type==='blunder'?20:25}" font-weight="900">${type==='great'?'!':type==='blunder'?'??':type==='inaccuracy'?'?':'·'}</text>`);
 badge.innerHTML=`<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="15" fill="${color}"/>${shape}</svg>`;
 return badge;
}
export const qualityName=type=>(types[type]||types.unrated)[1];
