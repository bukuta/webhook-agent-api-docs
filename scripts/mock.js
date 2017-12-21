const util = require('util');
const path = require('path');
const fs = require('fs');
const url = require('url');


const express = require('express');
const httpProxy = require('http-proxy');
const pathToRegexp = require('path-to-regexp')
const Mock = require('mockjs')

const debug = require('debug')('local-mock');
const debug_router = require('debug')('local-mock:router');
const debug_todo = require('debug')('local-mock:TODO');

const debug5 = require('debug')('collectMocks');
const debug6 = require('debug')('collectResponseMocks');

const readFile = util.promisify(fs.readFile);

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
          r[name + '|1'] = m;
        } else if (m.type == 'array') {
          r[name + '|1-10'] = m;
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
        type = 'array';
        r[name + '|1-10'] = m;
      }
    }
  } else {
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
      m = collectMocksFromEntity(node, root).mock;
    } else {
      debug6(content);
      m = collectMocksFromEntity(content, root).mock;
    }
  }
  debug6('collectMocksFromEntity.result', m);
  return m;
}

async function setupMock() {
  let router = express.Router();
  let content = await readFile(path.join(process.cwd(), 'dist/index.json'));
  let root = JSON.parse(content);
  let specs = root.paths;
  let responses = {
    'get': {}
  };

  for (let path in specs) {
    let spec = specs[path];
    let keys = [];

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
      let methodResponses = responses[method] = responses[method] || {};

      methodResponses[path] = {
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
    let match = matchPath(responses[method], req)
    if (match) {
      debug(match);
      let params = match.spec.parameters;
      debug(params);
      debug_todo('validate parameters');
      debug_todo('check request.contenttype');
      let statusCodes = Object.keys(match.responses);
      let random = parseInt(Math.random() * statusCodes.length, 10);
      let statusCode = statusCodes[random];
      let response = match.responses[statusCode];
      //res.end(JSON.stringify(req.params));
      res.status(statusCode);
      let mock = collectMocksFromResponse(response, root);
      let data = '';
      if (mock) {
        data = Mock.mock(mock);
        debug_todo('check response.contenttype');
        res.json(data);
      } else {
        res.end(response.description);
      }
    } else {
      debug('no match and router.next');
      next();
    }
  });
  return router;
}
function matchPath(responses, req) {
  let url = req.path;
  if (!responses) {
    return;
  }
  if (responses[url]) {
    // fast match
    debug('fast-match', responses[url]);
    return responses[url];
  } else {
    for (let path in responses) {
      let response = responses[path];
      let r = response.regPath.exec(url);
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

async function run(app) {
  let projectJson = require('../package.json');
  let mockConfig = projectJson.mockConfig || {};
  let router = await setupMock();
  if (mockConfig.prefix) {
    app.use(mockConfig.prefix, router);
  } else {
    app.use(router);
  }
  var proxy = httpProxy.createProxyServer({}); // See (†)
  proxy.on('error', function(e) {
    debug('proxy.error', e);
  });
  proxy.on('proxyRes', function(proxyRes, req, res) {
    //debug('RAW Response from the target', JSON.stringify(req.headers, true, 2));
    debug('RAW Response from the target', JSON.stringify(proxyRes.headers, true, 2));
  });
  app.use(mockConfig.prefix, function(req, res, next) {
    debug('proxy', req.url, req.path);
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

let app = express();
let port = process.env.PORT || 3003;
run(app);
app.listen(port, function() {
  debug('listening', port);
});
