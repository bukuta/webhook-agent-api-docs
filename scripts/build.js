const debug = require('debug')('buildapi');
const debug2 = require('debug')('postFix');
const debug3 = require('debug')('error');
const debug4 = require('debug')('pureXs');
const debug5 = require('debug')('collectMocks');
const debug6 = require('debug')('collectResponseMocks');
const _ = require('lodash');
const yaml = require('js-yaml');
const util = require('util');
const fs = require('fs');
const path = require('path');

const parseYAML = yaml.safeLoad;
const stringifyYAML = yaml.safeDump;
const readdir = util.promisify(fs.readdir);
const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);

const projectRoot = process.cwd();

async function parseYamlFile(file) {
  let content = await readFile(file, 'utf-8');
  let obj = parseYAML(content);
  return obj;
}

async function getAllNodes(indir) {
  let files = await readdir(indir);
  let objects = await Promise.all(files.map(file => {
    let realpath = path.join(indir, file);
    debug(realpath);
    return realpath;
  }).filter(file => path.extname(file) == '.yaml').map(parseYamlFile));
  //debug('objects:', objects.length, objects);
  let all = objects.reduce((last, current) => {
    return {
      ...last,...current
    };
  }, {});
  //debug('all:', all);
  //console.log(contents);
  return all;
}

/**
 * 处理 '@#xxx'这样的复用形式，
 */
let omits = {};
async function postFix(main, root, parent, currentpath) {
  Object.keys(main).forEach(key => {
    let subtree = main[key];
    if (isTemplateRef(key)) {
      let params = {}
      Object.keys(subtree).forEach(key => {
        if (isTemplateParams(key)) {
          let name = key.substring(1);
          params[name] = subtree[key]
        }
      });
      Object.keys(params).length && debug2(params);
      let node = pickNode(root, key);
      omits[key.replace(/^@#\//, '')] = 1;
      try {
        let r = JSON.parse(_.template(JSON.stringify(node))(params));
        delete main[key];
        for (let k in r) {
          main[k] = r[k];
        }
      } catch (e) {
        debug3(currentpath, key);
      }
      delete main['@isTemplate'];
    } else if (key == '@isTemplate') {
      for (var k in parent) {
        if (parent[k] == main) {
          omits[currentpath] = 1;
        }
      }
    } else {
      if (subtree && typeof subtree == 'object') {
        postFix(subtree, root, main, currentpath ? currentpath + '/' + key : key);
      }
    }
  });
}
async function pureXs(main, root, parent, currentpath) {
  //debug4('pureXs',main);
  Object.keys(main).forEach(key => {
    let subtree = main[key];
    //debug4('check',key,currentpath);
    if (key == 'x-omit') {
      let ref = main['$ref'];
      let omitField = main[key];
      //debug4('omitField',ref,omitField);
      delete main['$ref'];
      delete main[key];
      let node = JSON.parse(JSON.stringify(pickNode(root, ref)));
      //debug4(ref,node);
      node.properties
      for (var k in node) {
        main[k] = node[k];
        if (k == 'properties') {
          main[k] = {};
          for (var kk in node[k]) {
            if (!omitField[kk]) {
              main[k][kk] = node[k][kk];
            }
          }
        }
      }
    } else {
      if (subtree && typeof subtree == 'object') {
        pureXs(subtree, root, main, currentpath ? currentpath + '/' + key : key);
      }
    }
  });
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
function isTemplateRef(key) {
  let r = /^@#.*/.test(key);
  return r;
}
function isTemplateParams(key) {
  let r = /^@.*/.test(key);
  return r;
}
function omitKeys(main) {
  Object.keys(omits).forEach(keypath => {
    let paths = keypath.replace(/^@#/, '').split('/').filter(k => k);
    debug2('omitKeys', keypath, paths);
    paths.reduce((last, path, index, all) => {
      if (index == paths.length - 1) {
        delete last[path];
      } else {
        return last && last[path];
      }
    }, main);
  });
}

function collectMocks(schemas, root) {
  //
  let r = {};
  for (let name in schemas) {
    debug6(name);
    let tmp = collectMocksFromEntity(schemas[name], root);
    if (tmp && Object.keys(tmp).length) {
      if (tmp.type == 'enum') {
        r[name + '|1'] = tmp.mock;
      } else if (tmp.type == 'array') {
        r[name + '|1-10'] = tmp.mock;
      } else {
        r[name] = tmp.mock;
      }
    }
  }
  return r;
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
function collectMocksFromResponse(response, statusCode, root) {
  let content = response && response.content && response.content['application/json'];
  let m;
  if (content) {
    content = content.schema;
    debug6('collectMocksFromResponse', content);
    if (content.hasOwnProperty('$ref')) {
      let node = pickNode(root, content['$ref']);
      debug6('collectMocksFromResponse', node);
      if (statusCode == 200) {
        m = collectMocksFromEntity(node, root).mock;
      } else {
        m = {
          _res: {
            status: statusCode,
            data: collectMocksFromEntity(node, root).mock,
          }
        };
      }
    } else {
      debug6(content);
      m = collectMocksFromEntity(content, root).mock;
    }
  }
  if (!m && response.description) {
    m = {
      _res: {
        status: statusCode,
        data: {
        }
      }
    };
  }
  debug6('collectMocksFromEntity.result', m);
  return m;
}

function collectResponseMocks(paths, root) {
  //
  let r = {};
  for (let name in paths) {
    let methods = paths[name];
    r[name] = {};
    Object.keys(methods).map(method => {
      let mock = r[name][method] = {};
      let responses = methods[method].responses;

      let code2xx = Object.keys(responses).filter(statusCode => +statusCode < 300 && +statusCode >= 200)[0];
      debug6(method, name, code2xx);

      Object.keys(responses).map(statusCode => {
        mock[statusCode] = {
          description: methods[method].description,
          mock: collectMocksFromResponse(responses[statusCode], +statusCode, root),
        };
      });
      debug6(mock[code2xx]);
    });
  }
  return r;
}

async function run() {
  try {
    let main = await parseYamlFile(path.join(projectRoot,'src/main.yaml'));
    let paths = await getAllNodes(path.join(projectRoot,'src/paths'));
    let schemas = await getAllNodes(path.join(projectRoot,'src/components/schemas'));
    let requestBodies = await getAllNodes(path.join(projectRoot,'src/components/requestBodies'));
    let responses = await getAllNodes(path.join(projectRoot,'src/components/responses'));
    let tags = await parseYamlFile(path.join(projectRoot,'src/tags.yaml'));

    main.tags = tags.tags;
    main.paths = paths;
    main.components = {
      schemas,
      requestBodies,
      responses,
    };
    postFix(main, main);
    omitKeys(main);
    await pureXs(main.paths, main);
    await writeFile(path.join(projectRoot,`dist/index.json`), JSON.stringify(main, 0, 2), 'utf-8');

    let content = stringifyYAML(main);
    await writeFile(path.join(projectRoot,`dist/index.yaml`), content, 'utf-8');

    let mocks = collectMocks(main.components.schemas, main)
    await writeFile(path.join(projectRoot,`dist/mock.schemas.json`), JSON.stringify(mocks, 0, 2), 'utf-8');

    let mockresponses = collectResponseMocks(main.paths, main);
    await writeFile(path.join(projectRoot,`dist/mock.responses.json`), JSON.stringify(mockresponses, 0, 2), 'utf-8');
  } catch (e) {
    console.log(e);
  }
}
process.on('exit', function(err) {
  console.log(err);
})
run();
