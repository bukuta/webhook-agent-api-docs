const debug = require('debug')('loadconfig');
const fs = require('fs');
const path = require('path');
const util = require('util');

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
      decorations: {},
      currentServer: null
    };
  }
}
async function saveConfig(config) {
  let content = JSON.stringify(config, 0, 2);
  await writeFile(_configfile, content);
}
async function updateConfig(part){
  let config = await loadConfig();
  Object.assign(config,part);
  await saveConfig(config);
}

async function loadSpecs(){
  let content = await readFile(path.join(process.cwd(), 'dist/index.json'));
  let root = JSON.parse(content);
  return root;
}

module.exports = {
  loadConfig,
  saveConfig,
  loadSpecs,
  getSpecs:loadSpecs,
  getDecorations:async function getDecorations(){
    let configs =  await loadConfig()
    return configs.decorations;
  },
  updateDecorations: async function updateDecorations(path,proxy,method,statuscode,checked){
    let decorations = await this.getDecorations();
    let response = decorations[path] = decorations[path] || {
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
    await updateConfig({decorations});
    return r;
  },
  updateGenerationsSkip: async function updateGenerationsSkip(items){
    let decorations = await this.getDecorations();
    function skipItem(item) {
      let {path, method, statuscode, checked} = item;
      let response = decorations[path] = decorations[path] || {
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
    let promises = items.map(item => {
      skipItem(item);
    })
    return Promise.all(promises);
  },
  getCurrentServer:async function getCurrentServer(){
    let configs =  await loadConfig()
    return configs.currentServer;
  },
  updateCurrentServer: async function updateCurrentServer(serverName){
    let specs = await getSpecs();
    let currentServer = specs.servers.filter(server => server.name == name)[0];
    if (currentServer.url[0] == '/') {
      currentServer = null;
    }
    await updateConfig({currentServer});
    return currentServer;
  },
  getGenerations:async function getGenerations(){
    let configs =  await loadConfig()
    return configs.generations;
  },
  createGeneration: async function createGeneration(item){
    let id = Date.now();
    item.id = id;
    item.createAt = item.updateAt = new Date();
    item.creator = 'admin';
    let generations = await this.getGenerations();
    generations.push(item);
    await updateConfig({generations});
    return item;
  },
  deleteGeneration:async function deleteGeneration(id){
    let generations = await this.getGenerations();
    let item = generations.find(item => item.id == id);
    generations = generations.filter(item => item.id != id);
    await updateConfig({generations});
    return item;
  },
};
