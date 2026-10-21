import{c as t,u as c,a as d,j as s,R as l,i as o,E as h,k as j}from"./index-UKYyFUXq.js";/**
 * @license lucide-react v0.468.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const u=t("CloudOff",[["path",{d:"m2 2 20 20",key:"1ooewy"}],["path",{d:"M5.782 5.782A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.307-.193",key:"yfwify"}],["path",{d:"M21.532 16.5A4.5 4.5 0 0 0 17.5 10h-1.79A7.008 7.008 0 0 0 10 5.07",key:"jlfiyv"}]]);/**
 * @license lucide-react v0.468.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const x=t("Cloud",[["path",{d:"M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z",key:"p7xjir"}]]);function p(){const{favorites:i,user:r}=c(),n=d(),e=Object.values(i);return s.jsxs("div",{className:"container page",children:[s.jsxs("div",{className:"page-head",children:[s.jsxs("div",{children:[s.jsx("h1",{children:"Избранное"}),s.jsx("p",{className:"lead row",style:{gap:8},children:r?s.jsxs(s.Fragment,{children:[s.jsx(x,{size:18}),"Синхронизируется между сайтом и приложением"]}):s.jsxs(s.Fragment,{children:[s.jsx(u,{size:18}),"Хранится на этом устройстве и работает без интернета. Войдите, чтобы синхронизировать."]})})]}),e.length>1&&s.jsxs("button",{className:"btn primary",onClick:()=>{try{sessionStorage.setItem("kod-builder",JSON.stringify(e.map(a=>a.id)))}catch{}n("/routes/builder")},children:[s.jsx(l,{size:18}),"Собрать маршрут из избранного"]})]}),e.length?s.jsx("div",{className:"grid",children:e.map(a=>s.jsx(o,{p:a},a.id))}):s.jsxs(h,{icon:"heart",title:"Здесь будут сохранённые места",children:["Нажмите ♥ на карточке места — оно появится здесь, даже без интернета",s.jsx(j,{to:"/catalog",className:"btn secondary",children:"Открыть каталог"})]})]})}export{p as default};
