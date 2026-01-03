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
  const subtitleEl = $("#subtitle");

  // ===== utils =====
  const esc = s => String(s ?? "").replace(/[&<>"']/g,m=>({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
  }[m]));

  const money = n => (n||0).toLocaleString("ru-RU")+" ₽";

  function updateCartBadge() {
    if (!cartCount) return;
    cartCount.textContent = state.cart.reduce((s,i)=>s+i.qty,0);
  }

  // Для картинок можно резать query, для видео — НЕ режем (часто нужно)
  function normalizeImageUrl(u){
    if(!u) return "";
    u = String(u).trim();
    const q = u.indexOf("?");
    if(q > -1) u = u.slice(0,q);
    const m = u.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
    if(m) return `https://drive.google.com/uc?export=view&id=${m[1]}`;
    return u;
  }

  function normalizeVideoUrl(u){
    if(!u) return "";
    u = String(u).trim();
    // НЕ режем ?query у видео
    const m = u.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
    if(m) return `https://drive.google.com/uc?export=view&id=${m[1]}`;
    return u;
  }

  // ===== API =====
  const getJSON = url => fetch(url, { credentials: "same-origin" }).then(r => r.json());

  const loadConfig = async () => {
    try { return await getJSON(`${API}/api/config`); }
    catch { return { title: "LAYOUTPLACE Shop", logo_url: "", video_url: "" }; }
  };

  const loadCategories = () => getJSON(`${API}/api/categories`);

  const loadProducts = c => {
    const u = new URL(`${API}/api/products`, location.origin);
    if(c) u.searchParams.set("category", c);
    return getJSON(u);
  };

  // ===== render home (видео/лого) =====
  function renderHome(logoUrl, videoUrl) {
    if (!heroEl) return;

    const hasVideo = !!(videoUrl && String(videoUrl).trim());
    const hasLogo  = !!(logoUrl  && String(logoUrl).trim());

    if (!hasVideo && !hasLogo) {
      heroEl.classList.add("hidden");
      return;
    }

    heroEl.innerHTML = "";

    const box = document.createElement("div");
    box.className = "hero-img";

    if (hasVideo) {
      const src = normalizeVideoUrl(videoUrl);
      const poster = hasLogo ? normalizeImageUrl(logoUrl) : "";

      box.innerHTML = `
        <video
          src="${src}"
          ${poster ? `poster="${poster}"` : ""}
          muted
          loop
          playsinline
          preload="metadata"
          style="width:100%;height:100%;object-fit:cover;border-radius:12px;"
          controlslist="nodownload noplaybackrate noremoteplayback nofullscreen">
        </video>
      `;
    } else {
      const src = normalizeImageUrl(logoUrl);
      box.innerHTML = `
        <img src="${src}" alt="brand logo" loading="lazy" referrerpolicy="no-referrer" />
      `;
    }

    heroEl.appendChild(box);

    // (опционально) подпись
    const tagline = document.createElement("div");
    tagline.className = "subtitle";
    tagline.style.textAlign = "center";
    tagline.style.marginTop = "8px";
    tagline.textContent = "https://t.me/muraplace";
    heroEl.appendChild(tagline);

    heroEl.classList.remove("hidden");

    // пробуем автоплей; если нельзя — останется poster (превью)
    const v = heroEl.querySelector("video");
    if (v) {
      v.play().catch(() => {
        // можно оставить без controls — будет просто постер
        // но если хочешь, раскомментируй:
        // v.setAttribute("controls","controls");
      });
    }
  }

  // ===== render categories/products =====
  function renderCategories(list){
    if (!categoriesEl) return;
    categoriesEl.innerHTML = "";
    list.forEach(c=>{
      const d = document.createElement("div");
      d.className = "cat";
      d.textContent = c.title || c;

      d.onclick = () => {
        state.category = d.textContent;
        heroEl?.classList?.add("hidden");
        drawProducts();
      };

      categoriesEl.appendChild(d);
    });
  }

  async function drawProducts(){
    if (!productsEl) return;
    productsEl.innerHTML = "";
    const items = await loadProducts(state.category || "");

    items.forEach(p=>{
      let sizes=[];
      if(p.sizes_text) sizes = String(p.sizes_text).split(",").map(s=>s.trim()).filter(Boolean);
      else if((p.category||"").toLowerCase().includes("обув")) sizes = SHOES_SIZES;
      else sizes = CLOTHES_SIZES;

      const imgUrl = normalizeImageUrl(p.image_url || p.image || "");
      let album = [];

      // альбом (url1|url2|url3...)
      if (p.images && String(p.images).trim()) {
        album = String(p.images)
          .split("|")
          .map(s => normalizeImageUrl(s))
          .filter(Boolean);
      }
      if (imgUrl && !album.includes(imgUrl)) album.unshift(imgUrl);

      const desc = (p.description || "").trim();

      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        ${imgUrl ? `
          <div class="thumb">
            <img
              src="${imgUrl}"
              alt="${esc(p.title)}"
              loading="lazy"
              referrerpolicy="no-referrer"
              data-album="${esc(album.join("|"))}"
            />
          </div>` : ``}

        <div class="title">${esc(p.title)}</div>
        <div class="price">${money(p.price)}</div>
        ${desc ? `<div class="desc">${esc(desc)}</div>` : ``}

        <select id="size-${p.id}">
          ${sizes.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join("")}
        </select>

        <button class="btn primary" id="btn-${p.id}">В корзину</button>
      `;
      productsEl.appendChild(card);

      const btn = $("#btn-" + p.id);
      if (btn) {
        btn.onclick = () => {
          const sel = $("#size-" + p.id);
          const size = sel ? sel.value : "";

          // (минимально) добавляем в корзину
          state.cart.push({ id:p.id, title:p.title, price:p.price, size, qty:1 });

          updateCartBadge();
          tg?.HapticFeedback?.impactOccurred?.("medium");
        };
      }
    });
  }

  // ===== init =====
  (async()=>{
    // 1) Заголовок/видео/лого
    try {
      const cfg = await loadConfig();
      if (cfg?.title) {
        if (titleEl) titleEl.textContent = cfg.title;
        document.title = cfg.title;
        if (subtitleEl) subtitleEl.textContent = "";
      }
      renderHome(cfg?.logo_url || "", cfg?.video_url || "");
    } catch {}

    // 2) Категории
    try {
      const cats = await loadCategories();
      renderCategories(cats);
    } catch {}

    updateCartBadge();
  })();
}