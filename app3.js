/* EFOOTBALL.STORE - fichier 3/3 : tournois, messagerie, écran de connexion */

/* ---------- Inscription à un tournoi ---------- */
function ouvrirInscription(id){
  const c=S.competitions.find(x=>x.id===id);
  if(!c)return;
  S.compEnCours=id;
  $('i-titre').textContent='🏆 '+c.titre;
  $('i-info').textContent='📅 '+c.date+' • 💰 Frais : '+c.frais;
  $('i-pseudo').value='';$('i-efid').value='';$('i-wa').value=S.me.tel;
  show('inscription');
}
async function inscrireComp(){
  const c=S.competitions.find(x=>x.id===S.compEnCours);
  if(!c)return alert('Tournoi introuvable');
  const i={comp:c.id,uid:S.me.uid,nom:S.me.nom,pseudo:$('i-pseudo').value.trim(),
    efid:$('i-efid').value.trim(),wa:$('i-wa').value.trim(),created:Date.now()};
  if(!i.pseudo||!i.efid||!i.wa)return alert('Remplis tous les champs');
  if(S.occupe)return;
  S.occupe=true;
  try{
    const s=await db.collection('inscriptions').where('uid','==',S.me.uid).get();
    if(s.docs.some(d=>d.data().comp===c.id)){S.occupe=false;return alert('Tu es déjà inscrit à ce tournoi');}
    await db.collection('inscriptions').doc(c.id+'_'+S.me.uid).set(i);
    const msg="Bonjour, je m'inscris au tournoi : "+c.titre+
      "\nPseudo : "+i.pseudo+"\nID eFootball : "+i.efid+"\nMon WhatsApp : "+i.wa;
    await show('accueil');
    window.location.href='https://wa.me/'+canon(c.wa)+'?text='+encodeURIComponent(msg);
  }catch(e){alert(msgErr(e));}
  S.occupe=false;
}

/* ---------- Messagerie ---------- */
function ini(nom){return esc(String(nom||'?').trim().slice(0,2).toUpperCase());}
function heure(t){
  const d=new Date(t||0),j=new Date();
  return d.toDateString()===j.toDateString()
    ?d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})
    :d.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'});
}
async function discuter(aid){
  if(S.occupe)return;
  S.occupe=true;
  let cid=null;
  try{
    const sn=await db.collection('annonces').doc(aid).get();
    if(!sn.exists)return alert('Annonce introuvable');
    const a=sn.data();
    if(a.vendeurUid===S.me.uid)return alert('C\'est ton annonce');
    cid=aid+'_'+S.me.uid;
    const ref=db.collection('conversations').doc(cid);
    const c=await ref.get();
    if(!c.exists){
      await ref.set({annonceId:aid,titre:a.titre,vendeurUid:a.vendeurUid,vendeurNom:a.vendeur,
        acheteurUid:S.me.uid,acheteurNom:S.me.nom,participants:[a.vendeurUid,S.me.uid],
        dernierMsg:'',dernierAt:Date.now(),dernierUid:'',created:Date.now()});
    }
  }catch(e){cid=null;alert(msgErr(e));}
  finally{S.occupe=false;}
  if(cid)await ouvrirChat(cid);
}
function ouvrirChat(cid){
  S.chat=cid;
  return show('chat');
}
async function renderMessages(){
  $('conv').innerHTML='<p class="vide">Chargement…</p>';
  try{
    const s=await db.collection('conversations').where('participants','array-contains',S.me.uid).get();
    const l=s.docs.map(d=>({...d.data(),id:d.id})).sort((x,y)=>(y.dernierAt||0)-(x.dernierAt||0));
    $('conv').innerHTML=l.length?l.map(c=>{
      const autre=c.acheteurUid===S.me.uid?c.vendeurNom:c.acheteurNom;
      return `<div class="conv" onclick="ouvrirChat('${esc(c.id)}')"><div class="ini">${ini(autre)}</div>
        <div class="cv-t"><b>${esc(autre)}</b><em>${esc(c.titre)}</em><small>${esc(c.dernierMsg||'Nouvelle discussion')}</small></div>
        <span class="cv-h">${heure(c.dernierAt)}</span></div>`;
    }).join(''):'<p class="vide center">Aucune discussion. Appuie sur « Discuter » sur une annonce pour commencer.</p>';
  }catch(e){$('conv').innerHTML=erreurHtml(e);}
}
function bulle(m){
  const moi=m.uid===S.me.uid;
  return `<div class="bul ${moi?'moi':'lui'}">${esc(m.texte)}<small>${heure(m.created)}</small></div>`;
}
async function renderChat(){
  const cid=S.chat;
  $('ch-msgs').innerHTML='<p class="vide">Chargement…</p>';
  try{
    const cs=await db.collection('conversations').doc(cid).get();
    if(!cs.exists)return show('messages');
    const c=cs.data();
    const acheteur=c.acheteurUid===S.me.uid;
    S.chatAnnonce=c.annonceId;
    $('ch-nom-autre').textContent=acheteur?c.vendeurNom:c.acheteurNom;
    $('ch-annonce').textContent=c.titre;
    $('ch-achat').hidden=!acheteur;
    if(S.unsub){S.unsub();S.unsub=null;}
    S.unsub=db.collection('conversations').doc(cid).collection('messages').orderBy('created')
      .onSnapshot(snap=>{
        const l=snap.docs.map(d=>d.data());
        const box=$('ch-msgs');
        box.innerHTML=l.length?l.map(bulle).join(''):'<p class="vide">Écris le premier message 👋</p>';
        box.scrollTop=box.scrollHeight;
      },e=>{$('ch-msgs').innerHTML=erreurHtml(e);});
  }catch(e){$('ch-msgs').innerHTML=erreurHtml(e);}
}
async function envoyerMsg(){
  const t=$('ch-texte').value.trim().slice(0,1000);
  if(!t||!S.chat)return;
  $('ch-texte').value='';
  const ref=db.collection('conversations').doc(S.chat);
  const b=db.batch();
  b.set(ref.collection('messages').doc(),{uid:S.me.uid,texte:t,created:Date.now()});
  b.update(ref,{dernierMsg:t.slice(0,80),dernierAt:Date.now(),dernierUid:S.me.uid});
  try{await b.commit();}
  catch(e){alert(msgErr(e));$('ch-texte').value=t;}
}

/* ---------- Écran de connexion ---------- */
let modeA='login';
function modeAuth(m){
  modeA=m;
  const s=m==='signup';
  $('ch-nom').hidden=!s;
  $('ch-mdp2').hidden=!s;
  $('tab-login').className=s?'':'actif';
  $('tab-signup').className=s?'actif':'';
  $('btn-go').textContent=s?'Créer mon compte →':'Se connecter →';
  $('auth-sous').textContent=s?'Crée ton compte pour commencer':'Connecte-toi pour continuer';
}
function validerAuth(){return modeA==='signup'?inscrire():connecter();}
function basculeMdp(){
  const v=$('mdp').type==='password';
  voirMdp(v);
  $('oeil').textContent=v?'🙈':'👁️';
}

pages.messages=renderMessages;
pages.chat=renderChat;
// ===== FIN DE app3.js =====