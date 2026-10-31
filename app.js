/* EFOOTBALL.STORE - fichier 1/3 */
const firebaseConfig={
  apiKey:"AIzaSyCVdntcxtr6S44jPj3LpA_heyqH8xtJAyk",
  authDomain:"efootball-comptes.firebaseapp.com",
  projectId:"efootball-comptes",
  storageBucket:"efootball-comptes.firebasestorage.app",
  messagingSenderId:"20131745329",
  appId:"1:20131745329:web:71a6efe7f8c3e5c188cf10"
};
firebase.initializeApp(firebaseConfig);
const fa=firebase.auth();
const db=firebase.firestore();

/* ===== RÉGLAGES ===== */
const ADMIN_EMAIL='2250501771816@efootball.app';
const ADMIN_WA='2250501771816';
const COMMISSION=0.05; // 5 % gardés sur chaque vente (0 = aucune)
const NUMEROS={
  Wave:'+225 07 17 69 00 59',
  MTN:'+225 05 01 77 18 16',
  Orange:'+225 07 17 69 00 59'
};
/* ===================== */

const $=id=>document.getElementById(id);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');
const F=n=>Number(n||0).toLocaleString('fr-FR')+' F';
const net=p=>Math.floor(p*(1-COMMISSION));

function canon(t){
  let d=String(t).replace(/\D/g,'');
  if(d.startsWith('00'))d=d.slice(2);
  if(d.length===10)return '225'+d;
  if(d.length===9)return '221'+d;
  return d;
}
function msgErr(e){
  const c=e.code||'';
  if(c==='auth/email-already-in-use')return 'Numéro déjà inscrit : utilise « Connexion »';
  if(['auth/invalid-credential','auth/wrong-password','auth/user-not-found','auth/invalid-login-credentials'].includes(c))return 'Numéro ou mot de passe incorrect';
  if(c==='auth/weak-password')return 'Mot de passe trop court (6 caractères minimum)';
  if(c==='auth/network-request-failed')return 'Pas de connexion internet';
  if(c==='auth/too-many-requests')return 'Trop d\'essais, réessaie dans quelques minutes';
  if(c==='auth/operation-not-allowed')return 'La connexion E-mail/Mot de passe n\'est pas activée dans Firebase';
  if(c==='permission-denied')return 'Action refusée par les règles de sécurité (as-tu publié les nouvelles règles ?)';
  return 'Erreur : '+(c||e.message);
}
const erreurHtml=e=>'<p class="vide">'+esc(msgErr(e))+'</p>';

/* État partagé */
const S={me:null,pendingNom:null,compEnCours:null,pageCourante:'accueil',occupe:false,
  competitions:[],annonces:[],filtre:'',chat:null,chatAnnonce:null,unsub:null};
const pages={};
const isAdmin=()=>!!S.me&&S.me.email===ADMIN_EMAIL;
const NAVMAP={publier:'boutique',inscription:'competition',publiercomp:'competition',retrait:'vendeur',chat:'messages'};

function majHeader(){
  if(!S.me)return;
  $('top-solde').textContent=F(S.me.solde);
  $('top-av').textContent=(S.me.nom||'?').charAt(0).toUpperCase();
}
async function majMoi(){
  const s=await db.collection('users').doc(S.me.uid).get();
  if(s.exists)S.me={...S.me,...s.data()};
  majHeader();
}
function pingAdmin(msg){
  window.location.href='https://wa.me/'+ADMIN_WA+'?text='+encodeURIComponent(msg);
}

/* Navigation */
async function show(p){
  if((p==='publiercomp'||p==='admin')&&!isAdmin())return alert('Réservé à l\'organisateur');
  if(p!=='chat'&&S.unsub){S.unsub();S.unsub=null;}
  document.querySelectorAll('.page').forEach(e=>e.hidden=true);
  $(p).hidden=false;
  S.pageCourante=p;
  const co=!!S.me&&p!=='auth';
  $('nav').hidden=!co;
  $('top').hidden=!co;
  document.querySelectorAll('.admin-only').forEach(e=>e.hidden=!isAdmin());
  const n=NAVMAP[p]||p;
  document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('on',b.dataset.p===n));
  window.scrollTo(0,0);
  if(!S.me)return;
  majHeader();
  if(p==='publier'&&!$('a-wa').value)$('a-wa').value=S.me.tel;
  if(pages[p])await pages[p]();
}

