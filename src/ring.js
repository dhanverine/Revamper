// Ring markup and behaviour. Two designs: "reactor" and "console".
export const C=300,N=6,STEP=Math.PI*2/N,GAP=0.035,RI=92,RO=172;
export const ACTIONS=[
 {n:"Convert",sub:"format to format",g:"M-7 -3H5M2 -6L5 -3L2 0M7 4H-5M-2 1L-5 4L-2 7"},
 {n:"Compress",sub:"smaller, same look",g:"M-7 -7L-2 -2M-2 -6V-2H-6M7 7L2 2M2 6V2H6"},
 {n:"Crop",sub:"frame and ratio",g:"M-4 -8V4H8M-8 -4H4V8"},
 {n:"Trim",sub:"set in and out",g:"M-7 -4L7 5M-7 5L7 -4"},
 {n:"Merge",sub:"photos, video, audio",g:"M-7 -7L0 0M7 -7L0 0M0 0V8"},
 {n:"Extract",sub:"zip files, video audio",g:"M0 -8V3M-4 -1L0 3L4 -1M-7 7H7"}
];
const f=n=>(+n).toFixed(2), P=(r,a)=>[C+r*Math.cos(a),C+r*Math.sin(a)], D=d=>d*Math.PI/180;
const sector=(ri,ro,a0,a1)=>{const[x0,y0]=P(ro,a0),[x1,y1]=P(ro,a1),[x2,y2]=P(ri,a1),[x3,y3]=P(ri,a0);return `M${f(x0)} ${f(y0)}A${ro} ${ro} 0 0 1 ${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}A${ri} ${ri} 0 0 0 ${f(x3)} ${f(y3)}Z`};
const arc=(r,a0,a1)=>{const[x0,y0]=P(r,a0),[x1,y1]=P(r,a1);return `M${f(x0)} ${f(y0)}A${r} ${r} 0 ${(a1-a0)>Math.PI?1:0} 1 ${f(x1)} ${f(y1)}`};
const ang=i=>[-Math.PI/2+i*STEP+GAP,-Math.PI/2+(i+1)*STEP-GAP];
function ticks(r,count,len,major){let m='',M='';for(let k=0;k<count;k++){const a=k/count*Math.PI*2,big=k%major===0;const[x0,y0]=P(r,a),[x1,y1]=P(r+(big?len*2:len),a);const seg=`M${f(x0)} ${f(y0)}L${f(x1)} ${f(y1)}`;if(big)M+=seg;else m+=seg}return `<path d="${m}" stroke="var(--dim)" stroke-width="1" fill="none"/><path d="${M}" stroke="var(--line)" stroke-width="1.4" fill="none"/>`}
function segArcs(r,spans,w,op){return spans.map(([a,b],i)=>`<path d="${arc(r,D(a),D(b))}" stroke="var(--line)" stroke-width="${w}" fill="none" opacity="${op[i%op.length]}" stroke-linecap="butt"/>`).join('')}
function slices(){return ACTIONS.map((a,i)=>{const[a0,a1]=ang(i),mid=(a0+a1)/2,[lx,ly]=P(132,mid),[ix,iy]=P(161,a0+.2),[t0x,t0y]=P(RO+8,mid),[t1x,t1y]=P(RO+22,mid);
 return `<g class="s sl" data-i="${i}" style="--i:${i}"><path class="glow" d="${sector(RI,RO,a0,a1)}"/><path class="body" d="${sector(RI,RO,a0,a1)}"/><path class="sel" d="${arc(RO+9,a0+.05,a1-.05)}"/><path class="tick" d="M${f(t0x)} ${f(t0y)}L${f(t1x)} ${f(t1y)}"/><text class="idx" x="${f(ix)}" y="${f(iy+3)}">0${i+1}</text><g transform="translate(${f(lx)} ${f(ly-14)}) scale(2.2)"><path class="gl" d="${a.g}"/></g><text class="lab" x="${f(lx)}" y="${f(ly+25)}">${a.n}</text></g>`}).join('')}
function hub(hex){const shape=hex?`<polygon points="${[0,1,2,3,4,5].map(k=>P(82,D(30+k*60)).map(f).join(',')).join(' ')}" fill="var(--hubbg)" stroke="var(--line)" stroke-width="1.4"/>`:`<circle cx="${C}" cy="${C}" r="82" fill="var(--hubbg)" stroke="var(--line)" stroke-width="1.4"/>`;
 return `${shape}<circle cx="${C}" cy="${C}" r="68" fill="none" stroke="var(--dim)" stroke-width="1" stroke-dasharray="2 5"/><path d="M${C-40} ${C-34}H${C-26}M${C+26} ${C-34}H${C+40}M${C-40} ${C+34}H${C-26}M${C+26} ${C+34}H${C+40}" stroke="var(--dim)" stroke-width="1" fill="none"/><text class="rd hubTop" x="${C}" y="${C-36}" text-anchor="middle">READY</text><text class="hubT" x="${C}" y="${C+4}">DROP</text><text class="hubS" x="${C}" y="${C+22}">pick an action</text>`}
