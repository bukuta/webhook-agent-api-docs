const util = require('util');
const path = require('path');
const fs = require('fs');
const url = require('url');
const fetch = require('fetch');
const CookieJar = fetch.CookieJar;


const express = require('express');
const httpProxy = require('http-proxy');
const pathToRegexp = require('path-to-regexp')
const Mock = require('mockjs')

const debug = require('debug')('local-mock');
const debug_router = require('debug')('local-mock:router');
const debug_todo = require('debug')('local-mock:TODO');
const debug_data = require('debug')('local-mock:data');

const debug5 = require('debug')('collectMocks');
const debug6 = require('debug')('collectResponseMocks');
const debug_error = require('debug')('error');
const debug_proxy = require('debug')('proxy');
const debug_cookie = require('debug')('cookie');

const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);

const _configfile = '.tmp_config.db'
async function loadConfig() {
  try {
    let content = await readFile(_configfile);
    content = JSON.parse(content);
    return content;
  } catch (e) {
    debug(e);
    return {
      responseDecorations: {},
      currentServer: null
    };
  }
}
async function saveConfig(config) {
  let content = JSON.stringify(config, 0, 2);
  await writeFile(_configfile, content);
}

function collectMocksFromEntity(schema, root) {
  debug6(schema);
  let properties = schema.properties;
  let r = {};
  let type = '';
  if (properties) {
    // object
    for (let name in properties) {
      let value = properties[name];
      if (value.hasOwnProperty('x-mock')) {
        r[name] = value['x-mock'];
      } else if (value.hasOwnProperty('$ref')) {
        //debug5(name, value)
        let node = pickNode(root, value['$ref']);
        //debug5(node);
        let m = collectMocksFromEntity(node, root);
        if (m.type == 'enum') {
          r[name + '|1'] = m.mock;
        } else {
          r[name] = m.mock;
        }
      } else if (value.type == 'object') {
        //debug5('object', value);
        let m = collectMocksFromEntity(value, root);
        if (m.type == 'enum') {
          r[name + '|1'] = m.mock;
        } else if (m.type == 'array') {
          r[name + '|1-10'] = m.mock;
        } else {
          r[name] = m.mock;
        }
      } else if (value.type == 'array') {
        debug5('array', value);
        let items = value.items;
        if (items.oneOf) {
          items = items.oneOf;
          debug5('oneOf', items);
        } else if (items.allOf) {
          items = items.allOf;
          debug5('allOf', items);
        } else if (items.anyOf) {
          items = items.anyOf;
          debug5('anyOf', items);
        } else {
          items = [value.items];
        }
        let m = items.map(item => collectMocksFromEntity({
          properties: {
            items: item
          }
        }, root).mock.items);
        //type = 'array';
        r[name + '|1-10'] = m;
      } else if (value.enum) {
        r[name + '|1'] = value.enum;
      }
    }
  } else if(schema.type=='array'){
    type=schema.type;
    let node = schema.items;
    if(node['$ref']){
      node = pickNode(root,node['$ref']);
    }
    let m = collectMocksFromEntity(node, root);
    r=m.mock;
  }else{
    // refs/enum
    if (schema.hasOwnProperty('x-mock')) {
      r = schema['x-mock'];
    } else if (schema.hasOwnProperty('enum')) {
      r = schema['enum'];
      type = 'enum';
    }
  }
  return {
    type,
    mock: r
  };
}

