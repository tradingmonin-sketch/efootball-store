/* EFOOTBALL.STORE - fichier 2/3 : paiement, compte, tableau de bord */

/* ---------- Recharge ---------- */
function majConsigne(){
  const op=$('r-op').value;
  $('r-consigne').innerHTML='1️⃣ Envoie le montant par <b>'+esc(op)+'</b> au <b>'+esc(NUMEROS[op])+
    '</b><br>2️⃣ Garde l\'ID de la transaction (SMS ou reçu)<br>3️⃣ Écris-le ci-dessous : ton solde est crédité après vérification.';
}
function majMontants(){
  const v=parseInt($('r-montant').value,10);
  document.querySelectorAll('#montants button').forEach(b=>b.classList.toggle('on',parseInt(b.dataset.m,10)===v));
}
function choisirMontant(n){
  $('r-montant').value=n;
  majMontants();
}
function choisirOp(op){
  $('r-op').value=op;
  document.querySelectorAll('.meth[data-op]').forEach(b=>b.classList.toggle('on',b.dataset.op===op));
  majConsigne();
}
async function renderRecharge(){
  choisirOp($('r-op').value);
  $('r-liste').innerHTML='<p class="vide">Chargement…</p>';
  try{
    await majMoi();
    $('r-solde').textContent=F(S.me.solde);
    const l=await lireMes('recharges','uid');
    const st={attente:'⏳ En attente de vérification',valide:'✅ Créditée',refuse:'❌ Refusée'};
    $('r-liste').innerHTML=l.length?l.map(r=>`<div class="carte"><b>${F(r.montant)}</b> — ${esc(r.operateur)}
      <small>Réf : ${esc(r.ref)}</small><p>${st[r.statut]||esc(r.statut)}</p></div>`).join(''):'<p class="vide">Aucune recharge.</p>';
  }catch(e){$('r-liste').innerHTML=erreurHtml(e);}
}
async function demanderRecharge(){
  if(S.occupe)return;
  const op=$('r-op').value,montant=parseInt($('r-montant').value,10);
  const ref=$('r-ref').value.replace(/[^A-Za-z0-9]/g,'').toUpperCase();
  if(!(montant>=500))return alert('Montant minimum : 500 F');
  if(ref.length<6)return alert('Entre la référence de la transaction (6 caractères minimum)');
  S.occupe=true;
  try{
    await db.collection('recharges').doc(op+'_'+ref).set(
      {uid:S.me.uid,nom:S.me.nom,tel:S.me.tel,montant,operateur:op,ref,statut:'attente',created:Date.now()});
    $('r-montant').value='';$('r-ref').value='';
    majMontants();
    await show('recharge');
    pingAdmin('Bonjour, je viens de recharger '+F(montant)+' par '+op+'.\nRéférence : '+ref+'\nNom : '+S.me.nom+' ('+S.me.tel+')');
  }catch(e){
    alert(e.code==='permission-denied'?'Cette référence a déjà été utilisée (ou règles non publiées)':msgErr(e));
  }finally{S.occupe=false;}
}

/* ---------- Remboursement du solde ---------- */
async function renderRemb(){
  $('rb-liste').innerHTML='<p class="vide">Chargement…</p>';
  try{
    await majMoi();
    $('rb-solde').textContent=F(S.me.solde);
    const l=await lireMes('remboursements','uid');
    const st={attente:'⏳ En attente de l\'organisateur',valide:'✅ Remboursée : vérifie ton mobile money',refuse:'❌ Refusée'};
    $('rb-liste').innerHTML=l.length?l.map(r=>`<div class="carte"><b>${F(r.montant)}</b> — ${esc(r.operateur)}
      <small>Vers : ${esc(r.numero)}</small><p>${st[r.statut]||esc(r.statut)}</p></div>`).join(''):'<p class="vide">Aucune demande.</p>';
  }catch(e){$('rb-liste').innerHTML=erreurHtml(e);}
}
async function demanderRemb(){
  if(S.occupe)return;
  const montant=parseInt($('rb-montant').value,10),op=$('rb-op').value,num=$('rb-num').value.trim();
  if(!(montant>=500))return alert('Montant minimum : 500 F');
  if(!num)return alert('Entre le numéro qui recevra l\'argent');
  S.occupe=true;
  try{
    await majMoi();
    if(montant>S.me.solde)return alert('Montant supérieur à ton solde ('+F(S.me.solde)+')');
    await db.collection('remboursements').add(
      {uid:S.me.uid,nom:S.me.nom,montant:montant,operateur:op,numero:num,statut:'attente',created:Date.now()});
    $('rb-montant').value='';
    await show('remb');
    pingAdmin('Bonjour, je demande le remboursement de '+F(montant)+' de mon solde vers '+op+' '+num+'.\nNom : '+S.me.nom+' ('+S.me.tel+')');
  }catch(e){alert(msgErr(e));}
  finally{S.occupe=false;}
}

