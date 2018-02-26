const express = require('express');
const fetch = require('fetch');
const CookieJar = fetch.CookieJar;

const debug_proxy = require('debug')('mock:proxy');
const proxy = httpProxy.createProxyServer({});

const proxyRouter  = express();

function cookieStringify(cookie) {
  let keys = ['path', 'domain', 'expires'];
  let str = keys.filter(key => cookie[key]).map(key => `${key}=${cookie[key]}`).concat([`${cookie.name}=${cookie.value}`]).concat(cookie.httponly ? ['HttpOnly'] : []).join(';');
  debug_cookie('stringify', cookie);
  debug_cookie('stringify', str);
  return str;
}

function modifyCookieDomain(cookiestrings, domain) {
  let jar = new CookieJar();
  cookiestrings.forEach(cookie => {
    debug_cookie('cookie', cookie);
    jar.setCookie(cookie);
  });
  let rcookies = [];
  for (let [name, cookies] of Object.entries(jar.cookies)) {
    cookies.forEach(cookie => {
      cookie.domain = '';
      rcookies.push(cookieStringify(cookie));
    });
  }
  debug_cookie('cookiejar', JSON.stringify(jar.cookies));
  return rcookies;
}

module.exports = {
  proxy,
  proxyRouter,
};
