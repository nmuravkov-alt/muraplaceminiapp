const API_URL = 'https://api.sheetbest.com/sheets/aefc5178-3ee9-4a34-8818-4b5656c1a865'; // вставь ссылку Sheet.best
let products = [];
let fav = [];

const container = document.getElementById('product-container');
const modal = document.getElementById('modal');
const modalName = document.getElementById('modal-name');
const modalPrice = document.getElementById('modal-price');
const modalDesc = document.getElementById('modal-description');
const likeBtn = document.getElementById('like-btn');

let currentTab = 'Каталог';
let currentCategory = 'Все';
let currentSort = null;

async function loadProducts() {
  const res = await fetch(API_URL);
  products = await res.json();
  render();
}

function render() {
  container.innerHTML = '';
  let list = currentTab==='Каталог'? products : fav;
  if(currentCategory!=='Все') list = list.filter(p=>p.category===currentCategory);
  if(currentSort==='asc') list.sort((a,b)=>a.price-b.price);
  if(currentSort==='desc') list.sort((a,b)=>b.price-a.price);

  list.forEach(p=>{
    const card = document.createElement('div');
    card.className='product-card';
    card.innerHTML=`<img src="${p.photo_url}" /><h4>${p.name}</h4><p>${p.price} $</p>`;
    card.onclick = ()=>openModal(p);
    container.appendChild(card);
  });
}

function openModal(p) {
  modal.style.display='flex';
  modalName.textContent=p.name;
  modalPrice.textContent=`${p.price} $`;
  modalDesc.textContent=p.description;
  likeBtn.onclick = ()=>{ 
    if(!fav.find(f=>f.id===p.id)) fav.push(p);
    alert('Добавлено в Избранное');
  }
}

document.getElementById('close-modal').onclick = ()=>{ modal.style.display='none'; }

document.getElementById('tab-catalog').onclick = ()=>{
  currentTab='Каталог';
  document.getElementById('tab-catalog').classList.add('active');
  document.getElementById('tab-fav').classList.remove('active');
  render();
}

document.getElementById('tab-fav').onclick = ()=>{
  currentTab='Избранное';
  document.getElementById('tab-fav').classList.add('active');
  document.getElementById('tab-catalog').classList.remove('active');
  render();
}

document.querySelectorAll('#categories button').forEach(btn=>{
  btn.onclick=()=>{
    document.querySelectorAll('#categories button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    currentCategory = btn.dataset.cat;
    render();
  }
})

document.querySelectorAll('#sort button').forEach(btn=>{
  btn.onclick=()=>{
    currentSort = btn.dataset.sort;
    render();
  }
})

loadProducts();