/* Connexion */
fa.onAuthStateChanged(async u=>{
  if(!u){S.me=null;show('auth');return;}
  try{
    const ref=db.collection('users').doc(u.uid);
    let snap=await ref.get();
    if(!snap.exists){
      const tel=u.email.split('@')[0];
      await ref.set({nom:S.pendingNom||tel,tel:tel,solde:0,created:Date.now()});
      snap=await ref.get();
    }
    S.me={uid:u.uid,email:u.email,...snap.data()};
    S.pendingNom=null;
    show('accueil');
  }catch(e){
    alert(msgErr(e));
    fa.signOut();
  }
});
function voirMdp(v){['mdp','mdp2'].forEach(i=>$(i).type=v?'text':'password');}
async function inscrire(){
  const nom=$('nom').value.trim(),tel=canon($('tel').value),mdp=$('mdp').value.trim();
  if(!nom||tel.length<11)return alert('Entre ton nom et ton numéro complet');
  if(mdp.length<6)return alert('Mot de passe : 6 caractères minimum');
  if(mdp!==$('mdp2').value.trim())return alert('Les deux mots de passe sont différents');
  S.pendingNom=nom;
  try{await fa.createUserWithEmailAndPassword(tel+'@efootball.app',mdp);}
  catch(e){S.pendingNom=null;alert(msgErr(e));}
}
async function connecter(){
  const tel=canon($('tel').value),raw=$('mdp').value;
  if(!tel||!raw)return alert('Entre ton numéro et ton mot de passe');
  const essais=[...new Set([raw,raw.trim(),raw.trim()+' '])];
  let derniere;
  for(const m of essais){
    try{await fa.signInWithEmailAndPassword(tel+'@efootball.app',m);return;}
    catch(e){derniere=e;if(['auth/network-request-failed','auth/too-many-requests'].includes(e.code))break;}
  }
  alert(msgErr(derniere));
}
function deconnecter(){fa.signOut();}

/* Lecture des données */
async function lire(nom){
  const s=await db.collection(nom).orderBy('created','desc').get();
  return s.docs.map(d=>({...d.data(),id:d.id}));
}
async function lireMes(nom,champ){
  const s=await db.collection(nom).where(champ,'==',S.me.uid).get();
  return s.docs.map(d=>({...d.data(),id:d.id})).sort((x,y)=>y.created-x.created);
}
async function calculGains(uid){
  const [c,r]=await Promise.all([
    db.collection('commandes').where('vendeurUid','==',uid).get(),
    db.collection('retraits').where('uid','==',uid).get()]);
  const gains=c.docs.map(d=>d.data()).filter(x=>x.statut==='confirme').reduce((s,x)=>s+net(x.prix),0);
  const retire=r.docs.map(d=>d.data()).filter(x=>x.statut!=='refuse').reduce((s,x)=>s+x.montant,0);
  return {gains,retire,dispo:gains-retire};
}

/* Photos */
function redim(file){
  return new Promise(ok=>{
    const r=new FileReader();
    r.onerror=()=>ok(null);
    r.onload=e=>{
      const img=new Image();
      img.onerror=()=>ok(null);
      img.onload=()=>{
        const s=Math.min(1,700/Math.max(img.width,img.height));
        const c=document.createElement('canvas');
        c.width=img.width*s;c.height=img.height*s;
        c.getContext('2d').drawImage(img,0,0,c.width,c.height);
        ok(c.toDataURL('image/jpeg',0.6));
      };
      img.src=e.target.result;
    };
    r.readAsDataURL(file);
  });
}
async function apercu(inp,id){
  const el=$(id);
  if(!inp.files[0]){el.hidden=true;el.removeAttribute('src');return;}
  const data=await redim(inp.files[0]);
  if(!data){alert('Impossible de lire cette photo, essaie une autre.');inp.value='';return;}
  el.src=data;el.hidden=false;
}
function resetPhotos(){
  ['p1','p2','p3'].forEach(id=>{$(id).hidden=true;$(id).removeAttribute('src');});
  ['a-img1','a-img2','t-img'].forEach(id=>$(id).value='');
}