/* ---------- Achat avec séquestre ---------- */
async function acheter(id){
  if(S.occupe)return;
  S.occupe=true;
  try{
    const sn=await db.collection('annonces').doc(id).get();
    if(!sn.exists)return alert('Annonce introuvable');
    const a=sn.data();
    const prix=a.prixNum||0;
    if(a.vendu)return alert('Ce compte est déjà vendu ou réservé');
    if(a.type!=='Vente'||prix<=0)return alert('Cette annonce ne peut pas être achetée avec le solde');
    if(a.vendeurUid===S.me.uid)return alert('Tu ne peux pas acheter ton propre compte');
    await majMoi();
    if(S.me.solde<prix){
      alert('Solde insuffisant : il te manque '+F(prix-S.me.solde)+'. Recharge ton solde.');
      return show('recharge');
    }
    if(!confirm('Acheter « '+a.titre+' » pour '+F(prix)+' ?\n\nTon argent est bloqué (séquestre) jusqu\'à ce que tu confirmes avoir reçu le compte.'))return;
    const cid=id+'_'+S.me.uid;
    const b=db.batch();
    b.set(db.collection('commandes').doc(cid),{annonceId:id,titre:a.titre,prix,acheteurUid:S.me.uid,
      acheteurNom:S.me.nom,acheteurWa:S.me.tel,vendeurUid:a.vendeurUid,vendeurNom:a.vendeur,
      vendeurWa:a.wa,statut:'sequestre',created:Date.now()});
    b.update(db.collection('users').doc(S.me.uid),{solde:S.me.solde-prix,lastCmd:cid});
    b.update(db.collection('annonces').doc(id),{vendu:true});
    await b.commit();
    S.me.solde-=prix;
    majHeader();
    await show('achats');
    window.location.href='https://wa.me/'+canon(a.wa)+'?text='+encodeURIComponent(
      'Bonjour, j\'ai payé le compte « '+a.titre+' » ('+F(prix)+') sur le site. Merci de me donner les accès du compte.');
  }catch(e){alert(msgErr(e));}
  finally{S.occupe=false;}
}
function carteAchat(c){
  const st={sequestre:'🔒 Argent protégé : en attente de ta confirmation',confirme:'✅ Terminé',
    litige:'⚠️ Litige : l\'organisateur examine ton dossier',rembourse:'↩️ Remboursé sur ton solde'}[c.statut]||esc(c.statut);
  const b=c.statut==='sequestre'
    ?`<button onclick="confirmer('${esc(c.id)}')">✅ J'ai reçu mon compte</button>
      <button class="rouge" onclick="signaler('${esc(c.id)}')">⚠️ Signaler un problème</button>`:'';
  return `<div class="carte"><b>${esc(c.titre)}</b><p class="prix">${F(c.prix)}</p>
    <small>Vendeur : ${esc(c.vendeurNom)}</small><p>${st}</p>${b}
    <button class="sec" onclick="discuter('${esc(c.annonceId)}')">💬 Discuter</button>
    <a class="btn wa" href="https://wa.me/${canon(c.vendeurWa)}">WhatsApp</a></div>`;
}
async function renderAchats(){
  $('ach').innerHTML='<p class="vide">Chargement…</p>';
  try{
    const l=await lireMes('commandes','acheteurUid');
    $('ach').innerHTML=l.length?l.map(carteAchat).join(''):'<p class="vide">Tu n\'as encore rien acheté.</p>';
  }catch(e){$('ach').innerHTML=erreurHtml(e);}
}
async function confirmer(cid){
  if(!confirm('Confirme seulement si tu as bien reçu ET vérifié le compte.\nL\'argent sera versé au vendeur.'))return;
  try{await db.collection('commandes').doc(cid).update({statut:'confirme'});await renderAchats();}
  catch(e){alert(msgErr(e));}
}
async function signaler(cid){
  if(!confirm('Signaler un problème ? L\'argent reste bloqué et l\'organisateur examine ton dossier.'))return;
  try{
    await db.collection('commandes').doc(cid).update({statut:'litige'});
    await renderAchats();
    pingAdmin('Bonjour, j\'ai un problème avec ma commande '+cid+'. Mon nom : '+S.me.nom+' ('+S.me.tel+')');
  }catch(e){alert(msgErr(e));}
}