function pickNode(root, keypath) {
  let paths = keypath.replace(/^@#\//, '').replace(/^#\//, '').split('/').filter(k => k);
  let node = paths.reduce((last, path) => {
    if (last && last[path]) {
      return last[path];
    }
    return null;
  }, root);

  return node;
}

function collectMocksFromResponse(response, root) {
  let content = response && response.content && response.content['application/json'];
  let m;
  if (content) {
    content = content.schema;
    debug6('collectMocksFromResponse', content);
    if (content.hasOwnProperty('$ref')) {
      let node = pickNode(root, content['$ref']);
      debug6('collectMocksFromResponse', node);
      m = collectMocksFromEntity(node, root);
    } else {
      debug6(content);
      m = collectMocksFromEntity(content, root);
    }
  }
  debug6('collectMocksFromEntity.result', JSON.stringify(m, 0, 2));
  return m;
}

let responses = { };

function fixBindHost(server) {
  let host,
    origin;
  let _url = url.parse(server.url);
  origin = _url.host;
  _url.host = server['x-host'] || _url.host;
  return {
    target: url.format(_url),
    origin,
  };
}

async function setupMockByDocs() {
  let router = express.Router();
  let content = await readFile(path.join(process.cwd(), 'dist/index.json'));
  let root = JSON.parse(content);
  let specs = root.paths;
  let proxies = root.servers;

  for (let path in specs) {
    let spec = specs[path];
    let keys = [];
    let store = responses[path] = responses[path] || {};

    // /admins/{adminId}/sites
    // =>
    // /admins/:adminId/sites
    let regPath = path.replace(/(\{([^}]+)\})/g, ':$2');
    regPath = pathToRegexp(regPath, keys);
    debug(path, regPath);

    for (let method in spec) {
      let methodSpec = spec[method];
      let params = methodSpec.parameters;
      let description = methodSpec.description;
      //let methodResponses = store[method] = responses[method] || {};

      store[method] = {
        //methodResponses[path] = {
        path,
        method,
        description,
        regPath,
        keys,
        root,
        responses: methodSpec.responses,
        spec: methodSpec,
      };
    }
  }
  router.use(function(req, res, next) {
    debug_router('req.url', req.method, req.url);
    let method = req.method.toLowerCase();
    let match = matchPath(responses, req, method)

    function passProxy({proxy, host, reg, res, headers}) {
      let target = host;
      let _headers = Object.assign({
        'Host': headers.origin,
      //'Accept': 'application/json, */*',
      //'Content-Type': 'application/json'
      }, headers)

      debug_proxy(target, _headers);
      proxy.web(req, res, {
        target: target,
        headers: _headers
      }, function(err, preq, pres, url) {
        debug_proxy('proxy.callback', err);
        debug_proxy('preq.headers', preq.headers);
        debug_proxy('pres.headers', pres.headers);
        if (err) {
          res.status(400)
          res.send(JSON.stringify(url));
          res.end(JSON.stringify(err));
        } else {
          //pres.pipe(res);
          //  根据response header content-type返回text/json/application/binary等
          res.json(url);
        }
      });
    }

    if (match) {
      debug_proxy('', JSON.stringify(responseDecorations))
      let rd_proxy = responseDecorations[match.path];

      debug_proxy('rd_proxy', rd_proxy);

      if (rd_proxy) {
        if (rd_proxy.proxyEnable && rd_proxy.proxy) {
          // path
          debug_proxy('path', rd_proxy);
          let _server = rd_proxy.proxy;
          let server = proxies.filter(ser => ser.url = _server)[0];
          debug_proxy(_server);
          let {target, origin} = fixBindHost(server);

          if (origin) {

            return passProxy({
              req,
              res,
              proxy,
              host: target,
              headers: {
                origin: origin,
              }
            })
          } else {
            return localResponse(match, req, res);
          }
        }
        rd_proxy = rd_proxy.methods[method];
        debug_proxy('rd_proxy-method', rd_proxy);
        if (rd_proxy) {
          if (rd_proxy.proxyEnable && rd_proxy.proxy) {
            // path && method
            debug_proxy('path.method', rd_proxy);
            let _server = rd_proxy.proxy;
            let server = proxies.filter(ser => ser.url == _server)[0];
            let {target, origin} = fixBindHost(server);
            let host = server && server['x-host'] || _server;


            debug_proxy(server, target, origin);
            // /api/v1 本地mock，
            if (origin) {
              return passProxy({
                req,
                res,
                proxy,
                host: target,
                headers: {
                  origin: origin,
                }
              })
            } else {
              return localResponse(match, req, res);
            }
          }
        }
      }
      debug('match', match);


      function localResponse(match, req, res) {
        let rd = responseDecorations[match.path];
        let skipcode = {};
        if (rd) {
          if (rd.skip) {
            return next();
          }
          rd = rd.methods[method];
          if (rd) {
            if (rd.skip) {
              return next();
            }
            rd = rd.responses;
            Object.keys(rd).forEach(code => {
              if (rd[code].skip) {
                skipcode[code] = true;
              }
            });
          }
        }
        let params = match.spec.parameters;
        debug(params);
        debug_todo('validate parameters');
        debug_todo('check request.contenttype');
        let statusCodes = Object.keys(match.responses).filter(code => !skipcode[code]);
        debug('statusCodes', statusCodes);
        let random = parseInt(Math.random() * statusCodes.length, 10);
        let statusCode = statusCodes[random];
        let response = match.responses[statusCode];
        //res.end(JSON.stringify(req.params));
        res.status(statusCode);
        let mock = collectMocksFromResponse(response, root);
        let data = '';
        if (mock) {
          if(mock.type=='array'){
            mock['mock2|1-10']=[mock.mock];
          }
          data = Mock.mock(mock);
          debug_todo('check response.contenttype');
          if(mock.type=='array'){
            data = data.mock2;
          }else{
            data = data.mock;
          }
          debug_data(data);
          res.json(data);
        } else {
          res.end(response.description);
        }
      }

      function proxy2End() {
      }

      if (currentServer) {
        let {target, origin} = fixBindHost(currentServer);
        debug(target, origin);
        return passProxy({
          req,
          res,
          proxy,
          host: target,
          headers: {
            origin: origin,
          }
        })
      } else {
      }

    } else {
      debug('no match and router.next');
      next();
    }
  });
  return router;
}
function matchPath(responses, req, method) {
  let url = req.path;
  if (!responses) {
    return;
  }
  if (responses[url] && responses[url][method]) {
    // fast match
    debug('fast-match', responses[url][method]);
    return responses[url][method];
  } else {
    for (let path in responses) {
      let response = responses[path][method];
      let r = response && response.regPath.exec(url);
      let params = {};
      if (r) {
        debug(url, path, response.regPath, response.keys);
        debug('match', r);
        let keys = response.keys;
        keys.map((key, index) => {
          params[key.name] = r[index + 1];
        });
        debug('params', params);
        req.params = params;
        return response;
      }
    }
  //Object.keys(responses).filter(path
  }
}
var proxy = httpProxy.createProxyServer({}); // See (†)

