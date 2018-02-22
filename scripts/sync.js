const EasyMockClient = require('./EasyMockClient.js');
const debug = require('debug')('sync');
const fs = require('fs');
const path = require('path');
const util = require('util');
const readFile = util.promisify(fs.readFile);

async function sync() {
  let c = new EasyMockClient({
    host: 'http://10.95.55.5:7300',
    username:process.env.EMUSERNAME,
    password:process.env.EMPASSWORD
  });
  await c.login();

  let content = await readFile(path.join(process.cwd(),'dist/mock.responses.json'));
  let specs = JSON.parse(content);

  let project = await c.getGroupProject('snc','mock');
  debug(project);
  let apis = await c.getProjectApis(project['_id']);

  // 删除所有api
  await Promise.all(apis.map(api => {
    return c.deleteApi(api['_id']);
  }));

  for( let path in specs){
    let spec = specs[path];
    for( let method in spec){
      let code = Object.keys(spec[method]).filter(statusCode => {
        return +statusCode < 300 && +statusCode >= 200
      })[0];
      let {mock, description='need description'} = {...spec[method][code]};
      await c.createApi(project['_id'], {
        url: path,
        method,
        description,
        mode: mock,
      });
      debug(path, method, code, description);
    }
  }
}
sync();
