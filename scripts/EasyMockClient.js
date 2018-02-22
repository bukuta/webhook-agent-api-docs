const util = require('util');
const fetch = require('fetch');

const debug = require('debug')('easymock-client');
const debugClient = require('debug')('client');
const CookieJar = fetch.CookieJar;
fetchUrl = util.promisify(fetch.fetchUrl);
debug(fetchUrl);

debug(fetch);

class Client {
  constructor({host, username, password}) {
    debugClient(...arguments);
    this.host = host;
    this.user = username;
    this.password = password;
    this.token = '';
    this.jar = new CookieJar();
  }
  async _doFetchUrl(url, options) {
    if (options.data) {
      options.payload = JSON.stringify(options.data);
      delete options.data;
    }
    return new Promise((resolve, reject) => {
      fetch.fetchUrl(url, options, function(error, meta, body) {
        if (error) {
          return reject(error);
        }
        if (meta.status == 200) {
          return resolve(JSON.parse(body.toString()));
        } else {
          debugClient(meta);
        }
      });
    });
  }
  async _fetch(url, options = {}) {
    let defaultOptions = {
      method: 'GET',
      cookieJar: this.jar,
      headers: {
        'content-type': 'application/json',
        'Authorization': `Bearer ${this.token}`,
      }
    };
    let finalOptions = {
      ...defaultOptions,...options
    }
    let finalUrl = `${this.host}${url}`;
    debugClient('fetch', finalUrl, finalOptions);
    return await this._doFetchUrl(finalUrl, finalOptions);
  }
  _create(url, options = {}) {
    debugClient('create', ...arguments);
    let defaultOptions = {
      method: 'POST',
      cookieJar: this.jar,
      headers: {
        'content-type': 'application/json',
      }
    };
    if (this.token) {
      defaultOptions.headers.Authorization = `Bearer ${this.token}`;
    }
    let finalOptions = {
      ...defaultOptions,...options
    }
    let finalUrl = `${this.host}${url}`;
    debugClient('fetch', finalUrl, finalOptions);
    return this._doFetchUrl(finalUrl, finalOptions);
  }
  _delete(url, options = {}) {
    debugClient('delete', ...arguments);
    let defaultOptions = {
      method: 'DELETE',
      cookieJar: this.jar,
      headers: {
        'content-type': 'application/json',
      }
    };
    if (this.token) {
      defaultOptions.headers.Authorization = `Bearer ${this.token}`;
    }
    let finalOptions = {
      ...defaultOptions,...options
    }
    let finalUrl = `${this.host}${url}`;
    debugClient('fetch', finalUrl, finalOptions);
    return this._doFetchUrl(finalUrl, finalOptions);
  }
  _put(url, options = {}) {
    debugClient('put', ...arguments);
    let defaultOptions = {
      method: 'PUT',
      cookieJar: this.jar,
      headers: {
        'content-type': 'application/json',
      }
    };
    if (this.token) {
      defaultOptions.headers.Authorization = `Bearer ${this.token}`;
    }
    let finalOptions = {
      ...defaultOptions,...options
    }
    let finalUrl = `${this.host}${url}`;
    debugClient('fetch', finalUrl, finalOptions);
    return this._doFetchUrl(finalUrl, finalOptions);
  }
}

//class API{
  //async remove(){
  //}
  //async update(){
  //}
  //async emulate(){
  //}
//}
//class Project{
  //async getApis(){
  //}
  //async createApi(){
  //}
  //async delteApi(apiId){
  //}
  //async deleteApis(){
  //}
//}
//class Team{
  //async getProjects(){
  //}
  //async createProject(){
  //}
  //async addDevelop(){
  //}
  //async deleteDevelop(){
  //}
//}
//class Developer{
  //async login(){
  //}
  //async joinTeam(){
  //}
  //async leaveTeam(){
  //}
//}

class EasyMockClient extends Client {
  constructor() {
    super(...arguments);
    this.projects = [];
    this.projectsMap = {};
    this.apis = {};
  }
  async login() {
    debugClient('login');
    let r = await this._create('/api/u/login', {
      data: {
        name: this.user,
        password: this.password
      }
    });
    debugClient('login', r);
    this.token = r.data.token;
  }
  async getProjects() {
    debugClient('getProjects');
    let res = await this._fetch('/api/project?page_size=30&page_index=1', {});
    let projects = res.data;
    projects.forEach(project => {
      this.projectsMap[project['_id']] = project;
    });
    this.projects = projects;
    debugClient('getProjects', projects);
  }
  async getProject(projectName){
    await this.getProjects();
    let project = this.projects.filter(project => project.name ==projectName)[0];
    return project;
  }
  async getProjectApis(projectId) {
    debugClient('getApis', this.projects[projectId]);
    let url = `/api/mock?project_id=${projectId}&page_size=2000&page_index=1`;
    let res = await this._fetch(url);
    let apis = res.data.mocks;
    debugClient('getProjects', apis);
    this.apis[projectId] = apis;
    return apis;
  }
  async deleteApi(apiId) {
    debugClient('deleteApi');
    let url = `/api/mock/delete`;
    let res = await this._create(url, {
      data: {
        ids: [apiId]
      }
    });
    debugClient('deleteApi', res);
  }
  async createApi(projectId, {url, statusCode=200, method='get', description='example description', mode}) {
    debugClient('createApi');
    let data = {
      url,
      method,
      description,
      mode: JSON.stringify(mode),
      "project_id": projectId
    };
    let res = await this._create('/api/mock/create', {
      data
    });
    debugClient('createApi', res);
    //await this.getProjectApis(projectId);
  }
  async getGroupProject(groupName,projectName){
    debugClient('getGroupProject' );
    let url = `/api/group`;
    let res = await this._fetch(url);
    let groups = res.data;
    debugClient('getGroup', groups);
    let group = groups.filter(group=>group.name==groupName)[0];
    if(group){
      let url = `/api/project?page_size=30&page_index=1&keywords=&type=&group=${group['_id']}&filter_by_author=0`
      let res = await this._fetch(url);
      let projects = res.data;
      let project = projects.filter(project=>project.name==projectName)[0];
      if(project){
        return project;
      }
    }
  }
}

async function test() {
  let c = new EasyMockClient({
    host: 'http://10.95.55.5:7300',
    username: 'yuanbo',
    password: 'yuanbo'
  });
  debug(c);
  await c.login();
  //await c.getProjects();
  let testProject = await c.getProject('test');
  let apis = await c.getProjectApis(testProject['_id']);
  debug(apis);
  await Promise.all(apis.map(api=>{
    return c.deleteApi(api['_id']);
  }));
  await c.createApi(testProject['_id'], {
    url: '/api/test1/' + Date.now(),
    mode: {
      code: 0,
      message: "",
      data: {}
    }
  });
}
//test();

module.exports = EasyMockClient;
