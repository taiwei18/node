const app = require('./router/index')
const sql = require('mssql');


app.listen(3000, () => {
  console.log('Server is running on port 3000');
  console.log(' 🥳');
  console.log(' /|—|');
  console.log(' / \\');
});
const config = {
  server: 'localhost',
  database: 'tai',
  user: 'sa',
  password: '123456',
  options: {
    trustServerCertificate: true
  }
};
sql.connect(config, function (err) {
  if (err) console.log(err);
  app.locals.request = new sql.Request();
});
