async function boot(){
 const[cat,cfg,ses]=await Promise.allSettled([
  getJSON("/api/public/catalogo"),
  getJSON("/api/public/config"),
  getJSON("/api/auth/me")
 ]);

 if(cat.status=="fulfilled"&&cat.value&&Array.isArray(cat.value.P)&&cat.value.P.length){
  P=cat.value.P;
  CATS=cat.value.CATS||CATS;
  soComFotos();
 }

 if(cfg.status=="fulfilled"&&cfg.value)
  Object.assign(CFG,cfg.value);

 waNum=String(CFG.WHATSAPP_COMERCIAL||"").replace(/\D/g,"");

 if(ses.status=="fulfilled"&&ses.value&&ses.value.usuario){
  ME=ses.value.usuario;
  CSRF=ses.value.csrf;
 }

 const nc=$("#navConta");

 if(nc){
  if(ME){
   nc.textContent="Minha conta";
   nc.href=ME.tipo=="ADMIN"?"/admin":"/conta";
  }else{
   nc.textContent="Entrar";
   nc.href="/pages/login.html";
  }
 }

 paintFoot();

 const miss=P.filter(p=>!imgs(p.id).length).map(p=>p.n);
 if(miss.length)console.info("Fotos reais pendentes:",miss);

 route();
}

boot();
