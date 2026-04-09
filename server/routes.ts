import { router } from './router';

  router.get('/hello', (req, res) => {
      res.send('Hello world');
  });

  router.get('/users/:id', (req, res) => {
      res.json({ id: req.params.id });
  });

  router.post('/echo', (req, res) => {
      res.json(req.body);
  });