/* ---------- Retrait des gains ---------- */
async function renderRetrait(){
  $('rt-dispo').textContent='Chargement…';
  try{
    const g=await calculGains(S.me.uid);
    $('rt-dispo').innerHTML='Gains disponibles : <span class="prix">'+F(g.dispo)+'</span>';
  }catch(e){$('rt-dispo').innerHTML=erreurHtml(e);}
}
async function demanderRetrait(){
  if(S.occupe)return;
  const montant=parseInt($('rt-montant').value,10),op=$('rt-op').value,num=$('rt-num').value.trim();
  if(!(montant>0)||!num)return alert('Entre le montant et ton numéro');
  S.occupe=true;
  try{
    const g=await calculGains(S.me.uid);
    if(montant>g.dispo)return alert('Montant supérieur à tes gains disponibles ('+F(g.dispo)+')');
    await db.collection('retraits').add(
      {uid:S.me.uid,nom:S.me.nom,montant,operateur:op,numero:num,statut:'attente',created:Date.now()});
    $('rt-montant').value='';
    alert('Demande envoyée. L\'organisateur te paie après vérification.');
    await show('vendeur');
  }catch(e){alert(msgErr(e));}
  finally{S.occupe=false;}
}

/* ---------- Profil et espace vendeur ---------- */
function carteVente(c){
  const st={sequestre:'🔒 Argent bloqué : livre les accès du compte à l\'acheteur',
    confirme:'✅ Confirmée : tes gains sont crédités',litige:'⚠️ Litige : l\'organisateur examine',
    rembourse:'↩️ Remboursée à l\'acheteur'}[c.statut]||esc(c.statut);
  return `<div class="carte"><b>🧾 ${esc(c.titre)}</b>
  <p class="prix">${F(c.prix)} (tu reçois ${F(net(c.prix))})</p>
  <small>Acheteur : ${esc(c.acheteurNom)}</small><p>${st}</p>
  <a class="btn wa" href="https://wa.me/${canon(c.acheteurWa)}?text=${encodeURIComponent('Bonjour, voici les accès du compte « '+c.titre+' » :')}">💬 Contacter l'acheteur</a></div>`;
}
async function renderProfil(){
  $('pf-top').innerHTML='<p>Chargement…</p>';
  try{
    await majMoi();
    const [a,i]=await Promise.all([
      db.collection('annonces').where('vendeurUid','==',S.me.uid).get(),
      db.collection('inscriptions').where('uid','==',S.me.uid).get()]);
    const m=S.me;
    $('pf-top').innerHTML=`<div class="av">${esc((m.nom||'?').charAt(0).toUpperCase())}</div>
      <div><b>${esc(m.nom)}${isAdmin()?' 👑':''}</b><small>${isAdmin()?'Organisateur':'Membre'}</small><small>📞 ${esc(m.tel)}</small></div>`;
    $('pf-stats').innerHTML=`<div><b class="prix">${F(m.solde)}</b><small>Solde</small></div>
      <div><b>${a.size}</b><small>Annonce(s)</small></div><div><b>${i.size}</b><small>Tournoi(s)</small></div>`;
  }catch(e){$('pf-top').innerHTML=erreurHtml(e);}
}
async function renderVendeur(){
  $('mes').innerHTML='<p class="vide">Chargement…</p>';
  try{
    const [a,v,g]=await Promise.all([lireMes('annonces','vendeurUid'),lireMes('commandes','vendeurUid'),calculGains(S.me.uid)]);
    let h=`<div class="bloc"><div class="box2">
      <div><small>Gains disponibles</small><b>${F(g.dispo)}</b></div>
      <div><small>Commission site</small><b class="blanc">${Math.round(COMMISSION*100)} %</b></div></div>
      <div class="duo"><button onclick="show('retrait')">💵 Retirer mes gains</button><button class="sec2" onclick="show('publier')">+ Publier</button></div></div>`;
    h+='<h3 class="hh">Mes ventes</h3>'+(v.length?v.map(carteVente).join(''):'<p class="vide center">Aucune vente.</p>');
    h+='<h3 class="hh">Mes annonces publiées</h3>'+(a.length?a.map(x=>carte(x,true)).join(''):'<p class="vide center">Aucune annonce publiée pour le moment.</p>');
    $('mes').innerHTML=h;
  }catch(e){$('mes').innerHTML=erreurHtml(e);}
}