/* Publier */
async function publier(){
  if(S.occupe)return;
  const type=$('a-type').value;
  const prixTxt=$('a-prix').value.trim();
  let prixNum=0,prix=prixTxt;
  if(type==='Vente'){
    prixNum=parseInt(prixTxt.replace(/\D/g,''),10)||0;
    if(prixNum<500)return alert('Entre un prix en chiffres (500 F minimum)');
    prix=F(prixNum);
  }
  const a={type,titre:$('a-titre').value.trim(),prix,prixNum,desc:$('a-desc').value.trim(),
    wa:$('a-wa').value.trim(),vendeurUid:S.me.uid,vendeur:S.me.nom,vendu:false,created:Date.now(),
    imgs:['p1','p2'].filter(id=>!$(id).hidden).map(id=>$(id).src)};
  if(!a.titre||!a.wa)return alert('Titre et WhatsApp obligatoires');
  S.occupe=true;
  try{
    await db.collection('annonces').add(a);
    resetPhotos();
    ['a-titre','a-prix','a-desc'].forEach(id=>$(id).value='');
    await show('accueil');
  }catch(e){alert(msgErr(e));}
  S.occupe=false;
}
async function publierT(){
  if(!isAdmin())return alert('Seul l\'organisateur peut publier une compétition');
  if(S.occupe)return;
  const c={titre:$('t-titre').value.trim(),date:$('t-date').value.trim(),frais:$('t-frais').value.trim(),
    lot:$('t-lot').value.trim(),desc:$('t-desc').value.trim(),wa:$('t-wa').value.trim(),
    auteurUid:S.me.uid,vendeur:S.me.nom,created:Date.now(),
    img:$('p3').hidden?'':$('p3').src};
  if(!c.titre||!c.wa)return alert('Nom du tournoi et WhatsApp obligatoires');
  S.occupe=true;
  try{
    await db.collection('competitions').add(c);
    resetPhotos();
    ['t-titre','t-date','t-frais','t-lot','t-desc'].forEach(id=>$(id).value='');
    await show('competition');
  }catch(e){alert(msgErr(e));}
  S.occupe=false;
}
async function suppr(id){
  if(!confirm('Supprimer cette annonce ?'))return;
  try{await db.collection('annonces').doc(id).delete();await show(S.pageCourante);}
  catch(e){alert(msgErr(e));}
}
async function supprT(id){
  if(!confirm('Supprimer ce tournoi ?'))return;
  try{await db.collection('competitions').doc(id).delete();await show(S.pageCourante);}
  catch(e){alert(msgErr(e));}
}

