import { app } from './app';
import { config } from './config';

app.listen(config.port, () => {
  console.log(`FINALOG backend berjalan di http://localhost:${config.port}`);
});
