const opn = require('opn');
const path = require('path');
const express = require('express');
const pathToSwaggerUi = require('swagger-ui-dist').absolutePath();

const app = express();

app.use(express.static(pathToSwaggerUi));
app.use(express.static(path.join(__dirname,'../dist')));

const port = process.env.PORT||3000

app.listen(port,function(){
  opn(`http://127.0.0.1:${port}?url=http://127.0.0.1:${port}/index.json`);
});

