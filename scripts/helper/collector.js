const Mock = require('mockjs')
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


module.exports = {
  collectMocksFromEntity,
  collectMocksFromResponse,
};
