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
      responseDecorations: {},
      currentServer: null
    };
  }
}
async function saveConfig(config) {
  let content = JSON.stringify(config, 0, 2);
  await writeFile(_configfile, content);
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
};
