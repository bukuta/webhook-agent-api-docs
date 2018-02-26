const express = require('express');
const httpProxy = require('http-proxy');
const pathToRegexp = require('path-to-regexp')

const debug = require('debug')('mock');
const debug_cookie = require('debug')('mock:cookie');
const debug_todo = require('debug')('mock:todo');

function fixBindHost(server) {
  let origin;
  let _url = url.parse(server.url);
  origin = _url.host;

  _url.host = server['x-host'] || _url.host;

  return {
    target: url.format(_url),
    origin,
  };
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

async function setupMock(app) {
  let projectJson = require('../../package.json');
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

let responses={};

async function setupMockByDocs() {
  let content = await readFile(path.join(process.cwd(), 'dist/index.json'));
  let root = JSON.parse(content);
  rootspec = root;

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
  return router;
}

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
    if (mock.type == 'array') {
      mock['mock2|1-10'] = [mock.mock];
    }
    data = Mock.mock(mock);
    debug_todo('check response.contenttype');
    if (mock.type == 'array') {
      data = data.mock2;
    } else {
      data = data.mock;
    }
    debug(data);
    res.json(data);
  } else {
    res.end(response.description);
  }
}

function handleMock(req,res,next){
  debug('req.url', req.method, req.url);
  let method = req.method.toLowerCase();
  let match = matchPath(responses, req, method)


  if (match) {
    debug_proxy('matched', JSON.stringify(responseDecorations))
    let rd_proxy = responseDecorations[match.path];
    debug_proxy('rd_proxy', rd_proxy);

    if (rd_proxy) {
      if (rd_proxy.proxyEnable && rd_proxy.proxy) {
        debug_proxy('path', rd_proxy);
        let _server = rd_proxy.proxy;
        let server = proxies.filter(ser => ser.url = _server)[0];
        debug_proxy(_server);
        let {target, origin} = fixBindHost(server);

        if (origin) {
          return passProxy({ req, res, proxy, host: target, headers: { origin: origin, } })
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
    debug('match.2', match);

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
      debug('nocurrentServer');
      localResponse(match, req, res);
    }
  } else {
    debug('no match and router.next');
    next();
  }
}

let router = express.Router();
// 查看currentServer, 如果为本地，使用本地mock,如果本地mock无法匹配，next()
// 如果为特定http服务器，使用proxy
// 如果有
router.use(handleMock);

module.exports = {
  router,
};
