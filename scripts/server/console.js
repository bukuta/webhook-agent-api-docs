const path = require('path');

const express = require('express');


const storageService = require('./storage');
const apiRouter = require('./apiv1');

let router = express();
router.set('views', path.join(process.cwd(), 'scripts/server/views-/'));
router.engine('pug', require('pug').__express);

router.use('/', express.static(path.join(process.cwd(), 'scripts/server/views-/static'), {}));

router.get('/', async function(req, res, next) {
  let specs = await storageService.getSpecs()
  let responseDecorations = await storageService.getDecorations();
  let currentServer = await storageService.getCurrentServer();

  res.render('console.pug', {
    data: specs,
    decorations: responseDecorations,
    currentServer,
  });
});

router.use('/api/v1', apiRouter);

module.exports = {
  router,
};
