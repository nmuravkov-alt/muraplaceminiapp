document.addEventListener("DOMContentLoaded", () => {
  initApp();
});

function initApp() {
  // ===== Telegram WebApp boot =====
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand?.();
  }

  const MANAGER_USERNAME = "layoutplacebuy";
  const MANAGER_ID = 6773668793;
  const API = "";

  const CLOTHES_SIZES = ["XS","S","M","L","XL","XXL"];
  const SHOES_SIZES   = ["36","37","38","39","40","41","42","43","44","45"];

  let state = { category: null, cart: [] };

  const $ = (s) => document.querySelector(s);
  const heroEl = $("#hero");
  const categoriesEl = $("#categories");
  const productsEl = $("#products");
  const cartBtn = $("#cartBtn");
  const cartCount = $("#cartCount");
  const writeBtn = $("#writeBtn");
  const checkoutBtn = $("#checkoutBtn");
  const sheet = $("#sheet");
  const backdrop = $("#backdrop");
  const titleEl = $("#shopTitle");

  // ===== utils =====
  const esc = s => String(s ?? "").replace(/[&<>"']/g,m=>({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
  }[m]));

  const money = n => (n||0).toLocaleString("ru-RU")+" ₽";

  function updateCartBadge() {
    cartCount.textContent = state.cart.reduce((s,i)=>s+i.qty,0);
  }

  function normalizeImageUrl(u){
    if(!u) return "";
    u=String(u).trim();
    const q=u.indexOf("?"); if(q>-1) u=u.slice(0,q);
    const m=u.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
    if(m) return `https://drive.google.com/uc?export=view&id=${m[1]}`;
    return u;
  }

  // ===== API =====
  const getJSON = url => fetch(url).then(r=>r.json());
  const loadCategories = ()=>getJSON(`${API}/api/categories`);
  const loadProducts = c=>{
    const u=new URL(`${API}/api/products`,location.origin);
    if(c) u.searchParams.set("category",c);
    return getJSON(u);
  };

  // ===== render =====
  function renderCategories(list){
    categoriesEl.innerHTML="";
    list.forEach(c=>{
      const d=document.createElement("div");
      d.className="cat";
      d.textContent=c.title||c;
      d.onclick=()=>{state.category=d.textContent; heroEl.classList.add("hidden"); drawProducts();};
      categoriesEl.appendChild(d);
    });
  }

  async function drawProducts(){
    productsEl.innerHTML="";
    const items = await loadProducts(state.category||"");

    items.forEach(p=>{
      let sizes=[];
      if(p.sizes_text) sizes=p.sizes_text.split(",").map(s=>s.trim());
      else if((p.category||"").toLowerCase().includes("обув")) sizes=SHOES_SIZES;
      else sizes=CLOTHES_SIZES;

      const imgUrl = normalizeImageUrl(p.image_url || "");
      let album=[];
      if(p.images){
        album = String(p.images)
          .split("|")
          .map(normalizeImageUrl)
          .filter(Boolean);
      }
      if(imgUrl && !album.includes(imgUrl)) album.unshift(imgUrl);

      const card=document.createElement("div");
      card.className="card";
      card.innerHTML=`
        ${imgUrl?`
        <div class="thumb">
          <img src="${imgUrl}" data-album="${esc(album.join("|"))}" />
        </div>`:""}
        <div class="title">${esc(p.title)}</div>
        <div class="price">${money(p.price)}</div>
        <select id="size-${p.id}">
          ${sizes.map(s=>`<option>${s}</option>`).join("")}
        </select>
        <button class="btn primary" id="btn-${p.id}">В корзину</button>
      `;
      productsEl.appendChild(card);

      $("#btn-"+p.id).onclick=()=>{
        state.cart.push({id:p.id,title:p.title,price:p.price,qty:1});
        updateCartBadge();
        tg?.HapticFeedback?.impactOccurred?.("medium");
      };
    });
  }

  // ===== init =====
  (async()=>{
    try {
      const cats = await loadCategories();
      renderCategories(cats);
    } catch {}
    updateCartBadge();
  })();
}