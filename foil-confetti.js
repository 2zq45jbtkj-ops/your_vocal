/* 22.11: зеркальная фольга «Салют волнами» на экране «Тест пройден».
   Три залпа сверху, затем фольга планирует, отскакивает от значка или садится
   на него. Значок неподвижен. Блеск приглушён на 80% (деликатное свечение). */
(function () {
  var COL = [[214,108,70],[78,150,196],[245,234,212],[228,170,110],[232,190,90]];
  var GLOW = 0.2; // доля прежнего блеска
  function rot(rx,ry,rz){var a=Math.cos(rx),b=Math.sin(rx),c=Math.cos(ry),d=Math.sin(ry),e=Math.cos(rz),f=Math.sin(rz);return[[c*e,-c*f,d],[a*f+b*d*e,a*e-b*d*f,-b*c],[b*f-a*d*e,b*e+a*d*f,a*c]];}
  function ap(M,p){return[M[0][0]*p[0]+M[0][1]*p[1]+M[0][2]*p[2],M[1][0]*p[0]+M[1][1]*p[1]+M[1][2]*p[2],M[2][0]*p[0]+M[2][1]*p[1]+M[2][2]*p[2]];}
  function env(n,c){var s=n[2]<0?-1:1,r=[n[0]*s,n[1]*s,n[2]*s],u=-r[1]*.8-r[0]*.35+.25,band=Math.sin(u*9)*.5+.5,k=.32+1.15*Math.pow(band,1.8),sp=Math.pow(Math.max(0,u),12)*1.3;
    return{c:c.map(function(x){return Math.min(255,x*k+255*(sp+.1*band)*GLOW);}),sp:sp};}
  function rgb(a){return'rgb('+Math.round(a[0])+','+Math.round(a[1])+','+Math.round(a[2])+')';}

  /* opts.loop — бесконечные залпы в разных местах экрана (22.11, экран
     «Урок пройден с первого раза»); opts.avoid — элементы, над которыми
     фольга не рисуется, чтобы текст и кнопка всегда читались. */
  window.playFoilConfetti = function (screen, opts) {
    opts = opts || {};
    if (!screen || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)) return;
    var badge = screen.querySelector(".result-badge"), AV = [], FR = null;
    var bk = document.createElement("canvas"), cv = document.createElement("canvas");
    bk.className = "foil-cv foil-back"; cv.className = "foil-cv foil-front";
    screen.insertBefore(bk, screen.firstChild); screen.appendChild(cv);
    /* 22.11/25.11: слой «за стеклом» — фольга под карточкой рисуется сюда,
       а размывает её CSS-фильтр самого холста (кадр в кадр, без отставания,
       в отличие от backdrop-filter). */
    var fk = null, kx = null;
    if (opts.frost) { fk = document.createElement("canvas"); fk.className = "foil-cv foil-back"; fk.style.filter = "blur(" + (opts.frostBlur || 5) + "px)"; bk.after(fk); kx = fk.getContext("2d"); }
    var D = window.devicePixelRatio || 1, W, H, BC, bx = bk.getContext("2d"), fx = cv.getContext("2d");
    function rs(){W=screen.clientWidth;H=screen.clientHeight;[bk,cv,fk].forEach(function(c){if(c){c.width=W*D;c.height=H*D;}});fx.setTransform(D,0,0,D,0,0);if(kx)kx.setTransform(D,0,0,D,0,0);bx.setTransform(D,0,0,D,0,0);
      var a=screen.getBoundingClientRect(),b=badge.getBoundingClientRect();BC={x:b.left-a.left+b.width/2,y:b.top-a.top+b.height/2,r:b.width/2};
      if(opts.frost){var fr=opts.frost.getBoundingClientRect();FR={x:fr.left-a.left,y:fr.top-a.top,w:fr.width,h:fr.height};
        fk.style.clipPath="inset("+FR.y+"px "+(W-FR.x-FR.w)+"px "+(H-FR.y-FR.h)+"px "+FR.x+"px round 28px)";}
      if(opts.avoid){BC={x:-9999,y:-9999,r:1};AV=opts.avoid.filter(Boolean).map(function(el){var r=el.getBoundingClientRect();return{x:r.left-a.left-18,y:r.top-a.top-18,w:r.width+36,h:r.height+36};});}}
    rs();
    if (opts.avoid) window.addEventListener("resize", rs);
    function clipOut(cx){if(!AV.length)return;cx.save();cx.beginPath();cx.rect(0,0,W,H);AV.forEach(function(r){var R=Math.min(28,r.h/2);cx.moveTo(r.x+R,r.y);cx.arcTo(r.x,r.y,r.x,r.y+r.h,R);cx.arcTo(r.x,r.y+r.h,r.x+r.w,r.y+r.h,R);cx.arcTo(r.x+r.w,r.y+r.h,r.x+r.w,r.y,R);cx.arcTo(r.x+r.w,r.y,r.x,r.y,R);cx.closePath();});cx.clip("evenodd");}
    function freeSpot(){for(var k=0;k<20;k++){var x=W*(.12+Math.random()*.76),y=H*(.06+Math.random()*.7),ok=AV.every(function(r){return x<r.x-20||x>r.x+r.w+20||y<r.y-20||y>r.y+r.h+20;});if(ok)return[x,y];}return[W*(.15+Math.random()*.7),H*.08];}
    var nextAt=60;
    var P=[],T=0;
    function mkPiece(x,y,ang,spd,i){var z=.6+Math.random()*.9;return{x:x,y:y,z:z,front:!opts.behind&&z>=.95,vx:Math.cos(ang)*spd,vy:Math.sin(ang)*spd,rx:Math.random()*6.28,ry:Math.random()*6.28,rz:Math.random()*6.28,wx:(Math.random()-.5)*.3,wy:(Math.random()-.5)*.3,wz:(Math.random()-.5)*.08,ph:Math.random()*6.28,fr:.03+Math.random()*.035,sw:.7+Math.random()*1.3,w:(6+Math.random()*5)*z,h:(10+Math.random()*7)*z,c:COL[i%COL.length],land:0,hit:0,cv:.35+Math.random()*.5};}
    function burst(x,y,n,s0,s1){for(var i=0;i<n;i++)P.push(mkPiece(x+(Math.random()-.5)*10,y,Math.random()*6.28,s0+Math.random()*(s1-s0),P.length));}
    var Q=[[0,function(){burst(W*.25,H*.18,45,4,9);}],[18,function(){burst(W*.75,H*.14,45,4,9);}],[36,function(){burst(W*.5,H*.1,55,5,10);}]];
    function drawP(cx,p,M){var w=p.w/2,h=p.h/2,N=6,bend=p.cv*Math.sin(p.ph*1.2),pts=[],ns=[],mx=0,i;
      for(i=0;i<=N;i++){var s=i/N*2-1,y=s*h,z=bend*s*s*h*.6,dz=bend*2*s*.6,A=ap(M,[-w,y,z]),B=ap(M,[w,y,z]);pts.push([[p.x+A[0],p.y+A[1]],[p.x+B[0],p.y+B[1]]]);var nl=Math.hypot(dz,1);ns.push(ap(M,[0,-dz/nl,1/nl]));}
      var E=ns.map(function(n){return env(n,p.c);});
      for(i=0;i<N;i++){var a=pts[i],b=pts[i+1];mx=Math.max(mx,E[i].sp);var g=cx.createLinearGradient((a[0][0]+a[1][0])/2,(a[0][1]+a[1][1])/2,(b[0][0]+b[1][0])/2,(b[0][1]+b[1][1])/2);g.addColorStop(0,rgb(E[i].c));g.addColorStop(1,rgb(E[i+1].c));cx.fillStyle=g;cx.beginPath();cx.moveTo(a[0][0],a[0][1]);cx.lineTo(a[1][0],a[1][1]);cx.lineTo(b[1][0],b[1][1]);cx.lineTo(b[0][0],b[0][1]);cx.closePath();cx.fill();cx.strokeStyle=cx.fillStyle;cx.lineWidth=.6;cx.stroke();}
      if(mx>.55&&p.front){var L=(6+10*mx)*p.z*.6,al=cx.globalAlpha;cx.globalAlpha=al*Math.min(1,(mx-.55)*2.2)*GLOW;cx.strokeStyle='#fff';cx.lineWidth=1;cx.beginPath();cx.moveTo(p.x-L,p.y);cx.lineTo(p.x+L,p.y);cx.moveTo(p.x,p.y-L);cx.lineTo(p.x,p.y+L);cx.stroke();cx.globalAlpha=al;}}
    function step(){
      if(!cv.isConnected){window.removeEventListener("resize",rs);return;}
      T++;while(Q.length&&Q[0][0]<=T)Q.shift()[1]();
      if(opts.loop&&T>=nextAt){var sp=freeSpot();burst(sp[0],sp[1],56+Math.round(Math.random()*32),3,7);nextAt=T+45+Math.round(Math.random()*40);
        if(P.length>900)P=P.filter(function(p){return p.y<=H+60;});}
      fx.clearRect(0,0,W,H);bx.clearRect(0,0,W,H);if(kx){kx.clearRect(0,0,W,H);bx.save();bx.beginPath();bx.rect(0,0,W,H);bx.roundRect(FR.x,FR.y,FR.w,FR.h,28);bx.clip("evenodd");}if(!opts.behind){clipOut(fx);clipOut(bx);}var alive=Q.length+(opts.loop?1:0),wind=Math.sin(T*.008)*.3+Math.sin(T*.021)*.12;
      for(var k=0;k<P.length;k++){var p=P[k];if(p.y>H+60)continue;alive++;var cx=p.front?fx:bx;
        if(p.land>0){p.land--;p.y+=.2;p.x+=(p.x-BC.x)*.004;p.rx*=.93;p.ry*=.93;p.ph+=.01;if(p.land===0||Math.hypot(p.x-BC.x,p.y-BC.y)>BC.r-2){p.land=0;p.vy=.6;p.vx=(p.x-BC.x)*.03;p.wx=(Math.random()-.5)*.2;p.wy=(Math.random()-.5)*.2;}}
        else{var sp=Math.hypot(p.vx,p.vy);p.vx*=.955;p.vy=p.vy*.955+.16;var term=.8+.6*p.z;if(p.vy>term)p.vy+=(term-p.vy)*.07;p.ph+=p.fr;var calm=Math.max(0,1-sp/5),fl=Math.sin(p.ph)*p.sw*p.z*calm;p.x+=p.vx+fl+wind*p.z*calm;p.y+=p.vy+Math.abs(Math.cos(p.ph))*.2*calm;var spin=1+Math.min(3,sp*.35);p.rx+=p.wx*spin+Math.cos(p.ph)*.03;p.ry+=p.wy*spin;p.rz+=p.wz*spin+fl*.01;
          if(p.front&&p.vy>0&&p.hit<=0){var dx=p.x-BC.x,dy=p.y-BC.y,d=Math.hypot(dx,dy),rr=BC.r+Math.max(p.w,p.h)*.35;
            if(d<BC.r*.82&&dy<-BC.r*.1&&Math.random()<.5){p.land=70+Math.random()*80;p.hit=999;}
            else if(d<rr){var nx=dx/d,ny=dy/d,vn=p.vx*nx+p.vy*ny;if(vn<0){p.vx-=1.5*vn*nx;p.vy-=1.5*vn*ny;p.vx+=nx*1.1;p.vy=Math.min(p.vy,ny*2);p.x=BC.x+nx*rr;p.y=BC.y+ny*rr;p.wx+=(Math.random()-.5)*.4;p.wy+=(Math.random()-.5)*.4;p.hit=20;}}}
          if(p.hit>0&&p.hit<999)p.hit--;}
        var fade=Math.min(1,(H+60-p.y)/120)*(p.front||opts.behind?1:.55+.4*p.z);var inF=kx&&!p.front&&p.x>FR.x-40&&p.x<FR.x+FR.w+40&&p.y>FR.y-40&&p.y<FR.y+FR.h+40;cx.globalAlpha=fade;cx.filter=p.z>1.35?'blur('+((p.z-1.35)*7).toFixed(1)+'px)':p.z<.75?'blur(0.7px)':'none';
        if(p.front&&Math.hypot(p.x-BC.x,p.y-BC.y)<BC.r+14){fx.save();fx.beginPath();fx.arc(BC.x,BC.y,BC.r,0,7);fx.clip();fx.globalAlpha=p.land>0?.42:.22;fx.fillStyle='#000';fx.filter='blur(3px)';fx.beginPath();fx.ellipse(p.x+4,p.y+6,p.w*.45,p.h*.35,p.rz,0,7);fx.fill();fx.restore();fx.globalAlpha=fade;fx.filter=cx.filter;}
        var M=rot(p.rx,p.ry,p.rz);drawP(cx,p,M);if(inF){kx.globalAlpha=fade;drawP(kx,p,M);}}
      fx.filter=bx.filter='none';fx.globalAlpha=bx.globalAlpha=1;if(kx)bx.restore();if(AV.length&&!opts.behind){fx.restore();bx.restore();}
      if(alive)requestAnimationFrame(step);else{bk.remove();cv.remove();if(fk)fk.remove();}}
    requestAnimationFrame(step);
  };
})();