/* Cartes */
function carte(a,perso){
  const vente=a.type==='Vente'&&a.prixNum>0;
  const mien=a.vendeurUid===S.me.uid;
  const ims=(a.imgs||[]).slice(0,2);
  const im=ims.length?`<div class="imgs${ims.length>1?' deux':''}">${ims.map(s=>`<img src="${esc(s)}">`).join('')}</div>`:'';
  const cherche=(!vente&&a.prix)?`<p class="d">🔁 Recherche : ${esc(a.prix)}</p>`:'';
  let acts='';
  if(a.vendu)acts='<p class="etat">✅ Vendu / réservé</p>';
  else if(!perso&&!mien){
    acts=(vente?`<button onclick="acheter('${esc(a.id)}')">Acheter</button>`:'')
      +`<button class="sec" onclick="discuter('${esc(a.id)}')">💬 Discuter</button>`
      +`<a class="btn wa" href="https://wa.me/${canon(a.wa)}?text=${encodeURIComponent('Bonjour, je suis intéressé par : '+a.titre)}">WhatsApp</a>`;
  }else if(!perso&&mien)acts='<p class="etat">📌 Ton annonce</p>';
  const alerte=(!vente&&!a.vendu&&!perso&&!mien)?'<p class="warn">⚠️ Les échanges ne sont pas protégés par le site</p>':'';
  const sup=(perso||isAdmin())?`<button class="rouge" onclick="suppr('${esc(a.id)}')">Supprimer</button>`:'';
  return `<div class="ann"><div class="ann-h"><span class="vt">${vente?'VENTE':'ÉCHANGE'}</span><span class="px">${vente?F(a.prixNum):'Échange'}</span></div>
  ${im}<h3>${esc(a.titre)}</h3><p class="d">${esc(a.desc)}</p>${cherche}<small>Par ${esc(a.vendeur)}</small>
  ${alerte}<div class="acts">${acts}</div>${sup}</div>`;
}
function carteT(c,perso){
  const ic=c.img?`<img src="${esc(c.img)}" class="apercu">`:'';
  const ins=perso?'':`<button class="bleu" onclick="ouvrirInscription('${esc(c.id)}')">S'inscrire</button>`;
  const sup=isAdmin()?`<button class="rouge" onclick="supprT('${esc(c.id)}')">Supprimer</button>`:'';
  return `<div class="tn"><h3>${esc(c.titre)}</h3>${ic}
  <p class="m">📅 ${esc(c.date)} • Frais: ${esc(c.frais)}</p>
  <p class="m">🎁 Récompense : <b class="prix">${esc(c.lot)}</b></p>
  <p class="d">${esc(c.desc)}</p>${ins}${sup}</div>`;
}

/* Pages */
function rendreUne(){
  const f=$('f-une').value;
  const l=(S.annonces||[]).filter(a=>!a.vendu&&(!f||a.type===f)).slice(0,6);
  $('feed').innerHTML=l.length?l.map(a=>carte(a,false)).join(''):'<p class="vide">Aucune annonce pour le moment.</p>';
}
async function renderAccueil(){
  $('feed').innerHTML='<p class="vide">Chargement…</p>';
  try{
    await majMoi();
    const [a,c]=await Promise.all([lire('annonces'),lire('competitions')]);
    S.annonces=a;S.competitions=c;
    rendreUne();
    $('feedt').innerHTML=c.length?c.slice(0,2).map(x=>carteT(x,false)).join(''):'<p class="vide">Aucun tournoi pour le moment.</p>';
  }catch(e){$('feed').innerHTML=erreurHtml(e);}
}
function filtrerBoutique(){
  const f=S.filtre||'';
  const l=(S.annonces||[]).filter(a=>!a.vendu&&(!f||a.type===f));
  $('liste').innerHTML=l.length?l.map(a=>carte(a,false)).join(''):'<p class="vide">Aucune annonce pour le moment.</p>';
}
async function renderBoutique(){
  $('liste').innerHTML='<p class="vide">Chargement…</p>';
  try{S.annonces=await lire('annonces');filtrerBoutique();}
  catch(e){$('liste').innerHTML=erreurHtml(e);}
}
function choisirFiltre(v){
  S.filtre=v;
  document.querySelectorAll('#boutique .chips button').forEach(b=>b.classList.toggle('on',(b.dataset.f||'')===v));
  filtrerBoutique();
}
async function renderCompet(){
  $('listecomp').innerHTML='<p class="vide">Chargement…</p>';
  try{
    S.competitions=await lire('competitions');
    $('listecomp').innerHTML=S.competitions.length
      ?S.competitions.map(c=>carteT(c,false)).join(''):'<p class="vide">Aucun tournoi pour le moment.</p>';
  }catch(e){$('listecomp').innerHTML=erreurHtml(e);}
}

pages.accueil=renderAccueil;
pages.boutique=renderBoutique;
pages.competition=renderCompet;
// ===== FIN DE app.js =====