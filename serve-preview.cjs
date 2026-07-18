const express = require('express');
const app = express();
app.use(require('express').static('dist'));
app.listen(3000, () => console.log('Preview at http://localhost:3000'));
