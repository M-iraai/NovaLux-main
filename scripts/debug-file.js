const s = require('fs').readFileSync('src/components/OrdersSection.jsx','utf8');
const lines = s.split('\n');
for (let i = 1599; i < 1619; i++) {
  console.log((i+1) + ' ' + JSON.stringify(lines[i]));
}
