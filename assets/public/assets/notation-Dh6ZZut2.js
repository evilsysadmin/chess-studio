const c={n:"N",b:"B",r:"R",q:"Q",k:"K"};function f(t){if(!t||!t.from||!t.to)return"";const r=c[t.piece]||"",n=t.captured?"x":"-";return`${r}${t.from}${n}${t.to}`}export{f};