/* ---------- Tableau de bord organisateur ---------- */
async function renderAdmin(){
  $('ad').innerHTML='<p class="vide">Chargement…</p>';
  try{
    const [R,C,T]=await Promise.all([lire('recharges'),lire('commandes'),lire('retraits')]);
    const rec=R.filter(x=>x.statut==='attente');
    const cmd=C.filter(x=>x.statut==='litige'||x.statut==='sequestre')
      .sort((x,y)=>(y.statut==='litige')-(x.statut==='litige'));
    const ret=T.filter(x=>x.statut==='attente');
    const dispo={};
    await Promise.all([...new Set(ret.map(x=>x.uid))].map(async u=>{dispo[u]=(await calculGains(u)).dispo;}));
    const bloque=cmd.reduce((s,x)=>s+x.prix,0);

    let h=`<div class="carte" style="margin-top:12px">🔒 Argent en séquestre : <span class="prix">${F(bloque)}</span></div>`;

    h+='<h3>💳 Recharges à valider ('+rec.length+')</h3><small>Vérifie la transaction dans ton appli Wave / MTN / Orange avant de valider.</small>';
    h+=rec.length?rec.map(r=>`<div class="carte"><b>${esc(r.nom)}</b> — ${esc(r.tel)}
      <p>${esc(r.operateur)} • <span class="prix">${F(r.montant)}</span></p><small>Réf : ${esc(r.ref)}</small>
      <button onclick="validerRecharge('${esc(r.id)}')">✅ Valider et créditer</button>
      <button class="rouge" onclick="refuserRecharge('${esc(r.id)}')">❌ Refuser</button></div>`).join(''):'<p class="vide">Aucune.</p>';

    h+='<h3>🔒 Commandes en séquestre ('+cmd.length+')</h3>';
    h+=cmd.length?cmd.map(c=>`<div class="carte"><b>${esc(c.titre)}</b> — <span class="prix">${F(c.prix)}</span>
      <small>Acheteur : ${esc(c.acheteurNom)} (${esc(c.acheteurWa)})</small>
      <small>Vendeur : ${esc(c.vendeurNom)} (${esc(c.vendeurWa)})</small>
      <p>${c.statut==='litige'?'⚠️ LITIGE':'⏳ En attente de confirmation'}</p>
      <a class="btn wa" href="https://wa.me/${canon(c.acheteurWa)}">💬 Acheteur</a>
      <a class="btn wa" href="https://wa.me/${canon(c.vendeurWa)}">💬 Vendeur</a>
      <button onclick="liberer('${esc(c.id)}')">➡️ Libérer l'argent au vendeur</button>
      <button class="rouge" onclick="rembourser('${esc(c.id)}')">↩️ Rembourser l'acheteur</button></div>`).join(''):'<p class="vide">Aucune.</p>';

    h+='<h3>💸 Retraits de gains à payer ('+ret.length+')</h3>';
    h+=ret.length?ret.map(t=>{
      const reste=dispo[t.uid];
      return `<div class="carte"><b>${esc(t.nom)}</b>
      <p>Payer <span class="prix">${F(t.montant)}</span> par ${esc(t.operateur)} au ${esc(t.numero)}</p>
      <small>${reste<0?'🚨 Gains insuffisants ('+F(reste)+') : refuse !':'Gains restants après ce retrait : '+F(reste)}</small>
      <button onclick="validerRetrait('${esc(t.id)}')">✅ J'ai payé</button>
      <button class="rouge" onclick="refuserRetrait('${esc(t.id)}')">❌ Refuser</button></div>`;}).join(''):'<p class="vide">Aucun.</p>';

    $('ad').innerHTML=h;
  }catch(e){$('ad').innerHTML=erreurHtml(e);}
}
async function renderAdminRemb(){
  try{
    const l=(await lire('remboursements')).filter(x=>x.statut==='attente');
    const soldes={};
    await Promise.all([...new Set(l.map(x=>x.uid))].map(async u=>{
      const s=await db.collection('users').doc(u).get();
      soldes[u]=s.exists?(s.data().solde||0):0;
    }));
    $('ad2').innerHTML='<h3>↩️ Remboursements de solde ('+l.length+')</h3><small>Valider retire le montant du solde du joueur : envoie ensuite l\'argent.</small>'+
      (l.length?l.map(r=>{
        const ok=soldes[r.uid]>=r.montant;
        return `<div class="carte"><b>${esc(r.nom)}</b>
        <p>Rembourser <span class="prix">${F(r.montant)}</span> par ${esc(r.operateur)} au ${esc(r.numero)}</p>
        <small>${ok?'Solde actuel du joueur : '+F(soldes[r.uid]):'🚨 Solde insuffisant ('+F(soldes[r.uid])+') : refuse'}</small>
        <button onclick="validerRemb('${esc(r.id)}')">✅ Valider (retire du solde)</button>
        <button class="rouge" onclick="refuserRemb('${esc(r.id)}')">❌ Refuser</button></div>`;}).join(''):'<p class="vide">Aucune.</p>');
  }catch(e){$('ad2').innerHTML=erreurHtml(e);}
}
async function rafraichirAdmin(){
  await renderAdmin();
  await renderAdminRemb();
}
async function action(fn){
  if(S.occupe)return;
  S.occupe=true;
  try{await fn();await rafraichirAdmin();}
  catch(e){alert(e.message==='deja'?'Déjà traité':msgErr(e));}
  finally{S.occupe=false;}
}
function validerRecharge(id){
  return action(()=>db.runTransaction(async t=>{
    const rr=db.collection('recharges').doc(id),rs=await t.get(rr);
    if(!rs.exists||rs.data().statut!=='attente')throw new Error('deja');
    const ur=db.collection('users').doc(rs.data().uid),us=await t.get(ur);
    if(!us.exists)throw new Error('Utilisateur introuvable');
    t.update(ur,{solde:(us.data().solde||0)+rs.data().montant});
    t.update(rr,{statut:'valide',traite:Date.now()});
  }));
}
function refuserRecharge(id){
  return action(()=>db.collection('recharges').doc(id).update({statut:'refuse',traite:Date.now()}));
}
function liberer(id){
  if(!confirm('Verser l\'argent au vendeur ?'))return;
  action(()=>db.runTransaction(async t=>{
    const cr=db.collection('commandes').doc(id),cs=await t.get(cr);
    if(!cs.exists||!['sequestre','litige'].includes(cs.data().statut))throw new Error('deja');
    t.update(cr,{statut:'confirme'});
  }));
}
function rembourser(id){
  if(!confirm('Rembourser l\'acheteur sur son solde ?'))return;
  action(()=>db.runTransaction(async t=>{
    const cr=db.collection('commandes').doc(id),cs=await t.get(cr);
    if(!cs.exists||!['sequestre','litige'].includes(cs.data().statut))throw new Error('deja');
    const c=cs.data();
    const ur=db.collection('users').doc(c.acheteurUid),us=await t.get(ur);
    const ar=db.collection('annonces').doc(c.annonceId),an=await t.get(ar);
    t.update(ur,{solde:(us.data().solde||0)+c.prix});
    t.update(cr,{statut:'rembourse'});
    if(an.exists)t.update(ar,{vendu:false});
  }));
}
function validerRetrait(id){
  return action(()=>db.collection('retraits').doc(id).update({statut:'valide',traite:Date.now()}));
}
function refuserRetrait(id){
  return action(()=>db.collection('retraits').doc(id).update({statut:'refuse',traite:Date.now()}));
}
function validerRemb(id){
  if(!confirm('Le montant sera retiré du solde du joueur. Tu devras ensuite lui envoyer l\'argent. Valider ?'))return;
  let info='';
  action(async()=>{
    await db.runTransaction(async t=>{
      const rr=db.collection('remboursements').doc(id),rs=await t.get(rr);
      if(!rs.exists||rs.data().statut!=='attente')throw new Error('deja');
      const d=rs.data();
      const ur=db.collection('users').doc(d.uid),us=await t.get(ur);
      if(!us.exists)throw new Error('Utilisateur introuvable');
      const solde=us.data().solde||0;
      if(solde<d.montant)throw new Error('Solde insuffisant : refuse cette demande');
      t.update(ur,{solde:solde-d.montant});
      t.update(rr,{statut:'valide',traite:Date.now()});
      info='Solde retiré. Envoie maintenant '+F(d.montant)+' par '+d.operateur+' au '+d.numero+'.';
    });
    alert(info);
  });
}
function refuserRemb(id){
  return action(()=>db.collection('remboursements').doc(id).update({statut:'refuse',traite:Date.now()}));
}

pages.recharge=renderRecharge;
pages.remb=renderRemb;
pages.achats=renderAchats;
pages.retrait=renderRetrait;
pages.profil=renderProfil;
pages.vendeur=renderVendeur;
pages.admin=rafraichirAdmin;
// ===== FIN DE app2.js =====