function brackets(){const o=22,l=26,s=600-o;return `<path d="M${o} ${o+l}V${o}H${o+l}M${s-l} ${o}H${s}V${o+l}M${s} ${s-l}V${s}H${s-l}M${o+l} ${s}H${o}V${s-l}" stroke="var(--accent)" stroke-width="1.6" fill="none"/>`}
function readouts(){return `<g class="rd"><text x="30" y="${C-4}">INPUT</text><text x="30" y="${C+10}" style="fill:var(--line)">FILES</text><path d="M30 ${C+20}H110" stroke="var(--dim)"/><text x="570" y="${C-4}" text-anchor="end">ENGINE</text><text x="570" y="${C+10}" text-anchor="end" style="fill:var(--line)">ON DEVICE</text><path d="M490 ${C+20}H570" stroke="var(--dim)"/></g><path d="M118 ${C}H${C-RO-30}M${C+RO+30} ${C}H482" stroke="var(--dim)" stroke-width="1" stroke-dasharray="3 4" fill="none"/>`}
function burst(){let s='';for(let k=0;k<48;k++){const a=k/48*Math.PI*2,[x,y]=P(262,a);s+=`<circle cx="${f(x)}" cy="${f(y)}" r="${k%4===0?2.4:1.3}" fill="var(--line)" opacity="${k%4===0?.8:.4}"/>`}return s}
export function build(design){
 const v=design==='console'?3:2;
 const sweep=v===3?`<div class="sweep"></div>`:'';
 let spinBack='',staticBack='',spinMid='',staticMid='';
 if(v===2){spinBack=burst();staticBack=`<circle cx="${C}" cy="${C}" r="238" fill="none" stroke="var(--dim)" stroke-width="1"/>`;
  spinMid=segArcs(208,[[-84,-24],[-12,34],[58,142],[168,236]],13,[.95,.55,.8]);staticMid=`<circle cx="${C}" cy="${C}" r="196" fill="none" stroke="var(--dim)"/>`}
 if(v===3){spinBack=ticks(252,96,4,6);staticBack=`<circle cx="${C}" cy="${C}" r="272" fill="none" stroke="var(--faint)"/>${brackets()}${readouts()}`;
  spinMid=segArcs(214,[[-160,-100],[-90,-30],[-10,50],[70,130],[150,200]],2.2,[.9,.45,.7])}
 const svg=(inner)=>`<svg viewBox="0 0 600 600">${inner}</svg>`;
 // Every moving part sits in its own layer, so the browser moves it on the GPU instead of repainting vectors.
 return `<div class="ring paused"><div class="tilt">
  <div class="layer" style="--z:-52px"><div class="lin" style="--i:0">${svg(staticBack)}</div></div>
  <div class="layer" style="--z:-52px"><div class="lin" style="--i:0"><div class="spinw">${svg(spinBack)}</div></div></div>
  <div class="layer" style="--z:-26px"><div class="lin" style="--i:1">${sweep}${svg(staticMid)}</div></div>
  <div class="layer" style="--z:-26px"><div class="lin" style="--i:1"><div class="spinw rev">${svg(spinMid)}</div></div></div>
  <div class="layer" style="--z:0px">${svg(slices())}</div>
  <div class="layer" style="--z:42px"><div class="lin" style="--i:3">${svg(hub(v===2))}</div></div>
 </div></div>`}

export function sliceAt(dx, dy) {
  const d = Math.hypot(dx, dy);
  if (d < RI - 6 || d > RO + 24) return -1;
  let a = Math.atan2(dy, dx) + Math.PI / 2;
  if (a < 0) a += Math.PI * 2;
  return Math.floor(a / STEP) % N;
}

const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp = (v) => Math.max(-1, Math.min(1, v));

export class RingView {
  constructor(stage, design) {
    this.stage = stage;
    this.design = design;
    this.tx = this.ty = this.cx = this.cy = 0;
    this.raf = 0;
    this.mount();
  }
  mount() {
    this.stage.innerHTML = build(this.design);
    this.ring = this.stage.querySelector(".ring");
    this.tilt = this.ring.querySelector(".tilt");
    this.slices = [...this.ring.querySelectorAll(".s")];
    this.hubT = this.ring.querySelector(".hubT");
    this.hubS = this.ring.querySelector(".hubS");
    this.hubTop = this.ring.querySelector(".hubTop");
    this.hot = -1;
    if (this.paused === false) this.ring.classList.remove("paused");
  }
  setDesign(design) {
    if (design === this.design) return;
    this.design = design;
    this.mount();
  }
  /** Re-run the opening animation. */
  /** Pause the idle spinning while the overlay is parked off screen. */
  setPaused(on) {
    this.ring.classList.toggle("paused", on);
    this.paused = on;
  }
  play() {
    this.ring.classList.remove("play", "paused");
    this.paused = false;
    void this.ring.offsetWidth;
    this.ring.classList.add("play");
  }
  setHot(i) {
    if (i === this.hot) return;
    this.hot = i;
    this.slices.forEach((el, k) => el.classList.toggle("hot", k === i));
    if (i < 0) {
      this.hubT.textContent = "DROP";
      this.hubS.textContent = "pick an action";
      this.hubTop.textContent = "READY";
    } else {
      this.hubT.textContent = ACTIONS[i].n;
      this.hubS.textContent = ACTIONS[i].sub;
      this.hubTop.textContent = "0" + (i + 1) + " / 06";
    }
  }
  /** nx, ny in -1..1 relative to the ring centre. */
  setPointer(nx, ny) {
    if (reduce()) return;
    this.tx = clamp(nx) * 9;
    this.ty = -clamp(ny) * 9;
    if (!this.raf) this.raf = requestAnimationFrame(this.frame);
  }
  frame = () => {
    this.cx += (this.tx - this.cx) * 0.14;
    this.cy += (this.ty - this.cy) * 0.14;
    this.tilt.style.transform = `rotateX(${this.cy.toFixed(2)}deg) rotateY(${this.cx.toFixed(2)}deg)`;
    if (Math.abs(this.tx - this.cx) > 0.01 || Math.abs(this.ty - this.cy) > 0.01) this.raf = requestAnimationFrame(this.frame);
    else this.raf = 0;
  };
  flash(i) {
    const el = this.slices[i];
    if (!el) return;
    el.classList.add("hit");
    setTimeout(() => el.classList.remove("hit"), 260);
  }
}
