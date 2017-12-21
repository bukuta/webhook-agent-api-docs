const EasyMockClient = require('./EasyMockClient.js');
const debug = require('debug')('sync');
const fs = require('fs');
const path = require('path');
const util = require('util');
const readFile = util.promisify(fs.readFile);

async function sync() {
  let projectJson = require('../package.json');
  let syncConfig = projectJson.syncConfig||{};
  debug(projectJson);
  if(!syncConfig.host){
    console.error('packge.json>syncConfig.host is need);
    return;
  }
  let c = new EasyMockClient({
    host: syncConfig.host,
    username: process.env.EMUSERNAME,
    password: process.env.EMPASSWORD
  });
  await c.login();

  let content = await readFile(path.join(process.cwd(), 'dist/mock.responses.json'));
  let specs = JSON.parse(content);

  let project;
  if(syncConfig.team){
    project = await c.getGroupProject(syncConfig.team, syncConfig.project);
  }else if(syncConfig.project){
    project = await c.getProject(syncConfig.project);
  }else{
    debug('no project');
    return;
  }
  //debug(project);
  let apis = await c.getProjectApis(project['_id']);

  let apismap={};
  apis.map(api=>{
    apismap[api.method+api.url]=api;
  });

  for (let path in specs) {
    let spec = specs[path];
    for (let method in spec) {
      let code = Object.keys(spec[method]).filter(statusCode => {
        return +statusCode < 300 && +statusCode >= 200
      })[0];
      let {mock, description='need description'} = {
        ...spec[method][code]
      };
      let oldapi = apismap[method+path];
      if(oldapi){
        if(oldapi.mode!=JSON.stringify(mock)||oldapi.description!=description){
          // update
          await c.updateApi(oldapi['_id'], {
            url: path,
            method,
            description,
            mode: mock,
          });
        }else{
          debug('skip');
        }
        delete apismap[method+path];
      }else{
        // create
        await c.createApi(project['_id'], {
          url: path,
          method,
          description,
          mode: mock,
        });
      }
      debug(path, method, code, description);
    }
  }
  // 删除多余api
  await Promise.all(Object.values(apismap).map(api => {
    return c.deleteApi(api['_id']);
  }));
}
sync();
