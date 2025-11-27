// -------------------- Confetti --------------------
const canvas = document.getElementById('confetti');
const ctx = canvas.getContext('2d');
let W = canvas.width = innerWidth;
let H = canvas.height = innerHeight;

window.addEventListener('resize',()=>{
  W = canvas.width = innerWidth;
  H = canvas.height = innerHeight;
});

class ConfettiParticle{
  constructor(){ this.reset(); }
  reset(){
    this.x = Math.random()*W;
    this.y = -10;
    this.size = 6 + Math.random()*10;
    this.speedY = 1 + Math.random()*3;
    this.speedX = -1 + Math.random()*2;
    this.rotation = Math.random()*360;
    this.rotateSpeed = -3 + Math.random()*6;
    const colors = ['#ef4444','#f97316','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ec4899'];
    this.color = colors[Math.floor(Math.random()*colors.length)];
  }
  update(){
    this.x += this.speedX;
    this.y += this.speedY;
    this.rotation += this.rotateSpeed;
    if(this.y > H+30) this.reset();
  }
  draw(){
    ctx.save();
    ctx.translate(this.x,this.y);
    ctx.rotate(this.rotation*Math.PI/180);
    ctx.fillStyle = this.color;
    ctx.fillRect(-this.size/2, -this.size/2, this.size, this.size*0.6);
    ctx.restore();
  }
}

const particles = [];
for(let i=0;i<120;i++) particles.push(new ConfettiParticle());
let confettiRunning = false;

function confettiLoop(){
  ctx.clearRect(0,0,W,H);
  particles.forEach(p=>{p.update(); p.draw();});
  if(confettiRunning) requestAnimationFrame(confettiLoop);
}

startBtn.addEventListener('click', ()=>{
  if(!confettiRunning){ confettiRunning=true; confettiLoop(); }
});
stopBtn.addEventListener('click', ()=>{ confettiRunning=false; });

// -------------------- Floating images --------------------
const floatLayer = document.querySelector('.float-layer');

const sampleImages = [
  'https://cdn-icons-png.flaticon.com/512/833/833472.png',
  'https://cdn-icons-png.flaticon.com/512/616/616408.png',
  'https://cdn-icons-png.flaticon.com/512/2922/2922506.png'
];

function makeFloatItem(imgSrc){
  const el = document.createElement('img');
  el.className = 'float-item';
  el.src = imgSrc;

  const size = 60 + Math.random()*120;
  el.style.width = size + 'px';

  el.style.left = (Math.random()*100) + 'vw';

  const drift = (Math.random()*40 - 20) + 'px';
  el.style.setProperty('--drift', drift);

  const duration = 12 + Math.random()*15;
  el.style.animation = `floatUp ${duration}s linear forwards`;

  floatLayer.appendChild(el);

  el.addEventListener('animationend', ()=>el.remove());
}

for(let i=0;i<5;i++){
  makeFloatItem(sampleImages[i % sampleImages.length]);
}

addImgBtn.addEventListener('click', ()=>{
  const src = sampleImages[Math.floor(Math.random()*sampleImages.length)];
  makeFloatItem(src);
});

setInterval(()=>{
  if(Math.random() < 0.6){
    const src = sampleImages[Math.floor(Math.random()*sampleImages.length)];
    makeFloatItem(src);
  }
}, 2500);