async function setupMock(app) {
  let projectJson = require('../package.json');
  let mockConfig = projectJson.mockConfig || {};

  // 本地mock
  let router = await setupMockByDocs();
  if (mockConfig.prefix) {
    app.use(mockConfig.prefix, router);
  } else {
    app.use(router);
  }

  proxy.on('error', function(e) {
    debug('proxy.error', e);
  });
  function cookieStringify(cookie) {
    let keys = ['path', 'domain', 'expires'];
    let str = keys.filter(key => cookie[key]).map(key => `${key}=${cookie[key]}`).concat([`${cookie.name}=${cookie.value}`]).concat(cookie.httponly ? ['HttpOnly'] : []).join(';');
    debug_cookie('stringify', cookie);
    debug_cookie('stringify', str);
    return str;
  }
  function modifyCookieDomain(cookiestrings, domain) {
    let jar = new CookieJar();
    cookiestrings.forEach(cookie => {
      debug_cookie('cookie', cookie);
      jar.setCookie(cookie);
    });
    let rcookies = [];
    for (let [name, cookies] of Object.entries(jar.cookies)) {
      cookies.forEach(cookie => {
        cookie.domain = '';
        rcookies.push(cookieStringify(cookie));
      });
    }
    debug_cookie('cookiejar', JSON.stringify(jar.cookies));
    return rcookies;
  }
  proxy.on('proxyReq', function(proxyReq, req, res, option) {
    //debug(' Request from the target', JSON.stringify(req.headers, true, 2));
    debug_cookie('Proxy Request ', option);
    debug_cookie('Proxy Request ', JSON.stringify(req.headers, 0, 2));
    if (req.headers.cookie) {
      let rcookies = modifyCookieDomain(req.headers.cookie.split(';'), option.headers.Host);
    //debug_cookie('modify.request.cookie.before',req.headers.ccookie);
    //debug_cookie('modify.request.cookie',rcookies);
    //option.headers['cookie']=rcookies;
    }
  });
  proxy.on('proxyRes', function(proxyRes, req, res) {
    //debug('RAW Response from the target', JSON.stringify(req.headers, true, 2));
    debug_cookie('RAW Response from the target', JSON.stringify(proxyRes.headers, 0, 2));
    for (let [name, value] of Object.entries(proxyRes.headers)) {
      //debug('response.header',item);
      if (name == 'set-cookie') {
        debug_cookie('response.header', name, value);
      //let cookies = modifyCookieDomain(value,'127.0.0.1');
      //debug_cookie('modify.respone.cookie',cookies);
      //proxyRes.headers[name]=cookies;
      }
    }
  });
  if (!mockConfig.prefix) {
    debug('mockConfig.prefix needed');
    throw new Error('mockConfig.prefix needed');
  }

  // 本地无法处理的请求，透传到package.json中定义的proxy后端
  app.use(mockConfig.prefix, function(req, res, next) {
    debug('proxy', req.url, req.path);

    // default host
    let target = mockConfig.proxy;
    let host = url.parse(target).hostname;
    //req.url = path.join(url.parse(target).path,req.originUrl||req.url);

    proxy.web(req, res, {
      target: target,
      headers: {
        host,
        'Accept': 'application/json, */*',
        'Content-Type': 'application/json'
      }
    }, function(err, preq, pres, url) {
      debug('proxy.callback', err);
      if (err) {
        res.status(400)
        res.send(JSON.stringify(url));
        res.end(JSON.stringify(err));
      } else {
        //pres.pipe(res);
        res.json(url);
      }
    });
  });
}
let currentServer,
  responseDecorations = {};

async function setupUI(app) {
  let config = await loadConfig();
  currentServer = config.currentServer;
  responseDecorations = config.responseDecorations;
  debug('currentServer,', currentServer, responseDecorations);
  let router = express();
  router.set('views', path.join(process.cwd(), 'scripts/views/'));
  router.engine('pug', require('pug').__express);
  let content = await readFile(path.join(process.cwd(), 'dist/index.json'));
  let root = JSON.parse(content);
  router.use('/:console/', express.static(path.join(process.cwd(), 'scripts/views/static'), {}));
  router.get('/:console/', function(req, res, next) {
    res.render('console.pug', {
      data: root,
      decorations: responseDecorations,
      currentServer,
    });
  });
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
  app.use(router);
}

let app = express();
let port = process.env.PORT || 3003;
setupUI(app)
setupMock(app);
app.listen(port, function() {
  debug('listening', port);
});
process.on('warning', function(warn) {
  debug_error(warn);
});
