import {readFileSync,writeFileSync} from 'node:fs';
const base=new URL('../',import.meta.url),out=new URL('./',import.meta.url);
let scenes=JSON.parse(readFileSync(new URL('storyboard.json',base)));
for(const s of scenes){
 s.kind=s.kind.replace('Product scouting still','Captured product').replace('Planned product capture','Captured product').replace('Planned archived receipt','Archived receipt');
 if(s.id==='charter')s.vo='Then set the limits. Which contracts. Which functions. How much. Until when. Marque checks those limits before its signing path proceeds. This charter builder is on testnet. Its permission is spend-capped, time-limited, and revocable.';
 if(s.id==='receipt'){s.kind='Archived receipt / BSC mainnet read 56';s.vo='The receipt separates execution from quality. This run completed, but failed its health-factor test. Nothing moved on chain. Open the evidence behind the result.';}
 if(s.id==='find')s.vo='Find an agent for the job. Compare its interface, price and test record. Duplicate identities are grouped together. Our reference agents are labelled as ours.';
}
writeFileSync(new URL('scenes.json',out),JSON.stringify(scenes,null,2)+'\n');
let html=readFileSync(new URL('board.html',base),'utf8').replaceAll('url(assets/','url(../assets/').replaceAll('`assets/','`../assets/').replaceAll('src="assets/','src="../assets/').replaceAll('src="recon/','src="../recon/');
html=html.replace('Storyboard study / V0','Before you give it authority');
html=html.replace('</style>',`.bottom{height:145px;padding:20px 96px;background:transparent!important;border:0}.vo{display:none}.meta{font-size:20px}.meta #time{display:none}.footer-rule{display:none}.stage{height:700px}.source{bottom:0}.crop{height:545px}.caption-tag{display:none}.stamp{display:none}</style>`);
html=html.replace('</script>',`
const originalRender=window.renderBoard;
window.renderFilm=(s,i,scenes,facts)=>{
 originalRender(s,i,scenes,facts);
 document.querySelector('#vo').textContent='';document.querySelector('.top>div:last-child').textContent=s.kind;document.querySelector('.top>div:last-child').style.fontSize='17px';document.querySelector('.bottom').style.display='none';
 document.querySelector('#kind').textContent=s.kind+' / 9 September 2026';
 const source=document.querySelector('.source');if(source)source.innerHTML='<span>'+(['population','sample','zero','scope'].includes(s.id)?'Recorded evidence / 9 September 2026':'marque.trade')+'</span>';
 if(s.id==='test'){document.querySelector('.evidence-table .small').textContent='Published MCS-REB-1 checks';}
 if(s.id==='charter'){document.querySelector('#stage').innerHTML='<div class="product-head">Permission has an edge.</div><div class="crop"><img src="captures/charter.png" style="width:1900px;left:-86px;top:-400px"></div>';}
 if(s.id==='receipt'){document.querySelector('#stage').innerHTML='<div class="product-head">The run leaves a record.</div><div class="crop"><img src="captures/receipt.png" style="width:2200px;left:-245px;top:-650px"></div>';}
 if(s.id==='close')document.querySelector('.source').innerHTML='<span>Agents you can hold to account.</span>';
};
</script>`);
writeFileSync(new URL('film.html',out),html);
console.log('Prepared final scene definitions and clean film layouts');
