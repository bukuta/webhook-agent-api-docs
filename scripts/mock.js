const express = require('express');
const httpProxy = require('http-proxy');
const debug = require('debug')('sync');
const fs = require('fs');
const readFile = util.promisify(fs.readFile);

async function setupMock() {
  let router = express.Router();
  let content = await readFile(path.join(process.cwd(), 'dist/mock.responses.json'));
  let specs = JSON.parse(content);
  for (let path in specs) {
    let spec = specs[path];
    for (let method in spec) {
      let code = Object.keys(spec[method]).filter(statusCode => {
        return +statusCode < 300 && +statusCode >= 200
      })[0];
      let {mock, description='need description'} = {
        ...spec[method][code]
      };
      c.createApi(project['_id'], {
        url: path,
        method,
        description,
        mode: mock,
      });
      debug(path, method, code, description);
    }
  }
  return router;
}

async function run(app){
  let router = await setupMock();
  app.use(router);
}

let app = express();
let port = process.env.PORT || 3003;
run();
app.listen(port);
