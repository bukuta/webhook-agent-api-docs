console.log('hello');

let tagsmap = {};
data.tags.forEach(item => {
  tagsmap[item.name] = item;
});

function collectMocksFromResponse(response, root) {
  let content = response && response.content && response.content['application/json'];
  let m;
  if (content) {
    content = content.schema;
    if (content.hasOwnProperty('$ref')) {
      let node = pickNode(root, content['$ref']);
      m = collectMocksFromEntity(node, root).mock;
    } else {
      m = collectMocksFromEntity(content, root).mock;
    }
  }
  return m;
}

function collectMocksFromEntity(schema, root) {
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
        let node = pickNode(root, value['$ref']);
        let m = collectMocksFromEntity(node, root);
        if (m.type == 'enum') {
          r[name + '|1'] = m.mock;
        } else {
          r[name] = m.mock;
        }
      } else if (value.type == 'object') {
        let m = collectMocksFromEntity(value, root);
        if (m.type == 'enum') {
          r[name + '|1'] = m;
        } else if (m.type == 'array') {
          r[name + '|1-10'] = m;
        }
      } else if (value.type == 'array') {
        let items = value.items;
        if (items.oneOf) {
          items = items.oneOf;
        } else if (items.allOf) {
          items = items.allOf;
        } else if (items.anyOf) {
          items = items.anyOf;
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

let app = new Vue({
  el: '#app',
  data: {
    specs: data,
    tagsmap: tagsmap,
    decorations,
    currentServer: currentServer || data.servers[0] || '',
  },
  methods: {
    tryRequest(path, method, detail) {
      console.warn('tryRequest', ...arguments);
      //let regPath = path.replace(/(\{([^}]+)\})/g, ':$2');
      //let keys = [];
      //regPath = pathToRegexp(regPath, keys);

      let params = detail.parameters || [];
      //console.warn(regPath,params);
      let pmockmap = {};
      let pmocks = params.map(param => {
        let schema = param.schema;
        if (schema.$ref) {
          let node = pickNode(data, schema.$ref);
          pmockmap[param.name] = node['x-mock'];
          return node['x-mock'];
        } else if (schema['x-mock']) {
          pmockmap[param.name] = schema['x-mock'];
          return schema['x-mock'];
        }
      });
      Object.keys(pmockmap).forEach((name) => {
        let mocktemplate = pmockmap[name];
        let data = Mock.mock(mocktemplate);
        pmockmap[name] = data;
      })
      console.warn(pmockmap);
      let npath = path.replace(/(\{([^}]+)\})/g, function(match, p1, p2, offset, ori) {
        return pmockmap[p2];
      });
      console.log(npath)

      let body = detail.requestBody;
      let bodyMock;
      if (body) {
        let m = collectMocksFromResponse(body, data);
        let mock = Mock.mock(m);
        bodyMock = JSON.stringify(mock);
        console.log(m, mock);
      }

      // 生成请求的host=>url, method,payload, query
      //let host = this.currentServer.url
      let host ='/api/v1'
      let url = host + npath;
      console.warn(url);
      var linkE = document.createElement('a');
      linkE.href = url;
      url = linkE.href;
      var parsedUrl = new URL(url);

      let queryObject = parsedUrl.searchParams;
      params.forEach(param => {
        if (param.in == 'query') {
          if (param.schema['x-mock']) {
            queryObject.append(param.name, pmockmap[param.name]);
          } else if (param.default) {
            queryObject.append(param.name, param.default);
          }
        }
      });
      console.warn('queryObject', queryObject.toString());


      fetch(parsedUrl.toString(), {
        method: method.toUpperCase(),
        credentials: 'include',
        body: bodyMock,
        headers: {
          'Accept': 'application/json,*',
          'Content-Type': body && Object.keys(body.content)[0],
        },
      }).then(res => res.json()).then(res => console.log(res));

    },
    skipIt( /*path,method,statuscode,$event*/ ) {
      let args = [].slice.call(arguments, 0);
      let $event = args.pop();
      let [path, method, statuscode] = args;
      let checked = $event.target.checked;

      console.warn(path, method, statuscode, checked);
      fetch('/:console/skip', {
        method: 'post',
        credentials: 'include',
        headers: {
          'Accept': 'application/json,*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          path,
          method,
          statuscode,
          checked
        })
      }).then(res => res.json()).then(res => console.log(res));
    },
    proxyIt( /*path,method,statuscode,$event*/ ) {
      let args = [].slice.call(arguments, 0);
      let $event = args.pop();
      let [path, method, statuscode] = args;
      let proxy = $event.target.value;
      let checked = !!proxy;

      console.warn(path, method, statuscode, checked);
      fetch('/:console/proxy', {
        method: 'post',
        credentials: 'include',
        headers: {
          'Accept': 'application/json,*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          path,
          method,
          statuscode,
          checked,
          proxy,
        })
      }).then(res => res.json()).then(res => console.log(res));
    },
    isSkip(path, method, statuscode) {
      console.log(...arguments);
      if (statuscode) {
        return decorations[path] &&
          decorations[path].methods &&
          decorations[path].methods[method] &&
          decorations[path].methods[method].responses &&
          decorations[path].methods[method].responses[statuscode] &&
          decorations[path].methods[method].responses[statuscode].skip;
      }
      if (method) {
        return decorations[path] &&
          decorations[path].methods &&
          decorations[path].methods[method] &&
          decorations[path].methods[method].skip;
      }
      if (path) {
        return decorations[path] &&
          decorations[path].skip;
      }
    },
    skipAllException() {
      let payload = [];
      for (let [path, route] of Object.entries(data.paths || {})) {
        for (let [method, methoddetail] of Object.entries(route || {})) {
          for (let [statuscode, response] of Object.entries(methoddetail.responses || {})) {
            let r = parseInt(statuscode / 100, 10);
            console.log(path, method, statuscode, r)
            payload.push({
              path,
              method,
              statuscode,
              checked: r != 2
            });
          }
        }
      }
      console.log(payload);
      fetch('/:console/skip', {
        method: 'post',
        credentials: 'include',
        headers: {
          'Accept': 'application/json,*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }).then(res => res.json()).then(res => console.log(res));
    },
    isSelected(path,method,url){
      let r ;
      if(method){
        r =  decorations[path] &&
          decorations[path].methods &&
          decorations[path].methods[method] &&
          decorations[path].methods[method].proxyEnable&&
          decorations[path].methods[method].proxy==url;
      }
      if(!r&&path){
        r = decorations[path] &&
          decorations[path].proxyEnable&&
          decorations[path].proxy==url;
      }
      console.warn('isSelected',path,method,url,r);
      return r;
    },
    resetAll() {
      let payload = [];
      for (let [path, route] of Object.entries(data.paths || {})) {
        for (let [method, methoddetail] of Object.entries(route || {})) {
          for (let [statuscode, response] of Object.entries(methoddetail.responses || {})) {
            let r = parseInt(statuscode / 100, 10);
            payload.push({
              path,
              method,
              statuscode,
              checked: false
            });
          }
        }
      }
      console.log(payload);
      fetch('/:console/skip', {
        method: 'post',
        credentials: 'include',
        headers: {
          'Accept': 'application/json,*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }).then(res => res.json()).then(res => console.log(res));
    },
    changeServer(event) {
      console.log(event.target.value);
      let servername = event.target.value;
      let currentServer = data.servers.filter(server => server.name == servername)[0];

      console.log(currentServer);
      fetch('/:console/set-server', {
        method: 'post',
        credentials: 'include',
        headers: {
          'Accept': 'application/json,*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(currentServer)
      }).then(res => res.json()).then(res => console.log(res));

    },
  },
});
console.log(app);
