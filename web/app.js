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

  // ✅ Нормализация ссылок (Drive/GitHub/jsDelivr/локальные)
  function normalizeImageUrl(u){
    if(!u) return "";
    u = String(u).trim();

    // локальные ассеты
    if (u.startsWith("/images/")) return u;

    // Google Drive file link -> direct view
    const m = u.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
    if(m) return `https://drive.google.com/uc?export=view&id=${m[1]}`;

    // GitHub raw with refs/heads/main -> canonical raw
    u = u.replace(
      /raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/refs\/heads\/main\//i,
      "raw.githubusercontent.com/$1/$2/main/"
    );

    // jsDelivr ok, query можно убрать
    const q = u.indexOf("?");
    if(q > -1) u = u.slice(0,q);

    return u;
  }

  function normalizeVideoUrl(u){
    if(!u) return "";
    u = String(u).trim();
    if (u.startsWith("/images/")) return u;

    // Drive -> direct
    const m = u.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
    if(m) return `https://drive.google.com/uc?export=view&id=${m[1]}`;

    // query у видео НЕ режем
    u = u.replace(
      /raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/refs\/heads\/main\//i,
      "raw.githubusercontent.com/$1/$2/main/"
    );

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

    const tagline = document.createElement("div");
    tagline.className = "subtitle";
    tagline.style.textAlign = "center";
    tagline.style.marginTop = "8px";
    tagline.textContent = "https://t.me/muraplace";
    heroEl.appendChild(tagline);

    heroEl.classList.remove("hidden");

    const v = heroEl.querySelector("video");
    if (v) v.play().catch(() => {});
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

  // ✅ утилита: сделать альбом из images_urls + cover image_url
  function buildAlbum(p){
    // 1) cover
    const cover = normalizeImageUrl(p.image_url || p.image || "");

    // 2) gallery from images_urls (ВАЖНО: именно images_urls)
    let list = [];
    if (p.images_urls && String(p.images_urls).trim()) {
      list = String(p.images_urls)
        .split("|")
        .map(s => normalizeImageUrl(s))
        .filter(Boolean);
    }

    // 3) cover первой (если есть)
    const album = [];
    if (cover) album.push(cover);
    for (const u of list) if (u && !album.includes(u)) album.push(u);

    return album;
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

      const desc = (p.description || "").trim();

      // ✅ ГАЛЕРЕЯ: берём только из images_urls (+ image_url как cover)
      const album = buildAlbum(p);
      const hasGallery = album.length > 0;

      const galleryHtml = hasGallery ? `
        <div class="thumb">
          <div class="gallery" data-images-count="${album.length}">
            <div class="gallery-track" style="transform: translateX(0);">
              ${album.map((src)=>`
                <div class="gallery-slide">
                  <img
                    src="${src}"
                    alt="${esc(p.title)}"
                    loading="lazy"
                    referrerpolicy="no-referrer"
                    data-album="${esc(album.join("|"))}"
                  />
                </div>
              `).join("")}
            </div>

            ${album.length > 1 ? `
              <div class="gallery-dots">
                ${album.map((_,i)=>`<span class="gallery-dot ${i===0?'active':''}"></span>`).join("")}
              </div>
            ` : ``}
          </div>
        </div>
      ` : ``;

      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        ${galleryHtml}

        <div class="title">${esc(p.title)}</div>
        <div class="price">${money(p.price)}</div>
        ${desc ? `<div class="desc">${esc(desc)}</div>` : ``}

        <select id="size-${p.id}">
          ${sizes.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join("")}
        </select>

        <button class="btn primary" id="btn-${p.id}">В корзину</button>
      `;
      productsEl.appendChild(card);

      // ===== swipe logic for gallery =====
      const gallery = card.querySelector(".gallery");
      if (gallery) {
        const track = gallery.querySelector(".gallery-track");
        const dotsWrap = gallery.querySelector(".gallery-dots");
        const dots = dotsWrap ? Array.from(dotsWrap.querySelectorAll(".gallery-dot")) : [];
        const count = Number(gallery.dataset.imagesCount || 0);

        let gIdx = 0;
        const setIdx = (n, animate=true) => {
          if (!track || count <= 0) return;
          gIdx = Math.max(0, Math.min(n, count - 1));
          track.style.transition = animate ? "transform .22s ease" : "none";
          track.style.transform = `translateX(${-gIdx * 100}%)`;
          if (dots.length) dots.forEach((d,i)=>d.classList.toggle("active", i===gIdx));
        };

        // touch swipe
        let startX = 0, startY = 0, dx = 0, dragging = false;

        gallery.addEventListener("touchstart", (e) => {
          if (count <= 1) return;
          const t = e.touches[0];
          startX = t.clientX;
          startY = t.clientY;
          dx = 0;
          dragging = true;
          if (track) track.style.transition = "none";
        }, {passive:true});

        gallery.addEventListener("touchmove", (e) => {
          if (!dragging || count <= 1 || !track) return;
          const t = e.touches[0];
          const moveX = t.clientX - startX;
          const moveY = t.clientY - startY;

          // если вертикальный скролл — не мешаем
          if (Math.abs(moveY) > Math.abs(moveX)) return;

          dx = moveX;
          track.style.transform = `translateX(calc(${-gIdx * 100}% + ${dx}px))`;
        }, {passive:true});

        gallery.addEventListener("touchend", () => {
          if (!dragging || count <= 1) return;
          dragging = false;

          const threshold = 40;
          if (dx > threshold && gIdx > 0) setIdx(gIdx - 1);
          else if (dx < -threshold && gIdx < count - 1) setIdx(gIdx + 1);
          else setIdx(gIdx); // вернуть назад
        });

        // если картинка не грузится — прячем всю галерею (чтобы не было "битых")
        gallery.querySelectorAll("img").forEach(img=>{
          img.onerror = () => {
            const th = img.closest(".thumb");
            if (th) th.style.display = "none";
          };
        });
      }

      // ===== add to cart =====
      const btn = $("#btn-" + p.id);
      if (btn) {
        btn.onclick = () => {
          const sel = $("#size-" + p.id);
          const size = sel ? sel.value : "";
          state.cart.push({ id:p.id, title:p.title, price:p.price, size, qty:1 });
          updateCartBadge();
          tg?.HapticFeedback?.impactOccurred?.("medium");
        };
      }
    });
  }

  // ===== init =====
  (async()=>{
    try {
      const cfg = await loadConfig();
      if (cfg?.title) {
        if (titleEl) titleEl.textContent = cfg.title;
        document.title = cfg.title;
        if (subtitleEl) subtitleEl.textContent = "";
      }
      renderHome(cfg?.logo_url || "", cfg?.video_url || "");
    } catch {}

    try {
      const cats = await loadCategories();
      renderCategories(cats);
    } catch {}

    updateCartBadge();
  })();
}