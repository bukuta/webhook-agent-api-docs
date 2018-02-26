const express = require('express');

const debug = require('debug')('apiv1');

const storageService = require('../storage');

let router = express();

router.use(express.json());
router.get('/specs', async function(req, res, next) {
  let specs = await storageService.getSpecs();
  let responseDecorations = await storageService.getDecorations();
  let currentServer = await storageService.getCurrentServer();

  res.json({
    apis: specs,
    decorations: responseDecorations,
    currentServer,
  });
});

router.get('/generations', async function(req, res, next) {
  let generations = await storageService.getGenerations();

  res.json({
    items: generations,
    total: generations.length
  });
});

router.post('/generations', async function(req, res, next) {
  let payload = req.body;
  debug('create', payload);
  let item = storageService.createGeneration(payload);
  res.status(201);
  res.json(item);
});

router.delete('/generations/:id', async function(req, res, next) {
  let id = req.params.id;
  debug('delete', id);
  let item = await storageService.deleteGeneration(id);
  res.status(204);
  res.end();
});

router.post('/skip', async function(req, res) {
  let items;

  if (Array.isArray(req.body)) {
    items = req.body;
  } else {
    items = [req.body];
  }

  let response = await storageService.updateDecorationsSkip(items);
  res.json({
    status: 'ok',
    data: response
  })
});

router.post('/proxy', async function(req, res) {
  let {path, proxy, method, statuscode, checked} = req.body;

  let response = await storageService.updateDecorations(path,proxy,method,statuscode,checked);

  res.json({
    status: 'ok',
    data: {
      [path]: response
    }
  })
});

router.post('/set-server', async function(req, res) {
  let {name} = req.body;
  let currentServer = await storageService.updateCurrentServer(name);
  debug('set-server', currentServer);
  res.json(currentServer);
});

module.exports = router;
