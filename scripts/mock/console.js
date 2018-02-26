const express = require('express');
const apiv1 = require('./apiv1');

let root;
let responses = { };
let rootspec = {};

async function setup(app) {
  let config = await loadConfig();
  currentServer = config.currentServer;
  responseDecorations = config.responseDecorations;
  debug('currentServer,', currentServer, responseDecorations);
  let content = await readFile(path.join(process.cwd(), 'dist/index.json'));
  root = JSON.parse(content);
}
setup();

let router = express();
router.set('views', path.join(process.cwd(), 'scripts/views/'));
router.engine('pug', require('pug').__express);

router.use('/:console/', express.static(path.join(process.cwd(), 'scripts/views/static'), {}));
router.get('/:console/', function(req, res, next) {
  res.render('console.pug', {
    data: root,
    decorations: responseDecorations,
    currentServer,
  });
});

//-----------------------------
router.use('/:console/api/v1', apiv1);

//-----------------------------
router.post('/:console/skip', [express.json(), function(req, res) {
  let resp
  if (Array.isArray(req.body)) {
    resp = req.body.map(item => {
      skipItem(item);
    })
  } else {
    resp = skipItem(req.body);
  }
  function skipItem(item) {
    let {path, method, statuscode, checked} = item;
    let response = responseDecorations[path] = responseDecorations[path] || {
      methods: {}
    };
    let r = response;
    if (method) {
      r = r.methods[method] = r.methods[method] || {
        responses: {}
      };
      if (statuscode) {
        r = r.responses[statuscode] = r.responses[statuscode] || {};
      }
    }
    r.skip = checked;
    return {
      [path]: response
    };
  }
  res.json({
    status: 'ok',
    data: resp
  })
}]);
router.post('/:console/proxy', [express.json(), async function(req, res) {
  let {path, proxy, method, statuscode, checked} = req.body;
  let response = responseDecorations[path] = responseDecorations[path] || {
    methods: {}
  };
  let r = response;
  if (method) {
    r = r.methods[method] = r.methods[method] || {
      responses: {}
    };
    if (statuscode) {
      r = r.responses[statuscode] = r.responses[statuscode] || {};
    }
  }
  r.proxyEnable = checked;
  r.proxy = proxy;

  await saveConfig({
    responseDecorations,
    currentServer
  });
  res.json({
    status: 'ok',
    data: {
      [path]: response
    }
  })
}]);
router.post('/:console/set-server', [express.json(), async function(req, res) {
  let {name} = req.body;
  currentServer = root.servers.filter(server => server.name == name)[0];
  debug('set-server', currentServer);
  if (currentServer.url[0] == '/') {
    currentServer = null;
  }
  await saveConfig({
    responseDecorations,
    currentServer
  });
  res.json(currentServer);
}]);
module.exports = {
  router,
};
